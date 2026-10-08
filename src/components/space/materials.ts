import * as THREE from "three"

/** GLSL: a point's on-screen size from its world size, fading (not shrinking) below `minPx` */
export const POINT_SIZE_GLSL = /* glsl */ `
uniform float uScale;   // drawing-buffer pixels per unit of size at distance 1
uniform float uMinPx;
uniform float uMaxPx;
float pointSize(float worldSize, float depth, out float fade) {
  float px = worldSize * uScale / max(depth, 1e-12);
  fade = 1.0;
  if (px < uMinPx) { fade = px / uMinPx; px = uMinPx; }
  if (px > uMaxPx) { fade *= uMaxPx / px; px = uMaxPx; }
  return px;
}
`

/** GLSL: a soft round sprite, 1 in the middle → 0 at the edge */
export const SOFT_DOT_GLSL = /* glsl */ `
float softDot() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d2 = dot(c, c);
  if (d2 > 1.0) discard;
  return exp(-d2 * 4.0) * (1.0 - d2);
}
`

/** Pixels per world unit at distance 1, for POINT_SIZE_GLSL */
export function pointScale(fovDeg: number, heightPx: number, dpr: number) {
  return (heightPx * dpr) / (2 * Math.tan((fovDeg * Math.PI) / 360))
}

/** Additive, depth-ignoring shader material for glowing points and lines */
export function glowMaterial(params: { vertexShader: string; fragmentShader: string; uniforms: Record<string, THREE.IUniform> }) {
  return new THREE.ShaderMaterial({
    ...params,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
}

/** Loads an image as an sRGB texture (cached by URL) */
const textures = new Map<string, THREE.Texture>()
export function spaceTexture(url: string, opts: { mipmaps?: boolean } = {}) {
  let t = textures.get(url)
  if (!t) {
    t = new THREE.TextureLoader().load(url)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 4
    if (opts.mipmaps === false) {
      t.generateMipmaps = false
      t.minFilter = THREE.LinearFilter
    }
    textures.set(url, t)
  }
  return t
}

/** Smooth step helpers for fading layers in and out by camera distance */
export function fadeBetween(x: number, inFrom: number, inTo: number, outFrom = Infinity, outTo = Infinity) {
  const up = Math.min(1, Math.max(0, Math.log(x / inFrom) / Math.log(inTo / inFrom)))
  const down = outFrom === Infinity ? 1 : 1 - Math.min(1, Math.max(0, Math.log(x / outFrom) / Math.log(outTo / outFrom)))
  const s = (t: number) => t * t * (3 - 2 * t)
  return s(up) * s(down)
}
