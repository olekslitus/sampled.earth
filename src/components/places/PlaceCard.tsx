"use client"

import { useId, useMemo, useRef, type ReactNode } from "react"
import { Dices, Funnel, X } from "lucide-react"

import { CountryFlag } from "@/components/CountryFlag"
import type { PlaceKey } from "@/components/globe/PlacesLayer"
import { useCardFocus, useTicker } from "@/components/hooks"
import { FLOATING_CARD_CLASS } from "@/components/panels/DisasterCard"
import { formatHour, weekdayName } from "@/components/panels/format"
import { Button } from "@/components/ui/button"
import { KOPPEN, type City, type Region } from "@/lib/places/data"
import {
  METRICS, METRIC_GROUPS, SOURCES, cityValues, compactNumber, countryValues, rankOf, regionValues,
  type Metric, type MetricSource, type PlaceData,
} from "@/lib/places/metrics"
import { SCHEME_BY_KEY, schemeColors, type Theme } from "@/lib/sim/attributes"
import { COUNTRIES, REGIONS, type Country } from "@/lib/sim/countries"
import { localTime, type Simulation } from "@/lib/sim/engine"
import { ACTIVITY_CATEGORIES } from "@/lib/sim/schedule"
import { cn } from "@/lib/utils"
import { SAMPLED, type PlacesView } from "./usePlaces"

interface PlaceCardProps {
  place: PlaceKey
  data: PlaceData
  /** the statistic on the map, highlighted in the card */
  view: PlacesView | null
  sim: Simulation
  theme: Theme
  onClose: () => void
  onPick: (key: PlaceKey) => void
  onMeet: (personId: number) => void
  onFilterCountry: (name: string) => void
}

/** Details for a country, a region within one, or a city picked on the map or in the Layers tab */
export function PlaceCard(props: PlaceCardProps) {
  const titleId = useId()
  const ref = useRef<HTMLElement>(null)
  useCardFocus(ref, `${props.place.kind}:${props.place.index}`)
  const { place, data } = props
  let body: ReactNode = null
  if (place.kind === "country") body = <CountryBody {...props} titleId={titleId} country={COUNTRIES[place.index]!} />
  else if (place.kind === "region") {
    const r = data.regions?.rows[place.index]
    if (r) body = <RegionBody {...props} titleId={titleId} region={r} />
  } else {
    const c = data.cities?.rows[place.index]
    if (c) body = <CityBody {...props} titleId={titleId} city={c} />
  }
  if (!body) return null
  return (
    <section ref={ref} role="dialog" aria-modal="false" aria-labelledby={titleId} className={cn(FLOATING_CARD_CLASS, "md:max-h-[calc(100dvh-3rem)]")}>
      {body}
    </section>
  )
}

function Header({ titleId, kicker, title, iso2, onClose }: { titleId: string; kicker: ReactNode; title: string; iso2?: string | null; onClose: () => void }) {
  return (
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{kicker}</p>
        <h2 id={titleId} className="flex items-center gap-2 text-base leading-snug font-semibold">
          {iso2 && SAMPLED.has(iso2) && <CountryFlag iso2={iso2} height={14} />}
          <span className="min-w-0">{title}</span>
        </h2>
      </div>
      <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close" data-card-close>
        <X />
      </Button>
    </div>
  )
}

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"]
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

function Rank({ rank, label }: { rank: [number, number] | null; label: string }) {
  if (!rank) return null
  return (
    <span className="text-muted-foreground">
      {ordinal(rank[0])} of {rank[1]} {label}
    </span>
  )
}

/** One statistic: value, where it comes from, and the rank */
function StatRow({ label, value, sub, highlight }: { label: string; value: string; sub?: ReactNode; highlight?: boolean }) {
  return (
    <div className={cn("grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 rounded-md px-1.5 py-1 text-xs", highlight && "bg-muted")}>
      <dt className="min-w-0 text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium tabular-nums">{value}</dd>
      {sub && <dd className="col-span-2 text-[10px] text-muted-foreground">{sub}</dd>}
    </div>
  )
}

function sourceLine(src: MetricSource, year: number) {
  return [SOURCES[src.source].short, src.note, year > 0 ? String(year) : null].filter(Boolean).join(" · ")
}

/** Values of every statistic with country data, each source separately, with world ranks */
function useCountryStats(country: Country, data: PlaceData) {
  return useMemo(() => {
    const i = COUNTRIES.indexOf(country)
    return METRICS.flatMap((m) =>
      m.sources
        .filter((s) => s.country)
        .map((s) => {
          const v = s.country!(country, data)
          if (!v) return null
          return { metric: m, source: s, value: v[0], year: v[1], rank: rankOf(countryValues(s, data), i) }
        })
        .filter((x) => x != null),
    )
  }, [country, data])
}

function ActionButtons({ children }: { children: ReactNode }) {
  return <div className="mt-3 flex flex-wrap gap-2">{children}</div>
}

// ---------------------------------------------------------------------------------------
// Country

function CountryBody({ country, data, view, sim, theme, onClose, onPick, onMeet, onFilterCountry, titleId }: PlaceCardProps & { country: Country; titleId: string }) {
  const stats = useCountryStats(country, data)
  // recounted once the sample has finished building
  const sampled = sim.globalCount >= sim.globalTarget
  const people = useMemo(() => {
    const ids: number[] = []
    for (let i = 0; i < sim.globalCount; i++) if (sim.people[i]!.country === country) ids.push(i)
    return ids
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [sim, country, sampled])
  const regions = useMemo(
    () => (data.regions?.rows ?? []).filter((r) => r.iso2 === country.iso2 && r.name).sort((a, b) => (b.pop ?? 0) - (a.pop ?? 0)),
    [data.regions, country],
  )
  const cities = useMemo(() => (data.cities?.rows ?? []).filter((c) => c.iso2 === country.iso2).slice(0, 6), [data.cities, country])
  const meet = () => {
    if (!people.length) return
    onMeet(sim.people[people[Math.floor(Math.random() * people.length)]!]!.id)
  }
  const shown = view?.metric
  const headline = ["population", "lifexp", "gdp", "hdi"]
  return (
    <>
      <Header titleId={titleId} kicker={REGIONS[country.region]} title={country.label} iso2={country.iso2} onClose={onClose} />
      <dl className="mt-3 grid grid-cols-2 gap-2">
        {headline.map((k) => {
          const s = stats.find((x) => x.metric.key === k)
          if (!s) return null
          return (
            <div key={k} className="rounded-md border border-border bg-muted/40 p-2">
              <dt className="text-[11px] text-muted-foreground">{s.metric.label}</dt>
              <dd className="text-base font-semibold tabular-nums">{s.metric.format(s.value)}</dd>
              <dd className="text-[10px]">
                <Rank rank={s.rank} label="countries" />
              </dd>
            </div>
          )
        })}
      </dl>

      <RightNow country={country} sim={sim} theme={theme} people={people} />
      <AgePyramid country={country} theme={theme} />

      <ActionButtons>
        <Button variant="outline" size="sm" onClick={meet} disabled={!people.length}>
          <Dices /> Meet someone from here
        </Button>
        <Button variant="outline" size="sm" onClick={() => onFilterCountry(country.name)}>
          <Funnel /> Filter to {country.label}
        </Button>
      </ActionButtons>

      {cities.length > 0 && (
        <PlaceList title="Largest cities" items={cities.map((c) => ({ key: { kind: "city", index: c.index }, label: c.name, value: compactNumber(c.pop) }))} onPick={onPick} />
      )}
      {regions.length > 1 && (
        <PlaceList
          title={`Regions${shown && view?.regionVals.some(Number.isFinite) ? ` by ${shown.label.toLowerCase()}` : ""}`}
          items={regions
            .map((r) => ({ r, v: view?.regionVals[r.index] }))
            .sort((a, b) => (Number.isFinite(b.v) ? b.v! : -Infinity) - (Number.isFinite(a.v) ? a.v! : -Infinity))
            .map(({ r, v }) => ({ key: { kind: "region" as const, index: r.index }, label: r.name ?? r.code, value: v != null && Number.isFinite(v) ? shown!.format(v) : r.pop != null ? compactNumber(r.pop * 1000) : "" }))}
          onPick={onPick}
          max={12}
        />
      )}

      <AllStats stats={stats} highlight={shown?.key} rankLabel="countries" />
      <p className="mt-3 text-[11px] text-muted-foreground">
        The sample has {people.length.toLocaleString("en-US")} people from {country.label}; each stands for about{" "}
        {compactNumber((country.population * 1e6) / Math.max(1, people.length))} real people.
      </p>
    </>
  )
}

function PlaceList({ title, items, onPick, max = 6 }: { title: string; items: { key: PlaceKey; label: string; value: string }[]; onPick: (k: PlaceKey) => void; max?: number }) {
  return (
    <div className="mt-3 space-y-0.5">
      <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">{title}</p>
      <ul>
        {items.slice(0, max).map((it) => (
          <li key={`${it.key.kind}:${it.key.index}`}>
            <button className="flex w-full items-center gap-2 rounded-md px-1.5 py-0.5 text-left text-xs hover:bg-muted" onClick={() => onPick(it.key)}>
              <span className="min-w-0 flex-1 truncate">{it.label}</span>
              <span className="shrink-0 text-muted-foreground tabular-nums">{it.value}</span>
            </button>
          </li>
        ))}
      </ul>
      {items.length > max && <p className="px-1.5 text-[10px] text-muted-foreground">and {items.length - max} more</p>}
    </div>
  )
}

function AllStats({ stats, highlight, rankLabel }: { stats: { metric: Metric; source: MetricSource; value: number; year: number; rank: [number, number] | null }[]; highlight?: string; rankLabel: string }) {
  return (
    <details className="mt-3 group" open={false}>
      <summary className="cursor-pointer text-[11px] font-medium tracking-wider text-muted-foreground uppercase hover:text-foreground">All statistics</summary>
      {METRIC_GROUPS.map((g) => {
        const rows = stats.filter((s) => s.metric.group === g)
        if (!rows.length) return null
        return (
          <div key={g} className="mt-2">
            <p className="px-1.5 text-[11px] font-medium text-foreground">{g}</p>
            <dl>
              {rows.map((s) => (
                <StatRow
                  key={`${s.metric.key}:${s.source.source}`}
                  label={s.metric.label}
                  value={s.metric.format(s.value)}
                  highlight={s.metric.key === highlight}
                  sub={
                    <>
                      {sourceLine(s.source, s.year)}
                      {s.rank && <> · {ordinal(s.rank[0])} of {s.rank[1]} {rankLabel}</>}
                    </>
                  }
                />
              ))}
            </dl>
          </div>
        )
      })}
    </details>
  )
}

/** What the country's sampled people are doing now, and the local time */
function RightNow({ country, sim, theme, people }: { country: Country; sim: Simulation; theme: Theme; people: number[] }) {
  useTicker(1000)
  const colors = schemeColors(SCHEME_BY_KEY.get("activity")!, theme)
  const counts = new Array(ACTIVITY_CATEGORIES.length).fill(0)
  for (const i of people) counts[sim.activity[i]!]++
  const total = Math.max(1, people.length)
  const lt = localTime(sim.time, country.cities[0]!.lon)
  const order = counts.map((n, k) => [n, k] as const).filter(([n]) => n > 0).sort((a, b) => b[0] - a[0])
  return (
    <div className="mt-3 space-y-1">
      <p className="text-[11px] text-muted-foreground">
        Right now: {weekdayName(lt.weekday)} {formatHour(lt.hour)} in {country.cities[0]!.name} (solar time)
      </p>
      <div className="flex h-2 gap-[2px] overflow-hidden rounded-full" aria-hidden>
        {order.map(([n, k]) => (
          <span key={k} style={{ width: `${(100 * n) / total}%`, background: colors[k] }} />
        ))}
      </div>
      <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
        {order.slice(0, 4).map(([n, k]) => (
          <span key={k} className="flex items-center gap-1">
            <span className="size-2 rounded-full" style={{ background: colors[k] }} aria-hidden />
            {ACTIVITY_CATEGORIES[k]} <span className="text-muted-foreground tabular-nums">{Math.round((100 * n) / total)}%</span>
          </span>
        ))}
      </p>
    </div>
  )
}

/** Population by sex and 5-year age band (UN WPP via the World Bank) */
function AgePyramid({ country, theme }: { country: Country; theme: Theme }) {
  const { male, female } = country.ageBands
  // the same colours the globe uses for men and women
  const gender = SCHEME_BY_KEY.get("gender")!
  const [menColor, womenColor] = [gender.categories.indexOf("Male"), gender.categories.indexOf("Female")].map((k) => schemeColors(gender, theme)[k])
  if (!male.length || !female.length) return null
  const f = country.femaleShare / 100
  const m = male.map((v) => v * (1 - f))
  const w = female.map((v) => v * f)
  const max = Math.max(...m, ...w)
  const H = 6
  const rows = m.length
  return (
    <figure className="mt-3">
      <figcaption className="mb-1 flex justify-between text-[11px] text-muted-foreground">
        <span>Men</span>
        <span>Ages 0 to 80+</span>
        <span>Women</span>
      </figcaption>
      <svg viewBox={`0 0 200 ${rows * H}`} className="w-full" role="img" aria-label={`Age pyramid of ${country.label}`}>
        {m.map((v, i) => {
          const y = (rows - 1 - i) * H
          return (
            <g key={i}>
              <rect x={99 - (v / max) * 96} y={y + 0.5} width={(v / max) * 96} height={H - 1} rx={1} fill={menColor} />
              <rect x={101} y={y + 0.5} width={(w[i]! / max) * 96} height={H - 1} rx={1} fill={womenColor} />
            </g>
          )
        })}
      </svg>
    </figure>
  )
}

// ---------------------------------------------------------------------------------------
// Region

const REGION_FIELDS: { key: "pop" | "shdi" | "lifexp" | "msch" | "esch" | "gnic"; metric: string; scale?: number }[] = [
  { key: "pop", metric: "population", scale: 1000 },
  { key: "shdi", metric: "hdi" },
  { key: "lifexp", metric: "lifexp" },
  { key: "msch", metric: "msch" },
  { key: "esch", metric: "esch" },
  { key: "gnic", metric: "gni" },
]

function RegionBody({ region, data, view, onClose, onPick, titleId }: PlaceCardProps & { region: Region; titleId: string }) {
  const rows = data.regions!.rows
  const countryIndex = COUNTRIES.findIndex((c) => c.iso2 === region.iso2)
  const sameCountry = useMemo(() => rows.filter((r) => r.iso2 === region.iso2), [rows, region.iso2])
  const stats = REGION_FIELDS.map((f) => {
    const metric = METRICS.find((m) => m.key === f.metric)!
    const src = metric.sources.find((s) => s.region)!
    const v = region[f.key]
    if (v == null) return null
    const world = rankOf(regionValues(src, data.regions), region.index)
    const local = new Float64Array(sameCountry.map((r) => r[f.key] ?? NaN))
    const inCountry = rankOf(local, sameCountry.indexOf(region))
    return { metric, value: v * (f.scale ?? 1), world, inCountry }
  }).filter((x) => x != null)
  return (
    <>
      <Header
        titleId={titleId}
        kicker={<>Region of {countryIndex >= 0 ? <button className="underline underline-offset-2 hover:text-foreground" onClick={() => onPick({ kind: "country", index: countryIndex })}>{region.country}</button> : region.country}</>}
        title={region.name ?? region.code}
        iso2={region.iso2}
        onClose={onClose}
      />
      <dl className="mt-3">
        {stats.map((s) => (
          <StatRow
            key={s.metric.key}
            label={s.metric.label}
            value={s.metric.format(s.value)}
            highlight={view?.metric.key === s.metric.key}
            sub={
              <>
                {s.inCountry && s.inCountry[1] > 1 && <>{ordinal(s.inCountry[0])} of {s.inCountry[1]} in {region.country} · </>}
                {s.world && <>{ordinal(s.world[0])} of {s.world[1]} regions worldwide</>}
              </>
            }
          />
        ))}
      </dl>
      <p className="mt-3 text-[11px] text-muted-foreground">
        {data.regions!.source}
        {region.year ? `, ${region.year}` : ""}. Free for non-commercial use;{" "}
        <a className="underline underline-offset-2 hover:text-foreground" href={SOURCES.gdl.href} target="_blank" rel="noreferrer">
          globaldatalab.org
        </a>
        .
      </p>
    </>
  )
}

// ---------------------------------------------------------------------------------------
// City

function CityBody({ city, data, view, sim, onClose, onPick, onMeet, titleId }: PlaceCardProps & { city: City; titleId: string }) {
  const countryIndex = city.iso2 ? COUNTRIES.findIndex((c) => c.iso2 === city.iso2) : -1
  const countryLabel = countryIndex >= 0 ? COUNTRIES[countryIndex]!.label : (city.country ?? "")
  const rows = data.cities!.rows
  const inCountry = useMemo(() => {
    if (!city.iso2) return null
    const same = rows.filter((c) => c.iso2 === city.iso2)
    return [same.indexOf(city) + 1, same.length] as [number, number]
  }, [rows, city])
  const stats = useMemo(
    () =>
      METRICS.flatMap((m) => {
        const s = m.sources.find((x) => x.city)
        const v = s?.city!(city)
        if (!s || !v) return []
        return [{ metric: m, source: s, value: v[0], year: v[1], rank: rankOf(cityValues(s, data.cities), city.index) }]
      }),
    [city, data.cities],
  )
  /** the nearest sampled person within ~60 km */
  const nearest = () => {
    let best = -1
    let bestD = 0.55 ** 2
    const cos = Math.cos((city.lat * Math.PI) / 180)
    for (let i = 0; i < sim.globalCount; i++) {
      const [lat, lon] = sim.people[i]!.home
      const d = (lat - city.lat) ** 2 + ((lon - city.lon) * cos) ** 2
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    return best
  }
  const climate = city.climate != null ? KOPPEN[city.climate] : null
  return (
    <>
      <Header
        titleId={titleId}
        kicker={
          <>
            {city.capital ? "Capital city" : "City"} in{" "}
            {countryIndex >= 0 ? (
              <button className="underline underline-offset-2 hover:text-foreground" onClick={() => onPick({ kind: "country", index: countryIndex })}>
                {countryLabel}
              </button>
            ) : (
              countryLabel
            )}
          </>
        }
        title={city.name}
        iso2={city.iso2}
        onClose={onClose}
      />
      <dl className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-md border border-border bg-muted/40 p-2">
          <dt className="text-[11px] text-muted-foreground">People (2025)</dt>
          <dd className="text-base font-semibold tabular-nums">{compactNumber(city.pop)}</dd>
          <dd className="text-[10px] text-muted-foreground">
            {ordinal(city.index + 1)} of {rows.length.toLocaleString("en-US")} cities
            {inCountry && inCountry[1] > 1 && <>, {ordinal(inCountry[0])} in {countryLabel}</>}
          </dd>
        </div>
        <div className="rounded-md border border-border bg-muted/40 p-2">
          <dt className="text-[11px] text-muted-foreground">Built-up area</dt>
          <dd className="text-base font-semibold tabular-nums">{city.area != null ? `${compactNumber(city.area)} km²` : "–"}</dd>
          <dd className="text-[10px] text-muted-foreground">{city.area ? `${compactNumber(city.pop / city.area)} people per km²` : ""}</dd>
        </div>
      </dl>
      {climate && (
        <p className="mt-2 text-xs">
          Climate: {climate[1]} <span className="text-muted-foreground">({climate[0]}, Köppen–Geiger)</span>
        </p>
      )}
      <dl className="mt-2">
        {stats
          .filter((s) => s.metric.key !== "population")
          .map((s) => (
            <StatRow
              key={s.metric.key}
              label={s.metric.label}
              value={s.metric.format(s.value)}
              highlight={view?.metric.key === s.metric.key}
              sub={
                <>
                  {sourceLine(s.source, s.year)}
                  {s.rank && <> · {ordinal(s.rank[0])} of {s.rank[1].toLocaleString("en-US")} cities</>}
                </>
              }
            />
          ))}
      </dl>
      <ActionButtons>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const i = nearest()
            if (i >= 0) onMeet(sim.people[i]!.id)
          }}
        >
          <Dices /> Meet someone who lives here
        </Button>
      </ActionButtons>
      <p className="mt-3 text-[11px] text-muted-foreground">
        The urban centre as mapped from satellite data (GHSL Degree of Urbanisation), which can join neighbouring cities into one.{" "}
        <a className="underline underline-offset-2 hover:text-foreground" href={SOURCES.ghsl.href} target="_blank" rel="noreferrer">
          GHSL UCDB R2024A
        </a>
        , © European Union, CC BY 4.0.
      </p>
    </>
  )
}
