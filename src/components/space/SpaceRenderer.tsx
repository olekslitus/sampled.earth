"use client"
/* oxlint-disable react/immutability --
 * scenes, cameras and the shared view are mutated imperatively inside the r3f frame loop. */

import { useEffect, useMemo, type RefObject } from "react"
import * as THREE from "three"
import { useFrame } from "@react-three/fiber"

import type { Theme } from "@/lib/sim/attributes"
import type { Simulation } from "@/lib/sim/engine"
import { earthToSky } from "@/lib/space/frames"
import { logStep, type SpaceView } from "./view"

/**
 * One scale of the universe, drawn by its own scene and camera so every scale keeps float32
 * precision. `unit` is the layer's length unit in Earth radii; `relative` layers place their
 * objects relative to the camera themselves (the camera sits at the origin).
 */
export interface SpaceLayer {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  /** drawn in increasing order, after clearing depth: the farthest scales first */
  order: number
  unit: number
  relative: boolean
  /** set by the layer every frame; 0 skips it */
  alpha: number
  /** near and far planes, in the layer's unit, for a camera distance (Earth radii) */
  clip: (dist: number) => [number, number]
}

const layers = new WeakMap<SpaceView, Set<SpaceLayer>>()

/** A scene for one space layer, registered with the renderer for as long as it is mounted */
/**
 * Near and far planes for a layer drawn without depth: they only have to contain what is on
 * screen, but a huge far/near ratio pushes everything onto the far plane, where float32
 * rounding clips it. So keep them around the camera distance.
 */
function clipAround(unit: number, minNear: number, extent: number): SpaceLayer["clip"] {
  return (dist) => {
    const d = dist / unit
    return [Math.max(d * 1e-3, minNear), d * 1e3 + extent * 2]
  }
}

export function useSpaceLayer(
  view: SpaceView,
  opts: { order: number; unit: number; relative?: boolean; clip?: SpaceLayer["clip"]; minNear?: number; extent?: number },
) {
  const layer = useMemo<SpaceLayer>(
    () => ({
      scene: new THREE.Scene(),
      camera: new THREE.PerspectiveCamera(45, 1, 1e-9, 1e9),
      order: opts.order,
      unit: opts.unit,
      relative: opts.relative ?? false,
      alpha: 0,
      clip: opts.clip ?? clipAround(opts.unit, opts.minNear ?? 1e-6, opts.extent ?? 1e6),
    }),
    // a layer's settings never change
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  useEffect(() => {
    let set = layers.get(view)
    if (!set) layers.set(view, (set = new Set()))
    set.add(layer)
    return () => {
      set.delete(layer)
    }
  }, [view, layer])
  return layer
}

const BACKGROUND: Record<Theme, string> = { dark: "#04060c", light: "#e9eef5" }
/** Camera distance beyond which nothing on the globe but the planet itself is drawn */
export const OVERLAYS_HIDE_AT = 30
/** …and beyond which the globe is not drawn at all */
const GLOBE_HIDE_AT = 2e4

/**
 * Updates the clock-dependent parts of the view before anything else runs, then draws every
 * space layer from the largest scale to the smallest, and the globe last.
 */
export function SpaceRenderer({
  sim, view, theme, overlaysRef,
}: {
  sim: Simulation
  view: SpaceView
  theme: Theme
  /** everything drawn on the globe's surface (people, labels…), hidden far out */
  overlaysRef: RefObject<THREE.Group | null>
}) {
  const scratch = useMemo(
    () => ({ bg: new THREE.Color(), themeBg: new THREE.Color(), space: new THREE.Color(BACKGROUND.dark), q: new THREE.Quaternion(), v: new THREE.Vector3(), sorted: [] as SpaceLayer[] }),
    [],
  )

  // the clock: before the camera rig (priority 0) so it sees this frame's sky
  useFrame(() => {
    view.setTime(sim.time)
    earthToSky(view.time, view.earthToSky)
  }, -1)

  useFrame((state) => {
    const { gl, size } = state
    const main = state.camera as THREE.PerspectiveCamera
    const { bg, themeBg, space, q, v, sorted } = scratch

    // camera in the sky frame ----------------------------------------------------
    const dist = main.position.length()
    view.dist = dist
    view.fov = main.fov
    view.width = size.width
    view.height = size.height
    v.copy(main.position).applyMatrix4(view.earthToSky)
    view.cam[0] = view.pivot[0]! + v.x
    view.cam[1] = view.pivot[1]! + v.y
    view.cam[2] = view.pivot[2]! + v.z
    q.setFromRotationMatrix(view.earthToSky)
    view.quat.copy(q).multiply(main.quaternion)

    // backgrounds: the light theme turns to space once you leave the globe -----------
    const alt = dist - 1
    view.space = theme === "dark" ? 1 : logStep(Math.max(alt, 1e-6), 1.6, 12)
    themeBg.set(BACKGROUND[theme])
    bg.copy(themeBg).lerp(space, view.space)
    gl.autoClear = false
    gl.setClearColor(bg, 1)
    gl.clear(true, true, true)

    // the layers, largest scale first ---------------------------------------------------
    sorted.length = 0
    for (const l of layers.get(view) ?? []) if (l.alpha > 0.001) sorted.push(l)
    sorted.sort((a, b) => a.order - b.order)
    for (const l of sorted) {
      const c = l.camera
      if (l.relative) c.position.set(0, 0, 0)
      else c.position.set(view.cam[0]! / l.unit, view.cam[1]! / l.unit, view.cam[2]! / l.unit)
      c.quaternion.copy(view.quat)
      const [near, far] = l.clip(dist)
      const aspect = size.width / size.height
      if (c.near !== near || c.far !== far || c.fov !== main.fov || c.aspect !== aspect) {
        c.near = near
        c.far = far
        c.fov = main.fov
        c.aspect = aspect
        c.updateProjectionMatrix()
      }
      c.updateMatrixWorld()
      gl.render(l.scene, c)
      gl.clearDepth()
    }

    // the globe -------------------------------------------------------------------------
    const nearEarth = Math.hypot(view.pivot[0]!, view.pivot[1]!, view.pivot[2]!) < 1
    if (overlaysRef.current) overlaysRef.current.visible = dist < OVERLAYS_HIDE_AT && nearEarth
    view.globeDrawn = dist < GLOBE_HIDE_AT && nearEarth
    if (view.globeDrawn) gl.render(state.scene, main)

    for (const f of view.afterRender) f()
  }, 1)

  return null
}
