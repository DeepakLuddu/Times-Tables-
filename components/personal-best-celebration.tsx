"use client"

import { CONFETTI_COLORS } from "@/components/belt-promotion"
import type { PersonalBestDelta } from "@/lib/personal-bests"
import { cn } from "@/lib/utils"
import { useEffect, useMemo } from "react"

// How long the celebration stays on screen. Deliberately independent of
// the question-advance timing (FLASH_MS in game-board.tsx) — it overlays
// on top of the next question or two rather than delaying them, so it
// stays exciting without ever slowing gameplay down.
export const PERSONAL_BEST_CELEBRATION_MS = 1600

// A quick (~1.5s), non-blocking celebration for breaking a Personal Best —
// deliberately lighter-weight than the Belt Promotion modal (no "tap to
// continue" button). Calls `onDone` once it's finished so the caller can
// clear its state; the caller should NOT tie this to answer-advance timing.
export function PersonalBestCelebration({
  delta,
  onDone,
}: {
  delta: PersonalBestDelta
  onDone: () => void
}) {
  useEffect(() => {
    const t = window.setTimeout(onDone, PERSONAL_BEST_CELEBRATION_MS)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const confetti = useMemo(
    () =>
      Array.from({ length: 20 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.25,
        duration: 1.1 + Math.random() * 0.7,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      })),
    [],
  )

  return (
    <div
      className="pointer-events-none fixed inset-0 z-40 overflow-hidden"
      aria-hidden="true"
    >
      {confetti.map((c, i) => (
        <span
          key={i}
          className={cn("confetti-piece", c.color)}
          style={{
            left: `${c.left}%`,
            animationDelay: `${c.delay}s`,
            animationDuration: `${c.duration}s`,
          }}
        />
      ))}

      <div className="absolute inset-x-0 top-[24%] flex justify-center px-6">
        <div className="animate-personal-best-pop flex flex-col items-center gap-1 rounded-2xl bg-gradient-to-r from-primary via-secondary to-belt-blue px-7 py-4 text-center shadow-xl">
          <p className="font-display text-2xl font-bold text-primary-foreground sm:text-3xl">
            🏆 NEW PERSONAL BEST!
          </p>
          <p className="font-display text-base font-semibold text-primary-foreground/90">
            {delta.title}: {delta.value}
          </p>
          <p className="font-sans text-xs text-primary-foreground/80">
            {delta.sublabel}
          </p>
        </div>
      </div>
    </div>
  )
}
