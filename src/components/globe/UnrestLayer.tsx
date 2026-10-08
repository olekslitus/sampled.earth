"use client"
/* oxlint-disable react/immutability -- uniforms and label styles are updated imperatively in the frame loop */

import { useEffect, useMemo, useRef } from "react"
import * as THREE from "three"
import { useFrame } from "@react-three/fiber"
import { Html } from "@react-three/drei"
import { Megaphone, Swords, TriangleAlert, type LucideIcon } from "lucide-react"

import { latLonToXYZ } from "@/lib/sim/sphere"
import { HOTSPOTS, type Hotspot, type UnrestLevel } from "@/lib/sim/unrest"
import { hexToRgb } from "./util"

/** Status colours (never reused for data series); always paired with an icon and label */
export const LEVEL_STYLE: Record<UnrestLevel, { color: string; icon: LucideIcon }> = {
  War: { color: "#d03b3b", icon: Swords },
  "Armed conflict": { color: "#ec835a", icon: TriangleAlert },
  Unrest: { color: "#fab219", icon: Megaphone },
}

const vertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const fragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uPhase;
  varying vec2 vUv;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    if (d > 1.0) discard;
    float glow = (1.0 - smoothstep(0.0, 1.0, d)) * 0.35;
    float wave = fract(uTime * 0.35 + uPhase);
    float ring = (1.0 - smoothstep(0.0, 0.07, abs(d - wave))) * (1.0 - wave) * 0.8;
    gl_FragColor = vec4(uColor, max(glow, ring));
  }
`

function HotspotDisc({ spot, index }: { spot: Hotspot; index: number }) {
  const { position, quaternion, material, size } = useMemo(() => {
    const v = [0, 0, 0]
    latLonToXYZ(spot.lat, spot.lon, 1.0012, v)
    const position = new THREE.Vector3(v[0], v[1], v[2])
    const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), position.clone().normalize())
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Vector3(...hexToRgb(LEVEL_STYLE[spot.level].color)) },
        uTime: { value: 0 },
        uPhase: { value: (index * 0.37) % 1 },
      },
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    return { position, quaternion, material, size: Math.sin((spot.radius * Math.PI) / 180) }
  }, [spot, index])
  useEffect(() => () => material.dispose(), [material])
  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime
  })
  return (
    <mesh position={position} quaternion={quaternion} material={material} renderOrder={1}>
      <circleGeometry args={[size, 48]} />
    </mesh>
  )
}

function HotspotLabel({ spot, onPick }: { spot: Hotspot; onPick: (s: Hotspot) => void }) {
  const ref = useRef<HTMLButtonElement>(null)
  const { position, normal, tmp } = useMemo(() => {
    const v = [0, 0, 0]
    latLonToXYZ(spot.lat, spot.lon, 1.002, v)
    const position = new THREE.Vector3(v[0], v[1], v[2])
    return { position, normal: position.clone().normalize(), tmp: new THREE.Vector3() }
  }, [spot])
  useFrame((state) => {
    const el = ref.current
    if (!el) return
    const cam = state.camera.position
    const facing = normal.dot(tmp.copy(cam).sub(position).normalize())
    const alt = cam.length() - 1
    // wars are always labelled; smaller hotspots once zoomed in a little
    const show = facing > 0.05 && (spot.level === "War" || alt < 0.7)
    el.style.opacity = show ? "1" : "0"
    el.style.pointerEvents = show ? "auto" : "none"
  })
  const style = LEVEL_STYLE[spot.level]
  return (
    <Html position={position} zIndexRange={[15, 0]}>
      <button
        ref={ref}
        onClick={() => onPick(spot)}
        title={`${spot.level}: ${spot.summary}`}
        className="flex -translate-x-1/2 -translate-y-[140%] items-center gap-1 whitespace-nowrap rounded-full border border-border bg-popover/85 px-2 py-0.5 text-[11px] text-popover-foreground shadow-sm backdrop-blur transition-opacity hover:bg-popover"
      >
        <style.icon className="size-3 shrink-0" style={{ color: style.color }} strokeWidth={2.5} aria-hidden />
        <span className="font-medium">{spot.name}</span>
        <span className="text-muted-foreground">· {spot.level}</span>
      </button>
    </Html>
  )
}

export function UnrestLayer({ onPick }: { onPick: (s: Hotspot) => void }) {
  return (
    <>
      {HOTSPOTS.map((s, i) => (
        <HotspotDisc key={s.name} spot={s} index={i} />
      ))}
      {HOTSPOTS.map((s) => (
        <HotspotLabel key={s.name} spot={s} onPick={onPick} />
      ))}
    </>
  )
}
