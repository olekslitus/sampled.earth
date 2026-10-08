/**
 * Daily refresh of the live space data in Vercel Blob:
 *
 *   space/tracks-*.json       paths of the probes, telescopes and visitors in TRACKED (JPL Horizons)
 *   space/exoplanets-*.json   every confirmed exoplanet with a known distance (NASA Exoplanet Archive)
 *   space/latest.json         where the newest of each are
 *
 * Horizons turns away parallel requests, so objects are fetched one after another (about a
 * minute in all).
 */
import { del, list, put } from "@vercel/blob"

import { TRACKED, type ExoSystem, type Samples, type SpaceIndex, type Track, type TrackedObject } from "./tracks"

const DAY = 86_400_000
const HORIZONS = "https://ssd.jpl.nasa.gov/api/horizons.api"
const LY_PER_PC = 3.26156

const MONTHS: Record<string, string> = { JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06", JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12" }

/** "A.D. 1977-SEP-05 14:10:00.0000" → ms */
function horizonsDate(s: string) {
  const m = /(\d{4})-([A-Z]{3})-(\d{2})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(s)
  if (!m) return NaN
  return Date.parse(`${m[1]}-${MONTHS[m[2]!]}-${m[3]}T${m[4] ?? "00"}:${m[5] ?? "00"}:${m[6] ?? "00"}Z`)
}

function horizonsTime(ms: number) {
  return new Date(ms).toISOString().slice(0, 16).replace("T", " ")
}

/** Vectors for one object between two instants, as equal steps; adjusts to the ephemeris' coverage. */
async function vectors(o: TrackedObject, start: number, stop: number, step: string, fine: boolean): Promise<{ samples: Samples; ends?: number } | null> {
  let ends: number | undefined
  for (let attempt = 0; attempt < 4; attempt++) {
    const params = new URLSearchParams({
      format: "text",
      COMMAND: `'${o.id}'`,
      OBJ_DATA: "NO",
      MAKE_EPHEM: "YES",
      EPHEM_TYPE: "VECTORS",
      CENTER: o.center === "sun" ? "500@10" : "500@399",
      START_TIME: `'${horizonsTime(start)}'`,
      STOP_TIME: `'${horizonsTime(stop)}'`,
      STEP_SIZE: `'${step}'`,
      VEC_TABLE: "1",
      REF_PLANE: "FRAME",
      OUT_UNITS: "AU-D",
      CSV_FORMAT: "YES",
    })
    const text = await fetch(`${HORIZONS}?${params}`).then((r) => r.text())
    const soe = text.indexOf("$$SOE")
    const eoe = text.indexOf("$$EOE")
    if (soe >= 0 && eoe > soe) {
      const p: number[] = []
      const times: number[] = []
      // ~1,500 km on whole paths, ~150 km near now; a hundred times finer around Earth
      const round = (o.center === "earth" ? 100 : 1) * (fine ? 1e6 : 1e5)
      for (const line of text.slice(soe + 5, eoe).trim().split("\n")) {
        const f = line.split(",")
        times.push((Number(f[0]) - 2440587.5) * DAY)
        // equatorial (ICRF) → sky frame: (x, z, −y)
        p.push(Math.round(Number(f[2]) * round) / round, Math.round(Number(f[4]) * round) / round, Math.round(-Number(f[3]) * round) / round)
      }
      if (times.length < 2) return null
      return { samples: { t0: Math.round(times[0]!), dt: Math.round(times[1]! - times[0]!), p }, ends }
    }
    // outside the ephemeris: retry within it
    const before = /No ephemeris for target .* prior to (A\.D\. [^\n]+)/.exec(text)
    const after = /No ephemeris for target .* after (A\.D\. [^\n]+)/.exec(text)
    if (before) start = horizonsDate(before[1]!) + 60_000
    else if (after) stop = ends = horizonsDate(after[1]!) - 60_000
    else throw new Error(`Horizons ${o.name}: ${text.slice(0, 300)}`)
    if (!(start < stop)) return null
  }
  return null
}

async function track(o: TrackedObject, now: number): Promise<Track | null> {
  const from = o.trailFrom ? Date.parse(o.trailFrom) : Date.parse(o.since) + DAY
  const to = o.trailTo ? Date.parse(o.trailTo) : now + 365 * DAY
  const path = await vectors(o, from, to, "1200", false)
  if (!path) return null
  // six-hourly for the weeks around now, so near-Earth spacecraft sit exactly right
  const near = (path.ends ?? Infinity) > now ? await vectors(o, now - 20 * DAY, now + 60 * DAY, "6 h", true) : null
  return { id: o.id, path: path.samples, near: near?.samples ?? { t0: 0, dt: 1, p: [] }, ends: path.ends }
}

async function exoplanets() {
  const query =
    "select pl_name,hostname,ra,dec,sy_dist,disc_year,disc_pubdate,discoverymethod,disc_facility,pl_rade,pl_bmasse,pl_eqt,pl_orbper from pscomppars"
  const res = await fetch(`https://exoplanetarchive.ipac.caltech.edu/TAP/sync?query=${encodeURIComponent(query)}&format=json`)
  if (!res.ok) throw new Error(`Exoplanet Archive ${res.status}`)
  const rows = (await res.json()) as Record<string, string | number | null>[]
  const systems = new Map<string, ExoSystem>()
  const num = (v: unknown, digits = 3) => (typeof v === "number" && Number.isFinite(v) ? Number(v.toPrecision(digits)) : null)
  for (const r of rows) {
    if (typeof r.sy_dist !== "number") continue
    const host = String(r.hostname)
    let s = systems.get(host)
    if (!s) systems.set(host, (s = { host, ra: Number(r.ra), dec: Number(r.dec), dist: Number((r.sy_dist * LY_PER_PC).toPrecision(5)), planets: [] }))
    s.planets.push({
      name: String(r.pl_name),
      year: Number(r.disc_year),
      published: String(r.disc_pubdate ?? r.disc_year),
      method: String(r.discoverymethod),
      facility: String(r.disc_facility),
      radius: num(r.pl_rade),
      mass: num(r.pl_bmasse),
      temp: num(r.pl_eqt),
      period: num(r.pl_orbper, 4),
    })
  }
  return { systems: [...systems.values()], count: rows.length }
}

const upload = (path: string, body: string, maxAge: number) =>
  put(path, body, { access: "public", addRandomSuffix: maxAge > 3600, allowOverwrite: true, contentType: "application/json", cacheControlMaxAge: maxAge })

/** Fetches every track and the exoplanet list, uploads them and returns the new index. */
export async function updateSpace(): Promise<SpaceIndex & { failed: string[] }> {
  const now = Date.now()
  const tracks: Track[] = []
  const failed: string[] = []
  for (const o of TRACKED) {
    try {
      const t = await track(o, now)
      if (t) tracks.push(t)
      else failed.push(o.name)
    } catch (e) {
      console.error(e)
      failed.push(o.name)
    }
  }
  const exo = await exoplanets()

  const [tracksBlob, exoBlob] = await Promise.all([
    upload("space/tracks.json", JSON.stringify(tracks), 31_536_000),
    upload("space/exoplanets.json", JSON.stringify(exo.systems), 31_536_000),
  ])
  const index: SpaceIndex = { tracks: tracksBlob.url, exoplanets: exoBlob.url, exoplanetCount: exo.count, updated: new Date(now).toISOString() }
  await upload("space/latest.json", JSON.stringify(index), 300)

  // keep the previous few days, then let them go
  const cutoff = now - 3 * DAY
  const old: string[] = []
  let cursor: string | undefined
  do {
    const page = await list({ prefix: "space/", cursor, limit: 1000 })
    for (const b of page.blobs) {
      const inUse = b.pathname === "space/latest.json" || b.url === index.tracks || b.url === index.exoplanets
      if (!inUse && b.uploadedAt.getTime() < cutoff) old.push(b.url)
    }
    cursor = page.hasMore ? page.cursor : undefined
  } while (cursor)
  if (old.length) await del(old)
  return { ...index, failed }
}
