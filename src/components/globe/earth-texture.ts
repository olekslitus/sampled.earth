import * as THREE from "three"

import type { Theme } from "@/lib/sim/attributes"
import { drawEarth, EARTH_H, EARTH_STYLE, EARTH_W, type WorldTopology } from "./earth-draw"
import { runInGlobeWorker, whenIdle } from "./worker-client"

/**
 * The earth map is painted at 4096×2048 in the globe worker (a ~200 ms job), so it never
 * blocks the main thread. Until it arrives a plain ocean gradient stands in.
 */

const full = new Map<Theme, Promise<THREE.Texture>>()
const ready = new Map<Theme, THREE.Texture>()

function configure<T extends THREE.Texture>(tex: T): T {
  tex.anisotropy = 8
  tex.colorSpace = THREE.NoColorSpace
  tex.needsUpdate = true
  return tex
}

/**
 * Stand-in until the map is painted: just the ocean gradient, as a tiny data texture
 * (no canvas, so it costs nothing at startup). The caller owns (and disposes) it.
 */
export function placeholderEarthTexture(theme: Theme): THREE.Texture {
  const H = 64
  const [a, b] = EARTH_STYLE[theme].ocean.map(hexBytes)
  const data = new Uint8Array(H * 4)
  for (let y = 0; y < H; y++) {
    const t = 1 - Math.abs(y / (H - 1) - 0.5) * 2
    for (let k = 0; k < 3; k++) data[y * 4 + k] = Math.round(a[k] + (b[k] - a[k]) * t)
    data[y * 4 + 3] = 255
  }
  const tex = new THREE.DataTexture(data, 1, H)
  tex.magFilter = THREE.LinearFilter
  tex.colorSpace = THREE.NoColorSpace
  tex.needsUpdate = true
  return tex
}

function hexBytes(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function drawHere(theme: Theme): Promise<THREE.Texture> {
  return import("world-atlas/countries-50m.json").then(
    (m) =>
      new Promise((resolve) =>
        whenIdle(() => {
          const canvas = document.createElement("canvas")
          canvas.width = EARTH_W
          canvas.height = EARTH_H
          drawEarth(canvas.getContext("2d")!, (m.default ?? m) as unknown as WorldTopology, theme, EARTH_W, EARTH_H)
          resolve(configure(new THREE.CanvasTexture(canvas)))
        }),
      ),
  )
}

/** The full-resolution texture for `theme`, once painted (cached until disposed). */
export function loadEarthTexture(theme: Theme): Promise<THREE.Texture> {
  let p = full.get(theme)
  if (!p) {
    p = runInGlobeWorker({ kind: "texture", theme })
      .then((r) => {
        if (r.kind !== "texture") return drawHere(theme)
        const tex = new THREE.Texture(r.bitmap)
        tex.flipY = false // the worker paints it upside down already
        tex.generateMipmaps = true
        tex.minFilter = THREE.LinearMipmapLinearFilter
        return configure(tex)
      }, () => drawHere(theme))
      .then((tex) => {
        ready.set(theme, tex)
        return tex
      })
    full.set(theme, p)
  }
  return p
}

/** Already painted, so it can be used straight away */
export function readyEarthTexture(theme: Theme): THREE.Texture | undefined {
  return ready.get(theme)
}

/** Frees the GPU copy and the cached bitmap for `theme` (repainted if needed again). */
export function disposeEarthTexture(theme: Theme) {
  const p = full.get(theme)
  if (!p) return
  full.delete(theme)
  ready.delete(theme)
  p.then((tex) => {
    tex.dispose()
    const img = tex.image as { close?: () => void } | null
    img?.close?.()
  })
}
