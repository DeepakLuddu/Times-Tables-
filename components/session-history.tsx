"use client"

import { getSessionLog } from "@/app/actions/dojo"
import { BELT_LABEL } from "@/lib/engine"
import { formatCents, formatMinSec } from "@/lib/piggybank"
import type { DetailedSession } from "@/lib/session-log"
import { useEffect, useState } from "react"

const MODE_LABEL: Record<string, string> = {
  practice: "Practice",
  sprint: "Sprint",
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })
}

// The detailed, per-session log a parent might want for review — date,
// time spent, question counts, tables practised, mastery/belt movement,
// and Piggy Bank earnings. This used to be the child-facing "Past
// Sessions" list; it's here now instead, since a parent reviewing
// progress is exactly who this level of raw detail is for.
export function SessionHistory({ playerId }: { playerId: string }) {
  const [sessions, setSessions] = useState<DetailedSession[] | null>(null)

  useEffect(() => {
    if (!playerId) return
    void getSessionLog(playerId).then(setSessions)
  }, [playerId])

  return (
    <section className="mt-4 rounded-2xl bg-card px-5 py-4 text-card-foreground shadow-md">
      <h2 className="font-display text-base font-semibold">
        Session history
      </h2>
      <p className="font-sans text-xs text-card-foreground/60">
        Every session in detail, most recent first.
      </p>

      {!sessions ? (
        <p className="mt-3 font-sans text-sm text-card-foreground/50">
          Loading…
        </p>
      ) : sessions.length === 0 ? (
        <p className="mt-3 font-sans text-sm text-card-foreground/50">
          No sessions yet.
        </p>
      ) : (
        <ul className="mt-3 flex max-h-[28rem] flex-col divide-y divide-border/50 overflow-y-auto">
          {sessions.map((s) => (
            <li key={s.sessionId} className="py-3 first:pt-0">
              <div className="flex items-center justify-between">
                <span className="font-display text-sm font-semibold">
                  {MODE_LABEL[s.mode] ?? s.mode} · {formatDate(s.date)}
                </span>
                <span className="font-mono text-xs font-semibold text-card-foreground/60">
                  {formatMinSec(s.timeSpentSeconds)}
                </span>
              </div>
              <p className="mt-1 font-sans text-xs text-card-foreground/70">
                {s.correct}/{s.questions} correct ({s.accuracy}%) ·{" "}
                {s.incorrect} incorrect · tables{" "}
                {s.tablesPractised.join(", ")}
                {s.piggyEarnedCents > 0 &&
                  ` · earned ${formatCents(s.piggyEarnedCents)}`}
              </p>
              {s.factsMastered.length > 0 && (
                <p className="mt-1 font-sans text-xs text-secondary">
                  Mastered: {s.factsMastered.join(", ")}
                </p>
              )}
              {s.masteryChanges.length > 0 && (
                <p className="mt-1 font-sans text-xs text-card-foreground/60">
                  Mastery:{" "}
                  {s.masteryChanges
                    .map((m) => `${m.table}s ${m.before}%→${m.after}%`)
                    .join(", ")}
                </p>
              )}
              {s.beltChanges.length > 0 && (
                <p className="mt-1 font-sans text-xs font-semibold text-primary">
                  Belt earned:{" "}
                  {s.beltChanges
                    .map((b) => `${b.table}s → ${BELT_LABEL[b.belt]}`)
                    .join(", ")}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
