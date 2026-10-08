"use client"

import { ChevronDown, ChevronUp } from "lucide-react"

import { usePolled } from "@/components/hooks"
import { Button } from "@/components/ui/button"
import { formatDistance, formatLightTime, GLY } from "@/lib/space/units"
import { cn } from "@/lib/utils"
import { LEVELS, levelAt, type Level, type SpaceView } from "./view"

/**
 * The way out, one stop per scale: from the globe to the edge of the observable universe.
 * Shows how far the camera is from Earth and how long light takes to get there.
 */
export function ScaleLadder({ view, onLevel, cardOpen }: { view: SpaceView; onLevel: (l: Level) => void; cardOpen: boolean }) {
  const state = usePolled(() => ({ dist: view.dist, fromEarth: view.distanceFromEarth, focused: view.focus != null }), 250, { dist: 3.2, fromEarth: 3.2, focused: false })
  const current = levelAt(state.dist)
  const i = LEVELS.indexOf(current)
  const far = state.fromEarth > 40
  return (
    <nav
      aria-label="Zoom through space"
      className={cn(
        "pointer-events-none absolute right-2 z-20 flex flex-col items-end gap-2 max-md:top-16 md:top-1/2 md:right-4 md:-translate-y-1/2",
        cardOpen && "md:right-[24rem]",
      )}
    >
      {/* compact: a step out, a step in, and where you are */}
      <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-border bg-background/70 p-0.5 text-xs shadow-sm backdrop-blur lg:hidden">
        <Button variant="ghost" size="icon-sm" className="rounded-full" disabled={i === 0} onClick={() => onLevel(LEVELS[i - 1]!)} aria-label="Zoom in a step">
          <ChevronDown />
        </Button>
        <span className="min-w-24 text-center font-medium">{current.name}</span>
        <Button variant="ghost" size="icon-sm" className="rounded-full" disabled={i === LEVELS.length - 1} onClick={() => onLevel(LEVELS[i + 1]!)} aria-label="Zoom out a step">
          <ChevronUp />
        </Button>
      </div>

      {/* full: every stop */}
      <ol className="pointer-events-auto hidden flex-col-reverse rounded-xl border border-border bg-background/70 p-1 shadow-sm backdrop-blur lg:flex">
        {LEVELS.map((l) => (
          <li key={l.key}>
            <button
              type="button"
              onClick={() => onLevel(l)}
              aria-current={l === current && !state.focused ? "true" : undefined}
              className={cn(
                "flex w-full items-center justify-end gap-2 rounded-md px-2 py-[3px] text-right text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
                l === current && !state.focused && "font-medium text-foreground",
              )}
            >
              {l.name}
              <span className={cn("size-1.5 rounded-full bg-muted-foreground/40", l === current && !state.focused && "size-2 bg-primary")} aria-hidden />
            </button>
          </li>
        ))}
      </ol>

      {far && (
        <p className="pointer-events-auto rounded-lg border border-border bg-background/70 px-2 py-1 text-right text-[11px] leading-snug text-muted-foreground backdrop-blur" role="status">
          <span className="font-medium text-foreground tabular-nums">{formatDistance(state.fromEarth)}</span> from Earth
          {/* beyond a billion light-years, cosmic expansion makes light time and distance part ways */}
          {state.fromEarth < GLY && (
            <>
              <br />
              light takes <span className="tabular-nums">{formatLightTime(state.fromEarth)}</span>
            </>
          )}
        </p>
      )}
    </nav>
  )
}
