"use client"

import { MicroQuestion } from "@/components/help/MicroQuestion"
import { CounterGroup, NumberLineJumps, PlaceValueBlocks, TenFrame } from "@/components/help/visuals"
import { buildAdditionHelp } from "@/lib/help/addition-help"
import type { HelpMethod } from "@/lib/subjects/types"
import { useMemo } from "react"

// Orchestrates one of Addition's three help methods for a given fact.
// The strategy/visual name (e.g. "Make 10") only appears here, once a
// method is already chosen — the HelpChooser screen stays generic.
export function AdditionHelp({
  a,
  b,
  method,
  onSolved,
}: {
  a: number
  b: number
  method: HelpMethod
  onSolved: () => void
}) {
  const help = useMemo(() => buildAdditionHelp(a, b), [a, b])

  if (method === "see") {
    const { plan, microQ } = help.seeIt
    const seeItTitle =
      plan.kind === "placeValue" ? "Place Value Blocks" : plan.kind === "tenFrame" ? "Ten Frame" : "Counters"
    return (
      <HelpCard title={seeItTitle}>
        {plan.kind === "counters" && (
          <div className="flex flex-col items-center gap-3">
            <CounterGroup count={plan.a} />
            <span className="font-display text-lg font-bold text-primary">+</span>
            <CounterGroup count={plan.b} />
          </div>
        )}
        {plan.kind === "tenFrame" && (
          <div className="flex flex-col items-center gap-2">
            <TenFrame filled={10} />
            <p className="font-mono text-sm text-card-foreground/70">
              {`${plan.a} + ${plan.complement} fills the frame to 10, ${plan.remainder} left over`}
            </p>
            <p className="font-display text-xl font-bold text-primary">
              {`10 + ${plan.remainder}`}
            </p>
          </div>
        )}
        {plan.kind === "placeValue" && (
          <div className="flex flex-col items-center gap-3">
            <PlaceValueBlocks tens={plan.aTens} ones={plan.aOnes} />
            <span className="font-display text-lg font-bold text-primary">+</span>
            <PlaceValueBlocks tens={plan.bTens} ones={plan.bOnes} />
          </div>
        )}
        <MicroQuestion {...microQ} onSolved={onSolved} />
      </HelpCard>
    )
  }

  if (method === "move") {
    const { plan, microQ } = help.moveIt
    return (
      <HelpCard title="Number Line">
        <NumberLineJumps start={plan.start} jumps={plan.jumps} />
        <MicroQuestion {...microQ} onSolved={onSolved} />
      </HelpCard>
    )
  }

  const { plan, microQ } = help.thinkIt
  return (
    <HelpCard title={plan.strategyName}>
      <div className="flex flex-col items-center gap-1">
        {plan.steps.map((step, i) => (
          <p key={i} className="font-mono text-base text-card-foreground/80">
            {step}
          </p>
        ))}
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
