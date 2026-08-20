"use client"

import { type BeltWallData, getBeltWallData } from "@/app/actions/dojo"
import { Belt } from "@/components/belt"
import { BeltDetail } from "@/components/belt-detail"
import { BeltJourney } from "@/components/belt-journey"
import { AnimatedPercentLabel, MasteryBar } from "@/components/mastery-bar"
import { RecentWinsSection } from "@/components/recent-wins-section"
import type { TableMastery } from "@/lib/mastery"
import { getPlayerId } from "@/lib/player"
import { getSubjectEngine, SUBJECT_ENGINES } from "@/lib/subjects"
import type { Subject } from "@/lib/subjects/types"
import { cn } from "@/lib/utils"
import { House, Sparkles } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"

// Only subjects with a registered SubjectEngine show a tab — addition and
// subtraction land in a later phase.
const AVAILABLE_SUBJECTS = Object.keys(SUBJECT_ENGINES) as Subject[]

function factChip(subject: Subject, a: number, b: number, key?: string) {
  return (
    <span
      key={key ?? `${a}x${b}`}
      className="rounded-lg bg-muted px-3 py-1.5 font-mono text-sm font-semibold text-foreground"
    >
      {getSubjectEngine(subject).formatFact(a, b)}
    </span>
  )
}

// One belt card. Kept deliberately minimal on the main grid — table
// number, belt graphic, percent, bar, and distance to the next belt.
// Everything else (the 8-part breakdown) only shows up in BeltDetail.
function BeltCard({
  mastery,
  onTap,
}: {
  mastery: TableMastery
  onTap: () => void
}) {
  const isChallengeReady = mastery.state === "challengeReady"
  const isMastered = mastery.state === "mastered"

  if (isMastered) {
    return (
      <button
        type="button"
        onClick={onTap}
        className="flex flex-col items-center gap-1.5 rounded-2xl bg-belt-black px-3 py-4 shadow-md ring-2 ring-primary transition-transform active:scale-95"
      >
        <span className="font-mono text-2xl font-bold text-white">
          {mastery.table}
        </span>
        <Belt tier="black" className="h-6 w-14" />
        <span className="mt-1 font-mono text-xs font-bold text-primary">
          100%
        </span>
        <span className="text-center font-display text-[10px] font-bold leading-tight text-primary">
          MASTERED ✓
        </span>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={onTap}
      className="flex flex-col items-center gap-1.5 rounded-2xl bg-card px-3 py-4 text-card-foreground shadow-md transition-transform active:scale-95"
    >
      <span className="font-mono text-2xl font-bold">{mastery.table}</span>
      <Belt
        tier={mastery.belt}
        locked={isChallengeReady}
        className="h-6 w-14"
      />
      {!isChallengeReady && (
        <>
          <MasteryBar
            percent={mastery.percent}
            size="sm"
            className="mt-1"
          />
          <AnimatedPercentLabel
            percent={mastery.percent}
            className="font-mono text-xs font-semibold text-card-foreground/70"
          />
        </>
      )}
      <span
        className={cn(
          "text-center font-sans text-[10px] font-medium leading-tight",
          isChallengeReady
            ? "mt-1 font-display font-bold text-primary"
            : "text-card-foreground/50",
        )}
      >
        {mastery.stateLabel}
      </span>
    </button>
  )
}

export function BeltWall() {
  const [subject, setSubject] = useState<Subject>("multiplication")
  const [data, setData] = useState<BeltWallData | null>(null)
  const [selected, setSelected] = useState<TableMastery | null>(null)
  const [playerId, setPlayerId] = useState("")

  useEffect(() => {
    const pid = getPlayerId()
    setPlayerId(pid)
  }, [])

  useEffect(() => {
    if (!playerId) return
    setData(null)
    void getBeltWallData(playerId, subject).then(setData)
  }, [playerId, subject])

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5 py-6">
      {selected && (
        <BeltDetail
          mastery={selected}
          onClose={() => setSelected(null)}
        />
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

      {/* Subject tabs */}
      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {AVAILABLE_SUBJECTS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSubject(s)}
            className={cn(
              "shrink-0 rounded-full px-4 py-2 font-display text-sm font-semibold transition-colors",
              subject === s
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-foreground/60 hover:text-foreground",
            )}
          >
            {getSubjectEngine(s).label}
          </button>
        ))}
      </div>

      {!data ? (
        <p className="mt-16 text-center font-display text-lg text-foreground/50">
          Loading your belts…
        </p>
      ) : (
        <>
          <BeltJourney />

          {/* Belt grid */}
          <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4">
            {data.mastery.map((m) => (
              <BeltCard key={m.table} mastery={m} onTap={() => setSelected(m)} />
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
                {data.needsPractice.map((f) => factChip(subject, f.a, f.b))}
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
                  factChip(subject, f.a, f.b, `next-${f.a}x${f.b}`),
                )}
              </div>
            )}
          </section>

          {/* Best thing today / Next challenge / Recent Wins — replaces
              the old raw "Past Sessions" transaction log. That detailed
              per-session data still exists; it now lives in the Parent
              section's Session History instead. */}
          <RecentWinsSection playerId={playerId} />
        </>
      )}
    </main>
  )
}
