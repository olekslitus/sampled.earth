"use client"
/* oxlint-disable react/immutability --
 * three.js materials, buffers and uniforms are mutated imperatively inside the r3f frame loop. */

import { useEffect, useMemo, useRef, useState, type RefObject } from "react"
import * as THREE from "three"
import { useFrame, useThree } from "@react-three/fiber"

import type { City } from "@/lib/places/data"
import { latLonToXYZ, xyzToLatLon } from "@/lib/sim/sphere"
import { AREA_H, AREA_W, areaAt, type AreaLevel } from "./area-raster"
import { loadAreaGrid, type AreaGrid } from "./areas"
import { lineFragment, lineVertex } from "./EarthLayers"

export type PlaceKey = { kind: "country" | "region" | "city"; index: number }

export const samePlace = (a: PlaceKey | null, b: PlaceKey | null) => a === b || (!!a && !!b && a.kind === b.kind && a.index === b.index)

/** What the statistics map shows; colours are worked out outside the canvas */
export interface PlacesMap {
  /** RGBA per area id (id 0 unused); alpha 0 means "no data"; null when the source has no values at that level */
  countryRGBA: Uint8Array | null
  regionRGBA: Uint8Array | null
  regionsUrl: string | null
  levelMode: "auto" | AreaLevel
  cities: City[] | null
  /** RGB (0–1) per city, or null for plain markers */
  cityRGB: Float32Array | null
  showCities: boolean
  selected: PlaceKey | null
  theme: "light" | "dark"
}

/** Hit testing for the picker: cities first, then the area under the cursor */
export interface PlacePick {
  pick(clientX: number, clientY: number): PlaceKey | null
  hover(hit: PlaceKey | null, clientX: number, clientY: number): void
  select(hit: PlaceKey): void
  /** 0..1: how much the people fade while areas are coloured (they aren't picked past 0.5) */
  peopleFade: number
}

/** Below this altitude regions replace countries (when the source has regions) */
const REGION_IN_ALT = 0.9
const REGION_OUT_ALT = 1.1
const LUT_W = 2048

const areaVertex = /* glsl */ `
  out vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const areaFragment = /* glsl */ `
  precision highp usampler2D;
  uniform usampler2D ids;
  uniform sampler2D lut;
  uniform float opacity;
  uniform int hovered;
  uniform int selected;
  uniform vec3 hatch;
  in vec2 vUv;
  out vec4 fragColor;

  int idAt(vec2 st, ivec2 size) {
    ivec2 p = ivec2(floor(st));
    p.x = (p.x % size.x + size.x) % size.x;
    p.y = clamp(p.y, 0, size.y - 1);
    return int(texelFetch(ids, p, 0).r);
  }

  void main() {
    ivec2 size = textureSize(ids, 0);
    vec2 st = vec2(vUv.x * float(size.x), (1.0 - vUv.y) * float(size.y));
    int id = idAt(st, size);
    if (id == 0 || opacity <= 0.0) discard;
    vec4 c = texelFetch(lut, ivec2(id % ${LUT_W}, id / ${LUT_W}), 0);
    vec3 col = c.rgb;
    float a = opacity;
    if (c.a < 0.5) {
      // no data: thin diagonal hatching
      float s = mod(gl_FragCoord.x + gl_FragCoord.y, 7.0);
      col = hatch;
      a *= s < 1.5 ? 0.6 : 0.14;
    }
    if (id == hovered || id == selected) {
      // a light outline (about 1.5 screen pixels) around the hovered or selected area
      vec2 d = max(vec2(1.0), fwidth(st) * 1.5);
      bool edge = idAt(st + vec2(d.x, 0.0), size) != id || idAt(st - vec2(d.x, 0.0), size) != id
        || idAt(st + vec2(0.0, d.y), size) != id || idAt(st - vec2(0.0, d.y), size) != id;
      col = edge ? vec3(1.0) : mix(col, vec3(1.0), id == selected ? 0.12 : 0.2);
      // as strong as the fill allows, so the outline fades with it when zoomed in close
      if (edge) a = max(a, 0.95 * clamp(opacity / 0.3, 0.0, 1.0));
    }
    fragColor = vec4(col, a);
  }
`

function makeLut(count: number) {
  const rows = Math.ceil(count / LUT_W)
  const tex = new THREE.DataTexture(new Uint8Array(LUT_W * rows * 4), LUT_W, rows, THREE.RGBAFormat, THREE.UnsignedByteType)
  tex.minFilter = tex.magFilter = THREE.NearestFilter
  tex.generateMipmaps = false
  tex.needsUpdate = true
  return tex
}

function idTexture(ids: Uint16Array) {
  const tex = new THREE.DataTexture(ids, AREA_W, AREA_H, THREE.RedIntegerFormat, THREE.UnsignedShortType)
  tex.internalFormat = "R16UI"
  tex.minFilter = tex.magFilter = THREE.NearestFilter
  tex.generateMipmaps = false
  tex.needsUpdate = true
  return tex
}

function areaMaterial() {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: {
      ids: { value: null as THREE.Texture | null },
      lut: { value: null as THREE.Texture | null },
      opacity: { value: 0 },
      hovered: { value: -1 },
      selected: { value: -1 },
      hatch: { value: new THREE.Color("#8a93a6") },
    },
    vertexShader: areaVertex,
    fragmentShader: areaFragment,
    transparent: true,
    depthWrite: false,
  })
}

/** The id grid for a level, once painted (null until then or when not wanted) */
function useGrid(level: AreaLevel, url: string | null, wanted: boolean) {
  const [grid, setGrid] = useState<{ key: string; grid: AreaGrid } | null>(null)
  const key = `${level}:${url}`
  useEffect(() => {
    if (!wanted || (level === "region" && !url)) return
    let live = true
    loadAreaGrid(level, url ?? undefined)
      .then((g) => live && setGrid({ key, grid: g }))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [level, url, wanted, key])
  return grid?.key === key ? grid.grid : null
}

const cityVertex = /* glsl */ `
  attribute vec3 color;
  attribute float pop;
  attribute float picked;
  uniform float minPop;
  uniform float scale;
  uniform float dpr;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vPicked;
  void main() {
    float facing = dot(normalize(position), normalize(cameraPosition - position));
    float show = smoothstep(minPop * 0.6, minPop, pop);
    if (facing <= 0.0 || show <= 0.0) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      return;
    }
    vColor = color;
    vPicked = picked;
    vAlpha = smoothstep(0.0, 0.08, facing) * show;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = (3.0 + 9.0 * sqrt(pop / 1.0e7)) * scale * dpr * (1.0 + picked * 0.35);
  }
`
const cityFragment = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  varying float vPicked;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    // a ring keeps the circles readable on any fill: dark normally, white when picked
    float ring = smoothstep(0.34, 0.42, d);
    vec3 rim = mix(vec3(0.03, 0.04, 0.08), vec3(1.0), vPicked);
    gl_FragColor = vec4(mix(vColor, rim, ring), vAlpha * smoothstep(0.5, 0.44, d) * 0.95);
  }
`

/** Smallest city shown at an altitude: 5 million from far out, everyone once close in */
export function minCityPop(alt: number) {
  return 5e6 * Math.pow(Math.max(alt, 0.01) / 1.5, 2)
}
export function cityPixelScale(alt: number) {
  return 1 + 0.6 * Math.max(0, Math.log10(1.5 / Math.max(alt, 0.01)))
}

/**
 * The statistics map: countries or regions coloured by the chosen statistic (regions take
 * over as you zoom in, where the source has them), borders between regions, and circles
 * for cities sized by population. People fade back while the areas are coloured.
 */
export function PlacesLayer({ map, pickRef, onHover, onSelect }: {
  map: PlacesMap
  pickRef: RefObject<PlacePick | null>
  onHover: (hit: PlaceKey | null, clientX: number, clientY: number) => void
  onSelect: (hit: PlaceKey) => void
}) {
  const { camera, gl } = useThree()
  const dpr = useThree((s) => s.viewport.dpr)
  const countryGrid = useGrid("country", "world", !!map.countryRGBA)
  const regionGrid = useGrid("region", map.regionsUrl, !!map.regionRGBA && map.levelMode !== "country")

  // areas -------------------------------------------------------------------------------
  const mats = useMemo(() => ({ country: areaMaterial(), region: areaMaterial() }), [])
  const luts = useMemo(() => ({ country: makeLut(256), region: makeLut(4096) }), [])
  useEffect(
    () => () => {
      mats.country.dispose()
      mats.region.dispose()
      luts.country.dispose()
      luts.region.dispose()
    },
    [mats, luts],
  )
  const idTex = useMemo(() => ({ country: null as THREE.DataTexture | null, region: null as THREE.DataTexture | null }), [])
  useEffect(() => {
    if (!countryGrid) return
    const tex = idTexture(countryGrid.ids)
    idTex.country = tex
    mats.country.uniforms.ids.value = tex
    return () => {
      tex.dispose()
      if (idTex.country === tex) idTex.country = null
    }
  }, [countryGrid, idTex, mats])
  useEffect(() => {
    if (!regionGrid) return
    const tex = idTexture(regionGrid.ids)
    idTex.region = tex
    mats.region.uniforms.ids.value = tex
    return () => {
      tex.dispose()
      if (idTex.region === tex) idTex.region = null
    }
  }, [regionGrid, idTex, mats])

  useEffect(() => {
    for (const level of ["country", "region"] as const) {
      const rgba = level === "country" ? map.countryRGBA : map.regionRGBA
      const lut = luts[level]
      const data = lut.image.data as Uint8Array
      data.fill(0)
      if (rgba) data.set(rgba.subarray(0, Math.min(rgba.length, data.length)))
      lut.needsUpdate = true
      mats[level].uniforms.lut.value = lut
      ;(mats[level].uniforms.hatch.value as THREE.Color).set(map.theme === "dark" ? "#8a93a6" : "#6b7280")
    }
  }, [map.countryRGBA, map.regionRGBA, map.theme, luts, mats])

  const regionLines = useMemo(() => {
    if (!regionGrid?.borders) return null
    const g = new THREE.BufferGeometry()
    g.setAttribute("position", new THREE.BufferAttribute(regionGrid.borders, 3))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.01)
    return g
  }, [regionGrid])
  useEffect(() => () => regionLines?.dispose(), [regionLines])
  const lineMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { color: { value: new THREE.Color("#ffffff") }, opacity: { value: 0 } },
        vertexShader: lineVertex,
        fragmentShader: lineFragment,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    [],
  )
  useEffect(() => () => lineMat.dispose(), [lineMat])
  useEffect(() => {
    ;(lineMat.uniforms.color.value as THREE.Color).set(map.theme === "dark" ? "#ffffff" : "#1f2937")
  }, [lineMat, map.theme])

  // cities ------------------------------------------------------------------------------
  const cityGeo = useMemo(() => {
    const rows = map.cities
    if (!rows) return null
    const pos = new Float32Array(rows.length * 3)
    const pop = new Float32Array(rows.length)
    rows.forEach((c, i) => {
      latLonToXYZ(c.lat, c.lon, 1.0006, pos, i * 3)
      pop[i] = c.pop
    })
    const g = new THREE.BufferGeometry()
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3))
    g.setAttribute("pop", new THREE.BufferAttribute(pop, 1))
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(rows.length * 3), 3))
    g.setAttribute("picked", new THREE.BufferAttribute(new Float32Array(rows.length), 1))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.01)
    return g
  }, [map.cities])
  useEffect(() => () => cityGeo?.dispose(), [cityGeo])
  const cityMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { minPop: { value: 5e6 }, scale: { value: 1 }, dpr: { value: 1 } },
        vertexShader: cityVertex,
        fragmentShader: cityFragment,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    [],
  )
  useEffect(() => () => cityMat.dispose(), [cityMat])
  useEffect(() => {
    if (!cityGeo) return
    const attr = cityGeo.getAttribute("color") as THREE.BufferAttribute
    const out = attr.array as Float32Array
    if (map.cityRGB) out.set(map.cityRGB)
    else out.fill(map.theme === "dark" ? 0.92 : 0.98)
    attr.needsUpdate = true
  }, [cityGeo, map.cityRGB, map.theme])

  // highlight of the hovered / selected place -------------------------------------------
  const state = useRef({ hover: null as PlaceKey | null, regionMix: 0, wantRegions: false, strength: 0, map, onHover, onSelect })
  useEffect(() => {
    Object.assign(state.current, { map, onHover, onSelect })
  }, [map, onHover, onSelect])
  const applyHighlight = useMemo(
    () => () => {
      const { hover, map } = state.current
      for (const level of ["country", "region"] as const) {
        const u = mats[level].uniforms
        u.hovered.value = hover?.kind === level ? hover.index + 1 : -1
        u.selected.value = map.selected?.kind === level ? map.selected.index + 1 : -1
      }
      if (cityGeo) {
        const attr = cityGeo.getAttribute("picked") as THREE.BufferAttribute
        const arr = attr.array as Float32Array
        arr.fill(0)
        if (hover?.kind === "city") arr[hover.index] = 1
        if (map.selected?.kind === "city") arr[map.selected.index] = 1
        attr.needsUpdate = true
      }
    },
    [mats, cityGeo],
  )
  useEffect(() => applyHighlight(), [applyHighlight, map.selected])

  // picking -------------------------------------------------------------------------------
  useEffect(() => {
    const el = gl.domElement
    const raycaster = new THREE.Raycaster()
    const sphere = new THREE.Sphere(new THREE.Vector3(), 1)
    const hit = new THREE.Vector3()
    const ndc = new THREE.Vector2()
    const v = new THREE.Vector3()
    const m = new THREE.Matrix4()

    const pickCity = (clientX: number, clientY: number): PlaceKey | null => {
      const { map } = state.current
      if (!map.cities || !map.showCities || !cityGeo) return null
      const alt = camera.position.length() - 1
      const minPop = minCityPop(alt)
      const scale = cityPixelScale(alt)
      const rect = el.getBoundingClientRect()
      const mx = clientX - rect.left
      const my = clientY - rect.top
      m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
      const pos = (cityGeo.getAttribute("position") as THREE.BufferAttribute).array as Float32Array
      const cx = camera.position.x
      const cy = camera.position.y
      const cz = camera.position.z
      let best = -1
      let bestD = Infinity
      for (let i = 0; i < map.cities.length; i++) {
        const c = map.cities[i]!
        if (c.pop < minPop) break // sorted by population
        const x = pos[i * 3]!
        const y = pos[i * 3 + 1]!
        const z = pos[i * 3 + 2]!
        if (x * cx + y * cy + z * cz <= 1.0012) continue // behind the horizon
        v.set(x, y, z).applyMatrix4(m)
        const sx = ((v.x + 1) / 2) * rect.width - mx
        const sy = ((1 - v.y) / 2) * rect.height - my
        const r = (3 + 9 * Math.sqrt(c.pop / 1e7)) * scale * 0.5 + 3
        const d = sx * sx + sy * sy
        if (d < r * r && d < bestD) {
          bestD = d
          best = i
        }
      }
      return best >= 0 ? { kind: "city", index: best } : null
    }

    const pickArea = (clientX: number, clientY: number): PlaceKey | null => {
      const s = state.current
      if (s.strength < 0.05) return null
      const rect = el.getBoundingClientRect()
      ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(ndc, camera)
      if (!raycaster.ray.intersectSphere(sphere, hit)) return null
      const [lat, lon] = xyzToLatLon(hit.x, hit.y, hit.z)
      const level: AreaLevel = s.regionMix > 0.5 ? "region" : "country"
      const grid = level === "region" ? regionGrid : countryGrid
      if (!grid) return null
      const id = areaAt(grid.ids, lat, lon)
      return id > 0 ? { kind: level, index: id - 1 } : null
    }

    pickRef.current = {
      peopleFade: 0,
      pick: (x, y) => pickCity(x, y) ?? pickArea(x, y),
      hover: (h, x, y) => {
        const prev = state.current.hover
        state.current.hover = h
        if (!samePlace(prev, h)) applyHighlight()
        state.current.onHover(h, x, y)
      },
      select: (h) => state.current.onSelect(h),
    }
    return () => {
      pickRef.current = null
    }
  }, [camera, gl, pickRef, cityGeo, countryGrid, regionGrid, applyHighlight])

  // per frame: level, fades -------------------------------------------------------------
  useFrame((_, delta) => {
    const s = state.current
    const alt = camera.position.length() - 1
    const hasCountries = !!s.map.countryRGBA && !!countryGrid
    const hasRegions = !!s.map.regionRGBA && !!regionGrid
    if (s.map.levelMode === "auto") {
      if (alt < REGION_IN_ALT) s.wantRegions = true
      else if (alt > REGION_OUT_ALT) s.wantRegions = false
    } else s.wantRegions = s.map.levelMode === "region"
    const regionTarget = hasRegions && (s.wantRegions || !hasCountries) ? 1 : 0
    const k = Math.min(1, delta * 6)
    s.regionMix += (regionTarget - s.regionMix) * k
    // fully coloured from afar; close in the fill fades out (its ~10 km pixels would show)
    // and people and streets take over
    const any = hasCountries || hasRegions ? 1 : 0
    const strengthTarget = any * THREE.MathUtils.smoothstep(alt, 0.08, 0.3)
    s.strength += (strengthTarget - s.strength) * k
    const base = 0.86 * s.strength
    mats.country.uniforms.opacity.value = hasCountries ? base * (1 - s.regionMix) : 0
    mats.region.uniforms.opacity.value = hasRegions ? base * s.regionMix : 0
    lineMat.uniforms.opacity.value = hasRegions ? s.regionMix * Math.min(0.5, s.strength) * Math.min(1, Math.max(0, (2.4 - alt) / 1.4)) : 0
    if (pickRef.current) pickRef.current.peopleFade = any * Math.min(1, s.strength * 1.15)

    cityMat.uniforms.minPop.value = minCityPop(alt)
    cityMat.uniforms.scale.value = cityPixelScale(alt)
    cityMat.uniforms.dpr.value = dpr
  })

  return (
    <>
      <mesh material={mats.country} renderOrder={0.5} visible={!!countryGrid && !!map.countryRGBA}>
        <sphereGeometry args={[1.0005, 256, 160]} />
      </mesh>
      <mesh material={mats.region} renderOrder={0.6} visible={!!regionGrid && !!map.regionRGBA}>
        <sphereGeometry args={[1.0005, 256, 160]} />
      </mesh>
      {regionLines && <lineSegments geometry={regionLines} material={lineMat} renderOrder={1} frustumCulled={false} />}
      {cityGeo && map.showCities && <points geometry={cityGeo} material={cityMat} renderOrder={2.5} frustumCulled={false} />}
    </>
  )
}
