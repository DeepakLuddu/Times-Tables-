"use client"

import {
  DAILY_GOAL_SECONDS,
  type PiggyBankSummary,
  formatCents,
  formatMinSec,
} from "@/lib/piggybank"
import { cn } from "@/lib/utils"
import { forwardRef } from "react"

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
