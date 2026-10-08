/**
 * Draws the site icons from Lucide's "earth" icon (ISC licence):
 *
 *   src/app/icon.svg        blue line icon, lighter when the browser is in dark mode
 *   src/app/favicon.ico     16, 32 and 48 px for browsers without SVG favicons
 *   src/app/apple-icon.png  180 px on a dark tile for home screens
 *
 *   bun scripts/make-icons.ts
 */
import { writeFileSync } from "node:fs"
import { Earth } from "lucide"
import sharp from "sharp"

const LIGHT = "#1f6fd1"
const DARK = "#6aa8ff"
const TILE = "#0b1020"

const shapes = Earth
  .map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(" ")}/>`)
  .join("")

/** The icon in a 24-unit box, stroked in `stroke`, optionally inset on a square tile (iOS rounds the corners) */
function svg({ stroke, tile, inset = 0, style = "" }: { stroke: string; tile?: string; inset?: number; style?: string }) {
  const size = 24 + inset * 2
  const bg = tile ? `<rect width="${size}" height="${size}" fill="${tile}"/>` : ""
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">${style}${bg}` +
    `<g transform="translate(${inset} ${inset})" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${shapes}</g></svg>`
  )
}

const out = new URL("../src/app/", import.meta.url).pathname

writeFileSync(
  `${out}icon.svg`,
  svg({ stroke: "currentColor", style: `<style>svg{color:${LIGHT}}@media (prefers-color-scheme:dark){svg{color:${DARK}}}</style>` }) + "\n",
)

/** ICO holding PNG images (supported by every current browser) */
const sizes = [16, 32, 48]
const pngs = await Promise.all(sizes.map((s) => sharp(Buffer.from(svg({ stroke: "#3d8ff0" })), { density: 72 * (s / 24) * 2 }).resize(s, s).png().toBuffer()))
const header = Buffer.alloc(6 + 16 * sizes.length)
header.writeUInt16LE(0, 0)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(sizes.length, 4)
let offset = header.length
sizes.forEach((s, i) => {
  const e = 6 + i * 16
  header.writeUInt8(s, e)
  header.writeUInt8(s, e + 1)
  header.writeUInt16LE(1, e + 4)
  header.writeUInt16LE(32, e + 6)
  header.writeUInt32LE(pngs[i]!.length, e + 8)
  header.writeUInt32LE(offset, e + 12)
  offset += pngs[i]!.length
})
writeFileSync(`${out}favicon.ico`, Buffer.concat([header, ...pngs]))

await sharp(Buffer.from(svg({ stroke: "#ffffff", tile: TILE, inset: 6 })), { density: 72 * (180 / 36) * 2 })
  .resize(180, 180)
  .png()
  .toFile(`${out}apple-icon.png`)

console.log("wrote icon.svg, favicon.ico, apple-icon.png")
