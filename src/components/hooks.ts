"use client"

import { useEffect, useEffectEvent, useState, type RefObject } from "react"

/**
 * Re-renders the calling component every `ms` milliseconds (or never when `ms` is null)
 * and returns a counter that changes on every tick. Use it in the small leaf components
 * that show live simulation values, so the rest of the tree stays still.
 */
export function useTicker(ms: number | null) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (ms == null) return
    const t = setInterval(() => setTick((x) => x + 1), ms)
    return () => clearInterval(t)
  }, [ms])
  return tick
}

/** Samples `read()` every `ms` milliseconds into state (for values kept in refs); `initial` until the first sample. */
export function usePolled<T>(read: () => T, ms: number, initial: T) {
  const [value, setValue] = useState<T>(initial)
  const sample = useEffectEvent(() => setValue(read()))
  useEffect(() => {
    const t = setInterval(sample, ms)
    return () => clearInterval(t)
  }, [ms])
  return value
}

/**
 * Non-modal dialog focus handling for floating cards: when the card mounts (or `key`
 * changes) focus moves to its close button; when it goes away focus returns to whatever
 * was focused before, unless the user has since moved focus somewhere else.
 */
export function useCardFocus(ref: RefObject<HTMLElement | null>, key: unknown) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const previous = document.activeElement instanceof HTMLElement && !el.contains(document.activeElement) ? document.activeElement : null
    const close = el.querySelector<HTMLElement>("[data-card-close], button[aria-label='Close']") ?? el.querySelector<HTMLElement>("button")
    close?.focus({ preventScroll: true })
    return () => {
      const active = document.activeElement
      const focusWasInCard = !active || active === document.body || el.contains(active) || !el.isConnected
      if (previous?.isConnected && focusWasInCard) previous.focus({ preventScroll: true })
    }
  }, [ref, key])
}
