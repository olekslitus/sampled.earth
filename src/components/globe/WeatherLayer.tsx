"use client"
/* oxlint-disable react/immutability --
 * three.js materials and uniforms are mutated imperatively inside the r3f frame loop. */

import { useEffect, useMemo } from "react"
import * as THREE from "three"
import { useFrame } from "@react-three/fiber"

import type { Theme } from "@/lib/sim/attributes"
import { subsolarPoint, type Simulation } from "@/lib/sim/engine"
import type { LatLon } from "@/lib/sim/population"
import { latLonToXYZ } from "@/lib/sim/sphere"
import type { WeatherIndex } from "@/lib/weather/live"
import { loadImageTexture, releaseImageTexture, type MapStyle } from "./satellite"

const vertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    vUv = uv;
    vNormal = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const fragment = /* glsl */ `
  uniform sampler2D clouds;
  uniform sampler2D precip;
  uniform float showClouds;
  uniform float showPrecip;
  uniform vec3 cloudColor;
  uniform float cloudOpacity;
  uniform vec3 sunDir;
  uniform float night;
  uniform float time;
  varying vec2 vUv;
  varying vec3 vNormal;
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  void main() {
    float d = dot(normalize(vNormal), normalize(sunDir));
    // sunlit cloud tops, faintly visible through the night
    float light = mix(1.0, mix(0.14, 1.0, smoothstep(-0.12, 0.2, d)), night);
    vec4 c = texture2D(clouds, vUv);
    float cloud = c.r * c.a * showClouds * cloudOpacity;
    vec3 color = cloudColor * light;
    float alpha = cloud;

    // rain and snow shimmer as they drift, so they read as falling rather than painted on
    vec3 p = texture2D(precip, vUv).rgb * showPrecip;
    float shimmer = 0.7 + 0.3 * noise(vUv * vec2(1800.0, 900.0) + vec2(time * 0.7, -time * 2.3));
    // drizzle stays faint; downpours and heavy snow stand out
    float rain = p.r > 0.002 ? (0.16 + 0.7 * p.r) * shimmer : 0.0;
    float snow = p.g > 0.002 ? (0.3 + 0.6 * p.g) * shimmer : 0.0;
    vec3 rainColor = vec3(0.28, 0.6, 1.0) * (0.55 + 0.45 * light);
    vec3 snowColor = vec3(0.93, 0.95, 1.0) * (0.6 + 0.4 * light);
    color = mix(color, rainColor, rain);
    alpha = max(alpha, rain);
    color = mix(color, snowColor, snow);
    alpha = max(alpha, snow);
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(color, alpha);
  }
`

/** cloud colour and strength over each kind of surface */
function cloudLook(mapStyle: MapStyle, theme: Theme): [string, number] {
  if (mapStyle === "satellite") return ["#ffffff", 0.95]
  return theme === "dark" ? ["#e8eef8", 0.75] : ["#6c7a92", 0.5]
}

/**
 * Live clouds (geostationary satellites) and rain and snow (NASA IMERG) on a shell just
 * above the surface, beneath the people. Fades as you zoom in so the ground shows through.
 */
export function WeatherLayer({
  sim, index, showClouds, showPrecip, showNight, mapStyle, theme, faint = false,
}: {
  sim: Simulation
  index: WeatherIndex
  showClouds: boolean
  showPrecip: boolean
  showNight: boolean
  mapStyle: MapStyle
  theme: Theme
  /** thin the clouds right down, so the statistics map underneath can be read */
  faint?: boolean
}) {
  const { material, empty } = useMemo(() => {
    const empty = new THREE.DataTexture(new Uint8Array(4), 1, 1)
    empty.needsUpdate = true
    const material = new THREE.ShaderMaterial({
      uniforms: {
        clouds: { value: empty },
        precip: { value: empty },
        showClouds: { value: 0 },
        showPrecip: { value: 0 },
        cloudColor: { value: new THREE.Color() },
        cloudOpacity: { value: 1 },
        sunDir: { value: new THREE.Vector3(1, 0, 0) },
        night: { value: 1 },
        time: { value: 0 },
      },
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      depthWrite: false,
    })
    return { material, empty }
  }, [])
  useEffect(
    () => () => {
      material.dispose()
      empty.dispose()
    },
    [material, empty],
  )

  // swap in each new image once it has loaded, then let the old one go
  const shown = useMemo(() => ({ clouds: "", precip: "" }), [])
  useEffect(() => {
    let live = true
    const show = (key: "clouds" | "precip", url: string | undefined) => {
      if (!url) {
        if (shown[key]) releaseImageTexture(shown[key])
        shown[key] = ""
        material.uniforms[key].value = empty
        return
      }
      if (url === shown[key]) return
      loadImageTexture(url).then(
        (tex) => {
          if (!live) return
          if (shown[key]) releaseImageTexture(shown[key])
          shown[key] = url
          material.uniforms[key].value = tex
        },
        () => {},
      )
    }
    show("clouds", index.clouds.url)
    show("precip", index.precip?.url)
    return () => {
      live = false
    }
  }, [index, material, empty, shown])
  useEffect(
    () => () => {
      for (const url of [shown.clouds, shown.precip]) if (url) releaseImageTexture(url)
      shown.clouds = shown.precip = ""
    },
    [shown],
  )

  useEffect(() => {
    const [color, strength] = cloudLook(mapStyle, theme)
    ;(material.uniforms.cloudColor.value as THREE.Color).set(color)
    material.userData.strength = strength
  }, [material, mapStyle, theme])

  const sun = useMemo(() => ({ ll: [0, 0] as LatLon, v: [0, 0, 0] }), [])
  useFrame((state) => {
    const u = material.uniforms
    subsolarPoint(sim.time, sun.ll)
    latLonToXYZ(sun.ll[0], sun.ll[1], 1, sun.v)
    ;(u.sunDir.value as THREE.Vector3).set(sun.v[0], sun.v[1], sun.v[2])
    u.night.value += ((showNight ? 1 : 0) - u.night.value) * 0.1
    u.showClouds.value += ((showClouds ? (faint ? 0.25 : 1) : 0) - u.showClouds.value) * 0.12
    u.showPrecip.value += ((showPrecip ? 1 : 0) - u.showPrecip.value) * 0.12
    u.time.value = state.clock.elapsedTime
    // thinner as you zoom in, so the ground shows through
    const alt = state.camera.position.length() - 1
    const zoomFade = 0.3 + 0.7 * THREE.MathUtils.smoothstep(alt, 0.004, 0.35)
    u.cloudOpacity.value = ((material.userData.strength as number | undefined) ?? 1) * zoomFade
  })

  return (
    <mesh material={material} renderOrder={0.5}>
      <sphereGeometry args={[1.004, 160, 96]} />
    </mesh>
  )
}
