import { insideCountry, makePerson, populationGenerator, type LatLon, type Person } from "./population"
import { angularDistance, regionContains, regionMass, samplePlacement, type Region, type RegionMass } from "./region"
import { hashSeed, mulberry32, type Rng } from "./rng"
import { blockAt, buildDayPlan, type Block, type PlaceKey } from "./schedule"
import { PERSON_RADIUS, latLonToXYZ } from "./sphere"

const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000
const DETAIL_ID_BASE = 10_000_000

/** People refreshed per frame while off screen */
const BACKGROUND_BUDGET = 1_000
/** Target time per frame for updating people on screen (ms); the budget adapts to hit it */
const UPDATE_TARGET_MS = 3
/** Time budget per frame for creating people (ms) */
const GEN_BUDGET_MS = 6
/** A spawned person always stands for at least this many real people (millions), so empty land stays empty */
const MIN_REPRESENTS = 0.0002

export interface LocalTime {
  dayIndex: number
  weekday: number
  hour: number
}

/** Local solar milliseconds since the epoch at longitude `lon` */
function localMs(utcMs: number, lon: number) {
  return utcMs + (lon / 15) * HOUR_MS
}

/** 1970-01-01 was a Thursday */
function weekdayOf(dayIndex: number) {
  return (((dayIndex + 4) % 7) + 7) % 7
}

export function localTime(utcMs: number, lon: number): LocalTime {
  const local = localMs(utcMs, lon)
  const dayIndex = Math.floor(local / DAY_MS)
  return { dayIndex, weekday: weekdayOf(dayIndex), hour: (local - dayIndex * DAY_MS) / HOUR_MS }
}

/** [start, end) of the UTC year last seen by subsolarPoint, so it needs no Date per frame */
const yearSpan = [1, 0, 0]

/** Sub-solar point for a UTC instant (ignores the equation of time). Writes into `out` when given. */
export function subsolarPoint(utcMs: number, out: LatLon = [0, 0]): LatLon {
  if (utcMs < yearSpan[0] || utcMs >= yearSpan[1]) {
    const year = new Date(utcMs).getUTCFullYear()
    yearSpan[0] = Date.UTC(year, 0, 1)
    yearSpan[1] = Date.UTC(year + 1, 0, 1)
    yearSpan[2] = Date.UTC(year, 0, 0)
  }
  const doy = (utcMs - yearSpan[2]) / DAY_MS
  const decl = 23.44 * Math.sin(((2 * Math.PI) / 365) * (doy - 81))
  const hours = (((utcMs % DAY_MS) + DAY_MS) % DAY_MS) / HOUR_MS
  let lon = -(hours - 12) * 15
  if (lon < -180) lon += 360
  out[0] = decl
  out[1] = lon
  return out
}

/** Camera information the simulation uses to prioritise work. */
export interface View {
  /** unit vector from the globe centre towards the camera */
  x: number
  y: number
  z: number
  /** a person is on screen when dot(position, dir) exceeds this */
  threshold: number
}

const WANDER: Record<string, number> = {
  Sleeping: 0,
  Working: 0.0025,
  Commuting: 0,
  Eating: 0.001,
  Leisure: 0.004,
  Religious: 0.0008,
  Household: 0.0025,
  Studying: 0.0015,
}

interface DetailJob {
  region: Region
  exclude: Region | null
  mass: RegionMass
  remaining: number
  /** placements that failed (e.g. mass over water); we give up after too many */
  failures: number
  rng: Rng
}

/**
 * Slots [0, globalTarget) hold the world sample; slots from `detailStart` hold people
 * spawned on demand for the zoomed-in region.
 */
export class Simulation {
  readonly globalTarget: number
  readonly detailStart: number
  readonly capacity: number
  readonly people: (Person | undefined)[]
  globalCount = 0
  detailCount = 0
  time: number
  /** user-chosen exaggeration and the zoom-adjusted one actually applied */
  exaggeration = 6
  private effectiveExaggeration = 6

  pos: Float32Array
  xyz: Float32Array
  activity: Uint8Array
  blocks: (Block | undefined)[]
  inView: Uint8Array
  suppressed: Uint8Array
  /** home position as a unit vector, for fast region tests */
  private homeXYZ: Float32Array
  private plans: (Block[] | undefined)[]
  private planDay: Int32Array
  private lastReal: Float64Array
  private realNow = 0

  /** Slots needing a recolour are queued in `dirty`; `dirtyAll` asks for a full pass */
  dirty: Int32Array
  dirtyCount = 0
  dirtyAll = true
  /**
   * Inclusive slot range whose `xyz` changed since the renderer last consumed it
   * (`xyzDirtyMin > xyzDirtyMax` means nothing moved). The renderer resets it.
   */
  xyzDirtyMin = Infinity
  xyzDirtyMax = -1

  region: Region | null = null
  detailTarget = 15_000
  detailRepresents = 0
  private detailJob: DetailJob | null = null
  private detailCounter = 0
  private idToSlot = new Map<number, number>()
  pinnedId: number | null = null
  /** last region setDetailRegion turned down (sample already dense enough), to avoid redoing the work */
  private rejected: Region | null = null
  private despawnListeners = new Set<(ids: readonly number[]) => void>()

  private gen: Generator<Person> | null
  private visList: Int32Array
  private visCursor = 0
  /** how many on-screen people we can afford to update per frame */
  updateBudget = 8_000
  private bgCursor = 0
  view: View = { x: 0, y: 0, z: 1, threshold: 0 }

  constructor(globalTarget: number, private seed: number, startTime = Date.now(), detailCapacity = 40_000) {
    this.globalTarget = globalTarget
    this.detailStart = globalTarget
    this.capacity = globalTarget + detailCapacity
    const cap = this.capacity
    this.people = new Array(cap)
    this.time = startTime
    this.pos = new Float32Array(cap * 2)
    this.xyz = new Float32Array(cap * 3)
    this.activity = new Uint8Array(cap)
    this.blocks = new Array(cap)
    this.inView = new Uint8Array(cap)
    this.suppressed = new Uint8Array(cap)
    this.homeXYZ = new Float32Array(cap * 3)
    this.plans = new Array(cap)
    this.planDay = new Int32Array(cap).fill(-1)
    this.lastReal = new Float64Array(cap).fill(-1)
    this.dirty = new Int32Array(65_536)
    this.visList = new Int32Array(cap)
    // filled in by step() a few ms per frame, so constructing never blocks for long
    this.gen = populationGenerator(globalTarget, seed)
  }

  /** One past the last slot that may hold a person */
  get slotEnd() {
    return this.detailStart + this.detailCount
  }

  get progress() {
    return this.globalCount / this.globalTarget
  }

  slotOf(id: number): number | undefined {
    return this.idToSlot.get(id)
  }

  personById(id: number): Person | undefined {
    const s = this.idToSlot.get(id)
    return s === undefined ? undefined : this.people[s]
  }

  /**
   * Called with the ids of spawned people removed when the zoom region changes.
   * Returns an unsubscribe function (suits useEffect / useSyncExternalStore).
   */
  onDespawn(fn: (ids: readonly number[]) => void): () => void {
    this.despawnListeners.add(fn)
    return () => void this.despawnListeners.delete(fn)
  }

  /** People to spawn in view when zoomed in (0 disables) */
  setDetailTarget(n: number) {
    if (!n || n === this.detailTarget) return
    this.detailTarget = n
    this.rejected = null
    if (this.region) this.setDetailRegion(this.region)
  }

  setPinned(id: number | null) {
    this.pinnedId = id
  }

  setExaggeration(x: number) {
    this.exaggeration = x
  }

  jumpTo(time: number) {
    this.time = time
    for (let i = 0; i < this.slotEnd; i++) if (this.people[i]) this.updatePerson(i, 1)
  }

  private markDirty(i: number) {
    if (this.dirtyCount < this.dirty.length) this.dirty[this.dirtyCount++] = i
    else this.dirtyAll = true
  }

  planFor(i: number): { plan: Block[]; local: LocalTime } {
    const p = this.people[i]!
    this.refreshPlan(i, p)
    return { plan: this.plans[i]!, local: localTime(this.time, p.home[1]) }
  }

  /** Local hour for slot `i` now, rebuilding its day plan when the local day rolls over. */
  private refreshPlan(i: number, p: Person): number {
    const local = localMs(this.time, p.home[1])
    const dayIndex = Math.floor(local / DAY_MS)
    if (this.planDay[i] !== dayIndex) {
      this.plans[i] = buildDayPlan(p, dayIndex, weekdayOf(dayIndex))
      this.planDay[i] = dayIndex
    }
    return (local - dayIndex * DAY_MS) / HOUR_MS
  }

  // -------------------------------------------------------------------------
  // Generation

  private generate(maxMs: number) {
    const t0 = performance.now()
    if (this.gen) {
      while (performance.now() - t0 < maxMs) {
        let done = false
        // small batches: the first person from each country pays for one-off calibration
        for (let k = 0; k < 8; k++) {
          const r = this.gen.next()
          if (r.done) {
            done = true
            break
          }
          this.place(this.globalCount++, r.value)
        }
        if (done) {
          this.gen = null
          break
        }
      }
    }
    const job = this.detailJob
    if (job) {
      while (job.remaining > 0 && performance.now() - t0 < maxMs) {
        for (let k = 0; k < 32 && job.remaining > 0; k++) {
          const placement = samplePlacement(job.rng, job.mass, job.region, job.exclude)
          if (!placement) {
            if (++job.failures > 400) job.remaining = 0
            continue
          }
          job.remaining--
          if (this.detailStart + this.detailCount >= this.capacity) continue
          const id = DETAIL_ID_BASE + this.detailCounter++
          const p = makePerson(id, placement.country, mulberry32(hashSeed(this.seed, id)), placement)
          p.detail = true
          p.represents = this.detailRepresents
          this.place(this.detailStart + this.detailCount++, p)
        }
      }
      if (job.remaining <= 0) this.detailJob = null
    }
  }

  private homeIn(r: Region, i: number) {
    const h = this.homeXYZ
    return h[i * 3] * r.t[0] + h[i * 3 + 1] * r.t[1] + h[i * 3 + 2] * r.t[2] >= r.cos
  }

  private place(slot: number, p: Person) {
    this.people[slot] = p
    latLonToXYZ(p.home[0], p.home[1], 1, this.homeXYZ, slot * 3)
    this.idToSlot.set(p.id, slot)
    this.planDay[slot] = -1
    this.lastReal[slot] = -1
    this.suppressed[slot] = !p.detail && this.region && p.id !== this.pinnedId && this.homeIn(this.region, slot) ? 1 : 0
    this.updatePerson(slot, 1)
    this.markDirty(slot)
  }

  /**
   * Zoomed in: spawn extra people inside `region`, keeping ones already there where the
   * density still matches. Zoomed out (`null`): despawn them again.
   */
  setDetailRegion(next: Region | null) {
    const prev = this.region
    const prevRepresents = this.detailRepresents
    let mass: RegionMass | null = null
    let target = 0

    if (next && !prev && this.rejected && similarRegion(this.rejected, next)) return
    if (next) {
      mass = regionMass(next)
      target = Math.min(this.detailTarget, Math.floor(mass.total / MIN_REPRESENTS))
      let globalInside = 0
      if (target >= 50) for (let i = 0; i < this.globalCount; i++) if (this.homeIn(next, i)) globalInside++
      // the world sample is already dense enough here (or there is nobody to spawn)
      if (target < 50 || globalInside * 1.25 >= target) {
        this.rejected = next
        next = null
      } else {
        this.rejected = null
      }
    }

    // nothing to undo: no region before or after, and only the pinned person (if any) spawned
    if (!next && !prev && this.detailJob === null) {
      let onlyPinned = true
      for (let i = this.detailStart; i < this.slotEnd; i++) if (this.people[i]!.id !== this.pinnedId) onlyPinned = false
      if (onlyPinned) return
    }
    const rng = mulberry32(hashSeed(this.seed, 4242, this.detailCounter))

    // decide which spawned people survive -------------------------------------
    const kept: Person[] = []
    let pinned: Person | undefined
    const candidates: Person[] = []
    for (let i = this.detailStart; i < this.slotEnd; i++) {
      const p = this.people[i]!
      if (p.id === this.pinnedId) pinned = p
      else if (next && this.homeIn(next, i)) candidates.push(p)
    }

    let exclude: Region | null = null
    let remaining = 0
    if (next && mass) {
      const represents = mass.total / target
      if (prev && candidates.length) {
        const quota = Math.round((candidates.length * prevRepresents) / represents)
        if (quota >= candidates.length) {
          kept.push(...candidates)
          exclude = regionContains(prev, next) ? null : prev
        } else {
          for (let i = candidates.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1))
            ;[candidates[i], candidates[j]] = [candidates[j], candidates[i]]
          }
          kept.push(...candidates.slice(0, quota))
          exclude = prev
        }
      }
      remaining = Math.max(0, target - kept.length)
      this.detailRepresents = represents
      for (const p of kept) p.represents = represents
    }
    if (pinned) kept.push(pinned)

    // compact the detail slots ------------------------------------------------
    const keptSet = new Set(kept)
    const despawned: number[] = []
    for (let i = this.detailStart; i < this.slotEnd; i++) {
      const p = this.people[i]!
      this.idToSlot.delete(p.id)
      if (!keptSet.has(p)) despawned.push(p.id)
    }
    const old = new Map<Person, number>()
    for (let i = this.detailStart; i < this.slotEnd; i++) old.set(this.people[i]!, i)
    kept.sort((a, b) => old.get(a)! - old.get(b)!)
    kept.forEach((p, k) => this.moveSlot(old.get(p)!, this.detailStart + k))
    for (let i = this.detailStart + kept.length; i < this.slotEnd; i++) {
      this.people[i] = undefined
      this.plans[i] = undefined
      this.blocks[i] = undefined
    }
    this.detailCount = kept.length

    // global people inside the region are represented by the spawned ones -----
    this.region = next
    for (let i = 0; i < this.globalCount; i++) {
      this.suppressed[i] = next && this.people[i]!.id !== this.pinnedId && this.homeIn(next, i) ? 1 : 0
    }

    let genMass = mass
    if (next && mass && exclude) {
      genMass = regionMass(next, exclude)
      if (genMass.total < mass.total * 0.02) {
        genMass = mass
        exclude = null
      }
    }
    this.detailJob = next && genMass && remaining > 0 ? { region: next, exclude, mass: genMass, remaining, failures: 0, rng } : null
    this.dirtyAll = true
    if (despawned.length) for (const fn of this.despawnListeners) fn(despawned)
  }

  private moveSlot(from: number, to: number) {
    const p = this.people[from]!
    this.idToSlot.set(p.id, to)
    if (from === to) return
    this.people[to] = p
    this.plans[to] = this.plans[from]
    this.planDay[to] = this.planDay[from]
    this.blocks[to] = this.blocks[from]
    this.activity[to] = this.activity[from]
    this.lastReal[to] = this.lastReal[from]
    this.inView[to] = this.inView[from]
    this.suppressed[to] = 0
    this.pos[to * 2] = this.pos[from * 2]
    this.pos[to * 2 + 1] = this.pos[from * 2 + 1]
    this.xyz.copyWithin(to * 3, from * 3, from * 3 + 3)
    this.homeXYZ.copyWithin(to * 3, from * 3, from * 3 + 3)
    this.touchXYZ(to)
  }

  private touchXYZ(i: number) {
    if (i < this.xyzDirtyMin) this.xyzDirtyMin = i
    if (i > this.xyzDirtyMax) this.xyzDirtyMax = i
  }

  // -------------------------------------------------------------------------
  // Simulation

  private placeLatLon(p: Person, key: PlaceKey, out: LatLon, seconds: number) {
    switch (key) {
      case "home": out[0] = p.home[0]; out[1] = p.home[1]; return
      case "work": out[0] = p.work[0]; out[1] = p.work[1]; return
      case "third": out[0] = p.third[0]; out[1] = p.third[1]; return
      case "worship": out[0] = p.worship[0]; out[1] = p.worship[1]; return
      case "school": out[0] = p.school[0]; out[1] = p.school[1]; return
      case "roam": {
        const a = seconds / 900 + p.phase
        out[0] = p.work[0] + Math.sin(a) * 0.03
        out[1] = p.work[1] + Math.sin(a * 1.7 + 1) * 0.04
        return
      }
      case "roamHome": {
        const a = seconds / 600 + p.phase
        out[0] = p.home[0] + Math.sin(a) * 0.012
        out[1] = p.home[1] + Math.cos(a * 1.3) * 0.015
        return
      }
    }
  }

  private a: LatLon = [0, 0]
  private b: LatLon = [0, 0]

  /** Recompute one person's activity and position, blending by `alpha` (1 = snap). */
  private updatePerson(i: number, alpha: number) {
    const p = this.people[i]!
    const seconds = this.time / 1000
    const hour = this.refreshPlan(i, p)
    const blk = blockAt(this.plans[i]!, hour)
    this.blocks[i] = blk
    const cat = blk.ci
    if (cat !== this.activity[i]) {
      this.activity[i] = cat
      this.markDirty(i)
    }

    const a = this.a
    let lat: number
    let lon: number
    if (blk.from && blk.to && blk.span) {
      this.placeLatLon(p, blk.from, a, seconds)
      this.placeLatLon(p, blk.to, this.b, seconds)
      const k = Math.min(1, Math.max(0, (hour - blk.span[0]) / (blk.span[1] - blk.span[0])))
      const e = k * k * (3 - 2 * k)
      lat = a[0] + (this.b[0] - a[0]) * e
      lon = a[1] + (this.b[1] - a[1]) * e
    } else {
      this.placeLatLon(p, blk.place, a, seconds)
      lat = a[0]
      lon = a[1]
    }
    const w = WANDER[blk.cat]
    if (w) {
      const t = seconds / 120 + p.phase
      lat += Math.sin(t * 1.1) * w
      lon += Math.cos(t * 0.9) * w
    }
    // exaggerate distances from home so movement is visible at globe scale, but less where
    // that would carry someone out of their country (coastal commuters would end up at sea)
    let ex = this.effectiveExaggeration
    const dLat = lat - p.home[0]
    const dLon = lon - p.home[1]
    if (ex > 1 && (dLat !== 0 || dLon !== 0)) {
      for (let k = 0; k < 4 && !insideCountry(p.country, p.home[0] + dLat * ex, p.home[1] + dLon * ex); k++) ex = 1 + (ex - 1) * 0.4
      if (!insideCountry(p.country, p.home[0] + dLat * ex, p.home[1] + dLon * ex)) ex = 1
    }
    lat = p.home[0] + dLat * ex
    lon = p.home[1] + dLon * ex

    const j = i * 2
    const pos = this.pos
    const oldLat = pos[j]
    const oldLon = pos[j + 1]
    if (alpha >= 1) {
      pos[j] = lat
      pos[j + 1] = lon
    } else {
      pos[j] += (lat - oldLat) * alpha
      pos[j + 1] += (lon - oldLon) * alpha
    }
    // unchanged (e.g. paused, or asleep at home): skip the trig and the GPU upload
    if (pos[j] !== oldLat || pos[j + 1] !== oldLon || this.lastReal[i] < 0) {
      latLonToXYZ(pos[j], pos[j + 1], PERSON_RADIUS, this.xyz, i * 3)
      this.touchXYZ(i)
    }
    this.lastReal[i] = this.realNow
  }

  /**
   * Advance by `dtReal` seconds at `speed`×. People on screen are updated every frame
   * (within a budget); everyone else is refreshed a slice at a time.
   */
  step(dtReal: number, speed: number, view: View, zoomExaggeration = 1) {
    this.realNow += dtReal
    this.time += dtReal * 1000 * speed
    this.view = view
    this.effectiveExaggeration = 1 + (this.exaggeration - 1) * zoomExaggeration
    // generate faster while the world sample is still filling in
    this.generate(this.gen ? GEN_BUDGET_MS * 1.4 : GEN_BUDGET_MS)

    const end = this.slotEnd
    const { x, y, z, threshold } = view
    const xyz = this.xyz
    let n = 0
    for (let i = 0; i < end; i++) {
      if (!this.people[i]) {
        this.inView[i] = 0
        continue
      }
      const o = i * 3
      const v = xyz[o] * x + xyz[o + 1] * y + xyz[o + 2] * z > threshold ? 1 : 0
      this.inView[i] = v
      if (v && !this.suppressed[i]) this.visList[n++] = i
    }

    const t0 = performance.now()
    const budget = Math.min(n, Math.round(this.updateBudget))
    for (let k = 0; k < budget; k++) {
      const i = this.visList[(this.visCursor + k) % n]
      const dt = this.realNow - this.lastReal[i]
      this.updatePerson(i, this.lastReal[i] < 0 ? 1 : 1 - Math.exp(-dt * 4))
    }
    if (n) this.visCursor = (this.visCursor + budget) % n
    if (budget > 500) {
      const perPerson = (performance.now() - t0) / budget
      const ideal = UPDATE_TARGET_MS / Math.max(perPerson, 1e-5)
      this.updateBudget = Math.min(40_000, Math.max(3_000, this.updateBudget * 0.8 + ideal * 0.2))
    }

    if (end > 0) {
      // continue exactly where this pass stopped, so every slot gets its turn
      let k = 0
      for (let done = 0; k < end && done < BACKGROUND_BUDGET; k++) {
        const i = (this.bgCursor + k) % end
        if (!this.people[i] || this.inView[i] || this.suppressed[i]) continue
        this.updatePerson(i, 1)
        done++
      }
      this.bgCursor = (this.bgCursor + k) % end
    }
  }

  /** Iterate over people currently shown (optionally only those on screen). */
  forEachShown(inViewOnly: boolean, fn: (p: Person, i: number) => void) {
    const end = this.slotEnd
    for (let i = 0; i < end; i++) {
      const p = this.people[i]
      if (!p || this.suppressed[i]) continue
      if (inViewOnly && !this.inView[i]) continue
      fn(p, i)
    }
  }
}

/** Same tolerance the globe uses to decide the view has not really changed */
function similarRegion(a: Region, b: Region) {
  const ratio = b.radius / a.radius
  return ratio > 0.72 && ratio < 1.35 && angularDistance(a.lat, a.lon, b.lat, b.lon) < a.radius * 0.2
}
