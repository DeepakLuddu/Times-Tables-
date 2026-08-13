"use client"

import { cn } from "@/lib/utils"
import { useEffect, useRef, useState } from "react"

// Animates a displayed number smoothly toward `target` whenever it changes
// (including the very first render, so cards sweep in from 0 on load).
// Skips the animation entirely under prefers-reduced-motion.
export function useAnimatedNumber(target: number, durationMs = 600): number {
  const [display, setDisplay] = useState(0)
  const prevTarget = useRef(0)

  useEffect(() => {
    const from = prevTarget.current
    const to = target
    prevTarget.current = target

    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

    if (from === to || reduceMotion) {
      setDisplay(to)
      return
    }

    let raf = 0
    let start: number | null = null
    function tick(ts: number) {
      if (start === null) start = ts
      const t = Math.min(1, (ts - start) / durationMs)
      const eased = 1 - (1 - t) * (1 - t) // ease-out
      setDisplay(Math.round(from + (to - from) * eased))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, durationMs])

  return display
}

// A horizontal mastery bar: fills smoothly 0-100%, shows the percentage,
// and reads as one visual system across all 12 belt cards.
export function MasteryBar({
  percent,
  size = "md",
  className,
}: {
  percent: number
  size?: "sm" | "md"
  className?: string
}) {
  const displayed = useAnimatedNumber(percent)
  const height = size === "sm" ? "h-1.5" : "h-2.5"

  return (
    <div className={cn("w-full", className)}>
      <div
        className={cn(
          "w-full overflow-hidden rounded-full bg-muted",
          height,
        )}
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500 ease-out",
            percent >= 100 ? "bg-belt-black" : "bg-primary",
          )}
          style={{ width: `${displayed}%` }}
        />
      </div>
    </div>
  )
}

// Just the animated percentage number, for places that show it separately
// from the bar (e.g. large in the detail view).
export function AnimatedPercentLabel({
  percent,
  className,
}: {
  percent: number
  className?: string
}) {
  const displayed = useAnimatedNumber(percent)
  return <span className={className}>{displayed}%</span>
}
