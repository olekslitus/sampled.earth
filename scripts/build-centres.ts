/**
 * Builds src/lib/sim/data/centres.json, the urban centres the simulation places people in,
 * from the GHSL cities in public/places/cities.json (written by fetch-places.ts).
 *
 *   bun scripts/build-centres.ts
 *
 * Per sampled country: [name, lat, lon, residents (thousands), built-up area (km²)],
 * largest first. Bundled with the simulation, so it keeps centres of 100,000 people or more
 * (and every country's five largest); people in smaller ones are placed as town dwellers.
 */
import { readFileSync, writeFileSync } from "node:fs"

const cities = JSON.parse(readFileSync(new URL("../public/places/cities.json", import.meta.url), "utf8")) as {
  source: string
  fields: string[]
  rows: (string | number | null)[][]
}
const col = (name: string) => cities.fields.indexOf(name)
const [NAME, ISO2, LAT, LON, POP, AREA] = ["name", "iso2", "lat", "lon", "pop", "area"].map(col)

const countries: Record<string, [string, number, number, number, number][]> = {}
let skipped = 0
for (const r of cities.rows) {
  const iso2 = r[ISO2!] as string | null
  // "Rotterdam [The Hague]" → "Rotterdam"; the few unnamed centres are left out
  const name = String(r[NAME!] ?? "").replace(/\s*\[.*\]$/, "").trim()
  const pop = Number(r[POP!])
  if (!iso2 || !name || !(pop > 0)) {
    skipped++
    continue
  }
  ;(countries[iso2] ??= []).push([
    name,
    Math.round(Number(r[LAT!]) * 100) / 100,
    Math.round(Number(r[LON!]) * 100) / 100,
    Math.max(1, Math.round(pop / 1000)),
    Math.round(Number(r[AREA!]) || 0),
  ])
}
for (const [iso2, list] of Object.entries(countries)) {
  list.sort((a, b) => b[3] - a[3])
  countries[iso2] = list.filter((x, i) => i < 5 || x[3] >= 100)
}

const out = new URL("../src/lib/sim/data/centres.json", import.meta.url).pathname
writeFileSync(out, JSON.stringify({ source: cities.source, fields: ["name", "lat", "lon", "popK", "areaKm2"], countries }) + "\n")
const n = Object.values(countries).reduce((s, l) => s + l.length, 0)
console.log(`centres: ${n} in ${Object.keys(countries).length} countries (${skipped} skipped) → ${out}`)
