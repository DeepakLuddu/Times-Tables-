"use client"

import { cn } from "@/lib/utils"
import { ArrowRight } from "lucide-react"
import { useState } from "react"

type View = "dots" | "line" | "groups"

// Kid-friendly objects for the "picture groups" view. Rotated per fact so the
// same question doesn't always look identical, but stable for a given fact.
const OBJECTS = ["🍬", "⭐", "🍎", "⚽", "🍪", "🌸", "🐟", "🚀"]

export function FactVisuals({
  a,
  b,
  onContinue,
}: {
  a: number
  b: number
  onContinue: () => void
}) {
  const [view, setView] = useState<View>("dots")
  const product = a * b

  return (
    <div className="mb-2 rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-lg">
      <p className="mb-3 text-center font-display text-lg font-semibold text-primary">
        {`Let's see ${a} × ${b}`}
      </p>

      {/* View picker */}
      <div className="grid grid-cols-3 gap-2" role="tablist">
        {(
          [
            ["dots", "Dot array"],
            ["line", "Number line"],
            ["groups", "Picture groups"],
          ] as [View, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={view === key}
            onClick={() => setView(key)}
            className={cn(
              "rounded-xl px-2 py-2 font-sans text-sm font-semibold transition-colors",
              view === key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-foreground/70 hover:bg-muted/70",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Visual */}
      <div className="mt-4 flex min-h-44 flex-col items-center justify-center">
        {view === "dots" && <DotArray a={a} b={b} />}
        {view === "line" && <NumberLine a={a} b={b} />}
        {view === "groups" && <PictureGroups a={a} b={b} />}
      </div>

      <button
        type="button"
        onClick={onContinue}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-4 font-display text-xl font-semibold text-primary-foreground transition-transform active:scale-95"
      >
        Got it, next question
        <ArrowRight className="size-5" />
      </button>
    </div>
  )
}

// ---- 1. Dot array: exactly `a` rows of `b` dots ----
function DotArray({ a, b }: { a: number; b: number }) {
  const maxDim = Math.max(a, b)
  const dot = maxDim <= 5 ? 22 : maxDim <= 8 ? 16 : maxDim <= 10 ? 12 : 10
  const gap = maxDim <= 5 ? 8 : maxDim <= 8 ? 6 : 5

  return (
    <div className="flex flex-col items-center">
      <div className="max-w-full overflow-x-auto">
        <div className="flex flex-col" style={{ gap }}>
          {Array.from({ length: a }).map((_, row) => (
            <div
              key={row}
              className="flex"
              // Extra breathing room every 5th row for easy counting.
              style={{ gap, marginTop: row > 0 && row % 5 === 0 ? gap * 2 : 0 }}
            >
              {Array.from({ length: b }).map((_, col) => (
                <span
                  key={col}
                  className="shrink-0 rounded-full bg-primary"
                  style={{
                    width: dot,
                    height: dot,
                    marginLeft: col > 0 && col % 5 === 0 ? gap * 2 : 0,
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <p className="mt-4 text-center font-mono text-base text-card-foreground/80">
        {`${a} rows of ${b} = ${a * b}`}
      </p>
    </div>
  )
}

// ---- 2. Number line: `a` jumps of `b` from 0 to a*b ----
function NumberLine({ a, b }: { a: number; b: number }) {
  const W = 340
  const H = 128
  const padX = 22
  const baseY = 84
  const usable = W - padX * 2
  const step = usable / a
  const arcH = Math.min(step * 0.55, 44)
  const markX = (i: number) => padX + i * step
  const product = a * b

  return (
    <div className="flex w-full flex-col items-center">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full max-w-md"
        role="img"
        aria-label={`${a} jumps of ${b} landing on ${product}`}
      >
        {/* Baseline */}
        <g className="text-card-foreground/25">
          <line
            x1={padX}
            y1={baseY}
            x2={W - padX}
            y2={baseY}
            stroke="currentColor"
            strokeWidth={2}
          />
        </g>

        {/* Jump arcs */}
        <g className="text-primary" fill="none" stroke="currentColor">
          {Array.from({ length: a }).map((_, i) => {
            const x0 = markX(i)
            const x1 = markX(i + 1)
            const midX = (x0 + x1) / 2
            return (
              <path
                key={i}
                d={`M ${x0} ${baseY} Q ${midX} ${baseY - arcH} ${x1} ${baseY}`}
                strokeWidth={2.5}
                strokeLinecap="round"
              />
            )
          })}
        </g>

        {/* Marks + labels */}
        {Array.from({ length: a + 1 }).map((_, i) => {
          const x = markX(i)
          const isLast = i === a
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
                y={baseY + 20}
                textAnchor="middle"
                className={cn(
                  "fill-current font-mono",
                  isLast
                    ? "font-bold text-secondary"
                    : "text-card-foreground/60",
                )}
                style={{ fontSize: 11 }}
              >
                {i * b}
              </text>
            </g>
          )
        })}
      </svg>
      <p className="mt-2 text-center font-mono text-base text-card-foreground/80">
        {`${a} jumps of ${b} lands on ${product}`}
      </p>
    </div>
  )
}

// ---- 3. Picture groups: `a` containers of `b` objects each ----
function PictureGroups({ a, b }: { a: number; b: number }) {
  const obj = OBJECTS[(a * 31 + b) % OBJECTS.length]
  const total = a * b
  // Past this many objects, drawing every icon becomes visual noise, so we
  // show a few representative groups plus a clear count instead.
  const COMPACT_AT = 64
  const compact = total > COMPACT_AT

  const shownGroups = compact ? Math.min(a, 3) : a
  const emojiSize = compact
    ? "1.25rem"
    : total <= 20
      ? "1.6rem"
      : total <= 40
        ? "1.3rem"
        : "1.1rem"

  return (
    <div className="flex w-full flex-col items-center">
      <div className="flex flex-wrap justify-center gap-2">
        {Array.from({ length: shownGroups }).map((_, g) => (
          <div
            key={g}
            className="flex max-w-[7.5rem] flex-wrap justify-center gap-0.5 rounded-xl border border-border bg-muted/60 p-2"
          >
            {Array.from({ length: b }).map((_, i) => (
              <span
                key={i}
                aria-hidden
                className="leading-none"
                style={{ fontSize: emojiSize }}
              >
                {obj}
              </span>
            ))}
          </div>
        ))}
        {compact && a > shownGroups && (
          <div className="flex items-center rounded-xl border border-dashed border-border px-3 py-2 text-center font-sans text-sm font-semibold text-card-foreground/70">
            {`+ ${a - shownGroups} more groups of ${b}`}
          </div>
        )}
      </div>
      <p className="mt-4 text-center font-mono text-base text-card-foreground/80">
        {`${a} groups of ${b} = ${total}`}
      </p>
    </div>
  )
}
