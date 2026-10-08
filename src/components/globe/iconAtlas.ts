import * as THREE from "three"
import type { IconNode } from "lucide"

/** Standalone SVG markup for a Lucide icon, stroked in `color` */
function svgMarkup(node: IconNode, color: string, strokeWidth: number) {
  const children = node
    .map(([tag, attrs]) => {
      const props = Object.entries(attrs)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}="${v}"`)
        .join(" ")
      return `<${tag} ${props}/>`
    })
    .join("")
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" ` +
    `stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${children}</svg>`
  )
}

/**
 * A one-row texture of Lucide icons drawn white on transparent, `cell` pixels per icon, for
 * GPU markers that sample icon `i` at u ∈ [i / n, (i + 1) / n]. The SVGs decode
 * asynchronously; the texture re-uploads as each one arrives.
 */
export function lucideAtlas(icons: IconNode[], cell = 64, strokeWidth = 2.5) {
  const canvas = document.createElement("canvas")
  canvas.width = icons.length * cell
  canvas.height = cell
  const ctx = canvas.getContext("2d")!
  const texture = new THREE.CanvasTexture(canvas)
  texture.flipY = false
  texture.colorSpace = THREE.NoColorSpace
  texture.minFilter = THREE.LinearMipmapLinearFilter
  icons.forEach((node, i) => {
    const img = new Image()
    img.onload = () => {
      ctx.drawImage(img, i * cell, 0, cell, cell)
      texture.needsUpdate = true
    }
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgMarkup(node, "#ffffff", strokeWidth))
  })
  return texture
}
