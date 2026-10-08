"use client"

import { Orbit, Rocket, Sparkles } from "lucide-react"

import type { SpaceLive } from "./data"
import type { SpaceItem } from "./items"

function ItemButton({ item, onPick, sub }: { item: SpaceItem; onPick: (i: SpaceItem) => void; sub?: string }) {
  return (
    <button type="button" className="flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left text-xs hover:bg-muted" onClick={() => onPick(item)}>
      <span className={item.kind === "finding" ? "size-2 shrink-0 rotate-45 rounded-[1px]" : "size-2 shrink-0 rounded-full"} style={{ background: item.color }} aria-hidden />
      <span className="min-w-0 flex-1 truncate">{item.finding?.title ?? item.name}</span>
      {sub && <span className="shrink-0 text-muted-foreground">{sub}</span>}
    </button>
  )
}

/** The Layers tab's way into space: recent findings, the newest exoplanets and every tracked spacecraft */
export function SpacePanel({ items, live, onPick }: { items: SpaceItem[]; live: SpaceLive | null; onPick: (i: SpaceItem) => void }) {
  const findings = items.filter((i) => i.kind === "finding").sort((a, b) => b.finding!.year - a.finding!.year)
  const fresh = items
    .filter((i) => i.fresh)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 6)
  const craft = items.filter((i) => i.kind === "track")
  return (
    <section className="space-y-2">
      <p className="flex items-center gap-2 text-sm font-medium">
        <Orbit className="size-4" /> Space
        <span className="rounded-sm bg-muted px-1 text-[10px] font-medium tracking-wider text-muted-foreground uppercase">Live</span>
      </p>
      <p className="text-[11px] text-muted-foreground">
        Keep zooming out — past the Moon, the planets and the stars to the edge of the observable universe — or use the scale on the right. Spacecraft positions from NASA JPL Horizons and
        exoplanets from the NASA Exoplanet Archive, refreshed daily.
      </p>

      <div className="space-y-0.5">
        <p className="flex items-center gap-1.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
          <Sparkles className="size-3" aria-hidden /> Findings
        </p>
        {findings.map((i) => (
          <ItemButton key={i.key} item={i} onPick={onPick} sub={String(i.finding!.year)} />
        ))}
        {!live && <p className="px-1 text-[11px] text-muted-foreground">Loading live data…</p>}
      </div>

      {live && (
        <div className="space-y-0.5">
          <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">Newest of {live.exoplanetCount.toLocaleString("en-US")} known exoplanets</p>
          {fresh.map((i) => (
            <ItemButton key={i.key} item={i} onPick={onPick} sub={`${Math.round(i.exo!.dist).toLocaleString("en-US")} ly`} />
          ))}
        </div>
      )}

      {craft.length > 0 && (
        <div className="space-y-0.5">
          <p className="flex items-center gap-1.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
            <Rocket className="size-3" aria-hidden /> Spacecraft & visitors
          </p>
          {craft.map((i) => (
            <ItemButton key={i.key} item={i} onPick={onPick} sub={i.track!.info.agency} />
          ))}
        </div>
      )}
    </section>
  )
}
