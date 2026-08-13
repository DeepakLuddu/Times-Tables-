"use client"

import type { AnyRecord } from "@/components/personal-best-card"
import { formatClock, formatShortDate } from "@/lib/personal-bests"
import { Flame, Target, TrendingUp, X, Zap } from "lucide-react"
import type { LucideIcon } from "lucide-react"

const ICONS: Record<AnyRecord["key"], LucideIcon> = {
  fastestCleanRun: Zap,
  longestStreak: Flame,
  bestAccuracy: Target,
  mostImproved: TrendingUp,
}

const TITLES: Record<AnyRecord["key"], string> = {
  fastestCleanRun: "Fastest Clean Run",
  longestStreak: "Longest Streak",
  bestAccuracy: "Best Accuracy",
  mostImproved: "Most Improved",
}

function currentValue(record: AnyRecord): string {
  switch (record.key) {
    case "fastestCleanRun":
      return record.elapsedMs !== null ? formatClock(record.elapsedMs) : "—"
    case "longestStreak":
      return String(record.streak)
    case "bestAccuracy":
      return `${record.accuracy}%`
    case "mostImproved":
      return record.table ? `${record.table} Times Table` : "—"
  }
}

export function PersonalBestDetail({
  record,
  onClose,
}: {
  record: AnyRecord
  onClose: () => void
}) {
  const Icon = ICONS[record.key]
  // Most recent first, capped — this is a quick look back, not an
  // analytics dashboard.
  const history = record.history.slice(0, 6)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${TITLES[record.key]} record history`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 px-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-card px-6 py-6 text-card-foreground shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Icon className="size-5" />
          </div>
          <p className="font-display text-lg font-semibold">
            {TITLES[record.key]}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto flex size-9 items-center justify-center rounded-full text-card-foreground/50 transition-colors hover:bg-muted hover:text-card-foreground"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="mt-4">
          <p className="font-sans text-xs uppercase tracking-wide text-card-foreground/50">
            Current record
          </p>
          <p className="font-mono text-4xl font-bold tabular-nums">
            {currentValue(record)}
          </p>
        </div>

        {history.length > 0 ? (
          <div className="mt-5">
            <p className="font-sans text-xs uppercase tracking-wide text-card-foreground/50">
              Previous records
            </p>
            <ul className="mt-2 flex flex-col divide-y divide-border/50">
              {history.map((h, i) => (
                <li
                  key={`${h.date}-${i}`}
                  className="flex items-center justify-between py-2 font-sans text-sm"
                >
                  <span className="font-mono font-semibold">{h.label}</span>
                  <span className="text-card-foreground/50">
                    {formatShortDate(h.date)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-5 font-sans text-sm text-card-foreground/50">
            This is your first record here — keep going to build a history.
          </p>
        )}
      </div>
    </div>
  )
}
