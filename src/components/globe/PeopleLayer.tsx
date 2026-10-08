"use client"
/* oxlint-disable react/immutability --
 * three.js buffers, materials and the simulation are mutated imperatively inside the r3f
 * frame loop, which is how r3f is meant to be used. */

import { useEffect, useMemo, useRef, type RefObject } from "react"
import * as THREE from "three"
import { useFrame, useThree } from "@react-three/fiber"

import { schemeColors, type ColorScheme, type Theme } from "@/lib/sim/attributes"
import type { Simulation } from "@/lib/sim/engine"
import type { CompiledFilter } from "@/lib/sim/filter"
import { PERSON_RADIUS } from "@/lib/sim/sphere"
import type { ExtraPick } from "./DisasterLayer"
import type { MapStyle } from "./satellite"
import { hexToRgb, pointSizeFor } from "./util"

const pointsVertex = /* glsl */ `
  attribute vec3 color;
  attribute float size;
  uniform float uSize;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec3 toCam = cameraPosition - position;
    float facing = dot(normalize(position), normalize(toCam));
    vColor = color;
    vAlpha = smoothstep(0.0, 0.06, facing);
    if (facing <= 0.0 || size <= 0.0) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      return;
    }
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uSize * size;
  }
`
const pointsFragment = /* glsl */ `
  uniform float uRing;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    // a dark rim keeps dots readable over busy satellite imagery
    vec3 color = mix(vColor, vec3(0.02, 0.03, 0.06), uRing * smoothstep(0.24, 0.36, d));
    gl_FragColor = vec4(color, vAlpha * smoothstep(0.5, 0.32, d));
  }
`

const DIM_RGB: Record<Theme, [number, number, number]> = { dark: hexToRgb("#1a2133"), light: hexToRgb("#c3c9d2") }

export interface PeopleProps {
  sim: Simulation
  scheme: ColorScheme
  hidden: ReadonlySet<number>
  selectedId: number | null
  hoveredId: number | null
  theme: Theme
  mapStyle: MapStyle
  filter: CompiledFilter | null
  filterMode: "grey" | "hide"
  /** per-slot base point size (0 = not drawn); shared with the picker */
  sizesRef: RefObject<Float32Array>
}

/** Inclusive dirty index range; empty while max < min */
class Range {
  min = Infinity
  max = -1
  add(i: number) {
    if (i < this.min) this.min = i
    if (i > this.max) this.max = i
  }
  reset() {
    this.min = Infinity
    this.max = -1
  }
  /** queue an upload of the range (in elements of `itemSize`) and clear it */
  flush(attr: THREE.BufferAttribute) {
    if (this.max < this.min) return
    attr.addUpdateRange(this.min * attr.itemSize, (this.max - this.min + 1) * attr.itemSize)
    attr.needsUpdate = true
    this.reset()
  }
}

export function People({ sim, scheme, hidden, selectedId, hoveredId, sizesRef, theme, mapStyle, filter, filterMode }: PeopleProps) {
  const dpr = useThree((s) => s.viewport.dpr)
  const cap = sim.capacity
  const { geometry, colors, sizes, renderSizes } = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const position = new THREE.BufferAttribute(sim.xyz, 3)
    position.setUsage(THREE.DynamicDrawUsage)
    const colors = new Float32Array(cap * 3)
    const sizes = new Float32Array(cap)
    const renderSizes = new Float32Array(cap)
    g.setAttribute("position", position)
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage))
    g.setAttribute("size", new THREE.BufferAttribute(renderSizes, 1).setUsage(THREE.DynamicDrawUsage))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.01)
    return { geometry: g, colors, sizes, renderSizes }
  }, [sim, cap])
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => {
    sizesRef.current = sizes
  }, [sizes, sizesRef])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uSize: { value: 2 }, uRing: { value: 0 } },
        vertexShader: pointsVertex,
        fragmentShader: pointsFragment,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])
  useEffect(() => {
    material.uniforms.uRing.value = mapStyle === "satellite" ? 1 : 0
  }, [material, mapStyle])

  const palette = useMemo(() => schemeColors(scheme, theme).map(hexToRgb), [scheme, theme])
  const last = useRef({
    geometry: null as THREE.BufferGeometry | null,
    palette: null as unknown,
    hidden: null as ReadonlySet<number> | null,
    filter: null as CompiledFilter | null,
    mode: "",
    end: 0,
    hov: -1,
    sel: -1,
    colorRange: new Range(),
    sizeRange: new Range(),
  })

  useFrame((state) => {
    const end = sim.slotEnd
    const l = last.current
    const { colorRange, sizeRange } = l
    const dim = DIM_RGB[theme]

    const recolor = (i: number) => {
      const p = sim.people[i]
      let size: number
      let rgb: readonly number[] | null = null
      if (!p || sim.suppressed[i]) size = 0
      else if (filter && !filter.test(p, i, sim)) {
        // outside the filter: grey or gone
        size = filterMode === "hide" ? 0 : 0.55
        rgb = dim
      } else {
        // dimmed legend groups: grey
        const v = scheme.value(p, i, sim)
        const off = hidden.has(v)
        rgb = off ? dim : (palette[v] ?? dim)
        size = off ? 0.55 : 1
      }
      sizes[i] = size
      renderSizes[i] = size
      sizeRange.add(i)
      if (rgb) {
        colors[i * 3] = rgb[0]
        colors[i * 3 + 1] = rgb[1]
        colors[i * 3 + 2] = rgb[2]
        colorRange.add(i)
      }
    }
    const restore = (s: number) => {
      if (s < 0 || s >= cap) return
      renderSizes[s] = sizes[s]
      sizeRange.add(s)
    }

    // colours & sizes: full pass on changes, otherwise only the queued slots ---------
    const fresh = l.geometry !== geometry
    let touched = false
    if (fresh || l.palette !== palette || l.hidden !== hidden || l.filter !== filter || l.mode !== filterMode || sim.dirtyAll) {
      const n = Math.max(end, l.end)
      for (let i = 0; i < n; i++) recolor(i)
      l.geometry = geometry
      l.palette = palette
      l.hidden = hidden
      l.filter = filter
      l.mode = filterMode
      sim.dirtyAll = false
      sim.dirtyCount = 0
      touched = n > 0
    } else if (sim.dirtyCount) {
      for (let k = 0; k < sim.dirtyCount; k++) recolor(sim.dirty[k])
      sim.dirtyCount = 0
      touched = true
    }
    l.end = end

    // hover / selection emphasis: patch just the old and new slots --------------------
    const sel = selectedId != null ? (sim.slotOf(selectedId) ?? -1) : -1
    const hov = hoveredId != null ? (sim.slotOf(hoveredId) ?? -1) : -1
    if (touched || sel !== l.sel || hov !== l.hov) {
      restore(l.hov)
      restore(l.sel)
      if (hov >= 0) {
        renderSizes[hov] = Math.max(sizes[hov], 0.6) * 1.8
        sizeRange.add(hov)
      }
      if (sel >= 0) {
        renderSizes[sel] = 2.2
        sizeRange.add(sel)
      }
      l.hov = hov
      l.sel = sel
    }

    // uploads: only the ranges that changed -------------------------------------------
    colorRange.flush(geometry.getAttribute("color") as THREE.BufferAttribute)
    sizeRange.flush(geometry.getAttribute("size") as THREE.BufferAttribute)
    if (sim.xyzDirtyMax >= sim.xyzDirtyMin) {
      const pos = geometry.getAttribute("position") as THREE.BufferAttribute
      pos.addUpdateRange(sim.xyzDirtyMin * 3, (sim.xyzDirtyMax - sim.xyzDirtyMin + 1) * 3)
      pos.needsUpdate = true
      sim.xyzDirtyMin = Infinity
      sim.xyzDirtyMax = -1
    }
    geometry.setDrawRange(0, end)
    material.uniforms.uSize.value = pointSizeFor(state.camera.position.length() - 1) * dpr
  })

  return <points geometry={geometry} material={material} renderOrder={2} frustumCulled={false} />
}

// ---------------------------------------------------------------------------
// Picking

/** Squared screen distances (CSS px) from the cursor to world points, for hit tests. */
class ScreenProjector {
  private m = new THREE.Matrix4()
  private mx = 0
  private my = 0
  private w = 0
  private h = 0
  /** camera position, for horizon tests */
  cx = 0
  cy = 0
  cz = 0

  constructor(
    private camera: THREE.Camera,
    private el: HTMLElement,
  ) {}

  /** Snapshot the camera and cursor before testing points */
  begin(clientX: number, clientY: number) {
    const rect = this.el.getBoundingClientRect()
    this.mx = clientX - rect.left
    this.my = clientY - rect.top
    this.w = rect.width
    this.h = rect.height
    this.m.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse)
    const c = this.camera.position
    this.cx = c.x
    this.cy = c.y
    this.cz = c.z
  }

  /** points with dot(p, camera) at or below `limit` are behind the horizon */
  facing(x: number, y: number, z: number, limit: number) {
    return x * this.cx + y * this.cy + z * this.cz > limit
  }

  dist2(x: number, y: number, z: number) {
    const e = this.m.elements
    const w = e[3] * x + e[7] * y + e[11] * z + e[15]
    const sx = (((e[0] * x + e[4] * y + e[8] * z + e[12]) / w + 1) / 2) * this.w - this.mx
    const sy = ((1 - (e[1] * x + e[5] * y + e[9] * z + e[13]) / w) / 2) * this.h - this.my
    return sx * sx + sy * sy
  }
}

export function Picker({
  sim, sizesRef, extraRef, onSelect, onHover,
}: {
  sim: Simulation
  sizesRef: RefObject<Float32Array>
  /** markers from other layers, which win over people when both are under the cursor */
  extraRef: RefObject<ExtraPick | null>
  onSelect: (id: number | null) => void
  onHover: (id: number | null) => void
}) {
  const { camera, gl } = useThree()
  const handlers = useRef({ onSelect, onHover })
  useEffect(() => {
    handlers.current = { onSelect, onHover }
  }, [onSelect, onHover])

  useEffect(() => {
    const el = gl.domElement
    const proj = new ScreenProjector(camera, el)
    let down: { x: number; y: number } | null = null
    let frame = 0
    let hovered: number | null = null
    let extraHovered: number | null = null

    const pickExtra = (clientX: number, clientY: number) => {
      const ex = extraRef.current
      if (!ex || !ex.count) return null
      proj.begin(clientX, clientY)
      let best = -1
      let bestD = Infinity
      for (let i = 0; i < ex.count; i++) {
        const x = ex.xyz[i * 3]
        const y = ex.xyz[i * 3 + 1]
        const z = ex.xyz[i * 3 + 2]
        if (!proj.facing(x, y, z, 1.003)) continue
        const d = proj.dist2(x, y, z)
        if (d < ex.radius[i] * ex.radius[i] && d < bestD) {
          bestD = d
          best = i
        }
      }
      return best >= 0 ? best : null
    }

    const pick = (clientX: number, clientY: number) => {
      proj.begin(clientX, clientY)
      const r2 = PERSON_RADIUS * PERSON_RADIUS
      const sizes = sizesRef.current
      const xyz = sim.xyz
      let best = -1
      let bestD = 12 * 12
      for (let i = 0; i < sim.slotEnd; i++) {
        if (!sim.inView[i] || !(sizes[i] > 0.9)) continue
        const x = xyz[i * 3]
        const y = xyz[i * 3 + 1]
        const z = xyz[i * 3 + 2]
        if (!proj.facing(x, y, z, r2)) continue // behind the horizon
        const d = proj.dist2(x, y, z)
        if (d < bestD) {
          bestD = d
          best = i
        }
      }
      return best >= 0 ? sim.people[best]!.id : null
    }

    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY }
    }
    const onUp = (e: PointerEvent) => {
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5) {
        const hit = pickExtra(e.clientX, e.clientY)
        if (hit != null) extraRef.current!.onSelect(hit)
        else handlers.current.onSelect(pick(e.clientX, e.clientY))
      }
      down = null
    }
    const onMove = (e: PointerEvent) => {
      if (e.buttons) return
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const hit = pickExtra(e.clientX, e.clientY)
        if (hit !== extraHovered) {
          extraHovered = hit
          extraRef.current?.onHover(hit)
        }
        const id = hit != null ? null : pick(e.clientX, e.clientY)
        el.style.cursor = hit != null || id != null ? "pointer" : "grab"
        if (id !== hovered) {
          hovered = id
          handlers.current.onHover(id)
        }
      })
    }
    const onLeave = () => {
      cancelAnimationFrame(frame)
      hovered = null
      handlers.current.onHover(null)
      extraHovered = null
      extraRef.current?.onHover(null)
    }
    el.addEventListener("pointerdown", onDown)
    el.addEventListener("pointerup", onUp)
    el.addEventListener("pointermove", onMove)
    el.addEventListener("pointerleave", onLeave)
    return () => {
      cancelAnimationFrame(frame)
      el.removeEventListener("pointerdown", onDown)
      el.removeEventListener("pointerup", onUp)
      el.removeEventListener("pointermove", onMove)
      el.removeEventListener("pointerleave", onLeave)
    }
  }, [camera, gl, sim, sizesRef, extraRef])

  return null
}
