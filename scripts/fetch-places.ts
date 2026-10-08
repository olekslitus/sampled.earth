/**
 * Builds the statistics for countries, regions and cities, written to public/places/:
 *
 *   countries.json     World Bank WDI extras and Global Data Lab national values, by ISO2
 *   regions.json       Global Data Lab Subnational HDI (1,800 regions within countries)
 *   regions.topo.json  their outlines (GDL Shapefiles v6.4, simplified), geometry id = row
 *   cities.json        GHSL Urban Centre Database R2024A (11,400 urban centres)
 *
 *   bun scripts/fetch-places.ts [path to "Subnational HDI Data v10.2.csv"]
 *
 * The Subnational HDI CSV needs a (free) Global Data Lab login, so it is not downloaded
 * here: get it from https://globaldatalab.org/shdi/download_files/ (default location:
 * ~/Downloads). Without it, regions are skipped and the previous files are kept.
 *
 * Licences: World Bank data CC BY 4.0; GHSL © European Union, CC BY 4.0; Global Data Lab
 * indicators free for non-commercial use with attribution (https://globaldatalab.org/termsofuse/).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import { spawnSync } from "node:child_process"
import { DatabaseSync } from "node:sqlite"

import { COUNTRIES, type Country } from "../src/lib/sim/countries"
import { insideCountry } from "../src/lib/sim/population"

const CACHE = join(tmpdir(), "sampled-earth-places")
const OUT = new URL("../public/places/", import.meta.url).pathname
mkdirSync(CACHE, { recursive: true })
mkdirSync(OUT, { recursive: true })
const UA = { "user-agent": "sampled.earth/1.0 (https://sampled.earth; data build script)" }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function download(url: string, name: string) {
  const file = join(CACHE, name)
  if (existsSync(file)) return file
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: UA })
      if (!res.ok) throw new Error(`${res.status} ${url}`)
      writeFileSync(file, Buffer.from(await res.arrayBuffer()))
      return file
    } catch (e) {
      if (attempt >= 4) throw e
      await sleep(3000 * attempt)
    }
  }
}

function run(cmd: string[], cwd = CACHE) {
  const p = spawnSync(cmd[0]!, cmd.slice(1), { cwd, stdio: "inherit" })
  if (p.status !== 0) throw new Error(`${cmd.join(" ")} failed`)
}

/** Unpacks one member of a zip into the cache (once) and returns its path */
function unzipped(zip: string, member: string) {
  const file = join(CACHE, member)
  if (!existsSync(file)) run(["unzip", "-oq", zip, member, "-d", CACHE])
  return file
}

/** Minimal RFC 4180 CSV parser (quoted fields, doubled quotes, CRLF) */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === ",") {
      row.push(field)
      field = ""
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++
      row.push(field)
      field = ""
      if (row.length > 1 || row[0]) rows.push(row)
      row = []
    } else field += ch
  }
  if (field || row.length) rows.push([...row, field])
  const header = rows.shift()!.map((h) => h.replace(/^﻿/, "").trim())
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])))
}

const num = (s: unknown) => {
  if (s == null || s === "") return null
  const v = Number(s)
  return Number.isFinite(v) ? v : null
}
const round = (v: number | null, digits: number) => (v == null ? null : Math.round(v * 10 ** digits) / 10 ** digits)

/** "CÃ´te d'Ivoire" → "Côte d'Ivoire" (UTF-8 read as Latin-1 somewhere upstream) */
function fixMojibake(s: string) {
  if (!/[ÃÂ]/.test(s)) return s
  const fixed = Buffer.from(s, "latin1").toString("utf8")
  return fixed.includes("�") ? s : fixed
}

// ---------------------------------------------------------------------------------------
// Countries: ISO codes, extra World Bank indicators

const BY_ISO2 = new Map(COUNTRIES.map((c) => [c.iso2, c]))

const wbCountries = (await (await fetch("https://api.worldbank.org/v2/country?format=json&per_page=400", { headers: UA })).json()) as [
  unknown,
  { id: string; iso2Code: string; name: string }[],
]
const ISO3_TO_ISO2 = new Map(wbCountries[1].map((c) => [c.id, c.iso2Code]))
// Kosovo is XKX at the World Bank and XKO at Global Data Lab
ISO3_TO_ISO2.set("XKO", "XK")

export const WB_EXTRA: Record<string, string> = {
  "NY.GDP.PCAP.PP.CD": "GDP per capita, PPP (current international $)",
  "NY.GNP.PCAP.PP.CD": "GNI per capita, PPP (current international $)",
  "EN.POP.DNST": "Population density (people per km² of land area)",
  "SI.POV.GINI": "Gini index",
  "SI.POV.DDAY": "Poverty headcount ratio at $3.00 a day (2021 PPP, % of population)",
  "EG.ELC.ACCS.ZS": "Access to electricity (% of population)",
  "SH.H2O.SMDW.ZS": "Safely managed drinking water (% of population)",
  "SH.DYN.MORT": "Under-5 mortality (per 1,000 live births)",
  "SE.TER.ENRR": "Tertiary school enrolment (% gross)",
  "EN.GHG.CO2.PC.CE.AR5": "CO₂ emissions per person, excluding land use (t)",
}

/** Most recent value and its year per ISO2 code (cached for the day, as the API is slow) */
async function fetchIndicator(code: string): Promise<Record<string, [number, number]>> {
  const cached = join(CACHE, `wb-${code}-${new Date().toISOString().slice(0, 10)}.json`)
  if (existsSync(cached)) return JSON.parse(readFileSync(cached, "utf8"))
  const out = await fetchIndicatorLive(code)
  writeFileSync(cached, JSON.stringify(out))
  await sleep(700)
  return out
}

async function fetchIndicatorLive(code: string) {
  const url = `https://api.worldbank.org/v2/country/all/indicator/${code}?format=json&mrnev=1&per_page=1000`
  for (let attempt = 0; ; attempt++) {
    const text = await (await fetch(url, { headers: UA })).text()
    try {
      const rows = (JSON.parse(text) as [unknown, { country: { id: string }; date: string; value: number | null }[] | null])[1] ?? []
      const out: Record<string, [number, number]> = {}
      for (const r of rows) if (r.value != null && BY_ISO2.has(r.country.id)) out[r.country.id] = [round(r.value, 3)!, Number(r.date)]
      return out
    } catch {
      if (attempt >= 4) throw new Error(`${code}: ${text.slice(0, 120)}`)
      await sleep(5000 * (attempt + 1))
    }
  }
}

const wb: Record<string, Record<string, [number, number]>> = {}
for (const code of Object.keys(WB_EXTRA)) {
  wb[code] = await fetchIndicator(code)
  console.log(code.padEnd(22), `${Object.keys(wb[code]).length}/${COUNTRIES.length} countries`)
}

// ---------------------------------------------------------------------------------------
// Regions: Global Data Lab Subnational HDI + GDL shapefiles

const gdlCsvPath = process.argv[2] ?? join(homedir(), "Downloads", "Subnational HDI Data v10.2.csv")
const gdlNational: Record<string, Record<string, [number, number]>> = {}
let gdlVersion: string | null = null

/** GDL columns kept, with the number of decimals */
const GDL_FIELDS = { shdi: 3, lifexp: 1, msch: 1, esch: 1, gnic: 0, pop: 0 } as const

if (existsSync(gdlCsvPath)) {
  gdlVersion = /v(\d+(?:\.\d+)?)/.exec(gdlCsvPath)?.[1] ?? null
  const rows = parseCsv(readFileSync(gdlCsvPath, "utf8"))
  const raw = (r: Record<string, string>, name: string) => r[name] ?? r[name.toUpperCase()] ?? r[name.toLowerCase()] ?? ""
  // income comes as the natural log of GNI per capita (2021 PPP $)
  const col = (r: Record<string, string>, name: string) => {
    if (name !== "gnic" || raw(r, "gnic")) return raw(r, name)
    const l = num(raw(r, "lgnic"))
    return l == null ? "" : String(Math.exp(l))
  }
  // newest year with an HDI value, per GDL code
  const latest = new Map<string, Record<string, string>>()
  for (const r of rows) {
    const code = col(r, "GDLCODE")
    if (!code || num(col(r, "shdi")) == null) continue
    const prev = latest.get(code)
    if (!prev || Number(col(r, "year")) > Number(col(prev, "year"))) latest.set(code, r)
  }
  console.log(`GDL: ${rows.length} rows, ${latest.size} areas with an HDI`)

  // outlines: GDL Shapefiles v6.4, hosted by PRIO with GDL's permission
  const zip = await download(
    "https://cdn.cloud.prio.org/files/604a306f-80de-49af-8610-948af8e2e474/GDL%20Shapefiles%20V64.zip",
    "gdl-shapefiles-v6.4.zip",
  )
  const topoFile = join(CACHE, "gdl-regions.topo.json")
  if (!existsSync(topoFile)) {
    run(["unzip", "-oq", zip, "-x", "__MACOSX/*", "-d", CACHE])
    const dir = join(CACHE, "GDL Shapefiles V6")
    const shp = join(dir, readdirSync(dir).find((f) => f.endsWith(".shp"))!)
    // ~0.7% of the vertices is plenty at the zooms regions are shown (and ~640 kB gzipped)
    run([
      "bunx", "mapshaper@0.6.113", "-i", shp, "-filter-fields", "gdlcode", "-rename-layers", "regions",
      "-simplify", "0.7%", "weighted", "keep-shapes", "-clean", "-o", "format=topojson", "quantization=40000", topoFile,
    ])
  }
  const topo = JSON.parse(readFileSync(topoFile, "utf8")) as {
    objects: { regions: { geometries: { type: string | null; properties?: { gdlcode: string }; id?: number }[] } }
  }

  const fields = ["code", "name", "iso2", "country", "year", ...Object.keys(GDL_FIELDS)] as const
  const out: (string | number | null)[][] = []
  const geoms = topo.objects.regions.geometries.filter((g) => g.type)
  for (const g of geoms) {
    const code = g.properties!.gdlcode
    const r = latest.get(code)
    const iso3 = code.slice(0, 3)
    g.id = out.length
    delete g.properties
    out.push([
      code,
      r ? col(r, "region").trim() : null,
      ISO3_TO_ISO2.get(iso3) ?? null,
      r ? col(r, "country").trim() : null,
      r ? Number(col(r, "year")) : null,
      ...Object.entries(GDL_FIELDS).map(([f, d]) => (r ? round(num(col(r, f)), d) : null)),
    ])
  }
  topo.objects.regions.geometries = geoms
  const missing = out.filter((r) => r[1] == null).length
  console.log(`regions: ${out.length} outlines, ${missing} without SHDI values`)

  // national values (GDL "Total" rows, codes like AFGt)
  for (const [code, r] of latest) {
    if (!code.endsWith("t")) continue
    const iso2 = ISO3_TO_ISO2.get(code.slice(0, 3))
    if (!iso2 || !BY_ISO2.has(iso2)) continue
    gdlNational[iso2] = Object.fromEntries(
      Object.entries(GDL_FIELDS).map(([f, d]) => [f, [round(num(col(r, f)), d), Number(col(r, "year"))]]).filter(([, v]) => (v as [number | null])[0] != null),
    )
  }
  writeFileSync(join(OUT, "regions.json"), JSON.stringify({ source: `Global Data Lab Subnational HDI v${gdlVersion}`, fields, rows: out }) + "\n")
  writeFileSync(join(OUT, "regions.topo.json"), JSON.stringify(topo))
} else {
  console.warn(`No Subnational HDI CSV at ${gdlCsvPath}: regions skipped (see the note at the top of this script)`)
  // keep the national values from the previous build
  try {
    const prev = JSON.parse(readFileSync(join(OUT, "countries.json"), "utf8"))
    Object.assign(gdlNational, prev.gdl?.data ?? {})
    gdlVersion = prev.gdl?.version ?? null
  } catch {
    // first build without the CSV
  }
}

const countriesOut: Record<string, Record<string, [number, number]>> = {}
for (const c of COUNTRIES) {
  const row: Record<string, [number, number]> = {}
  for (const code of Object.keys(WB_EXTRA)) if (wb[code]![c.iso2]) row[code] = wb[code]![c.iso2]!
  countriesOut[c.iso2] = row
}
writeFileSync(
  join(OUT, "countries.json"),
  JSON.stringify({
    built: new Date().toISOString().slice(0, 10),
    wb: { source: "World Bank World Development Indicators", indicators: WB_EXTRA, data: countriesOut },
    gdl: gdlVersion ? { source: `Global Data Lab Subnational HDI v${gdlVersion}`, version: gdlVersion, data: gdlNational } : null,
  }) + "\n",
)

// ---------------------------------------------------------------------------------------
// Cities: GHSL Urban Centre Database R2024A (V1.2)

const GHSL = "https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/GHS_UCDB_GLOBE_R2024A/GHS_UCDB_THEME_GLOBE_R2024A"
async function theme(name: string) {
  const base = `GHS_UCDB_THEME_${name}_GLOBE_R2024A`
  const zip = await download(`${GHSL}/${base}/V1-2/${base}_V1_2.zip`, `${base}_V1_2.zip`)
  const db = new DatabaseSync(unzipped(zip, `${base}.gpkg`), { readOnly: true })
  const rows = db.prepare(`select * from GHSL_UCDB_THEME_${name}_GLOBE_R2024A`).all() as Record<string, unknown>[]
  const byId = new Map(rows.map((r) => [Number(r.ID_UC_G0), r]))
  return { db, byId }
}

const general = await theme("GENERAL_CHARACTERISTICS")
const socio = await theme("SOCIOECONOMIC")
const health = await theme("HEALTH")
const climate = await theme("CLIMATE")
const green = await theme("GREENNESS")
const built = await theme("GHSL")

/** World Mollweide (ESRI:54009) → degrees */
function fromMollweide(x: number, y: number): [number, number] {
  const R = 6378137
  const theta = Math.asin(y / (R * Math.SQRT2))
  const lat = Math.asin((2 * theta + Math.sin(2 * theta)) / Math.PI)
  const lon = (Math.PI * x) / (2 * R * Math.SQRT2 * Math.cos(theta))
  return [(lat * 180) / Math.PI, (lon * 180) / Math.PI]
}

const NAME_TO_COUNTRY = new Map<string, Country>()
for (const c of COUNTRIES) {
  NAME_TO_COUNTRY.set(c.name.toLowerCase(), c)
  NAME_TO_COUNTRY.set(c.label.toLowerCase(), c)
}
const unmatched = new Map<string, number>()
function countryOf(names: string[], lat: number, lon: number): Country | null {
  for (const n of names) {
    const hit = NAME_TO_COUNTRY.get(n.toLowerCase())
    if (hit) return hit
  }
  for (const c of COUNTRIES) if (insideCountry(c, lat, lon)) return c
  unmatched.set(names[0]!, (unmatched.get(names[0]!) ?? 0) + 1)
  return null
}

const centroids = general.db.prepare("select ID_UC_G0, GC_UCC_LON_2025 as x, GC_UCC_LAT_2025 as y from UC_centroids").all() as { ID_UC_G0: number; x: number; y: number }[]
const cityFields = [
  "name", "iso2", "country", "lat", "lon", "pop", "pop1975", "area", "capital", "height",
  "gdp", "hdi", "lifexp", "school", "young", "old", "mobile", "hospital", "green", "temp", "rain", "heat", "climate",
] as const
const cities: (string | number | null)[][] = []
for (const { ID_UC_G0: id, x, y } of centroids) {
  const g = general.byId.get(id)
  if (!g) continue
  const s = socio.byId.get(id) ?? {}
  const h = health.byId.get(id) ?? {}
  const cl = climate.byId.get(id) ?? {}
  const gr = green.byId.get(id) ?? {}
  const b = built.byId.get(id) ?? {}
  const pop2020 = num(b.GH_POP_TOT_2020)
  const gdp2020 = num(s.SC_GDP_SUM_2020)
  const [lat, lon] = fromMollweide(x, y)
  const countryNames = [String(g.GC_CNT_UNN_2025 ?? ""), String(g.GC_CNT_GAD_2025 ?? "")].map(fixMojibake).filter(Boolean)
  const c = countryOf(countryNames, lat, lon)
  cities.push([
    fixMojibake(String(g.GC_UCN_MAI_2025 ?? "")),
    c?.iso2 ?? null,
    c ? null : (countryNames[1] ?? countryNames[0] ?? null),
    round(lat, 3),
    round(lon, 3),
    Math.round(Number(g.GC_POP_TOT_2025)),
    round(num(b.GH_POP_TOT_1975), 0),
    num(g.GC_UCA_KM2_2025),
    Number(g.GC_UCM_CAP) === 1 ? 1 : 0,
    round(num(b.GH_BUH_AVG_2020), 1),
    // the GDP layer is a total per grid cell, so divide the sum by the people living there
    gdp2020 != null && pop2020 ? Math.round(gdp2020 / pop2020) : null,
    round(num(s.SC_SEC_HDI_2020), 3),
    round(num(s.SC_SEC_LET_2020), 1),
    round(num(s.SC_SEC_SYT_2020), 1),
    round(num(s.SC_SEC_PCY_2020), 1),
    round(num(s.SC_SEC_PCO_2020), 1),
    round(num(s.SC_CON_DSM_2023), 1),
    round(num(h.HL_SHP_HOS_2025), 1),
    round(num(gr.GR_AVG_GRN_2025), 3),
    round(num(cl.CL_B01_CUR_2010), 1),
    round(num(cl.CL_B12_CUR_2010), 0),
    round(num(cl.CL_UTC_T32_2020), 1),
    cl.CL_KOP_CUR_2025 == null ? null : String(cl.CL_KOP_CUR_2025),
  ])
}
cities.sort((a, b) => (b[5] as number) - (a[5] as number))
console.log(`cities: ${cities.length} urban centres; not in a sampled country:`, [...unmatched].sort((a, b) => b[1] - a[1]).slice(0, 30))
writeFileSync(
  join(OUT, "cities.json"),
  JSON.stringify({ source: "GHSL Urban Centre Database R2024A V1.2 (European Commission, JRC)", fields: cityFields, rows: cities }) + "\n",
)
