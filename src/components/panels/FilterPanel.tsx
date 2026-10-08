"use client"

import { useDeferredValue, useMemo, useSyncExternalStore } from "react"
import { Heart, Sparkles, UserRound, X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { ROLE_GROUPS } from "@/lib/sim/attributes"
import { COUNTRIES, COUNTRY_BY_NAME, EDUCATION_LEVELS, REGIONS, RELIGIONS, type RegionCode, type Religion } from "@/lib/sim/countries"
import type { Simulation } from "@/lib/sim/engine"
import {
  compileFilter, countrySamplesVersion, describe, estimate, isEmptySpec, subscribeCountrySamples, type Estimate, type FilterSpec,
} from "@/lib/sim/filter"
import { closestTwin, datingSpec, meToSpec, type DatingPrefs, type MeProfile } from "@/lib/sim/me"
import { LEANINGS, NO_PARTY, PARTY_FAMILIES } from "@/lib/sim/politics"
import { HOBBY_NAMES, type Person } from "@/lib/sim/population"
import { ACTIVITY_CATEGORIES } from "@/lib/sim/schedule"
import { useTicker } from "@/components/hooks"
import { Chips, Field, NumberInput, PickOne } from "./fields"
import { formatPeople } from "./format"
import { cn } from "@/lib/utils"

const REGION_KEYS = Object.keys(REGIONS) as RegionCode[]
const COUNTRY_OPTIONS = [...COUNTRIES].sort((a, b) => a.label.localeCompare(b.label)).map((c) => ({ value: c.name, label: c.label }))
const LANGUAGE_OPTIONS = [...new Set(COUNTRIES.flatMap((c) => c.languages.map((l) => l.name)).filter((l) => l !== "Other"))]
  .sort()
  .map((l) => ({ value: l, label: l }))
const RELIGION_OPTIONS = RELIGIONS.map((r) => ({ value: r, label: r }))
const EDUCATION_OPTIONS = EDUCATION_LEVELS.map((l, i) => ({ value: String(i), label: l }))
const GENDERS: Person["gender"][] = ["Female", "Male"]
const LEANING_OPTIONS = LEANINGS.map((l, i) => ({ value: String(i), label: l }))
const MARITAL: Person["marital"][] = ["Single", "Married", "Divorced", "Widowed"]

export type FilterSource = "filter" | "me" | "dating"
export type FilterSubTab = "traits" | "me" | "dating"

/** `estimate` with an extra argument that only exists to key the memo below */
const estimateAt = (sim: Simulation, spec: FilterSpec, tick: number, samples: number) => {
  void tick
  void samples
  return estimate(sim, spec)
}

/**
 * Head count for a filter. Scanning the whole sample is too slow to repeat on every
 * render, so it runs only when the spec or the population changes, plus once a second
 * while the answer can drift by itself (people still being sampled, or "doing right now"),
 * and again when a background country sample finishes.
 */
function useEstimate(sim: Simulation, spec: FilterSpec | null): Estimate | null {
  const deferred = useDeferredValue(spec)
  const live = deferred != null && (sim.progress < 1 || !!deferred.activities?.length)
  const tick = useTicker(live ? 1000 : null)
  const samples = useSyncExternalStore(subscribeCountrySamples, countrySamplesVersion, countrySamplesVersion)
  return useMemo(() => (deferred ? estimateAt(sim, deferred, tick, samples) : null), [sim, deferred, tick, samples])
}

interface FilterPanelProps {
  sim: Simulation
  spec: FilterSpec
  onSpecChange: (spec: FilterSpec, source: FilterSource) => void
  source: FilterSource
  mode: "grey" | "hide"
  onModeChange: (m: "grey" | "hide") => void
  me: MeProfile
  onMeChange: (me: MeProfile) => void
  dating: DatingPrefs
  onDatingChange: (d: DatingPrefs) => void
  onShowPerson: (id: number) => void
  subTab: FilterSubTab
  onSubTabChange: (t: FilterSubTab) => void
}

export function FilterPanel(props: FilterPanelProps) {
  const { sim, spec, mode, onModeChange, source } = props
  const active = !isEmptySpec(spec)
  const chips = describe(spec)
  const est = useEstimate(sim, active ? spec : null)

  return (
    <div className="space-y-3">
      <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium">
            {active ? { filter: "Custom filter", me: "People like you", dating: "Your dating pool" }[source] : "No filter"}
          </span>
          {active && (
            <Button variant="ghost" size="xs" onClick={() => props.onSpecChange({}, "filter")}>
              <X /> Clear
            </Button>
          )}
        </div>
        {active && est ? (
          <>
            <EstimateLine est={est} />
            <div className="flex flex-wrap gap-1">
              {chips.map((c) => (
                <Badge key={c} variant="secondary" className="text-[10px] font-normal">
                  {c}
                </Badge>
              ))}
            </div>
          </>
        ) : (
          <p className="text-[11px] text-muted-foreground">Pick traits below and only matching people stay coloured.</p>
        )}
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">Everyone else</span>
          <ToggleGroup variant="outline" size="sm" spacing={0} value={[mode]} onValueChange={(v) => v[0] && onModeChange(v[0] as "grey" | "hide")}>
            <ToggleGroupItem value="grey" className="h-6 px-2 text-[11px]">
              Grey
            </ToggleGroupItem>
            <ToggleGroupItem value="hide" className="h-6 px-2 text-[11px]">
              Hidden
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      <Tabs value={props.subTab} onValueChange={(v) => props.onSubTabChange(v as FilterSubTab)}>
        <TabsList className="w-full">
          <TabsTrigger value="traits" className="text-xs">
            Traits
          </TabsTrigger>
          <TabsTrigger value="me" className="text-xs">
            <UserRound /> Find me
          </TabsTrigger>
          <TabsTrigger value="dating" className="text-xs">
            <Heart /> Dating
          </TabsTrigger>
        </TabsList>
        <TabsContent value="traits" className="pt-2">
          <FilterForm spec={spec} onChange={(s) => props.onSpecChange(s, "filter")} />
        </TabsContent>
        <TabsContent value="me" className="pt-2">
          <FindMe {...props} />
        </TabsContent>
        <TabsContent value="dating" className="pt-2">
          <Dating {...props} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function EstimateLine({ est }: { est: Estimate }) {
  const oneIn = est.share > 0 ? Math.round(1 / est.share) : 0
  return (
    <p className="text-sm">
      <span className="font-semibold tabular-nums">≈ {formatPeople(est.people)}</span>{" "}
      <span className="text-muted-foreground">
        {est.people === 0
          ? "people. Too rare to find in this sample."
          : est.share >= 0.01
            ? `people · ${(est.share * 100).toFixed(1)}% of humanity`
            : `people · 1 in ${oneIn.toLocaleString("en-US")}`}
        {est.approximate && est.people > 0 ? " (estimated from trait frequencies)" : ""}
      </span>
    </p>
  )
}

function FilterForm({ spec, onChange }: { spec: FilterSpec; onChange: (s: FilterSpec) => void }) {
  const set = (patch: Partial<FilterSpec>) => onChange({ ...spec, ...patch })
  const one = <T,>(v: T[]) => (v.length ? v[0] : undefined)
  return (
    <div className="space-y-3">
      <Field label="World region">
        <Chips options={REGION_KEYS} value={spec.regions ?? []} onChange={(v) => set({ regions: v })} labels={(r) => REGIONS[r]} />
      </Field>
      <Field label="Country">
        <PickOne options={COUNTRY_OPTIONS} value={spec.countries?.[0]} onChange={(v) => set({ countries: v ? [v] : undefined })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Gender">
          <Chips options={GENDERS} value={spec.genders ?? []} onChange={(v) => set({ genders: v })} />
        </Field>
        <Field label="Age">
          <div className="flex items-center gap-1">
            <NumberInput value={spec.ageMin} onChange={(v) => set({ ageMin: v })} placeholder="from" min={0} max={spec.ageMax ?? 99} aria-label="Minimum age" />
            <NumberInput value={spec.ageMax} onChange={(v) => set({ ageMax: v })} placeholder="to" min={spec.ageMin ?? 0} max={99} aria-label="Maximum age" />
          </div>
        </Field>
      </div>
      <Field label="Religion">
        <Chips options={RELIGIONS} value={spec.religions ?? []} onChange={(v) => set({ religions: v })} />
        <label className="flex items-center gap-2 text-xs">
          <Checkbox checked={!!spec.devoutOnly} onCheckedChange={(c) => set({ devoutOnly: !!c || undefined })} /> Practising only
        </label>
      </Field>
      <Field label="Education">
        <Chips options={[0, 1, 2, 3]} value={spec.education ?? []} onChange={(v) => set({ education: v })} labels={(i) => EDUCATION_LEVELS[i]} />
      </Field>
      <Field label="Personal income (USD / year)">
        <div className="flex items-center gap-1">
          <NumberInput value={spec.incomeMin} onChange={(v) => set({ incomeMin: v })} placeholder="min" min={0} max={spec.incomeMax} aria-label="Minimum income, USD per year" />
          <NumberInput value={spec.incomeMax} onChange={(v) => set({ incomeMax: v })} placeholder="max" min={spec.incomeMin ?? 0} aria-label="Maximum income, USD per year" />
        </div>
      </Field>
      <Field label="Occupation">
        <Chips options={ROLE_GROUPS.map((_, i) => i)} value={spec.roles ?? []} onChange={(v) => set({ roles: v })} labels={(i) => ROLE_GROUPS[i]} />
      </Field>
      <Field label="Marital status">
        <Chips options={MARITAL} value={spec.marital ?? []} onChange={(v) => set({ marital: v })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Lives in">
          <Chips single options={["urban", "rural"] as const} value={spec.settlement ? [spec.settlement] : []} onChange={(v) => set({ settlement: one(v) })} labels={(v) => (v === "urban" ? "City" : "Countryside")} />
        </Field>
        <Field label="Background">
          <Chips single options={["native", "immigrant"] as const} value={spec.background ? [spec.background] : []} onChange={(v) => set({ background: one(v) })} labels={(v) => (v === "native" ? "Native" : "Immigrant")} />
        </Field>
        <Field label="Internet">
          <Chips single options={["online", "offline"] as const} value={spec.internet ? [spec.internet] : []} onChange={(v) => set({ internet: one(v) })} labels={(v) => (v === "online" ? "Online" : "Offline")} />
        </Field>
        <Field label="Children">
          <Chips single options={["none", "some"] as const} value={spec.children ? [spec.children] : []} onChange={(v) => set({ children: one(v) })} labels={(v) => (v === "none" ? "None" : "Has kids")} />
        </Field>
      </div>
      <Field label="Speaks">
        <PickOne options={LANGUAGE_OPTIONS} value={spec.languages?.[0]} onChange={(v) => set({ languages: v ? [v] : undefined })} />
      </Field>
      <Field label="Into">
        <Chips options={HOBBY_NAMES} value={spec.hobbies ?? []} onChange={(v) => set({ hobbies: v })} />
      </Field>
      <Field label="Political leaning" hint="Adults only; self-placement on a left–right scale">
        <Chips options={LEANINGS.map((_, i) => i)} value={spec.leanings ?? []} onChange={(v) => set({ leanings: v })} labels={(i) => LEANINGS[i]} />
      </Field>
      <Field label="Party family">
        <Chips options={PARTY_FAMILIES.map((_, i) => i)} value={spec.partyFamilies ?? []} onChange={(v) => set({ partyFamilies: v })} labels={(i) => (i === NO_PARTY ? "No party" : PARTY_FAMILIES[i])} />
      </Field>
      <Field label="Voted at the last national election">
        <Chips single options={["yes", "no"] as const} value={spec.voted ? [spec.voted] : []} onChange={(v) => set({ voted: one(v) })} labels={(v) => (v === "yes" ? "Voted" : "Didn’t vote")} />
      </Field>
      <Field label="Doing right now" hint="Updates live as the day goes by">
        <Chips options={ACTIVITY_CATEGORIES.map((_, i) => i)} value={spec.activities ?? []} onChange={(v) => set({ activities: v })} labels={(i) => ACTIVITY_CATEGORIES[i]} />
      </Field>
    </div>
  )
}

function FindMe({ sim, me, onMeChange, onSpecChange, onShowPerson }: FilterPanelProps) {
  const set = (patch: Partial<MeProfile>) => onMeChange({ ...me, ...patch })
  const spec = useMemo(() => meToSpec(me), [me])
  const empty = isEmptySpec(spec)
  const est = useEstimate(sim, empty ? null : spec)
  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground">Tell us as much or as little as you like. Nothing leaves your browser.</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Country">
          <PickOne options={COUNTRY_OPTIONS} value={me.country} onChange={(v) => set({ country: v })} />
        </Field>
        <Field label="Age">
          <NumberInput value={me.age} onChange={(v) => set({ age: v })} placeholder="e.g. 31" min={0} max={110} aria-label="Your age" />
        </Field>
        <Field label="Gender">
          <Chips single options={GENDERS} value={me.gender ? [me.gender] : []} onChange={(v) => set({ gender: v[0] })} />
        </Field>
        <Field label="Religion">
          <PickOne options={RELIGION_OPTIONS} value={me.religion} onChange={(v) => set({ religion: v as Religion | undefined })} placeholder="Prefer not to say" />
        </Field>
        <Field label="Education">
          <PickOne options={EDUCATION_OPTIONS} value={me.education != null ? String(me.education) : undefined} onChange={(v) => set({ education: v != null ? Number(v) : undefined })} placeholder="Prefer not to say" />
        </Field>
        <Field label="Income (USD / year)">
          <NumberInput value={me.income} onChange={(v) => set({ income: v })} placeholder="e.g. 40000" min={0} aria-label="Your income, USD per year" />
        </Field>
        <Field label="Lives in">
          <Chips single options={["urban", "rural"] as const} value={me.settlement ? [me.settlement] : []} onChange={(v) => set({ settlement: v[0] })} labels={(v) => (v === "urban" ? "City" : "Countryside")} />
        </Field>
        <Field label="Children">
          <Chips single options={["none", "some"] as const} value={me.children ? [me.children] : []} onChange={(v) => set({ children: v[0] })} labels={(v) => (v === "none" ? "None" : "Has kids")} />
        </Field>
      </div>
      <Field label="Marital status">
        <Chips single options={MARITAL} value={me.marital ? [me.marital] : []} onChange={(v) => set({ marital: v[0] })} />
      </Field>
      <Field label="Language">
        <PickOne options={LANGUAGE_OPTIONS} value={me.language} onChange={(v) => set({ language: v })} placeholder="Prefer not to say" />
      </Field>
      <Field label="Politics">
        <PickOne options={LEANING_OPTIONS} value={me.leaning != null ? String(me.leaning) : undefined} onChange={(v) => set({ leaning: v != null ? Number(v) : undefined })} placeholder="Prefer not to say" />
      </Field>
      <Field label="Hobbies" hint="Used for your twin and dating matches">
        <Chips options={HOBBY_NAMES} value={me.hobbies ?? []} onChange={(v) => set({ hobbies: v })} />
      </Field>

      <Separator />
      {est ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">People on Earth who share all of this:</p>
          <EstimateLine est={est} />
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" onClick={() => onSpecChange(spec, "me")}>
              Show them
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const id = closestTwin(sim, me)
                if (id != null) onShowPerson(id)
              }}
            >
              <Sparkles /> Closest twin
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Fill in a few traits to see how many “you”s there are.</p>
      )}
    </div>
  )
}

function Dating({ sim, me, dating, onDatingChange, onSpecChange, onShowPerson }: FilterPanelProps) {
  const set = (patch: Partial<DatingPrefs>) => onDatingChange({ ...dating, ...patch })
  const spec = useMemo(() => datingSpec(dating, me, (c) => COUNTRY_BY_NAME.get(c)?.region), [dating, me])
  const est = useEstimate(sim, spec)!
  const randomMatch = () => {
    const f = compileFilter(spec)
    const ids: number[] = []
    sim.forEachShown(false, (p, i) => {
      if (!f || f.test(p, i, sim)) ids.push(p.id)
    })
    if (ids.length) onShowPerson(ids[Math.floor(Math.random() * ids.length)])
  }
  const perDay = est.people * 1e6
  const years = perDay / 365
  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground">
        Only single, divorced or widowed adults. “My language”, “my country” and hobbies come from the Find me tab.
      </p>
      <Field label="Interested in">
        <Chips options={GENDERS} value={dating.genders} onChange={(v) => set({ genders: v })} labels={(g) => (g === "Female" ? "Women" : "Men")} />
      </Field>
      <Field label="Age">
        <div className="flex items-center gap-1">
          <NumberInput value={dating.ageMin} onChange={(v) => set({ ageMin: v ?? 18 })} fallback={18} min={18} max={dating.ageMax} aria-label="Partner minimum age" />
          <span className="text-xs text-muted-foreground">to</span>
          <NumberInput value={dating.ageMax} onChange={(v) => set({ ageMax: v ?? 99 })} fallback={99} min={dating.ageMin} max={99} aria-label="Partner maximum age" />
        </div>
      </Field>
      <Field label="Where" hint={!me.country ? "Set your country in Find me to narrow this down" : undefined}>
        <Chips
          single
          options={["country", "region", "anywhere"] as const}
          value={[me.country ? dating.where : "anywhere"]}
          disabled={(w) => w !== "anywhere" && !me.country}
          onChange={(v) => v[0] && set({ where: v[0] })}
          labels={(w) => ({ country: "My country", region: "My region", anywhere: "Anywhere" })[w]}
        />
      </Field>
      <Field label="Religion" hint="Leave empty for any">
        <Chips options={RELIGIONS} value={dating.religions} onChange={(v) => set({ religions: v })} />
      </Field>
      <div className="grid grid-cols-[1fr_1.15fr] gap-3">
        <Field label="Education at least">
          <PickOne
            options={EDUCATION_OPTIONS.slice(1)}
            value={dating.minEducation ? String(dating.minEducation) : undefined}
            onChange={(v) => set({ minEducation: v ? Number(v) : 0 })}
          />
        </Field>
        <Field label="Min. income (USD / year)">
          <NumberInput value={dating.incomeMin} onChange={(v) => set({ incomeMin: v })} placeholder="any" min={0} aria-label="Partner minimum income, USD per year" />
        </Field>
      </div>
      <Field label="Politics" hint={me.leaning == null ? "Set your own politics in Find me first" : undefined}>
        <Chips
          single
          options={["same", "near"] as const}
          value={dating.politics && me.leaning != null ? [dating.politics] : []}
          disabled={() => me.leaning == null}
          onChange={(v) => set({ politics: v[0] })}
          labels={(v) => (v === "same" ? "Same as mine" : "Close to mine (±1 step)")}
        />
      </Field>
      <Field label="Lives in">
        <Chips single options={["urban", "rural"] as const} value={dating.settlement ? [dating.settlement] : []} onChange={(v) => set({ settlement: v[0] })} labels={(v) => (v === "urban" ? "City" : "Countryside")} />
      </Field>
      <div className="space-y-2">
        {(
          [
            ["sharedLanguage", "Speaks my language", me.language ? null : "set your language in Find me"],
            ["sharedHobby", "Shares a hobby with me", me.hobbies?.length ? null : "pick hobbies in Find me"],
            ["noChildren", "No children", null],
          ] as const
        ).map(([key, label, missing]) => (
          <Label key={key} className={cn("flex items-start gap-2 text-xs font-normal", missing && "text-muted-foreground")}>
            <Checkbox className="mt-px" checked={!missing && dating[key]} disabled={!!missing} onCheckedChange={(c) => set({ [key]: !!c })} />
            <span>
              {label}
              {missing && <span className="block text-[11px]">To use this, {missing}.</span>}
            </span>
          </Label>
        ))}
      </div>

      <Separator />
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Your potential partners:</p>
        <EstimateLine est={est} />
        {est.people > 0 && (
          <p className="text-[11px] text-muted-foreground">
            Meeting one new match a day, you would need {years >= 1 ? `${Math.round(years).toLocaleString("en-US")} years` : `${Math.round(perDay)} days`} to meet them all.
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" onClick={() => onSpecChange(spec, "dating")}>
            <Heart /> Show matches
          </Button>
          <Button size="sm" variant="secondary" onClick={randomMatch}>
            Random match
          </Button>
        </div>
      </div>
    </div>
  )
}
