/**
 * Map tiles for the satellite globe. Level z covers the globe with 2^(z+1) × 2^z tiles of
 * 180/2^z degrees, x from −180° eastwards and y from the north pole down: the WGS84 grid
 * of NASA GIBS and EOX, and of our own tiles (scripts/build-tiles.ts).
 */

import { BLOB_URL as BLOB } from "@/lib/blob"

export interface TileSource {
  /** distinguishes cached tiles of different sources */
  key: string
  minZ: number
  maxZ: number
  /** pixels along a tile's side */
  size: number
  url: (z: number, x: number, y: number) => string
}

/** NASA Blue Marble for a month (0 = January), 4.9 km down to 0.6 km a pixel */
export function blueMarbleTiles(month: number): TileSource {
  const m = String(month + 1).padStart(2, "0")
  return { key: `bm${m}`, minZ: 3, maxZ: 6, size: 512, url: (z, x, y) => `${BLOB}/earth/v1/${m}/${z}/${y}/${x}.webp` }
}

/** NASA Black Marble 2016 city lights, for the night side, 4.9 km down to 0.6 km a pixel */
export const NIGHT_TILES: TileSource = {
  key: "night",
  minZ: 3,
  maxZ: 6,
  size: 512,
  url: (z, x, y) => `${BLOB}/earth/v1/night/${z}/${y}/${x}.webp`,
}

export const SENTINEL_YEAR = 2024

/**
 * EOxCloudless Sentinel-2 mosaic, from 0.6 km a pixel down to 10 m. Free for
 * non-commercial use (CC BY-NC-SA 4.0) with its attribution visible on the map.
 */
export const SENTINEL_TILES: TileSource = {
  key: `s2-${SENTINEL_YEAR}`,
  minZ: 7,
  maxZ: 13,
  size: 256,
  url: (z, x, y) => `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-${SENTINEL_YEAR}/default/WGS84/${z}/${y}/${x}.jpg`,
}

export const SENTINEL_ATTRIBUTION = {
  text: `EOxCloudless by EOX IT Services GmbH (contains modified Copernicus Sentinel data ${SENTINEL_YEAR})`,
  href: "https://cloudless.eox.at",
}

/** Degrees covered by one tile side at level z */
export function tileDegrees(z: number) {
  return 180 / 2 ** z
}

/** Longitude/latitude bounds of a tile: west, east, south, north */
export function tileBounds(z: number, x: number, y: number): [number, number, number, number] {
  const d = tileDegrees(z)
  const west = -180 + x * d
  const north = 90 - y * d
  return [west, west + d, north - d, north]
}
