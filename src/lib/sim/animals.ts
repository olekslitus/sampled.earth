import { COUNTRIES, COUNTRY_BY_NAME } from "./countries"
import { jitter, onLand, randomRuralSpot, type LatLon } from "./population"
import { hashSeed, mulberry32, pickWeighted, type Rng } from "./rng"

/**
 * Rough global populations and ranges (FAO livestock statistics 2022, IUCN / WWF wildlife
 * estimates). Domestic animals are spread over the countries that keep them; wild species
 * over hand-drawn range blobs [lat, lon, spread in degrees, share].
 */

type Range = [lat: number, lon: number, sigma: number, weight: number]

export interface Species {
  key: string
  name: string
  emoji: string
  group: "Farm & pets" | "Wild" | "Ocean"
  population: number
  /** where they live */
  countries?: Record<string, number>
  /** remaining population spread like people (by country population) */
  restByPeople?: number
  ranges?: Range[]
  terrain: "land" | "sea" | "any"
  /** how far individuals wander (degrees) */
  roam: number
  /** follows the yearly Serengeti migration loop */
  migrates?: boolean
  note?: string
}

const M = 1e6

export const SPECIES: Species[] = [
  {
    key: "chicken", name: "Chicken", emoji: "🐔", group: "Farm & pets", population: 26_000 * M, terrain: "land", roam: 0.01,
    countries: { China: 5000 * M, Indonesia: 3500 * M, "United States of America": 2000 * M, Brazil: 1500 * M, Pakistan: 1500 * M, Iran: 1000 * M, India: 800 * M, Mexico: 600 * M, Russia: 500 * M },
    restByPeople: 9600 * M,
  },
  {
    key: "cattle", name: "Cattle", emoji: "🐄", group: "Farm & pets", population: 1_550 * M, terrain: "land", roam: 0.03,
    countries: { India: 305 * M, Brazil: 234 * M, China: 100 * M, "United States of America": 92 * M, Ethiopia: 70 * M, Argentina: 54 * M, Pakistan: 53 * M, Tanzania: 36 * M, Mexico: 36 * M, Sudan: 32 * M, Chad: 32 * M, Colombia: 29 * M, Australia: 24 * M, Bangladesh: 24 * M, Nigeria: 21 * M, Kenya: 20 * M },
    restByPeople: 408 * M,
  },
  {
    key: "sheep", name: "Sheep", emoji: "🐑", group: "Farm & pets", population: 1_300 * M, terrain: "land", roam: 0.04,
    countries: { China: 190 * M, India: 75 * M, Australia: 70 * M, Nigeria: 48 * M, Iran: 46 * M, Turkey: 45 * M, Ethiopia: 42 * M, Chad: 40 * M, Sudan: 40 * M, "United Kingdom": 33 * M, Pakistan: 31 * M, Algeria: 30 * M, "New Zealand": 25 * M, Morocco: 21 * M, Russia: 21 * M, Kenya: 20 * M, Mongolia: 30 * M, Kazakhstan: 18 * M },
    restByPeople: 470 * M,
  },
  {
    key: "goat", name: "Goat", emoji: "🐐", group: "Farm & pets", population: 1_100 * M, terrain: "land", roam: 0.04,
    countries: { India: 150 * M, China: 133 * M, Nigeria: 85 * M, Pakistan: 80 * M, Bangladesh: 60 * M, Ethiopia: 52 * M, Chad: 40 * M, Sudan: 32 * M, Kenya: 30 * M, Mali: 27 * M, Tanzania: 25 * M, Niger: 18 * M, Somalia: 11 * M, Mongolia: 25 * M },
    restByPeople: 332 * M,
  },
  {
    key: "pig", name: "Pig", emoji: "🐖", group: "Farm & pets", population: 980 * M, terrain: "land", roam: 0.005,
    countries: { China: 450 * M, "United States of America": 75 * M, Brazil: 43 * M, Spain: 34 * M, Russia: 26 * M, Vietnam: 25 * M, Germany: 22 * M, Mexico: 19 * M, Canada: 14 * M, Denmark: 13 * M, Poland: 10 * M, Philippines: 10 * M, France: 12 * M, Netherlands: 11 * M },
    restByPeople: 216 * M,
  },
  {
    key: "dog", name: "Dog", emoji: "🐕", group: "Farm & pets", population: 900 * M, terrain: "land", roam: 0.02,
    restByPeople: 900 * M,
  },
  {
    key: "cat", name: "Cat", emoji: "🐈", group: "Farm & pets", population: 600 * M, terrain: "land", roam: 0.01,
    restByPeople: 600 * M,
  },
  {
    key: "camel", name: "Camel", emoji: "🐫", group: "Farm & pets", population: 40 * M, terrain: "land", roam: 0.15,
    countries: { Chad: 9 * M, Somalia: 7 * M, Ethiopia: 8 * M, Sudan: 5 * M, Kenya: 4.7 * M, Niger: 2 * M, Mauritania: 1.5 * M, Mali: 1 * M, Pakistan: 1 * M, "Saudi Arabia": 0.5 * M, Mongolia: 0.5 * M, India: 0.25 * M, "United Arab Emirates": 0.4 * M, Australia: 0.3 * M },
  },
  {
    key: "african-elephant", name: "African elephant", emoji: "🐘", group: "Wild", population: 415_000, terrain: "land", roam: 0.2,
    ranges: [[-19.5, 24, 2.2, 130], [-18.5, 27.5, 1.8, 80], [-5, 36, 2.5, 60], [-2, 38, 1.6, 35], [-14, 27, 2, 25], [-15, 37, 1.8, 10], [0, 12.5, 2.5, 60], [-24, 31.5, 0.8, 20]],
  },
  {
    key: "asian-elephant", name: "Asian elephant", emoji: "🐘", group: "Wild", population: 50_000, terrain: "land", roam: 0.15,
    ranges: [[21, 80, 4, 20], [11.5, 76.5, 1.2, 7], [7.8, 80.7, 0.6, 6], [21, 96, 1.8, 4], [15, 99.5, 1.5, 3.5], [1, 116.5, 1, 1.5], [0, 101.5, 1.2, 1.5]],
  },
  {
    key: "lion", name: "Lion", emoji: "🦁", group: "Wild", population: 23_000, terrain: "land", roam: 0.1,
    ranges: [[-3, 35, 2, 9], [-20, 24, 1.8, 3], [-1.5, 35.8, 1, 2], [-24, 31.5, 0.8, 3], [-14, 27, 1.6, 2], [21.1, 70.8, 0.25, 0.7], [11.5, 1.5, 1.2, 0.4], [-8, 36, 2, 2]],
  },
  {
    key: "tiger", name: "Tiger", emoji: "🐅", group: "Wild", population: 5_500, terrain: "land", roam: 0.1,
    ranges: [[22, 79, 4, 3.7], [46, 136, 1.6, 0.75], [27.8, 84, 0.8, 0.35], [21.9, 89.2, 0.3, 0.12], [-0.5, 101.5, 1.5, 0.4], [4.5, 102, 0.8, 0.15], [15.5, 99, 0.8, 0.2]],
  },
  {
    key: "panda", name: "Giant panda", emoji: "🐼", group: "Wild", population: 1_864, terrain: "land", roam: 0.03,
    ranges: [[31, 103.5, 1, 1], [33.6, 107.5, 0.5, 0.25]],
  },
  {
    key: "giraffe", name: "Giraffe", emoji: "🦒", group: "Wild", population: 117_000, terrain: "land", roam: 0.12,
    ranges: [[1, 37.5, 2.5, 35], [-4, 35, 2, 30], [-20, 18, 2.5, 30], [-24, 31, 1.2, 15], [13.5, 2.5, 0.4, 0.7]],
  },
  {
    key: "wildebeest", name: "Wildebeest", emoji: "🐃", group: "Wild", population: 1_500_000, terrain: "land", roam: 0.08, migrates: true,
    ranges: [[-2.5, 34.9, 0.35, 1]],
    note: "Follows the yearly Great Migration between the Serengeti and the Masai Mara",
  },
  {
    key: "gorilla", name: "Gorilla", emoji: "🦍", group: "Wild", population: 360_000, terrain: "land", roam: 0.05,
    ranges: [[0, 14.5, 2.5, 340], [-1.4, 29.5, 0.3, 1], [-1.5, 28, 1, 4]],
  },
  {
    key: "orangutan", name: "Orangutan", emoji: "🦧", group: "Wild", population: 105_000, terrain: "land", roam: 0.04,
    ranges: [[1, 114, 1.8, 100], [3.5, 97.5, 0.6, 14]],
  },
  {
    key: "kangaroo", name: "Kangaroo", emoji: "🦘", group: "Wild", population: 40 * M, terrain: "land", roam: 0.12,
    ranges: [[-27, 135, 7, 20], [-32, 146, 3.5, 10], [-25, 120, 4.5, 10]],
  },
  {
    key: "koala", name: "Koala", emoji: "🐨", group: "Wild", population: 300_000, terrain: "land", roam: 0.02,
    ranges: [[-28, 152, 2, 2], [-34, 150, 1.5, 1], [-37.5, 145, 1.5, 1]],
  },
  {
    key: "wolf", name: "Grey wolf", emoji: "🐺", group: "Wild", population: 250_000, terrain: "land", roam: 0.3,
    ranges: [[58, -110, 8, 60], [64, -150, 3.5, 11], [60, 90, 15, 50], [47, 103, 3.5, 10], [48, 68, 4, 30], [52, 20, 5, 17], [46, -110, 3, 6], [33, 90, 4, 12]],
  },
  {
    key: "brown-bear", name: "Brown bear", emoji: "🐻", group: "Wild", population: 200_000, terrain: "land", roam: 0.15,
    ranges: [[60, 100, 15, 120], [62, -152, 3.5, 30], [57, -125, 5, 25], [47, 25, 3, 9], [63, 16, 2.5, 3]],
  },
  {
    key: "polar-bear", name: "Polar bear", emoji: "🐻‍❄️", group: "Wild", population: 26_000, terrain: "any", roam: 0.4,
    ranges: [[60, -85, 3.5, 2], [73, -95, 5, 12], [71, -155, 2.5, 3], [75, -40, 5, 3], [78.5, 20, 1.5, 3], [72, 120, 10, 3]],
  },
  {
    key: "reindeer", name: "Reindeer", emoji: "🦌", group: "Wild", population: 7 * M, terrain: "land", roam: 0.25,
    ranges: [[67, 100, 15, 3], [63, -110, 8, 2], [66, -155, 3.5, 0.8], [68, 24, 2.5, 0.5]],
  },
  {
    key: "bison", name: "Bison", emoji: "🦬", group: "Wild", population: 500_000, terrain: "land", roam: 0.08,
    ranges: [[44, -100, 5, 350], [54, -112, 4, 150]],
  },
  {
    key: "penguin", name: "Emperor penguin", emoji: "🐧", group: "Ocean", population: 600_000, terrain: "any", roam: 0.05,
    ranges: [0, 45, 90, 135, 180, 225, 270, 315].map((lon) => [-70, lon - 180, 3, 1] as Range),
  },
  {
    key: "blue-whale", name: "Blue whale", emoji: "🐋", group: "Ocean", population: 15_000, terrain: "sea", roam: 1.5,
    ranges: [[20, -120, 12, 3], [55, -30, 8, 1.5], [-10, 80, 12, 3], [-60, 30, 15, 4], [6, 81, 2, 1], [-40, -80, 5, 1]],
  },
  {
    key: "humpback", name: "Humpback whale", emoji: "🐳", group: "Ocean", population: 80_000, terrain: "sea", roam: 1.5,
    ranges: [[21, -157, 3, 10], [45, -20, 15, 12], [-25, 155, 5, 30], [-20, -40, 8, 10], [58, -150, 6, 10], [-55, 0, 20, 8]],
  },
  {
    key: "shark", name: "Great white shark", emoji: "🦈", group: "Ocean", population: 3_500, terrain: "sea", roam: 1,
    ranges: [[-34.5, 19.5, 1.5, 1], [37.7, -123, 2, 1], [-35, 138, 2.5, 1], [-46, 168, 2, 0.5], [41.5, -70, 1.5, 0.5], [29, -115, 2, 0.5]],
  },
]

export const SPECIES_BY_KEY = new Map(SPECIES.map((s) => [s.key, s]))

/** Icons shown per species: rare animals 1:1, common ones capped */
const MAX_ICONS = 1500

export function iconCount(s: Species) {
  return Math.min(MAX_ICONS, s.population)
}

export interface AnimalPositions {
  species: Species
  /** lat/lon pairs */
  homes: Float32Array
  count: number
  /** real animals per icon */
  represents: number
}

function placeRange(rng: Rng, s: Species): LatLon {
  const ranges = s.ranges!
  for (let attempt = 0; attempt < 30; attempt++) {
    const r = pickWeighted(rng, ranges, ranges.map((x) => x[3]))
    const p = jitter(rng, [r[0], r[1]], r[2])
    p[0] = Math.max(-85, Math.min(85, p[0]))
    if (p[1] > 180) p[1] -= 360
    if (p[1] < -180) p[1] += 360
    if (s.terrain === "any") return p
    if (onLand(p[0], p[1]) === (s.terrain === "land")) return p
  }
  const r = ranges[0]
  return [r[0], r[1]]
}

const cache = new Map<string, AnimalPositions>()

export function animalPositions(s: Species): AnimalPositions {
  const hit = cache.get(s.key)
  if (hit) return hit
  const rng = mulberry32(hashSeed(...[...s.key].map((ch) => ch.charCodeAt(0))))
  const count = iconCount(s)
  const homes = new Float32Array(count * 2)
  if (s.ranges) {
    for (let i = 0; i < count; i++) {
      const [lat, lon] = placeRange(rng, s)
      homes[i * 2] = lat
      homes[i * 2 + 1] = lon
    }
  } else {
    const entries: [string, number][] = Object.entries(s.countries ?? {})
    const named = new Set(entries.map(([n]) => n))
    const rest = s.restByPeople ?? 0
    if (rest) {
      const others = COUNTRIES.filter((c) => !named.has(c.name))
      const pop = others.reduce((a, c) => a + c.population, 0)
      for (const c of others) entries.push([c.name, (rest * c.population) / pop])
    }
    for (let i = 0; i < count; i++) {
      const [name] = pickWeighted(rng, entries, entries.map((e) => e[1]))
      const [lat, lon] = randomRuralSpot(COUNTRY_BY_NAME.get(name)!, rng)
      homes[i * 2] = lat
      homes[i * 2 + 1] = lon
    }
  }
  const out = { species: s, homes, count, represents: s.population / count }
  cache.set(s.key, out)
  return out
}

/** Herd centre of the Great Migration through the year (approximate, clockwise loop). */
const MIGRATION: LatLon[] = [
  [-3.0, 35.0], // Jan: calving on the southern plains
  [-3.1, 35.1],
  [-3.0, 34.9],
  [-2.7, 34.6],
  [-2.4, 34.2], // May: western corridor
  [-2.0, 34.4],
  [-1.6, 34.9], // Jul: crossing the Mara river
  [-1.4, 35.1],
  [-1.4, 35.2],
  [-1.7, 35.3],
  [-2.2, 35.3], // Nov: heading south again
  [-2.7, 35.1],
]

export function migrationCentre(utcMs: number): LatLon {
  const d = new Date(utcMs)
  const t = d.getUTCMonth() + (d.getUTCDate() - 1) / 31
  const a = MIGRATION[Math.floor(t) % 12]
  const b = MIGRATION[(Math.floor(t) + 1) % 12]
  const k = t - Math.floor(t)
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]
}
