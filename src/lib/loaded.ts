"use client"

import { useEffect, useState } from "react"

/** Fetch once per key, shared by every caller (forgotten on failure, so it can be retried) */
const cache = new Map<string, Promise<unknown>>()
export function once<T>(key: string, load: () => Promise<T>): Promise<T> {
  let p = cache.get(key) as Promise<T> | undefined
  if (!p) {
    p = load()
    p.catch(() => cache.delete(key))
    cache.set(key, p)
  }
  return p
}

/** A loader as React state: null until loaded (or while `enabled` is false) */
export function useLoaded<T>(key: string, load: () => Promise<T>, enabled = true) {
  const [value, setValue] = useState<{ key: string; value: T } | null>(null)
  useEffect(() => {
    if (!enabled) return
    let live = true
    once(key, load)
      .then((v) => live && setValue({ key, value: v }))
      .catch(() => {})
    return () => {
      live = false
    }
    // `load` is identified by `key`
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled])
  return value?.key === key ? value.value : null
}
