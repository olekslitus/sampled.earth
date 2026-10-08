/**
 * The Sun, the planets, Pluto and the Moon: sizes, a line about each, and where they are
 * at any instant (astronomy-engine, VSOP87 / truncated ELP).
 */
import { Body, GeoMoon, HelioVector, MakeTime, RotationAxis } from "astronomy-engine"
import type * as THREE from "three"

import { bodyOrientation, fromEquatorial } from "./frames"

export type BodyKey = "Sun" | "Mercury" | "Venus" | "Earth" | "Mars" | "Jupiter" | "Saturn" | "Uranus" | "Neptune" | "Pluto" | "Moon"

export interface BodyInfo {
  key: BodyKey
  name: string
  radiusKm: number
  /** marker colour */
  color: string
  /** texture in /space/planets (Solar System Scope, CC BY 4.0) */
  texture?: string
  /** sidereal orbit period in years (for drawing the orbit) */
  period?: number
  about: string
}

export const BODIES: BodyInfo[] = [
  { key: "Sun", name: "Sun", radiusKm: 695_700, color: "#ffd27a", texture: "sun", about: "Our star: 99.86% of the Solar System’s mass. Its light takes about 8 minutes 20 seconds to reach Earth." },
  { key: "Mercury", name: "Mercury", radiusKm: 2_439.7, color: "#b5aca4", texture: "mercury", period: 0.2408, about: "The smallest planet and the closest to the Sun; a year there lasts 88 Earth days." },
  { key: "Venus", name: "Venus", radiusKm: 6_051.8, color: "#e8cf98", texture: "venus", period: 0.6152, about: "Wrapped in thick clouds of sulphuric acid over a surface hot enough to melt lead." },
  { key: "Earth", name: "Earth", radiusKm: 6_371, color: "#5aa9ff", period: 1, about: "Home to every person on this globe — about 8.2 billion of us." },
  { key: "Mars", name: "Mars", radiusKm: 3_389.5, color: "#e07a50", texture: "mars", period: 1.8809, about: "The red planet. Rovers Curiosity and Perseverance are exploring its surface." },
  { key: "Jupiter", name: "Jupiter", radiusKm: 69_911, color: "#d9b38c", texture: "jupiter", period: 11.862, about: "The largest planet: more than twice the mass of all the others combined." },
  { key: "Saturn", name: "Saturn", radiusKm: 58_232, color: "#e6d29b", texture: "saturn", period: 29.457, about: "Its rings are mostly water ice and span about 280,000 km, yet are often only tens of metres thick." },
  { key: "Uranus", name: "Uranus", radiusKm: 25_362, color: "#9fd8e0", texture: "uranus", period: 84.01, about: "An ice giant tipped on its side, so each pole gets 42 years of daylight." },
  { key: "Neptune", name: "Neptune", radiusKm: 24_622, color: "#6f8cff", texture: "neptune", period: 164.8, about: "The farthest planet, with the fastest winds measured in the Solar System." },
  { key: "Pluto", name: "Pluto", radiusKm: 1_188.3, color: "#c9b7a3", period: 247.9, about: "A dwarf planet in the Kuiper Belt, first seen up close by New Horizons in 2015." },
  { key: "Moon", name: "Moon", radiusKm: 1_737.4, color: "#d0d0d0", texture: "moon", about: "Our Moon is slowly drifting away from Earth, by about 3.8 cm a year." },
]

export const BODY_BY_KEY = new Map(BODIES.map((b) => [b.key, b]))

/** Heliocentric position in AU, sky frame */
export function helioPosition(key: BodyKey, ms: number, out: number[] = [0, 0, 0]) {
  if (key === "Sun") {
    out[0] = out[1] = out[2] = 0
    return out
  }
  return fromEquatorial(HelioVector(Body[key], MakeTime(new Date(ms))), 1, out)
}

/** Moon relative to Earth, in AU, sky frame */
export function moonPosition(ms: number, out: number[] = [0, 0, 0]) {
  return fromEquatorial(GeoMoon(MakeTime(new Date(ms))), 1, out)
}

/** Body-fixed → sky frame rotation (y = north pole, +x = prime meridian) */
export function bodyRotation(key: BodyKey, ms: number, out: THREE.Matrix4) {
  const axis = RotationAxis(Body[key], MakeTime(new Date(ms)))
  return bodyOrientation(axis.ra, axis.dec, axis.spin, out)
}

/** One full orbit as a closed line, heliocentric AU in the sky frame */
export function orbitPath(key: BodyKey, ms: number, points = 360) {
  const period = BODY_BY_KEY.get(key)!.period!
  const out = new Float32Array((points + 1) * 3)
  const p = [0, 0, 0]
  for (let i = 0; i <= points; i++) {
    const t = ms + ((i / points - 0.5) * period * 365.25 * 86_400_000)
    helioPosition(key, t, p)
    out.set(p, i * 3)
  }
  // close the loop exactly
  out.set(out.subarray(0, 3), points * 3)
  return out
}
