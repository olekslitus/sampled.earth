import { buildBorderLines, importBorderTopology, type BorderDetail } from "./border-lines"
import { runInGlobeWorker, whenIdle } from "./worker-client"

export type { BorderDetail }

const cache = new Map<BorderDetail, Promise<Float32Array>>()

/** Builds the lines on the main thread, during idle time, when the worker is unavailable. */
function buildHere(detail: BorderDetail): Promise<Float32Array> {
  return importBorderTopology(detail).then((m) => new Promise((resolve) => whenIdle(() => resolve(buildBorderLines(m)))))
}

/**
 * Coastlines and country borders as line-segment pairs on a sphere just above the surface.
 * Parsed and meshed in the globe worker so the 1:10m atlas (3.7 MB) never blocks a frame.
 */
export function loadBorderLines(detail: BorderDetail): Promise<Float32Array> {
  let p = cache.get(detail)
  if (!p) {
    p = runInGlobeWorker({ kind: "borders", detail }).then(
      (r) => (r.kind === "borders" ? r.positions : buildHere(detail)),
      () => buildHere(detail),
    )
    cache.set(detail, p)
  }
  return p
}

/** Warms the cache once the main thread is idle. Returns a cancel function. */
export function prefetchBorderLines(detail: BorderDetail): () => void {
  return whenIdle(() => void loadBorderLines(detail), 4000)
}
