/**
 * Statistics for countries, regions and cities, built by scripts/fetch-places.ts into
 * public/places/ and loaded on demand.
 */
import { once } from "@/lib/loaded"

export type Stat = [value: number, year: number]

export interface PlaceCountries {
  /** World Bank WDI extras by ISO2, then by indicator code */
  wb: Map<string, Record<string, Stat>>
  /** Global Data Lab national values by ISO2, then by field */
  gdl: Map<string, Partial<Record<GdlField, Stat>>>
  gdlSource: string | null
}

export const GDL_FIELDS = ["shdi", "lifexp", "msch", "esch", "gnic", "pop"] as const
export type GdlField = (typeof GDL_FIELDS)[number]

export interface Region {
  index: number
  /** GDL code, e.g. "NGAr101" */
  code: string
  name: string | null
  iso2: string | null
  country: string | null
  year: number | null
  shdi: number | null
  lifexp: number | null
  msch: number | null
  esch: number | null
  /** GNI per capita, 2021 PPP $ */
  gnic: number | null
  /** thousands */
  pop: number | null
}

export interface Regions {
  source: string
  rows: Region[]
  /** TopoJSON of the outlines; geometry id = row index */
  topoUrl: string
}

export interface City {
  index: number
  name: string
  /** set when the city is in one of the sampled countries */
  iso2: string | null
  /** otherwise the GHSL country name */
  country: string | null
  lat: number
  lon: number
  /** 2025 */
  pop: number
  pop1975: number | null
  /** km² */
  area: number | null
  capital: boolean
  /** average building height, m (2020) */
  height: number | null
  /** GDP per person, PPP $ (2020) */
  gdp: number | null
  hdi: number | null
  lifexp: number | null
  /** mean years of schooling, adults 25+ */
  school: number | null
  /** % aged 0–14 / 65+ */
  young: number | null
  old: number | null
  /** mean mobile download speed, Mbps (2023) */
  mobile: number | null
  /** % of people within reach of a hospital */
  hospital: number | null
  /** mean greenness of the built-up area, 0–1 */
  green: number | null
  /** annual mean temperature, °C (2010s) */
  temp: number | null
  /** annual precipitation, mm (2010s) */
  rain: number | null
  /** days a year with heat stress (UTCI > 32 °C) */
  heat: number | null
  /** Köppen–Geiger class number (Beck et al.) */
  climate: number | null
}

export interface Cities {
  source: string
  rows: City[]
}

/** Columnar JSON ({ fields, rows }) into objects */
function objects<T>(fields: readonly string[], rows: unknown[][], extra: (o: Record<string, unknown>, i: number) => void): T[] {
  return rows.map((r, i) => {
    const o: Record<string, unknown> = {}
    fields.forEach((f, k) => (o[f] = r[k]))
    extra(o, i)
    return o as T
  })
}

async function json<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res.json() as Promise<T>
}

export const loadPlaceCountries = () =>
  once("places:countries", async (): Promise<PlaceCountries> => {
    const d = await json<{
      wb: { data: Record<string, Record<string, Stat>> }
      gdl: { source: string; data: Record<string, Partial<Record<GdlField, Stat>>> } | null
    }>("/places/countries.json")
    return { wb: new Map(Object.entries(d.wb.data)), gdl: new Map(Object.entries(d.gdl?.data ?? {})), gdlSource: d.gdl?.source ?? null }
  })

/** null when the regions have not been built (they need the Global Data Lab CSV) */
export const loadRegions = () =>
  once("places:regions", async (): Promise<Regions | null> => {
    const res = await fetch("/places/regions.json")
    if (!res.ok) return null
    const d = (await res.json()) as { source: string; fields: string[]; rows: unknown[][] }
    return { source: d.source, rows: objects<Region>(d.fields, d.rows, (o, i) => (o.index = i)), topoUrl: "/places/regions.topo.json" }
  })

export const loadCities = () =>
  once("places:cities", async (): Promise<Cities> => {
    const d = await json<{ source: string; fields: string[]; rows: unknown[][] }>("/places/cities.json")
    return {
      source: d.source,
      rows: objects<City>(d.fields, d.rows, (o, i) => {
        o.index = i
        o.capital = o.capital === 1
        o.climate = o.climate == null ? null : Number(o.climate)
      }),
    }
  })

/** Köppen–Geiger classes as numbered by Beck et al. (2018), used by GHSL */
export const KOPPEN: Record<number, [code: string, name: string]> = {
  1: ["Af", "Tropical rainforest"],
  2: ["Am", "Tropical monsoon"],
  3: ["Aw", "Tropical savanna"],
  4: ["BWh", "Hot desert"],
  5: ["BWk", "Cold desert"],
  6: ["BSh", "Hot semi-arid"],
  7: ["BSk", "Cold semi-arid"],
  8: ["Csa", "Hot-summer Mediterranean"],
  9: ["Csb", "Warm-summer Mediterranean"],
  10: ["Csc", "Cold-summer Mediterranean"],
  11: ["Cwa", "Monsoon-influenced humid subtropical"],
  12: ["Cwb", "Subtropical highland"],
  13: ["Cwc", "Cold subtropical highland"],
  14: ["Cfa", "Humid subtropical"],
  15: ["Cfb", "Oceanic"],
  16: ["Cfc", "Subpolar oceanic"],
  17: ["Dsa", "Hot-summer continental, dry summer"],
  18: ["Dsb", "Warm-summer continental, dry summer"],
  19: ["Dsc", "Subarctic, dry summer"],
  20: ["Dsd", "Extremely cold subarctic, dry summer"],
  21: ["Dwa", "Monsoon-influenced hot-summer continental"],
  22: ["Dwb", "Monsoon-influenced warm-summer continental"],
  23: ["Dwc", "Monsoon-influenced subarctic"],
  24: ["Dwd", "Monsoon-influenced extremely cold subarctic"],
  25: ["Dfa", "Hot-summer humid continental"],
  26: ["Dfb", "Warm-summer humid continental"],
  27: ["Dfc", "Subarctic"],
  28: ["Dfd", "Extremely cold subarctic"],
  29: ["ET", "Tundra"],
  30: ["EF", "Ice cap"],
}
