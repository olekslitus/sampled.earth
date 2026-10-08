"use client"

import { useEffect, useState } from "react"

import { BLOB_URL } from "@/lib/blob"

/** What weather/latest.json in Blob points to (written by build.ts) */
export interface WeatherIndex {
  clouds: { url: string; time: string; satellites: string[] }
  precip: { url: string; time: string } | null
  updated: string
}

const REFRESH_MS = 5 * 60_000

/** The newest weather layers while `enabled`, checked every five minutes. */
export function useWeather(enabled: boolean) {
  const [index, setIndex] = useState<WeatherIndex | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    if (!enabled) return
    const ctrl = new AbortController()
    const load = () =>
      fetch(`${BLOB_URL}/weather/latest.json`, { signal: ctrl.signal, cache: "no-cache" })
        .then((r) => (r.ok ? (r.json() as Promise<WeatherIndex>) : Promise.reject(new Error(String(r.status)))))
        .then((next) => {
          setError(false)
          // a new object only when the images changed, so the globe keeps its textures
          setIndex((prev) => (prev && prev.clouds.url === next.clouds.url && prev.precip?.url === next.precip?.url ? prev : next))
        })
        .catch(() => {
          if (!ctrl.signal.aborted) setError(true)
        })
    load()
    const t = setInterval(load, REFRESH_MS)
    return () => {
      ctrl.abort()
      clearInterval(t)
    }
  }, [enabled])
  return { index: enabled ? index : null, error: enabled && error }
}
