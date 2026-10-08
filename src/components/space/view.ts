/**
 * Shared state for the zoom out into space, written each frame by the camera rig and the
 * renderer and read by the space layers and the labels.
 *
 * The camera orbits a **pivot** at a distance `dist` (both in Earth radii, sky frame — see
 * src/lib/space/frames.ts). Close in, the pivot is Earth; zooming out it slides to the
 * Sun, then the centre of the Milky Way, then the middle of the Local Group, so whatever
 * scale is on screen stays centred. Picking something to look at makes it the pivot.
 */
import * as THREE from "three"

import { galacticToSky } from "@/lib/space/frames"
import { BODIES, helioPosition, moonPosition, type BodyKey } from "@/lib/space/solar"
import { AU, GLY, KLY, LY, MLY } from "@/lib/space/units"

export interface Level {
  key: string
  name: string
  /** camera distance from the pivot, Earth radii */
  dist: number
  /** where to look from (unit vector from the pivot, sky frame), if it matters */
  from?: number[]
}

const OBLIQUITY = (23.4392911 * Math.PI) / 180
/** Above the planets' orbits, 55° up, so they read as circles */
const ABOVE_ECLIPTIC = [-0.57, 0.82 * Math.cos(OBLIQUITY), 0.82 * Math.sin(OBLIQUITY)]
/** Above the Milky Way's disc, on the Sun's side */
const ABOVE_GALAXY = (() => {
  const up = galacticToSky(0, 0, 1)
  const centre = galacticToSky(1, 0, 0)
  const v = up.map((u, i) => u * 0.8 - centre[i]! * 0.6)
  const n = Math.hypot(v[0]!, v[1]!, v[2]!)
  return v.map((x) => x / n)
})()

/** Stops on the way out, from the globe to the edge of what we can see */
export const LEVELS: Level[] = [
  { key: "earth", name: "Earth", dist: 3.2 },
  { key: "moon", name: "Earth & Moon", dist: 260, from: ABOVE_ECLIPTIC },
  { key: "inner", name: "Inner planets", dist: 4.5 * AU, from: ABOVE_ECLIPTIC },
  { key: "planets", name: "Solar System", dist: 75 * AU, from: ABOVE_ECLIPTIC },
  { key: "voyagers", name: "Voyagers", dist: 500 * AU, from: ABOVE_ECLIPTIC },
  { key: "oort", name: "Oort cloud", dist: 3.5 * LY, from: ABOVE_ECLIPTIC },
  { key: "stars", name: "Nearest stars", dist: 35 * LY },
  { key: "neighbourhood", name: "Our neighbourhood", dist: 2500 * LY },
  { key: "galaxy", name: "Milky Way", dist: 180 * KLY, from: ABOVE_GALAXY },
  { key: "local", name: "Local Group", dist: 5 * MLY },
  { key: "web", name: "Cosmic web", dist: 1.8 * GLY },
  { key: "universe", name: "Observable universe", dist: 140 * GLY },
]

/** The level whose distance is closest to `dist` (on a log scale) */
export function levelAt(dist: number) {
  let best = LEVELS[0]!
  for (const l of LEVELS) if (Math.abs(Math.log(l.dist / dist)) < Math.abs(Math.log(best.dist / dist))) best = l
  return best
}

/** Something to fly to and keep centred */
export interface Focus {
  key: string
  /** position at a time (Earth radii, sky frame); false when unknown then */
  position: (ms: number, out: number[]) => boolean
  /** a good viewing distance */
  dist: number
}

interface Flight {
  /** turn the camera to look from here (sky frame) on the way */
  look?: number[]
  from: number[]
  to: Focus | null
  fromDist: number
  toDist: number
  /** seconds */
  t: number
  duration: number
}

/** Galactic centre, Sun at 8.18 kpc (GRAVITY 2019), 20 pc above the plane */
export const SUN_TO_GALACTIC_CENTRE_KLY = 26.67
const GALACTIC_CENTRE = galacticToSky(SUN_TO_GALACTIC_CENTRE_KLY, 0, -0.065).map((v) => v * KLY)
/** Andromeda (Karachentsev+ 2013 position), for the Local Group's middle */
const ANDROMEDA = [1854.9 * KLY, 1656.5 * KLY, -350 * KLY]
const LOCAL_GROUP_MIDDLE = GALACTIC_CENTRE.map((v, i) => v + (ANDROMEDA[i]! - v) * 0.5)

/** 0 below `a`, 1 above `b`, smooth on a log scale in between */
export function logStep(x: number, a: number, b: number) {
  const t = Math.min(1, Math.max(0, Math.log(x / a) / Math.log(b / a)))
  return t * t * (3 - 2 * t)
}

export class SpaceView {
  /** simulated time, ms */
  time = Date.now()
  /** camera distance from the pivot */
  dist = 3.2
  pivot = [0, 0, 0]
  /** camera position and orientation in the sky frame (Earth radii) */
  cam = [0, 0, 1]
  quat = new THREE.Quaternion()
  fov = 45
  width = 1
  height = 1
  /** the globe frame → sky frame at `time` */
  earthToSky = new THREE.Matrix4()
  /** Earth's position from the Sun (AU, sky frame) */
  earthHelio = [1, 0, 0]
  /** 0 next to the globe → 1 out in space (backgrounds turn black, the sky fades in) */
  space = 0
  /** the globe scene was drawn last frame (otherwise the space layers draw Earth and the Moon) */
  globeDrawn = true
  /** the Sun, planets and Moon relative to Earth (Earth radii, sky frame) at `time` */
  readonly bodies = Object.fromEntries(BODIES.map((b) => [b.key, [0, 0, 0]])) as Record<BodyKey, number[]>

  focus: Focus | null = null
  flight: Flight | null = null
  /** called after every rendered frame (labels follow the camera) */
  readonly afterRender = new Set<() => void>()
  /** called when the focus changes */
  readonly onFocus = new Set<() => void>()

  /** Moves the clock and everything that depends on it */
  setTime(ms: number) {
    this.time = ms
    helioPosition("Earth", ms, this.earthHelio)
    const p = [0, 0, 0]
    for (const b of BODIES) {
      const out = this.bodies[b.key]
      if (b.key === "Earth") continue
      if (b.key === "Moon") moonPosition(ms, p)
      else {
        helioPosition(b.key, ms, p)
        for (let i = 0; i < 3; i++) p[i] = p[i]! - this.earthHelio[i]!
      }
      for (let i = 0; i < 3; i++) out[i] = p[i]! * AU
    }
  }

  /** Where the pivot sits for a camera distance when nothing is focused */
  ladderPivot(dist: number, out: number[]) {
    const sun = [-this.earthHelio[0]! * AU, -this.earthHelio[1]! * AU, -this.earthHelio[2]! * AU]
    const a = logStep(dist, 0.05 * AU, 1.5 * AU)
    const b = logStep(dist, 2 * KLY, 40 * KLY)
    const c = logStep(dist, 1.5 * MLY, 8 * MLY)
    for (let i = 0; i < 3; i++) {
      let p = sun[i]! * a
      p += (GALACTIC_CENTRE[i]! - p) * b
      p += (LOCAL_GROUP_MIDDLE[i]! - p) * c
      out[i] = p
    }
    return out
  }

  /** Pivot for the current state, without flights */
  restingPivot(dist: number, out: number[]) {
    if (this.focus && this.focus.position(this.time, out)) return out
    return this.ladderPivot(dist, out)
  }

  /** Fly to a target (or back to the scale ladder with `null`) and settle at `dist` */
  flyTo(to: Focus | null, dist: number, look?: number[]) {
    const from = [...this.pivot]
    const toPos = [0, 0, 0]
    if (to) to.position(this.time, toPos)
    else this.ladderPivot(dist, toPos)
    const sep = Math.hypot(toPos[0]! - from[0]!, toPos[1]! - from[1]!, toPos[2]! - from[2]!)
    const span = Math.abs(Math.log(dist / this.dist)) + Math.max(0, Math.log((sep * 1.5) / Math.max(dist, this.dist)))
    this.flight = { from, to, fromDist: this.dist, toDist: dist, t: 0, duration: Math.min(6, 1.4 + span * 0.12), look }
    if (this.focus !== to) {
      this.focus = to
      for (const f of this.onFocus) f()
    }
  }

  /** Advances a flight; returns the distance the camera should be at, or null when not flying */
  stepFlight(delta: number, pivotOut: number[]) {
    const f = this.flight
    if (!f) return null
    f.t = Math.min(f.duration, f.t + delta)
    const s = f.t / f.duration
    const e = s * s * (3 - 2 * s)
    const to = [0, 0, 0]
    if (!(f.to && f.to.position(this.time, to))) this.ladderPivot(f.toDist, to)
    const sep = Math.hypot(to[0]! - f.from[0]!, to[1]! - f.from[1]!, to[2]! - f.from[2]!)
    // pull back far enough to see both ends on the way, then close in
    const base = Math.log(f.fromDist) + (Math.log(f.toDist) - Math.log(f.fromDist)) * e
    const hump = Math.max(0, Math.log(sep * 1.5) - Math.max(Math.log(f.fromDist), Math.log(f.toDist)))
    const dist = Math.exp(base + hump * Math.sin(Math.PI * e))
    // the pivot moves mostly while zoomed out
    const k = Math.min(1, Math.max(0, (e - 0.15) / 0.7))
    const kk = k * k * (3 - 2 * k)
    for (let i = 0; i < 3; i++) pivotOut[i] = f.from[i]! + (to[i]! - f.from[i]!) * kk
    if (f.t >= f.duration) this.flight = null
    return dist
  }

  /** Distance from Earth to the camera */
  get distanceFromEarth() {
    return Math.hypot(this.cam[0]!, this.cam[1]!, this.cam[2]!)
  }
}
