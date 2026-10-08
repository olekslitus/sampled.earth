"use client"

import { useEffect, useMemo } from "react"
import * as THREE from "three"
import { useFrame, useThree } from "@react-three/fiber"

import { ANIMAL_COLORS, SPECIES_BY_KEY, SPECIES_MARKER, animalPositions, migrationCentre } from "@/lib/sim/animals"
import type { Theme } from "@/lib/sim/attributes"
import type { Simulation } from "@/lib/sim/engine"
import { latLonToXYZ } from "@/lib/sim/sphere"
import { FACING_GLSL, hexToRgb } from "./util"

const MIGRATION_BASE: [number, number] = [-2.5, 34.9]
/** separates markers from the map and from each other */
const OUTLINE: Record<Theme, string> = { dark: "#0b1020", light: "#ffffff" }

const vertex = /* glsl */ `
  attribute float aPhase;
  attribute float aShape;
  attribute float aColor;
  attribute float aRoam;
  attribute float aMigr;
  uniform float uTime;
  uniform vec3 uMigr;
  uniform float uSize;
  varying float vShape;
  varying float vColor;
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
    vShape = aShape;
    vColor = aColor;
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
// Signed distances (negative inside) on a -1…1 box with y up; shapes after Inigo Quilez.
const fragment = /* glsl */ `
  uniform vec3 uPalette[${ANIMAL_COLORS.dark.length}];
  uniform vec3 uOutline;
  varying float vShape;
  varying float vColor;
  varying float vAlpha;
  float sdBox(vec2 p, float b, float r) {
    vec2 q = abs(p) - vec2(b - r);
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }
  float sdTriangle(vec2 p, float r) {
    const float k = 1.7320508;
    p.x = abs(p.x) - r;
    p.y = p.y + r / k;
    if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
    p.x -= clamp(p.x, -2.0 * r, 0.0);
    return -length(p) * sign(p.y);
  }
  float sdHexagon(vec2 p, float r) {
    const vec3 k = vec3(-0.8660254, 0.5, 0.57735027);
    p = abs(p);
    p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
    p -= vec2(clamp(p.x, -k.z * r, k.z * r), r);
    return length(p) * sign(p.y);
  }
  float sdStar(vec2 p, float r, float rf) {
    const vec2 k1 = vec2(0.809016994, -0.587785252);
    const vec2 k2 = vec2(-k1.x, k1.y);
    p.x = abs(p.x);
    p -= 2.0 * max(dot(k1, p), 0.0) * k1;
    p -= 2.0 * max(dot(k2, p), 0.0) * k2;
    p.x = abs(p.x);
    p.y -= r;
    vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);
    float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
    return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
  }
  float sdPlus(vec2 p, vec2 b) {
    p = abs(p);
    p = (p.y > p.x) ? p.yx : p.xy;
    vec2 q = p - b;
    float k = max(q.y, q.x);
    vec2 w = (k > 0.0) ? q : vec2(b.y - p.x, -k);
    return sign(k) * length(max(w, 0.0));
  }
  vec3 paletteAt(float i) {
    vec3 c = uPalette[0];
    for (int k = 1; k < ${ANIMAL_COLORS.dark.length}; k++) if (float(k) == i) c = uPalette[k];
    return c;
  }
  void main() {
    vec2 p = (gl_PointCoord - 0.5) * 2.0;
    p.y = -p.y;
    float d;
    if (vShape < 0.5) d = sdBox(p, 0.66, 0.14);
    else if (vShape < 1.5) d = sdTriangle(p + vec2(0.0, 0.23), 0.8);
    else if (vShape < 2.5) d = sdHexagon(p, 0.66);
    else if (vShape < 3.5) d = (abs(p.x) + abs(p.y) - 0.76) * 0.70710678;
    else if (vShape < 4.5) d = sdStar(p + vec2(0.0, 0.08), 0.8, 0.45);
    else d = sdPlus(p, vec2(0.72, 0.26));
    const float aa = 0.07;
    const float outline = 0.16;
    float fill = 1.0 - smoothstep(-aa, aa, d);
    float shape = 1.0 - smoothstep(outline - aa, outline + aa, d);
    if (shape < 0.02) discard;
    gl_FragColor = vec4(mix(uOutline, paletteAt(vColor), fill), shape * vAlpha);
  }
`

/** One marker per (sampled) animal of the selected species, wandering around their ranges. */
export function AnimalLayer({ sim, species, theme }: { sim: Simulation; species: string[]; theme: Theme }) {
  const dpr = useThree((s) => s.viewport.dpr)
  const geometry = useMemo(() => {
    const chosen = species.map((k) => SPECIES_BY_KEY.get(k)).filter((s) => !!s)
    const total = chosen.reduce((a, s) => a + animalPositions(s).count, 0)
    const pos = new Float32Array(total * 3)
    const phase = new Float32Array(total)
    const shape = new Float32Array(total)
    const color = new Float32Array(total)
    const roam = new Float32Array(total)
    const migr = new Float32Array(total)
    let k = 0
    for (const s of chosen) {
      const a = animalPositions(s)
      const marker = SPECIES_MARKER.get(s.key)!
      for (let i = 0; i < a.count; i++, k++) {
        latLonToXYZ(a.homes[i * 2], a.homes[i * 2 + 1], 1, pos, k * 3)
        phase[k] = ((i * 2654435761) % 1000) / 159.15
        shape[k] = marker.shape
        color[k] = marker.color
        roam[k] = (s.roam * Math.PI) / 180
        migr[k] = s.migrates ? 1 : 0
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3))
    g.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1))
    g.setAttribute("aShape", new THREE.BufferAttribute(shape, 1))
    g.setAttribute("aColor", new THREE.BufferAttribute(color, 1))
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
          uPalette: { value: ANIMAL_COLORS.dark.map(() => new THREE.Vector3()) },
          uOutline: { value: new THREE.Vector3() },
        },
        vertexShader: vertex,
        fragmentShader: fragment,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])
  useEffect(() => {
    const colors = ANIMAL_COLORS[theme]
    ;(material.uniforms.uPalette.value as THREE.Vector3[]).forEach((v, i) => v.set(...hexToRgb(colors[i])))
    ;(material.uniforms.uOutline.value as THREE.Vector3).set(...hexToRgb(OUTLINE[theme]))
  }, [material, theme])

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
