/**
 * Reference frames for the zoom out into space.
 *
 * The globe is drawn Earth-fixed: three.js +y is the north pole, +x is lat 0 / lon 0 and
 * −z is lon 90° E (see latLonToXYZ). Everything beyond Earth is drawn in the **sky frame**:
 * the J2000 equatorial axes (ICRF) mapped onto three.js the same way, so
 *
 *   sky (x, y, z) = (x_eq, z_eq, −y_eq)     x_eq → RA 0h, y_eq → RA 6h, z_eq → north pole
 *
 * Positions in the sky frame are Earth-centred and measured in Earth radii unless a layer
 * says otherwise.
 */
import { MakeTime, Rotation_EQD_EQJ, Rotation_GAL_EQJ, SiderealTime, type RotationMatrix } from "astronomy-engine"
import * as THREE from "three"

const DEG = Math.PI / 180

/** astronomy-engine's rot[i][j] is the j-th output component of the i-th input axis */
function toMatrix3(r: RotationMatrix) {
  const m = r.rot
  return [
    [m[0]![0]!, m[1]![0]!, m[2]![0]!],
    [m[0]![1]!, m[1]![1]!, m[2]![1]!],
    [m[0]![2]!, m[1]![2]!, m[2]![2]!],
  ]
}

function multiply(a: number[][], b: number[][]) {
  return a.map((row) => [0, 1, 2].map((j) => row[0]! * b[0]![j]! + row[1]! * b[1]![j]! + row[2]! * b[2]![j]!))
}

/** Writes a standard-axes 3×3 rotation into a three.js Matrix4 acting on three.js axes */
function setThreeRotation(m: number[][], out: THREE.Matrix4) {
  // T maps (x, y, z) → (x, z, −y); the result is T·m·Tᵀ
  const T = [
    [1, 0, 0],
    [0, 0, 1],
    [0, -1, 0],
  ]
  const Tt = [
    [1, 0, 0],
    [0, 0, -1],
    [0, 1, 0],
  ]
  const r = multiply(multiply(T, m), Tt)
  out.set(r[0]![0]!, r[0]![1]!, r[0]![2]!, 0, r[1]![0]!, r[1]![1]!, r[1]![2]!, 0, r[2]![0]!, r[2]![1]!, r[2]![2]!, 0, 0, 0, 0, 1)
  return out
}

/** Equatorial unit vector (degrees) in the sky frame */
export function skyDirection(raDeg: number, decDeg: number, out: number[] = [0, 0, 0]) {
  const ra = raDeg * DEG
  const dec = decDeg * DEG
  const c = Math.cos(dec)
  out[0] = Math.cos(ra) * c
  out[1] = Math.sin(dec)
  out[2] = -Math.sin(ra) * c
  return out
}

/** astronomy-engine vector (equatorial J2000) → sky frame, scaled */
export function fromEquatorial(v: { x: number; y: number; z: number }, scale: number, out: number[] = [0, 0, 0]) {
  out[0] = v.x * scale
  out[1] = v.z * scale
  out[2] = -v.y * scale
  return out
}

let precessionDay = NaN
let precession: number[][] = []

/**
 * Rotation from the Earth-fixed globe frame to the sky frame at a UTC instant: Earth's
 * spin (apparent sidereal time) plus precession and nutation since J2000.
 */
export function earthToSky(ms: number, out: THREE.Matrix4) {
  const day = Math.floor(ms / 86_400_000)
  if (day !== precessionDay) {
    precessionDay = day
    precession = toMatrix3(Rotation_EQD_EQJ(MakeTime(new Date(day * 86_400_000 + 43_200_000))))
  }
  const theta = SiderealTime(MakeTime(new Date(ms))) * 15 * DEG
  const c = Math.cos(theta)
  const s = Math.sin(theta)
  const spin = [
    [c, -s, 0],
    [s, c, 0],
    [0, 0, 1],
  ]
  return setThreeRotation(multiply(precession, spin), out)
}

/** Earth's rotation angle (radians) at a UTC instant, for keeping a far camera still */
export function earthSpinAngle(ms: number) {
  return SiderealTime(MakeTime(new Date(ms))) * 15 * DEG
}

/** Rotation from the galactic frame (x → galactic centre, z → north galactic pole) to the sky frame */
export const GALACTIC_TO_SKY = setThreeRotation(toMatrix3(Rotation_GAL_EQJ()), new THREE.Matrix4())

/** A point given in standard galactic axes (x → centre, y → l = 90°, z → north) in the sky frame */
export function galacticToSky(x: number, y: number, z: number, out: number[] = [0, 0, 0]) {
  // three.js axes first: (x, z, −y)
  const v = new THREE.Vector3(x, z, -y).applyMatrix4(GALACTIC_TO_SKY)
  out[0] = v.x
  out[1] = v.y
  out[2] = v.z
  return out
}

/**
 * Orientation of a body (IAU pole and prime meridian) as a matrix taking body-fixed
 * three.js axes (y = north pole, +x = prime meridian, like the globe) to the sky frame.
 */
export function bodyOrientation(poleRaHours: number, poleDecDeg: number, spinDeg: number, out: THREE.Matrix4) {
  const a = (poleRaHours * 15 + 90) * DEG
  const b = (90 - poleDecDeg) * DEG
  const w = spinDeg * DEG
  const rz = (t: number) => [
    [Math.cos(t), -Math.sin(t), 0],
    [Math.sin(t), Math.cos(t), 0],
    [0, 0, 1],
  ]
  const rx = [
    [1, 0, 0],
    [0, Math.cos(b), -Math.sin(b)],
    [0, Math.sin(b), Math.cos(b)],
  ]
  return setThreeRotation(multiply(multiply(rz(a), rx), rz(w)), out)
}
