"use client"

import { useRef } from "react"

import { useCardFocus, useTicker } from "@/components/hooks"
import { PersonPanel } from "@/components/panels/PersonPanel"
import type { Theme } from "@/lib/sim/attributes"
import type { Simulation } from "@/lib/sim/engine"

interface PersonCardProps {
  theme: Theme
  sim: Simulation
  id: number
  incomePercentile: (income: number) => number
  follow: boolean
  onFollowChange: (v: boolean) => void
  onClose: () => void
}

/**
 * Placement, dialog semantics and the live refresh for the person details panel.
 * Only this subtree re-renders at 4 Hz to keep the activity and local time current.
 */
export function PersonCard({ sim, id, ...rest }: PersonCardProps) {
  useTicker(250)
  const ref = useRef<HTMLElement>(null)
  useCardFocus(ref, id)
  const person = sim.personById(id)
  if (!person) return null
  return (
    <section
      ref={ref}
      role="dialog"
      aria-modal="false"
      aria-label={`About ${person.name}`}
      className="pointer-events-none absolute inset-x-0 bottom-[3rem] z-40 flex max-h-[62dvh] p-4 sm:left-auto sm:w-[26rem] md:inset-x-auto md:top-0 md:right-0 md:bottom-0 md:max-h-none md:w-[24rem]"
    >
      <div className="pointer-events-auto flex min-h-0 w-full flex-col">
        <PersonPanel key={id} sim={sim} id={id} {...rest} />
      </div>
    </section>
  )
}
