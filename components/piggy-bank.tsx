"use client"

import {
  DAILY_GOAL_SECONDS,
  SUBJECT_WEEKLY_CAP_CENTS,
  type PiggyBankSummary,
  formatCents,
  formatMinSec,
} from "@/lib/piggybank"
import { SUBJECT_ENGINES } from "@/lib/subjects"
import { cn } from "@/lib/utils"
import { forwardRef } from "react"

// Short, child-friendly subject labels for the compact balance row — the
// full engine labels ("Multiplication") are fine at this size, kept here
// only in case a future subject needs an abbreviation.
const AVAILABLE_SUBJECTS = Object.keys(SUBJECT_ENGINES) as (keyof typeof SUBJECT_ENGINES)[]

export { DAILY_GOAL_SECONDS }

export const PiggyBank = forwardRef<
  HTMLDivElement,
  {
    summary: PiggyBankSummary
    todaySeconds: number
    /** Bumping this remounts the balance number, replaying its pop/bounce. */
    bounceKey: number
  }
>(function PiggyBank({ summary, todaySeconds, bounceKey }, ref) {
  const weeklyPct = Math.min(
    100,
    (summary.earnedThisWeekCents / summary.weeklyCapCents) * 100,
  )
  const dailyDone = todaySeconds >= DAILY_GOAL_SECONDS
  const dailyPct = Math.min(100, (todaySeconds / DAILY_GOAL_SECONDS) * 100)

  return (
    <div
      ref={ref}
      className="rounded-2xl bg-card px-4 py-3 text-card-foreground shadow-md"
    >
      <div className="flex items-center gap-3">
        <span
          key={`icon-${bounceKey}`}
          className={cn(
            "text-3xl leading-none",
            bounceKey > 0 && "animate-piggy-shake",
          )}
          aria-hidden="true"
        >
          🐷
        </span>
        <div className="flex flex-1 flex-col leading-tight">
          <span className="font-display text-[10px] font-semibold uppercase tracking-wider text-card-foreground/50">
            My Piggy Bank
          </span>
          <span
            key={`balance-${bounceKey}`}
            className={cn(
              "font-mono text-3xl font-bold tabular-nums",
              bounceKey > 0 && "animate-piggy-pop",
            )}
          >
            {formatCents(summary.balanceCents)}
          </span>
        </div>
      </div>

      {/* Weekly earnings toward the $5 cap */}
      <div className="mt-2.5">
        <div className="flex items-center justify-between font-sans text-xs text-card-foreground/60">
          <span>This week</span>
          <span className="font-mono tabular-nums">
            {formatCents(summary.earnedThisWeekCents)} /{" "}
            {formatCents(summary.weeklyCapCents)}
          </span>
        </div>
        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-500",
              weeklyPct >= 100 ? "bg-primary" : "bg-secondary",
            )}
            style={{ width: `${weeklyPct}%` }}
          />
        </div>

        {/* Compact per-subject status — a simple checkmark once a subject's
            own $1 balanced share is full, otherwise its running total.
            Deliberately small/subdued: this is a hint, not a ledger. */}
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 font-sans text-[11px] text-card-foreground/50">
          {AVAILABLE_SUBJECTS.map((subject) => {
            const cents = summary.weeklyBreakdown.bySubjectCents[subject] ?? 0
            const full = cents >= SUBJECT_WEEKLY_CAP_CENTS
            return (
              <span key={subject} className="flex items-center gap-1">
                {SUBJECT_ENGINES[subject]!.label}
                {full ? (
                  <span className="text-secondary">✓</span>
                ) : (
                  <span className="font-mono tabular-nums">{formatCents(cents)}</span>
                )}
              </span>
            )
          })}
        </div>
      </div>

      {/* Daily active-practice goal */}
      <div className="mt-2 flex items-center justify-between font-sans text-xs">
        <span className="text-card-foreground/60">Today&apos;s practice</span>
        {dailyDone ? (
          <span className="font-display font-semibold text-secondary">
            Daily practice complete ✓
          </span>
        ) : (
          <span className="font-mono tabular-nums text-card-foreground/60">
            {formatMinSec(todaySeconds)} / {formatMinSec(DAILY_GOAL_SECONDS)}
          </span>
        )}
      </div>
      {!dailyDone && (
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary/70 transition-[width] duration-500"
            style={{ width: `${dailyPct}%` }}
          />
        </div>
      )}
    </div>
  )
})
