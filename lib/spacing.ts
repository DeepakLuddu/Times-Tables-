// Spaced-repetition schedule for multiplication facts — a Leitner-style box
// per fact, replayed from the attempts log on every read (same computed-on-
// read philosophy as engine.ts: no stored state, nothing to migrate).
//
// Box 0  = just missed / not yet answered fast  → due immediately
// Box 1..5 = each is a longer wait before the fact is worth asking again.
//
// A fact only climbs a box when it is answered correctly AND fast (within
// FLUENCY_FAST_MS) AND it was actually due — so cramming the same fact many
// times in one sitting cannot inflate it. A wrong answer drops it to box 0.
// A correct-but-slow answer parks it in box 1 (known, but not yet fluent).

import type { Attempt, FactStat } from "./engine"
import { factKey } from "./engine"
import { FLUENCY_FAST_MS } from "./mastery"

const HOUR = 60 * 60 * 1000

// Wait before a fact in each box is due again. Day-ish gaps are a little
// short of the full day so "same time tomorrow" still counts as due.
export const BOX_INTERVAL_MS = [
  0,
  20 * 60 * 1000, // 20 minutes — later today / next sitting
  20 * HOUR, // next day
  68 * HOUR, // ~3 days
  160 * HOUR, // ~a week
  480 * HOUR, // ~3 weeks
]
export const MAX_BOX = BOX_INTERVAL_MS.length - 1

// From this box up a fact is asked as a typed answer (no multiple choice to
// guess or eliminate from) — it has been fast on at least three separate,
// spaced occasions, so this is a real recall check.
export const TYPED_FROM_BOX = 3

export interface FactSchedule {
  box: number
  /** When this fact becomes due again (epoch ms). */
  dueAt: number
}

export function computeSchedules(attempts: Attempt[]): Map<string, FactSchedule> {
  const sorted = [...attempts].sort(
    (m, n) => m.createdAt.getTime() - n.createdAt.getTime(),
  )
  // box + the time the current wait started.
  const state = new Map<string, { box: number; anchor: number }>()
  for (const at of sorted) {
    const key = factKey(at.factorA, at.factorB)
    const t = at.createdAt.getTime()
    const cur = state.get(key) ?? { box: 0, anchor: t }
    if (!at.correct) {
      state.set(key, { box: 0, anchor: t })
      continue
    }
    // Asked before it was due → no schedule change (practice, not recall).
    if (t - cur.anchor < BOX_INTERVAL_MS[cur.box]) {
      state.set(key, cur)
      continue
    }
    const fast = typeof at.answerMs === "number" && at.answerMs <= FLUENCY_FAST_MS
    const box = fast ? Math.min(MAX_BOX, cur.box + 1) : Math.max(1, cur.box)
    state.set(key, { box, anchor: t })
  }
  const out = new Map<string, FactSchedule>()
  for (const [key, s] of state) {
    out.set(key, { box: s.box, dueAt: s.anchor + BOX_INTERVAL_MS[s.box] })
  }
  return out
}

// Selection weight: today's miss/new-fact weighting, scaled by whether the
// fact is due. Not-yet-due facts mostly rest; overdue ones rise.
export function spacedWeight(
  stat: FactStat | undefined,
  sched: FactSchedule | undefined,
  now: number,
): number {
  if (!stat) return 0.3 + 1.0 // never practiced
  const base =
    0.3 +
    stat.recentMisses * 1.5 +
    stat.consecWrong * 2.0 +
    (stat.attempts < 3 ? 1.0 : 0)
  if (!sched) return base
  if (now < sched.dueAt) return base * 0.1
  const interval = BOX_INTERVAL_MS[sched.box] || HOUR
  const overdue = Math.min(3, (now - sched.dueAt) / interval)
  return base * (2 + overdue)
}

// Whether the next ask of this fact should be a typed answer.
export function isTypedFact(sched: FactSchedule | undefined): boolean {
  return (sched?.box ?? 0) >= TYPED_FROM_BOX
}
