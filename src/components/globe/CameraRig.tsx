"use client"
/* oxlint-disable react/immutability --
 * the camera, controls and the simulation are mutated imperatively inside the r3f frame loop. */

import { useEffect, useMemo, useRef, type RefObject } from "react"
import * as THREE from "three"
import { useFrame, useThree } from "@react-three/fiber"

import type { SpaceView } from "@/components/space/view"
import { logStep } from "@/components/space/view"
import type { Simulation, View } from "@/lib/sim/engine"
import { angularDistance, makeRegion } from "@/lib/sim/region"
import { latLonToXYZ, xyzToLatLon } from "@/lib/sim/sphere"
import { earthSpinAngle } from "@/lib/space/frames"
import { visibleRadius } from "./util"

export type FlyTarget = { kind: "person"; id: number } | { kind: "point"; lat: number; lon: number; alt: number }

/** Closest the camera may get: ~16 km above the surface */
export const MIN_ALTITUDE = 0.0025
/** Farthest: beyond the edge of the observable universe (≈150 billion light-years) */
const MAX_ALTITUDE = 2.2e20
/** Below this visible radius (degrees) extra people are spawned in view */
const DETAIL_ON_RADIUS = 26
const DETAIL_OFF_RADIUS = 32

/** 0 when zoomed right in (real distances) → 1 when far out (full exaggeration) */
function exaggerationFor(alt: number) {
  return Math.min(1, Math.max(0, (alt - 0.03) / 0.6))
}

/** Steps the simulation each frame and spawns people for the area in view once the camera settles. */
export function SimDriver({
  sim, speedRef, detailEnabled, altitudeRef,
}: {
  sim: Simulation
  speedRef: RefObject<number>
  detailEnabled: boolean
  altitudeRef: RefObject<number>
}) {
  const check = useRef({ t: 0, dir: new THREE.Vector3(), dist: 0 })
  const scratch = useMemo(() => ({ dir: new THREE.Vector3(), view: { x: 0, y: 0, z: 1, threshold: 0 } as View }), [])
  useEffect(() => {
    if (!detailEnabled && sim.region) sim.setDetailRegion(null)
  }, [sim, detailEnabled])

  useFrame((state, delta) => {
    const camera = state.camera as THREE.PerspectiveCamera
    const d = camera.position.length()
    const alt = d - 1
    altitudeRef.current = alt
    const theta = visibleRadius(camera, state.size.width / state.size.height)
    const { dir, view } = scratch
    dir.copy(camera.position).divideScalar(d)
    view.x = dir.x
    view.y = dir.y
    view.z = dir.z
    view.threshold = Math.max(1 / d - 0.002, Math.cos(((theta * 1.08 + 0.3) * Math.PI) / 180))
    sim.step(Math.min(delta, 0.1), speedRef.current ?? 1, view, exaggerationFor(alt))

    // spawn / despawn people for the area in view once the camera settles ---------
    const c = check.current
    c.t += delta
    if (c.t < 0.3) return
    const moved = (c.dir.angleTo(dir) * 180) / Math.PI
    const zoomed = Math.abs(Math.log((alt + 1e-6) / (c.dist - 1 + 1e-6)))
    c.t = 0
    c.dir.copy(dir)
    c.dist = d
    if (moved > theta * 0.15 || zoomed > 0.12) return // still moving

    if (!detailEnabled) return
    const current = sim.region
    if (theta > DETAIL_OFF_RADIUS || (!current && theta > DETAIL_ON_RADIUS)) {
      if (current) sim.setDetailRegion(null)
      return
    }
    const [lat, lon] = xyzToLatLon(dir.x, dir.y, dir.z)
    const radius = theta * 1.1 + 0.002
    if (current) {
      const shift = angularDistance(current.lat, current.lon, lat, lon)
      const ratio = radius / current.radius
      if (shift < current.radius * 0.2 && ratio > 0.72 && ratio < 1.35) return
    }
    // (the simulation remembers regions it turned down, so re-asking is cheap)
    sim.setDetailRegion(makeRegion(lat, lon, radius))
  })
  return null
}

// ---------------------------------------------------------------------------
// Camera: altitude-based zoom (wheel / pinch, towards the cursor), fly-to, follow, and the
// zoom out into space (flights between scales; far out the camera holds still in the sky
// while Earth turns under it)

export function CameraRig({
  sim, selectedId, follow, flyToRef, autoRotate, space,
}: {
  sim: Simulation
  selectedId: number | null
  follow: boolean
  flyToRef: RefObject<FlyTarget | null>
  autoRotate: boolean
  space: SpaceView
}) {
  const { camera, gl } = useThree()
  const controls = useThree((s) => s.controls) as { rotateSpeed: number; autoRotate: boolean; autoRotateSpeed: number } | null
  const targetAlt = useRef(camera.position.length() - 1)
  const scratch = useMemo(() => ({ target: new THREE.Vector3(), dir: new THREE.Vector3(), v: [0, 0, 0], spin: NaN, yAxis: new THREE.Vector3(0, 1, 0), toEarth: new THREE.Matrix4() }), [])

  useEffect(() => {
    const el = gl.domElement
    const raycaster = new THREE.Raycaster()
    const sphere = new THREE.Sphere(new THREE.Vector3(), 1)
    const hit = new THREE.Vector3()
    const axis = new THREE.Vector3()
    const from = new THREE.Vector3()
    const ndc = new THREE.Vector2()

    const zoomBy = (factor: number, clientX: number, clientY: number) => {
      // a wheel or pinch takes over from a flight
      if (space.flight) {
        space.flight = null
        targetAlt.current = camera.position.length() - 1
      }
      const before = targetAlt.current
      // out in space each step covers more ground, so the way to the edge isn't endless
      const boost = 1 + 0.6 * logStep(Math.max(before, 1e-6), 3, 40)
      factor = Math.pow(factor, boost)
      const min = space.focus ? Math.max(MIN_ALTITUDE, space.focus.dist * 0.3) : MIN_ALTITUDE
      targetAlt.current = Math.min(MAX_ALTITUDE, Math.max(min, before * factor))
      const f = targetAlt.current / before
      if (f >= 1 || space.focus) return
      // zoom towards the point under the cursor
      const rect = el.getBoundingClientRect()
      ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(ndc, camera)
      if (!raycaster.ray.intersectSphere(sphere, hit)) return
      from.copy(camera.position).normalize()
      const to = hit.normalize()
      const angle = from.angleTo(to) * (1 - f) * 0.9
      if (angle < 1e-7) return
      axis.crossVectors(from, to).normalize()
      camera.position.applyAxisAngle(axis, angle)
      camera.lookAt(0, 0, 0)
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const delta = Math.max(-300, Math.min(300, e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY))
      zoomBy(Math.exp(delta * 0.0018), e.clientX, e.clientY)
    }

    const touches = new Map<number, { x: number; y: number }>()
    let pinch = 0
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === "touch") touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
    }
    const onPointerMove = (e: PointerEvent) => {
      const t = touches.get(e.pointerId)
      if (!t) return
      t.x = e.clientX
      t.y = e.clientY
      if (touches.size !== 2) return
      const [a, b] = [...touches.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      if (pinch) zoomBy(pinch / dist, (a.x + b.x) / 2, (a.y + b.y) / 2)
      pinch = dist
    }
    const onPointerUp = (e: PointerEvent) => {
      touches.delete(e.pointerId)
      if (touches.size < 2) pinch = 0
    }

    el.addEventListener("wheel", onWheel, { passive: false })
    el.addEventListener("pointerdown", onPointerDown)
    el.addEventListener("pointermove", onPointerMove)
    el.addEventListener("pointerup", onPointerUp)
    el.addEventListener("pointercancel", onPointerUp)
    return () => {
      el.removeEventListener("wheel", onWheel)
      el.removeEventListener("pointerdown", onPointerDown)
      el.removeEventListener("pointermove", onPointerMove)
      el.removeEventListener("pointerup", onPointerUp)
      el.removeEventListener("pointercancel", onPointerUp)
    }
  }, [camera, gl, space])

  useFrame((state, delta) => {
    const cam = state.camera as THREE.PerspectiveCamera
    const { target, dir, v } = scratch

    // far out, hold still in the sky while Earth turns underneath ------------------------
    const spin = earthSpinAngle(space.time)
    if (Number.isFinite(scratch.spin)) {
      let d = spin - scratch.spin
      d -= Math.round(d / (2 * Math.PI)) * 2 * Math.PI
      const still = space.focus ? 1 : logStep(Math.max(cam.position.length() - 1, 1e-6), 6, 60)
      if (still > 0) cam.position.applyAxisAngle(scratch.yAxis, -d * still)
    }
    scratch.spin = spin

    // fly-to (a person or a place) and follow steer the camera direction --------
    let fly = flyToRef.current
    // a place on Earth picked while out in space: fly home first
    if (fly && !space.flight && (space.focus || cam.position.length() > 40)) {
      space.flyTo(null, 1 + (fly.kind === "point" ? fly.alt : 0.9))
    }
    if (space.flight) fly = null
    let aim = false
    let flyAlt = 0.9
    if (fly?.kind === "point") {
      latLonToXYZ(fly.lat, fly.lon, 1, v)
      target.set(v[0], v[1], v[2])
      flyAlt = fly.alt
      aim = true
    } else {
      const id = fly?.kind === "person" ? fly.id : follow ? selectedId : null
      const slot = id != null ? sim.slotOf(id) : undefined
      if (fly && slot === undefined) flyToRef.current = null
      if (slot !== undefined) {
        target.fromArray(sim.xyz, slot * 3).normalize()
        aim = true
      }
    }
    if (aim) {
      dir.copy(cam.position).normalize()
      const k = 1 - Math.exp(-delta * (fly ? 3.5 : 2.5))
      dir.lerp(target, k).normalize()
      const length = cam.position.length()
      cam.position.copy(dir).multiplyScalar(length)
      if (fly) {
        targetAlt.current = fly.kind === "point" ? flyAlt : Math.min(targetAlt.current, flyAlt)
        if (dir.angleTo(target) < 0.002 && Math.abs(cam.position.length() - 1 - targetAlt.current) < targetAlt.current * 0.05) flyToRef.current = null
      }
    }

    // a flight may also swing the camera round to a better side
    const look = space.flight?.look
    if (look) {
      target.set(look[0]!, look[1]!, look[2]!).applyMatrix4(scratch.toEarth.copy(space.earthToSky).invert())
      const length = cam.position.length()
      dir.copy(cam.position).normalize().lerp(target, 1 - Math.exp(-delta * 2.2)).normalize()
      cam.position.copy(dir).multiplyScalar(length)
    }

    // smooth altitude changes, or a flight between scales ----------------------------
    const alt = Math.max(MIN_ALTITUDE * 0.5, cam.position.length() - 1)
    const flightDist = space.stepFlight(delta, space.pivot)
    let nextAlt: number
    if (flightDist != null) {
      nextAlt = Math.max(MIN_ALTITUDE, flightDist - 1)
      targetAlt.current = nextAlt
    } else {
      nextAlt = Math.exp(Math.log(alt) + (Math.log(targetAlt.current) - Math.log(alt)) * (1 - Math.exp(-delta * 9)))
    }
    cam.position.setLength(1 + nextAlt)
    cam.lookAt(0, 0, 0)
    if (flightDist == null) space.restingPivot(1 + nextAlt, space.pivot)

    // keep depth precision and controls sensible at every altitude ---------------
    const near = Math.min(0.1, Math.max(0.0004, nextAlt * 0.3))
    // (the Moon is 60 Earth radii out)
    const far = Math.max(300, (1 + nextAlt) * 3)
    if (Math.abs(near - cam.near) / cam.near > 0.1 || Math.abs(far - cam.far) / cam.far > 0.1) {
      cam.near = near
      cam.far = far
      cam.updateProjectionMatrix()
    }
    if (controls) {
      // dragging moves the globe about as far as the cursor: the closer, the slower it turns
      const span = (2 * visibleRadius(cam, state.size.width / state.size.height, true) * Math.PI) / 180
      controls.rotateSpeed = Math.min(0.8, Math.max(0.0008, (span / (2 * Math.PI)) * 0.9))
      controls.autoRotate = autoRotate && !space.flight
      controls.autoRotateSpeed = 0.3 * Math.min(1, nextAlt / 2.2)
    }
  })
  return null
}
