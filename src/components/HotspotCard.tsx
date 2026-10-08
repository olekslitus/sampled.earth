"use client"

import { useId, useRef } from "react"
import { X } from "lucide-react"

import { LEVEL_STYLE } from "@/components/globe/UnrestLayer"
import { useCardFocus } from "@/components/hooks"
import { FLOATING_CARD_CLASS } from "@/components/panels/DisasterCard"
import { Button } from "@/components/ui/button"
import type { Hotspot } from "@/lib/sim/unrest"

/** Details for a conflict / unrest hotspot picked on the globe or in the Layers tab */
export function HotspotCard({ hotspot, onClose }: { hotspot: Hotspot; onClose: () => void }) {
  const titleId = useId()
  const ref = useRef<HTMLElement>(null)
  useCardFocus(ref, hotspot.name)
  const style = LEVEL_STYLE[hotspot.level]
  return (
    <section ref={ref} role="dialog" aria-modal="false" aria-labelledby={titleId} className={FLOATING_CARD_CLASS}>
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-2 rounded-full" style={{ background: style.color }} aria-hidden />
            <span aria-hidden>{style.icon}</span> {hotspot.level}
          </p>
          <h2 id={titleId} className="text-base font-semibold">
            {hotspot.name}
          </h2>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close" data-card-close>
          <X />
        </Button>
      </div>
      <p className="mt-2 text-sm">{hotspot.summary}</p>
      <p className="mt-3 text-[11px] text-muted-foreground">Snapshot from 2025 reporting, not live. Check current sources.</p>
    </section>
  )
}
