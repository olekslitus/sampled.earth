import { COUNTRIES, type Centre, type Country } from "./countries"
import {
  centreModel, cityHomeOk, degDistance, insideCountry, jitter, outsideDist, ruralSigma, snapCentresToLand, townSigma,
  type LatLon, type Placement,
} from "./population"
import { mulberry32, normal, type Rng } from "./rng"
import { latLonToXYZ } from "./sphere"

const RAD = Math.PI / 180

/** A spherical cap on the globe: everything within `radius` degrees of the centre. */
export interface Region {
  lat: number
  lon: number
  radius: number
  x: number
  y: number
  z: number
  cos: number
  /** centre as a three.js world-space unit vector (see sphere.ts) */
  t: [number, number, number]
}

export function makeRegion(lat: number, lon: number, radius: number): Region {
  const cl = Math.cos(lat * RAD)
  return {
    lat, lon, radius,
    x: cl * Math.cos(lon * RAD),
    y: cl * Math.sin(lon * RAD),
    z: Math.sin(lat * RAD),
    cos: Math.cos(Math.min(180, radius) * RAD),
    t: (() => {
      const v = [0, 0, 0]
      latLonToXYZ(lat, lon, 1, v)
      return v as [number, number, number]
    })(),
  }
}

export function inRegion(r: Region, lat: number, lon: number) {
  const cl = Math.cos(lat * RAD)
  return cl * Math.cos(lon * RAD) * r.x + cl * Math.sin(lon * RAD) * r.y + Math.sin(lat * RAD) * r.z >= r.cos
}

/** Great-circle distance in degrees */
export function angularDistance(aLat: number, aLon: number, bLat: number, bLon: number) {
  const a = makeRegion(aLat, aLon, 0)
  const cb = Math.cos(bLat * RAD)
  const d = cb * Math.cos(bLon * RAD) * a.x + cb * Math.sin(bLon * RAD) * a.y + Math.sin(bLat * RAD) * a.z
  return Math.acos(Math.max(-1, Math.min(1, d))) / RAD
}

export function regionContains(outer: Region, inner: Region) {
  return angularDistance(outer.lat, outer.lon, inner.lat, inner.lon) + inner.radius <= outer.radius
}

// ---------------------------------------------------------------------------
// Population mass model: every urban centre is three Gaussian blobs (the centre itself, the
// towns around it and the countryside around it), weighted as in population.ts.

const MC = (() => {
  const rng = mulberry32(77)
  return Array.from({ length: 64 }, () => [normal(rng), normal(rng)] as const)
})()

/** Fraction of an isotropic 2D Gaussian (σ) centred D away that falls within radius R. */
function capFraction(sigma: number, D: number, R: number) {
  if (D > R + 4 * sigma) return 0
  if (D + 4 * sigma <= R) return 1
  if (R < 0.4 * sigma) return Math.min(1, ((R * R) / (2 * sigma * sigma)) * Math.exp(-(D * D) / (2 * sigma * sigma)))
  let n = 0
  for (const [a, b] of MC) {
    const x = D + a * sigma
    const y = b * sigma
    if (x * x + y * y <= R * R) n++
  }
  return n / MC.length
}

export interface Source {
  country: Country
  city: Centre
  /** chance that someone from this source counts as urban */
  urban: number
  /** placed like rural homes: spread wide, on land, outside the built-up area */
  spread: boolean
  sigma: number
  /** millions of people from this source inside the region */
  mass: number
}

export interface RegionMass {
  sources: Source[]
  /** cumulative masses for weighted sampling */
  cumulative: Float64Array
  /** millions of people in the region */
  total: number
}

export function regionMass(r: Region, exclude?: Region | null): RegionMass {
  snapCentresToLand()
  const sources: Source[] = []
  for (const c of COUNTRIES) {
    const m = centreModel(c)
    const totalPop = m.byPop[m.byPop.length - 1]
    const totalSpread = m.bySpread[m.bySpread.length - 1]
    const rs = ruralSigma(c)
    const ts = townSigma(c)
    for (const city of c.centres) {
      const D = angularDistance(r.lat, r.lon, city.lat, city.lon)
      if (D > r.radius + 4 * Math.max(rs, outsideDist(city))) continue
      const inCity = (c.population * m.inside * city.pop) / totalPop
      const around = (c.population * (1 - m.inside) * Math.sqrt(city.pop)) / totalSpread
      const min = outsideDist(city)
      for (const [urban, spread, sigma, pop] of [
        [m.urbanInside, false, city.sigma, inCity],
        [1, true, Math.max(ts, min), around * m.urbanOutside],
        [0, true, Math.max(rs, min), around * (1 - m.urbanOutside)],
      ] as const) {
        let mass = pop * capFraction(sigma, D, r.radius)
        if (exclude && mass > 0) {
          const De = angularDistance(exclude.lat, exclude.lon, city.lat, city.lon)
          mass = Math.max(0, mass - pop * capFraction(sigma, De, exclude.radius))
        }
        if (mass > 1e-7) sources.push({ country: c, city, urban, spread, sigma, mass })
      }
    }
  }
  const cumulative = new Float64Array(sources.length)
  let total = 0
  sources.forEach((s, i) => {
    total += s.mass
    cumulative[i] = total
  })
  return { sources, cumulative, total }
}

function pickSource(rng: Rng, m: RegionMass): Source {
  const x = rng() * m.total
  let lo = 0
  let hi = m.cumulative.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (m.cumulative[mid] < x) lo = mid + 1
    else hi = mid
  }
  return m.sources[lo]
}

/** Choose where a new person lives inside `r` (and outside `exclude`), following the mass model. */
export function samplePlacement(rng: Rng, m: RegionMass, r: Region, exclude?: Region | null): (Placement & { country: Country }) | null {
  if (!m.sources.length) return null
  for (let attempt = 0; attempt < 24; attempt++) {
    const s = pickSource(rng, m)
    const center: LatLon = [s.city.lat, s.city.lon]
    const D = angularDistance(r.lat, r.lon, center[0], center[1])
    const dMin = Math.max(0, D - r.radius)
    for (let t = 0; t < 16; t++) {
      let home: LatLon
      if (s.sigma > r.radius) {
        // broad blob vs small region: sample the region uniformly, weight by the blob's density
        const rr = r.radius * Math.sqrt(rng())
        const a = rng() * Math.PI * 2
        home = [r.lat + rr * Math.sin(a), r.lon + (rr * Math.cos(a)) / Math.max(0.2, Math.cos(r.lat * RAD))]
        const d = degDistance(home, center)
        if (rng() > Math.exp(-(d * d - dMin * dMin) / (2 * s.sigma * s.sigma))) continue
      } else {
        home = jitter(rng, center, s.sigma)
      }
      if (!inRegion(r, home[0], home[1])) continue
      if (exclude && inRegion(exclude, home[0], home[1])) continue
      if (!s.spread && !cityHomeOk(s.country, home)) continue
      if (s.spread && (degDistance(home, center) < outsideDist(s.city) || !insideCountry(s.country, home[0], home[1]))) continue
      return { country: s.country, city: s.city, inCity: !s.spread, urban: rng() < s.urban, home }
    }
  }
  return null
}
