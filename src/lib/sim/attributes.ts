import { REGIONS, RELIGIONS } from "./countries"
import type { Simulation } from "./engine"
import type { Person } from "./population"
import { LEANINGS, PARTY_FAMILIES, familyOf, leaningBucket } from "./politics"
import { ACTIVITY_CATEGORIES } from "./schedule"

export type Theme = "light" | "dark"

interface Palette {
  /** categorical slots, fixed order, never cycled */
  s: string[]
  /** single-hue blue ramps for ordered values (low → high) */
  r6: string[]
  r5: string[]
  r4: string[]
  /** purple ← grey → orange, for left–right (deliberately not red/blue, which mean opposite things in the US and Europe) */
  div: string[]
  neutral: string
  /** recessive "not applicable" swatch */
  dim: string
}

const PALETTES: Record<Theme, Palette> = {
  // dark surface: dim → bright
  dark: {
    s: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"],
    r6: ["#256abf", "#3987e5", "#6da7ec", "#9ec5f4", "#b7d3f6", "#cde2fb"],
    r5: ["#256abf", "#3987e5", "#6da7ec", "#9ec5f4", "#cde2fb"],
    r4: ["#256abf", "#5598e7", "#9ec5f4", "#cde2fb"],
    div: ["#9085e9", "#cbc4f6", "#8a887f", "#f5c09a", "#d95926"],
    neutral: "#77756d",
    dim: "#39425a",
  },
  // light surface: pale → deep, never lighter than step 250
  light: {
    s: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"],
    r6: ["#86b6ef", "#5598e7", "#2a78d6", "#1c5cab", "#104281", "#0d366b"],
    r5: ["#86b6ef", "#3987e5", "#256abf", "#184f95", "#0d366b"],
    r4: ["#86b6ef", "#2a78d6", "#184f95", "#0d366b"],
    div: ["#4a3aa7", "#9d92e0", "#6f6c65", "#f0a070", "#c4501f"],
    neutral: "#9a978e",
    dim: "#cdd2da",
  },
}

export interface ColorScheme {
  key: string
  label: string
  kind: "categorical" | "ordinal"
  categories: readonly string[]
  colors: (p: Palette) => readonly string[]
  /** true when the value can change over time and must be re-evaluated */
  dynamic?: boolean
  value: (p: Person, i: number, sim: Simulation) => number
}

export const INCOME_BRACKETS = ["No personal income", "Under $1k", "$1k–5k", "$5k–15k", "$15k–40k", "$40k–100k", "$100k+"]
export function incomeBracket(income: number) {
  if (income <= 0) return 0
  if (income < 1000) return 1
  if (income < 5000) return 2
  if (income < 15000) return 3
  if (income < 40000) return 4
  if (income < 100000) return 5
  return 6
}

export const AGE_GROUPS = ["0–14", "15–24", "25–44", "45–64", "65+"]
export function ageGroup(age: number) {
  return age < 15 ? 0 : age < 25 ? 1 : age < 45 ? 2 : age < 65 ? 3 : 4
}

export const ROLE_GROUPS = ["Agriculture", "Industry", "Services", "In education", "Child, not in school", "Retired", "Homemaker / carer", "Looking for work"]
export function roleGroup(p: Person) {
  if (p.occupation) return ROLE_GROUPS.indexOf(p.occupation.sector)
  switch (p.role) {
    case "Pupil":
    case "Student":
      return 3
    case "Child":
      return 4
    case "Retired":
      return 5
    case "Homemaker":
      return 6
    default:
      return 7
  }
}

const REGION_KEYS = Object.keys(REGIONS) as (keyof typeof REGIONS)[]
const REGION_INDEX = new Map(REGION_KEYS.map((k, i) => [k, i]))
const RELIGION_INDEX = new Map(RELIGIONS.map((r, i) => [r, i]))
const MARITAL = ["Single", "Married", "Divorced", "Widowed"] as const
const MARITAL_INDEX = new Map(MARITAL.map((m, i) => [m, i]))
/** Highest completed level is only meaningful once schooling is mostly over */
const EDUCATION_MIN_AGE = 15

export const COLOR_SCHEMES: ColorScheme[] = [
  {
    key: "activity", label: "Current activity", kind: "categorical", dynamic: true,
    categories: ACTIVITY_CATEGORIES,
    // Sleeping wears violet, Working blue, Commuting orange … each a fixed slot. Household
    // chores are grey so the two greens (Leisure, Studying) don't sit next to a third.
    colors: (p) => [p.s[6], p.s[0], p.s[1], p.s[3], p.s[2], p.s[4], p.neutral, p.s[5]],
    value: (_p, i, sim) => sim.activity[i],
  },
  {
    key: "religion", label: "Religion", kind: "categorical",
    categories: RELIGIONS,
    colors: (p) => [p.s[0], p.s[2], p.s[1], p.s[3], p.neutral, p.s[5], p.s[6], p.s[4]],
    value: (p) => RELIGION_INDEX.get(p.religion)!,
  },
  {
    key: "income", label: "Personal income (USD / year)", kind: "ordinal",
    categories: INCOME_BRACKETS,
    colors: (p) => [p.neutral, ...p.r6],
    value: (p) => incomeBracket(p.income),
  },
  {
    key: "role", label: "Occupation / status", kind: "categorical",
    categories: ROLE_GROUPS,
    colors: (p) => p.s,
    value: (p) => roleGroup(p),
  },
  {
    key: "education", label: "Education (highest level)", kind: "ordinal",
    categories: ["No schooling", "Primary", "Secondary", "Tertiary", `Under ${EDUCATION_MIN_AGE}`],
    colors: (p) => [...p.r4, p.dim],
    value: (p) => (p.age < EDUCATION_MIN_AGE ? 4 : p.education),
  },
  {
    key: "age", label: "Age group", kind: "ordinal",
    categories: AGE_GROUPS,
    colors: (p) => p.r5,
    value: (p) => ageGroup(p.age),
  },
  {
    key: "region", label: "World region", kind: "categorical",
    categories: REGION_KEYS.map((k) => REGIONS[k]),
    colors: (p) => p.s,
    value: (p) => REGION_INDEX.get(p.country.region)!,
  },
  {
    key: "background", label: "Background", kind: "categorical",
    categories: ["Native-born", "Immigrant"],
    colors: (p) => [p.s[0], p.s[1]],
    value: (p) => (p.immigrant ? 1 : 0),
  },
  {
    key: "settlement", label: "Urban / rural", kind: "categorical",
    categories: ["Urban", "Rural"],
    colors: (p) => [p.s[0], p.s[2]],
    value: (p) => (p.urban ? 0 : 1),
  },
  {
    key: "gender", label: "Gender", kind: "categorical",
    categories: ["Female", "Male"],
    colors: (p) => [p.s[4], p.s[0]],
    value: (p) => (p.gender === "Female" ? 0 : 1),
  },
  {
    key: "leaning", label: "Political leaning", kind: "ordinal",
    categories: [...LEANINGS, "Under 18"],
    colors: (p) => [...p.div, p.dim],
    value: (p) => (p.politics ? leaningBucket(p.politics.leaning) : 5),
  },
  {
    key: "party", label: "Party family", kind: "categorical",
    categories: [...PARTY_FAMILIES, "Under 18"],
    // no red/blue for left or right (their meaning flips between the US and Europe);
    // greens stay green, liberals yellow; blue only marks one-party states
    colors: (p) => [p.s[6], p.s[4], p.s[5], p.s[3], p.s[2], p.s[1], p.s[0], p.neutral, p.dim],
    value: (p) => familyOf(p),
  },
  {
    key: "internet", label: "Internet access", kind: "categorical",
    categories: ["Online", "Offline"],
    colors: (p) => [p.s[0], p.neutral],
    value: (p) => (p.internet ? 0 : 1),
  },
  {
    key: "marital", label: "Marital status", kind: "categorical",
    categories: [...MARITAL, "Under 18"],
    colors: (p) => [p.s[0], p.s[1], p.s[2], p.s[3], p.dim],
    value: (p) => (p.age < 18 ? 4 : MARITAL_INDEX.get(p.marital)!),
  },
]

export const SCHEME_BY_KEY = new Map(COLOR_SCHEMES.map((s) => [s.key, s]))

const colorCache = new Map<string, readonly string[]>()
/** Colours for a scheme in the given theme */
export function schemeColors(scheme: ColorScheme, theme: Theme): readonly string[] {
  const key = scheme.key + theme
  let c = colorCache.get(key)
  if (!c) {
    c = scheme.colors(PALETTES[theme])
    colorCache.set(key, c)
  }
  return c
}

export function paletteFor(theme: Theme) {
  return PALETTES[theme]
}
