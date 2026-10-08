/**
 * Downloads the catalogues and textures for the zoom out into space and writes compact
 * versions to public/space/:
 *
 *   stars.bin        HYG v4.1 stars (naked eye plus everything within 200 light-years)
 *   stars.json       names of the brightest and nearest of them
 *   milkyway.webp    NASA SVS Deep Star Maps 2020 Milky Way glow (stars removed), celestial
 *   galaxies.json    Karachentsev+ 2013 Updated Nearby Galaxy Catalog (~870 within 36 Mly)
 *   web.bin          2MASS Redshift Survey (Huchra+ 2012), 44k galaxies out to ~1.4 Gly
 *   cmb.webp         WMAP 9-year ILC microwave sky (NASA), reprojected to celestial
 *   planets/*.webp   Solar System Scope 2k textures (CC BY 4.0)
 *
 * Positions are written in the app's sky frame: J2000 equatorial axes with three.js's
 * y pointing north, i.e. (x, y, z) = (x_eq, z_eq, -y_eq). See src/lib/space/frames.ts.
 *
 *   bun scripts/fetch-space.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import sharp from "sharp"
import { FloatType } from "three"
import { EXRLoader } from "three/examples/jsm/loaders/EXRLoader.js"

const CACHE = join(tmpdir(), "sampled-earth-space")
const OUT = new URL("../public/space/", import.meta.url).pathname
mkdirSync(CACHE, { recursive: true })
mkdirSync(join(OUT, "planets"), { recursive: true })

const LY_PER_PC = 3.26156

async function download(url: string, name: string) {
  const file = join(CACHE, name)
  if (existsSync(file)) return file
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": "sampled.earth/1.0 (https://sampled.earth; data build script)" } })
      if (!res.ok) throw new Error(`${res.status} ${url}`)
      writeFileSync(file, Buffer.from(await res.arrayBuffer()))
      return file
    } catch (e) {
      if (attempt >= 4) throw e
      await new Promise((r) => setTimeout(r, 3000 * attempt))
    }
  }
}

/** Equatorial unit vector in the app's sky frame */
function skyDir(raDeg: number, decDeg: number): [number, number, number] {
  const ra = (raDeg * Math.PI) / 180
  const dec = (decDeg * Math.PI) / 180
  const c = Math.cos(dec)
  return [Math.cos(ra) * c, Math.sin(dec), -Math.sin(ra) * c]
}

/** Parse a VizieR ASU tab-separated table into rows keyed by column name */
function vizier(text: string) {
  const lines = text.split("\n").filter((l) => l && !l.startsWith("#"))
  const header = lines[0]!.split("\t").map((s) => s.trim())
  // the header is followed by a units line and a dashes line
  return lines.slice(3).map((l) => {
    const cells = l.split("\t")
    return Object.fromEntries(header.map((h, i) => [h, (cells[i] ?? "").trim()]))
  })
}

function sexagesimal(s: string, hours: boolean) {
  const sign = s.trim().startsWith("-") ? -1 : 1
  const [a = 0, b = 0, c = 0] = s.replace(/[+-]/, "").trim().split(/[\s:]+/).map(Number)
  return sign * (a + b / 60 + c / 3600) * (hours ? 15 : 1)
}

// ---------------------------------------------------------------------------------------
// Stars

async function stars() {
  const file = await download("https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/CURRENT/hygdata_v41.csv", "hyg.csv")
  const lines = readFileSync(file, "utf8").split("\n")
  const header = lines[0]!.split(",").map((h) => h.replaceAll('"', ""))
  const col = (name: string) => header.indexOf(name)
  const [iId, iProper, iDist, iMag, iAbs, iCi, iX, iY, iZ, iCon, iBayer] = ["id", "proper", "dist", "mag", "absmag", "ci", "x", "y", "z", "con", "bayer"].map(col)
  type Star = { x: number; y: number; z: number; abs: number; ci: number; mag: number; dist: number; name: string }
  const list: Star[] = []
  for (const line of lines.slice(1)) {
    if (!line) continue
    const f = line.split(",").map((s) => s.replaceAll('"', ""))
    if (f[iId!] === "0") continue // the Sun is drawn by the app
    const dist = Number(f[iDist!])
    const mag = Number(f[iMag!])
    if (!(dist > 0 && dist < 100000)) continue
    if (!(mag <= 7 || dist * LY_PER_PC <= 200)) continue
    const bayer = f[iBayer!] && f[iCon!] ? `${f[iBayer!]} ${f[iCon!]}` : ""
    list.push({
      // HYG: x towards RA 0h, y towards RA 6h, z north (parsecs)
      x: Number(f[iX!]) * LY_PER_PC,
      y: Number(f[iZ!]) * LY_PER_PC,
      z: -Number(f[iY!]) * LY_PER_PC,
      abs: Number(f[iAbs!]),
      ci: f[iCi!] ? Number(f[iCi!]) : 0.6,
      mag,
      dist: dist * LY_PER_PC,
      name: f[iProper!] || "",
    })
    if (!list.at(-1)!.name && dist * LY_PER_PC < 15 && bayer) list.at(-1)!.name = bayer
  }
  // brightest first, so the renderer can stop early on slow devices
  list.sort((a, b) => a.mag - b.mag)
  const buf = new Float32Array(list.length * 5)
  list.forEach((s, i) => buf.set([s.x, s.y, s.z, s.abs, s.ci], i * 5))
  writeFileSync(join(OUT, "stars.bin"), Buffer.from(buf.buffer))
  const names = list.flatMap((s, i) => (s.name && (s.mag < 2.6 || s.dist < 16) ? [[i, s.name, Math.round(s.dist * 100) / 100]] : []))
  writeFileSync(join(OUT, "stars.json"), JSON.stringify(names))
  console.log(`stars: ${list.length}, named ${names.length}`)
}

// ---------------------------------------------------------------------------------------
// Sky glow, CMB

async function milkyWay() {
  const file = await download("https://svs.gsfc.nasa.gov/vis/a000000/a004800/a004851/milkyway_2020_4k.exr", "milkyway_4k.exr")
  const buf = readFileSync(file)
  const loader = new EXRLoader()
  loader.setDataType(FloatType)
  const exr = loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer)
  const width = exr.width as number
  const height = exr.height as number
  const data = exr.data as Float32Array
  const out = Buffer.alloc(width * height * 3)
  for (let j = 0; j < height; j++) {
    // EXRLoader returns rows bottom-up (for WebGL)
    const row = height - 1 - j
    for (let i = 0; i < width; i++) {
      const s = (row * width + i) * 4
      const o = (j * width + i) * 3
      for (let c = 0; c < 3; c++) out[o + c] = Math.round(255 * Math.min(1, Math.pow(Math.max(0, data[s + c]!), 1 / 2.2)))
    }
  }
  await sharp(out, { raw: { width, height, channels: 3 } }).webp({ quality: 70 }).toFile(join(OUT, "milkyway.webp"))
  console.log("milkyway.webp")
}

/**
 * WMAP's map is a Mollweide projection in galactic coordinates (centre l = 0, l growing to
 * the left). Reproject to an equirectangular map in celestial coordinates (RA 0h in the
 * middle, RA growing to the left, as the sky is seen from inside), like milkyway.webp.
 */
async function cmb() {
  const file = await download("https://upload.wikimedia.org/wikipedia/commons/e/ed/WMAP_2012.png", "wmap.png")
  const src = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: sw, height: sh } = src.info
  const W = 2048
  const H = 1024
  const out = Buffer.alloc(W * H * 3)
  // J2000 equatorial -> galactic (Hipparcos)
  const A = [
    [-0.054875560416215, -0.873437090234885, -0.483835015548713],
    [0.494109427875583, -0.444829629960011, 0.746982244497218],
    [-0.867666149019004, -0.198076373431201, 0.455983776175066],
  ]
  for (let j = 0; j < H; j++) {
    const dec = (90 - ((j + 0.5) / H) * 180) * (Math.PI / 180)
    for (let i = 0; i < W; i++) {
      const ra = (180 - ((i + 0.5) / W) * 360) * (Math.PI / 180)
      const e = [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)]
      const g = A.map((r) => r[0]! * e[0]! + r[1]! * e[1]! + r[2]! * e[2]!)
      const b = Math.asin(Math.max(-1, Math.min(1, g[2]!)))
      let l = Math.atan2(g[1]!, g[0]!)
      // Mollweide forward projection (l to the left)
      let t = b
      for (let k = 0; k < 20; k++) {
        const f = (2 * t + Math.sin(2 * t) - Math.PI * Math.sin(b)) / (2 + 2 * Math.cos(2 * t))
        t -= f
        if (Math.abs(f) < 1e-9) break
      }
      if (Math.abs(b) > Math.PI / 2 - 1e-6) t = Math.sign(b) * (Math.PI / 2)
      if (l > Math.PI) l -= 2 * Math.PI
      // (pulled in slightly so the ellipse's anti-aliased rim is never sampled)
      const x = (-l / Math.PI) * Math.cos(t) * 0.994
      const y = Math.sin(t) * 0.994
      const sx = Math.min(sw - 1, Math.max(0, Math.round(((x + 1) / 2) * (sw - 1))))
      const sy = Math.min(sh - 1, Math.max(0, Math.round(((1 - y) / 2) * (sh - 1))))
      src.data.copy(out, (j * W + i) * 3, (sy * sw + sx) * 3, (sy * sw + sx) * 3 + 3)
    }
  }
  await sharp(out, { raw: { width: W, height: H, channels: 3 } }).webp({ quality: 82 }).toFile(join(OUT, "cmb.webp"))
  console.log("cmb.webp")
}

// ---------------------------------------------------------------------------------------
// Galaxies

async function nearbyGalaxies() {
  const url =
    "https://vizier.cds.unistra.fr/viz-bin/asu-tsv?-source=J/AJ/145/101/catalog&-out.max=unlimited&-out=Name,RAJ2000,DEJ2000,a26,b/a,TT,Mcl,Dist,BMag"
  const rows = vizier(readFileSync(await download(url, "karachentsev.tsv"), "utf8"))
  const out: [string, number, number, number, number, number, number][] = []
  for (const r of rows) {
    const dist = Number(r.Dist) * 1e6 * LY_PER_PC // Mpc -> ly
    if (!(dist > 0) || !r.RAJ2000) continue
    const ra = sexagesimal(r.RAJ2000, true)
    const dec = sexagesimal(r.DEJ2000!, false)
    const [x, y, z] = skyDir(ra, dec).map((v) => Math.round((v * dist) / 100) / 10) // kly
    // diameter in kly from the angular size (arcmin) at that distance
    const size = r.a26 ? Math.round(((Number(r.a26) / 60) * (Math.PI / 180) * dist) / 100) / 10 : 3
    const type = r.TT ? Number(r.TT) : 10
    out.push([r.Name!, x!, y!, z!, size, type, r.BMag ? Number(r.BMag) : -12])
  }
  writeFileSync(join(OUT, "galaxies.json"), JSON.stringify(out))
  console.log(`galaxies.json: ${out.length}`)
}

async function cosmicWeb() {
  const url = "https://vizier.cds.unistra.fr/viz-bin/asu-tsv?-source=J/ApJS/199/26/table3&-out.max=unlimited&-out=RAJ2000,DEJ2000,Kcmag,cz"
  const rows = vizier(readFileSync(await download(url, "2mrs.tsv"), "utf8"))
  const H0 = 70 // km/s/Mpc
  const list: number[] = []
  for (const r of rows) {
    const cz = Number(r.cz)
    if (!(cz > 0)) continue
    const dist = (cz / H0) * LY_PER_PC // Mly
    const [x, y, z] = skyDir(Number(r.RAJ2000), Number(r.DEJ2000))
    // 0.05 Mly steps fit ±1600 Mly in 16 bits
    list.push(Math.round((x * dist) / 0.05), Math.round((y * dist) / 0.05), Math.round((z * dist) / 0.05), Math.round(Number(r.Kcmag) * 10))
  }
  const buf = new Int16Array(list.map((v) => Math.max(-32767, Math.min(32767, v))))
  writeFileSync(join(OUT, "web.bin"), Buffer.from(buf.buffer))
  console.log(`web.bin: ${list.length / 4}`)
}

// ---------------------------------------------------------------------------------------
// Planet textures

async function planets() {
  const names = ["sun", "mercury", "venus_atmosphere", "mars", "jupiter", "saturn", "uranus", "neptune", "moon"]
  for (const n of names) {
    const file = await download(`https://www.solarsystemscope.com/textures/download/2k_${n}.jpg`, `2k_${n}.jpg`)
    await sharp(file).resize(2048, 1024, { fit: "fill" }).webp({ quality: 82 }).toFile(join(OUT, "planets", `${n.replace("_atmosphere", "")}.webp`))
  }
  const ring = await download("https://www.solarsystemscope.com/textures/download/2k_saturn_ring_alpha.png", "2k_saturn_ring_alpha.png")
  await sharp(ring).webp({ quality: 90, alphaQuality: 90 }).toFile(join(OUT, "planets", "saturn_ring.webp"))
  console.log("planets")
}

const steps = { stars, milkyWay, cmb, nearbyGalaxies, cosmicWeb, planets }
const only = process.argv.slice(2) as (keyof typeof steps)[]
for (const [name, step] of Object.entries(steps)) {
  if (only.length && !only.includes(name as keyof typeof steps)) continue
  await step()
}
