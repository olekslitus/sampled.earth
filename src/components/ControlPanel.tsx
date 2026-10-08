"use client"

import { useId, useMemo, type ReactNode } from "react"
import Link from "next/link"
import { BookOpenText, ChevronDown, Dices, Loader2, Moon, Pause, RefreshCw, RotateCcw, SlidersHorizontal, Sun, UserRoundSearch } from "lucide-react"

import { useTicker } from "@/components/hooks"
import { Legend } from "@/components/panels/Legend"
import { formatPeople } from "@/components/panels/format"
import { SamplingProgress, SimClock } from "@/components/StatusBar"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { COLOR_SCHEMES, type ColorScheme, type Theme } from "@/lib/sim/attributes"
import type { Simulation } from "@/lib/sim/engine"
import type { CompiledFilter } from "@/lib/sim/filter"
import { WORLD_POPULATION_M } from "@/lib/sim/population"
import { cn } from "@/lib/utils"

export const SPEEDS = [
  { value: "0", label: "Pause", speed: 0 },
  { value: "1", label: "Real time", speed: 1 },
  { value: "60", label: "1 min/s", speed: 60 },
  { value: "600", label: "10 min/s", speed: 600 },
  { value: "3600", label: "1 h/s", speed: 3600 },
]

const SIZES = [10_000, 25_000, 50_000, 100_000, 200_000]
const DETAIL_SIZES = [
  { value: "0", label: "Off" },
  { value: "5000", label: "5,000 in view" },
  { value: "15000", label: "15,000 in view" },
  { value: "30000", label: "30,000 in view" },
]
const schemeItems = COLOR_SCHEMES.map((s) => ({ value: s.key, label: s.label }))
const sizeItems = SIZES.map((s) => ({ value: String(s), label: `${s.toLocaleString("en-US")} people` }))

export type ControlTab = "view" | "filter" | "layers" | "settings"

// ---------------------------------------------------------------------------------------
// Shell: header, clock, speed and tabs. Side panel from md up, bottom sheet below.

interface ControlPanelProps {
  sim: Simulation
  theme: Theme
  onToggleTheme: () => void
  /** only matters below md, where the panel is a collapsible bottom sheet */
  open: boolean
  onOpenChange: (open: boolean) => void
  tab: ControlTab
  onTabChange: (tab: ControlTab) => void
  speed: string
  onSpeedChange: (speed: string) => void
  filterActive: boolean
  layersActive: number
  view: ReactNode
  filter: ReactNode
  layers: ReactNode
  settings: ReactNode
}

export function ControlPanel(props: ControlPanelProps) {
  const { sim, theme, open, onOpenChange, tab } = props
  const panelId = useId()
  return (
    <>
      <aside
        id={panelId}
        aria-label="Controls"
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 z-30 flex max-h-[60dvh] flex-col p-2 sm:right-auto sm:w-[26rem]",
          "md:inset-x-auto md:inset-y-0 md:left-0 md:max-h-none md:w-[23rem] md:p-4",
          !open && "max-md:hidden",
        )}
      >
        <div className="pointer-events-auto flex max-h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card/90 shadow-2xl backdrop-blur-md">
          <div className="flex items-start gap-2 p-4 pb-2">
            <div className="min-w-0 flex-1">
              <h1 className="text-base font-semibold tracking-tight">Sampled Earth</h1>
              <p className="text-xs text-muted-foreground max-md:hidden">
                {sim.globalTarget.toLocaleString("en-US")} synthetic people, each standing in for ~
                {formatPeople(WORLD_POPULATION_M / sim.globalTarget)} real ones
              </p>
              <Link
                href="/methodology"
                className="mt-1 inline-flex items-center gap-1 rounded-sm text-xs font-medium text-foreground/80 underline-offset-2 hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <BookOpenText className="size-3.5" aria-hidden /> Methodology & sources
              </Link>
              <SamplingProgress sim={sim}>
                {(pct) => (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
                    <Loader2 className="size-3 animate-spin" aria-hidden /> Sampling humanity… {pct}%
                  </p>
                )}
              </SamplingProgress>
            </div>
            <Button variant="ghost" size="icon-sm" onClick={props.onToggleTheme} aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}>
              {theme === "dark" ? <Sun /> : <Moon />}
            </Button>
            <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={() => onOpenChange(false)} aria-label="Hide controls" aria-expanded aria-controls={panelId}>
              <ChevronDown />
            </Button>
          </div>

          <div className="space-y-2 px-4 pb-3">
            <div className="flex items-end justify-between gap-2">
              <SimClock sim={sim} />
              <Button variant="ghost" size="xs" onClick={() => sim.jumpTo(Date.now())}>
                <RotateCcw /> Now
              </Button>
            </div>
            <ToggleGroup
              variant="outline"
              size="sm"
              spacing={0}
              className="w-full"
              aria-label="Simulation speed"
              value={[props.speed]}
              onValueChange={(v) => v[0] && props.onSpeedChange(v[0] as string)}
            >
              {SPEEDS.map((s) => (
                <ToggleGroupItem key={s.value} value={s.value} className="flex-1 px-1 text-[11px]" aria-label={s.label}>
                  {s.speed === 0 ? <Pause /> : s.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          <Tabs value={tab} onValueChange={(v) => props.onTabChange(v as ControlTab)} className="flex min-h-0 flex-1 flex-col gap-0">
            <div className="px-4">
              <TabsList className="w-full">
                <TabsTrigger value="view" className="text-xs">
                  View
                </TabsTrigger>
                <TabsTrigger value="filter" className="text-xs">
                  Filter
                  {props.filterActive && (
                    <>
                      <span className="size-1.5 rounded-full bg-primary" aria-hidden />
                      <span className="sr-only">(active)</span>
                    </>
                  )}
                </TabsTrigger>
                <TabsTrigger value="layers" className="text-xs">
                  Layers
                  {props.layersActive > 0 && (
                    <>
                      <span className="text-[10px] text-muted-foreground" aria-hidden>
                        {props.layersActive}
                      </span>
                      <span className="sr-only">({props.layersActive} on)</span>
                    </>
                  )}
                </TabsTrigger>
                <TabsTrigger value="settings" className="text-xs">
                  Settings
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-4">
              <TabsContent value="view" className="space-y-3">
                {props.view}
              </TabsContent>
              <TabsContent value="filter">{props.filter}</TabsContent>
              <TabsContent value="layers">{props.layers}</TabsContent>
              <TabsContent value="settings" className="space-y-3">
                {props.settings}
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </aside>

      {/* Collapsed bottom bar on phones */}
      {!open && (
        <div className="absolute inset-x-2 bottom-2 z-30 flex h-12 items-center gap-2 rounded-xl border border-border bg-card/90 pr-1.5 pl-3 shadow-xl backdrop-blur-md md:hidden">
          <SimClock sim={sim} className="flex-1" />
          <Button variant="secondary" size="sm" onClick={() => onOpenChange(true)} aria-expanded={false} aria-controls={panelId}>
            <SlidersHorizontal /> Controls
          </Button>
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------------------
// View tab: colour scheme, live legend and ways in

/** Legend counts are a full pass over everyone, so they refresh twice a second at most */
function countLegend(sim: Simulation, scheme: ColorScheme, filter: CompiledFilter | null, tick: number) {
  void tick // only here to key the memo in LiveLegend
  const inViewOnly = sim.region !== null
  const counts = new Array<number>(scheme.categories.length).fill(0)
  let shown = 0
  sim.forEachShown(inViewOnly, (p, i) => {
    if (filter && !filter.test(p, i, sim)) return
    counts[scheme.value(p, i, sim)]++
    shown++
  })
  const title = `${inViewOnly ? "In view" : "Whole world"}${filter ? " · matching" : ""} · ${shown.toLocaleString("en-US")} people`
  return { counts, title }
}

function LiveLegend({
  sim, theme, scheme, filter, hidden, onToggle, onReset,
}: {
  sim: Simulation
  theme: Theme
  scheme: ColorScheme
  filter: CompiledFilter | null
  hidden: ReadonlySet<number>
  onToggle: (i: number) => void
  onReset: () => void
}) {
  const tick = useTicker(500)
  const { counts, title } = useMemo(() => countLegend(sim, scheme, filter, tick), [sim, scheme, filter, tick])
  return <Legend theme={theme} title={title} scheme={scheme} counts={counts} hidden={hidden} onToggle={onToggle} onReset={onReset} />
}

interface ViewTabProps {
  sim: Simulation
  theme: Theme
  schemeKey: string
  scheme: ColorScheme
  onSchemeChange: (key: string) => void
  filter: CompiledFilter | null
  hidden: ReadonlySet<number>
  onToggleHidden: (i: number) => void
  onResetHidden: () => void
  onMeetRandom: () => void
  onFindMe: () => void
}

export function ViewTab(props: ViewTabProps) {
  return (
    <>
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Color people by</Label>
        <Select items={schemeItems} value={props.schemeKey} onValueChange={(v) => v && props.onSchemeChange(v as string)}>
          <SelectTrigger className="w-full" aria-label="Color people by">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {schemeItems.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <LiveLegend
        sim={props.sim}
        theme={props.theme}
        scheme={props.scheme}
        filter={props.filter}
        hidden={props.hidden}
        onToggle={props.onToggleHidden}
        onReset={props.onResetHidden}
      />
      <div className="flex flex-wrap gap-2 [&>*]:min-w-[10.5rem] [&>*]:flex-1">
        <Button variant="secondary" size="sm" onClick={props.onMeetRandom}>
          <Dices /> Meet a random person
        </Button>
        <Button variant="outline" size="sm" onClick={props.onFindMe}>
          <UserRoundSearch /> Find people like me
        </Button>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------------------
// Settings tab

interface SettingsTabProps {
  exaggeration: number
  onExaggeration: (x: number) => void
  showNight: boolean
  onShowNight: (v: boolean) => void
  autoRotate: boolean
  onAutoRotate: (v: boolean) => void
  theme: Theme
  onToggleTheme: () => void
  size: number
  onSize: (n: number) => void
  detail: string
  onDetail: (d: string) => void
  onNewSample: () => void
}

export function SettingsTab(props: SettingsTabProps) {
  return (
    <>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label id="exaggeration-label" className="text-xs text-muted-foreground">
            Movement exaggeration
          </Label>
          <span className="text-xs tabular-nums text-muted-foreground">{props.exaggeration}×</span>
        </div>
        <Slider
          min={1}
          max={25}
          step={1}
          aria-labelledby="exaggeration-label"
          value={[props.exaggeration]}
          onValueChange={(v) => props.onExaggeration(Array.isArray(v) ? v[0] : v)}
        />
        <p className="text-[11px] text-muted-foreground">Fades to real distances as you zoom in.</p>
      </div>
      <div className="flex items-center justify-between">
        <Label htmlFor="night" className="text-xs font-normal">
          Day / night shading
        </Label>
        <Switch id="night" size="sm" checked={props.showNight} onCheckedChange={props.onShowNight} />
      </div>
      <div className="flex items-center justify-between">
        <Label htmlFor="rotate" className="text-xs font-normal">
          Auto-rotate
        </Label>
        <Switch id="rotate" size="sm" checked={props.autoRotate} onCheckedChange={props.onAutoRotate} />
      </div>
      <div className="flex items-center justify-between">
        <Label htmlFor="theme" className="text-xs font-normal">
          Dark theme
        </Label>
        <Switch id="theme" size="sm" checked={props.theme === "dark"} onCheckedChange={props.onToggleTheme} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs font-normal">Sample size</Label>
        <Select items={sizeItems} value={String(props.size)} onValueChange={(v) => v && props.onSize(Number(v))}>
          <SelectTrigger size="sm" className="w-36" aria-label="Sample size">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sizeItems.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs font-normal">Zoom detail</Label>
        <Select items={DETAIL_SIZES} value={props.detail} onValueChange={(v) => v && props.onDetail(v as string)}>
          <SelectTrigger size="sm" className="w-36" aria-label="Zoom detail">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DETAIL_SIZES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">
        Zoom in and extra people are sampled for the area on screen, then released when you leave.
      </p>
      <Button variant="outline" size="sm" className="w-full" onClick={props.onNewSample}>
        <RefreshCw /> New sample of humanity
      </Button>
    </>
  )
}
