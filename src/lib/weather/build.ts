/**
 * Builds the live weather layers from geostationary satellites and NASA IMERG, and stores
 * them in Vercel Blob for the globe:
 *
 *   weather/{stamp}/clouds.webp   cloud density in grey, satellite coverage in alpha
 *   weather/{stamp}/precip.webp   rain intensity in red, snow intensity in green
 *   weather/latest.json           where the newest images are, and when they were taken
 *
 * Clouds come from the infrared (≈10.5 µm) channel of the five geostationary weather
 * satellites that ring the equator, fetched for one shared time from NASA GIBS (GOES-West,
 * GOES-East, Himawari) and EUMETSAT (Meteosat 0° and Indian Ocean). Cold cloud tops read
 * as cloud; each pixel is blended from the satellites that see it best.
 * Precipitation is NASA GPM IMERG (30-minute, early run, a few hours behind real time),
 * whose GIBS colours distinguish rain from snow.
 *
 * Runs on a Vercel cron (src/app/api/weather/route.ts) and from scripts/update-weather.ts.
 */
import { del, list, put } from "@vercel/blob"
import sharp from "sharp"

import { BLOB_URL } from "@/lib/blob"
import type { WeatherIndex } from "./live"

export const WEATHER_W = 2048
export const WEATHER_H = 1024
const BBOX = "-90,-180,90,180"
const GIBS_WMS = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi"
const EUMETSAT_WMS = "https://view.eumetsat.int/geoserver/wms"

interface Satellite {
  name: string
  /** sub-satellite longitude */
  lon: number
  source: "gibs" | "eumetsat"
  layer: string
}

const SATELLITES: Satellite[] = [
  { name: "GOES-West", lon: -137.2, source: "gibs", layer: "GOES-West_ABI_Band13_Clean_Infrared" },
  { name: "GOES-East", lon: -75.2, source: "gibs", layer: "GOES-East_ABI_Band13_Clean_Infrared" },
  { name: "Meteosat 0°", lon: 0, source: "eumetsat", layer: "msg_fes:ir108" },
  { name: "Meteosat IODC", lon: 45.5, source: "eumetsat", layer: "msg_iodc:ir108" },
  { name: "Himawari", lon: 140.7, source: "gibs", layer: "Himawari_AHI_Band13_Clean_Infrared" },
]


async function fetchOk(url: string, init?: RequestInit) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res
}

/** Newest time GIBS has for a layer, from the tile server's layer-time-actual header */
async function gibsLatest(layer: string, matrixSet: string): Promise<Date> {
  const res = await fetchOk(`https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/${layer}/default/default/${matrixSet}/0/0/0.png`)
  const t = res.headers.get("layer-time-actual")
  if (!t) throw new Error(`no time for ${layer}`)
  return new Date(t)
}

/** RGBA pixels of a whole-globe WMS image */
async function wmsImage(url: string): Promise<Uint8Array> {
  const buf = Buffer.from(await (await fetchOk(url)).arrayBuffer())
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  if (info.width !== WEATHER_W || info.height !== WEATHER_H) throw new Error(`unexpected size ${info.width}×${info.height} from ${url}`)
  return data
}

function gibsUrl(layer: string, time: string) {
  return `${GIBS_WMS}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=${layer}&CRS=EPSG:4326&BBOX=${BBOX}&WIDTH=${WEATHER_W}&HEIGHT=${WEATHER_H}&FORMAT=image/png&TRANSPARENT=true&TIME=${time}`
}
function eumetsatUrl(layer: string, time: string) {
  return `${EUMETSAT_WMS}?service=WMS&version=1.3.0&request=GetMap&layers=${layer}&styles=&crs=EPSG:4326&bbox=${BBOX}&width=${WEATHER_W}&height=${WEATHER_H}&format=image/png&transparent=true&time=${time}`
}

/** Colour → data value for a GIBS colormap, grouped by its <ColorMap title> */
async function gibsColormap(name: string): Promise<Map<string, Map<number, number>>> {
  const xml = await (await fetchOk(`https://gibs.earthdata.nasa.gov/colormaps/v1.3/${name}.xml`)).text()
  const maps = new Map<string, Map<number, number>>()
  for (const m of xml.matchAll(/<ColorMap(\s[^>]*)?>([\s\S]*?)<\/ColorMap>/g)) {
    const title = /title="([^"]*)"/.exec(m[1] ?? "")?.[1] ?? ""
    const lut = new Map<number, number>()
    for (const e of m[2]!.matchAll(/<ColorMapEntry rgb="(\d+),(\d+),(\d+)" transparent="false" sourceValue="[([]([^,]+),([^)\]]+)[)\]]"/g)) {
      const lo = Number(e[4]!.replace("-INF", "NaN"))
      const hi = Number(e[5]!.replace("+INF", "NaN"))
      const value = Number.isNaN(lo) ? hi : Number.isNaN(hi) ? lo : (lo + hi) / 2
      lut.set((+e[1]! << 16) | (+e[2]! << 8) | +e[3]!, value)
    }
    maps.set(title, lut)
  }
  return maps
}

/** Looks a colour up in a colormap, falling back to the nearest entry (WMS resampling can blend) */
function lookup(lut: Map<number, number>, entries: [number, number][], cache: Map<number, number>, rgb: number) {
  const hit = lut.get(rgb) ?? cache.get(rgb)
  if (hit !== undefined) return hit
  const r = rgb >> 16, g = (rgb >> 8) & 255, b = rgb & 255
  let best = 0
  let bestD = Infinity
  for (const [c, v] of entries) {
    const d = (r - (c >> 16)) ** 2 + (g - ((c >> 8) & 255)) ** 2 + (b - (c & 255)) ** 2
    if (d < bestD) {
      bestD = d
      best = v
    }
  }
  cache.set(rgb, best)
  return best
}

const isGrey = (rgb: number) => rgb >> 16 === ((rgb >> 8) & 255) && rgb >> 16 === (rgb & 255)

/**
 * Temperature for every grey level of the GIBS infrared table. Greys run from black (hot)
 * to light grey (about −20 °C), where colours take over; a few greys are reused for the
 * very coldest tops, so only the warm ramp is used, interpolated between its entries.
 */
function greyRamp(lut: Map<number, number>): Float32Array {
  const points = [...lut]
    .filter(([c, t]) => isGrey(c) && t > -40)
    .map(([c, t]) => [c & 255, t] as const)
    .sort((a, b) => a[0] - b[0])
  const out = new Float32Array(256)
  for (let g = 0; g < 256; g++) {
    const i = points.findIndex(([v]) => v >= g)
    if (i <= 0) out[g] = i === 0 ? points[0]![1] : points.at(-1)![1]
    else {
      const [g0, t0] = points[i - 1]!
      const [g1, t1] = points[i]!
      out[g] = t0 + ((t1 - t0) * (g - g0)) / (g1 - g0)
    }
  }
  return out
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Cloud density (0–1) and coverage from the geostationary infrared images */
async function buildClouds(time: string) {
  // the temperature table is the largest one (the other holds no-data)
  const irMap = [...(await gibsColormap("Clean_Longwave_Infrared_Window_Band")).values()].sort((a, b) => b.size - a.size)[0]!
  const irColours = new Map([...irMap].filter(([c]) => !isGrey(c)))
  const irColourEntries = [...irColours]
  const irCache = new Map<number, number>()
  const irGrey = greyRamp(irMap)
  const images = await Promise.all(
    SATELLITES.map((s) =>
      wmsImage(s.source === "gibs" ? gibsUrl(s.layer, time) : eumetsatUrl(s.layer, time)).catch((e: unknown) => {
        console.warn(`weather: ${s.name} unavailable`, e)
        return null
      }),
    ),
  )
  const used = SATELLITES.filter((_, i) => images[i])
  const out = Buffer.alloc(WEATHER_W * WEATHER_H * 2)
  const cosLon = SATELLITES.map(() => new Float32Array(WEATHER_W))
  for (let x = 0; x < WEATHER_W; x++) {
    const lon = -180 + ((x + 0.5) * 360) / WEATHER_W
    SATELLITES.forEach((s, k) => (cosLon[k]![x] = Math.cos(((lon - s.lon) * Math.PI) / 180)))
  }
  for (let y = 0; y < WEATHER_H; y++) {
    const lat = 90 - ((y + 0.5) * 180) / WEATHER_H
    const cosLat = Math.cos((lat * Math.PI) / 180)
    // the satellites see high latitudes edge-on, and cold ice there passes for cloud
    const polar = smoothstep(78, 62, Math.abs(lat))
    for (let x = 0; x < WEATHER_W; x++) {
      const p = y * WEATHER_W + x
      let sumW = 0
      let sumT = 0
      for (let k = 0; k < SATELLITES.length; k++) {
        const img = images[k]
        if (!img || img[p * 4 + 3]! < 200) continue
        // cosine of the angle from the point beneath the satellite: oblique views blur and
        // mislocate cloud, so prefer the satellite overhead and drop views beyond ~75°
        const w = smoothstep(0.26, 0.57, cosLat * cosLon[k]![x]!)
        if (w <= 0) continue
        const r = img[p * 4]!, g = img[p * 4 + 1]!, b = img[p * 4 + 2]!
        // EUMETSAT draws brightness temperature in grey (white = cold), calibrated against
        // GOES-East over the Atlantic; GIBS uses a colour table
        const t =
          SATELLITES[k]!.source === "eumetsat"
            ? 24 - 0.29 * r
            : r === g && g === b
              ? irGrey[r]!
              : lookup(irColours, irColourEntries, irCache, (r << 16) | (g << 8) | b)
        sumW += w
        sumT += w * t
      }
      if (sumW === 0) continue
      const t = sumT / sumW
      // warm surfaces read as clear sky; tops colder than about −35 °C as thick cloud
      const density = smoothstep(14, -38, t)
      out[p * 2] = Math.round(Math.pow(density, 0.85) * 255)
      out[p * 2 + 1] = Math.round(Math.min(1, sumW) * polar * 255)
    }
  }
  const webp = await sharp(out, { raw: { width: WEATHER_W, height: WEATHER_H, channels: 2 } })
    .webp({ quality: 82, alphaQuality: 60 })
    .toBuffer()
  return { webp, satellites: used.map((s) => s.name) }
}

/** Rain (red) and snow (green) intensity, log-scaled from 0.1 to 50 mm/h */
async function buildPrecip(time: string) {
  const maps = await gibsColormap("GPM_Precipitation_Rate")
  const rain = maps.get("Rain Rate")
  const snow = maps.get("Snow Rate")
  if (!rain || !snow) throw new Error("IMERG colormap has changed")
  const both = new Map<number, number>()
  // snow rates are stored negative so one lookup tells the phase too
  for (const [c, v] of rain) both.set(c, v)
  for (const [c, v] of snow) both.set(c, -v)
  const entries = [...both]
  const cache = new Map<number, number>()
  const img = await wmsImage(gibsUrl("IMERG_Precipitation_Rate_30min", time))
  const out = Buffer.alloc(WEATHER_W * WEATHER_H * 3)
  const scale = (rate: number) => Math.round(Math.min(1, Math.max(0, Math.log10(rate / 0.1) / Math.log10(500))) * 254) + 1
  for (let p = 0; p < WEATHER_W * WEATHER_H; p++) {
    if (img[p * 4 + 3]! < 128) continue
    const v = lookup(both, entries, cache, (img[p * 4]! << 16) | (img[p * 4 + 1]! << 8) | img[p * 4 + 2]!)
    if (v > 0) out[p * 3] = scale(v)
    else out[p * 3 + 1] = scale(-v)
  }
  return sharp(out, { raw: { width: WEATHER_W, height: WEATHER_H, channels: 3 } }).webp({ lossless: true }).toBuffer()
}

/** Rounds down to the half hour that all five satellites share */
function halfHour(d: Date) {
  return new Date(Math.floor(d.getTime() / 1_800_000) * 1_800_000)
}
function iso(d: Date) {
  return d.toISOString().replace(".000Z", "Z")
}

/** Images get a random suffix: each is cached for a year, so a rebuild must never reuse a URL */
const upload = (path: string, body: Buffer | string, contentType: string, maxAge: number) =>
  put(path, body, { access: "public", addRandomSuffix: maxAge > 3600, allowOverwrite: true, contentType, cacheControlMaxAge: maxAge })

/** Fetches, builds and uploads a new set of weather layers; returns the new index. */
export async function updateWeather(): Promise<WeatherIndex> {
  const [east, west, himawari, imerg] = await Promise.all([
    gibsLatest("GOES-East_ABI_Band13_Clean_Infrared", "2km"),
    gibsLatest("GOES-West_ABI_Band13_Clean_Infrared", "2km"),
    gibsLatest("Himawari_AHI_Band13_Clean_Infrared", "2km"),
    gibsLatest("IMERG_Precipitation_Rate_30min", "2km").catch(() => null),
  ])
  const cloudTime = iso(halfHour(new Date(Math.min(east.getTime(), west.getTime(), himawari.getTime()))))
  const precipTime = imerg ? iso(imerg) : null

  // nothing new since the last run: keep the current images (and every viewer's cached copy)
  const current = await fetch(`${BLOB_URL}/weather/latest.json`, { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<WeatherIndex>) : null))
    .catch(() => null)
  if (current && current.clouds.time === cloudTime && (current.precip?.time ?? null) === precipTime) return current
  const [clouds, precip] = await Promise.all([
    buildClouds(cloudTime),
    precipTime
      ? buildPrecip(precipTime).catch((e: unknown) => {
          console.warn("weather: precipitation unavailable", e)
          return null
        })
      : null,
  ])
  const stamp = cloudTime.replace(/[-:]/g, "").slice(0, 13)
  const cloudsBlob = await upload(`weather/${stamp}/clouds.webp`, clouds.webp, "image/webp", 31_536_000)
  const precipBlob = precip ? await upload(`weather/${stamp}/precip.webp`, precip, "image/webp", 31_536_000) : null
  const index: WeatherIndex = {
    clouds: { url: cloudsBlob.url, time: cloudTime, satellites: clouds.satellites },
    precip: precipBlob && precipTime ? { url: precipBlob.url, time: precipTime } : null,
    updated: new Date().toISOString(),
  }
  await upload("weather/latest.json", JSON.stringify(index), "application/json", 60)

  // keep a day of history, then let it go
  const cutoff = Date.now() - 24 * 3_600_000
  const old: string[] = []
  let cursor: string | undefined
  do {
    const page = await list({ prefix: "weather/", cursor, limit: 1000 })
    for (const b of page.blobs) {
      const inUse = b.pathname === "weather/latest.json" || b.url === index.clouds.url || b.url === index.precip?.url
      if (!inUse && b.uploadedAt.getTime() < cutoff) old.push(b.url)
    }
    cursor = page.hasMore ? page.cursor : undefined
  } while (cursor)
  if (old.length) await del(old)
  return index
}
