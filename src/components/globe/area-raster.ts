import { feature, mesh } from "topojson-client"
import type { Topology, GeometryCollection } from "topojson-specification"
import type { Geometry, MultiLineString } from "geojson"

import { COUNTRIES } from "@/lib/sim/countries"
import { latLonToXYZ } from "@/lib/sim/sphere"

/**
 * Areas (countries or regions) painted as ids into an equirectangular grid: 0 = none,
 * otherwise index + 1. Row 0 is the north edge, column 0 is 180° W. The globe colours the
 * map with it (one lookup per pixel) and it tells which area is under the cursor.
 *
 * Painted with an exact scanline fill instead of a canvas, whose antialiased edges would
 * blend neighbouring ids into meaningless ones.
 */
export const AREA_W = 4096
export const AREA_H = 2048

export type AreaLevel = "country" | "region"

type Ring = number[][]

function polygonsOf(g: Geometry | null): Ring[][] {
  if (!g) return []
  if (g.type === "Polygon") return [g.coordinates]
  if (g.type === "MultiPolygon") return g.coordinates
  if (g.type === "GeometryCollection") return g.geometries.flatMap(polygonsOf)
  return []
}

/** Even-odd fill of one area (all its rings at once, so holes stay empty) */
function fill(ids: Uint16Array, W: number, H: number, rings: Ring[], value: number) {
  // edges in pixel space; rings crossing the antimeridian are unwrapped east of 180°
  const ex0: number[] = []
  const ey0: number[] = []
  const ex1: number[] = []
  const ey1: number[] = []
  for (const ring of rings) {
    const wrapped = ring.some((pt, i) => i > 0 && Math.abs(pt[0]! - ring[i - 1]![0]!) > 180)
    for (let i = 1; i < ring.length; i++) {
      let lon0 = ring[i - 1]![0]!
      let lon1 = ring[i]![0]!
      if (wrapped) {
        if (lon0 < 0) lon0 += 360
        if (lon1 < 0) lon1 += 360
      }
      const y0 = ((90 - ring[i - 1]![1]!) / 180) * H
      const y1 = ((90 - ring[i]![1]!) / 180) * H
      if (y0 === y1) continue
      ex0.push(((lon0 + 180) / 360) * W)
      ey0.push(y0)
      ex1.push(((lon1 + 180) / 360) * W)
      ey1.push(y1)
    }
  }
  const n = ex0.length
  if (!n) return
  // sweep rows with the edges sorted by their top
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => Math.min(ey0[a]!, ey1[a]!) - Math.min(ey0[b]!, ey1[b]!))
  let next = 0
  let active: number[] = []
  const xs: number[] = []
  let yMin = Infinity
  let yMax = -Infinity
  for (let i = 0; i < n; i++) {
    yMin = Math.min(yMin, ey0[i]!, ey1[i]!)
    yMax = Math.max(yMax, ey0[i]!, ey1[i]!)
  }
  const rowStart = Math.max(0, Math.floor(yMin - 0.5))
  const rowEnd = Math.min(H - 1, Math.ceil(yMax))
  for (let row = rowStart; row <= rowEnd; row++) {
    const yc = row + 0.5
    while (next < n && Math.min(ey0[order[next]!]!, ey1[order[next]!]!) <= yc) active.push(order[next++]!)
    active = active.filter((e) => Math.max(ey0[e]!, ey1[e]!) > yc)
    xs.length = 0
    for (const e of active) {
      const a = ey0[e]!
      const b = ey1[e]!
      if ((a <= yc) === (b <= yc)) continue
      xs.push(ex0[e]! + ((yc - a) / (b - a)) * (ex1[e]! - ex0[e]!))
    }
    if (xs.length < 2) continue
    xs.sort((a, b) => a - b)
    const base = row * W
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const c0 = Math.ceil(xs[k]! - 0.5)
      const c1 = Math.floor(xs[k + 1]! - 0.5)
      for (let col = c0; col <= c1; col++) ids[base + (((col % W) + W) % W)] = value
    }
  }
}

/** Countries in the sample, from the world atlas the people are placed on (id = COUNTRIES index + 1) */
export function rasterizeCountries(module: unknown, W = AREA_W, H = AREA_H): Uint16Array {
  const m = module as { default?: unknown }
  const topo = (m.default ?? m) as Topology<{ countries: GeometryCollection<{ name: string }> }>
  const index = new Map(COUNTRIES.map((c, i) => [c.name, i]))
  const ids = new Uint16Array(W * H)
  const fc = feature(topo, topo.objects.countries)
  for (const f of fc.features) {
    const i = index.get(f.properties.name)
    if (i == null) continue
    for (const poly of polygonsOf(f.geometry)) fill(ids, W, H, poly, i + 1)
  }
  return ids
}

/** Regions from regions.topo.json (geometry id = row index; painted as row + 1) */
export function rasterizeRegions(topo: Topology<{ regions: GeometryCollection }>, W = AREA_W, H = AREA_H): Uint16Array {
  const ids = new Uint16Array(W * H)
  const fc = feature(topo, topo.objects.regions)
  for (const f of fc.features) {
    const i = Number(f.id)
    if (!Number.isFinite(i)) continue
    for (const poly of polygonsOf(f.geometry)) fill(ids, W, H, poly, i + 1)
  }
  return ids
}

/** Borders between regions (not coastlines) as line-segment pairs just above the surface */
export function regionBorderLines(topo: Topology<{ regions: GeometryCollection }>): Float32Array {
  const lines = mesh(topo, topo.objects.regions, (a, b) => a !== b) as MultiLineString
  let n = 0
  for (const line of lines.coordinates) n += Math.max(0, line.length - 1)
  const out = new Float32Array(n * 6)
  let o = 0
  for (const line of lines.coordinates) {
    for (let i = 0; i < line.length - 1; i++) {
      latLonToXYZ(line[i]![1]!, line[i]![0]!, 1.0001, out, o)
      latLonToXYZ(line[i + 1]![1]!, line[i + 1]![0]!, 1.0001, out, o + 3)
      o += 6
    }
  }
  return out
}

/** The id at a point (lat, lon in degrees) */
export function areaAt(ids: Uint16Array, lat: number, lon: number, W = AREA_W, H = AREA_H) {
  const col = Math.floor(((((lon + 180) % 360) + 360) % 360) / 360 * W)
  const row = Math.min(H - 1, Math.max(0, Math.floor(((90 - lat) / 180) * H)))
  return ids[row * W + Math.min(W - 1, col)]!
}
