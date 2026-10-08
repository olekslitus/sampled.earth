"use client"
/* oxlint-disable react/immutability -- uniforms are updated imperatively inside the r3f frame loop. */

import { useMemo } from "react"
import * as THREE from "three"
import { createPortal, useFrame } from "@react-three/fiber"

import { galacticToSky } from "@/lib/space/frames"
import { GLY, KLY, MLY, UNIVERSE_RADIUS } from "@/lib/space/units"
import { loadGalaxies, loadWeb, useLoaded, type Galaxy } from "./data"
import { fadeBetween, glowMaterial, pointScale, POINT_SIZE_GLSL, SOFT_DOT_GLSL, spaceTexture } from "./materials"
import { useSpaceLayer } from "./SpaceRenderer"
import { SUN_TO_GALACTIC_CENTRE_KLY, type SpaceView } from "./view"

const DEG = Math.PI / 180

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r())

interface SpiralOptions {
  seed: number
  /** kly */
  armRadius: number
  arms: number
  pitchDeg: number
  scale: number
  barAngleDeg: number
  stars: number
  /** a short spur at the Sun's place (the Orion Arm), Milky Way only */
  localArm?: boolean
}

/**
 * A barred spiral as points in its own frame (kly; x–y is the disc, z the axis). Arms are
 * logarithmic spirals trailing a clockwise rotation (seen from +z), as the Milky Way's do.
 */
function spiral(o: SpiralOptions) {
  const r = rng(o.seed)
  const glow: number[] = [] // x, y, z, size, r, g, b
  const dust: number[] = []
  const tanP = Math.tan(o.pitchDeg * DEG)
  const armAngle = (k: number, R: number) => Math.PI + (k * 2 * Math.PI) / o.arms + Math.log(R / o.armRadius) / tanP
  const push = (list: number[], x: number, y: number, z: number, size: number, c: [number, number, number], k = 1) =>
    list.push(x * o.scale, y * o.scale, z * o.scale, size * o.scale, c[0] * k, c[1] * k, c[2] * k)
  const young: [number, number, number] = [0.5, 0.64, 1.0]
  const old: [number, number, number] = [1.0, 0.88, 0.74]
  const core: [number, number, number] = [1.0, 0.8, 0.55]

  const armStars = Math.round(o.stars * 0.45)
  for (let i = 0; i < armStars; i++) {
    const k = i % o.arms
    const R = 9 + 44 * Math.pow(r(), 1.3)
    // arms are a few thousand light-years wide, widening outwards
    const phi = armAngle(k, R) + (gauss(r) * (1.6 + R * 0.05)) / R
    const z = gauss(r) * 0.35
    push(glow, R * Math.cos(phi), R * Math.sin(phi), z, 0.8, r() < 0.6 ? young : old, 0.09)
    // dust on the inside edge of the arm
    if (i % 3 === 0) {
      const Rd = R * 0.94
      const pd = armAngle(k, R) + (gauss(r) * 0.8) / R
      dust.push(Rd * Math.cos(pd) * o.scale, Rd * Math.sin(pd) * o.scale, gauss(r) * 0.15 * o.scale, 1.3 * o.scale, 0, 0, 0)
    }
    // star-forming regions, on every arm
    if (r() < 0.025) push(glow, R * Math.cos(phi), R * Math.sin(phi), z * 0.5, 0.9, [1.0, 0.4, 0.6], 0.35)
  }
  if (o.localArm) {
    for (let i = 0; i < o.stars * 0.04; i++) {
      const phi = Math.PI + (r() - 0.55) * 0.75
      const R = 27.4 * Math.exp((phi - Math.PI) * Math.tan(11 * DEG)) + gauss(r) * 1.2
      push(glow, R * Math.cos(phi), R * Math.sin(phi), gauss(r) * 0.3, 0.7, young, 0.06)
    }
  }
  // the old disc
  const discStars = Math.round(o.stars * 0.3)
  for (let i = 0; i < discStars; i++) {
    const R = Math.min(55, -8.5 * Math.log(1 - r() * 0.998))
    const phi = r() * Math.PI * 2
    push(glow, R * Math.cos(phi), R * Math.sin(phi), gauss(r) * 0.8, 1.6, old, 0.06)
  }
  // bar and bulge
  const bar = o.barAngleDeg * DEG
  for (let i = 0; i < o.stars * 0.25; i++) {
    const bulge = i % 2 === 0
    const a = gauss(r) * (bulge ? 3.5 : 7)
    const b = gauss(r) * (bulge ? 3.5 : 2.2)
    const z = gauss(r) * (bulge ? 2.8 : 1.2)
    push(glow, a * Math.cos(bar) - b * Math.sin(bar), a * Math.sin(bar) + b * Math.cos(bar), z, 0.6, core, 0.09)
  }
  return { glow: Float32Array.from(glow), dust: Float32Array.from(dust) }
}

function pointsGeometry(data: Float32Array, transform: (x: number, y: number, z: number, out: number[]) => void) {
  const n = data.length / 7
  const pos = new Float32Array(n * 3)
  const size = new Float32Array(n)
  const color = new Float32Array(n * 3)
  const p = [0, 0, 0]
  for (let i = 0; i < n; i++) {
    transform(data[i * 7]!, data[i * 7 + 1]!, data[i * 7 + 2]!, p)
    pos.set(p, i * 3)
    size[i] = data[i * 7 + 3]!
    color.set(data.subarray(i * 7 + 4, i * 7 + 7), i * 3)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3))
  g.setAttribute("size", new THREE.BufferAttribute(size, 1))
  g.setAttribute("color", new THREE.BufferAttribute(color, 3))
  return g
}

/** Points with a world-space size: glowing stars (additive) or darkening dust */
function cloudMaterial(dust: boolean) {
  const m = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 1 }, uMinPx: { value: 1.2 }, uMaxPx: { value: 48 }, uAlpha: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float size;
      attribute vec3 color;
      uniform float uAlpha;
      varying vec3 vColor;
      varying float vAlpha;
      ${POINT_SIZE_GLSL}
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float fade;
        gl_PointSize = pointSize(size, -mv.z, fade);
        vColor = color;
        vAlpha = fade * uAlpha;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: dust
      ? /* glsl */ `
        uniform float uAlpha;
        varying float vAlpha;
        ${SOFT_DOT_GLSL}
        void main() { gl_FragColor = vec4(0.0, 0.0, 0.0, softDot() * vAlpha * 0.2); }`
      : /* glsl */ `
        varying vec3 vColor;
        varying float vAlpha;
        ${SOFT_DOT_GLSL}
        void main() { gl_FragColor = vec4(vColor * softDot() * vAlpha, 1.0); }`,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: dust ? THREE.NormalBlending : THREE.AdditiveBlending,
  })
  return m
}

function setCloudUniforms(materials: THREE.ShaderMaterial[], view: SpaceView, alpha: number, dpr: number) {
  const s = pointScale(view.fov, view.height, dpr)
  for (const m of materials) {
    m.uniforms.uScale!.value = s
    m.uniforms.uAlpha!.value = alpha
  }
}

/** The Milky Way: an artist's model from its known arms and bar, placed so the Sun is where it is */
export function MilkyWay({ view }: { view: SpaceView }) {
  const layer = useSpaceLayer(view, { order: 20, unit: KLY, minNear: 1e-4, extent: 200 })
  const { glow, dust, glowMat, dustMat } = useMemo(() => {
    const data = spiral({ seed: 7, armRadius: 32.6, arms: 4, pitchDeg: 12, scale: 1, barAngleDeg: 153, stars: 110_000, localArm: true })
    // galactocentric → Sun-centred galactic → sky
    const toSky = (x: number, y: number, z: number, out: number[]) => galacticToSky(x + SUN_TO_GALACTIC_CENTRE_KLY, y, z - 0.065, out)
    return { glow: pointsGeometry(data.glow, toSky), dust: pointsGeometry(data.dust, toSky), glowMat: cloudMaterial(false), dustMat: cloudMaterial(true) }
  }, [])
  useFrame((state) => {
    const a = view.space * fadeBetween(view.dist, 2 * KLY, 12 * KLY, 60 * MLY, 400 * MLY)
    layer.alpha = a
    setCloudUniforms([glowMat, dustMat], view, a, state.viewport.dpr)
  })
  return createPortal(
    <>
      <points geometry={glow} material={glowMat} frustumCulled={false} />
      <points geometry={dust} material={dustMat} frustumCulled={false} renderOrder={1} />
    </>,
    layer.scene,
  )
}

/** Orientation of a disc galaxy on the sky: position angle of the major axis and inclination */
function discBasis(center: [number, number, number], paDeg: number, incDeg: number) {
  const n = new THREE.Vector3(...center).normalize()
  const east = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), n).normalize()
  const north = new THREE.Vector3().crossVectors(n, east)
  const pa = paDeg * DEG
  const major = north.clone().multiplyScalar(Math.cos(pa)).addScaledVector(east, Math.sin(pa))
  const minor = north.clone().multiplyScalar(-Math.sin(pa)).addScaledVector(east, Math.cos(pa))
  const normal = n.clone().multiplyScalar(Math.cos(incDeg * DEG)).addScaledVector(minor, Math.sin(incDeg * DEG))
  const second = new THREE.Vector3().crossVectors(normal, major)
  return (x: number, y: number, z: number, out: number[]) => {
    out[0] = center[0] + major.x * x + second.x * y + normal.x * z
    out[1] = center[1] + major.y * x + second.y * y + normal.y * z
    out[2] = center[2] + major.z * x + second.z * y + normal.z * z
  }
}

/** Andromeda and Triangulum get the same treatment as the Milky Way */
const DETAILED: Record<string, { pa: number; inc: number; spiral: Omit<SpiralOptions, "stars"> & { stars: number } }> = {
  MESSIER031: { pa: 38, inc: 77, spiral: { seed: 31, armRadius: 40, arms: 2, pitchDeg: 9, scale: 1.45, barAngleDeg: 0, stars: 40_000 } },
  MESSIER033: { pa: 23, inc: 54, spiral: { seed: 33, armRadius: 30, arms: 2, pitchDeg: 18, scale: 0.55, barAngleDeg: 0, stars: 12_000 } },
}

/** The ~870 galaxies within about 36 million light-years (Karachentsev+ 2013) */
export function NearbyGalaxies({ view }: { view: SpaceView }) {
  const layer = useSpaceLayer(view, { order: 15, unit: KLY, minNear: 1e-3, extent: 4e4 })
  const galaxies = useLoaded("galaxies", loadGalaxies)
  const { blobs, detailed, mats } = useMemo(() => {
    const mats = [cloudMaterial(false), cloudMaterial(false), cloudMaterial(true)]
    if (!galaxies) return { blobs: null, detailed: [], mats }
    const list = galaxies.filter((g) => !DETAILED[g.id])
    const data = new Float32Array(list.length * 7)
    list.forEach((g: Galaxy, i) => {
      const c: [number, number, number] = g.type < 0 ? [1.0, 0.82, 0.62] : g.type >= 10 ? [0.66, 0.78, 1.0] : [0.86, 0.9, 1.0]
      const k = Math.min(1, Math.max(0.12, (-g.absMag - 9) / 11))
      data.set([g.pos[0], g.pos[1], g.pos[2], g.size * 0.7, c[0] * k, c[1] * k, c[2] * k], i * 7)
    })
    const blobs = pointsGeometry(data, (x, y, z, out) => {
      out[0] = x
      out[1] = y
      out[2] = z
    })
    const detailed = galaxies
      .filter((g) => DETAILED[g.id])
      .map((g) => {
        const d = DETAILED[g.id]!
        const s = spiral(d.spiral)
        const t = discBasis(g.pos, d.pa, d.inc)
        return { id: g.id, glow: pointsGeometry(s.glow, t), dust: pointsGeometry(s.dust, t) }
      })
    return { blobs, detailed, mats }
  }, [galaxies])
  useFrame((state) => {
    const a = galaxies ? view.space * fadeBetween(view.dist, 120 * KLY, 600 * KLY, 2 * GLY, 8 * GLY) : 0
    layer.alpha = a
    setCloudUniforms(mats, view, a, state.viewport.dpr)
  })
  return createPortal(
    <>
      {blobs && <points geometry={blobs} material={mats[0]} frustumCulled={false} />}
      {detailed.map((d) => (
        <group key={d.id}>
          <points geometry={d.glow} material={mats[1]} frustumCulled={false} />
          <points geometry={d.dust} material={mats[2]} frustumCulled={false} renderOrder={1} />
        </group>
      ))}
    </>,
    layer.scene,
  )
}

/** 43,500 galaxies of the 2MASS Redshift Survey: the cosmic web out to ~1.4 billion light-years */
export function CosmicWeb({ view }: { view: SpaceView }) {
  const layer = useSpaceLayer(view, { order: 10, unit: MLY, minNear: 1e-3, extent: 2e3 })
  const web = useLoaded("web", loadWeb)
  const { geometry, material } = useMemo(() => {
    const geometry = new THREE.BufferGeometry()
    if (web) {
      geometry.setAttribute("position", new THREE.BufferAttribute(web.positions, 3))
      geometry.setAttribute("mag", new THREE.BufferAttribute(web.mags, 1))
    }
    const material = glowMaterial({
      uniforms: { uDpr: { value: 1 }, uAlpha: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute float mag;
        uniform float uDpr;
        uniform float uAlpha;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float b = clamp((11.8 - mag) / 4.0, 0.0, 1.0);
          gl_PointSize = (1.6 + 1.6 * b) * uDpr;
          // nearer galaxies warmer, farther ones bluer
          float far = clamp(length(position) / 1200.0, 0.0, 1.0);
          vColor = mix(vec3(1.0, 0.86, 0.7), vec3(0.62, 0.74, 1.0), far);
          vAlpha = uAlpha * (0.3 + 0.3 * b);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vAlpha;
        ${SOFT_DOT_GLSL}
        void main() { gl_FragColor = vec4(vColor * softDot() * vAlpha, 1.0); }`,
    })
    return { geometry, material }
  }, [web])
  useFrame((state) => {
    const a = web ? view.space * fadeBetween(view.dist, 6 * MLY, 40 * MLY) : 0
    layer.alpha = a
    material.uniforms.uAlpha!.value = a
    material.uniforms.uDpr!.value = state.viewport.dpr
  })
  return createPortal(<points geometry={geometry} material={material} frustumCulled={false} />, layer.scene)
}

/** The edge of the observable universe: the microwave background (WMAP 9-year) on a sphere */
export function MicrowaveSky({ view }: { view: SpaceView }) {
  const layer = useSpaceLayer(view, { order: 5, unit: GLY, minNear: 1e-3, extent: 50 })
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { map: { value: spaceTexture("/space/cmb.webp", { mipmaps: false }) }, uAlpha: { value: 0 } },
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
            float ra = atan(-d.z, d.x);
            float dec = asin(clamp(d.y, -1.0, 1.0));
            vec2 uv = vec2(fract(0.5 - ra / 6.2831853), 0.5 + dec / 3.1415927);
            gl_FragColor = vec4(texture2D(map, uv).rgb * 0.8, uAlpha);
            #include <colorspace_fragment>
          }`,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    [],
  )
  const radius = UNIVERSE_RADIUS / GLY
  useFrame(() => {
    const a = view.space * fadeBetween(view.dist, 3 * GLY, 25 * GLY)
    layer.alpha = a
    const outside = view.distanceFromEarth > UNIVERSE_RADIUS
    material.side = outside ? THREE.FrontSide : THREE.BackSide
    material.uniforms.uAlpha!.value = a * (outside ? 0.8 : 1)
  })
  return createPortal(
    <mesh material={material} frustumCulled={false}>
      <sphereGeometry args={[radius, 96, 48]} />
    </mesh>,
    layer.scene,
  )
}
