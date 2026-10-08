import { mesh } from "topojson-client"
import type { Topology, GeometryCollection } from "topojson-specification"
import type { MultiLineString } from "geojson"

import { latLonToXYZ } from "@/lib/sim/sphere"

export type BorderDetail = "50m" | "10m"

export function importBorderTopology(detail: BorderDetail): Promise<unknown> {
  return detail === "50m" ? import("world-atlas/countries-50m.json") : import("world-atlas/countries-10m.json")
}

/** Coastlines and country borders as line-segment pairs on a sphere just above the surface. */
export function buildBorderLines(module: unknown): Float32Array {
  const m = module as { default?: unknown }
  const topo = (m.default ?? m) as Topology<{ countries: GeometryCollection }>
  const lines = mesh(topo, topo.objects.countries) as MultiLineString
  let n = 0
  for (const line of lines.coordinates) n += Math.max(0, line.length - 1)
  const out = new Float32Array(n * 6)
  let o = 0
  for (const line of lines.coordinates) {
    for (let i = 0; i < line.length - 1; i++) {
      latLonToXYZ(line[i][1], line[i][0], 1.0001, out, o)
      latLonToXYZ(line[i + 1][1], line[i + 1][0], 1.0001, out, o + 3)
      o += 6
    }
  }
  return out
}
