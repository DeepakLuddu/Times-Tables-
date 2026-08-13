"use client"

import { type BeltWallData, getBeltWallData } from "@/app/actions/dojo"
import { Belt } from "@/components/belt"
import { BeltDetail } from "@/components/belt-detail"
import { AnimatedPercentLabel, MasteryBar } from "@/components/mastery-bar"
import type { TableMastery } from "@/lib/mastery"
import { getPlayerId } from "@/lib/player"
import { ArrowRight, House, Sparkles } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"

function factChip(a: number, b: number, key?: string) {
  return (
    <span
      key={key ?? `${a}x${b}`}
      className="rounded-lg bg-muted px-3 py-1.5 font-mono text-sm font-semibold text-foreground"
    >
      {a} × {b}
    </span>
  )
}

const MODE_LABEL: Record<string, string> = {
  practice: "Practice",
  sprint: "Sprint",
}

export function BeltWall() {
  const [data, setData] = useState<BeltWallData | null>(null)
  const [selected, setSelected] = useState<TableMastery | null>(null)

  useEffect(() => {
    const pid = getPlayerId()
    void getBeltWallData(pid).then(setData)
  }, [])

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5 py-6">
      {selected && (
        <BeltDetail mastery={selected} onClose={() => setSelected(null)} />
      )}
      <div className="flex items-center gap-3">
        <Link
          href="/"
          aria-label="Back to home"
          className="flex size-11 items-center justify-center rounded-full border border-border text-foreground/80 transition-colors hover:bg-muted"
        >
          <House className="size-5" />
        </Link>
        <h1 className="font-display text-3xl font-bold text-primary">
          Belt Wall
        </h1>
      </div>

      {!data ? (
        <p className="mt-16 text-center font-display text-lg text-foreground/50">
          Loading your belts…
        </p>
      ) : (
        <>
          {/* Belt grid */}
          <div className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-4">
            {data.mastery.map((m) => (
              <button
                key={m.table}
                type="button"
                onClick={() => setSelected(m)}
                className="flex flex-col items-center gap-1.5 rounded-2xl bg-card px-3 py-4 text-card-foreground shadow-md transition-transform active:scale-95"
              >
                <span className="font-mono text-2xl font-bold">
                  {m.table}
                </span>
                <Belt tier={m.belt} className="h-6 w-14" />
                <MasteryBar percent={m.percent} size="sm" className="mt-1" />
                <AnimatedPercentLabel
                  percent={m.percent}
                  className="font-mono text-xs font-semibold text-card-foreground/70"
                />
                <span className="text-center font-sans text-[10px] font-medium leading-tight text-card-foreground/50">
                  {m.stateLabel}
                </span>
              </button>
            ))}
          </div>

          {/* Needs practice */}
          <section className="mt-8">
            <h2 className="font-display text-xl font-semibold text-foreground">
              Needs practice
            </h2>
            {data.needsPractice.length === 0 ? (
              <p className="mt-2 font-sans text-sm text-foreground/50">
                Nothing flagged right now. Keep training to find your edges.
              </p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {data.needsPractice.map((f) => factChip(f.a, f.b))}
              </div>
            )}
          </section>

          {/* Next session callout */}
          <section className="mt-8 rounded-2xl border border-primary/40 bg-primary/10 px-5 py-4">
            <div className="flex items-center gap-2">
              <Sparkles className="size-5 text-primary" />
              <h2 className="font-display text-lg font-semibold text-primary">
                Next session opens with
              </h2>
            </div>
            {data.nextSessionFacts.length === 0 ? (
              <p className="mt-2 font-sans text-sm text-foreground/60">
                Your next session will pick facts smartly based on how you
                answer.
              </p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {data.nextSessionFacts.map((f) =>
                  factChip(f.a, f.b, `next-${f.a}x${f.b}`),
                )}
              </div>
            )}
          </section>

          {/* Session recap */}
          <section className="mt-8 pb-6">
            <h2 className="font-display text-xl font-semibold text-foreground">
              Past sessions
            </h2>
            {data.sessions.length === 0 ? (
              <p className="mt-2 font-sans text-sm text-foreground/50">
                No sessions yet. Head back and start training.
              </p>
            ) : (
              <ul className="mt-3 flex flex-col gap-3">
                {data.sessions.map((s) => (
                  <li
                    key={s.sessionId}
                    className="rounded-2xl bg-card px-5 py-4 text-card-foreground shadow-md"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-display text-lg font-semibold">
                        {MODE_LABEL[s.mode] ?? s.mode}
                      </span>
                      <span className="font-mono text-sm font-semibold text-card-foreground/60">
                        {s.correct}/{s.questions} · {s.accuracy}%
                      </span>
                    </div>
                    {s.insights.length > 0 && (
                      <ul className="mt-2 flex flex-col gap-1.5">
                        {s.insights.map((ins, i) => (
                          <li
                            key={i}
                            className="flex items-start gap-2 font-sans text-sm text-card-foreground/80"
                          >
                            <ArrowRight className="mt-0.5 size-4 shrink-0 text-secondary" />
                            <span>{ins.text}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  )
}
