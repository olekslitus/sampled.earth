/**
 * Downloads the satellite imagery for the globe's Satellite style into public/earth/:
 *
 *   day-01.webp … day-12.webp   NASA Blue Marble: Next Generation, one cloud-free mosaic per
 *                                month of 2004, with topography and bathymetry
 *   night.webp                  NASA Black Marble 2016 (VIIRS city lights)
 *
 * each at 4096×2048 (equirectangular, north up, −180° on the left) plus a 1024×512 "-1k"
 * copy that loads first.
 *
 *   bun scripts/fetch-imagery.ts
 *
 * Both are NASA imagery and in the public domain. Blue Marble comes from NASA Visible Earth;
 * Black Marble is stitched from NASA GIBS map tiles.
 */
import { mkdirSync } from "node:fs"
import sharp, { type OverlayOptions } from "sharp"

const OUT = new URL("../public/earth/", import.meta.url).pathname
const W = 4096
const H = 2048
const QUALITY = 80

/** Visible Earth record ids of the monthly Blue Marble: Next Generation mosaics, January first */
const BLUE_MARBLE_IDS = [73580, 73605, 73630, 73655, 73701, 73726, 73751, 73776, 73801, 73826, 73884, 73909]

async function download(url: string): Promise<Buffer> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url)
    if (res.ok) return Buffer.from(await res.arrayBuffer())
    if (attempt >= 3) throw new Error(`${res.status} ${url}`)
    await new Promise((r) => setTimeout(r, 2000 * attempt))
  }
}

async function write(image: Buffer, name: string) {
  for (const [w, h, suffix] of [[W, H, ""], [W / 4, H / 4, "-1k"]] as const) {
    const info = await sharp(image, { limitInputPixels: false })
      .resize(w, h, { fit: "fill", kernel: "lanczos3" })
      .webp({ quality: QUALITY, effort: 6 })
      .toFile(`${OUT}${name}${suffix}.webp`)
    console.log(`${name}${suffix}.webp  ${(info.size / 1024).toFixed(0)} KB`)
  }
}

async function blueMarble() {
  for (const [i, id] of BLUE_MARBLE_IDS.entries()) {
    const month = String(i + 1).padStart(2, "0")
    const url = `https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/${id}/world.topo.bathy.2004${month}.3x5400x2700.jpg`
    await write(await download(url), `day-${month}`)
  }
}

/** GIBS level 3 of the 500m EPSG:4326 grid is 10 × 5 tiles of 36°, 512 px each */
async function blackMarble() {
  const cols = 10
  const rows = 5
  const tile = 512
  const tiles: OverlayOptions[] = []
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < cols; col++) {
      const url = `https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/VIIRS_Black_Marble/default/2016-01-01/500m/3/${row}/${col}.png`
      tiles.push({ input: await download(url), left: col * tile, top: row * tile })
    }
  const mosaic = await sharp({ create: { width: cols * tile, height: rows * tile, channels: 3, background: "#000" } })
    .composite(tiles)
    .png()
    .toBuffer()
  await write(mosaic, "night")
}

mkdirSync(OUT, { recursive: true })
await blackMarble()
await blueMarble()
