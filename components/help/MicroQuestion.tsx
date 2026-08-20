"use client"

import { cn } from "@/lib/utils"
import { useState } from "react"

// The one required interactive step inside every help widget — a short
// prompt plus a few tappable options, consistent with the app's existing
// multiple-choice interaction model everywhere else (no new free-text
// input). Deliberately never calls recordAttempt: this is scaffolding
// practice, not a graded event, which is what keeps the Piggy Bank/mastery
// math untouched — only the real retry of the original question (handled
// by GameBoard) is ever recorded.
export function MicroQuestion({
  prompt,
  options,
  correctValue,
  onSolved,
}: {
  prompt: string
  options: number[]
  correctValue: number
  onSolved: () => void
}) {
  const [chosen, setChosen] = useState<number | null>(null)
  const [missedOnce, setMissedOnce] = useState(false)

  function handleTap(value: number) {
    if (chosen !== null) return
    if (value === correctValue) {
      setChosen(value)
      window.setTimeout(onSolved, 550)
      return
    }
    if (missedOnce) {
      // Second miss: reveal the answer and move on rather than blocking
      // the child — the point is participation, not a hard gate.
      setChosen(correctValue)
      window.setTimeout(onSolved, 700)
      return
    }
    setMissedOnce(true)
  }

  return (
    <div className="mt-3 rounded-xl bg-muted/60 p-3">
      <p className="text-center font-display text-base font-semibold text-foreground">
        {prompt}
      </p>
      {missedOnce && chosen === null && (
        <p className="mt-1 text-center font-sans text-xs text-foreground/50">
          Not quite — try once more.
        </p>
      )}
      <div className="mt-2 grid grid-cols-3 gap-2">
        {options.map((opt) => {
          const isChosen = chosen === opt
          const isCorrectReveal = chosen !== null && opt === correctValue
          return (
            <button
              key={opt}
              type="button"
              disabled={chosen !== null}
              onClick={() => handleTap(opt)}
              className={cn(
                "rounded-xl bg-card px-2 py-3 font-mono text-xl font-bold text-card-foreground shadow-sm transition-all active:scale-95",
                isCorrectReveal && "bg-secondary text-secondary-foreground",
                isChosen && !isCorrectReveal && "bg-destructive text-destructive-foreground",
              )}
            >
              {opt}
            </button>
          )
        })}
      </div>
    </div>
  )
}
