"use client"

import { Belt } from "@/components/belt"
import { BELT_LABEL, type Belt as BeltTier } from "@/lib/engine"
import { getSubjectEngine } from "@/lib/subjects"
import type { Subject } from "@/lib/subjects/types"
import { cn } from "@/lib/utils"
import { useMemo } from "react"

export const CONFETTI_COLORS = [
  "bg-primary",
  "bg-secondary",
  "bg-belt-blue",
  "bg-belt-purple",
  "bg-belt-yellow",
  "bg-belt-brown",
]

export function BeltPromotion({
  table,
  belt,
  subject = "multiplication",
  onDismiss,
}: {
  table: number
  belt: BeltTier
  subject?: Subject
  onDismiss: () => void
}) {
  const skillLabel = getSubjectEngine(subject).skillLabel(table)
  // A genuine Black Belt only ever arrives here at true 100% mastery (see
  // app/actions/dojo.ts — the 99% "Belt Challenge Ready" state is always
  // awarded in the same instant it's reached, so `promotions` never fires
  // for it separately). It's the biggest achievement in the app, so it
  // gets a visibly bigger celebration than every other belt.
  const isBlackBelt = belt === "black"
  const confettiCount = isBlackBelt ? 48 : 28

  // Deterministic-enough confetti generated once per mount.
  const confetti = useMemo(
    () =>
      Array.from({ length: confettiCount }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.5,
        duration: 1.8 + Math.random() * 1.4,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      })),
    [confettiCount],
  )

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={
        isBlackBelt
          ? `Black Belt earned in ${skillLabel} — fully mastered`
          : `New belt earned: ${BELT_LABEL[belt]} belt in ${skillLabel}`
      }
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-background/85 px-6 backdrop-blur-sm"
    >
      {/* Confetti */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        {confetti.map((c, i) => (
          <span
            key={i}
            className={`confetti-piece ${c.color}`}
            style={{
              left: `${c.left}%`,
              animationDelay: `${c.delay}s`,
              animationDuration: `${c.duration}s`,
            }}
          />
        ))}
      </div>

      <div className="relative flex w-full max-w-sm flex-col items-center text-center">
        {/* Shine rays behind the badge */}
        <div className="relative flex items-center justify-center">
          <div
            className={cn(
              "animate-ray-spin absolute opacity-30",
              isBlackBelt ? "size-80" : "size-64",
            )}
            aria-hidden="true"
            style={{
              background:
                "conic-gradient(from 0deg, transparent 0deg 18deg, var(--primary) 18deg 20deg, transparent 20deg 38deg, var(--primary) 38deg 40deg)",
              borderRadius: "9999px",
              maskImage:
                "radial-gradient(circle, transparent 38%, black 40%)",
              WebkitMaskImage:
                "radial-gradient(circle, transparent 38%, black 40%)",
            }}
          />

          {/* Belt badge */}
          <div
            className={cn(
              "animate-belt-pop-in relative flex flex-col items-center justify-center gap-3 rounded-full border-4 bg-card px-6 shadow-2xl",
              isBlackBelt
                ? "size-52 border-belt-black"
                : "size-44 border-primary",
            )}
          >
            <span className="font-mono text-5xl font-bold text-card-foreground">
              {table}
            </span>
            <Belt tier={belt} className="h-5 w-24" />
          </div>
        </div>

        <div className="animate-badge-rise mt-8 flex flex-col items-center">
          <p className="font-display text-sm font-semibold uppercase tracking-widest text-primary">
            {isBlackBelt ? "Belt Challenge passed!" : "New belt earned"}
          </p>
          <h2 className="mt-1 text-balance font-display text-4xl font-bold text-foreground">
            {BELT_LABEL[belt]} Belt
          </h2>
          <p className="mt-2 text-balance font-sans text-base text-foreground/70">
            {isBlackBelt
              ? `You've fully mastered ${skillLabel}. That's the whole journey — nice work.`
              : `You leveled up ${skillLabel}. Keep it going!`}
          </p>

          <button
            type="button"
            onClick={onDismiss}
            autoFocus
            className="mt-8 rounded-2xl bg-primary px-8 py-4 font-display text-xl font-semibold text-primary-foreground shadow-lg transition-transform active:scale-95"
          >
            Keep going
          </button>
        </div>
      </div>
    </div>
  )
}
