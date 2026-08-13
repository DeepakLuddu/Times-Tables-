"use client"

import { Belt } from "@/components/belt"
import { AnimatedPercentLabel, MasteryBar } from "@/components/mastery-bar"
import type { MasteryComponent, TableMastery } from "@/lib/mastery"
import { Check, X } from "lucide-react"

// Which components to show the child, in this order — matches the spec's
// example breakdown. "Weak facts cleared" still counts toward the percent
// but isn't shown as its own row: it's folded into "Fact mastery" so the
// list stays short enough for a 9-year-old to actually read.
const DISPLAY_KEYS: MasteryComponent["key"][] = [
  "volume",
  "recentAccuracy",
  "longTermAccuracy",
  "factCoverage",
  "fluency",
  "sessions",
  "daysSpread",
]

export function BeltDetail({
  mastery,
  onClose,
}: {
  mastery: TableMastery
  onClose: () => void
}) {
  const rows = DISPLAY_KEYS.map((key) =>
    mastery.components.find((c) => c.key === key),
  ).filter((c): c is MasteryComponent => c !== undefined)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${mastery.table} times table mastery detail`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 px-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-card px-6 py-6 text-card-foreground shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <span className="font-mono text-3xl font-bold">
            {mastery.table}
          </span>
          <div>
            <p className="font-display text-lg font-semibold">
              {mastery.table} Times Table
            </p>
            <Belt tier={mastery.belt} className="mt-1 h-3 w-16" />
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto flex size-9 items-center justify-center rounded-full text-card-foreground/50 transition-colors hover:bg-muted hover:text-card-foreground"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <AnimatedPercentLabel
            percent={mastery.percent}
            className="font-mono text-4xl font-bold tabular-nums"
          />
          <span className="font-display text-sm font-semibold text-primary">
            {mastery.stateLabel}
          </span>
        </div>
        <MasteryBar percent={mastery.percent} className="mt-2" />

        <ul className="mt-5 flex flex-col divide-y divide-border/50">
          {rows.map((c) => (
            <li
              key={c.key}
              className="flex items-center justify-between py-2 font-sans text-sm"
            >
              <span className="text-card-foreground/80">{c.label}</span>
              <span className="flex items-center gap-1.5 font-mono text-sm font-semibold">
                {c.numerator} / {c.denominator}
                {c.complete ? (
                  <Check className="size-4 text-secondary" aria-label="Complete" />
                ) : null}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-5 rounded-xl bg-muted px-4 py-3">
          <p className="font-sans text-sm text-foreground/80">
            {mastery.recommendation}
          </p>
        </div>
      </div>
    </div>
  )
}
