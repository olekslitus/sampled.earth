"use client"

import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react"

import { ControlPanel, SettingsTab, SPEEDS, ViewTab, type ControlTab } from "@/components/ControlPanel"
import Globe, { type FlyTarget, type GlobeProps } from "@/components/globe/Globe"
import { emptyVitalStats, type VitalStats } from "@/components/globe/VitalLayer"
import { HotspotCard } from "@/components/HotspotCard"
import { PersonCard } from "@/components/PersonCard"
import { DisasterCard } from "@/components/panels/DisasterCard"
import { FilterPanel, type FilterSource, type FilterSubTab } from "@/components/panels/FilterPanel"
import { LayersPanel } from "@/components/panels/LayersPanel"
import { StatusBar, TapHint } from "@/components/StatusBar"
import { SCHEME_BY_KEY, type Theme } from "@/lib/sim/attributes"
import { Simulation } from "@/lib/sim/engine"
import { compileFilter, isEmptySpec, type FilterSpec } from "@/lib/sim/filter"
import { DEFAULT_DATING, type DatingPrefs, type MeProfile } from "@/lib/sim/me"
import type { Hotspot } from "@/lib/sim/unrest"
import type { Disaster, DisasterKind } from "@/lib/disasters"
import { useDisasters } from "@/lib/useDisasters"

/** Read a saved value; storage can be unavailable (private mode, blocked site data) */
function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback
  } catch {
    return fallback
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value))
  } catch {
    // not fatal: the value just won't be remembered
  }
}

/**
 * Income rank among people who earn anything (children, students, homemakers and the
 * unemployed have no personal income and would otherwise inflate everyone's rank).
 * The sorted incomes are built once per population and rebuilt only while it is still
 * being sampled.
 */
function makeIncomeRanker(sim: Simulation) {
  let builtFor = -1
  let sorted = new Float64Array(0)
  return (income: number) => {
    if (builtFor !== sim.globalCount) {
      const incomes: number[] = []
      for (let i = 0; i < sim.globalCount; i++) {
        const v = sim.people[i]!.income
        if (v > 0) incomes.push(v)
      }
      sorted = Float64Array.from(incomes).sort()
      builtFor = sim.globalCount
    }
    if (income <= 0 || sorted.length === 0) return 0
    // lower bound: how many earners make strictly less
    let lo = 0
    let hi = sorted.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (sorted[mid]! < income) lo = mid + 1
      else hi = mid
    }
    return lo / sorted.length
  }
}

/** The globe plus hover state, so hovering a person re-renders only the globe */
function GlobeHost(props: Omit<GlobeProps, "hoveredId" | "onHover">) {
  const { sim } = props
  const [hover, setHover] = useState<{ sim: Simulation; id: number | null }>({ sim, id: null })
  const onHover = useCallback((id: number | null) => setHover((h) => (h.sim === sim && h.id === id ? h : { sim, id })), [sim])
  // a hover from a previous population means nothing in the new one
  const hoveredId = hover.sim === sim ? hover.id : null
  return <Globe {...props} hoveredId={hoveredId} onHover={onHover} />
}

export default function SampledEarth() {
  const [size, setSize] = useState(50_000)
  const [seed, setSeed] = useState(1)
  const [sim, setSim] = useState(() => new Simulation(50_000, 1))
  const [detail, setDetail] = useState("15000")
  const altitudeRef = useRef(2.2)

  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.classList.contains("dark") ? "dark" : "light"))
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark")
  }, [theme])
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark"
    setTheme(next)
    save("theme", next)
  }

  const [speed, setSpeed] = useState("600")
  const speedRef = useRef(600)
  useEffect(() => {
    speedRef.current = SPEEDS.find((s) => s.value === speed)?.speed ?? 1
  }, [speed])

  const [schemeKey, setSchemeKey] = useState("activity")
  const scheme = SCHEME_BY_KEY.get(schemeKey)!
  const [hidden, setHidden] = useState<ReadonlySet<number>>(new Set())

  // filter, "me" and dating ---------------------------------------------------------
  const [spec, setSpec] = useState<FilterSpec>({})
  const [filterSource, setFilterSource] = useState<FilterSource>("filter")
  const [filterMode, setFilterMode] = useState<"grey" | "hide">("grey")
  const [filterSubTab, setFilterSubTab] = useState<FilterSubTab>("traits")
  const filter = useMemo(() => compileFilter(spec), [spec])
  const [me, setMe] = useState<MeProfile>(() => load("me", {}))
  const [dating, setDating] = useState<DatingPrefs>(() => load("dating", DEFAULT_DATING))
  useEffect(() => save("me", me), [me])
  useEffect(() => save("dating", dating), [dating])

  // layers ---------------------------------------------------------------------------
  const [showVital, setShowVital] = useState(false)
  const vitalRef = useRef<VitalStats>(emptyVitalStats())
  const [animals, setAnimals] = useState<string[]>([])
  const [showUnrest, setShowUnrest] = useState(false)
  const [hotspot, setHotspot] = useState<Hotspot | null>(null)
  const [showDisasters, setShowDisasters] = useState(false)
  const [hiddenKinds, setHiddenKinds] = useState<DisasterKind[]>([])
  const [disaster, setDisaster] = useState<Disaster | null>(null)
  const { feed: disasterFeed, loading: disastersLoading, error: disastersError, retry: retryDisasters } = useDisasters(showDisasters)
  const disasters = useMemo(
    () => (showDisasters && disasterFeed ? disasterFeed.events.filter((d) => !hiddenKinds.includes(d.kind)) : []),
    [showDisasters, disasterFeed, hiddenKinds],
  )

  // selection & view -----------------------------------------------------------------
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [follow, setFollow] = useState(false)
  const [showNight, setShowNight] = useState(true)
  const [autoRotate, setAutoRotate] = useState(false)
  const [exaggeration, setExaggeration] = useState(6)
  /** below md the controls are a bottom sheet; it starts collapsed so the globe is visible */
  const [panelOpen, setPanelOpen] = useState(false)
  const [hintDone, setHintDone] = useState(false)
  const [tab, setTab] = useState<ControlTab>("view")
  const flyToRef = useRef<FlyTarget | null>(null)

  useEffect(() => {
    sim.setExaggeration(exaggeration)
  }, [sim, exaggeration])

  useEffect(() => {
    sim.setDetailTarget(Number(detail))
  }, [sim, detail])

  // keep the selected person alive while zoom regions come and go
  useEffect(() => {
    sim.setPinned(selectedId)
  }, [sim, selectedId])

  const incomePercentile = useMemo(() => makeIncomeRanker(sim), [sim])

  // Handlers handed to the (memoised) globe must keep their identity across renders.
  const onSelect = useCallback((id: number | null) => {
    setSelectedId(id)
    if (id != null) {
      setHotspot(null)
      setDisaster(null)
      setPanelOpen(false)
      setHintDone(true)
    } else {
      setFollow(false)
    }
  }, [])

  const showPerson = useCallback(
    (id: number) => {
      onSelect(id)
      flyToRef.current = { kind: "person", id }
    },
    [onSelect],
  )

  const flyTo = useCallback((lat: number, lon: number, altitude: number) => {
    flyToRef.current = { kind: "point", lat, lon, alt: altitude }
  }, [])

  const pickHotspot = useCallback(
    (h: Hotspot) => {
      setSelectedId(null)
      setFollow(false)
      setDisaster(null)
      setHotspot(h)
      setPanelOpen(false)
      flyTo(h.lat, h.lon, Math.max(0.05, Math.min(0.9, h.radius * 0.14)))
    },
    [flyTo],
  )

  const pickDisaster = useCallback(
    (d: Disaster) => {
      setSelectedId(null)
      setFollow(false)
      setHotspot(null)
      setDisaster(d)
      setPanelOpen(false)
      const km = Math.max(d.impactKm, 60)
      flyTo(d.lat, d.lon, Math.max(0.04, Math.min(0.9, (km / 111) * 0.05)))
    },
    [flyTo],
  )

  // A spawned person who was despawned (the zoom region moved on) can no longer be shown.
  useEffect(() => {
    if (selectedId == null) return
    return sim.onDespawn((ids) => {
      if (ids.includes(selectedId)) onSelect(null)
    })
  }, [sim, selectedId, onSelect])

  // Escape closes the topmost card (person, then disaster, then hotspot) and nothing else.
  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (e.key !== "Escape" || e.defaultPrevented) return
    if (selectedId != null) onSelect(null)
    else if (disaster) setDisaster(null)
    else if (hotspot) setHotspot(null)
    else return
    e.preventDefault()
  })
  useEffect(() => {
    const handler = (e: KeyboardEvent) => onKeyDown(e)
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  const selectRandom = () => {
    const inViewOnly = sim.region !== null
    const pool: number[] = []
    sim.forEachShown(inViewOnly, (p, i) => {
      if (filter && !filter.test(p, i, sim)) return
      if (!hidden.has(scheme.value(p, i, sim))) pool.push(p.id)
    })
    if (pool.length) showPerson(pool[Math.floor(Math.random() * pool.length)])
  }

  const regenerate = (nextSize = size, nextSeed = seed) => {
    setSelectedId(null)
    setFollow(false)
    flyToRef.current = null
    setSize(nextSize)
    setSeed(nextSeed)
    const next = new Simulation(nextSize, nextSeed, sim.time)
    next.setDetailTarget(Number(detail))
    setSim(next)
  }

  const filterActive = !isEmptySpec(spec)
  const layersActive = (showVital ? 1 : 0) + (showUnrest ? 1 : 0) + (animals.length ? 1 : 0) + (showDisasters ? 1 : 0)
  const personShown = selectedId != null
  const disasterShown = !personShown && disaster != null && disasterFeed != null
  const hotspotShown = !personShown && !disasterShown && hotspot != null

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-background text-foreground">
      <div className="absolute inset-0">
        <GlobeHost
          sim={sim}
          speedRef={speedRef}
          scheme={scheme}
          hidden={hidden}
          selectedId={selectedId}
          onSelect={onSelect}
          follow={follow}
          showNight={showNight}
          autoRotate={autoRotate}
          detailEnabled={detail !== "0"}
          altitudeRef={altitudeRef}
          flyToRef={flyToRef}
          theme={theme}
          filter={filter}
          filterMode={filterMode}
          showVital={showVital}
          vitalStatsRef={vitalRef}
          animals={animals}
          showUnrest={showUnrest}
          onPickHotspot={pickHotspot}
          disasters={disasters}
          disastersFetchedAt={disasterFeed?.fetchedAt ?? 0}
          selectedDisasterId={disaster?.id ?? null}
          onPickDisaster={pickDisaster}
        />
      </div>

      <ControlPanel
        sim={sim}
        theme={theme}
        onToggleTheme={toggleTheme}
        open={panelOpen}
        onOpenChange={setPanelOpen}
        tab={tab}
        onTabChange={setTab}
        speed={speed}
        onSpeedChange={setSpeed}
        filterActive={filterActive}
        layersActive={layersActive}
        view={
          <ViewTab
            sim={sim}
            theme={theme}
            schemeKey={schemeKey}
            scheme={scheme}
            onSchemeChange={(key) => {
              setSchemeKey(key)
              setHidden(new Set())
            }}
            filter={filter}
            hidden={hidden}
            onToggleHidden={(i) =>
              setHidden((prev) => {
                const next = new Set(prev)
                if (next.has(i)) next.delete(i)
                else next.add(i)
                return next
              })
            }
            onResetHidden={() => setHidden(new Set())}
            onMeetRandom={selectRandom}
            onFindMe={() => {
              setTab("filter")
              setFilterSubTab("me")
            }}
          />
        }
        filter={
          <FilterPanel
            sim={sim}
            spec={spec}
            source={filterSource}
            onSpecChange={(s, source) => {
              setSpec(s)
              setFilterSource(source)
            }}
            mode={filterMode}
            onModeChange={setFilterMode}
            me={me}
            onMeChange={setMe}
            dating={dating}
            onDatingChange={setDating}
            onShowPerson={showPerson}
            subTab={filterSubTab}
            onSubTabChange={setFilterSubTab}
          />
        }
        layers={
          <LayersPanel
            theme={theme}
            showVital={showVital}
            onShowVital={(v) => {
              vitalRef.current = emptyVitalStats()
              setShowVital(v)
            }}
            vitalRef={vitalRef}
            animals={animals}
            onAnimals={setAnimals}
            showUnrest={showUnrest}
            onShowUnrest={setShowUnrest}
            onFlyTo={flyTo}
            onPickHotspot={(h) => {
              setShowUnrest(true)
              pickHotspot(h)
            }}
            showDisasters={showDisasters}
            onShowDisasters={(v) => {
              setShowDisasters(v)
              if (!v) setDisaster(null)
            }}
            disasterFeed={disasterFeed}
            disastersLoading={disastersLoading}
            disastersError={disastersError}
            onRetryDisasters={retryDisasters}
            hiddenKinds={hiddenKinds}
            onHiddenKinds={setHiddenKinds}
            onPickDisaster={pickDisaster}
          />
        }
        settings={
          <SettingsTab
            exaggeration={exaggeration}
            onExaggeration={setExaggeration}
            showNight={showNight}
            onShowNight={setShowNight}
            autoRotate={autoRotate}
            onAutoRotate={setAutoRotate}
            theme={theme}
            onToggleTheme={toggleTheme}
            size={size}
            onSize={(n) => regenerate(n, seed)}
            detail={detail}
            onDetail={setDetail}
            onNewSample={() => regenerate(size, seed + 1)}
          />
        }
      />

      {personShown && (
        <PersonCard
          theme={theme}
          sim={sim}
          id={selectedId}
          incomePercentile={incomePercentile}
          follow={follow}
          onFollowChange={setFollow}
          onClose={() => onSelect(null)}
        />
      )}
      {disasterShown && <DisasterCard d={disaster} now={disasterFeed.fetchedAt} onClose={() => setDisaster(null)} />}
      {hotspotShown && <HotspotCard hotspot={hotspot} onClose={() => setHotspot(null)} />}

      {!hintDone && !personShown && !disasterShown && !hotspotShown && <TapHint />}
      <StatusBar sim={sim} altitudeRef={altitudeRef} showVital={showVital} vitalRef={vitalRef} hasSelection={personShown} />
    </main>
  )
}
