"use client"

import { useState, type ReactNode } from "react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

/** Wrapping row of toggle chips; several may be on unless `single`. */
export function Chips<T extends string | number>({
  options, value, onChange, single, labels, disabled,
}: {
  options: readonly T[]
  value: readonly T[]
  onChange: (v: T[]) => void
  single?: boolean
  labels?: (v: T) => ReactNode
  /** options that can't be picked right now */
  disabled?: (v: T) => boolean
}) {
  return (
    <ToggleGroup
      variant="outline"
      size="sm"
      spacing={1}
      multiple={!single}
      className="w-full flex-wrap justify-start"
      value={value.map(String)}
      onValueChange={(v) => {
        const picked = (v as string[]).map((x) => options.find((o) => String(o) === x)!).filter((x) => x !== undefined)
        onChange(single ? picked.slice(-1) : picked)
      }}
    >
      {options.map((o) => (
        <ToggleGroupItem
          key={String(o)}
          value={String(o)}
          disabled={disabled?.(o)}
          className="h-6 px-2 text-[11px] aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary/90"
        >
          {labels ? labels(o) : String(o)}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

/**
 * Number field that keeps what you type while editing and only reports values inside
 * [min, max]; on blur it clamps to the range (or falls back to `fallback` when emptied).
 */
export function NumberInput({
  value, onChange, placeholder, min, max, fallback, className, "aria-label": ariaLabel,
}: {
  value: number | undefined
  onChange: (v: number | undefined) => void
  placeholder?: string
  min?: number
  max?: number
  /** used when the field is left empty; leave undefined to allow "no value" */
  fallback?: number
  className?: string
  "aria-label"?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const inRange = (n: number) => (min == null || n >= min) && (max == null || n <= max)
  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n))
  return (
    <Input
      type="number"
      inputMode="numeric"
      className={className ?? "h-7 text-xs"}
      placeholder={placeholder}
      aria-label={ariaLabel}
      min={min}
      max={max}
      value={draft ?? value ?? ""}
      onFocus={() => setDraft(value != null ? String(value) : "")}
      onChange={(e) => {
        const raw = e.target.value
        setDraft(raw)
        if (raw === "") {
          if (fallback === undefined) onChange(undefined)
          return
        }
        const n = Number(raw)
        if (Number.isFinite(n) && inRange(n)) onChange(n)
      }}
      onBlur={() => {
        const raw = draft ?? ""
        setDraft(null)
        const n = Number(raw)
        if (raw === "" || !Number.isFinite(n)) {
          if (value !== fallback) onChange(fallback)
        }
        else if (n !== value || !inRange(n)) onChange(clamp(n))
      }}
    />
  )
}

/** Compact select with an "Any" option mapped to undefined */
export function PickOne({
  value, onChange, options, placeholder = "Any",
}: {
  value: string | undefined
  onChange: (v: string | undefined) => void
  options: readonly { value: string; label: string }[]
  placeholder?: string
}) {
  const items = [{ value: "__any", label: placeholder }, ...options]
  return (
    <Select items={items} value={value ?? "__any"} onValueChange={(v) => onChange(!v || v === "__any" ? undefined : (v as string))}>
      <SelectTrigger size="sm" className="w-full text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
