/**
 * Copies the SVG flag of every modelled country into public/flags/, so a flag is only
 * downloaded when a card shows it.
 *
 *   bun scripts/copy-flags.ts
 *
 * Source: country-flag-icons (MIT, https://gitlab.com/catamphetamine/country-flag-icons), 3:2 aspect.
 */
import { copyFileSync, mkdirSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { COUNTRIES } from "../src/lib/sim/countries"

const require = createRequire(import.meta.url)
const source = join(dirname(require.resolve("country-flag-icons/package.json")), "3x2")
const target = new URL("../public/flags/", import.meta.url).pathname
mkdirSync(target, { recursive: true })
for (const c of COUNTRIES) copyFileSync(join(source, `${c.iso2}.svg`), join(target, `${c.iso2}.svg`))
console.log(`copied ${COUNTRIES.length} flags to public/flags/`)
