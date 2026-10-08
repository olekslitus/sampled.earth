import * as THREE from "three"

/** How the earth's surface is drawn: the flat themed map, or NASA satellite imagery */
export type MapStyle = "map" | "satellite"

/**
 * NASA Blue Marble (one cloud-free mosaic per month) and Black Marble city lights, made by
 * scripts/fetch-imagery.ts. `low` is the 1024×512 copy that arrives first.
 */
export function dayImageUrl(month: number, low = false) {
  return `/earth/day-${String(month + 1).padStart(2, "0")}${low ? "-1k" : ""}.webp`
}
export function nightImageUrl(low = false) {
  return `/earth/night${low ? "-1k" : ""}.webp`
}

/** Day/night shading shared by the satellite globe and its zoom tiles (SatelliteTiles) */
export const SATELLITE_SHADING = /* glsl */ `
  uniform sampler2D lights;
  uniform vec3 sunDir;
  uniform float night;
  // low sun dims the land before it sets; city lights take over through dusk
  vec3 satelliteShade(vec3 day, vec3 lightsColor, vec3 normal) {
    float d = dot(normalize(normal), normalize(sunDir));
    vec3 sunlit = day * (0.6 + 0.4 * smoothstep(-0.05, 0.5, d));
    float lit = smoothstep(-0.1, 0.16, d);
    float twilight = smoothstep(-0.2, 0.0, d) * (1.0 - smoothstep(0.0, 0.2, d));
    vec3 c = mix(lightsColor * 1.3, sunlit, lit) + vec3(0.12, 0.05, 0.0) * twilight;
    return mix(day, c, night);
  }
`

const textures = new Map<string, Promise<THREE.Texture>>()

/**
 * An equirectangular image as a texture. Decoded off the main thread (createImageBitmap)
 * and shared by everyone who asks for the same url until released.
 */
export function loadImageTexture(url: string): Promise<THREE.Texture> {
  let p = textures.get(url)
  if (!p) {
    p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${url}`)
        return r.blob()
      })
      // WebGL ignores texture.flipY for bitmaps, so flip while decoding; weather images
      // carry data in their channels, so no colour management or premultiplied alpha
      .then((blob) => createImageBitmap(blob, { imageOrientation: "flipY", premultiplyAlpha: "none", colorSpaceConversion: "none" }))
      .then((bitmap) => {
        const tex = new THREE.Texture(bitmap)
        tex.flipY = false
        tex.colorSpace = THREE.NoColorSpace
        tex.anisotropy = 8
        tex.generateMipmaps = true
        tex.minFilter = THREE.LinearMipmapLinearFilter
        tex.needsUpdate = true
        return tex
      })
    p.catch(() => textures.delete(url))
    textures.set(url, p)
  }
  return p
}

/** Frees the GPU copy and the decoded bitmap of `url` (fetched again, from the HTTP cache, if needed). */
export function releaseImageTexture(url: string) {
  const p = textures.get(url)
  if (!p) return
  textures.delete(url)
  p.then(
    (tex) => {
      tex.dispose()
      ;(tex.image as ImageBitmap | null)?.close?.()
    },
    () => {},
  )
}
