"use client"
/* oxlint-disable react/immutability -- meshes and uniforms are updated imperatively inside the r3f frame loop. */

import { useEffect, useMemo, useRef } from "react"
import * as THREE from "three"
import { createPortal, useFrame } from "@react-three/fiber"

import { BODIES, bodyRotation, moonPosition, orbitPath, type BodyKey } from "@/lib/space/solar"
import { TRACKED, type Track, type TrackKind } from "@/lib/space/tracks"
import { AU, KM, LY } from "@/lib/space/units"
import { dayImageUrl } from "@/components/globe/satellite"
import { PAGE_LOADED } from "./data"
import { fadeBetween, glowMaterial, spaceTexture } from "./materials"
import { useSpaceLayer } from "./SpaceRenderer"
import { logStep, type SpaceView } from "./view"

const DEG = Math.PI / 180
const OBLIQUITY = 23.4392911 * DEG

/** Ecliptic coordinates (AU) → sky frame */
function fromEcliptic(x: number, y: number, z: number, out: Float32Array, o: number) {
  const ye = y * Math.cos(OBLIQUITY) - z * Math.sin(OBLIQUITY)
  const ze = y * Math.sin(OBLIQUITY) + z * Math.cos(OBLIQUITY)
  out[o] = x
  out[o + 1] = ze
  out[o + 2] = -ye
}

/** Seeded random numbers, so the belts look the same on every visit */
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

/** A ring of bodies on roughly circular, slightly inclined orbits */
function belt(count: number, inner: number, outer: number, inclinationDeg: number, seed: number) {
  const r = rng(seed)
  const out = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const a = inner + (outer - inner) * Math.sqrt(r())
    const inc = (r() + r() + r() - 1.5) * inclinationDeg * DEG
    const node = r() * Math.PI * 2
    const u = r() * Math.PI * 2
    // position in the orbital plane, then tilted about the line of nodes
    const x = a * Math.cos(u)
    const y = a * Math.sin(u) * Math.cos(inc)
    const z = a * Math.sin(u) * Math.sin(inc)
    fromEcliptic(x * Math.cos(node) - y * Math.sin(node), x * Math.sin(node) + y * Math.cos(node), z, out, i * 3)
  }
  return out
}

/** The Oort cloud: a thick disc (the Hills cloud) inside a sphere, 2,000 to 100,000 AU */
function oortCloud(count: number, seed: number) {
  const r = rng(seed)
  const out = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const inner = i < count * 0.35
    const d = inner ? 2000 + 18000 * r() ** 1.5 : 20000 + 80000 * Math.cbrt(r())
    const u = r() * 2 - 1
    const lat = inner ? Math.asin(u) * 0.45 : Math.asin(u)
    const lon = r() * Math.PI * 2
    fromEcliptic(d * Math.cos(lat) * Math.cos(lon), d * Math.cos(lat) * Math.sin(lon), d * Math.sin(lat), out, i * 3)
  }
  return out
}

function dustMaterial(color: string, sizePx: number) {
  return glowMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uAlpha: { value: 0 }, uSize: { value: sizePx } },
    vertexShader: /* glsl */ `
      uniform float uSize;
      void main() {
        gl_PointSize = uSize;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uAlpha;
      void main() {
        float d = length(gl_PointCoord * 2.0 - 1.0);
        gl_FragColor = vec4(uColor * uAlpha * smoothstep(1.0, 0.2, d), 1.0);
      }`,
  })
}

export const TRACK_COLOR: Record<TrackKind, string> = { probe: "#ffb547", telescope: "#c49bff", interstellar: "#ff6b6b", asteroid: "#c8c2b8" }

function trailMaterial(color: string) {
  return glowMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uAlpha: { value: 0 }, uNow: { value: 0 }, uWindow: { value: 1e9 }, uHighlight: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float days;
      varying float vDays;
      void main() {
        vDays = days;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uAlpha;
      uniform float uNow;
      uniform float uWindow;
      uniform float uHighlight;
      varying float vDays;
      void main() {
        float age = uNow - vDays;
        // travelled: solid; ahead: faint; too long ago: gone
        float a = age >= 0.0 ? 0.4 * (1.0 - smoothstep(uWindow * 0.5, uWindow, age)) : 0.12;
        a *= 1.0 + uHighlight * 1.2;
        gl_FragColor = vec4(uColor * a * uAlpha, 1.0);
      }`,
  })
}

/**
 * Everything drawn as lines and dust around the Sun: planet orbits, the asteroid and Kuiper
 * belts, the heliopause, the Oort cloud and the paths of tracked spacecraft and visitors.
 */
export function SolarLines({ view, tracks, selected }: { view: SpaceView; tracks: Track[]; selected: string | null }) {
  const layer = useSpaceLayer(view, { order: 40, unit: AU, minNear: 1e-7, extent: 2e5 })
  const helio = useRef<THREE.Group>(null)

  const orbits = useMemo(() => {
    // orbits barely change over a lifetime; centre them on today
    const t = PAGE_LOADED
    return BODIES.filter((b) => b.period).map((b) => {
      const g = new THREE.BufferGeometry()
      g.setAttribute("position", new THREE.BufferAttribute(orbitPath(b.key, t, b.period! > 100 ? 720 : 360), 3))
      const m = new THREE.LineBasicMaterial({ color: b.color, transparent: true, opacity: 0, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending })
      return { key: b.key, line: new THREE.Line(g, m) }
    })
  }, [])

  const dust = useMemo(() => {
    const make = (positions: Float32Array, color: string, size: number) => {
      const g = new THREE.BufferGeometry()
      g.setAttribute("position", new THREE.BufferAttribute(positions, 3))
      return new THREE.Points(g, dustMaterial(color, size))
    }
    return {
      asteroids: make(belt(6000, 2.1, 3.3, 9, 1), "#b9ab94", 1.5),
      kuiper: make(belt(12000, 30, 50, 12, 2), "#a9bddc", 1.8),
      oort: make(oortCloud(24000, 3), "#7f9bd6", 1.4),
    }
  }, [])

  const heliopause = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uAlpha: { value: 0 } },
        vertexShader: /* glsl */ `
          varying vec3 vNormal;
          varying vec3 vView;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vNormal = normalize(normalMatrix * normal);
            vView = normalize(-mv.xyz);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform float uAlpha;
          varying vec3 vNormal;
          varying vec3 vView;
          void main() {
            float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 5.0);
            gl_FragColor = vec4(vec3(0.35, 0.55, 1.0) * rim * 0.35 * uAlpha, 1.0);
          }`,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  )

  const trails = useMemo(
    () =>
      tracks.flatMap((t) => {
        const info = TRACKED.find((o) => o.id === t.id)
        if (!info || info.trailDays === 0) return []
        // near Earth, the six-hourly samples draw the loops around L1 and L2 smoothly
        const samples = info.center === "earth" && t.near.p.length >= 6 ? t.near : t.path
        if (samples.p.length < 6) return []
        const n = samples.p.length / 3
        const g = new THREE.BufferGeometry()
        g.setAttribute("position", new THREE.BufferAttribute(Float32Array.from(samples.p), 3))
        const days = new Float32Array(n)
        for (let i = 0; i < n; i++) days[i] = (i * samples.dt) / 86_400_000
        g.setAttribute("days", new THREE.BufferAttribute(days, 1))
        const material = trailMaterial(TRACK_COLOR[info.kind])
        // most spacecraft loop for years; show their recent path (the long-haul ones keep it all)
        material.uniforms.uWindow!.value = Math.min(1e9, info.trailDays ?? (info.center === "earth" ? 180 : 730))
        return [{ id: t.id, center: info.center, t0: samples.t0, ends: t.ends, line: new THREE.Line(g, material) }]
      }),
    [tracks],
  )
  useEffect(() => () => trails.forEach((t) => t.line.geometry.dispose()), [trails])

  const moonOrbit = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(3 * 361), 3))
    return new THREE.Line(g, new THREE.LineBasicMaterial({ color: "#d0d0d0", transparent: true, opacity: 0, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }))
  }, [])
  const moonOrbitFor = useRef(NaN)

  useFrame(() => {
    const d = view.dist
    const space = view.space
    const out = 1 - logStep(d, 0.3 * LY, 3 * LY)
    const orbitAlpha = space * fadeBetween(d, 400, 4000) * out
    for (const o of orbits) (o.line.material as THREE.LineBasicMaterial).opacity = orbitAlpha * (o.key === "Earth" ? 0.55 : 0.35)
    ;(dust.asteroids.material as THREE.ShaderMaterial).uniforms.uAlpha!.value = space * fadeBetween(d, 0.3 * AU, 2 * AU, 300 * AU, 3000 * AU) * 0.5
    ;(dust.kuiper.material as THREE.ShaderMaterial).uniforms.uAlpha!.value = space * fadeBetween(d, 5 * AU, 40 * AU, 2000 * AU, 0.3 * LY) * 0.7
    ;(dust.oort.material as THREE.ShaderMaterial).uniforms.uAlpha!.value = space * fadeBetween(d, 500 * AU, 0.1 * LY, 3 * LY, 25 * LY) * 0.5
    heliopause.uniforms.uAlpha!.value = space * fadeBetween(d, 40 * AU, 250 * AU, 0.2 * LY, 2 * LY)
    for (const t of trails) {
      const u = (t.line.material as THREE.ShaderMaterial).uniforms
      const nearEarth = t.center === "earth"
      u.uAlpha!.value = space * (nearEarth ? fadeBetween(d, 30, 200, 0.5 * AU, 5 * AU) : fadeBetween(d, 2000, 20000, 0.2 * LY, 2 * LY))
      u.uNow!.value = (Math.min(view.time, t.ends ?? Infinity) - t.t0) / 86_400_000
      u.uHighlight!.value = t.id === selected ? 1 : 0
    }
    // the Moon's orbit, redrawn every few hours of simulated time
    if (!(Math.abs(view.time - moonOrbitFor.current) < 6 * 3_600_000)) {
      moonOrbitFor.current = view.time
      const pos = moonOrbit.geometry.attributes.position as THREE.BufferAttribute
      const m = view.bodies.Moon
      const r = Math.hypot(m[0]!, m[1]!, m[2]!) / AU
      // a circle through the Moon, in the plane of its motion (good enough at this scale)
      const a = new THREE.Vector3(m[0], m[1], m[2]).normalize()
      const later = moonPosition(view.time + 3_600_000)
      const b = new THREE.Vector3(later[0], later[1], later[2]).normalize()
      const nrm = new THREE.Vector3().crossVectors(a, b).normalize()
      const c = new THREE.Vector3().crossVectors(nrm, a)
      for (let i = 0; i <= 360; i++) {
        const t = (i / 360) * Math.PI * 2
        pos.setXYZ(i, (a.x * Math.cos(t) + c.x * Math.sin(t)) * r, (a.y * Math.cos(t) + c.y * Math.sin(t)) * r, (a.z * Math.cos(t) + c.z * Math.sin(t)) * r)
      }
      pos.needsUpdate = true
    }
    ;(moonOrbit.material as THREE.LineBasicMaterial).opacity = space * fadeBetween(d, 15, 60, 3000, 20000) * 0.35
    if (helio.current) {
      const s = view.bodies.Sun
      helio.current.position.set(s[0]! / AU, s[1]! / AU, s[2]! / AU)
    }
    layer.alpha = space * (1 - logStep(d, 3 * LY, 30 * LY))
  })

  return createPortal(
    <>
      <group ref={helio}>
        {orbits.map((o) => (
          <primitive key={o.key} object={o.line} frustumCulled={false} />
        ))}
        <primitive object={dust.asteroids} frustumCulled={false} />
        <primitive object={dust.kuiper} frustumCulled={false} />
        <primitive object={dust.oort} frustumCulled={false} />
        <mesh material={heliopause} frustumCulled={false}>
          <sphereGeometry args={[120, 64, 32]} />
        </mesh>
        {trails
          .filter((t) => t.center === "sun")
          .map((t) => (
            <primitive key={t.id} object={t.line} frustumCulled={false} />
          ))}
      </group>
      {trails
        .filter((t) => t.center === "earth")
        .map((t) => (
          <primitive key={t.id} object={t.line} frustumCulled={false} />
        ))}
      <primitive object={moonOrbit} frustumCulled={false} />
    </>,
    layer.scene,
  )
}

/** A soft radial glow texture */
function glowTexture() {
  const c = document.createElement("canvas")
  c.width = c.height = 128
  const g = c.getContext("2d")!
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, "rgba(255,244,214,1)")
  grad.addColorStop(0.15, "rgba(255,214,140,0.55)")
  grad.addColorStop(0.45, "rgba(255,170,80,0.12)")
  grad.addColorStop(1, "rgba(255,150,60,0)")
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** Saturn's rings in Saturn radii (C ring to the edge of the A ring) */
const RING_INNER = 74_500 / 58_232
const RING_OUTER = 136_800 / 58_232

function ringGeometry() {
  const g = new THREE.RingGeometry(RING_INNER, RING_OUTER, 160, 1)
  const pos = g.attributes.position as THREE.BufferAttribute
  const uv = g.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getY(i))
    uv.setXY(i, (r - RING_INNER) / (RING_OUTER - RING_INNER), 0.5)
  }
  // into the planet's equatorial plane (body y is the pole)
  g.rotateX(-Math.PI / 2)
  return g
}

/**
 * The Sun and planets as lit spheres at their true sizes and positions, placed relative to
 * the camera (in AU) so they stay precise even when you fly right up to them.
 */
export function SolarBodies({ view }: { view: SpaceView }) {
  const layer = useSpaceLayer(view, {
    order: 50,
    unit: AU,
    relative: true,
    clip: (dist) => [Math.max(1e-10, (dist / AU) * 0.02), Math.max(60, (dist / AU) * 1e3)],
  })
  const light = useRef<THREE.PointLight>(null)
  const glow = useRef<THREE.Sprite>(null)
  const meshes = useRef(new Map<BodyKey, THREE.Mesh>())
  const glowMap = useMemo(() => glowTexture(), [])
  const month = new Date(view.time).getUTCMonth()
  const scratch = useMemo(() => ({ m: new THREE.Matrix4(), lastSpin: new Map<BodyKey, number>() }), [])

  useFrame(() => {
    const cam = view.cam
    const pxWorld = (2 * Math.tan((view.fov * Math.PI) / 360)) / view.height // world size of a pixel at distance 1
    for (const b of BODIES) {
      const mesh = meshes.current.get(b.key)
      if (!mesh) continue
      // Earth and the Moon are the globe scene's, unless it is not drawn (looking from elsewhere)
      const globeOwns = (b.key === "Earth" || b.key === "Moon") && view.globeDrawn
      const p = view.bodies[b.key]
      const x = (p[0]! - cam[0]!) / AU
      const y = (p[1]! - cam[1]!) / AU
      const z = (p[2]! - cam[2]!) / AU
      mesh.position.set(x, y, z)
      const r = b.radiusKm * KM / AU
      const dist = Math.hypot(x, y, z)
      const px = r / (dist * pxWorld)
      mesh.visible = px > 0.4 && !globeOwns
      if (b.key === "Earth") mesh.quaternion.setFromRotationMatrix(view.earthToSky)
      else if (mesh.visible && px > 2) {
        // turning is only visible on screen once the body is more than a dot
        const last = scratch.lastSpin.get(b.key)
        if (last === undefined || Math.abs(view.time - last) > 60_000) {
          scratch.lastSpin.set(b.key, view.time)
          bodyRotation(b.key, view.time, scratch.m)
          mesh.quaternion.setFromRotationMatrix(scratch.m)
        }
      }
      if (b.key === "Sun") {
        light.current?.position.set(x, y, z)
        const g = glow.current
        if (g) {
          // a glow of at least 60 px, so the Sun reads as a star from far away
          const s = Math.max(r * 10, 60 * dist * pxWorld)
          g.position.set(x, y, z)
          g.scale.set(s, s, 1)
          ;(g.material as THREE.SpriteMaterial).opacity = 1 - logStep(view.distanceFromEarth, 0.05 * LY, 0.5 * LY)
        }
      }
    }
    layer.alpha = view.space * (1 - logStep(view.dist, 0.3 * LY, 3 * LY))
  })

  return createPortal(
    <>
      <ambientLight intensity={0.05} />
      <pointLight ref={light} intensity={3.4} decay={0} />
      {BODIES.map((b) => (
        <mesh
          key={b.key}
          ref={(m) => {
            if (m) meshes.current.set(b.key, m)
            else meshes.current.delete(b.key)
          }}
          scale={(b.radiusKm * KM) / AU}
          frustumCulled={false}
        >
          <sphereGeometry args={[1, 64, 32]} />
          {b.key === "Sun" ? (
            <meshBasicMaterial map={spaceTexture("/space/planets/sun.webp")} color={[1.25, 1.15, 1.05]} toneMapped={false} />
          ) : b.key === "Earth" ? (
            <meshLambertMaterial map={spaceTexture(dayImageUrl(month, true))} />
          ) : b.texture ? (
            <meshLambertMaterial map={spaceTexture(`/space/planets/${b.texture}.webp`)} />
          ) : (
            <meshLambertMaterial color={b.color} />
          )}
          {b.key === "Saturn" && (
            <mesh geometry={ringGeometry()}>
              <meshLambertMaterial map={spaceTexture("/space/planets/saturn_ring.webp")} transparent side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
          )}
        </mesh>
      ))}
      <sprite ref={glow} frustumCulled={false}>
        <spriteMaterial map={glowMap} blending={THREE.AdditiveBlending} depthWrite={false} depthTest={false} transparent toneMapped={false} />
      </sprite>
    </>,
    layer.scene,
  )
}
