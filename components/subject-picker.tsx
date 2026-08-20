"use client"

import { getMixedMathsEligibility } from "@/app/actions/dojo"
import { SUBJECT_ENGINES } from "@/lib/subjects"
import type { Mode } from "@/lib/engine"
import { getPlayerId } from "@/lib/player"
import type { Subject } from "@/lib/subjects/types"
import { Divide, House, Layers, Minus, Plus, X as TimesIcon } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"

const SUBJECT_ICON: Record<Subject, typeof TimesIcon> = {
  multiplication: TimesIcon,
  division: Divide,
  addition: Plus,
  subtraction: Minus,
}

const SUBJECT_BLURB: Record<Subject, string> = {
  multiplication: "Times tables, 1 to 12.",
  division: "Divide by 1 to 12.",
  addition: "Facts, bonds, and two-digit sums.",
  subtraction: "Facts, bonds, and two-digit takeaways.",
}

// Every subject with a registered SubjectEngine gets a card.
const AVAILABLE_SUBJECTS = Object.keys(SUBJECT_ENGINES) as Subject[]

export function SubjectPicker({ mode }: { mode: Mode }) {
  const title = mode === "practice" ? "Practice" : "Sprint"
  const subtitle =
    mode === "practice"
      ? "No clock. Choose what to practise."
      : "60 seconds. Choose what to practise."

  // null while unknown/loading — the Mixed Maths card still links through
  // either way (GameBoard enforces the real gate), this just decides
  // whether to show the lock hint.
  const [mixedEligible, setMixedEligible] = useState<boolean | null>(null)

  useEffect(() => {
    const pid = getPlayerId()
    if (pid) void getMixedMathsEligibility(pid).then(setMixedEligible)
  }, [])

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 py-10">
      <div className="flex items-center gap-3">
        <Link
          href="/"
          aria-label="Back to home"
          className="flex size-11 items-center justify-center rounded-full border border-border text-foreground/80 transition-colors hover:bg-muted"
        >
          <House className="size-5" />
        </Link>
        <div>
          <h1 className="font-display text-3xl font-bold text-primary">
            {title}
          </h1>
          <p className="font-sans text-sm text-foreground/60">{subtitle}</p>
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-4">
        {AVAILABLE_SUBJECTS.map((subject) => {
          const Icon = SUBJECT_ICON[subject]
          const engine = SUBJECT_ENGINES[subject]!
          return (
            <Link
              key={subject}
              href={`/${mode}/${subject}`}
              className="group flex items-center gap-4 rounded-3xl bg-card px-6 py-5 text-card-foreground shadow-lg transition-transform active:scale-[0.98]"
            >
              <Icon className="size-8 shrink-0 text-primary" />
              <span className="flex flex-col">
                <span className="font-display text-2xl font-semibold">
                  {engine.label}
                </span>
                <span className="font-sans text-sm text-card-foreground/60">
                  {SUBJECT_BLURB[subject]}
                </span>
              </span>
            </Link>
          )
        })}

        <Link
          href={`/${mode}/mixed`}
          className="group flex items-center gap-4 rounded-3xl border-2 border-dashed border-primary/40 bg-primary/5 px-6 py-5 text-foreground shadow-sm transition-transform active:scale-[0.98]"
        >
          <Layers className="size-8 shrink-0 text-primary" />
          <span className="flex flex-col">
            <span className="flex items-center gap-2 font-display text-2xl font-semibold">
              Mixed Maths
              {mixedEligible === false && (
                <span aria-hidden="true" className="text-base">
                  🔒
                </span>
              )}
            </span>
            <span className="font-sans text-sm text-foreground/60">
              {mixedEligible === false
                ? "Practise each subject a bit more to unlock."
                : "A bit of everything — tests true recall."}
            </span>
          </span>
        </Link>
      </div>
    </main>
  )
}
