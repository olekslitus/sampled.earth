"use client"
/* oxlint-disable react/immutability --
 * tile meshes, materials and the cache are managed imperatively inside the r3f frame loop. */

import { useEffect, useMemo } from "react"
import * as THREE from "three"
import { useFrame } from "@react-three/fiber"

import type { Simulation } from "@/lib/sim/engine"
import { latLonToXYZ } from "@/lib/sim/sphere"
import { loadImageTexture, releaseImageTexture, SATELLITE_SHADING } from "./satellite"
import { blueMarbleTiles, NIGHT_TILES, SENTINEL_TILES, tileBounds, tileDegrees, type TileSource } from "./tiles"

const vertex = /* glsl */ `
  // the tile's place on the full sphere: phi start, phi length, theta start, theta length
  uniform vec4 rect;
  varying vec2 vUv;
  varying vec2 vGlobalUv;
  varying vec3 vNormal;
  varying float vFacing;
  void main() {
    vUv = uv;
    vGlobalUv = vec2((rect.x + uv.x * rect.y) / 6.28318531, 1.0 - (rect.z + (1.0 - uv.y) * rect.w) / 3.14159265);
    vNormal = normalize(position);
    vFacing = dot(vNormal, normalize(cameraPosition - position));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const fragment = /* glsl */ `
  uniform sampler2D map;
  // city lights: a night tile (this tile's area within it at lightsRect.xy + uv × lightsRect.zw)
  // once loaded, else the whole-globe image
  uniform sampler2D lightsTile;
  uniform vec4 lightsRect;
  uniform float useLightsTile;
  varying vec2 vUv;
  varying vec2 vGlobalUv;
  varying vec3 vNormal;
  varying float vFacing;
  ${SATELLITE_SHADING}
  void main() {
    if (vFacing < 0.0) discard;
    vec3 lightsColor = useLightsTile > 0.5
      ? texture2D(lightsTile, lightsRect.xy + vUv * lightsRect.zw).rgb
      : texture2D(lights, vGlobalUv).rgb;
    gl_FragColor = vec4(satelliteShade(texture2D(map, vUv).rgb, lightsColor, vNormal), 1.0);
  }
`

/** Base imagery is 4096 px around the globe: a level-3 tile's worth of it is 256 px */
const BASE_PX_AT_LEVEL_3 = 256
/** Refine once a tile's pixels would be stretched by more than this */
const STRETCH = 1.15
const MAX_LOADING = 8
const MAX_READY = 240
/** Safety cap on tiles wanted at once */
const MAX_WANTED = 400

interface Tile {
  key: string
  url: string
  z: number
  x: number
  y: number
  center: THREE.Vector3
  /** angular radius (radians) of a circle around the tile */
  angle: number
  bound: THREE.Sphere
  state: "idle" | "loading" | "ready" | "failed"
  tex: THREE.Texture | null
  /** day tiles are drawn as sphere patches; night tiles are only textures */
  mesh: THREE.Mesh | null
  used: number
}

type Shading = Record<"sunDir" | "night" | "lights", THREE.IUniform>

/**
 * Sharper imagery where the camera is close: NASA Blue Marble tiles for the month on the
 * clock (from Vercel Blob), then Sentinel-2 close-ups. Each visible tile is split while its
 * pixels would be stretched on screen; until a tile arrives its nearest loaded ancestor (or
 * the base globe) stands in.
 */
export function SatelliteTiles({
  sim, shading, sentinel, onSentinelShown,
}: {
  sim: Simulation
  shading: Shading
  sentinel: boolean
  onSentinelShown: (shown: boolean) => void
}) {
  const group = useMemo(() => new THREE.Group(), [])
  const state = useMemo(
    () => ({
      tiles: new Map<string, Tile>(),
      loading: 0,
      month: -1,
      monthChecked: -1,
      pruned: 0,
      sentinelShown: false,
      frustum: new THREE.Frustum(),
      matrix: new THREE.Matrix4(),
      dir: new THREE.Vector3(),
      drawn: new Set<Tile>(),
    }),
    [],
  )

  const free = useMemo(
    () => (t: Tile) => {
      if (t.mesh) {
        group.remove(t.mesh)
        t.mesh.geometry.dispose()
        ;(t.mesh.material as THREE.Material).dispose()
        t.mesh = null
      }
      if (t.state === "ready" || t.state === "loading") releaseImageTexture(t.url)
      t.tex = null
      t.state = "idle"
    },
    [group],
  )
  useEffect(
    () => () => {
      for (const t of state.tiles.values()) free(t)
      state.tiles.clear()
    },
    [state, free],
  )

  useFrame(({ camera, size, clock }) => {
    const cam = camera as THREE.PerspectiveCamera
    const now = clock.elapsedTime
    if (now - state.monthChecked > 0.5) {
      state.monthChecked = now
      state.month = new Date(sim.time).getUTCMonth()
    }
    const blueMarble = blueMarbleTiles(state.month)
    const sourceFor = (z: number): TileSource | null =>
      z <= blueMarble.maxZ ? blueMarble : sentinel && z <= SENTINEL_TILES.maxZ ? SENTINEL_TILES : null

    const tileAt = (z: number, x: number, y: number, source = sourceFor(z)): Tile | null => {
      if (!source) return null
      const key = `${source.key}/${z}/${x}/${y}`
      let t = state.tiles.get(key)
      if (!t) {
        const [w, e, s, n] = tileBounds(z, x, y)
        const v = [0, 0, 0]
        latLonToXYZ((s + n) / 2, (w + e) / 2, 1, v)
        const center = new THREE.Vector3(v[0], v[1], v[2])
        latLonToXYZ(Math.abs(n) > Math.abs(s) ? n : s, w, 1, v)
        const corner = new THREE.Vector3(v[0], v[1], v[2])
        const angle = center.angleTo(corner)
        t = {
          key, url: source.url(z, x, y), z, x, y, center, angle,
          bound: new THREE.Sphere(center, center.distanceTo(corner)),
          state: "idle", tex: null, mesh: null, used: now,
        }
        state.tiles.set(key, t)
      }
      return t
    }

    // which tiles the view needs ---------------------------------------------------
    const dist = cam.position.length()
    const horizon = Math.acos(Math.min(1, 1 / dist))
    state.dir.copy(cam.position).divideScalar(dist)
    state.matrix.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)
    state.frustum.setFromProjectionMatrix(state.matrix)
    const focal = size.height / (2 * Math.tan(((cam.fov / 2) * Math.PI) / 180))
    const visible = (t: Tile) => state.dir.angleTo(t.center) < horizon + t.angle && state.frustum.intersectsSphere(t.bound)
    /** on-screen size, in pixels, of the tile's side */
    const pixels = (t: Tile) => (((tileDegrees(t.z) * Math.PI) / 180) * focal) / Math.max(1e-6, cam.position.distanceTo(t.center))

    const wanted: Tile[] = []
    const visit = (z: number, x: number, y: number) => {
      const t = tileAt(z, x, y)
      if (!t || !visible(t) || wanted.length >= MAX_WANTED) return
      const own = sourceFor(z)!.size
      if (pixels(t) > own * STRETCH && sourceFor(z + 1)) {
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) visit(z + 1, x * 2 + dx, y * 2 + dy)
      } else wanted.push(t)
    }
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 16; x++) {
        const t = tileAt(3, x, y)
        if (t && visible(t) && pixels(t) > BASE_PX_AT_LEVEL_3 * STRETCH) visit(3, x, y)
      }

    // draw each wanted tile, or its nearest loaded ancestor until it arrives ------------
    const drawn = state.drawn
    for (const t of drawn) if (t.mesh) t.mesh.visible = false
    drawn.clear()
    let sentinelShown = false
    const sun = shading.sunDir.value as THREE.Vector3
    const night = shading.night.value as number
    const nightWanted = new Set<Tile>()
    for (const t of wanted) {
      let show: Tile | null = t
      for (let z = t.z, x = t.x, y = t.y; show && show.state !== "ready"; ) {
        if (--z < 3) show = null
        else {
          x >>= 1
          y >>= 1
          show = tileAt(z, x, y)
        }
      }
      if (!show?.mesh || drawn.has(show)) continue
      show.used = now
      show.mesh.visible = true
      drawn.add(show)
      if (show.z >= SENTINEL_TILES.minZ) sentinelShown = true
      // near or past dusk, city lights from the night tile covering this one
      const u = (show.mesh.material as THREE.ShaderMaterial).uniforms
      u.useLightsTile.value = 0
      if (night <= 0 || show.center.dot(sun) > 0.2 + show.angle) continue
      const nz = Math.min(show.z, NIGHT_TILES.maxZ)
      const k = 2 ** (show.z - nz)
      const n = tileAt(nz, Math.floor(show.x / k), Math.floor(show.y / k), NIGHT_TILES)!
      n.used = now
      if (n.state === "idle") nightWanted.add(n)
      if (n.state !== "ready") continue
      u.lightsTile.value = n.tex
      ;(u.lightsRect.value as THREE.Vector4).set((show.x % k) / k, (k - (show.y % k) - 1) / k, 1 / k, 1 / k)
      u.useLightsTile.value = 1
    }
    for (const t of wanted) t.used = now
    if (sentinelShown !== state.sentinelShown) {
      state.sentinelShown = sentinelShown
      onSentinelShown(sentinelShown)
    }

    // start loading the coarsest, most central tiles first --------------------------
    const queue = wanted.filter((t) => t.state === "idle")
    queue.sort((a, b) => a.z - b.z || state.dir.dot(b.center) - state.dir.dot(a.center))
    queue.push(...nightWanted)
    if (queue.length && state.loading < MAX_LOADING) {
      for (const t of queue.slice(0, MAX_LOADING - state.loading)) {
        t.state = "loading"
        state.loading++
        loadImageTexture(t.url).then(
          (tex) => {
            state.loading--
            if (t.state !== "loading") return releaseImageTexture(t.url)
            t.state = "ready"
            t.tex = tex
            if (t.url === NIGHT_TILES.url(t.z, t.x, t.y)) return
            const [w, e, s, n] = tileBounds(t.z, t.x, t.y)
            const rect = new THREE.Vector4(((w + 180) * Math.PI) / 180, ((e - w) * Math.PI) / 180, ((90 - n) * Math.PI) / 180, ((n - s) * Math.PI) / 180)
            const segments = t.z <= 4 ? 16 : 8
            const geometry = new THREE.SphereGeometry(1, segments, segments, rect.x, rect.y, rect.z, rect.w)
            const material = new THREE.ShaderMaterial({
              uniforms: {
                map: { value: tex },
                rect: { value: rect },
                lightsTile: { value: null },
                lightsRect: { value: new THREE.Vector4(0, 0, 1, 1) },
                useLightsTile: { value: 0 },
                sunDir: shading.sunDir,
                night: shading.night,
                lights: shading.lights,
              },
              vertexShader: vertex,
              fragmentShader: fragment,
              depthTest: false,
              depthWrite: false,
            })
            t.mesh = new THREE.Mesh(geometry, material)
            t.mesh.renderOrder = 0.1 + t.z * 0.01
            t.mesh.frustumCulled = false
            t.mesh.visible = false
            group.add(t.mesh)
          },
          () => {
            state.loading--
            if (t.state === "loading") t.state = "failed"
          },
        )
      }
    }

    // forget the least recently used tiles ------------------------------------------
    if (now - state.pruned > 2 && state.tiles.size > MAX_READY) {
      state.pruned = now
      const ready = [...state.tiles.values()].filter((t) => t.state === "ready" && !drawn.has(t))
      if (ready.length > MAX_READY) {
        ready.sort((a, b) => a.used - b.used)
        for (const t of ready.slice(0, ready.length - MAX_READY)) {
          free(t)
          state.tiles.delete(t.key)
        }
      }
      for (const [key, t] of state.tiles) if ((t.state === "idle" || t.state === "failed") && now - t.used > 120) state.tiles.delete(key)
    }
  })

  // the attribution goes when the tiles do
  useEffect(() => () => onSentinelShown(false), [onSentinelShown])

  return <primitive object={group} />
}
