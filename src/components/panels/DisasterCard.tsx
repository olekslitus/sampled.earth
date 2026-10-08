"use client"

import { useId, useRef, type ReactNode } from "react"
import {
  Activity, CloudLightning, ExternalLink, Flame, Mountain, Snowflake, Sun, Tornado, Waves, X, type LucideIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { useCardFocus } from "@/components/hooks"
import { ALERT_COLOR } from "@/components/globe/DisasterLayer"
import { peopleNearby, type AlertLevel, type Disaster, type DisasterKind } from "@/lib/disasters"
import { formatPeople, formatUtc } from "./format"

export const KIND_ICON: Record<DisasterKind, LucideIcon> = {
  Earthquake: Activity,
  "Tropical cyclone": Tornado,
  Flood: Waves,
  Wildfire: Flame,
  Volcano: Mountain,
  Drought: Sun,
  "Severe storm": CloudLightning,
  Iceberg: Snowflake,
}

const ALERT_TEXT: Record<AlertLevel, string> = {
  Green: "Green alert · limited impact expected",
  Orange: "Orange alert · moderate impact",
  Red: "Red alert · severe humanitarian impact",
}

export function timeAgo(ms: number, now: number) {
  const m = Math.max(0, Math.round((now - ms) / 60_000))
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 48) return `${h} h ago`
  return `${Math.round(h / 24)} days ago`
}

export function AlertBadge({ alert }: { alert: AlertLevel }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className="size-2 rounded-full" style={{ background: ALERT_COLOR[alert] }} />
      {alert} alert
    </span>
  )
}

/** Shared placement for the floating detail cards: bottom sheet on phones, top-right beside the controls from md up */
export const FLOATING_CARD_CLASS =
  "absolute inset-x-4 bottom-[4rem] z-40 max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-xl border border-border bg-card/90 p-4 shadow-2xl backdrop-blur-md sm:left-auto sm:w-[22rem] md:top-4 md:bottom-auto"

export function DisasterCard({ d, now, onClose }: { d: Disaster; now: number; onClose: () => void }) {
  const Icon = KIND_ICON[d.kind]
  const near = peopleNearby(d)
  const titleId = useId()
  const ref = useRef<HTMLElement>(null)
  useCardFocus(ref, d.id)
  return (
    <section ref={ref} role="dialog" aria-modal="false" aria-labelledby={titleId} className={FLOATING_CARD_CLASS}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Icon className="size-3.5" aria-hidden /> {d.kind}
            {d.tsunami && <span>· tsunami warning issued</span>}
          </p>
          <h2 id={titleId} className="text-base leading-snug font-semibold">{d.title}</h2>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close" data-card-close>
          <X />
        </Button>
      </div>
      <dl className="mt-3 space-y-1.5 text-sm">
        {d.alert && <Item label="Alert">{ALERT_TEXT[d.alert]}</Item>}
        {d.severity && <Item label="Intensity">{d.severity}</Item>}
        {d.country && <Item label="Where">{d.country}</Item>}
        <Item label="When">
          {d.kind === "Earthquake" ? formatUtc(d.start) : `Since ${formatUtc(d.start)}`} UTC
          <span className="text-muted-foreground"> · updated {timeAgo(d.updated, now)}</span>
        </Item>
        {d.impactKm > 0 && (
          <Item label="Nearby">
            ≈ {formatPeople(near)} people live within {d.impactKm.toLocaleString("en-US")} km
            <p className="text-xs text-muted-foreground">
              {d.kind === "Earthquake" ? "Rough radius of strong shaking for this magnitude. " : ""}Estimated from the app’s population model.
            </p>
          </Item>
        )}
        {d.track && <Item label="Track">{d.track.length} positions shown as a line on the globe</Item>}
      </dl>
      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>Source: {d.sources.join(" + ")}</span>
        {d.url && (
          <a href={d.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-foreground hover:underline">
            Details <ExternalLink className="size-3" aria-hidden />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        )}
      </div>
    </section>
  )
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[72px_1fr] gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  )
}
