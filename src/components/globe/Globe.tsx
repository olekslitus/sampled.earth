"use client"

import { memo, useRef, type RefObject } from "react"
import { Canvas, type RootState } from "@react-three/fiber"
import { OrbitControls } from "@react-three/drei"
import type * as THREE from "three"

import type { ColorScheme, Theme } from "@/lib/sim/attributes"
import type { Simulation } from "@/lib/sim/engine"
import type { CompiledFilter } from "@/lib/sim/filter"
import type { Hotspot } from "@/lib/sim/unrest"
import type { Disaster } from "@/lib/disasters"
import { AnimalLayer } from "./AnimalLayer"
import { CameraRig, SimDriver, type FlyTarget } from "./CameraRig"
import { DisasterLayer, type ExtraPick } from "./DisasterLayer"
import { Atmosphere, Borders, Earth, SatelliteEarth } from "./EarthLayers"
import { CityLabels, HoverLabel, SelectionMarker } from "./Labels"
import { People, Picker } from "./PeopleLayer"
import { PlacesLayer, type PlaceKey, type PlacePick, type PlacesMap } from "./PlacesLayer"
import type { MapStyle } from "./satellite"
import { UnrestLayer } from "./UnrestLayer"
import { VitalLayer, type VitalStats } from "./VitalLayer"
import { WeatherLayer } from "./WeatherLayer"
import type { WeatherIndex } from "@/lib/weather/live"
import { CosmicWeb, MicrowaveSky, MilkyWay, NearbyGalaxies } from "@/components/space/GalaxyLayers"
import { Moon } from "@/components/space/Moon"
import { SolarBodies, SolarLines } from "@/components/space/SolarLayers"
import { SpaceRenderer } from "@/components/space/SpaceRenderer"
import { ExoplanetSystems, SkyGlow, StarField } from "@/components/space/StarLayers"
import type { SpaceView } from "@/components/space/view"
import type { SpaceLive } from "@/components/space/data"

export { MIN_ALTITUDE, type FlyTarget } from "./CameraRig"
export type { MapStyle } from "./satellite"

export interface GlobeProps {
  sim: Simulation
  speedRef: RefObject<number>
  scheme: ColorScheme
  hidden: ReadonlySet<number>
  /** person ids */
  selectedId: number | null
  hoveredId: number | null
  onSelect: (id: number | null) => void
  onHover: (id: number | null) => void
  follow: boolean
  showNight: boolean
  autoRotate: boolean
  detailEnabled: boolean
  flyToRef: RefObject<FlyTarget | null>
  /** written every frame so the UI can show altitude */
  altitudeRef: RefObject<number>
  theme: Theme
  mapStyle: MapStyle
  /** Sentinel-2 close-ups on the satellite globe */
  sentinel: boolean
  /** told when Sentinel-2 imagery appears on or leaves the screen, for its attribution */
  onSentinelShown: (shown: boolean) => void
  /** newest live weather images (null until loaded or when both layers are off) */
  weather: WeatherIndex | null
  showClouds: boolean
  showPrecip: boolean
  filter: CompiledFilter | null
  /** what happens to people outside the filter */
  filterMode: "grey" | "hide"
  showVital: boolean
  vitalStatsRef: RefObject<VitalStats>
  animals: string[]
  showUnrest: boolean
  onPickHotspot: (h: Hotspot) => void
  /** live natural disasters to draw (empty when the layer is off) */
  disasters: Disaster[]
  disastersFetchedAt: number
  selectedDisasterId: string | null
  onPickDisaster: (d: Disaster) => void
  /** the zoom out into space */
  space: SpaceView
  /** live probe paths and exoplanets (null until loaded) */
  spaceLive: SpaceLive | null
  /** galaxies and the cosmic web load once you head that way */
  deepSpace: boolean
  selectedSpaceKey: string | null
  /** the statistics map (null when off) */
  places: PlacesMap | null
  onPlaceHover: (hit: PlaceKey | null, clientX: number, clientY: number) => void
  onPlaceSelect: (hit: PlaceKey) => void
}

/** Reading shader logs forces a synchronous wait for every program link on first use */
function disableShaderChecksInProduction({ gl }: RootState) {
  if (process.env.NODE_ENV === "production") gl.debug.checkShaderErrors = false
}

/** The 3D scene. Memoised: it re-renders only when a prop changes (keep callbacks stable). */
function Globe(props: GlobeProps) {
  /** per-slot base point size (0 = not drawn); shared by renderer and picker */
  const sizesRef = useRef<Float32Array>(new Float32Array(0))
  const extraPickRef = useRef<ExtraPick | null>(null)
  const placesRef = useRef<PlacePick | null>(null)
  const overlaysRef = useRef<THREE.Group>(null)
  const trackKey = props.selectedSpaceKey?.startsWith("track:") ? props.selectedSpaceKey.slice(6) : null
  return (
    <Canvas
      camera={{ position: [0, 0.9, 3.1], fov: 45, near: 0.01, far: 300 }}
      dpr={[1, 2]}
      gl={{ antialias: true }}
      onCreated={disableShaderChecksInProduction}
    >
      <SpaceRenderer sim={props.sim} view={props.space} theme={props.theme} overlaysRef={overlaysRef} />
      <SkyGlow view={props.space} />
      <StarField view={props.space} />
      {props.spaceLive && <ExoplanetSystems view={props.space} systems={props.spaceLive.systems} />}
      <SolarLines view={props.space} tracks={props.spaceLive?.tracks ?? []} selected={trackKey} />
      <SolarBodies view={props.space} />
      {props.deepSpace && (
        <>
          <MilkyWay view={props.space} />
          <NearbyGalaxies view={props.space} />
          <CosmicWeb view={props.space} />
          <MicrowaveSky view={props.space} />
        </>
      )}
      <Moon view={props.space} />
      <SimDriver sim={props.sim} speedRef={props.speedRef} detailEnabled={props.detailEnabled} altitudeRef={props.altitudeRef} />
      {props.mapStyle === "satellite" ? (
        <SatelliteEarth sim={props.sim} showNight={props.showNight} sentinel={props.sentinel} onSentinelShown={props.onSentinelShown} />
      ) : (
        <Earth sim={props.sim} showNight={props.showNight} theme={props.theme} />
      )}
      <Atmosphere theme={props.theme} />
      {props.weather && (
        <WeatherLayer
          sim={props.sim}
          index={props.weather}
          showClouds={props.showClouds}
          showPrecip={props.showPrecip}
          showNight={props.showNight}
          mapStyle={props.mapStyle}
          theme={props.theme}
          faint={!!props.places?.countryRGBA || !!props.places?.regionRGBA}
        />
      )}
      <group ref={overlaysRef}>
      {props.places && <PlacesLayer map={props.places} pickRef={placesRef} onHover={props.onPlaceHover} onSelect={props.onPlaceSelect} />}
      <Borders theme={props.theme} mapStyle={props.mapStyle} />
      {props.showUnrest && <UnrestLayer onPick={props.onPickHotspot} />}
      <People
        sim={props.sim}
        scheme={props.scheme}
        hidden={props.hidden}
        selectedId={props.selectedId}
        hoveredId={props.hoveredId}
        theme={props.theme}
        mapStyle={props.mapStyle}
        filter={props.filter}
        filterMode={props.filterMode}
        sizesRef={sizesRef}
        placesRef={placesRef}
      />
      {props.showVital && <VitalLayer sim={props.sim} speedRef={props.speedRef} theme={props.theme} statsRef={props.vitalStatsRef} />}
      {props.animals.length > 0 && <AnimalLayer sim={props.sim} species={props.animals} theme={props.theme} />}
      {props.disasters.length > 0 && (
        <DisasterLayer
          events={props.disasters}
          fetchedAt={props.disastersFetchedAt}
          theme={props.theme}
          pickRef={extraPickRef}
          selectedId={props.selectedDisasterId}
          onPick={props.onPickDisaster}
        />
      )}
      <CityLabels theme={props.mapStyle === "satellite" ? "dark" : props.theme} />
      {props.selectedId != null && <SelectionMarker sim={props.sim} id={props.selectedId} />}
      {props.hoveredId != null && props.hoveredId !== props.selectedId && <HoverLabel sim={props.sim} id={props.hoveredId} />}
      </group>
      <Picker sim={props.sim} sizesRef={sizesRef} extraRef={extraPickRef} placesRef={placesRef} onSelect={props.onSelect} onHover={props.onHover} />
      <CameraRig
        sim={props.sim}
        selectedId={props.selectedId}
        follow={props.follow}
        flyToRef={props.flyToRef}
        autoRotate={props.autoRotate && props.selectedId == null}
        space={props.space}
      />
      <OrbitControls makeDefault enablePan={false} enableZoom={false} enableDamping dampingFactor={0.08} />
    </Canvas>
  )
}

export default memo(Globe)
