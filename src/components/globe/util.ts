import * as THREE from "three"

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

/** Angular radius (degrees) of the part of the globe that fits on screen. */
export function visibleRadius(camera: THREE.PerspectiveCamera, aspect: number, vertical = false) {
  const d = camera.position.length()
  const half = Math.tan(((camera.fov / 2) * Math.PI) / 180)
  const alpha = Math.atan(vertical ? half : half * Math.sqrt(1 + aspect * aspect))
  const s = d * Math.sin(alpha)
  const theta = s >= 1 ? Math.acos(1 / d) : Math.asin(s) - alpha
  return (theta * 180) / Math.PI
}

/** Dot diameter in CSS pixels: small from afar, a little bigger at street level */
export function pointSizeFor(alt: number) {
  return Math.min(6, Math.max(1.6, 1.9 + (-Math.log10(Math.max(alt, 1e-4)) + 0.35) * 1.15))
}

/** Shared GLSL: hides points on the far side of the globe and fades them at the horizon */
export const FACING_GLSL = /* glsl */ `
  float facingOf(vec3 p) {
    return dot(normalize(p), normalize(cameraPosition - p));
  }
`
