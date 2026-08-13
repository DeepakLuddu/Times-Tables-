"use client"

import { CONFETTI_COLORS } from "@/components/belt-promotion"
import { formatCents } from "@/lib/piggybank"
import { cn } from "@/lib/utils"
import { useMemo, type CSSProperties } from "react"

export type PiggyCelebrationData = {
  /** Bounding rect of the tapped answer button, captured on click. */
  origin: DOMRect
  /** Bounding rect of the piggy bank widget the coin should fly toward. */
  target: DOMRect | null
  /** 0 or 1 — 0 means this week's $5 cap was already reached. */
  earnedCents: number
  crossedDime: boolean
  crossedDollar: boolean
  reachedWeeklyCap: boolean
  balanceAfterCents: number
}

// Quick, obvious feedback for a correct answer that earned a cent: a coin
// flies from the tapped button into the piggy bank (the piggy bank itself
// bounces separately, driven by PiggyBank's own bounceKey). At meaningful
// lifetime milestones we layer on a bigger, brief banner — capped to one
// per answer (weekly cap outranks dollar, which outranks dime) so the
// screen never shows more than one banner at once.
export function PiggyCelebration({
  origin,
  target,
  earnedCents,
  crossedDime,
  crossedDollar,
  reachedWeeklyCap,
  balanceAfterCents,
}: PiggyCelebrationData) {
  const originX = origin.left + origin.width / 2
  const originY = origin.top + origin.height / 2
  const targetX = target ? target.left + target.width / 2 : originX
  const targetY = target ? target.top + target.height / 2 : originY - 90

  const tx = targetX - originX
  const ty = targetY - originY

  const banner = reachedWeeklyCap
    ? { tier: "cap" as const }
    : crossedDollar
      ? { tier: "dollar" as const }
      : crossedDime
        ? { tier: "dime" as const }
        : null

  const coins = useMemo(() => {
    if (banner?.tier !== "cap" && banner?.tier !== "dollar") return []
    const count = banner.tier === "cap" ? 18 : 12
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.3,
      duration: 1.3 + Math.random() * 0.9,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    }))
  }, [banner?.tier])

  return (
    <div
      className="pointer-events-none fixed inset-0 z-40 overflow-hidden"
      aria-hidden="true"
    >
      {/* Coin flying from the tapped answer into the piggy bank */}
      {earnedCents > 0 && (
        <>
          <span
            className="animate-coin-fly absolute text-2xl"
            style={
              {
                left: `${originX}px`,
                top: `${originY}px`,
                "--ctx": `${tx}px`,
                "--cty": `${ty}px`,
              } as CSSProperties
            }
          >
            🪙
          </span>
          <span
            className="animate-fly-up absolute font-display text-lg font-bold text-primary"
            style={
              {
                left: `${originX - 28}px`,
                top: `${originY}px`,
                "--tx": "0px",
                "--ty": "-46px",
              } as CSSProperties
            }
          >
            +1¢
          </span>
        </>
      )}

      {/* Milestone banner: at most one, most-significant wins */}
      {banner?.tier === "cap" && (
        <div className="absolute inset-x-0 top-[24%] flex justify-center px-6">
          <div className="animate-milestone-pop flex flex-col items-center gap-1 rounded-2xl bg-gradient-to-r from-primary via-secondary to-belt-blue px-7 py-4 text-center shadow-xl">
            <p className="font-display text-2xl font-bold text-primary-foreground sm:text-3xl">
              🐷 PIGGY FULL!
            </p>
            <p className="font-display text-base font-semibold text-primary-foreground/90">
              You earned $5 this week!
            </p>
            <p className="mt-1 max-w-xs text-balance font-sans text-xs text-primary-foreground/80">
              Cash rewards reset next week. Keep practising to build your
              streak.
            </p>
          </div>
        </div>
      )}
      {banner?.tier === "dollar" && (
        <div className="absolute inset-x-0 top-[26%] flex justify-center px-6">
          <p className="animate-milestone-pop rounded-2xl bg-primary px-6 py-3 text-center font-display text-2xl font-bold text-primary-foreground shadow-xl">
            💰 {formatCents(balanceAfterCents)} earned!
          </p>
        </div>
      )}
      {banner?.tier === "dime" && (
        <div className="absolute inset-x-0 top-[30%] flex justify-center px-6">
          <p className="animate-dime-pop rounded-full bg-secondary px-4 py-1.5 text-center font-display text-sm font-semibold text-secondary-foreground shadow-lg">
            10¢ earned!
          </p>
        </div>
      )}

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
