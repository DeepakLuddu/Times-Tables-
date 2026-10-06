"use client"

import { RankMark } from "@/components/rank-mark"
import { useTheme } from "@/components/theme-provider"
import { BELT_LABEL, type Belt } from "@/lib/engine"
import { BELT_THRESHOLDS, type TableMastery } from "@/lib/mastery"
import { cn } from "@/lib/utils"
import { useEffect, useState } from "react"

// The whole journey as one path: seven rank stops joined by a line that fills
// as the child's tables progress, a "you are here" marker riding the line,
// and the next stop pulsing as the target. Each table has its own belt, so
// the marker sits at the AVERAGE mastery across all 12 tables — and every
// stop shows how many tables are currently at that rank, so the spread is
// visible as well as the average position.

const LINE_H = 6
const STOP_SIZE = 28 // matches RankMark size="sm" (size-7)
const MARKER_ROW = 28 // height reserved above the stops for the marker

function lineStyle(
  kind: "solid" | "dashed" | "dotted",
  color: string,
): React.CSSProperties {
  if (kind === "dashed") {
    return {
      height: LINE_H,
      backgroundImage: `repeating-linear-gradient(90deg, ${color} 0 9px, transparent 9px 15px)`,
    }
  }
  if (kind === "dotted") {
    return {
      height: LINE_H,
      backgroundImage: `radial-gradient(circle, ${color} 2.2px, transparent 2.7px)`,
      backgroundSize: "10px 6px",
      backgroundRepeat: "repeat-x",
    }
  }
  return { height: LINE_H, backgroundColor: color, borderRadius: 9999 }
}

// Where along the path (0 = first stop … 6 = last) an overall percent sits.
// Piecewise between the real belt thresholds so the marker is honest.
function pathPosition(percent: number): number {
  const mins = BELT_THRESHOLDS.map((t) => t.min)
  const last = mins.length - 1
  if (percent >= mins[last]) return last
  for (let i = 0; i < last; i++) {
    if (percent < mins[i + 1]) {
      return i + (percent - mins[i]) / (mins[i + 1] - mins[i])
    }
  }
  return last
}

export function BeltJourney({
  tables,
  onSelectTable,
}: {
  tables: TableMastery[]
  /** Open a table's full breakdown (same as tapping its card below). */
  onSelectTable?: (m: TableMastery) => void
}) {
  const { theme } = useTheme()
  const [openTier, setOpenTier] = useState<Belt | null>(null)
  const stops = BELT_THRESHOLDS
  const lastIdx = stops.length - 1

  const average = tables.length
    ? Math.round(tables.reduce((s, m) => s + m.percent, 0) / tables.length)
    : 0
  // The final stop means EVERY table is mastered — a strong average can't
  // reach it while even one table is still unfinished (11 perfect tables and
  // one at 82% still average 99%). Until then the marker stops just short.
  const toMaster = tables.filter((m) => m.state !== "mastered").length
  const allMastered = tables.length > 0 && toMaster === 0
  const overall = allMastered ? 100 : Math.min(average, 98)
  const heldBack = !allMastered && average >= 99
  const pos = pathPosition(overall)
  const nextIdx = stops.findIndex((t) => t.min > overall)
  const next = nextIdx === -1 ? null : stops[nextIdx]

  // Tables currently sitting at each rank (a challenge-ready table hasn't
  // earned the top rank yet, so it counts one below).
  const byTier: Partial<Record<Belt, TableMastery[]>> = {}
  for (const m of tables) {
    const tier: Belt = m.state === "challengeReady" ? "brown" : m.belt
    ;(byTier[tier] ??= []).push(m)
  }
  const openTables = openTier ? [...(byTier[openTier] ?? [])].sort((a, b) => a.table - b.table) : []

  // Animate the fill/marker in from the start on first paint.
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(id)
  }, [])
  const frac = shown ? pos / lastIdx : 0

  // The line runs between the centres of the first and last stop.
  const inset = 100 / stops.length / 2 // % of width
  const span = 100 - inset * 2

  const fullName = (belt: Belt) =>
    theme.id === "ninja" ? `${BELT_LABEL[belt]} Belt` : theme.ranks[belt]

  return (
    <section className="mt-5 rounded-2xl bg-card px-4 py-4 text-card-foreground shadow-sm">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-display text-xs font-semibold uppercase tracking-wide text-card-foreground/50">
          {theme.journeyTitle}
        </p>
        <p className="font-mono text-xs font-semibold text-card-foreground/60">
          {average}% average
        </p>
      </div>

      <div className="relative mt-1">
        {/* "You are here" marker riding the line */}
        <div className="relative" style={{ height: MARKER_ROW }}>
          <div
            className="absolute bottom-0 flex -translate-x-1/2 flex-col items-center transition-[left] duration-1000 ease-out"
            style={{ left: `${inset + span * frac}%` }}
            role="img"
            aria-label={`You are here, ${average}% average across your tables`}
          >
            <span className="text-lg leading-none drop-shadow-sm" aria-hidden="true">
              {theme.emoji}
            </span>
            <span className="-mt-0.5 text-[8px] leading-none text-primary" aria-hidden="true">
              ▼
            </span>
          </div>
        </div>

        {/* Track + fill, centred vertically on the stop medallions. */}
        <div
          className="pointer-events-none absolute"
          style={{
            left: `${inset}%`,
            width: `${span}%`,
            top: MARKER_ROW + STOP_SIZE / 2 - LINE_H / 2,
          }}
          aria-hidden="true"
        >
          <div
            className="w-full opacity-20"
            style={lineStyle(theme.pathLine, "var(--card-foreground)")}
          />
          <div
            className="absolute left-0 top-0 transition-[width] duration-1000 ease-out"
            style={{ width: `${frac * 100}%`, ...lineStyle(theme.pathLine, "var(--primary)") }}
          />
        </div>

        {/* Stops */}
        <div className="relative flex items-start">
          {stops.map((t, i) => {
            const reached = overall >= t.min
            const isNext = nextIdx === i
            const here = byTier[t.belt]?.length ?? 0
            const isOpen = openTier === t.belt
            return (
              <div key={t.belt} className="flex flex-1 flex-col items-center gap-1">
                <span
                  className={cn(
                    "relative rounded-full bg-card transition-opacity",
                    reached ? "opacity-100" : "opacity-40 grayscale",
                    isNext &&
                      "animate-pulse opacity-100 ring-2 ring-primary ring-offset-2 ring-offset-card grayscale-0",
                  )}
                >
                  <RankMark tier={t.belt} size="sm" medallion />
                </span>
                <span
                  className={cn(
                    "text-center font-sans text-[9px] leading-tight",
                    reached
                      ? "font-semibold text-card-foreground/80"
                      : "font-medium text-card-foreground/50",
                  )}
                >
                  {theme.id === "ninja" ? BELT_LABEL[t.belt] : theme.ranks[t.belt]}
                </span>
                {here > 0 ? (
                  <button
                    type="button"
                    onClick={() => setOpenTier(isOpen ? null : t.belt)}
                    aria-expanded={isOpen}
                    aria-label={`${here} ${here === 1 ? "table" : "tables"} at ${fullName(t.belt)} — tap to see them`}
                    className={cn(
                      "min-h-[20px] rounded-full px-2 font-mono text-[10px] font-bold leading-5 transition-colors active:scale-95",
                      isOpen
                        ? "bg-primary text-primary-foreground"
                        : "bg-primary/25 text-card-foreground hover:bg-primary/40",
                    )}
                  >
                    ×{here}
                  </button>
                ) : (
                  <span className="min-h-[20px]" aria-hidden="true" />
                )}
                {i === lastIdx && (
                  <span className="-mt-1 text-center font-sans text-[8px] leading-tight text-card-foreground/40">
                    Full Mastery
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {openTier && (
        <div className="mt-3 rounded-xl bg-card-foreground/10 px-3 py-3">
          <div className="flex items-center justify-between gap-2">
            <p className="font-display text-sm font-semibold text-card-foreground">
              {fullName(openTier)} · {openTables.length}{" "}
              {openTables.length === 1 ? "table" : "tables"}
            </p>
            <button
              type="button"
              onClick={() => setOpenTier(null)}
              aria-label="Close"
              className="flex size-6 items-center justify-center rounded-full text-card-foreground/50 hover:bg-card hover:text-card-foreground"
            >
              ✕
            </button>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {openTables.map((m) => (
              <button
                key={m.table}
                type="button"
                onClick={() => onSelectTable?.(m)}
                className="flex flex-col items-center rounded-lg bg-card px-2 py-1.5 text-card-foreground shadow-sm transition-transform active:scale-95"
              >
                <span className="font-mono text-base font-bold">{m.table}×</span>
                <span className="font-mono text-[10px] text-card-foreground/60">
                  {m.percent}%
                </span>
                {m.state === "challengeReady" && (
                  <span className="font-sans text-[9px] font-semibold text-primary">
                    {theme.challenge} ready
                  </span>
                )}
              </button>
            ))}
          </div>
          <p className="mt-2 text-center font-sans text-[10px] text-card-foreground/50">
            Tap a table to see its full breakdown
          </p>
        </div>
      )}

      <p className="mt-2 text-center font-sans text-xs text-card-foreground/70">
        {next
          ? heldBack
          ? `Next stop: ${fullName(next.belt)} — ${toMaster} ${toMaster === 1 ? "table" : "tables"} still to master`
          : `Next stop: ${fullName(next.belt)} — ${next.min - overall}% to go`
          : `You reached the top: ${fullName(stops[lastIdx].belt)}!`}
      </p>
    </section>
  )
}
