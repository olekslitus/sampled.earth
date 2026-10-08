import type { Person } from "./population"
import { hashSeed, mulberry32, normal, pickWeighted, type Rng } from "./rng"

export const ACTIVITY_CATEGORIES = [
  "Sleeping",
  "Working",
  "Commuting",
  "Eating",
  "Leisure",
  "Religious",
  "Household",
  "Studying",
] as const
export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number]
const CAT_INDEX = Object.fromEntries(ACTIVITY_CATEGORIES.map((c, i) => [c, i])) as Record<ActivityCategory, number>

export type PlaceKey = "home" | "work" | "third" | "worship" | "school" | "roam" | "roamHome"

export interface Block {
  start: number
  end: number
  label: string
  cat: ActivityCategory
  /** index of `cat` in ACTIVITY_CATEGORIES */
  ci: number
  place: PlaceKey
  /** Commutes: travel from → to over the [span] window */
  from?: PlaceKey
  to?: PlaceKey
  span?: [number, number]
}

interface Option {
  label: string
  cat: ActivityCategory
  place: PlaceKey
  w: number
}
const opt = (label: string, cat: ActivityCategory, place: PlaceKey, w = 1): Option => ({ label, cat, place, w })

const HOBBY_ACTIVITIES: Record<string, Option[]> = {
  football: [opt("Playing football", "Leisure", "third"), opt("Watching a football match", "Leisure", "third")],
  "watching TV": [opt("Watching TV", "Leisure", "home", 2), opt("Watching a soap opera", "Leisure", "home")],
  music: [opt("Listening to music", "Leisure", "home"), opt("Playing guitar", "Leisure", "home")],
  cooking: [opt("Trying a new recipe", "Household", "home")],
  "visiting friends": [opt("Visiting friends", "Leisure", "third", 2)],
  reading: [opt("Reading a book", "Leisure", "home")],
  "social media": [opt("Scrolling social media", "Leisure", "home", 2), opt("Video-calling family", "Leisure", "home")],
  "video games": [opt("Playing video games", "Leisure", "home")],
  gardening: [opt("Gardening", "Household", "home")],
  "cards & board games": [opt("Playing cards with friends", "Leisure", "third")],
  walking: [opt("Going for a walk", "Leisure", "roamHome")],
  gym: [opt("Working out at the gym", "Leisure", "third")],
  dancing: [opt("Out dancing", "Leisure", "third")],
  fishing: [opt("Fishing", "Leisure", "third")],
  "café chats": [opt("Chatting at a café", "Leisure", "third")],
  crafts: [opt("Knitting / crafting", "Leisure", "home")],
}

function choresFor(p: Person): Option[] {
  const list = [
    opt("Cooking", "Household", "home", 2),
    opt("Cleaning the house", "Household", "home"),
    opt("Doing laundry", "Household", "home"),
    opt("Grocery shopping", "Household", "third"),
  ]
  if (p.children > 0 && p.age < 55) list.push(opt("Looking after the kids", "Household", "home", 2))
  if (!p.urban && p.wealth < 0.4) list.push(opt("Fetching water", "Household", "roamHome", 1.5), opt("Feeding the chickens", "Household", "home"))
  if (p.wealth < 0.5) list.push(opt("Shopping at the market", "Household", "third"))
  return list
}

function leisureFor(p: Person): Option[] {
  const list = p.hobbies.flatMap((h) => HOBBY_ACTIVITIES[h] ?? []).map((o) => ({ ...o, w: o.w * 2 }))
  list.push(opt("Chatting with neighbours", "Leisure", "roamHome"), opt("Relaxing at home", "Leisure", "home"))
  if (p.internet) list.push(opt("On the phone", "Leisure", "home"))
  return list
}

const WEEKEND: Record<string, [number, number]> = {}
function weekendOf(p: Person): [number, number] {
  const c = p.country
  if (WEEKEND[c.name]) return WEEKEND[c.name]
  // 0 = Sunday … 6 = Saturday; second entry is the day off for six-day workers
  const w: [number, number] =
    c.name === "Israel" ? [5, 6] : c.region === "MENA" || c.name === "Afghanistan" ? [6, 5] : [6, 0]
  WEEKEND[c.name] = w
  return w
}

class Builder {
  blocks: Block[] = []
  constructor(private rng: Rng) {}
  push(start: number, end: number, label: string, cat: ActivityCategory, place: PlaceKey, extra?: Partial<Block>) {
    if (end - start < 0.02) return
    this.blocks.push({ start, end, label, cat, ci: CAT_INDEX[cat], place, ...extra })
  }
  fill(start: number, end: number, options: Option[], min = 0.5, max = 1.5) {
    let t = start
    let last = ""
    while (t < end - 0.05) {
      let o = pickWeighted(this.rng, options, options.map((x) => x.w))
      if (o.label === last && options.length > 1) o = pickWeighted(this.rng, options, options.map((x) => x.w))
      const d = Math.min(end - t, min + this.rng() * (max - min))
      this.push(t, t + d, o.label, o.cat, o.place)
      last = o.label
      t += d
    }
  }
  commute(start: number, end: number, label: string, from: PlaceKey, to: PlaceKey) {
    this.push(start, end, label, "Commuting", to, { from, to, span: [start, end] })
  }
  /** Overwrite [start, end) with a new block, inheriting the location when place is null */
  overlay(start: number, end: number, label: string, cat: ActivityCategory, place: PlaceKey | null) {
    const under = this.blocks.find((b) => b.start <= start && b.end > start)
    if (!under || under.cat === "Sleeping" || under.cat === "Commuting") return
    const out: Block[] = []
    for (const b of this.blocks) {
      if (b.end <= start || b.start >= end) out.push(b)
      else {
        if (b.start < start) out.push({ ...b, end: start })
        if (b.end > end) out.push({ ...b, start: end })
      }
    }
    out.push({ start, end, label, cat, ci: CAT_INDEX[cat], place: place ?? under.place })
    out.sort((a, b) => a.start - b.start)
    this.blocks = out
  }
}

function workTask(rng: Rng, p: Person) {
  const tasks = p.occupation!.tasks
  return tasks[Math.floor(rng() * tasks.length)]
}

/** Build a person's plan for one local day. Deterministic per (person, day). */
export function buildDayPlan(p: Person, dayIndex: number, weekday: number): Block[] {
  const rng = mulberry32(hashSeed(p.id, dayIndex, 7919))
  const b = new Builder(rng)
  const [weekendA, weekendB] = weekendOf(p)
  const isWeekend = weekday === weekendA || weekday === weekendB
  const lateCulture = p.country.region === "MENA" || p.country.region === "LAC" || p.country.name === "Spain"
  const lunchAt = (p.country.name === "Spain" ? 14 : lateCulture ? 13.3 : 12.4) + normal(rng) * 0.2
  const dinnerAt = (lateCulture ? 20.3 : 18.9) + normal(rng) * 0.4
  const wake = p.wake + normal(rng) * 0.2 + (isWeekend && p.age >= 14 && p.role !== "Retired" ? 0.8 : 0)
  const bed = Math.min(23.95, p.bed + normal(rng) * 0.25 + (isWeekend && p.age >= 14 ? 0.4 : 0))
  const chores = choresFor(p)
  const leisure = leisureFor(p)
  const eveningMix = [...leisure, ...chores.map((c) => ({ ...c, w: c.w * 0.5 }))]
  const dayMix = [...chores, ...leisure.map((l) => ({ ...l, w: l.w * 0.7 }))]
  const breakfast = p.wealth > 0.5 ? "Coffee & breakfast" : "Eating breakfast"
  const dinner = p.household > 1 ? "Dinner with family" : "Having dinner"

  const morning = (t: number) => {
    b.push(t, t + 0.35, "Washing up & getting dressed", "Household", "home")
    b.push(t + 0.35, t + 0.7, breakfast, "Eating", "home")
    return t + 0.7
  }
  const evening = (t: number) => {
    if (t < dinnerAt - 0.2) b.fill(t, dinnerAt, eveningMix)
    const d = Math.max(t, dinnerAt)
    b.push(d, d + 0.75, dinner, "Eating", "home")
    b.fill(d + 0.75, bed, eveningMix, 0.4, 1.2)
    b.push(bed, 24, "Sleeping", "Sleeping", "home")
  }

  const works = p.role === "Worker" && p.occupation && !(p.workDays === 5 ? isWeekend : weekday === weekendB)

  if (works && p.nightShift) {
    const task = () => workTask(rng, p)
    const place: PlaceKey = p.occupation!.place === "roam" ? "roam" : "work"
    b.push(0, 5.5, `${task()} (night shift)`, "Working", place)
    b.commute(5.5, 5.5 + p.commute, "Heading home after night shift", "work", "home")
    const t = 5.5 + p.commute
    b.push(t, t + 0.5, "Eating breakfast", "Eating", "home")
    b.push(t + 0.5, 14, "Sleeping after night shift", "Sleeping", "home")
    b.push(14, 14.5, "Eating lunch", "Eating", "home")
    b.fill(14.5, 19, dayMix)
    b.push(19, 19.75, dinner, "Eating", "home")
    const leave = 21.5 - p.commute
    b.fill(19.75, leave, eveningMix)
    b.commute(leave, 21.5, "Commuting to night shift", "home", "work")
    b.push(21.5, 24, `${task()} (night shift)`, "Working", place)
  } else if (works) {
    const occ = p.occupation!
    const place: PlaceKey = occ.place === "roam" ? "roam" : occ.place === "home" ? "home" : "work"
    b.push(0, wake, "Sleeping", "Sleeping", "home")
    let t = morning(wake)
    const ws = Math.max(t + p.commute, p.workStart + normal(rng) * 0.15)
    const we = p.workEnd + normal(rng) * 0.25
    if (ws - p.commute > t) b.fill(t, ws - p.commute, dayMix, 0.3, 0.8)
    if (place !== "home") b.commute(ws - p.commute, ws, occ.sector === "Agriculture" ? "Walking to the fields" : "Commuting to work", "home", place === "roam" ? "work" : place)
    t = ws
    const lunchEnd = lunchAt + 0.5 + rng() * 0.5
    const chunk = (s: number, e: number) => {
      let x = s
      while (x < e - 0.05) {
        const d = Math.min(e - x, 1 + rng() * 1.5)
        b.push(x, x + d, workTask(rng, p), "Working", place)
        x += d
      }
    }
    if (we > lunchAt && ws < lunchAt) {
      chunk(ws, lunchAt)
      b.push(lunchAt, lunchEnd, occ.sector === "Agriculture" && p.wealth < 0.5 ? "Resting in the shade" : "Having lunch", "Eating", place)
      chunk(lunchEnd, we)
    } else chunk(ws, we)
    t = we
    if (place !== "home") {
      b.commute(t, t + p.commute, "Commuting home", place === "roam" ? "work" : place, "home")
      t += p.commute
    }
    evening(t)
  } else if (p.role === "Pupil" && !isWeekend) {
    b.push(0, wake, "Sleeping", "Sleeping", "home")
    let t = morning(wake)
    const start = Math.max(t + 0.3, 7.6 + rng() * 0.6)
    const end = p.wealth > 0.5 ? 15 + rng() : 13 + rng() * 1.5
    b.fill(t, start - 0.3, chores.slice(0, 2), 0.2, 0.5)
    b.commute(start - 0.3, start, "Walking to school", "home", "school")
    b.push(start, 10, "In class", "Studying", "school")
    b.push(10, 10.3, "Recess", "Leisure", "school")
    b.push(10.3, Math.min(lunchAt, end), "In class", "Studying", "school")
    if (end > lunchAt) {
      b.push(lunchAt, lunchAt + 0.5, "School lunch", "Eating", "school")
      b.push(lunchAt + 0.5, end, "In class", "Studying", "school")
    }
    b.commute(end, end + 0.3, "Walking home from school", "school", "home")
    t = end + 0.3
    b.push(t, t + 1, "Doing homework", "Studying", "home")
    b.fill(t + 1, dinnerAt, [opt("Playing with friends", "Leisure", "roamHome", 2), ...leisure, ...chores.slice(0, 2)])
    evening(Math.max(t + 1, dinnerAt))
  } else if (p.role === "Student" && !isWeekend) {
    b.push(0, wake, "Sleeping", "Sleeping", "home")
    let t = morning(wake)
    const start = Math.max(t + p.commute, 9 + rng())
    b.fill(t, start - p.commute, leisure, 0.3, 0.8)
    b.commute(start - p.commute, start, "Heading to campus", "home", "school")
    b.push(start, lunchAt, "Attending lectures", "Studying", "school")
    b.push(lunchAt, lunchAt + 0.7, "Lunch at the canteen", "Eating", "school")
    t = lunchAt + 0.7
    const end = t + 2 + rng() * 2
    b.fill(t, end, [opt("Studying in the library", "Studying", "school", 2), opt("Group project meeting", "Studying", "school"), opt("Lab session", "Studying", "school")])
    b.commute(end, end + p.commute, "Heading home", "school", "home")
    evening(end + p.commute)
  } else if (p.role === "Child") {
    b.push(0, wake, "Sleeping", "Sleeping", "home")
    let t = wake
    b.push(t, t + 0.5, "Having breakfast", "Eating", "home")
    t += 0.5
    const play = [opt("Playing", "Leisure", "home", 2), opt("Playing outside", "Leisure", "roamHome"), opt("Drawing", "Leisure", "home"), opt("Being read a story", "Leisure", "home")]
    if (p.age >= 6) play.push(opt("Helping with chores", "Household", "home", 2), opt("Fetching water", "Household", "roamHome"))
    b.fill(t, lunchAt, play)
    b.push(lunchAt, lunchAt + 0.5, "Eating lunch", "Eating", "home")
    t = lunchAt + 0.5
    if (p.age < 4) {
      b.push(t, t + 1.5, "Napping", "Sleeping", "home")
      t += 1.5
    }
    b.fill(t, dinnerAt, play)
    b.push(dinnerAt, dinnerAt + 0.6, "Dinner with family", "Eating", "home")
    b.fill(dinnerAt + 0.6, bed, play, 0.3, 0.6)
    b.push(bed, 24, "Sleeping", "Sleeping", "home")
  } else {
    // retired, homemakers, unemployed, and everyone's day off
    b.push(0, wake, "Sleeping", "Sleeping", "home")
    const t = morning(wake)
    let mix = dayMix
    if (p.role === "Retired")
      mix = [...dayMix, opt("Gardening", "Household", "home"), opt("Playing with grandchildren", "Leisure", "home", p.children ? 2 : 0.1), opt("Taking a stroll", "Leisure", "roamHome"), opt("Napping", "Sleeping", "home")]
    if (p.role === "Unemployed")
      mix = [...dayMix, opt("Looking for work", "Working", "third", 2), opt("Applying for jobs online", "Working", "home", p.internet ? 1.5 : 0.01), opt("Doing odd jobs", "Working", "roamHome")]
    if (p.role === "Homemaker") mix = [...chores.map((c) => ({ ...c, w: c.w * 2 })), ...leisure]
    b.fill(t, lunchAt, mix)
    b.push(lunchAt, lunchAt + 0.7, "Having lunch", "Eating", "home")
    b.fill(lunchAt + 0.7, dinnerAt - 0.1, mix)
    evening(dinnerAt)
  }

  // Religious practice ---------------------------------------------------------
  if (p.religion === "Islam") {
    if (p.devout) {
      b.overlay(Math.max(wake, 4.9), Math.max(wake, 4.9) + 0.2, "Fajr prayer", "Religious", null)
      if (weekday !== 5) b.overlay(12.9, 13.1, "Dhuhr prayer", "Religious", null)
      b.overlay(15.8, 16.0, "Asr prayer", "Religious", null)
      b.overlay(18.6, 18.8, "Maghrib prayer", "Religious", null)
      b.overlay(Math.min(20.2, bed - 0.3), Math.min(20.4, bed - 0.1), "Isha prayer", "Religious", null)
    }
    if (weekday === 5 && p.age >= 12 && (p.devout || (p.gender === "Male" && rng() < 0.6)))
      b.overlay(12.4, 13.4, "Friday prayers at the mosque", "Religious", "worship")
  } else if (p.religion === "Christianity" && weekday === 0 && (p.devout || rng() < 0.15)) {
    b.overlay(9.5, 11.3, "Attending church", "Religious", "worship")
  } else if (p.religion === "Hinduism" && p.devout) {
    b.overlay(wake + 0.1, wake + 0.35, "Morning puja", "Religious", "home")
    if (rng() < 0.2) b.overlay(18.2, 18.9, "Evening aarti at the temple", "Religious", "worship")
  } else if (p.religion === "Buddhism" && p.devout) {
    b.overlay(wake + 0.1, wake + 0.35, rng() < 0.5 ? "Morning meditation" : "Offering alms to monks", "Religious", "home")
    if (rng() < 0.12) b.overlay(17.5, 18.5, "Visiting the temple", "Religious", "worship")
  } else if (p.religion === "Judaism" && p.devout) {
    if (weekday === 5) b.overlay(19, 21, "Shabbat dinner", "Religious", "home")
    if (weekday === 6) b.overlay(9, 11.5, "At the synagogue", "Religious", "worship")
  } else if (p.religion === "Folk religion" && p.devout) {
    b.overlay(wake + 0.1, wake + 0.3, "Offering at the family altar", "Religious", "home")
  }

  return b.blocks
}

export function blockAt(plan: Block[], hour: number): Block {
  for (const blk of plan) if (hour >= blk.start && hour < blk.end) return blk
  return plan[plan.length - 1]
}
