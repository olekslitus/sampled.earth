"use client"

import Link from "next/link"
import type { ReactNode } from "react"
import {
  Baby, BookOpen, Briefcase, Church, Clock, Flag, Globe2, GraduationCap, HeartPulse, Home, Landmark, Languages,
  MapPin, Plane, Scale, Users, Vote, Wallet, Wifi, WifiOff, X,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { INCOME_BRACKETS, SCHEME_BY_KEY, incomeBracket, paletteFor, schemeColors, type Theme } from "@/lib/sim/attributes"
import { EDUCATION_LEVELS, REGIONS, flagEmoji } from "@/lib/sim/countries"
import type { Simulation } from "@/lib/sim/engine"
import { LEANINGS, PARTY_FAMILIES, familyOf, leaningBucket, politicsOf } from "@/lib/sim/politics"
import type { Person } from "@/lib/sim/population"
import { ACTIVITY_CATEGORIES } from "@/lib/sim/schedule"
import { cn } from "@/lib/utils"
import { formatHour, formatPeople, formatUSD, weekdayName } from "./format"


interface PersonPanelProps {
  theme: Theme
  sim: Simulation
  id: number
  incomePercentile: (income: number) => number
  follow: boolean
  onFollowChange: (v: boolean) => void
  onClose: () => void
}

export function PersonPanel({ theme, sim, id, incomePercentile, follow, onFollowChange, onClose }: PersonPanelProps) {
  const ACTIVITY_COLORS = schemeColors(SCHEME_BY_KEY.get("activity")!, theme)
  const p = sim.personById(id)!
  const slot = sim.slotOf(id)!
  const { plan, local } = sim.planFor(slot)
  const now = sim.blocks[slot] ?? plan[0]
  const nowCat = now.ci
  const share = p.represents
  const pct = incomePercentile(p.income)
  const c = p.country

  const roleTitle = p.occupation
    ? p.occupation.title
    : {
        Pupil: "School pupil", Student: "University student", Child: p.age < 6 ? "Young child" : "Not in school",
        Retired: "Retired", Homemaker: "Homemaker / carer", Unemployed: "Looking for work", Worker: "Worker",
      }[p.role]

  return (
    <div className="flex max-h-full flex-col overflow-hidden rounded-xl border border-border bg-card/85 shadow-2xl backdrop-blur-md">
      <div className="flex items-start gap-3 p-4 pb-3">
        <div className="text-4xl leading-none" aria-hidden>
          {flagEmoji(c.iso2)}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold leading-tight">{p.name}</h2>
          <p className="text-sm text-muted-foreground">
            {p.age === 0 ? "Under 1" : p.age} · {p.gender} · {roleTitle}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="size-3" />
            {p.urban ? p.city.name : `Rural area near ${p.city.name}`}, {c.label}
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
          <X />
        </Button>
      </div>

      <div className="mx-4 rounded-lg border border-border bg-muted/60 p-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="size-3" /> {weekdayName(local.weekday)} {formatHour(local.hour)} local solar time
          </span>
          <div className="flex items-center gap-1.5">
            <Label htmlFor="follow" className="text-xs font-normal text-muted-foreground">
              Follow
            </Label>
            <Switch id="follow" size="sm" checked={follow} onCheckedChange={onFollowChange} />
          </div>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="size-2.5 shrink-0 rounded-full" style={{ background: ACTIVITY_COLORS[nowCat] }} />
          <span className="font-medium">{now.label}</span>
          <Badge variant="secondary" className="ml-auto">
            {now.cat}
          </Badge>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-4">
          <Section title="Background">
            <Row icon={p.immigrant ? <Plane /> : <Home />} label="Origin">
              {p.immigrant ? (
                <>
                  {flagEmoji(p.origin.iso2)} Immigrant from {p.origin.label}
                </>
              ) : (
                `Born in ${c.label}`
              )}
            </Row>
            <Row icon={<Languages />} label="Languages">
              {p.motherTongue}
              {p.otherLanguages.length > 0 && <span className="text-muted-foreground"> · also {p.otherLanguages.join(", ")}</span>}
            </Row>
            <Row icon={<Church />} label="Religion">
              {p.religion}
              {p.religion !== "Unaffiliated" && <span className="text-muted-foreground"> · {p.devout ? "practising" : "non-practising"}</span>}
            </Row>
            <Row icon={<Globe2 />} label="Lives in">
              {p.urban ? "City" : "Countryside"} · {REGIONS[c.region]}
            </Row>
          </Section>

          <PoliticsSection p={p} theme={theme} />

          <Section title="Work & money">
            <Row icon={<Briefcase />} label="Occupation">
              {roleTitle}
              {p.occupation && <span className="text-muted-foreground"> · {p.occupation.sector}{p.nightShift ? " · night shifts" : ""}</span>}
            </Row>
            <Row icon={<Wallet />} label="Income">
              {p.income > 0 ? (
                <>
                  {formatUSD(p.income)}/yr <span className="text-muted-foreground">(~{formatUSD(p.income / 12)}/mo)</span>
                </>
              ) : (
                <span className="text-muted-foreground">No personal income</span>
              )}
            </Row>
            <div className="ml-6 space-y-1.5">
              {p.income > 0 && (
                <>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Earns more than {Math.round(pct * 100)}% of earners worldwide</span>
                    <span>{INCOME_BRACKETS[incomeBracket(p.income)]}</span>
                  </div>
                  <div className="relative h-1.5 rounded-full bg-muted">
                    <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct * 100}%`, background: paletteFor(theme).s[0] }} />
                  </div>
                </>
              )}
              <p className="text-xs text-muted-foreground">
                Typical full-time earnings in {c.label}: {formatUSD(c.medianIncome)}/yr. Nominal US dollars, not adjusted for local prices.
              </p>
            </div>
          </Section>

          <Section title="Education & family">
            <Row icon={<GraduationCap />} label="Education">
              {p.age < 15 && p.educationNote ? (
                p.educationNote
              ) : (
                <>
                  {EDUCATION_LEVELS[p.education]}
                  {p.educationNote && <span className="text-muted-foreground"> · {p.educationNote}</span>}
                </>
              )}
            </Row>
            <Row icon={<Users />} label="Household">
              {p.age >= 18 && `${p.marital} · `}
              {p.household} {p.household === 1 ? "person" : "people"} at home
            </Row>
            {p.age >= 18 && (
              <Row icon={<Baby />} label="Children">
                {p.children === 0 ? "None" : p.children}
              </Row>
            )}
          </Section>

          <Section title="Lifestyle">
            <Row icon={p.internet ? <Wifi /> : <WifiOff />} label="Internet">
              {p.internet ? "Online" : "Offline"} <span className="text-muted-foreground">· {c.internet}% of {c.label} is online</span>
            </Row>
            <Row icon={<BookOpen />} label="Enjoys">
              {p.hobbies.join(", ")}
            </Row>
            <Row icon={<HeartPulse />} label="Life exp.">
              {c.lifeExpectancy} years <span className="text-muted-foreground">at birth in {c.label}</span>
            </Row>
          </Section>

          <Section title="Today">
            <ol className="space-y-0.5">
              {mergeRuns(plan).map((b) => {
                const active = local.hour >= b.start && local.hour < b.end
                const cat = ACTIVITY_CATEGORIES.indexOf(b.cat)
                return (
                  <li
                    key={b.start}
                    className={cn("grid grid-cols-[88px_10px_1fr] items-center gap-2 rounded-md px-1.5 py-0.5 text-xs", active ? "bg-muted text-foreground" : "text-muted-foreground")}
                  >
                    <span className="tabular-nums">
                      {formatHour(b.start)}–{formatHour(b.end)}
                    </span>
                    <span className="size-2 rounded-full" style={{ background: ACTIVITY_COLORS[cat] }} />
                    <span className={cn("truncate", active && "font-medium")}>{b.label}</span>
                  </li>
                )
              })}
            </ol>
          </Section>

          <Separator />
          <p className="text-xs leading-relaxed text-muted-foreground">
            A synthetic person sampled from national statistics
            {p.detail ? ", spawned for the area you zoomed into" : ""}. They stand in for about{" "}
            <span className="text-foreground">{formatPeople(share)}</span> real people.{" "}
            <Link href="/methodology" className="underline underline-offset-2 hover:text-foreground">
              How people are generated
            </Link>
          </p>
        </div>
      </ScrollArea>
    </div>
  )
}

function PoliticsSection({ p, theme }: { p: Person; theme: Theme }) {
  const c = p.country
  const cp = politicsOf(c)
  const pol = p.politics
  const leanColors = schemeColors(SCHEME_BY_KEY.get("leaning")!, theme)
  const familyColors = schemeColors(SCHEME_BY_KEY.get("party")!, theme)
  const system = (
    <Row icon={<Landmark />} label="System">
      {cp.regime}
      <span className="text-muted-foreground">
        {cp.noElections ? ` · ${cp.noElections}` : cp.turnout ? ` · ${cp.turnout}% turnout${cp.election ? ` (${cp.election})` : ""}` : ""}
      </span>
    </Row>
  )
  if (!pol) {
    return (
      <Section title="Politics">
        <Row icon={<Vote />} label="Voting">
          <span className="text-muted-foreground">Too young to vote</span>
        </Row>
        {system}
      </Section>
    )
  }
  const bucket = leaningBucket(pol.leaning)
  const family = familyOf(p)
  const party = pol.party
  return (
    <Section title="Politics">
      <Row icon={<Scale />} label="Leans">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 shrink-0 rounded-full" style={{ background: leanColors[bucket] }} />
          {LEANINGS[bucket]}
        </span>
        <span className="text-muted-foreground"> · {pol.leaning.toFixed(1)} on a 0 (left) – 10 (right) scale</span>
      </Row>
      <Row icon={<Flag />} label={cp.oneParty ? "Party" : "Supports"}>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 shrink-0 rounded-full" style={{ background: familyColors[family] }} />
          {party ? (party.generic ? `${party.name} (party family)` : party.name) : cp.oneParty ? "Not a party member" : "No party"}
        </span>
        {party && !party.generic && <span className="text-muted-foreground"> · {PARTY_FAMILIES[family]}</span>}
        {pol.member && <span className="text-muted-foreground"> · card-carrying member</span>}
        {party && !cp.oneParty && (
          <p className="text-xs text-muted-foreground">
            {party.generic
              ? `No party-level data for ${c.label}; shares follow a regional mix of party families.`
              : `${party.share}% of the vote${cp.official ? " (official result)" : ""} in the ${cp.election}.`}
          </p>
        )}
      </Row>
      <Row icon={<Vote />} label="Voted">
        {cp.noElections ? (
          <span className="text-muted-foreground">No national vote to take part in</span>
        ) : pol.voter ? (
          <>Yes{cp.election && <span className="text-muted-foreground"> · {cp.election}</span>}</>
        ) : (
          <>No{p.immigrant && <span className="text-muted-foreground"> · many immigrants can’t vote</span>}</>
        )}
      </Row>
      {system}
    </Section>
  )
}

function mergeRuns<T extends { start: number; end: number; label: string }>(plan: T[]): T[] {
  const out: T[] = []
  for (const b of plan) {
    const last = out[out.length - 1]
    if (last && last.label === b.label && Math.abs(last.end - b.start) < 0.01) out[out.length - 1] = { ...last, end: b.end }
    else out.push(b)
  }
  return out
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{title}</h3>
      {children}
    </section>
  )
}

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[16px_76px_1fr] items-start gap-2 text-sm">
      <span className="mt-0.5 text-muted-foreground [&_svg]:size-4">{icon}</span>
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0">{children}</span>
    </div>
  )
}
