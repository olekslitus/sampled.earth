"use client"

import { useMemo, useRef, useState } from "react"
import * as THREE from "three"
import { useFrame } from "@react-three/fiber"
import { Html } from "@react-three/drei"

import type { Theme } from "@/lib/sim/attributes"
import { COUNTRIES, flagEmoji } from "@/lib/sim/countries"
import type { Simulation } from "@/lib/sim/engine"
import { latLonToXYZ } from "@/lib/sim/sphere"
import { pointSizeFor, visibleRadius } from "./util"

export function SelectionMarker({ sim, id }: { sim: Simulation; id: number }) {
  const ref = useRef<THREE.Mesh>(null)
  const up = useMemo(() => new THREE.Vector3(0, 0, 1), [])
  const n = useMemo(() => new THREE.Vector3(), [])
  useFrame((state) => {
    const mesh = ref.current
    const slot = sim.slotOf(id)
    if (!mesh) return
    mesh.visible = slot !== undefined
    if (slot === undefined) return
    mesh.position.fromArray(sim.xyz, slot * 3)
    n.copy(mesh.position).normalize()
    mesh.visible = n.dot(state.camera.position) > 1
    mesh.quaternion.setFromUnitVectors(up, n)
    // a ring a few pixels wider than the dot, whatever the zoom
    const camera = state.camera as THREE.PerspectiveCamera
    const px = pointSizeFor(camera.position.length() - 1) * 2.6
    const dist = camera.position.distanceTo(mesh.position)
    const world = (px / state.size.height) * 2 * dist * Math.tan(((camera.fov / 2) * Math.PI) / 180)
    const pulse = 1 + Math.sin(state.clock.elapsedTime * 4) * 0.12
    mesh.scale.setScalar(world * pulse)
  })
  return (
    <mesh ref={ref} renderOrder={3}>
      <ringGeometry args={[0.72, 1, 48]} />
      <meshBasicMaterial color="#ffffff" transparent opacity={0.9} side={THREE.DoubleSide} depthTest={false} depthWrite={false} toneMapped={false} />
    </mesh>
  )
}

export function HoverLabel({ sim, id }: { sim: Simulation; id: number }) {
  const ref = useRef<THREE.Group>(null)
  const box = useRef<HTMLDivElement>(null)
  const activity = useRef<HTMLDivElement>(null)
  // the globe does not re-render on its own, so follow the person and their activity here
  useFrame(() => {
    const slot = sim.slotOf(id)
    if (box.current) box.current.style.display = slot === undefined ? "none" : ""
    if (slot === undefined) return
    ref.current?.position.fromArray(sim.xyz, slot * 3)
    const label = sim.blocks[slot]?.label ?? ""
    if (activity.current && activity.current.textContent !== label) activity.current.textContent = label
  })
  const slot = sim.slotOf(id)
  const p = sim.personById(id)
  if (!p || slot === undefined) return null
  return (
    <group ref={ref}>
      <Html style={{ pointerEvents: "none" }} zIndexRange={[20, 0]}>
        <div
          ref={box}
          className="ml-3 -translate-y-1/2 whitespace-nowrap rounded-md border border-border bg-popover/90 px-2 py-1 text-xs text-popover-foreground shadow-lg backdrop-blur"
        >
          <div className="font-medium">
            {flagEmoji(p.country.iso2)} {p.name}, {p.age}
          </div>
          <div ref={activity} className="text-muted-foreground">
            {sim.blocks[slot]?.label}
          </div>
        </div>
      </Html>
    </group>
  )
}

const CITY_POINTS = COUNTRIES.flatMap((c) =>
  c.cities.map((city) => {
    const v = [0, 0, 0]
    latLonToXYZ(city.lat, city.lon, 1.0002, v)
    return { key: `${c.iso2}:${city.name}`, name: city.name, importance: c.population * city.weight, v: new THREE.Vector3(v[0], v[1], v[2]) }
  }),
).sort((a, b) => b.importance - a.importance)

/** City names for orientation once zoomed in. */
export function CityLabels({ theme }: { theme: Theme }) {
  const [visible, setVisible] = useState<typeof CITY_POINTS>([])
  const t = useRef(1)
  const dir = useMemo(() => new THREE.Vector3(), [])
  useFrame((state, delta) => {
    t.current += delta
    if (t.current < 0.25) return
    t.current = 0
    const camera = state.camera as THREE.PerspectiveCamera
    const d = camera.position.length()
    const alt = d - 1
    const next: typeof CITY_POINTS = []
    if (alt < 0.45) {
      const theta = visibleRadius(camera, state.size.width / state.size.height)
      dir.copy(camera.position).divideScalar(d)
      const threshold = Math.max(1 / d + 0.002, Math.cos((theta * 0.92 * Math.PI) / 180))
      const max = alt < 0.08 ? 40 : 24
      // CITY_POINTS is sorted by importance, so the first matches are the ones to show
      for (const c of CITY_POINTS) {
        if (c.v.dot(dir) <= threshold) continue
        next.push(c)
        if (next.length >= max) break
      }
    } else if (!visible.length) return
    setVisible((prev) => (prev.length === next.length && prev.every((c, i) => c === next[i]) ? prev : next))
  })
  return (
    <>
      {visible.map((c) => (
        <Html key={c.key} position={c.v} style={{ pointerEvents: "none" }} zIndexRange={[10, 0]}>
          <div
            className={
              theme === "dark"
                ? "-translate-x-1/2 -translate-y-[130%] whitespace-nowrap text-[11px] font-medium tracking-wide text-white/75 [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]"
                : "-translate-x-1/2 -translate-y-[130%] whitespace-nowrap text-[11px] font-medium tracking-wide text-slate-800 [text-shadow:0_0_3px_rgba(255,255,255,0.95)]"
            }
          >
            {c.name}
          </div>
        </Html>
      ))}
    </>
  )
}
