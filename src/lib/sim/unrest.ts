/**
 * Major armed conflicts and unrest, compiled by hand from 2025 reporting (ACLED, Crisis Group,
 * UN OCHA). This is a static snapshot, not a live feed: situations change quickly.
 */

export type UnrestLevel = "War" | "Armed conflict" | "Unrest"

export interface Hotspot {
  name: string
  level: UnrestLevel
  lat: number
  lon: number
  /** rough extent of the affected area (degrees) */
  radius: number
  summary: string
}

export const UNREST_LEVELS: UnrestLevel[] = ["War", "Armed conflict", "Unrest"]

export const HOTSPOTS: Hotspot[] = [
  { name: "Russia–Ukraine war", level: "War", lat: 48.2, lon: 37.4, radius: 2.4, summary: "Full-scale war since 2022; heavy fighting along the eastern and southern front lines." },
  { name: "Gaza", level: "War", lat: 31.42, lon: 34.38, radius: 0.35, summary: "War since October 2023 with catastrophic humanitarian conditions." },
  { name: "Sudan: Khartoum", level: "War", lat: 15.6, lon: 32.5, radius: 1.3, summary: "Civil war between the army and the RSF since April 2023; the world's largest displacement crisis." },
  { name: "Sudan: Darfur & Kordofan", level: "War", lat: 13.3, lon: 25.5, radius: 3.2, summary: "Sieges, mass atrocities and famine conditions." },
  { name: "Myanmar civil war", level: "War", lat: 21.5, lon: 96, radius: 3.8, summary: "Nationwide armed resistance against the military junta since the 2021 coup." },
  { name: "Eastern DR Congo", level: "War", lat: -1.4, lon: 29.0, radius: 1.4, summary: "M23 and dozens of armed groups; millions displaced in North and South Kivu." },
  { name: "Central Sahel", level: "Armed conflict", lat: 14.2, lon: -1.2, radius: 3.6, summary: "Jihadist insurgencies across Mali, Burkina Faso and western Niger." },
  { name: "Haiti", level: "Armed conflict", lat: 18.55, lon: -72.3, radius: 0.45, summary: "Gang coalitions control most of Port-au-Prince." },
  { name: "Yemen & Red Sea", level: "Armed conflict", lat: 15.3, lon: 43.8, radius: 2.6, summary: "Long-running civil war; Houthi attacks on Red Sea shipping." },
  { name: "Somalia", level: "Armed conflict", lat: 3.0, lon: 45.0, radius: 2.8, summary: "Al-Shabaab insurgency in the centre and south." },
  { name: "Ethiopia: Amhara", level: "Armed conflict", lat: 11.6, lon: 38.2, radius: 1.8, summary: "Fano militia insurgency against federal forces." },
  { name: "NE Nigeria & Lake Chad", level: "Armed conflict", lat: 12.2, lon: 13.6, radius: 1.6, summary: "Boko Haram and ISWAP attacks around Lake Chad." },
  { name: "NW Nigeria", level: "Armed conflict", lat: 12.3, lon: 6.4, radius: 1.8, summary: "Bandit gangs and mass kidnappings." },
  { name: "Cabo Delgado", level: "Armed conflict", lat: -12.2, lon: 40.0, radius: 1.0, summary: "Islamist insurgency in northern Mozambique." },
  { name: "South Sudan", level: "Armed conflict", lat: 7.5, lon: 31.0, radius: 2.8, summary: "Fragile peace deal; frequent intercommunal and political violence." },
  { name: "Central African Republic", level: "Armed conflict", lat: 6.3, lon: 20.5, radius: 2.8, summary: "Armed groups contest much of the country." },
  { name: "Cameroon Anglophone regions", level: "Armed conflict", lat: 5.9, lon: 10.0, radius: 0.9, summary: "Separatist conflict in the North-West and South-West." },
  { name: "Syria", level: "Armed conflict", lat: 35.0, lon: 38.0, radius: 2.8, summary: "Post-Assad transition with sectarian clashes and foreign strikes." },
  { name: "Lebanon border", level: "Armed conflict", lat: 33.25, lon: 35.5, radius: 0.4, summary: "Cross-border strikes between Israel and Hezbollah." },
  { name: "West Bank", level: "Unrest", lat: 32.0, lon: 35.25, radius: 0.35, summary: "Military raids and settler violence." },
  { name: "Pakistan: Khyber Pakhtunkhwa", level: "Armed conflict", lat: 33.6, lon: 70.8, radius: 1.3, summary: "Rising militant attacks near the Afghan border." },
  { name: "Pakistan: Balochistan", level: "Armed conflict", lat: 28.5, lon: 65.5, radius: 2.3, summary: "Separatist insurgency and attacks on infrastructure." },
  { name: "Kashmir", level: "Unrest", lat: 34.1, lon: 74.6, radius: 0.9, summary: "Militarised dispute between India and Pakistan." },
  { name: "Afghanistan", level: "Unrest", lat: 34.5, lon: 68.5, radius: 2.2, summary: "Taliban rule, severe restrictions on women, sporadic ISKP attacks." },
  { name: "Mexico: Sinaloa", level: "Armed conflict", lat: 24.8, lon: -107.4, radius: 1.2, summary: "Cartel infighting and violence." },
  { name: "Mexico: Guerrero & Michoacán", level: "Armed conflict", lat: 18.6, lon: -101.0, radius: 1.4, summary: "Organised-crime violence and extortion." },
  { name: "Colombia: Catatumbo", level: "Armed conflict", lat: 8.5, lon: -73.0, radius: 1.0, summary: "Clashes between ELN and FARC dissident groups." },
  { name: "Ecuador", level: "Unrest", lat: -2.2, lon: -79.9, radius: 0.9, summary: "Gang violence and a state of emergency around Guayaquil." },
  { name: "Venezuela", level: "Unrest", lat: 10.4, lon: -66.9, radius: 1.0, summary: "Political crisis and repression after the disputed 2024 election." },
  { name: "West Papua", level: "Armed conflict", lat: -4.0, lon: 138.0, radius: 1.8, summary: "Separatist insurgency in Indonesia's Papua provinces." },
  { name: "Kenya protests", level: "Unrest", lat: -1.29, lon: 36.82, radius: 0.5, summary: "Youth-led anti-government protests met with deadly force." },
  { name: "Serbia protests", level: "Unrest", lat: 44.8, lon: 20.45, radius: 0.5, summary: "Mass anti-corruption protests since late 2024." },
  { name: "Georgia protests", level: "Unrest", lat: 41.7, lon: 44.8, radius: 0.45, summary: "Protests over the government's turn away from the EU." },
  { name: "Libya", level: "Unrest", lat: 32.9, lon: 13.2, radius: 0.7, summary: "Rival governments and militia clashes in Tripoli." },
]

export const UNREST_SOURCE_NOTE = "Hand-compiled snapshot of 2025 reporting (ACLED, Crisis Group, UN OCHA). Not live data."
