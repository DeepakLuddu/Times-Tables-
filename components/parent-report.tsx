"use client"

import { getParentReport } from "@/app/actions/dojo"
import { Belt } from "@/components/belt"
import { PiggyBankParent } from "@/components/piggy-bank-parent"
import { SessionHistory } from "@/components/session-history"
import type { ParentReport as Report } from "@/lib/insights"
import { getPlayerId } from "@/lib/player"
import { cn } from "@/lib/utils"
import { House, Lightbulb } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"

const BELT_LABEL: Record<string, string> = {
  white: "White",
  yellow: "Yellow",
  green: "Green",
  blue: "Blue",
  brown: "Brown",
  black: "Black",
}

function formatDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  return d.toLocaleDateString(undefined, { weekday: "short" })
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })
}

export function ParentReport() {
  const [report, setReport] = useState<Report | null>(null)
  const [playerId, setPlayerId] = useState("")

  useEffect(() => {
    const pid = getPlayerId()
    setPlayerId(pid)
    void getParentReport(pid).then(setReport)
  }, [])

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5 py-6">
      <div className="flex items-center gap-3">
        <Link
          href="/"
          aria-label="Back to home"
          className="flex size-11 items-center justify-center rounded-full border border-border text-foreground/80 transition-colors hover:bg-muted"
        >
          <House className="size-5" />
        </Link>
        <div>
          <h1 className="font-display text-3xl font-bold text-foreground">
            Parent Report
          </h1>
          <p className="font-sans text-sm text-foreground/60">
            A calm look at how practice is going.
          </p>
        </div>
      </div>

      {playerId && <PiggyBankParent playerId={playerId} />}

      {!report ? (
        <p className="mt-8 text-center font-display text-lg text-foreground/50">
          Loading the report…
        </p>
      ) : report.totalQuestions === 0 ? (
        <div className="mt-6 rounded-2xl bg-card px-6 py-10 text-center text-card-foreground shadow-md">
          <p className="font-display text-xl font-semibold">No practice yet</p>
          <p className="mt-2 font-sans text-sm text-card-foreground/70">
            Once your child answers a few questions, this page will fill with
            their progress, strengths, and trouble spots.
          </p>
        </div>
      ) : (
        <>
          {/* Overview stats */}
          <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard
              label="Questions"
              value={report.totalQuestions.toString()}
            />
            <StatCard label="Accuracy" value={`${report.overallAccuracy}%`} />
            <StatCard
              label="Facts mastered"
              value={`${report.factsMastered}/78`}
            />
            <StatCard label="Sessions" value={report.sessionsCount.toString()} />
          </section>

          {/* Mastery progress bar */}
          <section className="mt-4 rounded-2xl bg-card px-5 py-4 text-card-foreground shadow-md">
            <div className="flex items-center justify-between">
              <span className="font-display text-sm font-semibold">
                Overall mastery
              </span>
              <span className="font-mono text-sm font-semibold text-card-foreground/60">
                {report.masteryPercent}%
              </span>
            </div>
            <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-muted/40">
              <div
                className="h-full rounded-full bg-secondary transition-[width]"
                style={{ width: `${report.masteryPercent}%` }}
              />
            </div>
            <p className="mt-2 font-sans text-xs text-card-foreground/60">
              Last practiced {formatDate(report.lastPlayed)}
            </p>
          </section>

          {/* Activity, last 14 days */}
          <section className="mt-4 rounded-2xl bg-card px-5 py-4 text-card-foreground shadow-md">
            <h2 className="font-display text-base font-semibold">
              Practice activity
            </h2>
            <p className="font-sans text-xs text-card-foreground/60">
              Questions answered per day, last 14 days
            </p>
            <ActivityChart data={report.recentActivity} />
          </section>

          {/* Trouble spots */}
          <section className="mt-4 rounded-2xl bg-card px-5 py-4 text-card-foreground shadow-md">
            <h2 className="font-display text-base font-semibold">
              Trouble spots
            </h2>
            {report.troubleFacts.length === 0 ? (
              <p className="mt-2 font-sans text-sm text-card-foreground/70">
                Nothing is being missed repeatedly right now. Great sign.
              </p>
            ) : (
              <ul className="mt-3 flex flex-col divide-y divide-border/50">
                {report.troubleFacts.map((f) => (
                  <li
                    key={`${f.a}x${f.b}`}
                    className="flex items-center justify-between py-2"
                  >
                    <span className="font-mono text-lg font-semibold">
                      {f.a} × {f.b}
                    </span>
                    <span className="font-sans text-sm text-card-foreground/70">
                      {f.accuracy}% correct · missed {f.misses} of {f.attempts}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Belt breakdown */}
          <section className="mt-4 rounded-2xl bg-card px-5 py-4 text-card-foreground shadow-md">
            <h2 className="font-display text-base font-semibold">
              Mastery by table
            </h2>
            <ul className="mt-3 flex flex-col divide-y divide-border/50">
              {report.tables.map((t) => (
                <li key={t.table} className="flex items-center gap-4 py-2">
                  <span className="w-6 font-mono text-lg font-semibold">
                    {t.table}
                  </span>
                  <Belt tier={t.belt} className="h-4 w-16 shrink-0" />
                  <span className="w-20 font-sans text-sm text-card-foreground/70">
                    {BELT_LABEL[t.belt]}
                  </span>
                  <span className="ml-auto font-mono text-sm text-card-foreground/60">
                    {t.attempts === 0 ? "—" : `${t.accuracy}%`}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {/* Detailed session-by-session log — moved here from the
              child-facing Belt Wall, which now shows Recent Wins instead. */}
          <SessionHistory playerId={playerId} />

          {/* Recommendation */}
          <section className="mt-4 mb-6 flex items-start gap-3 rounded-2xl border border-primary/40 bg-primary/10 px-5 py-4">
            <Lightbulb className="mt-0.5 size-5 shrink-0 text-primary" />
            <div>
              <h2 className="font-display text-base font-semibold text-primary">
                What to do next
              </h2>
              <p className="mt-1 font-sans text-sm text-foreground/80">
                {report.recommendation}
              </p>
            </div>
          </section>
        </>
      )}
    </main>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col rounded-2xl bg-card px-4 py-3 text-card-foreground shadow-md">
      <span className="font-mono text-2xl font-bold">{value}</span>
      <span className="font-sans text-xs text-card-foreground/60">{label}</span>
    </div>
  )
}

function ActivityChart({
  data,
}: {
  data: Report["recentActivity"]
}) {
  const max = Math.max(1, ...data.map((d) => d.questions))
  return (
    <div className="mt-3 flex items-end justify-between gap-1" aria-hidden="true">
      {data.map((d) => {
        const pct = (d.questions / max) * 100
        return (
          <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex h-24 w-full items-end">
              <div
                className={cn(
                  "w-full rounded-t-md transition-[height]",
                  d.questions > 0 ? "bg-secondary" : "bg-muted/40",
                )}
                style={{ height: `${Math.max(pct, d.questions > 0 ? 8 : 3)}%` }}
                title={`${d.date}: ${d.questions} questions, ${d.accuracy}% correct`}
              />
            </div>
            <span className="font-mono text-[10px] text-card-foreground/40">
              {formatDay(d.date).slice(0, 1)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
