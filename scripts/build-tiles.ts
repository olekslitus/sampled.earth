/**
 * Cuts NASA Blue Marble: Next Generation (500 m, one mosaic per month of 2004) into the
 * zoom tiles the Satellite style loads when zoomed in, and uploads them to Vercel Blob:
 *
 *   earth/v1/{month 01–12}/{z}/{y}/{x}.webp
 *   earth/v1/night/{z}/{y}/{x}.webp      Black Marble 2016 city lights (500 m)
 *
 * Level z covers the globe with 2^(z+1) × 2^z tiles of 180/2^z degrees, 512 px each, x from
 * −180° eastwards and y from the north pole down (the same grid as src/components/globe/tiles.ts).
 * Levels 3–6 are built: 8192 to 65536 px around the equator, 4.9 km down to 0.6 km a pixel.
 *
 *   bun --env-file=.env.local scripts/build-tiles.ts [month … | night]
 *
 * Needs BLOB_READ_WRITE_TOKEN (vercel env pull). Each source image is a 90° square of
 * 21600 px (A–D west to east, 1 north, 2 south), downloaded to the system temp folder and
 * deleted once its tiles are up. Months listed in the progress file are skipped.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { put } from "@vercel/blob"
import sharp from "sharp"

const PREFIX = "earth/v1"
const LEVELS = [3, 4, 5, 6]
const TILE = 512
const SOURCE = 21600
const QUALITY = 78
const UPLOADS = 48

/** Visible Earth record ids of the monthly mosaics, January first (as in fetch-imagery.ts) */
const BLUE_MARBLE_IDS = [73580, 73605, 73630, 73655, 73701, 73726, 73751, 73776, 73801, 73826, 73884, 73909]
const PARTS = ["A1", "B1", "C1", "D1", "A2", "B2", "C2", "D2"]

const work = join(tmpdir(), "sampled-earth-tiles")
const progressFile = join(work, "done.txt")
mkdirSync(work, { recursive: true })
sharp.concurrency(8)

async function download(url: string, file: string) {
  if (existsSync(file)) return
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`${res.status} ${url}`)
      writeFileSync(file, Buffer.from(await res.arrayBuffer()))
      return
    } catch (e) {
      // NASA's server drops long downloads now and then
      if (attempt >= 5) throw e
      await new Promise((r) => setTimeout(r, 5000 * attempt))
    }
  }
}

async function upload(path: string, body: Buffer) {
  for (let attempt = 1; ; attempt++) {
    try {
      await put(path, body, {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "image/webp",
        cacheControlMaxAge: 31_536_000,
      })
      return
    } catch (e) {
      if (attempt >= 6) throw e
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt))
    }
  }
}

/** Runs `jobs` with at most `limit` in flight */
async function pool<T>(items: T[], limit: number, job: (item: T) => Promise<void>) {
  let next = 0
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < items.length) await job(items[next++]!)
    }),
  )
}

/** Source image of one 90° part of a set: a month ("01"–"12") or "night" */
function sourceUrl(set: string, part: string) {
  if (set === "night") return `https://eoimages.gsfc.nasa.gov/images/imagerecords/144000/144898/BlackMarble_2016_${part}.jpg`
  const id = BLUE_MARBLE_IDS[Number(set) - 1]!
  return `https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/${id}/world.topo.bathy.2004${set}.3x21600x21600.${part}.jpg`
}

async function buildPart(month: string, part: string) {
  const file = join(work, `${month}-${part}.jpg`)
  await download(sourceUrl(month, part), file)
  const meta = await sharp(file, { limitInputPixels: false }).metadata()
  if (meta.width !== SOURCE || meta.height !== SOURCE) throw new Error(`${file} is ${meta.width}×${meta.height}, expected ${SOURCE}²`)
  // decode once; every tile is cut from the raw pixels
  const raw = await sharp(file, { limitInputPixels: false }).removeAlpha().toColourspace("srgb").raw().toBuffer()
  const input = { raw: { width: SOURCE, height: SOURCE, channels: 3 as const }, limitInputPixels: false }
  const col = "ABCD".indexOf(part[0]!)
  const row = Number(part[1]) - 1
  const jobs: { z: number; i: number; j: number }[] = []
  for (const z of LEVELS) {
    const n = 2 ** z / 2
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) jobs.push({ z, i, j })
  }
  let bytes = 0
  await pool(jobs, UPLOADS, async ({ z, i, j }) => {
    const n = 2 ** z / 2
    const size = SOURCE / n
    const tile = await sharp(raw, input)
      .extract({ left: i * size, top: j * size, width: size, height: size })
      .resize(TILE, TILE, { kernel: "lanczos3" })
      .webp({ quality: QUALITY, effort: 4 })
      .toBuffer()
    bytes += tile.length
    await upload(`${PREFIX}/${month}/${z}/${row * n + j}/${col * n + i}.webp`, tile)
  })
  rmSync(file)
  return { tiles: jobs.length, bytes }
}

const done = new Set(existsSync(progressFile) ? readFileSync(progressFile, "utf8").split("\n").filter(Boolean) : [])
const months = process.argv.slice(2).length
  ? process.argv.slice(2).map((m) => (m === "night" ? m : m.padStart(2, "0")))
  : ["night", ...BLUE_MARBLE_IDS.map((_, i) => String(i + 1).padStart(2, "0"))]
if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error("BLOB_READ_WRITE_TOKEN is not set (vercel env pull .env.local)")

for (const month of months) {
  if (done.has(month)) continue
  let tiles = 0
  let bytes = 0
  const t0 = Date.now()
  for (const part of PARTS) {
    const r = await buildPart(month, part)
    tiles += r.tiles
    bytes += r.bytes
    console.log(`${month} ${part}: ${r.tiles} tiles, ${(r.bytes / 1e6).toFixed(1)} MB`)
  }
  appendFileSync(progressFile, `${month}\n`)
  console.log(`month ${month} done: ${tiles} tiles, ${(bytes / 1e6).toFixed(0)} MB in ${((Date.now() - t0) / 60000).toFixed(1)} min`)
}
