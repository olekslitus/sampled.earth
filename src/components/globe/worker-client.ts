import type { GlobeWorkerRequest, GlobeWorkerResponse } from "./globe.worker"

type Request = GlobeWorkerRequest extends infer R ? (R extends { id: number } ? Omit<R, "id"> : never) : never

let worker: Worker | null | undefined
let nextId = 1
const pending = new Map<number, { resolve: (r: GlobeWorkerResponse) => void; reject: (e: Error) => void }>()

function getWorker(): Worker | null {
  if (worker !== undefined) return worker
  worker = null
  if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") return null
  try {
    worker = new Worker(new URL("./globe.worker.ts", import.meta.url), { type: "module", name: "globe" })
    worker.onmessage = (e: MessageEvent<GlobeWorkerResponse>) => {
      const p = pending.get(e.data.id)
      if (!p) return
      pending.delete(e.data.id)
      if (e.data.kind === "error") p.reject(new Error(e.data.message))
      else p.resolve(e.data)
    }
    worker.onerror = (e) => {
      // the worker could not start (or crashed): fail everything so callers fall back
      for (const p of pending.values()) p.reject(new Error(e.message || "globe worker failed"))
      pending.clear()
      worker?.terminate()
      worker = null
    }
  } catch {
    worker = null
  }
  return worker
}

/** Runs a job in the shared globe worker; rejects when workers are unavailable. */
export function runInGlobeWorker(req: Request): Promise<GlobeWorkerResponse> {
  const w = getWorker()
  if (!w) return Promise.reject(new Error("no worker"))
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    w.postMessage({ ...req, id } as GlobeWorkerRequest)
  })
}

type IdleDeadlineLike = { timeRemaining(): number; didTimeout?: boolean }

/** requestIdleCallback with a setTimeout fallback (Safari). Returns a cancel function. */
export function whenIdle(fn: (deadline: IdleDeadlineLike) => void, timeout = 2000): () => void {
  if (typeof requestIdleCallback === "function") {
    const h = requestIdleCallback(fn, { timeout })
    return () => cancelIdleCallback(h)
  }
  const h = setTimeout(() => fn({ timeRemaining: () => 10 }), 50)
  return () => clearTimeout(h)
}
