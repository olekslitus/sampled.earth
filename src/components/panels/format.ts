const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

export function formatHour(h: number) {
  const hh = Math.floor(h) % 24
  const mm = Math.floor((h - Math.floor(h)) * 60)
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`
}

export function weekdayName(d: number) {
  return DAYS[d]
}

export function formatUSD(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `$${Math.round(n / 1000)}k`
  return `$${Math.round(n).toLocaleString("en-US")}`
}

export function formatPeople(millions: number) {
  if (millions >= 1) return `${millions.toFixed(1)} million`
  if (millions >= 0.01) return `${Math.round(millions * 1000).toLocaleString("en-US")} thousand`
  const n = millions * 1e6
  const step = n >= 1000 ? 100 : n >= 100 ? 10 : 1
  return (Math.round(n / step) * step).toLocaleString("en-US")
}

export function formatUtc(ms: number) {
  const d = new Date(ms)
  return d.toLocaleString("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}
