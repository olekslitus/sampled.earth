/**
 * Statistics that can colour the map, each with one or more sources. A source may cover
 * countries, regions within countries, cities, or several of them; the user picks which
 * source colours the map, and cards show every source side by side.
 */
import wdi from "@/lib/sim/data/wdi.json"
import { COUNTRIES, RELIGIONS, type Country } from "@/lib/sim/countries"
import type { Cities, City, PlaceCountries, Region, Regions, Stat } from "./data"

export type Level = "country" | "region" | "city"
export type SourceKey = "wb" | "gdl" | "ghsl" | "table" | "sample"

export const SOURCES: Record<SourceKey, { name: string; short: string; href: string; licence: string }> = {
  wb: {
    name: "World Bank World Development Indicators",
    short: "World Bank",
    href: "https://databank.worldbank.org/source/world-development-indicators",
    licence: "CC BY 4.0",
  },
  gdl: {
    name: "Global Data Lab, Subnational Human Development Database",
    short: "Global Data Lab",
    href: "https://globaldatalab.org/shdi/",
    licence: "free for non-commercial use",
  },
  ghsl: {
    name: "GHSL Urban Centre Database R2024A (European Commission, JRC)",
    short: "GHSL",
    href: "https://human-settlement.emergency.copernicus.eu/ghs_ucdb_2024.php",
    licence: "CC BY 4.0",
  },
  table: {
    name: "Sampled Earth country table (Pew, UN, ILO and others; see methodology)",
    short: "Country table",
    href: "/methodology",
    licence: "",
  },
  sample: {
    name: "This sample of synthetic people",
    short: "This sample",
    href: "/methodology",
    licence: "",
  },
}

export interface PlaceData {
  countries: PlaceCountries | null
  regions: Regions | null
  cities: Cities | null
  /** share (%) of each sampled country's people matching the filter, and how many were sampled */
  filterShare?: Map<string, [share: number, sampled: number]> | null
}

type Val = Stat | null

export interface MetricSource {
  source: SourceKey
  /** extra words after the source's name, e.g. which year or which upstream data */
  note?: string
  country?: (c: Country, d: PlaceData) => Val
  region?: (r: Region) => Val
  city?: (c: City) => Val
}

export type MetricGroup = "People" | "Health" | "Money & work" | "Education" | "Living" | "Climate" | "Belief" | "Your filter"

export interface Metric {
  key: string
  label: string
  group: MetricGroup
  /** one line on what the number means */
  description: string
  format: (v: number) => string
  sources: MetricSource[]
}

// formatting ----------------------------------------------------------------------------

export function compactNumber(n: number) {
  const a = Math.abs(n)
  if (a >= 1e9) return `${(n / 1e9).toFixed(a >= 1e10 ? 0 : 1)}B`
  if (a >= 1e6) return `${(n / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`
  if (a >= 1e3) return `${(n / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k`
  return String(Math.round(n))
}
const pct = (v: number) => `${v.toFixed(v < 10 ? 1 : 0)}%`
const usd = (v: number) => `$${compactNumber(v)}`
const years = (v: number) => `${v.toFixed(1)} yrs`
const plain = (digits: number) => (v: number) => v.toFixed(digits)

// accessors -------------------------------------------------------------------------------

const WDI = wdi.data as unknown as Record<string, Record<string, Stat>>
const wdiStat = (code: string) => (c: Country): Val => WDI[code]?.[c.iso2] ?? null
const wbExtra = (code: string) => (c: Country, d: PlaceData): Val => d.countries?.wb.get(c.iso2)?.[code] ?? null
const gdlNational = (field: "shdi" | "lifexp" | "msch" | "esch" | "gnic" | "pop", scale = 1) => (c: Country, d: PlaceData): Val => {
  const s = d.countries?.gdl.get(c.iso2)?.[field]
  return s ? [s[0] * scale, s[1]] : null
}
const gdlRegion = (field: "shdi" | "lifexp" | "msch" | "esch" | "gnic" | "pop", scale = 1) => (r: Region): Val => {
  const v = r[field]
  return v == null ? null : [v * scale, r.year ?? 0]
}
const city = (field: keyof City, year: number) => (c: City): Val => {
  const v = c[field]
  return typeof v === "number" ? [v, year] : null
}

/** Share (%) of a country's people in some 5-year age bands (UN WPP via the World Bank) */
function bandShare(c: Country, from: number, to: number): Val {
  const { male, female } = c.ageBands
  if (!male.length || !female.length) return null
  const sum = (xs: number[]) => xs.slice(from, to).reduce((a, b) => a + b, 0) / Math.max(1e-9, xs.reduce((a, b) => a + b, 0))
  const f = c.femaleShare / 100
  return [100 * ((1 - f) * sum(male) + f * sum(female)), WDI["SP.POP.0004.MA.5Y"]?.[c.iso2]?.[1] ?? 0]
}

const religion = (name: (typeof RELIGIONS)[number]) => (c: Country): Val => [c.religion[RELIGIONS.indexOf(name)] ?? 0, 0]

// the statistics ----------------------------------------------------------------------------

export const METRICS: Metric[] = [
  {
    key: "population", label: "Population", group: "People", format: compactNumber,
    description: "People living there.",
    sources: [
      { source: "wb", country: wdiStat("SP.POP.TOTL") },
      { source: "gdl", country: gdlNational("pop", 1000), region: gdlRegion("pop", 1000) },
      { source: "ghsl", note: "urban centre, GHS-POP", city: city("pop", 2025) },
    ],
  },
  {
    key: "density", label: "Population density", group: "People", format: (v) => `${compactNumber(v)}/km²`,
    description: "People per square kilometre (of land, for countries; of the built-up urban centre, for cities).",
    sources: [
      { source: "wb", country: wbExtra("EN.POP.DNST") },
      { source: "ghsl", city: (c) => (c.area ? [c.pop / c.area, 2025] : null) },
    ],
  },
  {
    key: "growth", label: "Growth since 1975", group: "People", format: (v) => `×${v.toFixed(v < 10 ? 1 : 0)}`,
    description: "How many times more people live in the city than in 1975.",
    sources: [{ source: "ghsl", city: (c) => (c.pop1975 ? [c.pop / c.pop1975, 2025] : null) }],
  },
  {
    key: "urban", label: "Living in cities", group: "People", format: pct,
    description: "Share of people living in urban areas, by each country’s own definition.",
    sources: [{ source: "wb", country: wdiStat("SP.URB.TOTL.IN.ZS") }],
  },
  {
    key: "medianAge", label: "Median age", group: "People", format: years,
    description: "Half the people are younger than this.",
    sources: [{ source: "table", note: "UN World Population Prospects", country: (c) => [c.medianAge, 0] }],
  },
  {
    key: "young", label: "Children under 15", group: "People", format: pct,
    description: "Share of people aged 0–14.",
    sources: [
      { source: "wb", note: "UN WPP age structure", country: (c) => bandShare(c, 0, 3) },
      { source: "ghsl", note: "WorldPop", city: city("young", 2020) },
    ],
  },
  {
    key: "old", label: "Aged 65 and over", group: "People", format: pct,
    description: "Share of people aged 65 or older.",
    sources: [
      { source: "wb", note: "UN WPP age structure", country: (c) => bandShare(c, 13, 17) },
      { source: "ghsl", note: "WorldPop", city: city("old", 2020) },
    ],
  },
  {
    key: "fertility", label: "Births per woman", group: "People", format: plain(2),
    description: "Children a woman would have at today’s birth rates (total fertility rate).",
    sources: [{ source: "wb", country: wdiStat("SP.DYN.TFRT.IN") }],
  },
  {
    key: "migrants", label: "Born abroad", group: "People", format: pct,
    description: "Share of residents born in another country (international migrant stock).",
    sources: [{ source: "wb", country: wdiStat("SM.POP.TOTL.ZS") }],
  },
  {
    key: "lifexp", label: "Life expectancy", group: "Health", format: years,
    description: "Years a newborn would live at today’s death rates.",
    sources: [
      { source: "wb", country: wdiStat("SP.DYN.LE00.IN") },
      { source: "gdl", country: gdlNational("lifexp"), region: gdlRegion("lifexp") },
      { source: "ghsl", note: "from Global Data Lab regions", city: city("lifexp", 2020) },
    ],
  },
  {
    key: "u5mort", label: "Child deaths before 5", group: "Health", format: (v) => `${v.toFixed(v < 10 ? 1 : 0)} per 1,000`,
    description: "Children who die before their fifth birthday, per 1,000 born alive.",
    sources: [{ source: "wb", country: wbExtra("SH.DYN.MORT") }],
  },
  {
    key: "hospital", label: "Near a hospital", group: "Health", format: pct,
    description: "Share of the city’s people within reach of a hospital (healthsites.io).",
    sources: [{ source: "ghsl", city: city("hospital", 2025) }],
  },
  {
    key: "hdi", label: "Human Development Index", group: "Education", format: plain(3),
    description: "UNDP’s summary of health, schooling and income, from 0 to 1.",
    sources: [
      { source: "gdl", country: gdlNational("shdi"), region: gdlRegion("shdi") },
      { source: "ghsl", note: "from Global Data Lab regions", city: city("hdi", 2020) },
    ],
  },
  {
    key: "msch", label: "Years of schooling", group: "Education", format: years,
    description: "Average years adults aged 25 and over spent in school.",
    sources: [
      { source: "gdl", country: gdlNational("msch"), region: gdlRegion("msch") },
      { source: "ghsl", note: "from Global Data Lab regions", city: city("school", 2020) },
    ],
  },
  {
    key: "esch", label: "Expected schooling", group: "Education", format: years,
    description: "Years of school a child starting now can expect.",
    sources: [{ source: "gdl", country: gdlNational("esch"), region: gdlRegion("esch") }],
  },
  {
    key: "tertiary", label: "In higher education", group: "Education", format: pct,
    description: "Tertiary enrolment as a share of the age group (gross; can exceed 100%).",
    sources: [{ source: "wb", country: wbExtra("SE.TER.ENRR") }],
  },
  {
    key: "gdp", label: "GDP per person", group: "Money & work", format: usd,
    description: "Economic output per person, in international dollars (PPP).",
    sources: [
      { source: "wb", country: wbExtra("NY.GDP.PCAP.PP.CD") },
      { source: "ghsl", note: "Kummu et al. gridded GDP", city: city("gdp", 2020) },
    ],
  },
  {
    key: "gni", label: "Income per person", group: "Money & work", format: usd,
    description: "Gross national income per person, in international dollars (PPP).",
    sources: [
      { source: "wb", country: wbExtra("NY.GNP.PCAP.PP.CD") },
      { source: "gdl", note: "2021 PPP $", country: gdlNational("gnic"), region: gdlRegion("gnic") },
    ],
  },
  {
    key: "earnings", label: "Typical earnings", group: "Money & work", format: usd,
    description: "Median annual earnings of a full-time worker, US$ (what the sample is calibrated on).",
    sources: [{ source: "table", country: (c) => [c.medianIncome, 0] }],
  },
  {
    key: "poverty", label: "Living on under $3 a day", group: "Money & work", format: pct,
    description: "Share of people below the international poverty line ($3.00 a day, 2021 PPP).",
    sources: [{ source: "wb", country: wbExtra("SI.POV.DDAY") }],
  },
  {
    key: "gini", label: "Income inequality", group: "Money & work", format: plain(1),
    description: "Gini index: 0 is perfect equality, 100 is one person having everything.",
    sources: [
      { source: "wb", country: wbExtra("SI.POV.GINI") },
      { source: "table", country: (c) => [c.gini, 0] },
    ],
  },
  {
    key: "unemployment", label: "Unemployment", group: "Money & work", format: pct,
    description: "Share of the labour force without work (ILO modelled).",
    sources: [{ source: "wb", country: wdiStat("SL.UEM.TOTL.ZS") }],
  },
  {
    key: "womenWork", label: "Women in work", group: "Money & work", format: pct,
    description: "Labour force participation of women aged 15 and over (ILO modelled).",
    sources: [{ source: "wb", country: wdiStat("SL.TLF.CACT.FE.ZS") }],
  },
  {
    key: "internet", label: "Online", group: "Living", format: pct,
    description: "Share of people using the internet.",
    sources: [{ source: "wb", country: wdiStat("IT.NET.USER.ZS") }],
  },
  {
    key: "mobile", label: "Mobile internet speed", group: "Living", format: (v) => `${v.toFixed(0)} Mbps`,
    description: "Average mobile download speed (Ookla Speedtest).",
    sources: [{ source: "ghsl", city: city("mobile", 2023) }],
  },
  {
    key: "electricity", label: "Have electricity", group: "Living", format: pct,
    description: "Share of people with access to electricity.",
    sources: [{ source: "wb", country: wbExtra("EG.ELC.ACCS.ZS") }],
  },
  {
    key: "water", label: "Safe drinking water", group: "Living", format: pct,
    description: "Share of people with safely managed drinking water at home.",
    sources: [{ source: "wb", country: wbExtra("SH.H2O.SMDW.ZS") }],
  },
  {
    key: "height", label: "Building height", group: "Living", format: (v) => `${v.toFixed(1)} m`,
    description: "Average height of the city’s buildings.",
    sources: [{ source: "ghsl", city: city("height", 2020) }],
  },
  {
    key: "green", label: "Greenery", group: "Living", format: plain(2),
    description: "How green the built-up area looks from space (mean greenness, 0–1).",
    sources: [{ source: "ghsl", city: city("green", 2025) }],
  },
  {
    key: "co2", label: "CO₂ per person", group: "Climate", format: (v) => `${v.toFixed(1)} t`,
    description: "Carbon dioxide emitted per person per year, excluding land use.",
    sources: [{ source: "wb", country: wbExtra("EN.GHG.CO2.PC.CE.AR5") }],
  },
  {
    key: "temp", label: "Average temperature", group: "Climate", format: (v) => `${v.toFixed(1)} °C`,
    description: "Annual mean temperature over the 2010s (ERA5 reanalysis).",
    sources: [{ source: "ghsl", note: "2010s", city: city("temp", 0) }],
  },
  {
    key: "heat", label: "Heat-stress days", group: "Climate", format: (v) => `${Math.round(v)} days`,
    description: "Days a year when it feels hotter than 32 °C (Universal Thermal Climate Index).",
    sources: [{ source: "ghsl", city: city("heat", 2020) }],
  },
  {
    key: "rain", label: "Rain and snow", group: "Climate", format: (v) => `${compactNumber(v)} mm`,
    description: "Annual precipitation in the 2010s.",
    sources: [{ source: "ghsl", note: "2010s", city: city("rain", 0) }],
  },
  ...(["Christianity", "Islam", "Hinduism", "Buddhism", "Unaffiliated"] as const).map(
    (r): Metric => ({
      key: `religion:${r}`,
      label: r === "Unaffiliated" ? "No religion" : r,
      group: "Belief",
      format: pct,
      description: r === "Unaffiliated" ? "Share of people with no religious affiliation (Pew)." : `Share of people who follow ${r} (Pew).`,
      sources: [{ source: "table", note: "Pew Research Center", country: religion(r) }],
    }),
  ),
  {
    key: "filter", label: "Matching your filter", group: "Your filter", format: pct,
    description: "Share of each country’s sampled people who match the Filter tab.",
    sources: [{ source: "sample", country: (c, d) => d.filterShare?.get(c.iso2) ?? null }],
  },
]

export const METRIC_BY_KEY = new Map(METRICS.map((m) => [m.key, m]))
export const METRIC_GROUPS: MetricGroup[] = ["People", "Health", "Education", "Money & work", "Living", "Climate", "Belief", "Your filter"]

/** Sources of a metric that can colour areas (countries or regions) */
export const areaSources = (m: Metric) => m.sources.filter((s) => s.country || s.region)
export const citySource = (m: Metric) => m.sources.find((s) => s.city) ?? null

// values and colour classes ----------------------------------------------------------------

/** Values by country index (into COUNTRIES), NaN where missing */
export function countryValues(src: MetricSource | null | undefined, d: PlaceData): Float64Array {
  const out = new Float64Array(COUNTRIES.length).fill(NaN)
  if (!src?.country) return out
  COUNTRIES.forEach((c, i) => {
    const v = src.country!(c, d)
    if (v && Number.isFinite(v[0])) out[i] = v[0]
  })
  return out
}

export function regionValues(src: MetricSource | null | undefined, regions: Regions | null): Float64Array {
  const rows = regions?.rows ?? []
  const out = new Float64Array(rows.length).fill(NaN)
  if (!src?.region) return out
  rows.forEach((r, i) => {
    const v = src.region!(r)
    if (v && Number.isFinite(v[0])) out[i] = v[0]
  })
  return out
}

export function cityValues(src: MetricSource | null | undefined, cities: Cities | null): Float64Array {
  const rows = cities?.rows ?? []
  const out = new Float64Array(rows.length).fill(NaN)
  if (!src?.city) return out
  rows.forEach((c, i) => {
    const v = src.city!(c)
    if (v && Number.isFinite(v[0])) out[i] = v[0]
  })
  return out
}

/** How many colour classes the map uses */
export const CLASSES = 6

/**
 * Quantile breaks: `CLASSES - 1` ascending thresholds, so each class holds about the same
 * number of places (fewer when values repeat). Class of v = number of breaks ≤ v.
 */
export function quantileBreaks(values: Float64Array, k = CLASSES): number[] {
  const xs = Array.from(values).filter(Number.isFinite).sort((a, b) => a - b)
  if (xs.length < 2) return []
  const out: number[] = []
  for (let i = 1; i < k; i++) {
    const q = xs[Math.min(xs.length - 1, Math.floor((i / k) * xs.length))]!
    if (q > xs[0]! && (!out.length || q > out[out.length - 1]!)) out.push(q)
  }
  return out
}

export function classOf(v: number, breaks: number[]) {
  if (!Number.isFinite(v)) return -1
  let k = 0
  while (k < breaks.length && v >= breaks[k]!) k++
  return k
}

/** Rank (1 = highest) of `values[i]` among the finite values, and how many there are */
export function rankOf(values: Float64Array, i: number): [rank: number, of: number] | null {
  const v = values[i]
  if (v == null || !Number.isFinite(v)) return null
  let rank = 1
  let of = 0
  for (const x of values) {
    if (!Number.isFinite(x)) continue
    of++
    if (x > v) rank++
  }
  return [rank, of]
}
