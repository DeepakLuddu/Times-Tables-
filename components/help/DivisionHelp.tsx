"use client"

import { getMultiplicationMasteryFor } from "@/app/actions/dojo"
import { MicroQuestion } from "@/components/help/MicroQuestion"
import { EqualGroups, NumberLineJumps } from "@/components/help/visuals"
import { buildDivisionHelp } from "@/lib/help/division-help"
import type { HelpMethod } from "@/lib/subjects/types"
import { useEffect, useMemo, useState } from "react"

export function DivisionHelp({
  a,
  b,
  playerId,
  method,
  onSolved,
}: {
  /** a = dividend, b = divisor (division never swaps operand order). */
  a: number
  b: number
  playerId: string
  method: HelpMethod
  onSolved: () => void
}) {
  const help = useMemo(() => buildDivisionHelp(a, b), [a, b])

  // Soft narrative link only (spec: never a mastery shortcut) — checked
  // lazily, only for the "think" method, so the other two never wait on it.
  const [multMastered, setMultMastered] = useState(false)
  useEffect(() => {
    if (method !== "think") return
    let cancelled = false
    void getMultiplicationMasteryFor(playerId, b, help.thinkIt.plan.quotient).then((m) => {
      if (!cancelled) setMultMastered(m)
    })
    return () => {
      cancelled = true
    }
  }, [method, playerId, b, help.thinkIt.plan.quotient])

  if (method === "see") {
    const { plan, microQ } = help.seeIt
    return (
      <HelpCard title="Equal Groups / Sharing">
        <EqualGroups total={plan.dividend} groups={plan.divisor} />
        <MicroQuestion {...microQ} onSolved={onSolved} />
      </HelpCard>
    )
  }

  if (method === "move") {
    const { plan, microQ } = help.moveIt
    const jumps = Array.from({ length: plan.jumpCount }, () => plan.divisor)
    return (
      <HelpCard title="Skip / Jump">
        <NumberLineJumps start={0} jumps={jumps} />
        <MicroQuestion {...microQ} onSolved={onSolved} />
      </HelpCard>
    )
  }

  const { plan, microQ } = help.thinkIt
  return (
    <HelpCard title="Use Multiplication">
      <div className="flex flex-col items-center gap-1 text-center">
        {multMastered ? (
          <p className="font-mono text-base text-card-foreground/80">
            {`You already know: ${plan.divisor} × ${plan.quotient} = ${plan.dividend}!`}
          </p>
        ) : (
          <p className="font-mono text-base text-card-foreground/80">
            {`${plan.divisor} × ? = ${plan.dividend}`}
          </p>
        )}
      </div>
      <MicroQuestion {...microQ} onSolved={onSolved} />
    </HelpCard>
  )
}

function HelpCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-2 rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-lg">
      <p className="mb-3 text-center font-display text-lg font-semibold text-primary">
        {title}
      </p>
      <div className="flex min-h-24 flex-col items-center justify-center">
        {children}
      </div>
    </div>
  )
}
