"use client"

import { useSyncExternalStore } from "react"

import { CountryFlag } from "@/components/CountryFlag"
import type { PlaceKey } from "@/components/globe/PlacesLayer"
import { SOURCES, type PlaceData } from "@/lib/places/metrics"
import { COUNTRIES } from "@/lib/sim/countries"
import { placeName, SAMPLED, type PlacesView } from "./usePlaces"

/** The place under the cursor, set by the globe's picker (outside React's render) */
let hover: { hit: PlaceKey | null; x: number; y: number } = { hit: null, x: 0, y: 0 }
const listeners = new Set<() => void>()
export function setPlaceHover(hit: PlaceKey | null, x: number, y: number) {
  if (!hit && !hover.hit) return
  hover = { hit, x, y }
  for (const fn of listeners) fn()
}
const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => void listeners.delete(fn)
}

/** Name and value of the country, region or city under the cursor */
export function PlaceTooltip({ view, data, canvasRect }: { view: PlacesView; data: PlaceData; canvasRect?: DOMRect }) {
  const h = useSyncExternalStore(subscribe, () => hover, () => hover)
  if (!h.hit) return null
  const { hit } = h
  const vals = hit.kind === "country" ? view.countryVals : hit.kind === "region" ? view.regionVals : view.cityVals
  const v = vals[hit.index]
  const src = hit.kind === "city" ? view.citySource : view.areaSource
  const iso2 =
    hit.kind === "country" ? COUNTRIES[hit.index]?.iso2 : hit.kind === "region" ? data.regions?.rows[hit.index]?.iso2 : data.cities?.rows[hit.index]?.iso2
  const left = h.x - (canvasRect?.left ?? 0) + 14
  const top = h.y - (canvasRect?.top ?? 0) + 14
  return (
    <div
      className="pointer-events-none absolute z-20 max-w-64 rounded-md border border-border bg-popover/90 px-2 py-1 text-xs text-popover-foreground shadow-lg backdrop-blur"
      style={{ left, top }}
      role="status"
    >
      <div className="font-medium">
        {iso2 && SAMPLED.has(iso2) && <CountryFlag iso2={iso2} />} {placeName(hit, data)}
      </div>
      <div className="text-muted-foreground">
        {view.metric.label}:{" "}
        {v != null && Number.isFinite(v) ? (
          <>
            <span className="font-medium text-foreground tabular-nums">{view.metric.format(v)}</span>
            {src && <> · {SOURCES[src.source].short}</>}
          </>
        ) : (
          "no data"
        )}
      </div>
    </div>
  )
}
