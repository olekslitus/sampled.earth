"use client"

import { useEffect, useMemo, useRef } from "react"
import * as THREE from "three"

import { FAR_FROM_EARTH } from "@/components/globe/PeopleLayer"
import { cn } from "@/lib/utils"
import type { SpaceItem } from "./items"
import type { SpaceView } from "./view"

interface Projected {
  item: SpaceItem
  x: number
  y: number
}

const LABEL_H = 18
/** more than this many names at once is noise */
const MAX_LABELS = 28

/**
 * Names for what is on screen in space, placed over the canvas every frame (most important
 * first, skipping any that would overlap), plus hovering and clicking the points that have
 * no label — exoplanet systems and galaxies.
 */
export function SpaceLabels({
  view, items, selectedKey, onPick,
}: {
  view: SpaceView
  items: SpaceItem[]
  selectedKey: string | null
  onPick: (item: SpaceItem | null) => void
}) {
  const root = useRef<HTMLDivElement>(null)
  const tip = useRef<HTMLDivElement>(null)
  const els = useRef(new Map<string, HTMLDivElement>())
  const state = useRef({ selectedKey, hoverKey: null as string | null, onPick })
  useEffect(() => {
    state.current.selectedKey = selectedKey
    state.current.onPick = onPick
  }, [selectedKey, onPick])

  const labelled = useMemo(() => items.filter((i) => i.labelled || i.key === selectedKey), [items, selectedKey])
  const pickable = useMemo(() => items.filter((i) => !i.labelled), [items])

  // place labels after each frame ------------------------------------------------------
  useEffect(() => {
    const qi = new THREE.Quaternion()
    const v = new THREE.Vector3()
    const p = [0, 0, 0]
    const candidates: (Projected & { priority: number; w: number })[] = []
    const placed: { x: number; y: number; w: number }[] = []

    let depthLimited = true
    const project = (item: SpaceItem, out: Projected) => {
      if (!item.position(view.time, p)) return false
      v.set(p[0]! - view.cam[0]!, p[1]! - view.cam[1]!, p[2]! - view.cam[2]!)
      // hidden behind Earth?
      const camR = Math.hypot(view.cam[0]!, view.cam[1]!, view.cam[2]!)
      if (camR < 2e4 && item.key !== "body:Earth") {
        const len = v.length()
        const dx = v.x / len
        const dy = v.y / len
        const dz = v.z / len
        const b = view.cam[0]! * dx + view.cam[1]! * dy + view.cam[2]! * dz
        const c = camR * camR - 1
        const disc = b * b - c
        if (disc > 0 && -b - Math.sqrt(disc) > 0 && -b - Math.sqrt(disc) < len) return false
      }
      // stars, planetary systems and galaxies far behind what you are looking at would only crowd it
      if (depthLimited && (item.kind === "star" || item.kind === "exo" || item.kind === "galaxy") && v.length() > view.dist * 2.2) return false
      v.applyQuaternion(qi)
      if (v.z > -1e-9) return false
      const f = view.height / 2 / Math.tan((view.fov * Math.PI) / 360)
      out.x = view.width / 2 + (f * v.x) / -v.z
      out.y = view.height / 2 - (f * v.y) / -v.z
      return out.x > -40 && out.x < view.width + 40 && out.y > -20 && out.y < view.height + 20
    }

    const update = () => {
      qi.copy(view.quat).invert()
      const { selectedKey, hoverKey } = state.current
      candidates.length = 0
      for (const item of labelled) {
        const el = els.current.get(item.key)
        if (!el) continue
        const special = item.key === selectedKey || item.key === hoverKey
        const inRange = view.dist >= item.range[0] && view.dist <= item.range[1]
        const pr = { item, x: 0, y: 0, priority: item.priority + (item.key === selectedKey ? 1000 : item.key === hoverKey ? 900 : 0), w: item.name.length * 6.4 + 20 }
        depthLimited = !special
        if ((inRange || special) && project(item, pr)) candidates.push(pr)
        else el.style.display = "none"
      }
      candidates.sort((a, b) => b.priority - a.priority)
      placed.length = 0
      for (const c of candidates) {
        const el = els.current.get(c.item.key)!
        const overlaps = placed.some((q) => c.x < q.x + q.w && q.x < c.x + c.w && Math.abs(c.y - q.y) < LABEL_H)
        if ((overlaps || placed.length >= MAX_LABELS) && c.priority < 900) {
          el.style.display = "none"
          continue
        }
        placed.push({ x: c.x - 6, y: c.y, w: c.w })
        el.style.display = ""
        el.style.transform = `translate(${Math.round(c.x)}px, ${Math.round(c.y)}px)`
      }
    }
    view.afterRender.add(update)
    return () => {
      view.afterRender.delete(update)
    }
  }, [view, labelled])

  // hover and click on unlabelled points -----------------------------------------------
  useEffect(() => {
    const canvas = root.current?.parentElement?.querySelector("canvas")
    if (!canvas) return
    const qi = new THREE.Quaternion()
    const v = new THREE.Vector3()
    const p = [0, 0, 0]
    const pr: Projected = { item: pickable[0]!, x: 0, y: 0 }
    let frame = 0
    let down: { x: number; y: number } | null = null

    const nearest = (clientX: number, clientY: number) => {
      if (view.distanceFromEarth < FAR_FROM_EARTH) return null
      const rect = canvas.getBoundingClientRect()
      const mx = clientX - rect.left
      const my = clientY - rect.top
      qi.copy(view.quat).invert()
      const f = view.height / 2 / Math.tan((view.fov * Math.PI) / 360)
      let best: SpaceItem | null = null
      let bestD = 10 * 10
      for (const item of pickable) {
        if (view.dist < item.range[0] || view.dist > item.range[1]) continue
        if (!item.position(view.time, p)) continue
        v.set(p[0]! - view.cam[0]!, p[1]! - view.cam[1]!, p[2]! - view.cam[2]!).applyQuaternion(qi)
        if (v.z > -1e-9) continue
        pr.x = view.width / 2 + (f * v.x) / -v.z - mx
        pr.y = view.height / 2 - (f * v.y) / -v.z - my
        const d = pr.x * pr.x + pr.y * pr.y
        if (d < bestD) {
          bestD = d
          best = item
        }
      }
      return best
    }

    const showTip = (item: SpaceItem | null, clientX = 0, clientY = 0) => {
      const t = tip.current
      if (!t) return
      state.current.hoverKey = item?.key ?? null
      if (!item) {
        t.style.display = "none"
        return
      }
      const rect = canvas.getBoundingClientRect()
      t.textContent = item.name
      t.style.display = ""
      t.style.transform = `translate(${clientX - rect.left + 12}px, ${clientY - rect.top - 10}px)`
    }

    const onMove = (e: PointerEvent) => {
      if (e.buttons) return
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        if (view.distanceFromEarth < FAR_FROM_EARTH) return
        const hit = nearest(e.clientX, e.clientY)
        showTip(hit, e.clientX, e.clientY)
        canvas.style.cursor = hit ? "pointer" : "grab"
      })
    }
    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY }
    }
    const onUp = (e: PointerEvent) => {
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5 && view.distanceFromEarth >= FAR_FROM_EARTH) {
        state.current.onPick(nearest(e.clientX, e.clientY))
      }
      down = null
    }
    const onLeave = () => showTip(null)
    canvas.addEventListener("pointermove", onMove)
    canvas.addEventListener("pointerdown", onDown)
    canvas.addEventListener("pointerup", onUp)
    canvas.addEventListener("pointerleave", onLeave)
    return () => {
      cancelAnimationFrame(frame)
      canvas.removeEventListener("pointermove", onMove)
      canvas.removeEventListener("pointerdown", onDown)
      canvas.removeEventListener("pointerup", onUp)
      canvas.removeEventListener("pointerleave", onLeave)
    }
  }, [view, pickable])

  return (
    <div ref={root} className="pointer-events-none absolute inset-0 z-10 overflow-hidden" aria-hidden={false}>
      {labelled.map((item) => (
        <div
          key={item.key}
          ref={(el) => {
            if (el) els.current.set(item.key, el)
            else els.current.delete(item.key)
          }}
          className="absolute top-0 left-0"
          style={{ display: "none" }}
        >
          <button
            type="button"
            onClick={() => onPick(item)}
            className={cn(
              "pointer-events-auto -mt-[9px] -ml-[4px] flex items-center gap-1.5 rounded-full py-0.5 pr-1.5 text-[11px] leading-none whitespace-nowrap text-white/85 [text-shadow:0_1px_3px_rgb(0_0_0/0.9)] hover:text-white focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none",
              item.key === selectedKey && "font-semibold text-white",
            )}
          >
            <span
              className={cn("size-2 shrink-0 rounded-full ring-1 ring-black/50", item.kind === "finding" && "rotate-45 rounded-[1px]", item.kind === "place" && "size-1.5 opacity-70")}
              style={{ background: item.color }}
              aria-hidden
            />
            {item.name}
            {item.fresh && <span className="rounded-sm bg-amber-400/90 px-1 text-[9px] font-semibold text-black [text-shadow:none]">NEW</span>}
          </button>
        </div>
      ))}
      <div ref={tip} className="absolute top-0 left-0 rounded bg-black/70 px-1.5 py-0.5 text-[11px] text-white" style={{ display: "none" }} />
    </div>
  )
}
