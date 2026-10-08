"use client"

import { useMemo, useState } from "react"
import { ChartColumnBig } from "lucide-react"

import { CountryFlag } from "@/components/CountryFlag"
import type { PlaceKey } from "@/components/globe/PlacesLayer"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { METRICS, METRIC_GROUPS, SOURCES, areaSources, type PlaceData, type SourceKey } from "@/lib/places/metrics"
import { COUNTRIES } from "@/lib/sim/countries"
import { cn } from "@/lib/utils"
import { placeName, SAMPLED, type PlacesSettings, type PlacesView } from "./usePlaces"

const metricItems = METRICS.map((m) => ({ value: m.key, label: m.label }))

interface PlacesPanelProps {
  settings: PlacesSettings
  onSettings: (s: PlacesSettings) => void
  view: PlacesView | null
  data: PlaceData
  /** the Filter tab has constraints (for "Matching your filter") */
  filterActive: boolean
  onPick: (key: PlaceKey) => void
}

export function PlacesPanel({ settings, onSettings, view, data, filterActive, onPick }: PlacesPanelProps) {
  const set = (patch: Partial<PlacesSettings>) => onSettings({ ...settings, ...patch })
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor="places" className="flex items-center gap-2 text-sm font-medium">
          <ChartColumnBig className="size-4" /> Countries, regions & cities
        </Label>
        <Switch id="places" size="sm" checked={settings.on} onCheckedChange={(on) => set({ on })} />
      </div>
      <p className="text-[11px] text-muted-foreground">
        Colour the map by a real statistic. Regions within countries take over as you zoom in, and city circles grow with population.
        Click any place for its card.
      </p>
      {settings.on && view && (
        <div className="space-y-3">
          <Select items={metricItems} value={settings.metric} onValueChange={(v) => v && set({ metric: v as string })}>
            <SelectTrigger className="w-full" aria-label="Statistic">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {METRIC_GROUPS.map((g) => (
                <SelectGroup key={g}>
                  <SelectLabel>{g}</SelectLabel>
                  {METRICS.filter((m) => m.group === g).map((m) => (
                    <SelectItem key={m.key} value={m.key}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">{view.metric.description}</p>
          {view.metric.key === "filter" && !filterActive && (
            <p className="text-[11px] text-foreground">Set some traits in the Filter tab first; the map then shows where those people live.</p>
          )}

          <SourcePicker view={view} settings={settings} onSource={(s) => set({ sources: { ...settings.sources, [view.metric.key]: s } })} data={data} />

          {view.areaSource && (
            <div className="space-y-1">
              <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">Show</p>
              <ToggleGroup
                variant="outline"
                size="sm"
                spacing={0}
                className="w-full"
                aria-label="Areas to colour"
                value={[settings.level]}
                onValueChange={(v) => v[0] && set({ level: v[0] as PlacesSettings["level"] })}
              >
                <ToggleGroupItem value="auto" className="flex-1 text-xs">
                  By zoom
                </ToggleGroupItem>
                <ToggleGroupItem value="country" className="flex-1 text-xs">
                  Countries
                </ToggleGroupItem>
                <ToggleGroupItem value="region" className="flex-1 text-xs" disabled={!view.areaSource.region || !data.regions}>
                  Regions
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          )}
          <div className="flex items-center justify-between">
            <Label htmlFor="city-circles" className="text-xs font-normal">
              City circles {view.citySource ? `coloured by ${SOURCES[view.citySource.source].short}` : "(sized by population)"}
            </Label>
            <Switch id="city-circles" size="sm" checked={settings.cities} onCheckedChange={(cities) => set({ cities })} />
          </div>

          <MapLegend view={view} regions={settings.level === "region"} />
          <Ranking view={view} data={data} settings={settings} onPick={onPick} />
        </div>
      )}
      {settings.on && !data.countries && <p className="text-xs text-muted-foreground">Loading statistics…</p>}
    </section>
  )
}

function SourcePicker({ view, settings, onSource, data }: { view: PlacesView; settings: PlacesSettings; onSource: (s: SourceKey) => void; data: PlaceData }) {
  const sources = areaSources(view.metric)
  const levels = (s: (typeof sources)[number]) => [s.country && "countries", s.region && "regions"].filter(Boolean).join(" and ")
  return (
    <div className="space-y-1">
      {sources.length > 1 ? (
        <>
          <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">Source</p>
          <ToggleGroup
            variant="outline"
            size="sm"
            spacing={0}
            className="w-full"
            aria-label="Data source"
            value={[view.areaSource?.source ?? ""]}
            onValueChange={(v) => v[0] && onSource(v[0] as SourceKey)}
          >
            {sources.map((s) => (
              <ToggleGroupItem
                key={s.source}
                value={s.source}
                className="flex-1 text-xs"
                disabled={s.source === "gdl" && !data.countries?.gdlSource}
                title={`${SOURCES[s.source].name}: ${levels(s)}`}
              >
                {SOURCES[s.source].short}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </>
      ) : null}
      <p className="text-[11px] text-muted-foreground">
        {view.areaSource && (
          <>
            {sources.length > 1 ? "Colouring " : "Areas: "}
            {levels(view.areaSource)} from{" "}
            <a className="underline underline-offset-2 hover:text-foreground" href={SOURCES[view.areaSource.source].href} target="_blank" rel="noreferrer">
              {SOURCES[view.areaSource.source].short}
            </a>
            {view.areaSource.note && <> ({view.areaSource.note})</>}.{" "}
          </>
        )}
        {view.citySource && (
          <>
            Cities from{" "}
            <a className="underline underline-offset-2 hover:text-foreground" href={SOURCES.ghsl.href} target="_blank" rel="noreferrer">
              GHSL
            </a>
            {view.citySource.note && <> ({view.citySource.note})</>}.
          </>
        )}
        {!view.areaSource && !view.citySource && "No source covers this yet."}
        {view.areaSource?.source === "gdl" && settings.level !== "country" && !data.regions && " Regions aren’t built yet."}
      </p>
    </div>
  )
}

/** Colour classes with their ranges, for the level the map is most likely showing */
function MapLegend({ view, regions }: { view: PlacesView; regions: boolean }) {
  const useRegions = view.breaks.region.length > 0 && (regions || !view.breaks.country.length)
  const breaks = !view.areaSource ? view.breaks.city : useRegions ? view.breaks.region : view.breaks.country
  const vals = !view.areaSource ? view.cityVals : useRegions ? view.regionVals : view.countryVals
  const finite = Array.from(vals).filter(Number.isFinite)
  if (!finite.length) return <p className="text-xs text-muted-foreground">No values for this statistic yet.</p>
  const min = Math.min(...finite)
  const max = Math.max(...finite)
  const edges = [min, ...breaks, max]
  return (
    <div className="space-y-1">
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(0,1fr))] gap-[2px]" style={{ gridTemplateColumns: `repeat(${edges.length - 1}, minmax(0, 1fr))` }} aria-label="Legend">
        {edges.slice(0, -1).map((lo, k) => (
          <li key={k} className="min-w-0">
            <span className="block h-2.5 rounded-[3px]" style={{ background: view.ramp[Math.min(k, view.ramp.length - 1)] }} />
            <span className="mt-0.5 block truncate text-[10px] text-muted-foreground tabular-nums">{view.metric.format(lo)}</span>
          </li>
        ))}
      </ul>
      <p className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-4 rounded-[3px] border border-border bg-[repeating-linear-gradient(135deg,currentColor_0_1px,transparent_1px_5px)] opacity-60" aria-hidden />
          No data
        </span>
        <span className="tabular-nums">up to {view.metric.format(max)}</span>
      </p>
      <p className="text-[10px] text-muted-foreground">Each colour holds about the same number of places, so the colours rank places rather than measure gaps.</p>
    </div>
  )
}

/** Highest and lowest places at the chosen level */
function Ranking({ view, data, settings, onPick }: { view: PlacesView; data: PlaceData; settings: PlacesSettings; onPick: (key: PlaceKey) => void }) {
  const [order, setOrder] = useState<"top" | "bottom">("top")
  const options = useMemo(() => {
    const out: { kind: PlaceKey["kind"]; label: string; vals: Float64Array }[] = []
    if (view.areaSource?.country && view.countryVals.some(Number.isFinite)) out.push({ kind: "country", label: "Countries", vals: view.countryVals })
    if (view.areaSource?.region && view.regionVals.some(Number.isFinite)) out.push({ kind: "region", label: "Regions", vals: view.regionVals })
    if (view.citySource && view.cityVals.some(Number.isFinite)) out.push({ kind: "city", label: "Cities", vals: view.cityVals })
    return out
  }, [view])
  const preferred = settings.level === "region" ? "region" : "country"
  const [kindChoice, setKind] = useState<PlaceKey["kind"] | null>(null)
  const current = options.find((o) => o.kind === kindChoice) ?? options.find((o) => o.kind === preferred) ?? options[0]
  const rows = useMemo(() => {
    if (!current) return []
    const idx: number[] = []
    current.vals.forEach((v, i) => {
      // cities: only those big enough to have a circle when zoomed out a little
      if (Number.isFinite(v) && (current.kind !== "city" || (data.cities?.rows[i]?.pop ?? 0) >= 1e6)) idx.push(i)
    })
    idx.sort((a, b) => (order === "top" ? current.vals[b]! - current.vals[a]! : current.vals[a]! - current.vals[b]!))
    return idx.slice(0, 8)
  }, [current, order, data.cities])
  if (!current) return null
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <ToggleGroup variant="outline" size="sm" spacing={0} aria-label="Highest or lowest" value={[order]} onValueChange={(v) => v[0] && setOrder(v[0] as "top" | "bottom")}>
          <ToggleGroupItem value="top" className="px-2 text-[11px]">
            Highest
          </ToggleGroupItem>
          <ToggleGroupItem value="bottom" className="px-2 text-[11px]">
            Lowest
          </ToggleGroupItem>
        </ToggleGroup>
        {options.length > 1 && (
          <ToggleGroup variant="outline" size="sm" spacing={0} className="ml-auto" aria-label="Places to rank" value={[current.kind]} onValueChange={(v) => v[0] && setKind(v[0] as PlaceKey["kind"])}>
            {options.map((o) => (
              <ToggleGroupItem key={o.kind} value={o.kind} className="px-2 text-[11px]">
                {o.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
      </div>
      <ol className="space-y-0.5">
        {rows.map((i, n) => {
          const key: PlaceKey = { kind: current.kind, index: i }
          const iso2 = current.kind === "country" ? COUNTRIES[i]!.iso2 : current.kind === "region" ? data.regions?.rows[i]?.iso2 : data.cities?.rows[i]?.iso2
          return (
            <li key={i}>
              <button className={cn("flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left text-xs hover:bg-muted")} onClick={() => onPick(key)}>
                <span className="w-4 shrink-0 text-right text-muted-foreground tabular-nums">{n + 1}</span>
                {iso2 && SAMPLED.has(iso2) ? <CountryFlag iso2={iso2} /> : <span className="w-[18px]" />}
                <span className="min-w-0 flex-1 truncate">{placeName(key, data)}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">{view.metric.format(current.vals[i]!)}</span>
              </button>
            </li>
          )
        })}
      </ol>
      {current.kind === "city" && <p className="text-[10px] text-muted-foreground">Cities of a million people or more.</p>}
    </div>
  )
}
