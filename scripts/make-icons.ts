/**
 * Draws the site icons from Lucide's "earth" icon (ISC licence), white on a black disc:
 *
 *   src/app/icon.svg        the disc, for browsers with SVG favicons
 *   src/app/favicon.ico     16, 32 and 48 px for browsers without them
 *   src/app/apple-icon.png  180 px on a full black tile for home screens (iOS rounds the corners)
 *
 *   bun scripts/make-icons.ts
 */
import { writeFileSync } from "node:fs"
import { Earth } from "lucide"
import sharp from "sharp"

const DISC = "#000000"
const LINE = "#ffffff"

const shapes = Earth
  .map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(" ")}/>`)
  .join("")

/**
 * The earth scaled by `scale` into the middle of a 24-unit box, on a disc (or a full square
 * `tile`). Lucide's lines are 2 units wide; small sizes pass a heavier `weight` to stay crisp.
 */
function svg({ scale = 0.6, weight = 2.4, tile = false }: { scale?: number; weight?: number; tile?: boolean } = {}) {
  const bg = tile ? `<rect width="24" height="24" fill="${DISC}"/>` : `<circle cx="12" cy="12" r="12" fill="${DISC}"/>`
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${bg}` +
    `<g transform="translate(12 12) scale(${scale}) translate(-12 -12)" fill="none" stroke="${LINE}" stroke-width="${weight}" stroke-linecap="round" stroke-linejoin="round">${shapes}</g></svg>`
  )
}

const out = new URL("../src/app/", import.meta.url).pathname

writeFileSync(`${out}icon.svg`, svg() + "\n")

/** ICO holding PNG images (supported by every current browser) */
const sizes = [16, 32, 48]
const pngs = await Promise.all(
  sizes.map((s) =>
    sharp(Buffer.from(svg({ scale: s <= 16 ? 0.66 : 0.62, weight: s <= 16 ? 3 : 2.6 })), { density: 72 * (s / 24) * 4 })
      .resize(s, s)
      .png()
      .toBuffer(),
  ),
)
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

await sharp(Buffer.from(svg({ tile: true, scale: 0.58, weight: 2 })), { density: 72 * (180 / 24) * 2 })
  .resize(180, 180)
  .png()
  .toFile(`${out}apple-icon.png`)

console.log("wrote icon.svg, favicon.ico, apple-icon.png")
