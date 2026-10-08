/**
 * Downloads the public statistics the simulation is calibrated on and writes them to
 * src/lib/sim/data/wdi.json, which is bundled with the app (no runtime requests).
 *
 *   bun scripts/fetch-data.ts
 *
 * Source: World Bank World Development Indicators API (https://api.worldbank.org/v2),
 * most recent non-empty value per country. Age structure in WDI comes from the UN
 * World Population Prospects; labour and employment series are ILO modelled estimates.
 */
import { writeFileSync } from "node:fs"
import { COUNTRIES } from "../src/lib/sim/countries"

const BANDS = ["0004", "0509", "1014", "1519", "2024", "2529", "3034", "3539", "4044", "4549", "5054", "5559", "6064", "6569", "7074", "7579", "80UP"]

export const INDICATORS: Record<string, string> = {
  "SP.POP.TOTL": "Population, total",
  "SP.POP.TOTL.FE.ZS": "Population, female (% of total)",
  "SP.URB.TOTL.IN.ZS": "Urban population (% of total)",
  "SP.DYN.LE00.IN": "Life expectancy at birth (years)",
  "SP.DYN.TFRT.IN": "Fertility rate (births per woman)",
  "SP.DYN.CBRT.IN": "Birth rate, crude (per 1,000 people)",
  "SP.DYN.CDRT.IN": "Death rate, crude (per 1,000 people)",
  "IT.NET.USER.ZS": "Individuals using the Internet (% of population)",
  "SL.AGR.EMPL.ZS": "Employment in agriculture (% of total employment, ILO modelled)",
  "SL.IND.EMPL.ZS": "Employment in industry (% of total employment, ILO modelled)",
  "SM.POP.TOTL.ZS": "International migrant stock (% of population)",
  "SL.TLF.CACT.MA.ZS": "Labour force participation, male (% of males 15+, ILO modelled)",
  "SL.TLF.CACT.FE.ZS": "Labour force participation, female (% of females 15+, ILO modelled)",
  "SL.UEM.TOTL.ZS": "Unemployment (% of labour force, ILO modelled)",
  "SE.PRM.UNER.ZS": "Children out of school (% of primary school age)",
  "SE.SEC.UNER.LO.ZS": "Adolescents out of school (% of lower secondary school age)",
}
for (const b of BANDS) {
  const range = b === "80UP" ? "80 and above" : `${b.slice(0, 2)}-${b.slice(2)}`
  INDICATORS[`SP.POP.${b}.MA.5Y`] = `Population ages ${range}, male (% of male population)`
  INDICATORS[`SP.POP.${b}.FE.5Y`] = `Population ages ${range}, female (% of female population)`
}

type Row = { country: { id: string }; date: string; value: number | null }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Most recent value and its year, per ISO2 code. Requests go one at a time: the API rate-limits bursts. */
async function fetchIndicator(code: string) {
  const url = `https://api.worldbank.org/v2/country/all/indicator/${code}?format=json&mrnev=1&per_page=1000`
  for (let attempt = 0; ; attempt++) {
    const text = await (await fetch(url, { headers: { "User-Agent": "sampled.earth data script (https://sampled.earth)" } })).text()
    try {
      const rows = (JSON.parse(text) as [unknown, Row[] | null])[1] ?? []
      const wanted = new Set(COUNTRIES.map((c) => c.iso2))
      const out: Record<string, [number, number]> = {}
      for (const r of rows) {
        if (r.value != null && wanted.has(r.country.id)) out[r.country.id] = [Math.round(r.value * 1000) / 1000, Number(r.date)]
      }
      return out
    } catch {
      if (attempt >= 4) throw new Error(`${code}: ${text.slice(0, 120)}`)
      await sleep(5000 * (attempt + 1))
    }
  }
}

const data: Record<string, Record<string, [number, number]>> = {}
const codes = Object.keys(INDICATORS)
for (const code of codes) {
  data[code] = await fetchIndicator(code)
  console.log(code.padEnd(20), `${Object.keys(data[code]).length}/${COUNTRIES.length} countries`)
  await sleep(700)
}

writeFileSync(
  new URL("../src/lib/sim/data/wdi.json", import.meta.url),
  JSON.stringify({ source: "World Bank World Development Indicators", fetched: new Date().toISOString().slice(0, 10), indicators: INDICATORS, data }) + "\n",
)
