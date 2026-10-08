import { geoEquirectangular, geoGraticule10, geoPath } from "d3-geo"
import { feature, mesh } from "topojson-client"
import type { Topology, GeometryCollection } from "topojson-specification"

import type { Theme } from "@/lib/sim/attributes"

/** Shared by the main thread (placeholder / fallback) and the globe worker (full size). */
export type WorldTopology = Topology<{ countries: GeometryCollection; land: GeometryCollection }>

export const EARTH_STYLE: Record<Theme, { ocean: [string, string]; graticule: string; land: string; coast: string; borders: string }> = {
  dark: {
    ocean: ["#0a1426", "#0d1b33"],
    graticule: "rgba(148, 178, 230, 0.07)",
    land: "#1f2c42",
    coast: "rgba(140, 180, 255, 0.4)",
    borders: "rgba(170, 190, 225, 0.28)",
  },
  light: {
    ocean: ["#c4d6ea", "#d3e2f1"],
    graticule: "rgba(40, 70, 120, 0.08)",
    land: "#f6f3ec",
    coast: "rgba(70, 100, 150, 0.45)",
    borders: "rgba(90, 100, 120, 0.35)",
  },
}

/** Full-size texture; line widths below are tuned for it and scaled for smaller ones */
export const EARTH_W = 4096
export const EARTH_H = 2048

/**
 * Paints the equirectangular earth map. `flipY` draws it upside down, for an ImageBitmap
 * (WebGL ignores `texture.flipY` for bitmaps).
 */
export function drawEarth(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  topo: WorldTopology,
  theme: Theme,
  W: number,
  H: number,
  flipY = false,
) {
  const style = EARTH_STYLE[theme]
  const k = W / EARTH_W
  if (flipY) ctx.setTransform(1, 0, 0, -1, 0, H)
  const projection = geoEquirectangular().scale(W / (2 * Math.PI)).translate([W / 2, H / 2])
  const path = geoPath(projection, ctx as CanvasRenderingContext2D)

  const ocean = ctx.createLinearGradient(0, 0, 0, H)
  ocean.addColorStop(0, style.ocean[0])
  ocean.addColorStop(0.5, style.ocean[1])
  ocean.addColorStop(1, style.ocean[0])
  ctx.fillStyle = ocean
  ctx.fillRect(0, 0, W, H)

  ctx.beginPath()
  path(geoGraticule10())
  ctx.strokeStyle = style.graticule
  ctx.lineWidth = Math.max(0.5, k)
  ctx.stroke()

  ctx.beginPath()
  path(feature(topo, topo.objects.land))
  ctx.fillStyle = style.land
  ctx.fill()
  ctx.strokeStyle = style.coast
  ctx.lineWidth = Math.max(0.5, 1.2 * k)
  ctx.stroke()

  ctx.beginPath()
  path(mesh(topo, topo.objects.countries, (a, b) => a !== b))
  ctx.strokeStyle = style.borders
  ctx.lineWidth = Math.max(0.5, k)
  ctx.stroke()
}
