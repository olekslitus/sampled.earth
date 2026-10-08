"use client"

import { useEffect, useMemo } from "react"
import * as THREE from "three"
import { useFrame, useThree } from "@react-three/fiber"

import { SPECIES, SPECIES_BY_KEY, animalPositions, migrationCentre } from "@/lib/sim/animals"
import type { Simulation } from "@/lib/sim/engine"
import { latLonToXYZ } from "@/lib/sim/sphere"
import { FACING_GLSL } from "./util"

const COLS = 8
const ROWS = Math.ceil(SPECIES.length / COLS)
const CELL = 64
const MIGRATION_BASE: [number, number] = [-2.5, 34.9]

let atlas: THREE.CanvasTexture | null = null
function getAtlas() {
  if (atlas) return atlas
  const canvas = document.createElement("canvas")
  canvas.width = COLS * CELL
  canvas.height = ROWS * CELL
  const ctx = canvas.getContext("2d")!
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.font = `${CELL * 0.78}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`
  SPECIES.forEach((s, i) => {
    ctx.fillText(s.emoji, (i % COLS) * CELL + CELL / 2, Math.floor(i / COLS) * CELL + CELL / 2 + CELL * 0.04)
  })
  atlas = new THREE.CanvasTexture(canvas)
  atlas.flipY = false
  atlas.colorSpace = THREE.NoColorSpace
  atlas.generateMipmaps = true
  atlas.minFilter = THREE.LinearMipmapLinearFilter
  return atlas
}

const vertex = /* glsl */ `
  attribute float aPhase;
  attribute float aIcon;
  attribute float aRoam;
  attribute float aMigr;
  uniform float uTime;
  uniform vec3 uMigr;
  uniform float uSize;
  varying float vIcon;
  varying float vAlpha;
  ${FACING_GLSL}
  void main() {
    vec3 n = normalize(position);
    vec3 east = normalize(cross(vec3(0.0, 1.0, 0.0), n) + vec3(1e-6, 0.0, 0.0));
    vec3 north = cross(n, east);
    float t = uTime + aPhase;
    vec3 p = position + (east * sin(t) + north * cos(t * 1.37 + aPhase)) * aRoam + uMigr * aMigr;
    p = normalize(p) * 1.0006;
    float facing = facingOf(p);
    vIcon = aIcon;
    vAlpha = smoothstep(0.0, 0.08, facing);
    if (facing <= 0.0) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      return;
    }
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = uSize;
  }
`
const fragment = /* glsl */ `
  uniform sampler2D uAtlas;
  varying float vIcon;
  varying float vAlpha;
  void main() {
    vec2 cell = vec2(mod(vIcon, ${COLS.toFixed(1)}), floor(vIcon / ${COLS.toFixed(1)}));
    vec4 c = texture2D(uAtlas, (cell + gl_PointCoord) / vec2(${COLS.toFixed(1)}, ${ROWS.toFixed(1)}));
    if (c.a < 0.08) discard;
    gl_FragColor = vec4(c.rgb / max(c.a, 0.001), c.a * vAlpha);
  }
`

/** Emoji icons for the selected species, wandering around their ranges. */
export function AnimalLayer({ sim, species }: { sim: Simulation; species: string[] }) {
  const dpr = useThree((s) => s.viewport.dpr)
  const geometry = useMemo(() => {
    const chosen = species.map((k) => SPECIES_BY_KEY.get(k)).filter((s) => !!s)
    const total = chosen.reduce((a, s) => a + animalPositions(s).count, 0)
    const pos = new Float32Array(total * 3)
    const phase = new Float32Array(total)
    const icon = new Float32Array(total)
    const roam = new Float32Array(total)
    const migr = new Float32Array(total)
    let k = 0
    for (const s of chosen) {
      const a = animalPositions(s)
      const index = SPECIES.indexOf(s)
      for (let i = 0; i < a.count; i++, k++) {
        latLonToXYZ(a.homes[i * 2], a.homes[i * 2 + 1], 1, pos, k * 3)
        phase[k] = ((i * 2654435761) % 1000) / 159.15
        icon[k] = index
        roam[k] = (s.roam * Math.PI) / 180
        migr[k] = s.migrates ? 1 : 0
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3))
    g.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1))
    g.setAttribute("aIcon", new THREE.BufferAttribute(icon, 1))
    g.setAttribute("aRoam", new THREE.BufferAttribute(roam, 1))
    g.setAttribute("aMigr", new THREE.BufferAttribute(migr, 1))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.01)
    return g
  }, [species])
  useEffect(() => () => geometry.dispose(), [geometry])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uSize: { value: 14 },
          uMigr: { value: new THREE.Vector3() },
          uAtlas: { value: getAtlas() },
        },
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
      // the atlas canvas stays cached; three re-uploads it if the layer comes back
      getAtlas().dispose()
    },
    [material],
  )

  const base = useMemo(() => {
    const v = [0, 0, 0]
    latLonToXYZ(MIGRATION_BASE[0], MIGRATION_BASE[1], 1, v)
    return new THREE.Vector3(v[0], v[1], v[2])
  }, [])
  const centre = useMemo(() => [0, 0, 0], [])

  useFrame((state) => {
    const alt = state.camera.position.length() - 1
    material.uniforms.uTime.value = ((sim.time / 3_600_000) % 10_000) * 0.6
    material.uniforms.uSize.value = Math.min(30, Math.max(13, 13 + 4.5 * (-Math.log10(Math.max(alt, 1e-4)) + 0.35))) * dpr
    const [lat, lon] = migrationCentre(sim.time)
    latLonToXYZ(lat, lon, 1, centre)
    ;(material.uniforms.uMigr.value as THREE.Vector3).set(centre[0] - base.x, centre[1] - base.y, centre[2] - base.z)
  })

  if (!species.length) return null
  return <points geometry={geometry} material={material} renderOrder={5} frustumCulled={false} />
}
