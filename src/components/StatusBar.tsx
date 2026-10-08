"use client"

import type { ReactNode, RefObject } from "react"
import { Hand } from "lucide-react"

import { emptyVitalStats, type VitalStats } from "@/components/globe/VitalLayer"
import { usePolled, useTicker } from "@/components/hooks"
import { formatPeople, formatUtc } from "@/components/panels/format"
import type { Simulation } from "@/lib/sim/engine"
import { formatDistance } from "@/lib/space/units"
import { cn } from "@/lib/utils"

function formatAltitude(alt: number) {
  if (alt > 150) return formatDistance(alt)
  const km = alt * 6371
  return km >= 1000 ? `${(km / 1000).toFixed(1)}k km` : `${Math.round(km)} km`
}

/** The simulated clock. Ticks on its own so nothing else re-renders with it. */
export function SimClock({ sim, className }: { sim: Simulation; className?: string }) {
  useTicker(250)
  return (
    <span className={cn("flex min-w-0 flex-col leading-tight", className)}>
      <span className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">Simulated time</span>
      <span className="truncate font-mono text-sm tabular-nums">{formatUtc(sim.time)} UTC</span>
    </span>
  )
}

/** "Sampling humanity… 42%" while the world sample is still being generated */
export function SamplingProgress({ sim, children }: { sim: Simulation; children: (pct: number) => ReactNode }) {
  const done = sim.progress >= 1
  useTicker(done ? null : 250)
  return done ? null : children(Math.floor(sim.progress * 100))
}

interface StatusBarProps {
  sim: Simulation
  altitudeRef: RefObject<number>
  showVital: boolean
  vitalRef: RefObject<VitalStats>
  /** something is selected, so the gesture hint is no longer needed */
  hasSelection: boolean
}

/** Bottom-centre strip with altitude, what a dot stands for and live birth/death counts (large screens) */
export function StatusBar({ sim, altitudeRef, showVital, vitalRef, hasSelection }: StatusBarProps) {
  useTicker(500)
  const alt = usePolled(() => altitudeRef.current, 250, 2.2)
  const dotStandsFor = sim.region ? sim.detailRepresents : (sim.people[0]?.represents ?? 0)
  return (
    <div className="pointer-events-none absolute bottom-4 left-1/2 z-30 hidden -translate-x-1/2 items-center gap-3 rounded-full border border-border bg-background/70 px-3 py-1.5 text-xs whitespace-nowrap text-muted-foreground backdrop-blur lg:flex">
      <span className="tabular-nums">Altitude {formatAltitude(alt)}</span>
      <span className="h-3 w-px bg-border" aria-hidden />
      <span className="tabular-nums">Each dot ≈ {formatPeople(dotStandsFor)} people</span>
      {showVital && <VitalCounts vitalRef={vitalRef} />}
      {!hasSelection && !showVital && (
        <>
          <span className="h-3 w-px bg-border" aria-hidden />
          <span>Drag to rotate · scroll to zoom · click a person</span>
        </>
      )}
    </div>
  )
}

function VitalCounts({ vitalRef }: { vitalRef: RefObject<VitalStats> }) {
  const vital = usePolled(() => ({ ...vitalRef.current }), 250, emptyVitalStats())
  return (
    <>
      <span className="h-3 w-px bg-border" aria-hidden />
      <span className="tabular-nums">
        {Math.round(vital.births).toLocaleString("en-US")} born · {Math.round(vital.deaths).toLocaleString("en-US")} died
      </span>
    </>
  )
}

/** Touch-first hint for screens where the status bar is hidden */
export function TapHint() {
  return (
    <p className="pointer-events-none absolute top-4 left-1/2 z-20 flex -translate-x-1/2 items-center md:top-auto md:right-4 md:bottom-4 md:left-auto md:translate-x-0 gap-1.5 rounded-full border border-border bg-background/75 px-3 py-1.5 text-xs whitespace-nowrap text-muted-foreground backdrop-blur lg:hidden">
      <Hand className="size-3.5" aria-hidden /> Tap a person to meet them · pinch to zoom
    </p>
  )
}
