import { geoBounds, geoEquirectangular, geoPath } from "d3-geo"
import { feature } from "topojson-client"
import type { Feature, FeatureCollection, Geometry } from "geojson"
import type { Topology, GeometryCollection } from "topojson-specification"
import worldTopo from "world-atlas/countries-50m.json"

import {
  COUNTRIES, COUNTRY_BY_NAME, DIASPORA_ORIGINS, EDUCATION_LEVELS, RELIGIONS,
  type Centre, type Country, type Religion,
} from "./countries"
import { NAME_POOLS, displayName } from "./names"
import { assignPolitics, type PoliticalTraits, type Politics } from "./politics"
import { OCCUPATIONS, type Occupation, type Role } from "./occupations"
import {
  clamp, hashSeed, mulberry32, normal, pick, pickIndexWeighted, pickWeighted, poisson, probit, type Rng,
} from "./rng"

export type LatLon = [lat: number, lon: number]

export interface Person {
  id: number
  /** Millions of real people this synthetic person stands in for */
  represents: number
  /** Spawned on demand for a zoomed-in region rather than part of the world sample */
  detail: boolean
  name: string
  gender: "Male" | "Female"
  age: number
  country: Country
  /** the urban centre they live in, or the one they live near */
  city: Centre
  /** lives inside the centre's built-up area (else in a town or the countryside around it) */
  inCity: boolean
  urban: boolean
  immigrant: boolean
  origin: Country
  motherTongue: string
  otherLanguages: string[]
  religion: Religion
  devout: boolean
  education: number
  educationNote?: string
  role: Role
  occupation?: Occupation
  nightShift: boolean
  income: number
  marital: "Single" | "Married" | "Divorced" | "Widowed"
  children: number
  household: number
  internet: boolean
  hobbies: string[]
  /** null for under-18s */
  politics: Politics | null
  /** 0..1, how wealthy the country is, used to bias choices */
  wealth: number
  // daily rhythm (local solar hours)
  wake: number
  bed: number
  workStart: number
  workEnd: number
  workDays: 5 | 6
  commute: number
  phase: number
  // places
  home: LatLon
  work: LatLon
  third: LatLon
  worship: LatLon
  school: LatLon
}

// ---------------------------------------------------------------------------
// Geography

const topo = worldTopo as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>
const shapes = feature(topo, topo.objects.countries) as FeatureCollection<Geometry, { name: string }>
const SHAPE_BY_NAME = new Map<string, Feature<Geometry, { name: string }>>()
for (const f of shapes.features) SHAPE_BY_NAME.set(f.properties.name, f)

interface Ring {
  pts: Float64Array // lon, lat pairs
  /** crosses the antimeridian: western longitudes are stored shifted by +360 */
  wrapped: boolean
  minLon: number
  maxLon: number
  minLat: number
  maxLat: number
}

interface CountryGeo {
  index: number
  shape?: Feature<Geometry, { name: string }>
  rings: Ring[]
  bounds: [[number, number], [number, number]]
  spread: number
}
const GEO = new Map<string, CountryGeo>()
/** Planar polygon rings on lon/lat; rings crossing the antimeridian are unwrapped. */
function ringsOf(g: Geometry): Ring[] {
  const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : []
  return polys.flat().map((ring) => {
    const pts = new Float64Array(ring.length * 2)
    const wrapped = ring.some((pt, i) => i > 0 && Math.abs(pt[0] - ring[i - 1][0]) > 180)
    let minLon = 540, maxLon = -540, minLat = 90, maxLat = -90
    ring.forEach(([rawLon, lat], i) => {
      const lon = wrapped && rawLon < 0 ? rawLon + 360 : rawLon
      pts[i * 2] = lon
      pts[i * 2 + 1] = lat
      minLon = Math.min(minLon, lon)
      maxLon = Math.max(maxLon, lon)
      minLat = Math.min(minLat, lat)
      maxLat = Math.max(maxLat, lat)
    })
    return { pts, wrapped, minLon, maxLon, minLat, maxLat }
  })
}

/** Even-odd ray casting over all rings (holes included). */
function ringsContain(rings: Ring[], lat: number, rawLon: number) {
  let inside = false
  for (const r of rings) {
    const lon = r.wrapped && rawLon < 0 ? rawLon + 360 : rawLon
    if (lon < r.minLon || lon > r.maxLon || lat < r.minLat || lat > r.maxLat) continue
    const p = r.pts
    const n = p.length / 2
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const yi = p[i * 2 + 1]
      const yj = p[j * 2 + 1]
      if (yi > lat !== yj > lat) {
        const xi = p[i * 2]
        const xj = p[j * 2]
        if (lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
      }
    }
  }
  return inside
}

COUNTRIES.forEach((c, index) => {
  const shape = SHAPE_BY_NAME.get(c.name)
  const bounds = shape
    ? (geoBounds(shape) as [[number, number], [number, number]])
    : ([[c.cities[0].lon - 1, c.cities[0].lat - 1], [c.cities[0].lon + 1, c.cities[0].lat + 1]] as [[number, number], [number, number]])
  let w = bounds[1][0] - bounds[0][0]
  if (w < 0) w += 360
  const h = bounds[1][1] - bounds[0][1]
  GEO.set(c.name, { index, shape, rings: shape ? ringsOf(shape.geometry) : [], bounds, spread: clamp(Math.hypot(w, h) * 0.1, 0.25, 2.5) })
})

/**
 * Point-in-country lookups are hot during generation, so in the browser the shapes are
 * rasterised once into a grid of country indices. Cells on a border or coastline fall
 * back to the exact spherical test.
 */
const GRID_W = 2048
const GRID_H = 1024
let grid: { owner: Uint8Array; edge: Uint8Array } | null | undefined

function buildGrid() {
  if (typeof document === "undefined") return null
  const canvas = document.createElement("canvas")
  canvas.width = GRID_W
  canvas.height = GRID_H
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  if (!ctx) return null
  const path = geoPath(geoEquirectangular().scale(GRID_W / (2 * Math.PI)).translate([GRID_W / 2, GRID_H / 2]), ctx)
  for (const c of COUNTRIES) {
    const geo = GEO.get(c.name)!
    if (!geo.shape) continue
    ctx.fillStyle = `rgb(${geo.index + 1}, 0, 0)`
    ctx.beginPath()
    path(geo.shape)
    ctx.fill()
  }
  const px = ctx.getImageData(0, 0, GRID_W, GRID_H).data
  const owner = new Uint8Array(GRID_W * GRID_H)
  for (let i = 0; i < owner.length; i++) owner[i] = px[i * 4]
  const edge = new Uint8Array(GRID_W * GRID_H)
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const i = y * GRID_W + x
      const o = owner[i]
      const differs =
        (x > 0 && owner[i - 1] !== o) || (x < GRID_W - 1 && owner[i + 1] !== o) ||
        (y > 0 && owner[i - GRID_W] !== o) || (y < GRID_H - 1 && owner[i + GRID_W] !== o)
      if (differs) edge[i] = 1
    }
  }
  return { owner, edge }
}

function inside(geo: CountryGeo, lat: number, lon: number) {
  if (!geo.shape) return true
  if (grid === undefined) grid = buildGrid()
  if (grid) {
    const x = Math.floor(((lon + 180) / 360) * GRID_W)
    const y = Math.floor(((90 - lat) / 180) * GRID_H)
    if (x >= 0 && x < GRID_W && y >= 0 && y < GRID_H) {
      const i = y * GRID_W + x
      if (!grid.edge[i]) return grid.owner[i] === geo.index + 1
    }
  }
  return ringsContain(geo.rings, lat, lon)
}

/** Where to look at a country from: the middle of its bounding box and how wide it is (degrees) */
export function countryView(c: Country): { lat: number; lon: number; span: number } {
  const [[w, south], [e, north]] = GEO.get(c.name)!.bounds
  let width = e - w
  if (width < 0) width += 360
  let lon = w + width / 2
  if (lon > 180) lon -= 360
  return { lat: (south + north) / 2, lon, span: Math.max(width * Math.cos((((south + north) / 2) * Math.PI) / 180), north - south) }
}

export function insideCountry(c: Country, lat: number, lon: number) {
  return inside(GEO.get(c.name)!, lat, lon)
}

/**
 * Where a country's people live. Everyone in an urban centre is placed inside it, in
 * proportion to its residents; everyone else lives in a town or the countryside around a
 * centre, chosen by the square root of its residents so small centres get a fair share of
 * the surrounding land. The urban share (UN definitions, wider than GHSL centres) is kept:
 * city dwellers count as urban first, and the rest of the urban share lives in towns.
 */
export interface CentreModel {
  /** share of people living inside an urban centre */
  inside: number
  /** chance that someone inside a centre / outside every centre counts as urban */
  urbanInside: number
  urbanOutside: number
  /** cumulative weights for choosing the centre someone lives in / lives near */
  byPop: Float64Array
  bySpread: Float64Array
}

const MODELS = new Map<Country, CentreModel>()
export function centreModel(c: Country): CentreModel {
  let m = MODELS.get(c)
  if (m) return m
  const cumulative = (w: (x: Centre) => number) => {
    let t = 0
    return Float64Array.from(c.centres, (x) => (t += w(x)))
  }
  const byPop = cumulative((x) => x.pop)
  // GHSL counts people a little differently from the UN, so leave some room outside the centres
  const inside = Math.min(0.9, byPop[byPop.length - 1] / c.population)
  const u = c.urban / 100
  m = {
    inside,
    urbanInside: Math.min(1, u / inside),
    urbanOutside: Math.max(0, (u - inside) / (1 - inside)),
    byPop,
    bySpread: cumulative((x) => Math.sqrt(x.pop)),
  }
  MODELS.set(c, m)
  return m
}

/** Index into a cumulative weight array, chosen in proportion to the weights */
export function pickCumulative(rng: Rng, cumulative: Float64Array) {
  const x = rng() * cumulative[cumulative.length - 1]
  let lo = 0
  let hi = cumulative.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (cumulative[mid] < x) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** Spread (degrees, 1σ) of rural homes around a centre */
export function ruralSigma(c: Country) {
  return GEO.get(c.name)!.spread
}

/** Homes in towns and the countryside lie beyond the centre's built-up area (about 2σ) */
export function outsideDist(city: Centre) {
  return Math.max(RURAL_MIN_DIST, 2 * city.sigma)
}

/** City homes must be on land */
export function cityHomeOk(c: Country, home: LatLon) {
  return insideCountry(c, home[0], home[1])
}

/**
 * Some centres sit just off the 1:50m coastline or across a border line. Move each such
 * centre to the nearest point inside its country, so that everything placed around it
 * starts on land. Runs once, on first use.
 */
let centresSnapped = false
export function snapCentresToLand() {
  if (centresSnapped) return
  centresSnapped = true
  for (const c of COUNTRIES) {
    if (!GEO.get(c.name)!.shape) continue
    for (const city of c.centres) {
      if (insideCountry(c, city.lat, city.lon)) continue
      const cos = Math.max(0.2, Math.cos((city.lat * Math.PI) / 180))
      search: for (let r = 0.01; r <= 0.5; r += 0.01) {
        for (let k = 0; k < 24; k++) {
          const a = (k / 24) * Math.PI * 2
          const lat = city.lat + Math.sin(a) * r
          const lon = city.lon + (Math.cos(a) * r) / cos
          if (insideCountry(c, lat, lon)) {
            city.lat = Math.round(lat * 1000) / 1000
            city.lon = Math.round(lon * 1000) / 1000
            break search
          }
        }
      }
    }
  }
}

/** Spread (degrees, 1σ) of the small towns clustered around each centre */
export function townSigma(c: Country) {
  return Math.min(GEO.get(c.name)!.spread, 1.2)
}

/** Rural homes are never placed this close to the city centre (degrees) */
export const RURAL_MIN_DIST = 0.12

export function jitter(rng: Rng, [lat, lon]: LatLon, sigma: number): LatLon {
  return [lat + normal(rng) * sigma, lon + (normal(rng) * sigma) / Math.max(0.2, Math.cos((lat * Math.PI) / 180))]
}

/** A spot from `draw` that lies inside the country, or `fallback` after a few tries */
function onLandOr(c: Country, fallback: LatLon, draw: () => LatLon): LatLon {
  for (let i = 0; i < 8; i++) {
    const pt = draw()
    if (insideCountry(c, pt[0], pt[1])) return pt
  }
  return fallback
}

function ring(rng: Rng, [lat, lon]: LatLon, min: number, max: number): LatLon {
  const a = rng() * Math.PI * 2
  const d = min + rng() * (max - min)
  return [lat + Math.sin(a) * d, lon + (Math.cos(a) * d) / Math.max(0.2, Math.cos((lat * Math.PI) / 180))]
}

export function degDistance(a: LatLon, b: LatLon) {
  const dLon = (b[1] - a[1]) * Math.cos((a[0] * Math.PI) / 180)
  return Math.hypot(b[0] - a[0], dLon)
}

// ---------------------------------------------------------------------------
// Sampling helpers

/** Cumulative age-band shares per country and sex (UN WPP 5-year bands via the World Bank) */
const AGE_CDF = new Map(
  COUNTRIES.map((c) => {
    const cdf = (bands: number[]) => {
      const total = bands.reduce((a, b) => a + b, 0)
      let acc = 0
      return bands.map((b) => (acc += b / total))
    }
    return [c.name, { male: cdf(c.ageBands.male), female: cdf(c.ageBands.female) }]
  }),
)

/**
 * Age within a 5-year band is uniform. Within the open 80+ band, survival falls off
 * roughly exponentially, more slowly where people live longer.
 */
function sampleAge(rng: Rng, c: Country, gender: Person["gender"]) {
  const cdf = AGE_CDF.get(c.name)![gender === "Male" ? "male" : "female"]
  if (!cdf.length) return Math.floor(rng() * 80)
  const u = rng()
  let band = 0
  while (band < cdf.length - 1 && u > cdf[band]) band++
  if (band < cdf.length - 1) return band * 5 + Math.floor(rng() * 5)
  const tau = clamp(4 + (c.lifeExpectancy - 70) * 0.3, 3, 8)
  return Math.min(104, 80 + Math.floor(-Math.log(1 - rng() * (1 - Math.exp(-25 / tau))) * tau))
}

/** Share of out-of-school teenagers in work; the rest help at home */
const TEEN_WORK = { young: 0.3, old: 0.5 }
/** Jobs teenagers realistically do (ILO child-labour surveys: mostly family farms, trade and domestic work) */
const TEEN_JOBS = new Set(["Farm labourer", "Smallholder farmer", "Livestock herder", "Fisher", "Street vendor", "Market trader", "Domestic worker", "Garment worker", "Tailor / artisan"])
const OLDER_TEEN_JOBS = new Set([...TEEN_JOBS, "Construction worker", "Cook / waiter", "Cleaner", "Factory worker", "Delivery rider"])

/** Out-of-school rate (%) for a child of this age. Upper-secondary rates aren't in WDI, so
 * they're extrapolated from the lower-secondary rate (UIS: roughly double, more in poorer countries). */
function outOfSchoolRate(c: Country, age: number, wealth: number) {
  if (age < 12) return c.outOfSchool.primary
  if (age < 15) return c.outOfSchool.lowerSecondary
  return Math.min(85, c.outOfSchool.lowerSecondary * 2 + 12 * (1 - wealth))
}

const wealthOf = (c: Country) => clamp(Math.log10(c.medianIncome / 400) / Math.log10(150), 0, 1)

const retireAge = (wealth: number) => 58 + wealth * 7
const pensionCover = (wealth: number) => clamp(0.15 + wealth * 0.85, 0.15, 0.97)
/** Retirement phases in over the decade after retirement age; few still work past 75 */
function retiredChance(age: number, wealth: number) {
  const start = retireAge(wealth)
  if (age < start) return 0
  if (age > 75) return 1
  const pension = pensionCover(wealth)
  return Math.min(1, pension * Math.min(1, 0.6 + 0.06 * (age - start)) + (age > 72 ? 0.3 : 0))
}
/** Chance an 18–24-year-old is a full-time university student (mirrors the education draw) */
function studentChance(c: Country, age: number) {
  const [e0, e1, e2, e3] = c.education
  const tertiary = (e3 * 1.3) / (e0 * 0.6 + e1 * 0.9 + e2 + e3 * 1.3)
  return age < 23 ? tertiary * 0.8 : age < 25 ? tertiary * 0.4 : 0
}

/**
 * Chance that an adult who is neither a student nor retired is in the labour force,
 * solved per country and sex so that participation among everyone 15+ (teen workers,
 * students and retirees included) matches the ILO estimate.
 */
const PARTICIPATION = new Map(
  COUNTRIES.map((c) => {
    const wealth = wealthOf(c)
    const rateFor = (bands: number[], target: number, retireScale: number) => {
      let fixed = 0 // in the labour force regardless of the rate (working teenagers)
      let flexible = 0 // share of 15+ the rate applies to
      let adults = 0
      for (let age = 15; age < 105; age++) {
        const share = bands[Math.min(16, Math.floor(age / 5))] / (age >= 80 ? 25 : 5)
        adults += share
        if (age < 18) fixed += share * (outOfSchoolRate(c, age, wealth) / 100) * TEEN_WORK.old
        else flexible += share * (1 - studentChance(c, age)) * (1 - retiredChance(age, wealth) * retireScale)
      }
      return (target * adults - fixed) / Math.max(flexible, 1e-6)
    }
    // where even near-universal working-age participation falls short (e.g. Japan), older
    // people must be retiring later: shrink the retirement chance until the target is met
    const solve = (bands: number[], target: number) => {
      let retireScale = 1
      while (retireScale > 0.3 && rateFor(bands, target, retireScale) > 0.95) retireScale -= 0.05
      return { rate: clamp(rateFor(bands, target, retireScale), 0.05, 0.97), retireScale }
    }
    if (!c.ageBands.male.length) return [c.name, { male: { rate: 0.8, retireScale: 1 }, female: { rate: 0.55, retireScale: 1 } }]
    return [c.name, { male: solve(c.ageBands.male, c.participation.male / 100), female: solve(c.ageBands.female, c.participation.female / 100) }]
  }),
)

function pickLanguage(rng: Rng, c: Country) {
  const l = pickWeighted(rng, c.languages, c.languages.map((x) => x.share))
  return l.name === "Other" ? "Other local language" : l.name
}

const HOBBIES = [
  { h: "football", needs: () => true },
  { h: "watching TV", needs: () => true },
  { h: "music", needs: () => true },
  { h: "cooking", needs: () => true },
  { h: "visiting friends", needs: () => true },
  { h: "reading", needs: (p: Partial<Person>) => (p.education ?? 0) >= 1 },
  { h: "social media", needs: (p: Partial<Person>) => !!p.internet },
  { h: "video games", needs: (p: Partial<Person>) => !!p.internet && (p.age ?? 0) < 45 },
  { h: "gardening", needs: (p: Partial<Person>) => (p.age ?? 0) > 30 },
  { h: "cards & board games", needs: () => true },
  { h: "walking", needs: () => true },
  { h: "gym", needs: (p: Partial<Person>) => (p.wealth ?? 0) > 0.45 && (p.age ?? 0) < 60 },
  { h: "dancing", needs: (p: Partial<Person>) => (p.age ?? 0) < 50 },
  { h: "fishing", needs: () => true },
  { h: "café chats", needs: () => true },
  { h: "crafts", needs: () => true },
]

export const HOBBY_NAMES = HOBBIES.map((h) => h.h)

// ---------------------------------------------------------------------------

const NEIGHBOURS = new Map(
  COUNTRIES.map((c) => [c.name, COUNTRIES.filter((x) => x.region === c.region && x !== c && x.population > 2)]),
)

function allocate(total: number): number[] {
  const pop = COUNTRIES.reduce((s, c) => s + c.population, 0)
  const raw = COUNTRIES.map((c) => (c.population / pop) * total)
  const counts = raw.map(Math.floor)
  let left = total - counts.reduce((a, b) => a + b, 0)
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0])
  for (let i = 0; left > 0; i++, left--) counts[order[i % order.length][1]]++
  return counts
}

export const WORLD_POPULATION_M = COUNTRIES.reduce((s, c) => s + c.population, 0)

/**
 * Yields a population-weighted world sample in a shuffled order, so a partially
 * generated sample is already spread across the whole globe.
 */
export function* populationGenerator(total: number, seed: number): Generator<Person> {
  const counts = allocate(total)
  const order = new Uint32Array(total)
  let k = 0
  counts.forEach((n, ci) => {
    for (let j = 0; j < n; j++) order[k++] = ci * 1_000_000 + j
  })
  const shuffle = mulberry32(hashSeed(seed, 1234))
  for (let i = total - 1; i > 0; i--) {
    const j = Math.floor(shuffle() * (i + 1))
    const t = order[i]
    order[i] = order[j]
    order[j] = t
  }
  const represents = WORLD_POPULATION_M / total
  for (let i = 0; i < total; i++) {
    const ci = Math.floor(order[i] / 1_000_000)
    const j = order[i] % 1_000_000
    const p = makePerson(i, COUNTRIES[ci], mulberry32(hashSeed(seed, ci, j)))
    p.represents = represents
    yield p
  }
}

export interface Placement {
  city: Centre
  inCity: boolean
  urban: boolean
  home: LatLon
}

export function makePerson(id: number, c: Country, rng: Rng, placement?: Placement): Person {
  snapCentresToLand()
  const geo = GEO.get(c.name)!
  const wealth = wealthOf(c)
  const gender: Person["gender"] = rng() * 100 < c.femaleShare ? "Female" : "Male"
  const age = sampleAge(rng, c, gender)

  // background ------------------------------------------------------------
  const immigrant = age > 1 && rng() * 100 < c.migrants
  let origin = c
  if (immigrant) {
    const neighbours = NEIGHBOURS.get(c.name)!
    const name = rng() < 0.5 && neighbours.length ? pickWeighted(rng, neighbours, neighbours.map((x) => x.population)).name : pick(rng, DIASPORA_ORIGINS)
    origin = COUNTRY_BY_NAME.get(name) ?? c
    if (origin === c) origin = COUNTRY_BY_NAME.get("India")!
  }
  const pool = NAME_POOLS[origin.namePool]
  const first = pick(rng, gender === "Male" ? pool.male : pool.female)
  const last = pick(rng, pool.last)
  const name = displayName(origin.namePool, first, last)

  const religion = RELIGIONS[pickIndexWeighted(rng, origin.religion)]
  const devout = religion !== "Unaffiliated" && rng() < 0.2 + 0.55 * (1 - wealth)

  const motherTongue = pickLanguage(rng, origin)
  const otherLanguages: string[] = []
  if (immigrant) {
    const local = pickLanguage(rng, c)
    if (local !== motherTongue) otherLanguages.push(local)
  } else if (c.languages[0].name !== motherTongue && motherTongue !== "Other local language" && rng() < 0.7) {
    otherLanguages.push(c.languages[0].name)
  } else if (motherTongue === "Other local language" && c.languages[0].name !== "Other") {
    otherLanguages.push(c.languages[0].name)
  }

  // where they live --------------------------------------------------------
  const model = centreModel(c)
  const inCity = placement ? placement.inCity : rng() < model.inside
  const urban = placement ? placement.urban : rng() < (inCity ? model.urbanInside : model.urbanOutside)
  const city = placement ? placement.city : c.centres[pickCumulative(rng, inCity ? model.byPop : model.bySpread)]
  const center: LatLon = [city.lat, city.lon]
  let home: LatLon = center
  if (placement) {
    home = placement.home
  } else if (inCity) {
    home = jitter(rng, center, city.sigma)
    for (let i = 0; i < 12 && !cityHomeOk(c, home); i++) home = jitter(rng, center, city.sigma)
    if (!cityHomeOk(c, home)) home = center
  } else {
    // a small town near the centre for urban residents, the countryside around it for everyone else
    const sigma = urban ? townSigma(c) : geo.spread
    const min = outsideDist(city)
    let found = false
    for (let i = 0; i < 40 && !found; i++) {
      const cand = jitter(rng, center, Math.max(sigma, min))
      if (inside(geo, cand[0], cand[1]) && degDistance(cand, center) > min) {
        home = cand
        found = true
      }
    }
    if (!found) home = jitter(rng, center, Math.max(0.15, min))
  }

  // education ---------------------------------------------------------------
  const internet = rng() * 100 < c.internet * (age < 10 ? 0.5 : age > 70 ? 0.6 : 1)
  let eduWeights = [...origin.education]
  if (age >= 55) eduWeights = [eduWeights[0] * 1.5, eduWeights[1] * 1.2, eduWeights[2], eduWeights[3] * 0.6]
  else if (age < 35) eduWeights = [eduWeights[0] * 0.6, eduWeights[1] * 0.9, eduWeights[2], eduWeights[3] * 1.3]
  let education = pickIndexWeighted(rng, eduWeights)
  let educationNote: string | undefined
  let role: Role = "Worker"

  if (age < 6) {
    role = "Child"
    education = 0
    educationNote = "Not yet school age"
  } else if (age < 18) {
    if (rng() * 100 >= outOfSchoolRate(c, age, wealth)) {
      role = "Pupil"
      education = age < 12 ? 1 : 2
      educationNote = age < 12 ? "In primary school" : "In secondary school"
    } else {
      // dropped out after some primary school, or never enrolled
      education = age >= 10 && rng() < 0.6 ? 1 : 0
      educationNote = "Not in school"
      role = age >= 12 && rng() < (age < 15 ? TEEN_WORK.young : TEEN_WORK.old) ? "Worker" : "Child"
    }
  } else if (age < 25 && education === 3 && rng() < (age < 23 ? 0.8 : 0.4)) {
    role = "Student"
    education = 2
    educationNote = "Studying at university"
  }

  // work --------------------------------------------------------------------
  const pension = pensionCover(wealth)
  if (role === "Worker" && age >= 18) {
    const lfp = PARTICIPATION.get(c.name)![gender === "Male" ? "male" : "female"]
    if (rng() < retiredChance(age, wealth) * lfp.retireScale) role = "Retired"
    else if (rng() > lfp.rate) {
      // outside the labour force: mostly caring for a home or family; older men often retire early
      role = gender === "Male" && age >= 50 && rng() < 0.6 ? "Retired" : "Homemaker"
    } else if (rng() * 100 < c.unemployment * (age < 25 ? 1.8 : 0.85)) role = "Unemployed"
  }

  let occupation: Occupation | undefined
  if (role === "Worker") {
    const agri = c.agriculture * (urban ? 0.12 : 1.8) * (age < 18 ? 3 : 1)
    const ind = c.industry
    const svc = Math.max(5, 100 - c.agriculture - c.industry)
    const sector = pickWeighted(rng, ["Agriculture", "Industry", "Services"] as const, [agri, ind, svc])
    const allowed = age < 15 ? TEEN_JOBS : age < 18 ? OLDER_TEEN_JOBS : null
    const options = OCCUPATIONS.filter((x) => x.sector === sector && x.minEdu <= education && (!allowed || allowed.has(x.title)))
    const fallback = OCCUPATIONS.filter((x) => (allowed ? allowed.has(x.title) : x.sector === sector))
    const list = options.length ? options : fallback
    // people mostly work at their level; heavily over-qualified matches are rare
    const fit = (x: Occupation) => (education - x.minEdu >= 2 ? 0.15 : education - x.minEdu === 1 ? 0.6 : 1)
    occupation = pickWeighted(rng, list, list.map((x) => (x.wLow * (1 - wealth) + x.wHigh * wealth) * fit(x)))
  }
  const nightShift = !!occupation && rng() < occupation.night

  // income (USD / yr) -------------------------------------------------------
  const sigma = Math.SQRT2 * probit((c.gini / 100 + 1) / 2)
  const lognorm = (s: number) => Math.exp(normal(rng) * s)
  let income = 0
  if (role === "Worker" && occupation) {
    income = c.medianIncome * occupation.mult * lognorm(sigma * 0.8) * (age < 18 ? 0.3 : age < 25 ? 0.7 : 1)
    if (immigrant && wealth > 0.6) income *= 0.85
  } else if (role === "Retired" && rng() < pension) {
    income = c.medianIncome * 0.5 * lognorm(0.5)
  } else if (role === "Unemployed" && rng() < pension * 0.7) {
    income = c.medianIncome * 0.3 * lognorm(0.3)
  } else if (role === "Student" && rng() < 0.15 + wealth * 0.4) {
    income = c.medianIncome * 0.2 * lognorm(0.4)
  }
  income = Math.round(income / 10) * 10

  // family --------------------------------------------------------------------
  let marital: Person["marital"] = "Single"
  if (age >= 18) {
    const r = rng()
    const pMarried = age < 25 ? 0.12 + 0.4 * (1 - wealth) : age < 35 ? 0.62 - 0.15 * wealth : age < 65 ? 0.72 : 0.55
    if (r < pMarried) marital = "Married"
    else if (age >= 60 && r < pMarried + (gender === "Female" ? 0.3 : 0.12)) marital = "Widowed"
    else if (age >= 30 && r < pMarried + 0.06 + 0.1 * wealth) marital = "Divorced"
  }
  const children = marital !== "Single" && age >= 20 ? poisson(rng, c.fertility * clamp((age - 18) / 14, 0, 1.05)) : 0
  let household = 1 + (marital === "Married" ? 1 : 0) + (age < 58 ? children : Math.min(children, poisson(rng, 0.4)))
  if (age < 18 || (marital === "Single" && age < 30 && rng() < 0.9 - wealth * 0.6)) household += 2 + poisson(rng, 2.5 * (1 - wealth))
  household += poisson(rng, 1.4 * (1 - wealth) * (urban ? 0.6 : 1))

  // hobbies -------------------------------------------------------------------
  const partial: Partial<Person> = { age, education, internet, wealth }
  const hobbyPool = HOBBIES.filter((h) => h.needs(partial)).map((h) => h.h)
  const hobbies: string[] = []
  while (hobbies.length < 2) {
    const h = pick(rng, hobbyPool)
    if (!hobbies.includes(h)) hobbies.push(h)
  }

  // daily rhythm --------------------------------------------------------------
  const lateCulture = c.region === "MENA" || c.region === "LAC" || c.name === "Spain" || c.name === "Italy" || c.name === "Greece"
  let wake = 6.3 + normal(rng) * 0.6 - (1 - wealth) * 0.5
  let bed = 22.6 + normal(rng) * 0.6 + (lateCulture ? 0.6 : 0) + (age < 30 && age >= 16 ? 0.6 : 0) - (age > 65 ? 0.6 : 0)
  if (occupation?.sector === "Agriculture") wake -= 0.9
  if (religion === "Islam" && devout) wake = Math.min(wake, 4.6 + rng() * 0.3)
  if (age < 12) {
    wake = 6.6 + rng() * 0.8
    bed = 20 + rng() * 1.2 + (lateCulture ? 0.7 : 0)
  }
  wake = clamp(wake, 4.2, 9)
  bed = clamp(bed, 20, 23.9)

  let workStart = 8.5 + normal(rng) * 0.5
  let workEnd = workStart + 8.5 + rng() * 1.5
  if (occupation?.sector === "Agriculture") {
    workStart = Math.max(wake + 0.8, 5.8)
    workEnd = 17 + rng()
  } else if (occupation && (occupation.place === "shop" || occupation.title === "Street vendor" || occupation.title === "Market trader")) {
    workStart = 8 + rng() * 2
    workEnd = workStart + 9 + rng() * 2
  }
  workEnd = Math.min(workEnd, bed - 2)

  // places (all on land: around coastal cities a random spot is often in the sea) ---
  let work: LatLon = home
  if (occupation) {
    if (occupation.place === "field") work = onLandOr(c, home, () => ring(rng, home, 0.01, 0.03))
    else if (occupation.place !== "home") {
      work = onLandOr(c, home, () => {
        const w = urban ? jitter(rng, center, 0.025) : jitter(rng, center, 0.05)
        return degDistance(w, home) > 0.6 ? ring(rng, home, 0.04, 0.15) : w
      })
    }
  }
  const third = onLandOr(c, home, () => ring(rng, home, 0.01, 0.045))
  const worship = onLandOr(c, home, () => ring(rng, home, 0.004, 0.015))
  let school = onLandOr(c, home, () => ring(rng, home, 0.005, 0.02))
  if (role === "Student") {
    school = onLandOr(c, home, () => {
      const u = jitter(rng, center, 0.03)
      return degDistance(u, home) > 0.6 ? ring(rng, home, 0.05, 0.15) : u
    })
  }
  const commuteTarget = role === "Student" || role === "Pupil" ? school : work
  const commute = clamp(0.15 + degDistance(home, commuteTarget) * 3.5 * (inCity && city.pop > 2 ? 1.4 : 1), 0.15, 1.6)

  const person: Person = {
    id, represents: 0, detail: false, name, gender, age, country: c, city, inCity, urban, immigrant, origin, motherTongue, otherLanguages,
    religion, devout, education, educationNote, role, occupation, nightShift, income,
    marital, children, household, internet, hobbies, wealth,
    wake, bed, workStart, workEnd, workDays: wealth > 0.55 ? 5 : 6, commute, phase: rng() * 1000,
    home, work, third, worship, school, politics: null,
  }
  if (!calibrating) person.politics = assignPolitics(c, traitsOf(person), rng, () => calibrationSample(c))
  return person
}

function traitsOf(p: Person): PoliticalTraits {
  return {
    age: p.age, gender: p.gender, urban: p.urban, education: p.education, devout: p.devout,
    unaffiliated: p.religion === "Unaffiliated", immigrant: p.immigrant, relIncome: p.income / p.country.medianIncome,
    minority: isMinorityFaith(p),
  }
}

/** Religious minority: not the country's largest faith (ignoring the unaffiliated) */
function isMinorityFaith(p: Person) {
  if (p.religion === "Unaffiliated") return false
  const shares = p.country.religion
  let top = 0
  for (let i = 1; i < shares.length; i++) if (RELIGIONS[i] !== "Unaffiliated" && shares[i] > shares[top]) top = i
  return RELIGIONS[top] !== p.religion
}

let calibrating = false
/** Adults of one country, used once to fit party weights to the official vote shares */
function calibrationSample(c: Country): PoliticalTraits[] {
  calibrating = true
  try {
    const rng = mulberry32(hashSeed(4242, Math.round(c.population * 1000), 7))
    const out: PoliticalTraits[] = []
    for (let k = 0; out.length < 500 && k < 3000; k++) {
      const p = makePerson(-1, c, rng)
      if (p.age >= 18) out.push(traitsOf(p))
    }
    return out
  } finally {
    calibrating = false
  }
}

export { EDUCATION_LEVELS }

/** A random rural spot in a country, spread around its centres like rural homes are. */
export function randomRuralSpot(c: Country, rng: Rng): LatLon {
  snapCentresToLand()
  const geo = GEO.get(c.name)!
  const city = c.centres[pickCumulative(rng, centreModel(c).bySpread)]
  const center: LatLon = [city.lat, city.lon]
  for (let i = 0; i < 40; i++) {
    const cand = jitter(rng, center, geo.spread)
    if (inside(geo, cand[0], cand[1])) return cand
  }
  return jitter(rng, center, 0.2)
}

/** Is this point on land in one of the modelled countries? */
export function onLand(lat: number, lon: number) {
  if (grid === undefined) grid = buildGrid()
  if (grid) {
    const x = Math.floor(((lon + 180) / 360) * GRID_W)
    const y = Math.floor(((90 - lat) / 180) * GRID_H)
    if (x >= 0 && x < GRID_W && y >= 0 && y < GRID_H) {
      const i = y * GRID_W + x
      if (!grid.edge[i]) return grid.owner[i] > 0
    }
  }
  for (const geo of GEO.values()) {
    const [[w, s], [e, n]] = geo.bounds
    if (lat < s || lat > n) continue
    if (w <= e ? lon < w || lon > e : lon < w && lon > e) continue
    if (inside(geo, lat, lon)) return true
  }
  return false
}
