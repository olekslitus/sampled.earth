import type { Topology, GeometryCollection } from "topojson-specification"

import { rasterizeCountries, rasterizeRegions, regionBorderLines, type AreaLevel } from "./area-raster"
import { runInGlobeWorker, whenIdle } from "./worker-client"

export interface AreaGrid {
  /** see area-raster.ts: 0 = none, otherwise index + 1 */
  ids: Uint16Array
  /** borders between areas as line-segment pairs (regions only) */
  borders: Float32Array | null
}

const cache = new Map<string, Promise<AreaGrid>>()

/** Paints the grid on the main thread, during idle time, when the worker is unavailable */
function paintHere(level: AreaLevel, url: string): Promise<AreaGrid> {
  if (level === "country") {
    return import("world-atlas/countries-50m.json").then((m) => new Promise((resolve) => whenIdle(() => resolve({ ids: rasterizeCountries(m), borders: null }))))
  }
  return fetch(url)
    .then((r) => r.json() as Promise<Topology<{ regions: GeometryCollection }>>)
    .then((topo) => new Promise((resolve) => whenIdle(() => resolve({ ids: rasterizeRegions(topo), borders: regionBorderLines(topo) }))))
}

/** The id grid for countries or regions, painted once in the globe worker */
export function loadAreaGrid(level: AreaLevel, url = "/places/regions.topo.json"): Promise<AreaGrid> {
  const key = level === "country" ? level : `${level}:${url}`
  let p = cache.get(key)
  if (!p) {
    p = runInGlobeWorker(level === "country" ? { kind: "country-ids" } : { kind: "region-ids", url }).then(
      (r) => (r.kind === "area-ids" ? { ids: r.ids, borders: r.borders } : paintHere(level, url)),
      () => paintHere(level, url),
    )
    p.catch(() => cache.delete(key))
    cache.set(key, p)
  }
  return p
}
