"use client"

import { memo, useRef, type RefObject } from "react"
import { Canvas, type RootState } from "@react-three/fiber"
import { OrbitControls, Stars } from "@react-three/drei"

import type { ColorScheme, Theme } from "@/lib/sim/attributes"
import type { Simulation } from "@/lib/sim/engine"
import type { CompiledFilter } from "@/lib/sim/filter"
import type { Hotspot } from "@/lib/sim/unrest"
import type { Disaster } from "@/lib/disasters"
import { AnimalLayer } from "./AnimalLayer"
import { CameraRig, SimDriver, type FlyTarget } from "./CameraRig"
import { DisasterLayer, type ExtraPick } from "./DisasterLayer"
import { Atmosphere, Borders, Earth } from "./EarthLayers"
import { CityLabels, HoverLabel, SelectionMarker } from "./Labels"
import { People, Picker } from "./PeopleLayer"
import { UnrestLayer } from "./UnrestLayer"
import { VitalLayer, type VitalStats } from "./VitalLayer"

export { MIN_ALTITUDE, type FlyTarget } from "./CameraRig"

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
}

const BACKGROUND: Record<Theme, string> = { dark: "#04060c", light: "#e9eef5" }

/** Reading shader logs forces a synchronous wait for every program link on first use */
function disableShaderChecksInProduction({ gl }: RootState) {
  if (process.env.NODE_ENV === "production") gl.debug.checkShaderErrors = false
}

/** The 3D scene. Memoised: it re-renders only when a prop changes (keep callbacks stable). */
function Globe(props: GlobeProps) {
  /** per-slot base point size (0 = not drawn); shared by renderer and picker */
  const sizesRef = useRef<Float32Array>(new Float32Array(0))
  const extraPickRef = useRef<ExtraPick | null>(null)
  return (
    <Canvas
      camera={{ position: [0, 0.9, 3.1], fov: 45, near: 0.01, far: 300 }}
      dpr={[1, 2]}
      gl={{ antialias: true }}
      onCreated={disableShaderChecksInProduction}
    >
      <color attach="background" args={[BACKGROUND[props.theme]]} />
      {props.theme === "dark" && <Stars radius={80} depth={60} count={4000} factor={2.2} saturation={0} fade speed={0.3} />}
      <SimDriver sim={props.sim} speedRef={props.speedRef} detailEnabled={props.detailEnabled} altitudeRef={props.altitudeRef} />
      <Earth sim={props.sim} showNight={props.showNight} theme={props.theme} />
      <Atmosphere theme={props.theme} />
      <Borders theme={props.theme} />
      {props.showUnrest && <UnrestLayer onPick={props.onPickHotspot} />}
      <People
        sim={props.sim}
        scheme={props.scheme}
        hidden={props.hidden}
        selectedId={props.selectedId}
        hoveredId={props.hoveredId}
        theme={props.theme}
        filter={props.filter}
        filterMode={props.filterMode}
        sizesRef={sizesRef}
      />
      {props.showVital && <VitalLayer sim={props.sim} speedRef={props.speedRef} theme={props.theme} statsRef={props.vitalStatsRef} />}
      {props.animals.length > 0 && <AnimalLayer sim={props.sim} species={props.animals} />}
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
      <CityLabels theme={props.theme} />
      {props.selectedId != null && <SelectionMarker sim={props.sim} id={props.selectedId} />}
      {props.hoveredId != null && props.hoveredId !== props.selectedId && <HoverLabel sim={props.sim} id={props.hoveredId} />}
      <Picker sim={props.sim} sizesRef={sizesRef} extraRef={extraPickRef} onSelect={props.onSelect} onHover={props.onHover} />
      <CameraRig
        sim={props.sim}
        selectedId={props.selectedId}
        follow={props.follow}
        flyToRef={props.flyToRef}
        autoRotate={props.autoRotate && props.selectedId == null}
      />
      <OrbitControls makeDefault enablePan={false} enableZoom={false} enableDamping dampingFactor={0.08} />
    </Canvas>
  )
}

export default memo(Globe)
