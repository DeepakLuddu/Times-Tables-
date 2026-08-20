"use client"

import { MicroQuestion } from "@/components/help/MicroQuestion"
import { CounterGroup, NumberLineJumps, PlaceValueBlocks } from "@/components/help/visuals"
import { buildSubtractionHelp } from "@/lib/help/subtraction-help"
import type { HelpMethod } from "@/lib/subjects/types"
import { useMemo } from "react"

export function SubtractionHelp({
  a,
  b,
  bandIndex,
  method,
  onSolved,
}: {
  a: number
  b: number
  bandIndex?: number
  method: HelpMethod
  onSolved: () => void
}) {
  const help = useMemo(() => buildSubtractionHelp(a, b, bandIndex), [a, b, bandIndex])

  if (method === "see") {
    const { plan, microQ } = help.seeIt
    const seeItTitle = plan.kind === "placeValue" ? "Place Value Blocks" : "Take Away / Counters"
    return (
      <HelpCard title={seeItTitle}>
        {plan.kind === "takeAway" && (
          <div className="flex flex-col items-center gap-2">
            <CounterGroup count={plan.a} crossedOut={plan.b} />
            <p className="font-mono text-sm text-card-foreground/70">
              {`Take away ${plan.b}`}
            </p>
          </div>
        )}
        {plan.kind === "placeValue" && (
          <div className="flex flex-col items-center gap-3">
            <PlaceValueBlocks tens={plan.aTens} ones={plan.aOnes} />
            <span className="font-display text-lg font-bold text-primary">−</span>
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
    <HelpCard title={plan.kind === "regroup" ? "Regrouping" : "Count Up"}>
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
