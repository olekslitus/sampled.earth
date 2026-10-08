/** Position on a sphere in three.js world space; matches SphereGeometry UVs. */
export function latLonToXYZ(lat: number, lon: number, r: number, out: Float32Array | number[], o = 0) {
  const phi = ((lon + 180) * Math.PI) / 180
  const la = (lat * Math.PI) / 180
  const cl = Math.cos(la)
  out[o] = -Math.cos(phi) * cl * r
  out[o + 1] = Math.sin(la) * r
  out[o + 2] = Math.sin(phi) * cl * r
}

/** Inverse of latLonToXYZ for a unit direction. */
export function xyzToLatLon(x: number, y: number, z: number): [number, number] {
  const len = Math.hypot(x, y, z) || 1
  const lat = (Math.asin(Math.max(-1, Math.min(1, y / len))) * 180) / Math.PI
  let lon = (Math.atan2(z, -x) * 180) / Math.PI - 180
  if (lon < -180) lon += 360
  return [lat, lon]
}

export const PERSON_RADIUS = 1.00025
