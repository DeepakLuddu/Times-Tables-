"use client"

import type {
  BestAccuracyRecord,
  FastestCleanRunRecord,
  LongestStreakRecord,
  MostImprovedRecord,
} from "@/lib/personal-bests"
import { formatClock, formatShortDate } from "@/lib/personal-bests"
import { cn } from "@/lib/utils"
import { Flame, Target, TrendingUp, Zap } from "lucide-react"
import type { LucideIcon } from "lucide-react"

export type AnyRecord =
  | FastestCleanRunRecord
  | LongestStreakRecord
  | BestAccuracyRecord
  | MostImprovedRecord

interface CardContent {
  icon: LucideIcon
  title: string
  value: string
  sublabel: string
  lockedMessage: string
}

function contentFor(record: AnyRecord): CardContent {
  switch (record.key) {
    case "fastestCleanRun":
      return {
        icon: Zap,
        title: "Fastest Clean Run",
        value: record.achieved ? formatClock(record.elapsedMs!) : "—",
        sublabel: record.achieved
          ? `${record.questions} / ${record.questions} correct`
          : "20 in a row, no mistakes",
        lockedMessage: "Get 20 correct in a row to set this record",
      }
    case "longestStreak":
      return {
        icon: Flame,
        title: "Longest Streak",
        value: record.achieved ? String(record.streak) : "—",
        sublabel: "correct answers",
        lockedMessage: "Answer a question correctly to start your streak",
      }
    case "bestAccuracy":
      return {
        icon: Target,
        title: "Best Accuracy",
        value: record.achieved ? `${record.accuracy}%` : "—",
        sublabel: record.achieved
          ? `${record.correct} / ${record.questions} correct`
          : "Best score in one sitting",
        lockedMessage: "Play 20+ questions in one sitting to unlock",
      }
    case "mostImproved":
      return {
        icon: TrendingUp,
        title: "Most Improved",
        value: record.achieved ? `${record.table} Times Table` : "—",
        sublabel: record.achieved
          ? `${record.earlyAccuracy}% → ${record.recentAccuracy}% (+${record.improvement}%)`
          : "Your most-improved table",
        lockedMessage: "Keep practising to unlock this record",
      }
  }
}

export function PersonalBestCard({
  record,
  onTap,
}: {
  record: AnyRecord
  onTap: () => void
}) {
  const { icon: Icon, title, value, sublabel, lockedMessage } =
    contentFor(record)

  return (
    <button
      type="button"
      onClick={onTap}
      disabled={!record.achieved}
      className={cn(
        "flex flex-col items-start gap-1.5 rounded-3xl bg-card px-5 py-5 text-left text-card-foreground shadow-md transition-transform",
        record.achieved && "active:scale-[0.97]",
        !record.achieved && "opacity-70",
      )}
    >
      <div className="flex items-center gap-2 text-primary">
        <Icon className="size-5" />
        <span className="font-display text-sm font-semibold uppercase tracking-wide text-card-foreground/60">
          {title}
        </span>
      </div>

      {record.achieved ? (
        <>
          <span className="font-mono text-4xl font-bold tabular-nums">
            {value}
          </span>
          <span className="font-sans text-sm text-card-foreground/60">
            {sublabel}
          </span>
          {record.date && (
            <span className="mt-1 font-sans text-xs text-card-foreground/40">
              Set {formatShortDate(record.date)}
            </span>
          )}
        </>
      ) : (
        <p className="mt-1 text-balance font-sans text-sm text-card-foreground/50">
          {lockedMessage}
        </p>
      )}
    </button>
  )
}
