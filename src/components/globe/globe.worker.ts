/**
 * Heavy, one-off globe preparation kept off the main thread: painting the 4096×2048 earth
 * texture (OffscreenCanvas → ImageBitmap), turning the world atlas into border lines and
 * painting the country and region id grids for the statistics map.
 */
import world from "world-atlas/countries-50m.json"

import type { Theme } from "@/lib/sim/attributes"
import type { Topology, GeometryCollection } from "topojson-specification"

import { rasterizeCountries, rasterizeRegions, regionBorderLines } from "./area-raster"
import { buildBorderLines, importBorderTopology, type BorderDetail } from "./border-lines"
import { drawEarth, EARTH_H, EARTH_W, type WorldTopology } from "./earth-draw"

export type GlobeWorkerRequest =
  | { kind: "texture"; id: number; theme: Theme }
  | { kind: "borders"; id: number; detail: BorderDetail }
  | { kind: "country-ids"; id: number }
  | { kind: "region-ids"; id: number; url: string }

export type GlobeWorkerResponse =
  | { kind: "texture"; id: number; bitmap: ImageBitmap }
  | { kind: "borders"; id: number; positions: Float32Array }
  | { kind: "area-ids"; id: number; ids: Uint16Array; borders: Float32Array | null }
  | { kind: "error"; id: number; message: string }

const scope = self as unknown as Worker

scope.onmessage = async (e: MessageEvent<GlobeWorkerRequest>) => {
  const req = e.data
  try {
    if (req.kind === "texture") {
      const canvas = new OffscreenCanvas(EARTH_W, EARTH_H)
      const ctx = canvas.getContext("2d")!
      drawEarth(ctx, world as unknown as WorldTopology, req.theme, EARTH_W, EARTH_H, true)
      const bitmap = canvas.transferToImageBitmap()
      scope.postMessage({ kind: "texture", id: req.id, bitmap } satisfies GlobeWorkerResponse, [bitmap])
    } else if (req.kind === "country-ids") {
      const ids = rasterizeCountries(world)
      scope.postMessage({ kind: "area-ids", id: req.id, ids, borders: null } satisfies GlobeWorkerResponse, [ids.buffer])
    } else if (req.kind === "region-ids") {
      const res = await fetch(req.url)
      if (!res.ok) throw new Error(`${res.status} ${req.url}`)
      const topo = (await res.json()) as Topology<{ regions: GeometryCollection }>
      const ids = rasterizeRegions(topo)
      const borders = regionBorderLines(topo)
      scope.postMessage({ kind: "area-ids", id: req.id, ids, borders } satisfies GlobeWorkerResponse, [ids.buffer, borders.buffer])
    } else {
      const positions = buildBorderLines(await importBorderTopology(req.detail))
      scope.postMessage({ kind: "borders", id: req.id, positions } satisfies GlobeWorkerResponse, [positions.buffer])
    }
  } catch (err) {
    scope.postMessage({ kind: "error", id: req.id, message: String(err) } satisfies GlobeWorkerResponse)
  }
}
