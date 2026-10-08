"use client"

import { Eye, EyeOff } from "lucide-react"

import { schemeColors, type ColorScheme, type Theme } from "@/lib/sim/attributes"
import { cn } from "@/lib/utils"

interface LegendProps {
  theme: Theme
  title: string
  scheme: ColorScheme
  counts: number[]
  hidden: ReadonlySet<number>
  onToggle: (index: number) => void
  onReset: () => void
}

export function Legend({ theme, title, scheme, counts, hidden, onToggle, onReset }: LegendProps) {
  const colors = schemeColors(scheme, theme)
  const total = counts.reduce((a, b) => a + b, 0) || 1
  const max = Math.max(...counts, 1)
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{title}</span>
        {hidden.size > 0 && (
          <button className="underline-offset-2 hover:text-foreground hover:underline" onClick={onReset}>
            Show all
          </button>
        )}
      </div>
      <ul className="space-y-0.5">
        {scheme.categories.map((label, i) => {
          const off = hidden.has(i)
          const share = (counts[i] ?? 0) / total
          return (
            <li key={label}>
              <button
                onClick={() => onToggle(i)}
                aria-pressed={!off}
                className={cn(
                  "group grid w-full grid-cols-[12px_1fr_auto] items-center gap-x-2 rounded-md px-1.5 py-1 text-left text-xs transition-colors hover:bg-muted",
                  off && "opacity-45",
                )}
              >
                <span className="size-2.5 rounded-full ring-2 ring-background" style={{ background: colors[i] }} />
                <span className="truncate text-foreground">{label}</span>
                <span className="flex items-center gap-1.5 tabular-nums text-muted-foreground">
                  {(share * 100).toFixed(share < 0.1 ? 1 : 0)}%
                  {off ? <EyeOff className="size-3" /> : <Eye className="size-3 opacity-0 group-hover:opacity-60" />}
                </span>
                <span />
                <span className="col-span-2 mt-0.5 h-1 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full transition-[width] duration-500"
                    style={{ width: `${((counts[i] ?? 0) / max) * 100}%`, background: colors[i] }}
                  />
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <p className="text-[11px] text-muted-foreground">Click a group to dim it</p>
    </div>
  )
}
