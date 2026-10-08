"use client"

import { useCallback, useEffect, useState } from "react"

import { fetchDisasters, type DisasterFeed } from "./disasters"

const REFRESH_MS = 10 * 60_000

/**
 * Live disaster feed while `enabled`, refreshed every 10 minutes.
 * `error` is set when no source could be reached; `retry()` fetches again right away.
 */
export function useDisasters(enabled: boolean) {
  const [feed, setFeed] = useState<DisasterFeed | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!enabled) return
    const ctrl = new AbortController()
    const load = () => {
      setLoading(true)
      fetchDisasters(ctrl.signal)
        .then((f) => {
          if (ctrl.signal.aborted) return
          if (f.sources.length && f.sources.every((s) => !s.ok)) {
            // keep showing the last good feed, if any
            setError("Couldn’t reach the feeds.")
          } else {
            setFeed(f)
            setError(null)
          }
        })
        .catch((e: unknown) => {
          if (ctrl.signal.aborted) return
          setError(e instanceof Error && e.message ? `Couldn’t reach the feeds (${e.message}).` : "Couldn’t reach the feeds.")
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setLoading(false)
        })
    }
    load()
    const t = setInterval(load, REFRESH_MS)
    return () => {
      ctrl.abort()
      clearInterval(t)
      // an aborted request never reaches `finally` above
      setLoading(false)
    }
  }, [enabled, attempt])

  const retry = useCallback(() => setAttempt((a) => a + 1), [])

  return { feed, loading: enabled && loading, error: enabled ? error : null, retry }
}
