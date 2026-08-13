"use client"

import { CONFETTI_COLORS } from "@/components/belt-promotion"
import { cn } from "@/lib/utils"
import { useMemo, type CSSProperties } from "react"

export type CelebrationData = {
  /** Bounding rect of the tapped answer button, captured on click. */
  origin: DOMRect
  /** Bounding rect of the streak badge the "+1" should fly toward, if visible. */
  target: DOMRect | null
  /** Streak count *after* this correct answer. */
  streak: number
}

const STAR_GLYPHS = ["✦", "✧", "★", "✳"] // ✦ ✧ ★ ✳

type Milestone = { label: string; emoji: string; big: boolean }

function getMilestone(streak: number): Milestone | null {
  if (streak === 3) return { label: "3 in a row!", emoji: "⚡", big: false } // ⚡
  if (streak > 3 && streak % 10 === 0)
    return { label: `${streak} STREAK!`, emoji: "🚀", big: true } // 🚀
  if (streak > 3 && streak % 5 === 0)
    return { label: `${streak} STREAK!`, emoji: "🔥", big: false } // 🔥
  return null
}

// Exposed so GameBoard can decide whether a correct answer deserves the
// slightly longer MILESTONE_FLASH_MS beat before auto-advancing.
export function isMilestoneStreak(streak: number): boolean {
  return getMilestone(streak) !== null
}

// Quick, playful feedback for a correct answer: a burst of stars from the
// tapped button, a "+1" that flies toward the streak meter, and (at streak
// milestones) a bigger banner + confetti shower. Everything here is timed to
// finish within GameBoard's FLASH_MS / MILESTONE_FLASH_MS auto-advance delay.
export function AnswerCelebration({ origin, target, streak }: CelebrationData) {
  const milestone = getMilestone(streak)
  const originX = origin.left + origin.width / 2
  const originY = origin.top + origin.height / 2

  const stars = useMemo(() => {
    const count = milestone?.big ? 12 : milestone ? 9 : 7
    return Array.from({ length: count }, (_, i) => {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.35
      const distance = 44 + Math.random() * 34
      return {
        id: i,
        glyph: STAR_GLYPHS[i % STAR_GLYPHS.length],
        dx: Math.cos(angle) * distance,
        dy: Math.sin(angle) * distance,
        delay: Math.random() * 0.06,
      }
    })
  }, [milestone?.big])

  const flyTx = target ? target.left + target.width / 2 - originX : 0
  const flyTy = target ? target.top + target.height / 2 - originY : -70

  const coins = useMemo(() => {
    if (!milestone?.big) return []
    return Array.from({ length: 16 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.3,
      duration: 1.3 + Math.random() * 0.9,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    }))
  }, [milestone?.big])

  return (
    <div
      className="pointer-events-none fixed inset-0 z-40 overflow-hidden"
      aria-hidden="true"
    >
      {/* Star burst from the tapped answer */}
      {stars.map((s) => (
        <span
          key={s.id}
          className="animate-star-burst absolute font-display text-secondary"
          style={
            {
              left: `${originX}px`,
              top: `${originY}px`,
              "--sx": `${s.dx}px`,
              "--sy": `${s.dy}px`,
              animationDelay: `${s.delay}s`,
            } as CSSProperties
          }
        >
          {s.glyph}
        </span>
      ))}

      {/* "+1" flying toward the streak meter (or drifting up if there's no meter to target) */}
      <span
        className="animate-fly-up absolute font-display text-lg font-bold text-primary"
        style={
          {
            left: `${originX}px`,
            top: `${originY}px`,
            "--tx": `${flyTx}px`,
            "--ty": `${flyTy}px`,
          } as CSSProperties
        }
      >
        +1
      </span>

      {/* Milestone banner */}
      {milestone && (
        <div className="absolute inset-x-0 top-[28%] flex justify-center px-6">
          <p
            className={cn(
              "animate-milestone-pop rounded-2xl px-6 py-3 text-center font-display text-2xl font-bold shadow-xl sm:text-3xl",
              milestone.big
                ? "bg-gradient-to-r from-primary via-secondary to-belt-blue text-primary-foreground"
                : "bg-primary text-primary-foreground",
            )}
          >
            {milestone.emoji} {milestone.label}
          </p>
        </div>
      )}

      {/* Rare bigger celebration: a quick coin/confetti shower */}
      {coins.map((c) => (
        <span
          key={c.id}
          className={cn("confetti-piece", c.color)}
          style={{
            left: `${c.left}%`,
            animationDelay: `${c.delay}s`,
            animationDuration: `${c.duration}s`,
          }}
        />
      ))}
    </div>
  )
}
