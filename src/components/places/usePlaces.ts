"use client"

import { useEffect, useMemo, useState } from "react"

import type { PlaceKey, PlacesMap } from "@/components/globe/PlacesLayer"
import { useLoaded } from "@/lib/loaded"
import { loadCities, loadPlaceCountries, loadRegions } from "@/lib/places/data"
import {
  CLASSES, METRIC_BY_KEY, areaSources, citySource, cityValues, classOf, countryValues, quantileBreaks, regionValues,
  type Metric, type MetricSource, type PlaceData, type SourceKey,
} from "@/lib/places/metrics"
import type { Theme } from "@/lib/sim/attributes"
import { COUNTRIES } from "@/lib/sim/countries"
import type { Simulation } from "@/lib/sim/engine"
import type { CompiledFilter } from "@/lib/sim/filter"

/** Countries in the sample (they have flags and cards) */
export const SAMPLED = new Set(COUNTRIES.map((c) => c.iso2))

export interface PlacesSettings {
  on: boolean
  metric: string
  /** chosen source per metric (the first one with areas when unset) */
  sources: Record<string, SourceKey>
  level: "auto" | "country" | "region"
  cities: boolean
}

export const DEFAULT_PLACES: PlacesSettings = { on: false, metric: "lifexp", sources: {}, level: "auto", cities: true }

/**
 * Single-hue ramps, low → high: pale to deep on light surfaces, dim to bright on dark ones.
 * Orange, so the colours never blend into the blue oceans of either map style.
 */
export const RAMPS: Record<Theme, string[]> = {
  light: ["#fde3c8", "#fbc08e", "#f59a55", "#e5762f", "#c2541b", "#8f3a10"],
  dark: ["#6b2d0c", "#97420f", "#c45a1a", "#e87b35", "#f6a466", "#fcd2a8"],
}

function rgbBytes(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** The statistics files, loaded once the map or a place card is wanted */
export function usePlaceData(wanted: boolean, filterShare: PlaceData["filterShare"]): PlaceData {
  const countries = useLoaded("places:countries", loadPlaceCountries, wanted)
  const regions = useLoaded("places:regions", loadRegions, wanted)
  const cities = useLoaded("places:cities", loadCities, wanted)
  return useMemo(() => ({ countries, regions, cities, filterShare }), [countries, regions, cities, filterShare])
}

/** Share of each country's sampled people matching the filter, refreshed every 2 s (activities change) */
export function useFilterShare(sim: Simulation, filter: CompiledFilter | null, active: boolean) {
  const [share, setShare] = useState<Map<string, [number, number]> | null>(null)
  useEffect(() => {
    if (!active || !filter) return
    const run = () => {
      const totals = new Map<string, [number, number]>()
      for (let i = 0; i < sim.globalCount; i++) {
        const p = sim.people[i]!
        let t = totals.get(p.country.iso2)
        if (!t) totals.set(p.country.iso2, (t = [0, 0]))
        t[1]++
        if (filter.test(p, i, sim)) t[0]++
      }
      const out = new Map<string, [number, number]>()
      // fewer than 20 sampled people say too little to colour a country
      for (const [iso2, [hits, n]] of totals) if (n >= 20) out.set(iso2, [(100 * hits) / n, n])
      setShare(out)
    }
    run()
    const t = setInterval(run, 2000)
    return () => clearInterval(t)
  }, [sim, filter, active])
  return active && filter ? share : null
}

export interface PlacesView {
  metric: Metric
  /** colours the countries and regions */
  areaSource: MetricSource | null
  /** colours the city circles */
  citySource: MetricSource | null
  countryVals: Float64Array
  regionVals: Float64Array
  cityVals: Float64Array
  breaks: { country: number[]; region: number[]; city: number[] }
  ramp: string[]
  map: PlacesMap
}

export function sourceFor(metric: Metric, settings: PlacesSettings): MetricSource | null {
  const sources = areaSources(metric)
  const chosen = settings.sources[metric.key]
  return sources.find((s) => s.source === chosen) ?? sources[0] ?? null
}

function areaRGBA(values: Float64Array, breaks: number[], ramp: [number, number, number][]) {
  const out = new Uint8Array((values.length + 1) * 4)
  values.forEach((v, i) => {
    const k = classOf(v, breaks)
    if (k < 0) return
    const [r, g, b] = ramp[Math.min(k, ramp.length - 1)]!
    out.set([r, g, b, 255], (i + 1) * 4)
  })
  return out
}

/** Everything the map, legend and cards need for the chosen statistic */
export function usePlacesView(settings: PlacesSettings, data: PlaceData, theme: Theme, selected: PlaceKey | null): PlacesView | null {
  const metric = METRIC_BY_KEY.get(settings.metric) ?? METRIC_BY_KEY.get("lifexp")!
  const areaSource = sourceFor(metric, settings)
  const city = citySource(metric)
  const values = useMemo(() => {
    const countryVals = countryValues(areaSource, data)
    const regionVals = regionValues(areaSource, data.regions)
    const cityVals = cityValues(city, data.cities)
    return {
      countryVals, regionVals, cityVals,
      breaks: { country: quantileBreaks(countryVals), region: quantileBreaks(regionVals), city: quantileBreaks(cityVals) },
    }
  }, [areaSource, city, data])
  const ramp = RAMPS[theme]
  const colours = useMemo(() => {
    const bytes = ramp.map(rgbBytes)
    const hasCountries = values.countryVals.some(Number.isFinite)
    const hasRegions = values.regionVals.some(Number.isFinite)
    let cityRGB: Float32Array | null = null
    if (values.cityVals.some(Number.isFinite)) {
      cityRGB = new Float32Array(values.cityVals.length * 3)
      const neutral = theme === "dark" ? 0.55 : 0.75
      values.cityVals.forEach((v, i) => {
        const k = classOf(v, values.breaks.city)
        const [r, g, b] = k < 0 ? [neutral * 255, neutral * 255, neutral * 255] : bytes[Math.min(k, CLASSES - 1)]!
        cityRGB!.set([r / 255, g / 255, b / 255], i * 3)
      })
    }
    return {
      countryRGBA: hasCountries ? areaRGBA(values.countryVals, values.breaks.country, bytes) : null,
      regionRGBA: hasRegions ? areaRGBA(values.regionVals, values.breaks.region, bytes) : null,
      cityRGB,
    }
  }, [values, ramp, theme])
  const map = useMemo<PlacesMap>(
    () => ({
      ...colours,
      regionsUrl: data.regions?.topoUrl ?? null,
      levelMode: settings.level,
      cities: data.cities?.rows ?? null,
      showCities: settings.cities,
      selected,
      theme,
    }),
    [colours, data.regions, data.cities, settings.level, settings.cities, selected, theme],
  )
  if (!settings.on) return null
  return { metric, areaSource, citySource: city, ...values, ramp, map }
}

/** A country, region or city by its key, with a display name */
export function placeName(key: PlaceKey, data: PlaceData): string {
  if (key.kind === "country") return COUNTRIES[key.index]?.label ?? "Unknown"
  if (key.kind === "region") {
    const r = data.regions?.rows[key.index]
    return r ? [r.name, r.country].filter(Boolean).join(", ") : "Unknown region"
  }
  return data.cities?.rows[key.index]?.name ?? "Unknown city"
}
