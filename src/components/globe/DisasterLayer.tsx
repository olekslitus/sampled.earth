"use client"
/* eslint-disable react-hooks/immutability -- uniforms and buffers are updated imperatively in the frame loop */

import { useEffect, useMemo, useRef, useState, type RefObject } from "react"
import * as THREE from "three"
import { useFrame, useThree } from "@react-three/fiber"
import { Html } from "@react-three/drei"

import type { AlertLevel, Disaster, DisasterKind } from "@/lib/disasters"
import type { Theme } from "@/lib/sim/attributes"
import { latLonToXYZ } from "@/lib/sim/sphere"
import { FACING_GLSL, hexToRgb } from "./util"

/** Status colours (paired with a label wherever they appear) */
export const ALERT_COLOR: Record<AlertLevel, string> = { Green: "#0ca30c", Orange: "#ec835a", Red: "#d03b3b" }
export const KIND_EMOJI: Record<DisasterKind, string> = {
  Earthquake: "", "Tropical cyclone": "🌀", Flood: "🌊", Wildfire: "🔥", Volcano: "🌋", Drought: "🏜️", "Severe storm": "⛈️", Iceberg: "🧊",
}
const ICON_KINDS = (Object.keys(KIND_EMOJI) as DisasterKind[]).filter((k) => KIND_EMOJI[k])
/** quake rings without an alert level: high-contrast ink rather than a status colour */
const INK: Record<Theme, string> = { dark: "#e8e6df", light: "#2c313b" }
const TRACK: Record<Theme, string> = { dark: "#c3c2b7", light: "#52514e" }

/** Lets the shared picker hit-test disasters before people */
export interface ExtraPick {
  xyz: Float32Array
  count: number
  /** hit radius in CSS pixels */
  radius: Float32Array
  onSelect: (i: number) => void
  onHover: (i: number | null) => void
}

const CELL = 64
let atlas: THREE.CanvasTexture | null = null
function getAtlas() {
  if (atlas) return atlas
  const canvas = document.createElement("canvas")
  canvas.width = ICON_KINDS.length * CELL
  canvas.height = CELL
  const ctx = canvas.getContext("2d")!
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.font = `${CELL * 0.72}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`
  ICON_KINDS.forEach((k, i) => ctx.fillText(KIND_EMOJI[k], i * CELL + CELL / 2, CELL / 2 + CELL * 0.04))
  atlas = new THREE.CanvasTexture(canvas)
  atlas.flipY = false
  atlas.colorSpace = THREE.NoColorSpace
  atlas.minFilter = THREE.LinearMipmapLinearFilter
  return atlas
}

const vertex = /* glsl */ `
  attribute float aSize;
  attribute float aIcon;
  attribute float aAge;
  attribute vec3 aColor;
  attribute float aRing;
  uniform float uScale;
  varying float vIcon;
  varying float vAge;
  varying vec3 vColor;
  varying float vRing;
  varying float vAlpha;
  ${FACING_GLSL}
  void main() {
    float facing = facingOf(position);
    vIcon = aIcon;
    vAge = aAge;
    vColor = aColor;
    vRing = aRing;
    // older events fade back
    vAlpha = smoothstep(0.0, 0.08, facing) * mix(1.0, 0.45, clamp(aAge / 30.0, 0.0, 1.0));
    if (facing <= 0.0) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      return;
    }
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale;
  }
`
const fragment = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform float uTime;
  varying float vIcon;
  varying float vAge;
  varying vec3 vColor;
  varying float vRing;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c) * 2.0;
    if (d > 1.0) discard;
    vec4 col = vec4(0.0);
    if (vIcon < 0.0) {
      // earthquake: ring + centre dot, with a ripple for the last day's quakes
      float ring = 1.0 - smoothstep(0.0, 0.12, abs(d - 0.82));
      float dot = 1.0 - smoothstep(0.16, 0.26, d);
      float a = max(ring * 0.9, dot);
      if (vAge < 1.0) {
        float w = fract(uTime * 0.5);
        a = max(a, (1.0 - smoothstep(0.0, 0.1, abs(d - w))) * (1.0 - w) * 0.8);
      }
      col = vec4(vColor, a);
    } else {
      vec2 uv = (gl_PointCoord - 0.5) / 0.74 + 0.5;
      vec4 icon = vec4(0.0);
      if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) {
        icon = texture2D(uAtlas, vec2((vIcon + uv.x) / ${ICON_KINDS.length.toFixed(1)}, uv.y));
        icon.rgb /= max(icon.a, 0.001);
      }
      float halo = vRing * (1.0 - smoothstep(0.0, 0.1, abs(d - 0.9)));
      col = mix(vec4(vColor, halo), vec4(icon.rgb, 1.0), icon.a);
      col.a = max(halo, icon.a);
    }
    if (col.a < 0.03) discard;
    gl_FragColor = vec4(col.rgb, col.a * vAlpha);
  }
`

export function DisasterLayer({
  events, fetchedAt: now, theme, pickRef, selectedId, onPick,
}: {
  events: Disaster[]
  /** ages are measured from when the feed was fetched */
  fetchedAt: number
  theme: Theme
  pickRef: RefObject<ExtraPick | null>
  selectedId: string | null
  onPick: (d: Disaster) => void
}) {
  const dpr = useThree((s) => s.viewport.dpr)
  const [hovered, setHovered] = useState<number | null>(null)

  const { geometry, xyz, radius } = useMemo(() => {
    const n = events.length
    const xyz = new Float32Array(n * 3)
    const size = new Float32Array(n)
    const icon = new Float32Array(n)
    const age = new Float32Array(n)
    const color = new Float32Array(n * 3)
    const ring = new Float32Array(n)
    const radius = new Float32Array(n)
    const ink = hexToRgb(INK[theme])
    events.forEach((d, i) => {
      latLonToXYZ(d.lat, d.lon, 1.0015, xyz, i * 3)
      const quake = d.kind === "Earthquake"
      size[i] = quake ? 7 + Math.max(0, (d.magnitude ?? 4.5) - 4.5) * 7 : d.notable ? 22 : 17
      icon[i] = quake ? -1 : ICON_KINDS.indexOf(d.kind)
      age[i] = Math.max(0, (now - d.updated) / 86_400_000)
      const rgb = d.alert ? hexToRgb(ALERT_COLOR[d.alert]) : ink
      color.set(rgb, i * 3)
      ring[i] = d.alert ? 1 : 0
      radius[i] = Math.max(9, size[i] * 0.6)
    })
    const g = new THREE.BufferGeometry()
    g.setAttribute("position", new THREE.BufferAttribute(xyz, 3))
    g.setAttribute("aSize", new THREE.BufferAttribute(size, 1))
    g.setAttribute("aIcon", new THREE.BufferAttribute(icon, 1))
    g.setAttribute("aAge", new THREE.BufferAttribute(age, 1))
    g.setAttribute("aColor", new THREE.BufferAttribute(color, 3))
    g.setAttribute("aRing", new THREE.BufferAttribute(ring, 1))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.01)
    return { geometry: g, xyz, radius }
  }, [events, theme, now])
  useEffect(() => () => geometry.dispose(), [geometry])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uScale: { value: 1 }, uTime: { value: 0 }, uAtlas: { value: getAtlas() } },
        vertexShader: vertex,
        fragmentShader: fragment,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    [],
  )
  useEffect(
    () => () => {
      material.dispose()
      getAtlas().dispose()
    },
    [material],
  )

  // storm and iceberg tracks
  const tracks = useMemo(() => {
    const segs: number[] = []
    const v = [0, 0, 0]
    const w = [0, 0, 0]
    for (const d of events) {
      if (!d.track) continue
      for (let k = 1; k < d.track.length; k++) {
        latLonToXYZ(d.track[k - 1][0], d.track[k - 1][1], 1.001, v)
        latLonToXYZ(d.track[k][0], d.track[k][1], 1.001, w)
        segs.push(...v, ...w)
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(segs), 3))
    return g
  }, [events])
  useEffect(() => () => tracks.dispose(), [tracks])

  // register with the picker
  const pick = useRef({ onPick, events })
  useEffect(() => {
    pick.current = { onPick, events }
  }, [onPick, events])
  useEffect(() => {
    pickRef.current = {
      xyz, radius, count: events.length,
      onSelect: (i) => pick.current.onPick(pick.current.events[i]),
      onHover: (i) => setHovered((h) => (h === i ? h : i)),
    }
    return () => {
      pickRef.current = null
    }
  }, [pickRef, xyz, radius, events.length])

  useFrame((state) => {
    const alt = state.camera.position.length() - 1
    material.uniforms.uTime.value = state.clock.elapsedTime
    // a touch larger when zoomed in
    material.uniforms.uScale.value = Math.min(1.6, Math.max(0.8, 1 + 0.3 * -Math.log10(Math.max(alt, 0.01)))) * dpr
  })

  const labelled = useMemo(() => events.map((d, i) => [d, i] as const).filter(([d]) => d.notable), [events])
  const hoverEvent = hovered != null ? events[hovered] : null

  return (
    <>
      <lineSegments geometry={tracks} renderOrder={3}>
        <lineBasicMaterial color={TRACK[theme]} transparent opacity={0.7} depthWrite={false} />
      </lineSegments>
      <points geometry={geometry} material={material} renderOrder={6} frustumCulled={false} />
      {labelled.map(([d]) => (
        <DisasterLabel key={d.id} d={d} active={d.id === selectedId} onPick={onPick} />
      ))}
      {hoverEvent && !hoverEvent.notable && <DisasterLabel key={`hover-${hoverEvent.id}`} d={hoverEvent} active onPick={onPick} />}
    </>
  )
}

function DisasterLabel({ d, active, onPick }: { d: Disaster; active: boolean; onPick: (d: Disaster) => void }) {
  const ref = useRef<HTMLButtonElement>(null)
  const position = useMemo(() => {
    const v = [0, 0, 0]
    latLonToXYZ(d.lat, d.lon, 1.002, v)
    return new THREE.Vector3(v[0], v[1], v[2])
  }, [d])
  const n = useMemo(() => position.clone().normalize(), [position])
  const tmp = useMemo(() => new THREE.Vector3(), [])
  useFrame((state) => {
    const el = ref.current
    if (!el) return
    const cam = state.camera.position
    const facing = n.dot(tmp.copy(cam).sub(position).normalize())
    const alt = cam.length() - 1
    // severe events are always labelled; the rest once zoomed in a little
    const show = facing > 0.05 && (active || d.alert === "Red" || d.alert === "Orange" || alt < 1.2)
    el.style.opacity = show ? "1" : "0"
    el.style.pointerEvents = show ? "auto" : "none"
  })
  const short = d.kind === "Earthquake" ? `M ${d.magnitude?.toFixed(1)}` : d.title.replace(/^Tropical cyclone /, "")
  return (
    <Html position={position} zIndexRange={[16, 0]}>
      <button
        ref={ref}
        onClick={() => onPick(d)}
        title={d.title}
        className="flex max-w-[16rem] translate-x-3 -translate-y-1/2 items-center gap-1 rounded-full border border-border bg-popover/85 px-2 py-0.5 text-[11px] whitespace-nowrap text-popover-foreground shadow-sm backdrop-blur transition-opacity hover:bg-popover"
      >
        {d.alert && <span className="size-2 shrink-0 rounded-full" style={{ background: ALERT_COLOR[d.alert] }} />}
        <span className="truncate font-medium">{short}</span>
        {d.alert && <span className="text-muted-foreground">· {d.alert}</span>}
      </button>
    </Html>
  )
}
