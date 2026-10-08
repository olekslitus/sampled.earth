"use client"
/* oxlint-disable react/immutability --
 * three.js materials and uniforms are mutated imperatively inside the r3f frame loop. */

import { useEffect, useMemo, useState } from "react"
import * as THREE from "three"
import { useFrame } from "@react-three/fiber"

import type { Theme } from "@/lib/sim/attributes"
import { subsolarPoint, type Simulation } from "@/lib/sim/engine"
import type { LatLon } from "@/lib/sim/population"
import { latLonToXYZ } from "@/lib/sim/sphere"
import { loadBorderLines, prefetchBorderLines, type BorderDetail } from "./borders"
import { disposeEarthTexture, loadEarthTexture, placeholderEarthTexture, readyEarthTexture } from "./earth-texture"
import { dayImageUrl, loadImageTexture, nightImageUrl, releaseImageTexture, SATELLITE_SHADING, type MapStyle } from "./satellite"
import { SatelliteTiles } from "./SatelliteTiles"

const earthVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    vUv = uv;
    vNormal = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const earthFragment = /* glsl */ `
  uniform sampler2D map;
  uniform vec3 sunDir;
  uniform float night;
  uniform float nightLevel;
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    vec3 c = texture2D(map, vUv).rgb;
    float d = dot(normalize(vNormal), normalize(sunDir));
    float day = smoothstep(-0.12, 0.22, d);
    float twilight = smoothstep(-0.22, 0.0, d) * (1.0 - smoothstep(0.0, 0.22, d));
    vec3 lit = c * mix(nightLevel, 1.0 + (1.0 - nightLevel) * 0.18, day) + vec3(0.10, 0.05, 0.0) * twilight;
    gl_FragColor = vec4(mix(c, lit, night), 1.0);
  }
`

export function Earth({ sim, showNight, theme }: { sim: Simulation; showNight: boolean; theme: Theme }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          map: { value: null as THREE.Texture | null },
          sunDir: { value: new THREE.Vector3(1, 0, 0) },
          night: { value: 1 },
          nightLevel: { value: 0.34 },
        },
        vertexShader: earthVertex,
        fragmentShader: earthFragment,
      }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])

  // a quick low-res map first, the full 4096×2048 one from the worker when painted; only
  // the active theme's texture is kept
  useEffect(() => {
    material.uniforms.nightLevel.value = theme === "dark" ? 0.34 : 0.62
    let placeholder: THREE.Texture | null = null
    const hit = readyEarthTexture(theme)
    if (hit) material.uniforms.map.value = hit
    else material.uniforms.map.value = placeholder = placeholderEarthTexture(theme)
    let cancelled = false
    loadEarthTexture(theme).then((tex) => {
      if (cancelled) return
      material.uniforms.map.value = tex
      placeholder?.dispose()
      placeholder = null
      disposeEarthTexture(theme === "dark" ? "light" : "dark")
    })
    return () => {
      cancelled = true
      placeholder?.dispose()
      // free the GPU copy; it is re-uploaded from the cached bitmap if this theme returns
      readyEarthTexture(theme)?.dispose()
    }
  }, [material, theme])

  const sun = useMemo(() => ({ ll: [0, 0] as LatLon, v: [0, 0, 0] }), [])
  useFrame(() => {
    subsolarPoint(sim.time, sun.ll)
    latLonToXYZ(sun.ll[0], sun.ll[1], 1, sun.v)
    ;(material.uniforms.sunDir.value as THREE.Vector3).set(sun.v[0], sun.v[1], sun.v[2])
    const target = showNight ? 1 : 0
    material.uniforms.night.value += (target - material.uniforms.night.value) * 0.1
  })
  return (
    <mesh material={material}>
      <sphereGeometry args={[1, 192, 128]} />
    </mesh>
  )
}

const satelliteFragment = /* glsl */ `
  uniform sampler2D dayA;
  uniform sampler2D dayB;
  uniform float dayMix;
  varying vec2 vUv;
  varying vec3 vNormal;
  ${SATELLITE_SHADING}
  void main() {
    vec3 day = mix(texture2D(dayA, vUv).rgb, texture2D(dayB, vUv).rgb, dayMix);
    gl_FragColor = vec4(satelliteShade(day, texture2D(lights, vUv).rgb, vNormal), 1.0);
  }
`

/** One-pixel stand-ins (deep ocean, night sky) until the imagery arrives */
function solidTexture(hex: string) {
  const [r, g, b] = hexBytes(hex)
  const tex = new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1)
  tex.needsUpdate = true
  return tex
}
function hexBytes(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/**
 * The satellite globe: NASA Blue Marble for the month of the simulated date (fading into
 * the next as the months turn) and Black Marble city lights on the night side.
 */
export function SatelliteEarth({
  sim, showNight, sentinel, onSentinelShown,
}: {
  sim: Simulation
  showNight: boolean
  /** Sentinel-2 close-ups below 0.6 km a pixel */
  sentinel: boolean
  onSentinelShown: (shown: boolean) => void
}) {
  const { material, fallback } = useMemo(() => {
    const fallback = [solidTexture("#0d2350"), solidTexture("#05060f")]
    const material = new THREE.ShaderMaterial({
      uniforms: {
        dayA: { value: fallback[0] },
        dayB: { value: fallback[0] },
        dayMix: { value: 1 },
        lights: { value: fallback[1] },
        sunDir: { value: new THREE.Vector3(1, 0, 0) },
        night: { value: 1 },
      },
      vertexShader: earthVertex,
      fragmentShader: satelliteFragment,
    })
    return { material, fallback }
  }, [])

  /** image urls in use (dayA, dayB, lights), released when replaced or on unmount */
  const shown = useMemo(() => ({ month: -1, dayA: "", dayB: "", lights: "", sharp: false, checked: 0 }), [])
  useEffect(() => {
    const u = material.uniforms
    let live = true
    const setLights = (url: string) =>
      loadImageTexture(url).then((tex) => {
        if (!live) return
        // the sharp image may beat the quick one
        if (shown.lights === nightImageUrl()) return releaseImageTexture(url)
        if (shown.lights) releaseImageTexture(shown.lights)
        shown.lights = url
        u.lights.value = tex
      })
    setLights(nightImageUrl(true)).then(() => setLights(nightImageUrl()))
    return () => {
      live = false
      for (const url of new Set([shown.dayA, shown.dayB, shown.lights])) if (url) releaseImageTexture(url)
      Object.assign(shown, { month: -1, dayA: "", dayB: "", lights: "", sharp: false })
      material.dispose()
      for (const t of fallback) t.dispose()
    }
  }, [material, fallback, shown])

  /** shows `url` as the day image: at once the first time, otherwise by fading from the current one */
  const showDay = useMemo(
    () => (url: string, tex: THREE.Texture, fade: boolean) => {
      const u = material.uniforms
      const drop = [shown.dayA, shown.dayB].filter((x) => x && x !== url && (fade ? x !== shown.dayB : true))
      if (fade) {
        u.dayA.value = u.dayB.value
        shown.dayA = shown.dayB
        u.dayMix.value = 0
      } else {
        u.dayA.value = tex
        shown.dayA = url
        u.dayMix.value = 1
      }
      u.dayB.value = tex
      shown.dayB = url
      for (const x of drop) if (x !== shown.dayA && x !== shown.dayB) releaseImageTexture(x)
    },
    [material, shown],
  )

  const sun = useMemo(() => ({ ll: [0, 0] as LatLon, v: [0, 0, 0] }), [])
  useFrame((state, delta) => {
    const u = material.uniforms
    subsolarPoint(sim.time, sun.ll)
    latLonToXYZ(sun.ll[0], sun.ll[1], 1, sun.v)
    ;(u.sunDir.value as THREE.Vector3).set(sun.v[0], sun.v[1], sun.v[2])
    u.night.value += ((showNight ? 1 : 0) - u.night.value) * 0.1
    if (u.dayMix.value < 1) {
      u.dayMix.value = Math.min(1, u.dayMix.value + delta * 1.5)
      if (u.dayMix.value === 1 && shown.dayA !== shown.dayB) {
        releaseImageTexture(shown.dayA)
        u.dayA.value = u.dayB.value
        shown.dayA = shown.dayB
      }
    }
    // the month of the simulated date, checked a couple of times a second
    if (state.clock.elapsedTime - shown.checked < 0.5) return
    shown.checked = state.clock.elapsedTime
    const month = new Date(sim.time).getUTCMonth()
    if (month === shown.month) return
    const first = shown.month < 0
    shown.month = month
    const want = (url: string) =>
      loadImageTexture(url).then((tex) => {
        if (shown.month !== month) {
          if (url !== shown.dayA && url !== shown.dayB) releaseImageTexture(url)
          return false
        }
        return tex
      })
    if (first) {
      // a quick 1k image, then the sharp one in place of it
      want(dayImageUrl(month, true)).then((tex) => {
        if (tex && !shown.sharp) showDay(dayImageUrl(month, true), tex, false)
        return want(dayImageUrl(month)).then((sharp) => {
          if (!sharp) return
          shown.sharp = true
          showDay(dayImageUrl(month), sharp, false)
        })
      })
    } else {
      want(dayImageUrl(month)).then((tex) => tex && showDay(dayImageUrl(month), tex, true))
    }
  })

  return (
    <>
      <mesh material={material}>
        <sphereGeometry args={[1, 192, 128]} />
      </mesh>
      <SatelliteTiles sim={sim} shading={material.uniforms as Record<"sunDir" | "night" | "lights", THREE.IUniform>} sentinel={sentinel} onSentinelShown={onSentinelShown} />
    </>
  )
}

export function Atmosphere({ theme }: { theme: Theme }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { opacity: { value: 1 }, color: { value: new THREE.Vector3(0.32, 0.58, 1.0) } },
        vertexShader: /* glsl */ `
          varying vec3 vNormal;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float opacity;
          uniform vec3 color;
          varying vec3 vNormal;
          void main() {
            float d = -dot(vNormal, vec3(0.0, 0.0, 1.0));
            float i = pow(smoothstep(0.0, 0.5, d), 2.2) * opacity;
            gl_FragColor = vec4(color * i, i);
          }
        `,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])
  useEffect(() => {
    const c = material.uniforms.color.value as THREE.Vector3
    if (theme === "dark") c.set(0.32, 0.58, 1.0)
    else c.set(0.25, 0.45, 0.85)
  }, [material, theme])
  useFrame((state) => {
    const alt = state.camera.position.length() - 1
    material.uniforms.opacity.value = Math.min(1, Math.max(0, (alt - 0.12) / 0.4)) * (theme === "dark" ? 1 : 0.55)
  })
  return (
    <mesh material={material}>
      <sphereGeometry args={[1.13, 64, 48]} />
    </mesh>
  )
}

export const lineVertex = /* glsl */ `
  varying float vFacing;
  void main() {
    vec3 toCam = normalize(cameraPosition - position);
    vFacing = dot(normalize(position), toCam);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
export const lineFragment = /* glsl */ `
  uniform vec3 color;
  uniform float opacity;
  varying float vFacing;
  void main() {
    if (vFacing < 0.0) discard;
    gl_FragColor = vec4(color, opacity * smoothstep(0.0, 0.08, vFacing));
  }
`

/** Zoom in past this altitude for 1:10m borders, back out past the second for 1:50m */
const DETAIL_IN_ALT = 0.12
const DETAIL_OUT_ALT = 0.3

/** Crisp vector coastlines and borders, swapped to 1:10m detail when zoomed in. */
export function Borders({ theme, mapStyle }: { theme: Theme; mapStyle: MapStyle }) {
  const [detail, setDetail] = useState<BorderDetail>("50m")
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null)
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { color: { value: new THREE.Color("#9db8e8") }, opacity: { value: 0 } },
        vertexShader: lineVertex,
        fragmentShader: lineFragment,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])

  /** built geometries by detail, kept so zooming back and forth does not rebuild them */
  const built = useMemo(() => new Map<BorderDetail, THREE.BufferGeometry>(), [])
  useEffect(
    () => () => {
      for (const g of built.values()) g.dispose()
      built.clear()
    },
    [built],
  )

  useEffect(() => {
    ;(material.uniforms.color.value as THREE.Color).set(mapStyle === "satellite" ? "#ffffff" : theme === "dark" ? "#9db8e8" : "#4f6386")
  }, [material, theme, mapStyle])

  // the 1:10m lines are parsed and meshed in the worker while the app is idle
  useEffect(() => prefetchBorderLines("10m"), [])

  useEffect(() => {
    let cancelled = false
    loadBorderLines(detail).then((positions) => {
      if (cancelled) return
      let g = built.get(detail)
      if (!g) {
        g = new THREE.BufferGeometry()
        g.setAttribute("position", new THREE.BufferAttribute(positions, 3))
        g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.01)
        built.set(detail, g)
      }
      setGeometry(g)
    })
    return () => {
      cancelled = true
    }
  }, [detail, built])

  useFrame((state) => {
    const alt = state.camera.position.length() - 1
    // fainter over imagery, where coastlines are already visible
    const max = mapStyle === "satellite" ? 0.4 : 0.85
    material.uniforms.opacity.value = Math.min(max, Math.max(0, (0.9 - alt) * 1.1))
    if (alt < DETAIL_IN_ALT && detail === "50m") setDetail("10m")
    else if (alt > DETAIL_OUT_ALT && detail === "10m") setDetail("50m")
  })

  if (!geometry) return null
  return <lineSegments geometry={geometry} material={material} renderOrder={1} frustumCulled={false} />
}
