"use client"
/* oxlint-disable react/immutability -- uniforms and event buffers are updated imperatively in the frame loop */

import { useEffect, useMemo, useRef, type RefObject } from "react"
import * as THREE from "three"
import { useFrame, useThree } from "@react-three/fiber"

import type { Theme } from "@/lib/sim/attributes"
import { birthRate, deathRate } from "@/lib/sim/countries"
import type { Simulation } from "@/lib/sim/engine"
import { FACING_GLSL, hexToRgb } from "./util"

const YEAR_S = 365.25 * 86_400
const POOL = 512
const LIFE = 1.8
/** Never draw more pulses than this per second; beyond it each pulse stands for several events */
const MAX_PULSES_PER_S = 45

export interface VitalStats {
  births: number
  deaths: number
  /** real events per pulse */
  birthsPerPulse: number
  deathsPerPulse: number
  /** real events per real second at the current speed, for what is on screen */
  birthsPerSecond: number
  deathsPerSecond: number
}

export function emptyVitalStats(): VitalStats {
  return { births: 0, deaths: 0, birthsPerPulse: 1, deathsPerPulse: 1, birthsPerSecond: 0, deathsPerSecond: 0 }
}

/** Relative chance of dying in a year by age (rough life-table shape) */
function mortality(age: number) {
  if (age < 1) return 6
  if (age < 5) return 0.8
  if (age < 40) return 0.25 + age * 0.01
  return Math.exp((age - 40) / 11)
}

const vertex = /* glsl */ `
  attribute float aStart;
  attribute float aKind;
  uniform float uTime;
  uniform float uSize;
  varying float vAge;
  varying float vKind;
  varying float vAlpha;
  ${FACING_GLSL}
  void main() {
    vAge = (uTime - aStart) / ${LIFE.toFixed(1)};
    vKind = aKind;
    float facing = facingOf(position);
    vAlpha = smoothstep(0.0, 0.06, facing);
    if (vAge < 0.0 || vAge > 1.0 || facing <= 0.0) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      return;
    }
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uSize;
  }
`
const fragment = /* glsl */ `
  uniform vec3 uBirth;
  uniform vec3 uDeath;
  varying float vAge;
  varying float vKind;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    // births bloom outwards, deaths fold inwards
    float r = vKind < 0.5 ? vAge : 1.0 - vAge;
    float ring = 1.0 - smoothstep(0.0, 0.12, abs(d - r * 0.9));
    float core = (1.0 - smoothstep(0.0, 0.25, d)) * (1.0 - vAge);
    float a = max(ring * (1.0 - vAge * 0.7), core) * vAlpha;
    gl_FragColor = vec4(vKind < 0.5 ? uBirth : uDeath, a);
  }
`

export function VitalLayer({
  sim, speedRef, theme, statsRef,
}: {
  sim: Simulation
  speedRef: RefObject<number>
  theme: Theme
  statsRef: RefObject<VitalStats>
}) {
  const dpr = useThree((s) => s.viewport.dpr)
  const { geometry, positions, starts, kinds } = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const positions = new Float32Array(POOL * 3)
    const starts = new Float32Array(POOL).fill(-100)
    const kinds = new Float32Array(POOL)
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage))
    g.setAttribute("aStart", new THREE.BufferAttribute(starts, 1).setUsage(THREE.DynamicDrawUsage))
    g.setAttribute("aKind", new THREE.BufferAttribute(kinds, 1).setUsage(THREE.DynamicDrawUsage))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.01)
    return { geometry: g, positions, starts, kinds }
  }, [])
  useEffect(() => () => geometry.dispose(), [geometry])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uSize: { value: 26 },
          uBirth: { value: new THREE.Vector3() },
          uDeath: { value: new THREE.Vector3() },
        },
        vertexShader: vertex,
        fragmentShader: fragment,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])
  useEffect(() => {
    // births: aqua-green slot; deaths: muted neutral
    material.uniforms.uBirth.value.set(...hexToRgb(theme === "dark" ? "#3fe0a6" : "#0f9a68"))
    material.uniforms.uDeath.value.set(...hexToRgb(theme === "dark" ? "#b7b4d6" : "#5d5a75"))
  }, [material, theme])

  // candidate slots and cumulative weights, allocated once at capacity and filled in place
  const buffers = useMemo(
    () => ({ slots: new Int32Array(sim.capacity), birthCum: new Float64Array(sim.capacity), deathCum: new Float64Array(sim.capacity) }),
    [sim],
  )
  const state = useRef({
    clock: 0,
    next: 0,
    refresh: 1,
    birthCarry: 0,
    deathCarry: 0,
    /** how many entries of the buffers are valid */
    count: 0,
    birthRate: 0,
    deathRate: 0,
  })

  useFrame((_, delta) => {
    const st = state.current
    const stats = statsRef.current
    const dt = Math.min(delta, 0.1)
    st.clock += dt
    material.uniforms.uTime.value = st.clock
    material.uniforms.uSize.value = 26 * dpr

    // where events can happen: everyone shown on screen, weighted by local rates ----------
    st.refresh += dt
    const { slots, birthCum, deathCum } = buffers
    if (st.refresh > 0.5) {
      st.refresh = 0
      let n = 0
      let births = 0
      let deaths = 0
      let bCum = 0
      let dCum = 0
      const end = sim.slotEnd
      for (let i = 0; i < end; i++) {
        const p = sim.people[i]
        if (!p || sim.suppressed[i] || !sim.inView[i]) continue
        const people = p.represents * 1e6
        const b = (people * birthRate(p.country)) / 1000 / YEAR_S
        const d = (people * deathRate(p.country)) / 1000 / YEAR_S
        births += b
        deaths += d
        slots[n] = i
        // births appear where mothers live, deaths where the old and very young are
        birthCum[n] = bCum += p.gender === "Female" && p.age >= 15 && p.age <= 45 ? b : 0
        deathCum[n] = dCum += d * mortality(p.age)
        n++
      }
      st.count = n
      st.birthRate = births
      st.deathRate = deaths
    }

    const speed = speedRef.current ?? 1
    const realBirths = st.birthRate * speed * dt
    const realDeaths = st.deathRate * speed * dt
    stats.births += realBirths
    stats.deaths += realDeaths
    stats.birthsPerSecond = st.birthRate * speed
    stats.deathsPerSecond = st.deathRate * speed
    stats.birthsPerPulse = Math.max(1, stats.birthsPerSecond / MAX_PULSES_PER_S)
    stats.deathsPerPulse = Math.max(1, stats.deathsPerSecond / MAX_PULSES_PER_S)

    st.birthCarry += realBirths / stats.birthsPerPulse
    st.deathCarry += realDeaths / stats.deathsPerPulse
    let dirty = false
    const emit = (kind: 0 | 1, cum: Float64Array) => {
      const n = st.count
      const total = n ? cum[n - 1] : 0
      if (!total) return
      const slot = slots[searchCum(cum, n, Math.random() * total)]
      const k = st.next
      st.next = (st.next + 1) % POOL
      positions[k * 3] = sim.xyz[slot * 3] * 1.0005
      positions[k * 3 + 1] = sim.xyz[slot * 3 + 1] * 1.0005
      positions[k * 3 + 2] = sim.xyz[slot * 3 + 2] * 1.0005
      starts[k] = st.clock + Math.random() * dt
      kinds[k] = kind
      dirty = true
    }
    for (; st.birthCarry >= 1; st.birthCarry--) emit(0, birthCum)
    for (; st.deathCarry >= 1; st.deathCarry--) emit(1, deathCum)
    if (dirty) {
      geometry.getAttribute("position").needsUpdate = true
      geometry.getAttribute("aStart").needsUpdate = true
      geometry.getAttribute("aKind").needsUpdate = true
    }
  })

  return <points geometry={geometry} material={material} renderOrder={4} frustumCulled={false} />
}

/** First index in cum[0, n) reaching `x` */
function searchCum(cum: Float64Array, n: number, x: number) {
  let lo = 0
  let hi = n - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (cum[mid] < x) lo = mid + 1
    else hi = mid
  }
  return lo
}
