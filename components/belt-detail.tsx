"use client"

import { Belt } from "@/components/belt"
import { AnimatedPercentLabel, MasteryBar } from "@/components/mastery-bar"
import { BELT_LABEL } from "@/lib/engine"
import type { MasteryComponent, TableMastery } from "@/lib/mastery"
import { cn } from "@/lib/utils"
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

  const isChallengeReady = mastery.state === "challengeReady"
  const isMastered = mastery.state === "mastered"

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${mastery.table} times table mastery detail`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 px-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={cn(
          "w-full max-w-sm rounded-2xl bg-card px-6 py-6 text-card-foreground shadow-2xl",
          isMastered && "ring-2 ring-primary",
        )}
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
            <Belt
              tier={mastery.belt}
              locked={isChallengeReady}
              className="mt-1 h-3 w-16"
            />
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

        {isMastered ? (
          <div className="mt-4 flex flex-col items-center gap-1 rounded-xl bg-belt-black px-4 py-5 text-center">
            <span className="font-display text-lg font-bold uppercase tracking-wide text-white">
              Black Belt
            </span>
            <span className="font-mono text-4xl font-bold tabular-nums text-white">
              100%
            </span>
            <span className="font-display text-sm font-semibold text-primary">
              MASTERED ✓
            </span>
          </div>
        ) : (
          <>
            <div className="mt-4 flex items-baseline justify-between">
              <span className="font-display text-base font-semibold">
                {BELT_LABEL[mastery.belt]} Belt
                {!isChallengeReady && (
                  <>
                    {" — "}
                    <AnimatedPercentLabel
                      percent={mastery.percent}
                      className="font-mono text-base font-bold tabular-nums"
                    />
                  </>
                )}
              </span>
            </div>
            {!isChallengeReady && (
              <MasteryBar percent={mastery.percent} className="mt-2" />
            )}
            <p
              className={cn(
                "mt-2 font-display text-sm font-semibold",
                isChallengeReady ? "text-primary" : "text-foreground/60",
              )}
            >
              {mastery.stateLabel}
            </p>
          </>
        )}

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

        {isChallengeReady && (
          <button
            type="button"
            onClick={onClose}
            className="mt-5 flex w-full flex-col items-center gap-1 rounded-2xl bg-belt-black px-6 py-4 text-center transition-transform active:scale-[0.98]"
          >
            <span className="font-display text-lg font-bold text-white">
              Take Belt Challenge
            </span>
            <span className="font-sans text-xs text-white/70">
              One more correct answer in this table completes it
            </span>
          </button>
        )}
      </div>
    </div>
  )
}
