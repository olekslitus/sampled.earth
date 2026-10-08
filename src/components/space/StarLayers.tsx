"use client"
/* oxlint-disable react/immutability -- uniforms are updated imperatively inside the r3f frame loop. */

import { useMemo } from "react"
import * as THREE from "three"
import { createPortal, useFrame } from "@react-three/fiber"

import { skyDirection } from "@/lib/space/frames"
import type { ExoSystem } from "@/lib/space/tracks"
import { KLY, LY } from "@/lib/space/units"
import { loadStars, PAGE_LOADED, useLoaded } from "./data"
import { fadeBetween, glowMaterial, SOFT_DOT_GLSL, spaceTexture } from "./materials"
import { useSpaceLayer } from "./SpaceRenderer"
import { logStep, type SpaceView } from "./view"

/**
 * The Milky Way's glow as seen from here (NASA SVS Deep Star Maps 2020, stars removed),
 * on a sphere at infinity. It fades as you travel far enough for the view to change.
 */
export function SkyGlow({ view }: { view: SpaceView }) {
  const layer = useSpaceLayer(view, { order: 1, unit: 1, relative: true, clip: () => [0.1, 10] })
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { map: { value: spaceTexture("/space/milkyway.webp", { mipmaps: false }) }, uAlpha: { value: 0 } },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform sampler2D map;
          uniform float uAlpha;
          varying vec3 vDir;
          void main() {
            vec3 d = normalize(vDir);
            // sky frame → right ascension / declination; the map has RA 0h in the middle, growing leftwards
            float ra = atan(-d.z, d.x);
            float dec = asin(clamp(d.y, -1.0, 1.0));
            vec2 uv = vec2(fract(0.5 - ra / 6.2831853), 0.5 + dec / 3.1415927);
            // drop the faint, grainy floor of unresolved stars; keep the band and its dust lanes
            vec3 c = max(texture2D(map, uv).rgb - 0.035, 0.0) * 1.05;
            gl_FragColor = vec4(c * uAlpha, 1.0);
            #include <colorspace_fragment>
          }`,
        side: THREE.BackSide,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        transparent: true,
      }),
    [],
  )
  useFrame(() => {
    const a = view.space * (1 - logStep(view.dist, 300 * LY, 5 * KLY)) * 0.75
    layer.alpha = a
    material.uniforms.uAlpha!.value = a
  })
  return createPortal(
    <mesh material={material} frustumCulled={false}>
      <sphereGeometry args={[1, 64, 32]} />
    </mesh>,
    layer.scene,
  )
}

const STAR_VERTEX = /* glsl */ `
  attribute float absmag;
  attribute float ci;
  uniform float uDpr;
  uniform float uAlpha;
  uniform float uBubble;
  uniform float uSunAlpha;
  varying vec3 vColor;
  varying float vAlpha;

  vec3 starColour(float bv) {
    vec3 blue = vec3(0.62, 0.73, 1.0);
    vec3 white = vec3(1.0, 0.98, 0.95);
    vec3 yellow = vec3(1.0, 0.88, 0.68);
    vec3 orange = vec3(1.0, 0.72, 0.48);
    vec3 red = vec3(1.0, 0.58, 0.42);
    if (bv < 0.3) return mix(blue, white, smoothstep(-0.35, 0.3, bv));
    if (bv < 0.9) return mix(white, yellow, smoothstep(0.3, 0.9, bv));
    if (bv < 1.5) return mix(yellow, orange, smoothstep(0.9, 1.5, bv));
    return mix(orange, red, smoothstep(1.5, 2.2, bv));
  }

  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float ly = max(length(mv.xyz), 1e-7);
    // apparent magnitude from where the camera is
    float m = absmag + 5.0 * log(ly / 3.26156) / log(10.0) - 5.0;
    float bright = clamp((7.0 - m) / 7.0, 0.0, 1.6);
    float a = clamp((7.6 - m) / 2.6, 0.0, 1.0);
    a = max(a, uBubble);
    if (gl_VertexID == 0) a *= uSunAlpha;
    gl_PointSize = (1.3 + 3.4 * bright) * uDpr;
    vAlpha = a * uAlpha;
    vColor = starColour(ci);
    gl_Position = projectionMatrix * mv;
  }`

/** Every naked-eye star and every catalogued star within 200 light-years (HYG v4.1), plus the Sun */
export function StarField({ view }: { view: SpaceView }) {
  const layer = useSpaceLayer(view, { order: 30, unit: LY, minNear: 1e-3, extent: 4e5 })
  const stars = useLoaded("stars", loadStars)
  const { geometry, material } = useMemo(() => {
    const geometry = new THREE.BufferGeometry()
    if (stars) {
      const n = stars.count + 1
      const pos = new Float32Array(n * 3)
      const abs = new Float32Array(n)
      const ci = new Float32Array(n)
      // the Sun first (it is drawn as a star once you are far enough away)
      abs[0] = 4.83
      ci[0] = 0.65
      for (let i = 0; i < stars.count; i++) {
        pos.set(stars.data.subarray(i * 5, i * 5 + 3), (i + 1) * 3)
        abs[i + 1] = stars.data[i * 5 + 3]!
        ci[i + 1] = stars.data[i * 5 + 4]!
      }
      geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3))
      geometry.setAttribute("absmag", new THREE.BufferAttribute(abs, 1))
      geometry.setAttribute("ci", new THREE.BufferAttribute(ci, 1))
    }
    const material = glowMaterial({
      uniforms: { uDpr: { value: 1 }, uAlpha: { value: 0 }, uBubble: { value: 0 }, uSunAlpha: { value: 0 } },
      vertexShader: STAR_VERTEX,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vAlpha;
        ${SOFT_DOT_GLSL}
        void main() {
          gl_FragColor = vec4(vColor * softDot() * vAlpha, 1.0);
        }`,
    })
    return { geometry, material }
  }, [stars])

  useFrame((state) => {
    const a = view.space * (1 - logStep(view.dist, 15 * KLY, 100 * KLY))
    layer.alpha = stars ? a : 0
    const u = material.uniforms
    u.uAlpha!.value = a
    u.uDpr!.value = state.viewport.dpr
    // far out, the catalogued stars show as the bubble they are
    u.uBubble!.value = fadeBetween(view.dist, 300 * LY, 3000 * LY) * 0.3
    u.uSunAlpha!.value = logStep(view.distanceFromEarth, 0.02 * LY, 0.2 * LY)
  })

  return createPortal(<points geometry={geometry} material={material} frustumCulled={false} />, layer.scene)
}

/** Exoplanets published within this many days count as new */
export const NEW_EXOPLANET_DAYS = 365

/** How long ago a "2026-07" publication month was, in days */
export function publishedDaysAgo(published: string, now: number) {
  const [y, m] = published.split("-").map(Number)
  return (now - Date.UTC(y!, (m ?? 7) - 1, 15)) / 86_400_000
}

/** Every star with confirmed planets: teal rings, new discoveries in amber */
export function ExoplanetSystems({ view, systems }: { view: SpaceView; systems: ExoSystem[] }) {
  const layer = useSpaceLayer(view, { order: 32, unit: LY, minNear: 1e-2, extent: 3e4 })
  const { geometry, material } = useMemo(() => {
    const now = PAGE_LOADED
    const pos = new Float32Array(systems.length * 3)
    const fresh = new Float32Array(systems.length)
    const d = [0, 0, 0]
    systems.forEach((s, i) => {
      skyDirection(s.ra, s.dec, d)
      pos.set([d[0]! * s.dist, d[1]! * s.dist, d[2]! * s.dist], i * 3)
      const newest = Math.min(...s.planets.map((p) => publishedDaysAgo(p.published, now)))
      fresh[i] = newest < NEW_EXOPLANET_DAYS ? 1 : 0
    })
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3))
    geometry.setAttribute("fresh", new THREE.BufferAttribute(fresh, 1))
    const material = glowMaterial({
      uniforms: { uDpr: { value: 1 }, uAlpha: { value: 0 }, uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute float fresh;
        uniform float uDpr;
        uniform float uAlpha;
        uniform float uTime;
        varying float vFresh;
        varying float vAlpha;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float pulse = fresh * (0.5 + 0.5 * sin(uTime * 2.5 + position.x));
          gl_PointSize = (5.0 + fresh * (2.0 + 2.0 * pulse)) * uDpr;
          vFresh = fresh;
          vAlpha = uAlpha * (0.55 + 0.45 * fresh);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying float vFresh;
        varying float vAlpha;
        void main() {
          float r = length(gl_PointCoord * 2.0 - 1.0);
          float ring = smoothstep(1.0, 0.8, r) * smoothstep(0.35, 0.6, r) + smoothstep(0.35, 0.0, r) * 0.9;
          if (ring < 0.01) discard;
          vec3 c = mix(vec3(0.31, 0.82, 0.77), vec3(1.0, 0.71, 0.28), vFresh);
          gl_FragColor = vec4(c * ring * vAlpha, 1.0);
        }`,
    })
    return { geometry, material }
  }, [systems])

  useFrame((state) => {
    const a = view.space * fadeBetween(view.dist, 0.15 * LY, 1.5 * LY, 10 * KLY, 60 * KLY)
    layer.alpha = a
    material.uniforms.uAlpha!.value = a
    material.uniforms.uDpr!.value = state.viewport.dpr
    material.uniforms.uTime!.value = state.clock.elapsedTime
  })
  return createPortal(<points geometry={geometry} material={material} frustumCulled={false} />, layer.scene)
}
