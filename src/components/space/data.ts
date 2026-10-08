"use client"

import { once } from "@/lib/loaded"
import { BLOB_URL } from "@/lib/blob"
import type { ExoSystem, SpaceIndex, Track } from "@/lib/space/tracks"

export { useLoaded } from "@/lib/loaded"

/** When the page loaded; "new" exoplanets are judged against it */
export const PAGE_LOADED = Date.now()

// ---------------------------------------------------------------------------------------
// Static catalogues in /public/space (scripts/fetch-space.ts)

export interface StarCatalog {
  /** x, y, z (light-years, sky frame), absolute magnitude, B−V colour; brightest first */
  data: Float32Array
  count: number
  /** [index into data, name, distance in light-years] */
  names: [number, string, number][]
}

export const loadStars = () =>
  once("stars", async (): Promise<StarCatalog> => {
    const [bin, names] = await Promise.all([
      fetch("/space/stars.bin").then((r) => r.arrayBuffer()),
      fetch("/space/stars.json").then((r) => r.json() as Promise<[number, string, number][]>),
    ])
    const data = new Float32Array(bin as ArrayBuffer)
    return { data, count: data.length / 5, names }
  })

export interface Galaxy {
  id: string
  name: string
  /** kly, sky frame */
  pos: [number, number, number]
  /** diameter, kly */
  size: number
  /** de Vaucouleurs T-type: <0 elliptical/lenticular, 0–9 spiral, 10 irregular */
  type: number
  /** absolute B magnitude */
  absMag: number
}

/** Common names for the galaxies people have heard of */
export const GALAXY_NAMES: Record<string, string> = {
  MESSIER031: "Andromeda Galaxy (M31)",
  MESSIER033: "Triangulum Galaxy (M33)",
  LMC: "Large Magellanic Cloud",
  SMC: "Small Magellanic Cloud",
  NGC5128: "Centaurus A",
  MESSIER081: "Bode’s Galaxy (M81)",
  MESSIER082: "Cigar Galaxy (M82)",
  MESSIER101: "Pinwheel Galaxy (M101)",
  NGC5194: "Whirlpool Galaxy (M51)",
  NGC4594: "Sombrero Galaxy (M104)",
  NGC0253: "Sculptor Galaxy",
  NGC5236: "Southern Pinwheel (M83)",
  MESSIER032: "M32",
  MESSIER110: "M110",
  IC0342: "IC 342",
  NGC4258: "M106",
  NGC5055: "Sunflower Galaxy (M63)",
  NGC3627: "M66",
  NGC4826: "Black Eye Galaxy (M64)",
  CIRCINUS: "Circinus Galaxy",
}

function prettyGalaxyName(id: string) {
  if (GALAXY_NAMES[id]) return GALAXY_NAMES[id]
  const m = /^(NGC|IC|UGC|ESO|PGC|DDO|KK|KKH|MESSIER)0*(\d.*)$/.exec(id)
  if (m) return `${m[1] === "MESSIER" ? "M" : m[1]} ${m[2]}`
  return id
}

export const loadGalaxies = () =>
  once("galaxies", async (): Promise<Galaxy[]> => {
    const rows = (await fetch("/space/galaxies.json").then((r) => r.json())) as [string, number, number, number, number, number, number][]
    return rows
      .filter((r) => r[0] !== "Milky Way") // drawn in detail by MilkyWayLayer
      .map(([id, x, y, z, size, type, absMag]) => ({ id, name: prettyGalaxyName(id), pos: [x, y, z], size: Math.max(size, 0.5), type, absMag }))
  })

export interface WebCatalog {
  /** Mly, sky frame */
  positions: Float32Array
  /** apparent Ks magnitude */
  mags: Float32Array
  count: number
}

export const loadWeb = () =>
  once("web", async (): Promise<WebCatalog> => {
    const buf: ArrayBuffer = await fetch("/space/web.bin").then((r) => r.arrayBuffer())
    const raw = new Int16Array(buf)
    const count = raw.length / 4
    const positions = new Float32Array(count * 3)
    const mags = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      positions[i * 3] = raw[i * 4]! * 0.05
      positions[i * 3 + 1] = raw[i * 4 + 1]! * 0.05
      positions[i * 3 + 2] = raw[i * 4 + 2]! * 0.05
      mags[i] = raw[i * 4 + 3]! / 10
    }
    return { positions, mags, count }
  })

// ---------------------------------------------------------------------------------------
// Live data in Blob (src/lib/space/build.ts, refreshed daily)

export interface SpaceLive {
  tracks: Track[]
  systems: ExoSystem[]
  exoplanetCount: number
  updated: string
}

export const loadLive = () =>
  once("live", async (): Promise<SpaceLive> => {
    const index = (await fetch(`${BLOB_URL}/space/latest.json`, { cache: "no-cache" }).then((r) => {
      if (!r.ok) throw new Error(String(r.status))
      return r.json()
    })) as SpaceIndex
    const [tracks, systems] = await Promise.all([
      fetch(index.tracks).then((r) => r.json() as Promise<Track[]>),
      fetch(index.exoplanets).then((r) => r.json() as Promise<ExoSystem[]>),
    ])
    return { tracks, systems, exoplanetCount: index.exoplanetCount, updated: index.updated }
  })
