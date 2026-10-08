/**
 * Spacecraft and small bodies tracked with JPL Horizons, and the exoplanet list from the
 * NASA Exoplanet Archive. build.ts refreshes both daily into Blob; the shapes here are
 * shared by the build and the browser.
 */

export type TrackKind = "probe" | "telescope" | "interstellar" | "asteroid"

export interface TrackedObject {
  /** Horizons COMMAND */
  id: string
  name: string
  kind: TrackKind
  agency: string
  /** launch or discovery, ISO date */
  since: string
  about: string
  url: string
  /** positions are relative to the Sun, or to Earth for spacecraft that stay near us */
  center: "sun" | "earth"
  /** how far back the drawn path goes (default: `since`) */
  trailFrom?: string
  /** and how far ahead (default: a year from now) */
  trailTo?: string
  /** draw only the last this-many days of the path (default: two years, half a year near Earth; 0: none) */
  trailDays?: number
}

/** What gets tracked, in the order the panel lists them */
export const TRACKED: TrackedObject[] = [
  { id: "-31", name: "Voyager 1", kind: "probe", trailDays: Infinity, agency: "NASA", since: "1977-09-05", center: "sun", url: "https://science.nasa.gov/mission/voyager/", about: "The farthest human-made object. It flew past Jupiter and Saturn, then crossed into interstellar space in 2012." },
  { id: "-32", name: "Voyager 2", kind: "probe", trailDays: Infinity, agency: "NASA", since: "1977-08-20", center: "sun", url: "https://science.nasa.gov/mission/voyager/", about: "The only spacecraft to visit Uranus and Neptune. It left the heliosphere in 2018." },
  { id: "-98", name: "New Horizons", kind: "probe", trailDays: Infinity, agency: "NASA", since: "2006-01-19", center: "sun", url: "https://science.nasa.gov/mission/new-horizons/", about: "Flew past Pluto in 2015 and the Kuiper Belt object Arrokoth in 2019, and is still heading out." },
  { id: "-23", name: "Pioneer 10", kind: "probe", trailDays: Infinity, agency: "NASA", since: "1972-03-03", center: "sun", url: "https://science.nasa.gov/mission/pioneer-10/", about: "The first spacecraft to cross the asteroid belt and visit Jupiter. Silent since 2003; its position is predicted." },
  { id: "-24", name: "Pioneer 11", kind: "probe", trailDays: Infinity, agency: "NASA", since: "1973-04-06", center: "sun", url: "https://science.nasa.gov/mission/pioneer-11/", about: "The first visitor to Saturn. Silent since 1995; its position is predicted." },
  { id: "-96", name: "Parker Solar Probe", kind: "probe", agency: "NASA", since: "2018-08-12", center: "sun", url: "https://science.nasa.gov/mission/parker-solar-probe/", about: "Dives through the Sun’s outer atmosphere. At its closest it passes 6.1 million km from the surface, the fastest object humans have built." },
  { id: "-144", name: "Solar Orbiter", kind: "probe", agency: "ESA / NASA", since: "2020-02-10", center: "sun", url: "https://www.esa.int/Science_Exploration/Space_Science/Solar_Orbiter", about: "Took the first images of the Sun’s poles, tilting its orbit with flybys of Venus." },
  { id: "-121", name: "BepiColombo", kind: "probe", agency: "ESA / JAXA", since: "2018-10-20", center: "sun", url: "https://www.esa.int/Science_Exploration/Space_Science/BepiColombo", about: "Two orbiters travelling together to Mercury." },
  { id: "-61", name: "Juno", kind: "probe", agency: "NASA", since: "2011-08-05", center: "sun", url: "https://science.nasa.gov/mission/juno/", about: "Has orbited Jupiter since 2016, mapping its interior, storms and moons." },
  { id: "-159", name: "Europa Clipper", kind: "probe", agency: "NASA", since: "2024-10-14", center: "sun", url: "https://science.nasa.gov/mission/europa-clipper/", about: "On its way to Jupiter’s moon Europa, which hides a salty ocean under its ice. Arrives in 2030." },
  { id: "-28", name: "JUICE", kind: "probe", agency: "ESA", since: "2023-04-14", center: "sun", url: "https://www.esa.int/Science_Exploration/Space_Science/Juice", about: "Heading for Jupiter’s icy moons Ganymede, Callisto and Europa, arriving in 2031." },
  { id: "-255", name: "Psyche", kind: "probe", agency: "NASA", since: "2023-10-13", center: "sun", url: "https://science.nasa.gov/mission/psyche/", about: "On its way to 16 Psyche, a metal-rich asteroid that may be the exposed core of a planetesimal." },
  { id: "-49", name: "Lucy", kind: "probe", agency: "NASA", since: "2021-10-16", center: "sun", url: "https://science.nasa.gov/mission/lucy/", about: "Touring the Trojan asteroids that share Jupiter’s orbit — fossils of planet formation." },
  { id: "-64", name: "OSIRIS-APEX", kind: "probe", agency: "NASA", since: "2016-09-08", center: "sun", url: "https://science.nasa.gov/mission/osiris-apex/", about: "Returned a sample of asteroid Bennu in 2023 as OSIRIS-REx; now heading for Apophis, which passes close to Earth in 2029." },
  { id: "-91", name: "Hera", kind: "probe", agency: "ESA", since: "2024-10-07", center: "sun", url: "https://www.esa.int/Space_Safety/Hera", about: "Going to inspect the asteroid pair Didymos and Dimorphos, which NASA’s DART knocked off course in 2022." },
  { id: "-37", name: "Hayabusa2", kind: "probe", agency: "JAXA", since: "2014-12-03", center: "sun", url: "https://www.hayabusa2.jaxa.jp/en/", about: "Brought back samples of asteroid Ryugu in 2020 and is now on an extended mission to two more asteroids." },
  { id: "-74", name: "Mars Reconnaissance Orbiter", kind: "probe", agency: "NASA", since: "2005-08-12", center: "sun", url: "https://science.nasa.gov/mission/mars-reconnaissance-orbiter/", about: "Has photographed Mars in fine detail since 2006 and relays data from the rovers." },
  { id: "-170", name: "James Webb Space Telescope", kind: "telescope", agency: "NASA / ESA / CSA", since: "2021-12-25", center: "earth", url: "https://science.nasa.gov/mission/webb/", about: "The largest space telescope, orbiting the Sun–Earth L2 point 1.5 million km away. Sees the first galaxies in infrared." },
  { id: "-680", name: "Euclid", kind: "telescope", agency: "ESA", since: "2023-07-01", center: "earth", url: "https://www.esa.int/Science_Exploration/Space_Science/Euclid", about: "Surveying more than a billion galaxies from L2 to chart dark matter and dark energy." },
  { id: "-21", name: "SOHO", kind: "telescope", agency: "ESA / NASA", since: "1995-12-02", center: "earth", url: "https://science.nasa.gov/mission/soho/", about: "Has watched the Sun from the L1 point since 1996 and found more than 5,000 comets." },
  { id: "-43", name: "IMAP", kind: "telescope", agency: "NASA", since: "2025-09-24", center: "earth", url: "https://science.nasa.gov/mission/imap/", about: "Maps the edge of the heliosphere from L1 and gives early warning of solar wind." },
  { id: "-85", name: "Lunar Reconnaissance Orbiter", kind: "probe", agency: "NASA", since: "2009-06-18", center: "earth", trailDays: 0, url: "https://science.nasa.gov/mission/lro/", about: "Has mapped the Moon from orbit since 2009, including future landing sites." },
  { id: "1I;", name: "ʻOumuamua", kind: "interstellar", agency: "Pan-STARRS", since: "2017-10-19", center: "sun", trailFrom: "2000-01-01", trailTo: "2040-01-01", url: "https://science.nasa.gov/solar-system/comets/oumuamua/", about: "The first object seen passing through the Solar System from another star." },
  { id: "2I;", name: "2I/Borisov", kind: "interstellar", agency: "Gennadiy Borisov", since: "2019-08-30", center: "sun", trailFrom: "2005-01-01", trailTo: "2040-01-01", url: "https://science.nasa.gov/solar-system/comets/2i-borisov/", about: "The first comet known to come from another planetary system." },
  { id: "3I;", name: "3I/ATLAS", kind: "interstellar", agency: "ATLAS", since: "2025-07-01", center: "sun", trailFrom: "2015-01-01", trailTo: "2040-01-01", url: "https://science.nasa.gov/solar-system/comets/3i-atlas/", about: "The third interstellar visitor, discovered in July 2025. It is leaving the Solar System, never to return." },
  { id: "DES=2024 YR4;", name: "2024 YR4", kind: "asteroid", agency: "ATLAS", since: "2024-12-27", center: "sun", trailFrom: "2024-01-01", trailTo: "2033-01-01", url: "https://science.nasa.gov/solar-system/asteroids/2024-yr4/", about: "Briefly the riskiest asteroid ever found. An Earth impact in 2032 has been ruled out; there is a small chance it hits the Moon." },
]

/** Positions sampled at equal steps: x, y, z in AU in the sky frame */
export interface Samples {
  /** first sample, ms since epoch */
  t0: number
  /** step, ms */
  dt: number
  p: number[]
}

export interface Track {
  id: string
  /** whole path (coarse) and the weeks around the build time (fine) */
  path: Samples
  near: Samples
  /** when Horizons' ephemeris runs out (ms), if before the end of the path */
  ends?: number
}

export interface Exoplanet {
  name: string
  year: number
  /** "2026-07" */
  published: string
  method: string
  facility: string
  /** Earth radii / masses, kelvin, days (null when unknown) */
  radius: number | null
  mass: number | null
  temp: number | null
  period: number | null
}

export interface ExoSystem {
  host: string
  ra: number
  dec: number
  /** light-years */
  dist: number
  planets: Exoplanet[]
}

/** What space/latest.json in Blob points to */
export interface SpaceIndex {
  tracks: string
  exoplanets: string
  /** exoplanets in the archive, including those without a distance */
  exoplanetCount: number
  updated: string
}

/** Position at time `ms` (AU, sky frame), or false outside the samples */
export function sampleAt(s: Samples, ms: number, out: number[]) {
  const n = s.p.length / 3
  const f = (ms - s.t0) / s.dt
  if (f < 0 || f > n - 1) return false
  const i = Math.min(n - 2, Math.floor(f))
  const k = f - i
  for (let c = 0; c < 3; c++) out[c] = s.p[i * 3 + c]! * (1 - k) + s.p[(i + 1) * 3 + c]! * k
  return true
}

/** Best known position: the fine samples when they cover `ms`, otherwise the whole path */
export function trackPosition(t: Track, ms: number, out: number[]) {
  if (sampleAt(t.near, ms, out)) return true
  return sampleAt(t.path, Math.min(ms, t.ends ?? Infinity), out)
}
