"use client"

import { cn } from "@/lib/utils"

// Shared "concrete → visual" building blocks reused across Addition/
// Subtraction/Division's help widgets, styled to match the existing
// FactVisuals visual language (rounded-2xl cards, bg-primary dots,
// font-mono captions) without importing from it — FactVisuals itself
// stays untouched and multiplication-only.

// ---- Small-number counters (a loose row of dots) ----
export function CounterGroup({
  count,
  crossedOut = 0,
}: {
  count: number
  /** How many of the counters (counted from the end) show as removed — for subtraction's take-away visual. */
  crossedOut?: number
}) {
  const dot = count <= 10 ? 20 : count <= 20 ? 15 : 11
  return (
    <div className="flex max-w-full flex-wrap justify-center gap-1.5">
      {Array.from({ length: count }).map((_, i) => {
        const isCrossedOut = i >= count - crossedOut
        return (
          <span
            key={i}
            className={cn(
              "shrink-0 rounded-full transition-opacity",
              isCrossedOut ? "bg-foreground/15" : "bg-primary",
            )}
            style={{ width: dot, height: dot }}
          />
        )
      })}
    </div>
  )
}

// ---- Ten frame: a 2x5 grid, first `filled` cells shown as dots ----
export function TenFrame({ filled }: { filled: number }) {
  const cells = Math.max(10, filled)
  return (
    <div
      className="grid gap-1.5"
      style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}
    >
      {Array.from({ length: cells }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "flex size-8 items-center justify-center rounded-md border-2",
            i < filled
              ? "border-primary bg-primary"
              : "border-border bg-transparent",
          )}
        />
      ))}
    </div>
  )
}

// ---- Number line with one or more labeled jumps from `start` ----
export function NumberLineJumps({
  start,
  jumps,
}: {
  start: number
  /** Signed deltas applied in order, e.g. [2, 5] or [-5, -3]. */
  jumps: number[]
}) {
  const points = [start]
  for (const j of jumps) points.push(points[points.length - 1] + j)
  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = Math.max(1, max - min)

  const W = 320
  const H = 110
  const padX = 20
  const baseY = 70
  const usable = W - padX * 2
  const xFor = (v: number) => padX + ((v - min) / span) * usable

  return (
    <div className="flex w-full flex-col items-center">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full max-w-md"
        role="img"
        aria-label={`Number line from ${start}, jumps ${jumps.join(", ")}`}
      >
        <line
          x1={padX}
          y1={baseY}
          x2={W - padX}
          y2={baseY}
          className="text-card-foreground/25"
          stroke="currentColor"
          strokeWidth={2}
        />
        {points.slice(0, -1).map((p, i) => {
          const next = points[i + 1]
          const x0 = xFor(p)
          const x1 = xFor(next)
          const midX = (x0 + x1) / 2
          const arcH = Math.min(Math.abs(x1 - x0) * 0.5, 34)
          const delta = jumps[i]
          return (
            <g key={i}>
              <path
                d={`M ${x0} ${baseY} Q ${midX} ${baseY - arcH} ${x1} ${baseY}`}
                fill="none"
                className="text-primary"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
              />
              <text
                x={midX}
                y={baseY - arcH - 6}
                textAnchor="middle"
                className="fill-current font-mono font-bold text-primary"
                style={{ fontSize: 13 }}
              >
                {delta > 0 ? `+${delta}` : delta}
              </text>
            </g>
          )
        })}
        {points.map((p, i) => {
          const isLast = i === points.length - 1
          const x = xFor(p)
          return (
            <g key={i}>
              <line
                x1={x}
                y1={baseY - 5}
                x2={x}
                y2={baseY + 5}
                className="text-card-foreground/40"
                stroke="currentColor"
                strokeWidth={2}
              />
              <circle
                cx={x}
                cy={baseY}
                r={isLast ? 5 : 3}
                className={isLast ? "text-secondary" : "text-primary"}
                fill="currentColor"
              />
              <text
                x={x}
                y={baseY + 22}
                textAnchor="middle"
                className={cn(
                  "fill-current font-mono",
                  isLast ? "font-bold text-secondary" : "text-card-foreground/60",
                )}
                style={{ fontSize: 12 }}
              >
                {p}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ---- Place-value blocks: `tens` rods + `ones` unit squares ----
export function PlaceValueBlocks({ tens, ones }: { tens: number; ones: number }) {
  return (
    <div className="flex flex-wrap items-end justify-center gap-3">
      {tens > 0 && (
        <div className="flex flex-wrap gap-1">
          {Array.from({ length: tens }).map((_, i) => (
            <div
              key={i}
              className="h-16 w-3.5 rounded-sm bg-primary"
              aria-hidden="true"
            />
          ))}
        </div>
      )}
      {ones > 0 && (
        <div className="grid grid-cols-5 gap-1">
          {Array.from({ length: ones }).map((_, i) => (
            <div
              key={i}
              className="size-3.5 rounded-sm bg-secondary"
              aria-hidden="true"
            />
          ))}
        </div>
      )}
      <p className="w-full text-center font-mono text-sm text-card-foreground/70">
        {tens} ten{tens === 1 ? "" : "s"} + {ones} one{ones === 1 ? "" : "s"}
      </p>
    </div>
  )
}

// ---- Equal groups: `total` items shared into `groups` containers ----
export function EqualGroups({ total, groups }: { total: number; groups: number }) {
  const perGroup = Math.floor(total / groups)
  const dot = groups > 6 ? 8 : 12
  return (
    <div className="flex max-w-full flex-wrap justify-center gap-2">
      {Array.from({ length: groups }).map((_, g) => (
        <div
          key={g}
          className="flex max-w-[5.5rem] flex-wrap justify-center gap-1 rounded-xl border border-border bg-muted/60 p-2"
        >
          {Array.from({ length: perGroup }).map((_, i) => (
            <span
              key={i}
              className="shrink-0 rounded-full bg-primary"
              style={{ width: dot, height: dot }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
