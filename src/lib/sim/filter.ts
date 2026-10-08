import { ROLE_GROUPS, roleGroup } from "./attributes"
import { WORLD_POPULATION_M, makePerson, type Person } from "./population"
import { hashSeed, mulberry32 } from "./rng"
import { LEANINGS, PARTY_FAMILIES, familyOf, leaningBucket } from "./politics"
import { ACTIVITY_CATEGORIES } from "./schedule"
import type { Simulation } from "./engine"
import { COUNTRY_BY_NAME, EDUCATION_LEVELS, type RegionCode, type Religion } from "./countries"

/** A set of constraints on people. Every field is optional; empty means "any". */
export interface FilterSpec {
  regions?: RegionCode[]
  countries?: string[]
  genders?: Person["gender"][]
  ageMin?: number
  ageMax?: number
  religions?: Religion[]
  devoutOnly?: boolean
  education?: number[]
  /** USD per year */
  incomeMin?: number
  incomeMax?: number
  /** indexes into ROLE_GROUPS */
  roles?: number[]
  settlement?: "urban" | "rural"
  marital?: Person["marital"][]
  background?: "native" | "immigrant"
  internet?: "online" | "offline"
  /** speaks at least one of these */
  languages?: string[]
  /** shares at least one of these hobbies */
  hobbies?: string[]
  children?: "none" | "some"
  /** indexes into LEANINGS (adults only) */
  leanings?: number[]
  /** indexes into PARTY_FAMILIES (adults only) */
  partyFamilies?: number[]
  voted?: "yes" | "no"
  /** indexes into ACTIVITY_CATEGORIES (changes over time) */
  activities?: number[]
}

type Predicate = (p: Person, i: number, sim: Simulation) => boolean

const has = <T,>(xs: readonly T[] | undefined): xs is readonly T[] => !!xs && xs.length > 0

/** One predicate per active constraint, so counts can be estimated constraint by constraint. */
export function predicates(spec: FilterSpec): Predicate[] {
  const out: Predicate[] = []
  if (has(spec.regions)) out.push((p) => spec.regions!.includes(p.country.region))
  if (has(spec.countries)) out.push((p) => spec.countries!.includes(p.country.name))
  if (has(spec.genders)) out.push((p) => spec.genders!.includes(p.gender))
  if (spec.ageMin != null || spec.ageMax != null) {
    const lo = spec.ageMin ?? 0
    const hi = spec.ageMax ?? 200
    out.push((p) => p.age >= lo && p.age <= hi)
  }
  if (has(spec.religions)) out.push((p) => spec.religions!.includes(p.religion))
  if (spec.devoutOnly) out.push((p) => p.devout)
  if (has(spec.education)) out.push((p) => spec.education!.includes(p.education))
  if (spec.incomeMin != null || spec.incomeMax != null) {
    const lo = spec.incomeMin ?? 0
    const hi = spec.incomeMax ?? Infinity
    out.push((p) => p.income >= lo && p.income <= hi)
  }
  if (has(spec.roles)) out.push((p) => spec.roles!.includes(roleGroup(p)))
  if (spec.settlement) out.push((p) => p.urban === (spec.settlement === "urban"))
  if (has(spec.marital)) out.push((p) => spec.marital!.includes(p.marital))
  if (spec.background) out.push((p) => p.immigrant === (spec.background === "immigrant"))
  if (spec.internet) out.push((p) => p.internet === (spec.internet === "online"))
  if (has(spec.languages)) out.push((p) => spec.languages!.includes(p.motherTongue) || p.otherLanguages.some((l) => spec.languages!.includes(l)))
  if (has(spec.hobbies)) out.push((p) => p.hobbies.some((h) => spec.hobbies!.includes(h)))
  if (spec.children) out.push((p) => (spec.children === "none" ? p.children === 0 : p.children > 0))
  if (has(spec.leanings)) out.push((p) => !!p.politics && spec.leanings!.includes(leaningBucket(p.politics.leaning)))
  if (has(spec.partyFamilies)) out.push((p) => !!p.politics && spec.partyFamilies!.includes(familyOf(p)))
  if (spec.voted) out.push((p) => !!p.politics && p.politics.voter === (spec.voted === "yes"))
  if (has(spec.activities)) out.push((_p, i, sim) => spec.activities!.includes(sim.activity[i]))
  return out
}

export interface CompiledFilter {
  spec: FilterSpec
  test: Predicate
}

export function compileFilter(spec: FilterSpec): CompiledFilter | null {
  const preds = predicates(spec)
  if (!preds.length) return null
  return {
    spec,
    test: (p, i, sim) => {
      for (const f of preds) if (!f(p, i, sim)) return false
      return true
    },
  }
}

export interface Estimate {
  /** real people (millions) */
  people: number
  /** share of humanity, 0..1 */
  share: number
  /** matching people in the world sample */
  sampleMatches: number
  /** too few exact matches: combined country by country assuming independent traits */
  approximate: boolean
  /** a more exact count is being prepared in the background (see subscribeCountrySamples) */
  pending?: boolean
}

const COUNTRY_SAMPLE = 20_000
/** people built between deadline checks (a few ms) */
const SAMPLE_STEP = 250

interface CountrySample {
  people: Person[]
  done: boolean
}
const countrySamples = new Map<string, CountrySample>()
const sampleListeners = new Set<() => void>()
let samplesVersion = 0
let building = false

type IdleDeadline = { timeRemaining(): number }
function whenIdle(fn: (deadline: IdleDeadline) => void) {
  if (typeof requestIdleCallback === "function") requestIdleCallback(fn, { timeout: 200 })
  else setTimeout(() => fn({ timeRemaining: () => 8 }), 16)
}

/** Builds the queued country samples a slice at a time while the main thread is idle. */
function buildSamples(deadline: IdleDeadline) {
  for (const [name, sample] of countrySamples) {
    if (sample.done) continue
    const c = COUNTRY_BY_NAME.get(name)!
    const people = sample.people
    while (people.length < COUNTRY_SAMPLE && deadline.timeRemaining() > 1) {
      const end = Math.min(COUNTRY_SAMPLE, people.length + SAMPLE_STEP)
      for (let k = people.length; k < end; k++) people.push(makePerson(-1 - k, c, mulberry32(hashSeed(9001, c.population * 1000, k))))
    }
    if (people.length < COUNTRY_SAMPLE) {
      whenIdle(buildSamples)
      return
    }
    sample.done = true
    samplesVersion++
    for (const fn of sampleListeners) fn()
  }
  building = false
}

/**
 * A dedicated, larger sample of one country for counting rare profiles exactly. Built
 * in idle time; `null` until it is complete.
 */
function countrySample(name: string): Person[] | null {
  const hit = countrySamples.get(name)
  if (hit) return hit.done ? hit.people : null
  if (!COUNTRY_BY_NAME.has(name)) return null
  countrySamples.set(name, { people: [], done: false })
  if (!building) {
    building = true
    whenIdle(buildSamples)
  }
  return null
}

/**
 * Fires when a background country sample finishes, so `estimate` can give a more exact
 * answer. Pair with `countrySamplesVersion` in useSyncExternalStore. Returns an unsubscribe.
 */
export function subscribeCountrySamples(fn: () => void): () => void {
  sampleListeners.add(fn)
  return () => void sampleListeners.delete(fn)
}

export function countrySamplesVersion() {
  return samplesVersion
}

/**
 * How many real people match. Uses exact counts in the world sample; for rare profiles in
 * named countries it counts in a larger per-country sample, and otherwise falls back to
 * per-country products of trait frequencies.
 */
export function estimate(sim: Simulation, spec: FilterSpec): Estimate {
  const preds = predicates(spec)
  const n = sim.globalCount
  if (!n) return { people: 0, share: 0, sampleMatches: 0, approximate: false }
  let matches = 0
  for (let i = 0; i < n; i++) {
    const p = sim.people[i]!
    let ok = true
    for (const f of preds) if (!f(p, i, sim)) { ok = false; break }
    if (ok) matches++
  }
  if (matches >= 25 || preds.length < 2) {
    const share = matches / n
    return { people: share * WORLD_POPULATION_M, share, sampleMatches: matches, approximate: false }
  }
  // rare profile in a few named countries: count in larger country samples
  let pending = false
  if (has(spec.countries) && spec.countries.length <= 3 && !has(spec.activities)) {
    const samples = spec.countries.map(countrySample)
    pending = samples.some((s) => !s)
  }
  if (has(spec.countries) && spec.countries.length <= 3 && !has(spec.activities) && !pending) {
    let people = 0
    for (const name of spec.countries) {
      const sample = countrySample(name)!
      let hits = 0
      for (const p of sample) {
        let ok = true
        for (const f of preds) if (!f(p, -1, sim)) { ok = false; break }
        if (ok) hits++
      }
      people += (hits / sample.length) * COUNTRY_BY_NAME.get(name)!.population
    }
    return { people, share: people / WORLD_POPULATION_M, sampleMatches: matches, approximate: false }
  }
  // naive per-country combination for rare profiles
  const byCountry = new Map<string, { total: number; hits: number[] }>()
  for (let i = 0; i < n; i++) {
    const p = sim.people[i]!
    let e = byCountry.get(p.country.name)
    if (!e) byCountry.set(p.country.name, (e = { total: 0, hits: new Array(preds.length).fill(0) }))
    e.total++
    preds.forEach((f, k) => {
      if (f(p, i, sim)) e!.hits[k]++
    })
  }
  let expected = 0
  for (const e of byCountry.values()) {
    let prob = 1
    for (const h of e.hits) prob *= h / e.total
    expected += e.total * prob
  }
  const share = expected / n
  return { people: share * WORLD_POPULATION_M, share, sampleMatches: matches, approximate: true, pending }
}

/** Short human-readable chips for the active constraints. */
export function describe(spec: FilterSpec): string[] {
  const out: string[] = []
  if (has(spec.regions)) out.push(spec.regions.join(", "))
  if (has(spec.countries)) out.push(spec.countries.length > 2 ? `${spec.countries.length} countries` : spec.countries.join(", "))
  if (has(spec.genders)) out.push(spec.genders.join(" / "))
  if (spec.ageMin != null || spec.ageMax != null) out.push(`age ${spec.ageMin ?? 0}–${spec.ageMax ?? "99"}`)
  if (has(spec.religions)) out.push(spec.religions.join(" / "))
  if (spec.devoutOnly) out.push("practising")
  if (has(spec.education)) out.push(spec.education.map((e) => EDUCATION_LEVELS[e]).join(" / "))
  if (spec.incomeMin != null) out.push(`≥ $${spec.incomeMin.toLocaleString("en-US")}`)
  if (spec.incomeMax != null) out.push(`≤ $${spec.incomeMax.toLocaleString("en-US")}`)
  if (has(spec.roles)) out.push(spec.roles.map((r) => ROLE_GROUPS[r]).join(" / "))
  if (spec.settlement) out.push(spec.settlement)
  if (has(spec.marital)) out.push(spec.marital.join(" / "))
  if (spec.background) out.push(spec.background)
  if (spec.internet) out.push(spec.internet)
  if (has(spec.languages)) out.push(`speaks ${spec.languages.join(" / ")}`)
  if (has(spec.hobbies)) out.push(`into ${spec.hobbies.join(" / ")}`)
  if (spec.children) out.push(spec.children === "none" ? "no children" : "has children")
  if (has(spec.leanings)) out.push(spec.leanings.map((l) => LEANINGS[l]).join(" / "))
  if (has(spec.partyFamilies)) out.push(spec.partyFamilies.map((f) => PARTY_FAMILIES[f]).join(" / "))
  if (spec.voted) out.push(spec.voted === "yes" ? "voted" : "didn’t vote")
  if (has(spec.activities)) out.push(spec.activities.map((a) => ACTIVITY_CATEGORIES[a]).join(" / "))
  return out
}

export function isEmptySpec(spec: FilterSpec) {
  return predicates(spec).length === 0
}
