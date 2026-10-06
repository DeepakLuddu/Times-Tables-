// Piggy Bank engine — pure functions over the attempts log plus a small
// withdrawals log, in the same spirit as lib/engine.ts and lib/insights.ts:
// nothing about the balance is stored directly. It's recomputed on every
// read from two things:
//   1. every correct answer ever recorded (1 cent each, capped at 500
//      cents per calendar week)
//   2. every withdrawal a parent has recorded
//
// This means the weekly cap and "never below zero" guardrails hold by
// construction rather than by remembering to enforce them somewhere.

import type { Attempt } from "./engine"

export const CENT_PER_CORRECT = 1
export const WEEKLY_CAP_CENTS = 500
export const DAILY_GOAL_SECONDS = 15 * 60

export interface WithdrawalEntry {
  id: number
  amountCents: number
  balanceBeforeCents: number
  balanceAfterCents: number
  createdAt: Date
}

export interface PiggyBankSummary {
  balanceCents: number
  earnedThisWeekCents: number
  weeklyCapCents: number
  /** ISO yyyy-mm-dd of the Monday (UTC) that starts the current tracking week. */
  weekStart: string
  totalCorrect: number
  correctThisWeek: number
  currentStreak: number
  bestStreak: number
  withdrawals: WithdrawalEntry[]
}

// The Monday 00:00 UTC that starts the week containing `d`.
export function weekStartOf(d: Date): Date {
  const day = d.getUTCDay() // 0 = Sunday .. 6 = Saturday
  const diffToMonday = day === 0 ? -6 : 1 - day
  const monday = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  )
  monday.setUTCDate(monday.getUTCDate() + diffToMonday)
  return monday
}

function weekKey(d: Date): string {
  return weekStartOf(d).toISOString().slice(0, 10)
}

// Cents earned from N correct answers in a single week, capped.
function weekEarnedCents(correctInWeek: number): number {
  return Math.min(correctInWeek * CENT_PER_CORRECT, WEEKLY_CAP_CENTS)
}

// Recompute the full Piggy Bank state from scratch. `now` is injectable for
// tests; defaults to the real current time.
export function computePiggyBank(
  attempts: Pick<Attempt, "correct" | "createdAt">[],
  withdrawals: WithdrawalEntry[],
  now: Date = new Date(),
): PiggyBankSummary {
  const sorted = [...attempts].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  )

  const correctByWeek = new Map<string, number>()
  let totalCorrect = 0
  let currentStreak = 0
  let bestStreak = 0

  for (const at of sorted) {
    if (at.correct) {
      totalCorrect++
      const wk = weekKey(at.createdAt)
      correctByWeek.set(wk, (correctByWeek.get(wk) ?? 0) + 1)
      currentStreak++
      if (currentStreak > bestStreak) bestStreak = currentStreak
    } else {
      currentStreak = 0
    }
  }

  let lifetimeEarnedCents = 0
  for (const count of correctByWeek.values()) {
    lifetimeEarnedCents += weekEarnedCents(count)
  }

  const thisWeekKey = weekKey(now)
  const correctThisWeek = correctByWeek.get(thisWeekKey) ?? 0
  const earnedThisWeekCents = weekEarnedCents(correctThisWeek)

  const withdrawnCents = withdrawals.reduce((s, w) => s + w.amountCents, 0)
  // Guardrail: balance can never go below zero, even defensively.
  const balanceCents = Math.max(0, lifetimeEarnedCents - withdrawnCents)

  return {
    balanceCents,
    earnedThisWeekCents,
    weeklyCapCents: WEEKLY_CAP_CENTS,
    weekStart: thisWeekKey,
    totalCorrect,
    correctThisWeek,
    currentStreak,
    bestStreak,
    withdrawals,
  }
}

// Did `after` cross upward past a multiple of `centStep` that `before`
// hadn't reached yet? Used to fire milestone celebrations exactly once,
// on the answer that pushes the balance over the line.
export function crossedMultiple(
  beforeCents: number,
  afterCents: number,
  centStep: number,
): boolean {
  return (
    Math.floor(beforeCents / centStep) < Math.floor(afterCents / centStep)
  )
}

export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : ""
  const abs = Math.abs(cents)
  return `${sign}$${(abs / 100).toFixed(2)}`
}

export function formatMinSec(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const m = Math.floor(s / 60)
  const rem = s % 60
  return `${m}:${rem.toString().padStart(2, "0")}`
}

// The child's local calendar day, e.g. "2026-08-13" — deliberately local
// time, not UTC, since the 15-minute goal is about "today" from the kid's
// point of view.
export function localDateKey(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}
