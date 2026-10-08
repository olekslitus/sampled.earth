"use client"

import { useMemo } from "react"

import { FINDINGS, type Finding } from "@/lib/space/findings"
import { galacticToSky, skyDirection } from "@/lib/space/frames"
import { BODIES, type BodyInfo } from "@/lib/space/solar"
import { TRACKED, trackPosition, type ExoSystem, type Track, type TrackedObject } from "@/lib/space/tracks"
import { AU, GLY, KLY, KM, LY, MLY, UNIVERSE_RADIUS } from "@/lib/space/units"
import { GALAXY_NAMES, PAGE_LOADED, type Galaxy, type SpaceLive, type StarCatalog } from "./data"
import { TRACK_COLOR } from "./SolarLayers"
import { NEW_EXOPLANET_DAYS, publishedDaysAgo } from "./StarLayers"
import { SUN_TO_GALACTIC_CENTRE_KLY, type Focus, type SpaceView } from "./view"

export type SpaceItemKind = "body" | "track" | "star" | "exo" | "galaxy" | "place" | "finding"

/** Something in space that can be labelled, picked and flown to */
export interface SpaceItem {
  key: string
  kind: SpaceItemKind
  name: string
  color: string
  /** Earth-centred position (Earth radii, sky frame); false when unknown at that time */
  position: (ms: number, out: number[]) => boolean
  /** camera distances (Earth radii) at which it is labelled or can be picked */
  range: [number, number]
  /** drawn with a text label (otherwise only picked from its point on screen) */
  labelled: boolean
  /** higher wins when labels overlap */
  priority: number
  /** a good viewing distance */
  frame: number
  /** what it is, for the card and the label's second line */
  body?: BodyInfo
  track?: { info: TrackedObject; data: Track }
  star?: { name: string; ly: number }
  exo?: ExoSystem
  galaxy?: Galaxy
  finding?: Finding
  about?: string
  /** marks freshly published exoplanets */
  fresh?: boolean
}

const fixed = (p: number[]) => (_: number, out: number[]) => {
  out[0] = p[0]!
  out[1] = p[1]!
  out[2] = p[2]!
  return true
}

const at = (ra: number, dec: number, ly: number) => skyDirection(ra, dec).map((v) => v * ly * LY)

/** Places that are not single objects: the Milky Way's arms, galaxy clusters, the edge of it all */
function places(): SpaceItem[] {
  const gc = galacticToSky(SUN_TO_GALACTIC_CENTRE_KLY, 0, -0.065).map((v) => v * KLY)
  // a point on each arm of the model in MilkyWay (galactocentric, kly)
  const arm = (k: number, R: number) => {
    const phi = Math.PI + (k * Math.PI) / 2 + Math.log(R / 32.6) / Math.tan((12 * Math.PI) / 180)
    return galacticToSky(R * Math.cos(phi) + SUN_TO_GALACTIC_CENTRE_KLY, R * Math.sin(phi), 0).map((v) => v * KLY)
  }
  const place = (key: string, name: string, p: number[], range: [number, number], priority: number, frame: number, about: string): SpaceItem => ({
    key: `place:${key}`,
    kind: "place",
    name,
    color: "#9fb4d8",
    position: fixed(p),
    range,
    labelled: true,
    priority,
    frame,
    about,
  })
  const cluster = (key: string, name: string, ra: number, dec: number, mly: number, about: string) =>
    place(key, name, at(ra, dec, mly * 1e6), [25 * MLY, 25 * GLY], 55, Math.max(30 * MLY, mly * MLY * 0.6), about)
  return [
    place("here", "Sun · you are here", [0, 0, 0], [3 * LY, 1.2 * MLY], 100, 35 * LY, "Every person on the globe lives within this dot."),
    place("milky-way", "Milky Way · you are here", gc, [1.2 * MLY, 400 * GLY], 100, 180 * KLY, "Our galaxy: a few hundred billion stars, about 100,000 light-years across. The Sun takes about 230 million years to go once around it."),
    place("perseus", "Perseus Arm", arm(0, 40), [15 * KLY, 600 * KLY], 45, 180 * KLY, "A major spiral arm just outside the Sun’s orbit."),
    place("sagittarius", "Sagittarius–Carina Arm", arm(1, 30), [15 * KLY, 600 * KLY], 45, 180 * KLY, "The arm just inside the Sun’s orbit."),
    place("scutum", "Scutum–Centaurus Arm", arm(2, 30), [15 * KLY, 600 * KLY], 45, 180 * KLY, "One of the galaxy’s two dominant arms, starting at the end of the central bar."),
    place("norma", "Norma–Outer Arm", arm(3, 46), [15 * KLY, 600 * KLY], 45, 180 * KLY, "Starts near the centre as the Norma Arm and wraps around to the far edge as the Outer Arm."),
    place("orion", "Orion Arm (the Sun’s)", galacticToSky(-1.5, 3, 0).map((v) => v * KLY), [3 * KLY, 200 * KLY], 50, 40 * KLY, "A minor arm, or spur, between the Perseus and Sagittarius arms. The Sun sits near its inner edge."),
    place("local-group", "Local Group", gc.map((v, i) => v + ([1854.9, 1656.5, -350][i]! * KLY - v) * 0.5), [3 * MLY, 120 * MLY], 60, 9 * MLY, "About 80 galaxies bound together by gravity, dominated by the Milky Way and Andromeda."),
    cluster("virgo", "Virgo Cluster", 187.7, 12.4, 54, "The nearest big galaxy cluster, around 1,500 galaxies. The Local Group is falling towards it."),
    cluster("fornax", "Fornax Cluster", 54.6, -35.45, 62, "A compact cluster of galaxies in the southern sky."),
    cluster("centaurus", "Centaurus Cluster", 192.2, -41.3, 170, "A rich cluster near the heart of Laniakea."),
    cluster("hydra", "Hydra Cluster", 159.2, -27.5, 160, "One of the largest clusters within 200 million light-years."),
    cluster("norma-cluster", "Great Attractor (Norma Cluster)", 243.6, -60.9, 220, "Where the galaxies of our supercluster, Laniakea, are all flowing — hidden behind the Milky Way’s dust."),
    cluster("perseus-cluster", "Perseus Cluster", 49.95, 41.51, 240, "Part of the Perseus–Pisces chain of clusters; its hot gas ‘hums’ a B-flat 57 octaves below middle C."),
    cluster("coma", "Coma Cluster", 194.95, 27.98, 321, "More than 1,000 galaxies; where dark matter was first proposed, in 1933."),
    cluster("shapley", "Shapley Supercluster", 202, -31, 650, "The largest concentration of galaxies in the nearby universe."),
    place("laniakea", "Laniakea · our supercluster", at(220, -55, 160e6), [80 * MLY, 25 * GLY], 58, 1.2 * GLY, "‘Immeasurable heaven’ in Hawaiian: some 100,000 galaxies, including ours, flowing towards the Great Attractor."),
    place("edge", "Edge of the observable universe", [0, UNIVERSE_RADIUS, 0], [8 * GLY, 1e3 * GLY], 90, 140 * GLY, "The farthest light we can see: the afterglow of the Big Bang, released 380,000 years after it. The universe goes on beyond this, but its light hasn’t had time to reach us."),
    place("universe-here", "You are here", [0, 0, 0], [1.2 * GLY, 1e3 * GLY], 100, 3.2, "All of humanity, the Earth, the Sun and the Milky Way are in this one point."),
  ]
}

/** Every labelled or pickable thing in space, rebuilt when the data changes */
export function useSpaceItems(view: SpaceView, live: SpaceLive | null, stars: StarCatalog | null, galaxies: Galaxy[] | null) {
  return useMemo(() => {
    const items: SpaceItem[] = []
    const now = PAGE_LOADED

    // Sun, planets, Moon, Earth ---------------------------------------------------------
    for (const b of BODIES) {
      const isEarth = b.key === "Earth"
      const isSun = b.key === "Sun"
      const radius = b.radiusKm * KM
      items.push({
        key: `body:${b.key}`,
        kind: "body",
        name: b.name,
        color: b.color,
        position: isEarth ? fixed([0, 0, 0]) : (_, out) => {
          const p = view.bodies[b.key]
          out[0] = p[0]!
          out[1] = p[1]!
          out[2] = p[2]!
          return true
        },
        range: isEarth ? [120, 3 * LY] : isSun ? [3, 3 * LY] : b.key === "Moon" ? [6, 3e4] : b.key === "Pluto" ? [20 * AU, 0.5 * LY] : [300, 400 * AU],
        labelled: true,
        priority: isEarth || isSun ? 95 : 80,
        frame: isEarth ? 3.2 : Math.max(radius * 6, 1.5),
        body: b,
      })
    }

    // spacecraft and visitors -----------------------------------------------------------
    for (const t of live?.tracks ?? []) {
      const info = TRACKED.find((o) => o.id === t.id)
      if (!info) continue
      const nearEarth = info.center === "earth"
      const p = [0, 0, 0]
      items.push({
        key: `track:${t.id}`,
        kind: "track",
        name: info.name,
        color: TRACK_COLOR[info.kind],
        position: (ms, out) => {
          if (ms < Date.parse(info.since)) return false
          if (!trackPosition(t, ms, p)) return false
          for (let i = 0; i < 3; i++) out[i] = (p[i]! - (nearEarth ? 0 : view.earthHelio[i]!)) * AU
          return true
        },
        range: nearEarth ? [60, 4 * AU] : [0.4 * AU, 2 * LY],
        labelled: true,
        priority: info.kind === "interstellar" ? 66 : 60,
        frame: nearEarth ? 400 : 3 * AU,
        track: { info, data: t },
      })
    }

    // named stars -----------------------------------------------------------------------
    for (const [i, name, ly] of stars?.names ?? []) {
      const d = stars!.data
      items.push({
        key: `star:${i}`,
        kind: "star",
        name,
        color: "#fff4d6",
        position: fixed([d[i * 5]! * LY, d[i * 5 + 1]! * LY, d[i * 5 + 2]! * LY]),
        range: [0.12 * LY, 300 * LY],
        labelled: true,
        priority: 30 - i * 0.01,
        frame: Math.max(0.6 * LY, ly * 0.08 * LY),
        star: { name, ly },
      })
    }

    // exoplanet systems: all pickable, the newest labelled --------------------------------
    const findingHosts = new Set(FINDINGS.flatMap((f) => ("host" in f.where ? [f.where.host] : [])))
    for (const s of live?.systems ?? []) {
      const pos = skyDirection(s.ra, s.dec).map((v) => v * s.dist * LY)
      const newest = Math.min(...s.planets.map((p) => publishedDaysAgo(p.published, now)))
      const fresh = newest < NEW_EXOPLANET_DAYS
      items.push({
        key: `exo:${s.host}`,
        kind: "exo",
        name: s.host,
        color: fresh ? "#ffb547" : "#4fd1c5",
        position: fixed(pos),
        range: [0.3 * LY, 30 * KLY],
        labelled: fresh && !findingHosts.has(s.host),
        priority: fresh ? 40 - newest / 100 : 10,
        frame: Math.max(1.5 * LY, s.dist * 0.04 * LY),
        exo: s,
        fresh,
      })
    }

    // galaxies --------------------------------------------------------------------------
    for (const g of galaxies ?? []) {
      const famous = g.id in GALAXY_NAMES
      items.push({
        key: `galaxy:${g.id}`,
        kind: "galaxy",
        name: g.name,
        color: "#c9d6ff",
        position: fixed(g.pos.map((v) => v * KLY)),
        range: [150 * KLY, 600 * MLY],
        labelled: famous || g.absMag < -20.6,
        priority: famous ? 52 : 35 - g.absMag * 0.1,
        frame: Math.max(g.size * 3, 20) * KLY,
        galaxy: g,
      })
    }

    // findings --------------------------------------------------------------------------
    for (const f of FINDINGS) {
      let position: SpaceItem["position"]
      let range: [number, number]
      let frame: number
      const w = f.where
      if ("track" in w) {
        const track = items.find((it) => it.key === `track:${w.track}`)
        if (!track) continue
        position = track.position
        range = [0.4 * AU, 2 * LY]
        frame = 4 * AU
        // the finding replaces the plain track label
        track.labelled = false
      } else if ("host" in w) {
        const host = items.find((it) => it.key === `exo:${w.host}`)
        if (!host) continue
        position = host.position
        const ly = host.exo!.dist
        range = [0.3 * LY, Math.max(2000 * LY, ly * 80 * LY)]
        frame = host.frame
      } else {
        position = fixed(at(w.ra, w.dec, w.ly))
        range = w.ly > 1e9 ? [3 * GLY, 1e3 * GLY] : w.ly > 1e6 ? [5 * MLY, 2 * GLY] : w.ly > 1e4 ? [3 * KLY, 3 * MLY] : [10 * LY, 60 * KLY]
        frame = w.ly > 1e9 ? 20 * GLY : w.ly > 1e6 ? w.ly * 0.5 * LY : Math.max(3 * LY, w.ly * 0.05 * LY)
      }
      const exo = "host" in w ? items.find((it) => it.key === `exo:${w.host}`)?.exo : undefined
      items.push({ key: `finding:${f.id}`, kind: "finding", name: f.label, color: "#ff8fd0", position, range, labelled: true, priority: 70, frame, finding: f, exo })
    }

    // only the very newest systems get a name tag; the rest of the year's finds stay amber dots
    const newest = items.filter((i) => i.labelled && i.kind === "exo").sort((a, b) => b.priority - a.priority)
    newest.slice(12).forEach((i) => (i.labelled = false))

    items.push(...places())
    return items
  }, [view, live, stars, galaxies])
}

/** Fly-to target for an item */
export function focusFor(item: SpaceItem): Focus {
  return { key: item.key, position: item.position, dist: item.frame }
}
