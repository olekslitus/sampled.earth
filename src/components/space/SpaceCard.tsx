"use client"

import { useId, useRef } from "react"
import { ExternalLink, Locate, X } from "lucide-react"

import { useCardFocus, useTicker } from "@/components/hooks"
import { FLOATING_CARD_CLASS } from "@/components/panels/DisasterCard"
import { Button } from "@/components/ui/button"
import { trackPosition } from "@/lib/space/tracks"
import { AU, EARTH_RADIUS_KM, formatDistance, formatLightTime, LY } from "@/lib/space/units"
import { PAGE_LOADED } from "./data"
import type { SpaceItem } from "./items"
import { NEW_EXOPLANET_DAYS, publishedDaysAgo } from "./StarLayers"
import type { SpaceView } from "./view"

const KIND_LABEL: Record<string, string> = {
  probe: "Spacecraft",
  telescope: "Space telescope",
  interstellar: "Interstellar visitor",
  asteroid: "Near-Earth asteroid",
}

function galaxyType(t: number) {
  if (t < -1) return "Elliptical galaxy"
  if (t < 0.5) return "Lenticular galaxy"
  if (t < 9.5) return "Spiral galaxy"
  return "Irregular / dwarf galaxy"
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right tabular-nums">{children}</span>
    </div>
  )
}

function yearsAgo(lightYears: number, now: number) {
  const year = new Date(now).getUTCFullYear() - Math.round(lightYears)
  if (lightYears < 3000) return year > 0 ? `around ${year} AD` : `around ${-year + 1} BC`
  return `${formatLightTime(lightYears * LY)} ago`
}

/** Details for something picked in space, with live distances */
export function SpaceCard({ item, view, onClose, onFly }: { item: SpaceItem; view: SpaceView; onClose: () => void; onFly: () => void }) {
  const titleId = useId()
  const ref = useRef<HTMLElement>(null)
  useCardFocus(ref, item.key)
  useTicker(500)

  const p = [0, 0, 0]
  const known = item.position(view.time, p)
  const fromEarth = known ? Math.hypot(p[0]!, p[1]!, p[2]!) : NaN
  const sun = view.bodies.Sun
  const fromSun = known ? Math.hypot(p[0]! - sun[0]!, p[1]! - sun[1]!, p[2]! - sun[2]!) : NaN
  const now = PAGE_LOADED

  let kicker = ""
  let title = item.name
  let about = item.about ?? ""
  let url: string | undefined
  const rows: [string, React.ReactNode][] = []

  if (item.body) {
    const b = item.body
    kicker = b.key === "Sun" ? "Star" : b.key === "Moon" ? "Moon" : b.key === "Pluto" ? "Dwarf planet" : "Planet"
    about = b.about
    rows.push(["Diameter", `${Math.round(b.radiusKm * 2).toLocaleString("en-US")} km`])
    if (b.key !== "Sun" && b.key !== "Earth" && b.key !== "Moon") rows.push(["From the Sun", formatDistance(fromSun)])
  } else if (item.track) {
    const { info, data } = item.track
    kicker = `${KIND_LABEL[info.kind]} · ${info.agency}`
    about = info.about
    url = info.url
    rows.push([info.kind === "probe" || info.kind === "telescope" ? "Launched" : "Discovered", new Date(info.since).toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })])
    if (info.center === "sun") rows.push(["From the Sun", formatDistance(fromSun)])
    // speed from the path, relative to the Sun (or Earth for those near it)
    const a = [0, 0, 0]
    const b = [0, 0, 0]
    if (trackPosition(data, view.time - 1_800_000, a) && trackPosition(data, view.time + 1_800_000, b)) {
      const kmPerS = (Math.hypot(b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!) * AU * EARTH_RADIUS_KM) / 3600
      rows.push([info.center === "sun" ? "Speed around the Sun" : "Speed relative to Earth", `${kmPerS.toFixed(1)} km/s`])
    }
    if (data.ends && view.time > data.ends) rows.push(["Position", `last known, ${new Date(data.ends).toISOString().slice(0, 10)}`])
  } else if (item.star) {
    kicker = "Star"
    rows.push(["The light you’d see left it", yearsAgo(item.star.ly, now)])
  } else if (item.finding) {
    const f = item.finding
    kicker = `Finding · ${f.year}`
    title = f.title
    about = f.about
    url = f.url
  } else if (item.exo) {
    const s = item.exo
    kicker = `Star with ${s.planets.length} known planet${s.planets.length > 1 ? "s" : ""}`
    url = `https://exoplanetarchive.ipac.caltech.edu/overview/${encodeURIComponent(s.host)}`
  } else if (item.galaxy) {
    const g = item.galaxy
    kicker = galaxyType(g.type)
    rows.push(["Diameter", `${g.size.toLocaleString("en-US", { maximumSignificantDigits: 2 })} thousand light-years`])
    if (fromEarth < 1e9 * LY) rows.push(["Its light left it", `${formatLightTime(fromEarth)} ago`])
  } else {
    kicker = "Place"
  }

  return (
    <section ref={ref} role="dialog" aria-modal="false" aria-labelledby={titleId} className={FLOATING_CARD_CLASS}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-2 rounded-full" style={{ background: item.color }} aria-hidden /> {kicker}
          </p>
          <h2 id={titleId} className="text-base font-semibold">
            {title}
          </h2>
          {item.finding && <p className="text-xs text-muted-foreground">{item.name}</p>}
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onFly} aria-label="Centre on it" title="Centre on it">
          <Locate />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close" data-card-close>
          <X />
        </Button>
      </div>
      {about && <p className="mt-2 text-sm">{about}</p>}
      <div className="mt-3 divide-y divide-border/60">
        {Number.isFinite(fromEarth) && item.key !== "body:Earth" && item.key !== "place:universe-here" && item.key !== "place:here" && (
          <>
            <Row label="From Earth">{formatDistance(fromEarth)}</Row>
            {fromEarth < 0.5 * LY && <Row label="Light takes">{formatLightTime(fromEarth)}</Row>}
          </>
        )}
        {rows.map(([k, v]) => (
          <Row key={k} label={k}>
            {v}
          </Row>
        ))}
      </div>
      {item.exo && <PlanetList item={item} now={now} />}
      {url && (
        <a href={url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
          More <ExternalLink className="size-3" />
        </a>
      )}
    </section>
  )
}

function PlanetList({ item, now }: { item: SpaceItem; now: number }) {
  const planets = [...item.exo!.planets].sort((a, b) => (a.period ?? 1e9) - (b.period ?? 1e9))
  return (
    <ul className="mt-3 space-y-2">
      {planets.map((p) => {
        const fresh = publishedDaysAgo(p.published, now) < NEW_EXOPLANET_DAYS
        const size = p.radius != null ? `${p.radius.toLocaleString("en-US", { maximumSignificantDigits: 2 })}× Earth’s size` : p.mass != null ? `${p.mass.toLocaleString("en-US", { maximumSignificantDigits: 2 })}× Earth’s mass` : null
        return (
          <li key={p.name} className="rounded-md border border-border bg-muted/40 p-2 text-xs">
            <p className="flex items-center gap-1.5 font-medium">
              {p.name}
              {fresh && <span className="rounded-sm bg-amber-400/90 px-1 text-[9px] font-semibold text-black">NEW</span>}
            </p>
            <p className="text-muted-foreground">
              Found {p.year} by {p.method.toLowerCase()} · {p.facility}
            </p>
            <p className="text-muted-foreground">
              {[size, p.period != null && `a year lasts ${p.period < 2 ? `${(p.period * 24).toFixed(0)} hours` : `${p.period.toLocaleString("en-US", { maximumSignificantDigits: 3 })} days`}`, p.temp != null && `~${Math.round(p.temp - 273)} °C`]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </li>
        )
      })}
    </ul>
  )
}
