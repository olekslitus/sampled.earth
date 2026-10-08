import * as THREE from "three"

/** Matches three.js SphereGeometry UVs so an equirectangular texture lines up. */
export function latLonToVec3(lat: number, lon: number, r = 1, out = new THREE.Vector3()) {
  const phi = ((lon + 180) * Math.PI) / 180
  const la = (lat * Math.PI) / 180
  const cl = Math.cos(la)
  return out.set(-Math.cos(phi) * cl * r, Math.sin(la) * r, Math.sin(phi) * cl * r)
}

export const PERSON_RADIUS = 1.004
