/**
 * Lengths in space, in the globe's unit: one Earth radius. A float64 holds the whole range,
 * from street level (1e-6) to the edge of the observable universe (7e19).
 */
export const EARTH_RADIUS_KM = 6371
export const AU_KM = 149_597_870.7
export const LY_KM = 9_460_730_472_580.8
const LIGHT_KM_S = 299_792.458

export const KM = 1 / EARTH_RADIUS_KM
export const AU = AU_KM / EARTH_RADIUS_KM
export const LY = LY_KM / EARTH_RADIUS_KM
export const KLY = LY * 1e3
export const MLY = LY * 1e6
export const GLY = LY * 1e9

/** Radius of the observable universe (comoving distance to the microwave background), ≈ 46 billion light-years */
export const UNIVERSE_RADIUS = 46 * GLY

function trim(n: number, digits: number) {
  return n.toLocaleString("en-US", { maximumSignificantDigits: digits })
}

/** "384,400 km", "1.5 million km", "8.6 AU", "4.24 light-years", "2.5 million light-years" */
export function formatDistance(earthRadii: number) {
  const km = earthRadii * EARTH_RADIUS_KM
  const ly = km / LY_KM
  if (km < 1e6) return `${trim(km, km < 1e4 ? 3 : 4)} km`
  if (km < 1e9) return `${trim(km / 1e6, 3)} million km`
  if (ly < 0.05) return `${trim(km / AU_KM, km / AU_KM < 10 ? 2 : 3)} AU`
  if (ly < 1e4) return `${trim(ly, ly < 10 ? 3 : 4)} light-years`
  if (ly < 1e6) return `${trim(ly / 1e3, 3)} thousand light-years`
  if (ly < 1e9) return `${trim(ly / 1e6, 3)} million light-years`
  return `${trim(ly / 1e9, 3)} billion light-years`
}

/** How long light takes to cross a distance: "1.3 seconds", "8.3 minutes", "4.2 years" */
export function formatLightTime(earthRadii: number) {
  const s = (earthRadii * EARTH_RADIUS_KM) / LIGHT_KM_S
  const years = s / (365.25 * 86400)
  if (s < 1) return `${trim(s * 1000, 2)} milliseconds`
  if (s < 90) return `${trim(s, 2)} seconds`
  if (s < 5400) return `${trim(s / 60, 2)} minutes`
  if (s < 2 * 86400) return `${trim(s / 3600, 2)} hours`
  if (years < 0.25) return `${trim(s / 86400, 2)} days`
  if (years < 1e4) return `${trim(years, years < 10 ? 2 : 3)} years`
  if (years < 1e6) return `${trim(years / 1e3, 3)} thousand years`
  if (years < 1e9) return `${trim(years / 1e6, 3)} million years`
  return `${trim(years / 1e9, 3)} billion years`
}
