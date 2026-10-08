"use client"

import type { RefObject } from "react"
import { Baby, PawPrint, RefreshCw, Siren, Tornado } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { AnimalMarker } from "@/components/AnimalMarker"
import { LEVEL_STYLE } from "@/components/globe/UnrestLayer"
import { emptyVitalStats, type VitalStats } from "@/components/globe/VitalLayer"
import { usePolled } from "@/components/hooks"
import { SPECIES, iconCount, type Species } from "@/lib/sim/animals"
import { DISASTER_KINDS, bySeverity, type Disaster, type DisasterFeed, type DisasterKind } from "@/lib/disasters"
import { COUNTRY_BY_NAME } from "@/lib/sim/countries"
import { HOTSPOTS, UNREST_LEVELS, UNREST_SOURCE_NOTE, type Hotspot } from "@/lib/sim/unrest"
import type { Theme } from "@/lib/sim/attributes"
import { cn } from "@/lib/utils"
import { AlertBadge, KIND_ICON, timeAgo } from "./DisasterCard"

const GROUPS = ["Farm & pets", "Wild", "Ocean"] as const

function compact(n: number) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k`
  return Math.round(n).toLocaleString("en-US")
}

/** Where to look for a species: its biggest range, or its biggest keeper country */
export function speciesHome(s: Species): { lat: number; lon: number; alt: number } {
  if (s.ranges) {
    const r = [...s.ranges].sort((a, b) => b[3] - a[3])[0]
    return { lat: r[0], lon: r[1], alt: Math.max(0.08, Math.min(1.2, r[2] * 0.12)) }
  }
  const top = Object.entries(s.countries ?? { India: 1 }).sort((a, b) => b[1] - a[1])[0][0]
  const c = COUNTRY_BY_NAME.get(top)!
  return { lat: c.cities[0].lat, lon: c.cities[0].lon, alt: 0.6 }
}

interface LayersPanelProps {
  theme: Theme
  showVital: boolean
  onShowVital: (v: boolean) => void
  /** written by the globe's births & deaths layer; sampled here a few times a second */
  vitalRef: RefObject<VitalStats>
  animals: string[]
  onAnimals: (keys: string[]) => void
  showUnrest: boolean
  onShowUnrest: (v: boolean) => void
  onFlyTo: (lat: number, lon: number, alt: number) => void
  onPickHotspot: (h: Hotspot) => void
  showDisasters: boolean
  onShowDisasters: (v: boolean) => void
  disasterFeed: DisasterFeed | null
  disastersLoading: boolean
  disastersError: string | null
  onRetryDisasters: () => void
  hiddenKinds: DisasterKind[]
  onHiddenKinds: (k: DisasterKind[]) => void
  onPickDisaster: (d: Disaster) => void
}

export function LayersPanel(props: LayersPanelProps) {
  const toggleSpecies = (key: string) =>
    props.onAnimals(props.animals.includes(key) ? props.animals.filter((k) => k !== key) : [...props.animals, key])

  return (
    <div className="space-y-5">
      {/* Births & deaths ----------------------------------------------------------- */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="vital" className="flex items-center gap-2 text-sm font-medium">
            <Baby className="size-4" /> Births & deaths
          </Label>
          <Switch id="vital" size="sm" checked={props.showVital} onCheckedChange={props.onShowVital} />
        </div>
        <p className="text-[11px] text-muted-foreground">
          Pulses bloom where babies are born and fold in where people die, at real-world rates for what is on screen.
        </p>
        {props.showVital && <VitalStatsView vitalRef={props.vitalRef} />}
      </section>

      {/* Animals ------------------------------------------------------------------- */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-medium">
            <PawPrint className="size-4" /> Animals
          </span>
          {props.animals.length > 0 && (
            <Button variant="ghost" size="xs" onClick={() => props.onAnimals([])}>
              Hide all
            </Button>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">Each species has its own marker shape and colour, shown next to its name. Rare species get one marker per animal; common ones are sampled. Click a name to fly there.</p>
        {GROUPS.map((g) => (
          <div key={g} className="space-y-1">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{g}</p>
            <ul className="space-y-0.5">
              {SPECIES.filter((s) => s.group === g).map((s) => {
                const on = props.animals.includes(s.key)
                const per = s.population / iconCount(s)
                return (
                  <li key={s.key} className={cn("flex items-center gap-2 rounded-md px-1 py-0.5 text-xs", on && "bg-muted")}>
                    <Switch size="sm" checked={on} onCheckedChange={() => toggleSpecies(s.key)} aria-label={`Show ${s.name}`} />
                    <button
                      className="flex min-w-0 flex-1 items-center gap-1.5 text-left hover:underline"
                      title={s.note}
                      onClick={() => {
                        if (!on) toggleSpecies(s.key)
                        const h = speciesHome(s)
                        props.onFlyTo(h.lat, h.lon, h.alt)
                      }}
                    >
                      <AnimalMarker species={s.key} theme={props.theme} />
                      <span className="truncate">{s.name}</span>
                    </button>
                    <span className="shrink-0 tabular-nums text-muted-foreground" title={per > 1 ? `1 marker ≈ ${compact(per)} animals` : "1 marker = 1 animal"}>
                      {compact(s.population)}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </section>

      {/* Natural disasters ------------------------------------------------------- */}
      <DisastersSection {...props} />

      {/* Unrest -------------------------------------------------------------------- */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="unrest" className="flex items-center gap-2 text-sm font-medium">
            <Siren className="size-4" /> Conflict & unrest
          </Label>
          <Switch id="unrest" size="sm" checked={props.showUnrest} onCheckedChange={props.onShowUnrest} />
        </div>
        <p className="text-[11px] text-muted-foreground">{UNREST_SOURCE_NOTE}</p>
        {props.showUnrest &&
          UNREST_LEVELS.map((level) => {
            const LevelIcon = LEVEL_STYLE[level].icon
            return (
              <div key={level} className="space-y-0.5">
                <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  <LevelIcon className="size-3" style={{ color: LEVEL_STYLE[level].color }} strokeWidth={2.5} aria-hidden />
                  {level}
                </p>
                {HOTSPOTS.filter((h) => h.level === level).map((h) => (
                  <button key={h.name} className="block w-full rounded-md px-1 py-0.5 text-left text-xs hover:bg-muted" title={h.summary} onClick={() => props.onPickHotspot(h)}>
                    {h.name}
                  </button>
                ))}
              </div>
            )
          })}
      </section>
    </div>
  )
}

function VitalStatsView({ vitalRef }: { vitalRef: RefObject<VitalStats> }) {
  const vital = usePolled(() => ({ ...vitalRef.current }), 250, emptyVitalStats())
  return (
    <div className="grid grid-cols-2 gap-2 text-xs">
      <Stat label="Born since switched on" value={compact(vital.births)} sub={`${vital.birthsPerSecond.toFixed(1)} per second`} />
      <Stat label="Died since switched on" value={compact(vital.deaths)} sub={`${vital.deathsPerSecond.toFixed(1)} per second`} />
      <p className="col-span-2 text-[11px] text-muted-foreground">
        Each pulse ≈ {compact(vital.birthsPerPulse)} {vital.birthsPerPulse < 1.5 ? "birth" : "births"} / {compact(vital.deathsPerPulse)}{" "}
        {vital.deathsPerPulse < 1.5 ? "death" : "deaths"}. At “Real time” speed you see them as they happen.
      </p>
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/40 p-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-base font-semibold tabular-nums">{value}</p>
      <p className="text-[11px] text-muted-foreground">{sub}</p>
    </div>
  )
}

function DisastersSection(props: LayersPanelProps) {
  const feed = props.disasterFeed
  const counts = new Map<DisasterKind, number>()
  for (const d of feed?.events ?? []) counts.set(d.kind, (counts.get(d.kind) ?? 0) + 1)
  const visible = (feed?.events ?? []).filter((d) => !props.hiddenKinds.includes(d.kind))
  const top = visible.filter((d) => d.notable || d.alert === "Orange" || d.alert === "Red").sort(bySeverity).slice(0, 12)
  const toggleKind = (k: DisasterKind) =>
    props.onHiddenKinds(props.hiddenKinds.includes(k) ? props.hiddenKinds.filter((x) => x !== k) : [...props.hiddenKinds, k])

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor="disasters" className="flex items-center gap-2 text-sm font-medium">
          <Tornado className="size-4" /> Natural disasters
          <span className="rounded-sm bg-muted px-1 text-[10px] font-medium tracking-wider text-muted-foreground uppercase">Live</span>
        </Label>
        <Switch id="disasters" size="sm" checked={props.showDisasters} onCheckedChange={props.onShowDisasters} />
      </div>
      <p className="text-[11px] text-muted-foreground">
        Earthquakes M4.5+ from the last 30 days (USGS), plus current cyclones, floods, droughts, wildfires and volcanoes (GDACS, NASA EONET).
        Refreshes every 10 minutes.
      </p>
      {props.showDisasters && !feed && props.disastersLoading && <p className="text-xs text-muted-foreground">Loading live feeds…</p>}
      {props.showDisasters && (props.disastersError || feed?.sources.some((s) => !s.ok)) && !props.disastersLoading && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-destructive" role="status">
            {props.disastersError
              ? feed
                ? "Refresh failed; showing the last update."
                : props.disastersError
              : `Unavailable: ${feed!.sources.filter((s) => !s.ok).map((s) => s.name).join(", ")}`}
          </p>
          <Button variant="outline" size="xs" onClick={props.onRetryDisasters}>
            <RefreshCw /> Retry
          </Button>
        </div>
      )}
      {props.showDisasters && feed && (
        <>
          {feed.events.length === 0 && <p className="text-xs text-muted-foreground">No active events right now.</p>}
          <ul className="space-y-0.5">
            {DISASTER_KINDS.filter((k) => counts.get(k)).map((k) => {
              const Icon = KIND_ICON[k]
              const on = !props.hiddenKinds.includes(k)
              return (
                <li key={k} className={cn("flex items-center gap-2 rounded-md px-1 py-0.5 text-xs", on && "bg-muted")}>
                  <Switch size="sm" checked={on} onCheckedChange={() => toggleKind(k)} aria-label={`Show ${k}`} />
                  <Icon className="size-3.5 text-muted-foreground" />
                  <span className="flex-1">{k}</span>
                  <span className="tabular-nums text-muted-foreground">{counts.get(k)}</span>
                </li>
              )
            })}
          </ul>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <AlertBadge alert="Green" /> <AlertBadge alert="Orange" /> <AlertBadge alert="Red" />
            <span>Impact alerts from GDACS / USGS PAGER. Quake size = magnitude.</span>
          </p>
          {feed.events.length > 0 && visible.length === 0 && (
            <p className="text-xs text-muted-foreground">No active events for the selected types. Switch a type on above.</p>
          )}
          {visible.length > 0 && top.length === 0 && (
            <p className="text-xs text-muted-foreground">Nothing severe among the selected types right now.</p>
          )}
          {top.length > 0 && (
            <div className="space-y-0.5">
              <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">Most severe now</p>
              {top.map((d) => {
                const Icon = KIND_ICON[d.kind]
                return (
                  <button
                    key={d.id}
                    className="flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left text-xs hover:bg-muted"
                    title={d.title}
                    onClick={() => props.onPickDisaster(d)}
                  >
                    <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{d.title}</span>
                    {d.alert ? <AlertBadge alert={d.alert} /> : <span className="shrink-0 text-muted-foreground">{timeAgo(d.updated, feed.fetchedAt)}</span>}
                  </button>
                )
              })}
            </div>
          )}
        </>
      )}
    </section>
  )
}
