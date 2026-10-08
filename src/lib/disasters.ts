/**
 * Live natural-disaster feeds, fetched straight from the public APIs (all send CORS headers):
 * - USGS: earthquakes of magnitude 4.5+ in the last 30 days
 * - GDACS (UN / EU Joint Research Centre): tropical cyclones, floods, droughts, wildfires and
 *   volcanoes with impact alert levels
 * - NASA EONET: storm and iceberg tracks, wildfires and volcanoes
 */

import { makeRegion, regionMass } from "@/lib/sim/region"

export const DISASTER_KINDS = ["Earthquake", "Tropical cyclone", "Flood", "Wildfire", "Volcano", "Drought", "Severe storm", "Iceberg"] as const
export type DisasterKind = (typeof DISASTER_KINDS)[number]

/** Impact alert level (GDACS; USGS PAGER "yellow" maps to Orange) */
export type AlertLevel = "Green" | "Orange" | "Red"

export interface Disaster {
  id: string
  kind: DisasterKind
  title: string
  lat: number
  lon: number
  /** ms since epoch */
  start: number
  updated: number
  alert: AlertLevel | null
  magnitude?: number
  /** human-readable intensity, e.g. "Tropical Storm (maximum wind speed of 176 km/h)" */
  severity?: string
  depthKm?: number
  tsunami?: boolean
  country?: string
  /** [lat, lon] oldest → newest */
  track?: [number, number][]
  url?: string
  sources: string[]
  /** radius used for "people living nearby" */
  impactKm: number
  notable: boolean
}

export interface SourceStatus {
  name: string
  ok: boolean
  count: number
  error?: string
}

export interface DisasterFeed {
  events: Disaster[]
  sources: SourceStatus[]
  fetchedAt: number
}

const DAY = 86_400_000
const ALERT_RANK: Record<AlertLevel, number> = { Green: 0, Orange: 1, Red: 2 }

/** Rough radius of strong (MMI VI+) shaking for a shallow earthquake */
export function quakeRadiusKm(m: number) {
  return Math.pow(10, 0.43 * m - 1.15)
}

const IMPACT_KM: Record<DisasterKind, number> = {
  Earthquake: 30, "Tropical cyclone": 150, Flood: 100, Wildfire: 30, Volcano: 30, Drought: 400, "Severe storm": 150, Iceberg: 0,
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal, cache: "no-store" })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as T
}

// --- USGS --------------------------------------------------------------------

interface UsgsFeature {
  id: string
  properties: { mag: number; place: string | null; time: number; updated: number; url: string; alert: string | null; tsunami: number; title: string; type: string }
  geometry: { coordinates: [number, number, number] }
}

async function fetchUsgs(signal?: AbortSignal): Promise<Disaster[]> {
  const data = await getJson<{ features: UsgsFeature[] }>(
    "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.geojson",
    signal,
  )
  return data.features
    .filter((f) => f.properties.type === "earthquake" && f.properties.mag != null)
    .map((f) => {
      const p = f.properties
      const [lon, lat, depth] = f.geometry.coordinates
      const a = p.alert
      const alert: AlertLevel | null = a === "red" ? "Red" : a === "orange" || a === "yellow" ? "Orange" : a === "green" ? "Green" : null
      return {
        id: `usgs-${f.id}`,
        kind: "Earthquake" as const,
        title: p.place ? `M ${p.mag.toFixed(1)} · ${p.place}` : p.title,
        lat, lon, start: p.time, updated: p.updated, alert,
        magnitude: p.mag,
        depthKm: depth,
        tsunami: p.tsunami === 1,
        severity: `Magnitude ${p.mag.toFixed(1)}, ${Math.round(depth)} km deep`,
        url: p.url,
        sources: ["USGS"],
        impactKm: Math.round(quakeRadiusKm(p.mag)),
        notable: p.mag >= 6 || (alert != null && alert !== "Green") || p.tsunami === 1,
      }
    })
}

// --- GDACS -------------------------------------------------------------------

interface GdacsFeature {
  geometry: { type: string; coordinates: [number, number] }
  properties: {
    eventtype: string; eventid: number; episodeid: number; name: string; eventname: string; alertlevel: string
    iscurrent: string; country: string; fromdate: string; todate: string; datemodified: string
    url: { report: string }; severitydata?: { severity: number; severitytext: string; severityunit: string }
  }
}

const GDACS_KIND: Record<string, DisasterKind> = { TC: "Tropical cyclone", FL: "Flood", VO: "Volcano", DR: "Drought", WF: "Wildfire" }

const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10)
const utc = (s: string) => Date.parse(s.endsWith("Z") ? s : `${s}Z`)

async function fetchGdacs(signal?: AbortSignal): Promise<Disaster[]> {
  const now = Date.now()
  // the API returns at most 100 events per query, so ask per type
  const lists = await Promise.all(
    Object.keys(GDACS_KIND).map((type) =>
      getJson<{ features: GdacsFeature[] }>(
        `https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=${type}&fromDate=${isoDay(now - 45 * DAY)}&toDate=${isoDay(now + DAY)}&alertlevel=green;orange;red`,
        signal,
      ).catch(() => ({ features: [] as GdacsFeature[] })),
    ),
  )
  const out: Disaster[] = []
  for (const f of lists.flatMap((l) => l.features ?? [])) {
    const p = f.properties
    const kind = GDACS_KIND[p.eventtype]
    if (!kind || f.geometry?.type !== "Point") continue
    const end = utc(p.todate)
    if (p.iscurrent !== "true" && now - end > 7 * DAY) continue
    const alert = (["Green", "Orange", "Red"] as const).find((a) => a === p.alertlevel) ?? null
    const sev = p.severitydata?.severitytext?.trim()
    out.push({
      id: `gdacs-${p.eventtype}-${p.eventid}`,
      kind,
      title: kind === "Tropical cyclone" && p.eventname ? `Tropical cyclone ${titleCase(p.eventname.replace(/-\d+$/, ""))}` : shortTitle(kind, p.name, p.country),
      lat: f.geometry.coordinates[1],
      lon: f.geometry.coordinates[0],
      start: utc(p.fromdate),
      updated: utc(p.datemodified || p.todate),
      alert,
      severity: sev && !/^Magnitude 0\b/.test(sev) ? sev : undefined,
      country: p.country || undefined,
      url: p.url?.report,
      sources: ["GDACS"],
      impactKm: IMPACT_KM[kind],
      notable: (alert != null && alert !== "Green") || kind === "Tropical cyclone" || kind === "Volcano",
    })
  }
  return out
}

// --- NASA EONET ----------------------------------------------------------------

interface EonetEvent {
  id: string
  title: string
  link: string
  categories: { id: string; title: string }[]
  sources: { id: string; url: string }[]
  geometry: { date: string; type: string; coordinates: unknown; magnitudeValue?: number | null; magnitudeUnit?: string | null }[]
}

function eonetKind(e: EonetEvent): DisasterKind | null {
  const cat = e.categories[0]?.id
  if (cat === "severeStorms") return /hurricane|typhoon|cyclone|tropical|depression/i.test(e.title) ? "Tropical cyclone" : "Severe storm"
  if (cat === "wildfires") return "Wildfire"
  if (cat === "volcanoes") return "Volcano"
  if (cat === "seaLakeIce") return "Iceberg"
  if (cat === "floods") return "Flood"
  if (cat === "drought") return "Drought"
  return null
}

function pointOf(g: EonetEvent["geometry"][number]): [number, number] | null {
  if (g.type === "Point") {
    const [lon, lat] = g.coordinates as [number, number]
    return [lat, lon]
  }
  if (g.type === "Polygon") {
    const ring = (g.coordinates as [number, number][][])[0]
    if (!ring?.length) return null
    const lat = ring.reduce((s, p) => s + p[1], 0) / ring.length
    const lon = ring.reduce((s, p) => s + p[0], 0) / ring.length
    return [lat, lon]
  }
  return null
}

async function fetchEonet(signal?: AbortSignal): Promise<Disaster[]> {
  const data = await getJson<{ events: EonetEvent[] }>("https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=30", signal)
  const out: Disaster[] = []
  for (const e of data.events) {
    const kind = eonetKind(e)
    if (!kind) continue
    const pts = e.geometry.map(pointOf).filter((p): p is [number, number] => !!p)
    if (!pts.length) continue
    const lastG = e.geometry[e.geometry.length - 1]
    const [lat, lon] = pts[pts.length - 1]
    const mag = lastG.magnitudeValue
    let severity: string | undefined
    if (mag != null && lastG.magnitudeUnit === "kts") severity = `Winds ${Math.round(mag * 1.852)} km/h`
    else if (mag != null && lastG.magnitudeUnit === "NM^2") severity = `${Math.round(mag * 3.43).toLocaleString("en-US")} km²`
    else if (mag != null && lastG.magnitudeUnit === "acres") severity = `${Math.round(mag * 0.004047).toLocaleString("en-US")} km² burned`
    out.push({
      id: `eonet-${e.id}`,
      kind,
      title: e.title.replace(/,\s*$/, ""),
      lat, lon,
      start: Date.parse(e.geometry[0].date),
      updated: Date.parse(lastG.date),
      alert: null,
      severity,
      track: pts.length > 1 ? pts : undefined,
      url: e.sources[0]?.url ?? e.link,
      sources: ["NASA EONET"],
      impactKm: IMPACT_KM[kind],
      notable: kind === "Tropical cyclone" || kind === "Volcano",
    })
  }
  return out
}

// --- Merge ---------------------------------------------------------------------

/** "Drought in Austria, Belgium, … (30 countries)" → "Drought in Austria, Belgium + 28 more" */
function shortTitle(kind: DisasterKind, name: string, countries: string) {
  const list = (countries || "").split(",").map((c) => c.trim()).filter(Boolean)
  if (list.length <= 2) return name
  return `${kind} in ${list.slice(0, 2).join(", ")} + ${list.length - 2} more`
}

function titleCase(s: string) {
  return s.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (m) => m.toUpperCase())
}

function km(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = Math.PI / 180
  const d = Math.sin(a.lat * R) * Math.sin(b.lat * R) + Math.cos(a.lat * R) * Math.cos(b.lat * R) * Math.cos((a.lon - b.lon) * R)
  return Math.acos(Math.max(-1, Math.min(1, d))) * 6371
}

/** Storms reported by both GDACS and EONET become one event with GDACS's alert and EONET's track. */
function merge(gdacs: Disaster[], eonet: Disaster[]): Disaster[] {
  const out = [...gdacs]
  for (const e of eonet) {
    const twin = out.find((g) => {
      if (g.sources.includes("NASA EONET")) return false
      if (e.kind === "Tropical cyclone" && g.kind === "Tropical cyclone") {
        const name = g.title.replace(/^Tropical cyclone /, "").toUpperCase()
        return e.title.toUpperCase().includes(name)
      }
      return g.kind === e.kind && km(g, e) < 40
    })
    if (!twin) {
      out.push(e)
      continue
    }
    twin.sources.push("NASA EONET")
    if (e.track) twin.track = e.track
    if (e.kind === "Tropical cyclone") {
      twin.title = e.title
      if (e.updated >= twin.updated) {
        twin.lat = e.lat
        twin.lon = e.lon
      }
    }
    twin.severity ??= e.severity
  }
  return out
}

export async function fetchDisasters(signal?: AbortSignal): Promise<DisasterFeed> {
  const runs = await Promise.allSettled([fetchUsgs(signal), fetchGdacs(signal), fetchEonet(signal)])
  const names = ["USGS earthquakes", "GDACS alerts", "NASA EONET"]
  const [usgs, gdacs, eonet] = runs.map((r) => (r.status === "fulfilled" ? r.value : []))
  const events = [...usgs, ...merge(gdacs, eonet)]
  return {
    events,
    fetchedAt: Date.now(),
    sources: runs.map((r, i) => ({
      name: names[i],
      ok: r.status === "fulfilled",
      count: r.status === "fulfilled" ? r.value.length : 0,
      error: r.status === "rejected" ? String((r.reason as Error)?.message ?? r.reason) : undefined,
    })),
  }
}

/** Most severe first: alert level, then notable, then magnitude, then recency */
export function bySeverity(a: Disaster, b: Disaster) {
  const ra = a.alert ? ALERT_RANK[a.alert] : -1
  const rb = b.alert ? ALERT_RANK[b.alert] : -1
  if (ra !== rb) return rb - ra
  if (a.notable !== b.notable) return a.notable ? -1 : 1
  if ((a.magnitude ?? 0) !== (b.magnitude ?? 0)) return (b.magnitude ?? 0) - (a.magnitude ?? 0)
  return b.updated - a.updated
}

/** Modelled number of people (millions) living within the event's impact radius */
export function peopleNearby(d: Disaster) {
  if (!d.impactKm) return 0
  return regionMass(makeRegion(d.lat, d.lon, d.impactKm / 111.2)).total
}
