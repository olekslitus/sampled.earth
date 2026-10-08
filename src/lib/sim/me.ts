import type { Religion } from "./countries"
import type { Simulation } from "./engine"
import type { FilterSpec } from "./filter"
import { leaningBucket } from "./politics"
import type { Person } from "./population"

/** What the viewer tells us about themselves. Every field is optional. */
export interface MeProfile {
  country?: string
  age?: number
  gender?: Person["gender"]
  religion?: Religion
  education?: number
  /** USD per year */
  income?: number
  settlement?: "urban" | "rural"
  marital?: Person["marital"]
  children?: "none" | "some"
  language?: string
  hobbies?: string[]
  /** index into LEANINGS */
  leaning?: number
}

/** People sharing the viewer's traits (age within ±2 years, income within ±30%). */
export function meToSpec(me: MeProfile): FilterSpec {
  const spec: FilterSpec = {}
  if (me.country) spec.countries = [me.country]
  if (me.age != null) {
    spec.ageMin = Math.max(0, me.age - 2)
    spec.ageMax = me.age + 2
  }
  if (me.gender) spec.genders = [me.gender]
  if (me.religion) spec.religions = [me.religion]
  if (me.education != null) spec.education = [me.education]
  if (me.income != null) {
    spec.incomeMin = Math.round(me.income * 0.7)
    spec.incomeMax = Math.round(me.income * 1.3)
  }
  if (me.settlement) spec.settlement = me.settlement
  if (me.marital) spec.marital = [me.marital]
  if (me.children) spec.children = me.children
  if (me.language) spec.languages = [me.language]
  if (me.leaning != null) spec.leanings = [me.leaning]
  return spec
}

/** The person in the current simulation who resembles the viewer most. */
export function closestTwin(sim: Simulation, me: MeProfile): number | null {
  let best: Person | null = null
  let bestScore = -1
  sim.forEachShown(false, (p) => {
    let s = 0
    if (me.country && p.country.name === me.country) s += 3
    if (me.age != null) s += Math.max(0, 3 - Math.abs(p.age - me.age) / 2)
    if (me.gender && p.gender === me.gender) s += 2
    if (me.religion && p.religion === me.religion) s += 1.5
    if (me.education != null && p.education === me.education) s += 1
    if (me.income != null && p.income > 0) s += Math.max(0, 1.5 - Math.abs(Math.log(p.income / Math.max(1, me.income))))
    if (me.settlement && p.urban === (me.settlement === "urban")) s += 0.5
    if (me.marital && p.marital === me.marital) s += 0.5
    if (me.children && (me.children === "none") === (p.children === 0)) s += 0.5
    if (me.language && (p.motherTongue === me.language || p.otherLanguages.includes(me.language))) s += 1
    if (me.leaning != null && p.politics) s += Math.max(0, 1 - Math.abs(leaningBucket(p.politics.leaning) - me.leaning) * 0.5)
    if (me.hobbies?.length) s += p.hobbies.filter((h) => me.hobbies!.includes(h)).length * 0.5
    if (s > bestScore) {
      bestScore = s
      best = p
    }
  })
  return best ? (best as Person).id : null
}

export interface DatingPrefs {
  genders: Person["gender"][]
  ageMin: number
  ageMax: number
  where: "anywhere" | "region" | "country"
  religions: Religion[]
  minEducation: number
  sharedLanguage: boolean
  sharedHobby: boolean
  noChildren: boolean
  incomeMin?: number
  settlement?: "urban" | "rural"
  /** compared with the viewer's own leaning */
  politics?: "same" | "near"
}

export const DEFAULT_DATING: DatingPrefs = {
  genders: [],
  ageMin: 25,
  ageMax: 35,
  // "My country" and "Speaks my language" need a Find me profile, so start open-ended
  where: "anywhere",
  religions: [],
  minEducation: 0,
  sharedLanguage: false,
  sharedHobby: false,
  noChildren: false,
}

const ALL_LEVELS = [0, 1, 2, 3]

/** Available adults matching the viewer's dating preferences. */
export function datingSpec(prefs: DatingPrefs, me: MeProfile, regionOf: (country: string) => string | undefined): FilterSpec {
  const spec: FilterSpec = {
    marital: ["Single", "Divorced", "Widowed"],
    ageMin: Math.max(18, prefs.ageMin),
    ageMax: Math.max(18, prefs.ageMax),
  }
  if (prefs.genders.length) spec.genders = prefs.genders
  if (me.country && prefs.where === "country") spec.countries = [me.country]
  if (me.country && prefs.where === "region") {
    const r = regionOf(me.country)
    if (r) spec.regions = [r as NonNullable<FilterSpec["regions"]>[number]]
  }
  if (prefs.religions.length) spec.religions = prefs.religions
  if (prefs.minEducation > 0) spec.education = ALL_LEVELS.filter((l) => l >= prefs.minEducation)
  if (prefs.sharedLanguage && me.language) spec.languages = [me.language]
  if (prefs.sharedHobby && me.hobbies?.length) spec.hobbies = me.hobbies
  if (prefs.noChildren) spec.children = "none"
  if (prefs.incomeMin) spec.incomeMin = prefs.incomeMin
  if (prefs.settlement) spec.settlement = prefs.settlement
  if (prefs.politics && me.leaning != null) {
    const d = prefs.politics === "same" ? 0 : 1
    spec.leanings = [0, 1, 2, 3, 4].filter((l) => Math.abs(l - me.leaning!) <= d)
  }
  return spec
}
