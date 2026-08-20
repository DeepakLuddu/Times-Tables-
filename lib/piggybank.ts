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
import { SUBJECTS, type Subject } from "./subjects/types"

export const CENT_PER_CORRECT = 1
export const WEEKLY_CAP_CENTS = 500
// $4 "balanced pool": up to $1 (100c) per subject...
export const SUBJECT_WEEKLY_CAP_CENTS = 100
// ...plus a shared $1 (100c) "flexible pool" any subject can fill once its
// own $1 is used. 4 x 100 + 100 = 500 = WEEKLY_CAP_CENTS, always.
export const FLEXIBLE_WEEKLY_CAP_CENTS = 100
export const DAILY_GOAL_SECONDS = 15 * 60

export interface WithdrawalEntry {
  id: number
  amountCents: number
  balanceBeforeCents: number
  balanceAfterCents: number
  createdAt: Date
}

// This week's earning breakdown — the data behind the compact "Multiplication
// ✓ / Division progressing" indicator (never shown to the child as a full
// finance dashboard, just a simple checkmark/progress state per subject).
export interface WeeklyEarningsBucket {
  bySubjectCents: Record<Subject, number>
  flexibleCents: number
  totalCents: number
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
  /** This week's per-subject + flexible-pool earnings (see WeeklyEarningsBucket). */
  weeklyBreakdown: WeeklyEarningsBucket
}

// The minimal shape allocateWeeklyEarnings/computePiggyBank need from an
// attempt — deliberately its own type (not lib/engine.ts's Attempt) since
// the Piggy Bank never touches factorA/factorB, only which subject a
// correct answer belongs to.
export interface EarningAttempt {
  subject: Subject
  correct: boolean
  createdAt: Date
}

function emptyBucket(): WeeklyEarningsBucket {
  const bySubjectCents = {} as Record<Subject, number>
  for (const s of SUBJECTS) bySubjectCents[s] = 0
  return { bySubjectCents, flexibleCents: 0, totalCents: 0 }
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

export function weekKey(d: Date): string {
  return weekStartOf(d).toISOString().slice(0, 10)
}

// The one canonical per-answer allocation rule — every other place that
// used to duplicate this weekly-cap math (lib/recent-wins.ts's
// piggyMilestoneEvents, lib/session-log.ts's per-session replay,
// components/game-board.tsx's optimistic client-side mirror) now goes
// through this (directly, or via allocateWeeklyEarnings below), so the
// $4-balanced + $1-flexible model can't drift out of sync across call sites.
//
// If that subject's own balanced-pool bucket is still under $1, the cent
// goes there; otherwise, if the shared flexible pool is still under $1, it
// goes there; otherwise this answer earns nothing further this week
// (everything else — mastery, streaks, belts — keeps progressing
// regardless). Mutates `bucket` in place; returns cents earned (0 or 1).
export function allocateOneAnswer(bucket: WeeklyEarningsBucket, subject: Subject): number {
  const subjectCents = bucket.bySubjectCents[subject] ?? 0
  if (subjectCents < SUBJECT_WEEKLY_CAP_CENTS) {
    bucket.bySubjectCents[subject] = subjectCents + CENT_PER_CORRECT
    bucket.totalCents += CENT_PER_CORRECT
    return CENT_PER_CORRECT
  }
  if (bucket.flexibleCents < FLEXIBLE_WEEKLY_CAP_CENTS) {
    bucket.flexibleCents += CENT_PER_CORRECT
    bucket.totalCents += CENT_PER_CORRECT
    return CENT_PER_CORRECT
  }
  return 0
}

// Batch version: replays a whole (chronologically sorted) attempts list
// into per-week buckets using allocateOneAnswer.
export function allocateWeeklyEarnings(
  attempts: Pick<EarningAttempt, "subject" | "correct" | "createdAt">[],
): Map<string, WeeklyEarningsBucket> {
  const sorted = [...attempts].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  )
  const weeks = new Map<string, WeeklyEarningsBucket>()
  for (const at of sorted) {
    if (!at.correct) continue
    const wk = weekKey(at.createdAt)
    let bucket = weeks.get(wk)
    if (!bucket) {
      bucket = emptyBucket()
      weeks.set(wk, bucket)
    }
    allocateOneAnswer(bucket, at.subject)
  }
  return weeks
}

export { emptyBucket }

// Recompute the full Piggy Bank state from scratch. `now` is injectable for
// tests; defaults to the real current time.
export function computePiggyBank(
  attempts: EarningAttempt[],
  withdrawals: WithdrawalEntry[],
  now: Date = new Date(),
): PiggyBankSummary {
  const sorted = [...attempts].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  )

  let totalCorrect = 0
  let currentStreak = 0
  let bestStreak = 0
  const correctByWeek = new Map<string, number>()
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

  const allocation = allocateWeeklyEarnings(attempts)
  let lifetimeEarnedCents = 0
  for (const bucket of allocation.values()) lifetimeEarnedCents += bucket.totalCents

  const thisWeekKey = weekKey(now)
  const correctThisWeek = correctByWeek.get(thisWeekKey) ?? 0
  const weeklyBreakdown = allocation.get(thisWeekKey) ?? emptyBucket()
  const earnedThisWeekCents = weeklyBreakdown.totalCents

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
    weeklyBreakdown,
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
