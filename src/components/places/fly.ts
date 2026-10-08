import { geoBounds } from "d3-geo"
import { feature } from "topojson-client"
import type { Topology, GeometryCollection } from "topojson-specification"

import type { PlaceKey } from "@/components/globe/PlacesLayer"
import { once } from "@/lib/loaded"
import type { PlaceData } from "@/lib/places/metrics"
import { COUNTRIES } from "@/lib/sim/countries"
import { countryView } from "@/lib/sim/population"

/** Altitude (Earth radii) that fits about `span` degrees on screen */
const altFor = (span: number) => Math.min(1.8, Math.max(0.05, span * 0.035))

const regionBounds = (url: string) =>
  once(`bounds:${url}`, async () => {
    const topo = (await (await fetch(url)).json()) as Topology<{ regions: GeometryCollection }>
    const out = new Map<number, [[number, number], [number, number]]>()
    for (const f of feature(topo, topo.objects.regions).features) out.set(Number(f.id), geoBounds(f) as [[number, number], [number, number]])
    return out
  })

/** Where to fly to show a place */
export async function placeView(key: PlaceKey, data: PlaceData): Promise<{ lat: number; lon: number; alt: number } | null> {
  if (key.kind === "country") {
    const v = countryView(COUNTRIES[key.index]!)
    return { lat: v.lat, lon: v.lon, alt: altFor(v.span) }
  }
  if (key.kind === "city") {
    const c = data.cities?.rows[key.index]
    if (!c) return null
    return { lat: c.lat, lon: c.lon, alt: altFor(Math.max(0.6, Math.sqrt(c.area ?? 100) / 111) * 2.5) }
  }
  if (!data.regions) return null
  const b = (await regionBounds(data.regions.topoUrl)).get(key.index)
  if (!b) return null
  const [[w, s], [e, n]] = b
  let width = e - w
  if (width < 0) width += 360
  let lon = w + width / 2
  if (lon > 180) lon -= 360
  const lat = (s + n) / 2
  return { lat, lon, alt: altFor(Math.max(width * Math.cos((lat * Math.PI) / 180), n - s) * 1.3) }
}
