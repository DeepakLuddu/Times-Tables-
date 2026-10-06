// Detailed, per-session activity log for the Parent section. This is the
// raw analytics view that used to live on the child-facing Belt Wall
// ("Past Sessions") — moved here since a 9-year-old doesn't need a
// transaction log, but a parent reviewing progress does.
//
// Computed on read, same as everything else — nothing here is stored.

import {
  type Attempt,
  type Belt,
  type Mode,
  beltIndex,
  computeFactStats,
  factKey,
} from "./engine"
import { allSessionSummaries } from "./insights"
import { computeTableMastery } from "./mastery"
import { WEEKLY_CAP_CENTS, weekStartOf } from "./piggybank"

// How many of the most recent sessions to build full detail for — bounds
// the (session x table) replay cost; older history is still in the raw
// attempts log, just not surfaced in this view.
const SESSION_LOG_LIMIT = 50

export interface DetailedSession {
  sessionId: string
  date: string // ISO, last attempt time
  mode: Mode
  timeSpentSeconds: number
  questions: number
  correct: number
  incorrect: number
  accuracy: number // 0-100
  tablesPractised: number[]
  factsMastered: string[] // formatted, e.g. "7 × 8"
  masteryChanges: { table: number; before: number; after: number }[]
  beltChanges: { table: number; belt: Belt }[]
  piggyEarnedCents: number
}

function weekKeyOf(d: Date): string {
  return weekStartOf(d).toISOString().slice(0, 10)
}

export function buildSessionLog(
  attempts: Attempt[],
  awards: Map<number, Date>,
): DetailedSession[] {
  const sorted = [...attempts].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  )
  const summaries = allSessionSummaries(attempts).slice(0, SESSION_LOG_LIMIT)

  return summaries.map((s) => {
    const sessionAttempts = sorted.filter((a) => a.sessionId === s.sessionId)
    const first = sessionAttempts[0]
    const last = sessionAttempts[sessionAttempts.length - 1]
    const timeSpentSeconds = Math.max(
      0,
      Math.round(
        (last.createdAt.getTime() -
          first.createdAt.getTime() +
          (last.answerMs ?? 0)) /
          1000,
      ),
    )

    const tablesPractised = Array.from(
      new Set(sessionAttempts.flatMap((a) => [a.factorA, a.factorB])),
    ).sort((a, b) => a - b)

    const before = sorted.filter(
      (a) => a.createdAt.getTime() < first.createdAt.getTime(),
    )
    const including = [...before, ...sessionAttempts]

    // Facts newly mastered during this session.
    const beforeFacts = computeFactStats(before)
    const afterFacts = computeFactStats(including)
    const factsMastered: string[] = []
    for (const key of new Set(
      sessionAttempts.map((a) => factKey(a.factorA, a.factorB)),
    )) {
      const wasMastered = beforeFacts.get(key)?.mastered ?? false
      const nowMastered = afterFacts.get(key)?.mastered ?? false
      if (!wasMastered && nowMastered) {
        const st = afterFacts.get(key)!
        factsMastered.push(`${st.a} × ${st.b}`)
      }
    }

    // Mastery % and belt changes, per table touched this session — sourced
    // from the same mastery engine the child's Belt Wall uses, so parents
    // see the real numbers, not the old simplified accuracy belts.
    const masteryChanges: DetailedSession["masteryChanges"] = []
    const beltChanges: DetailedSession["beltChanges"] = []
    for (const t of tablesPractised) {
      const beforeM = computeTableMastery(t, before, awards.get(t) ?? null)
      const afterM = computeTableMastery(t, including, awards.get(t) ?? null)
      if (afterM.percent !== beforeM.percent) {
        masteryChanges.push({
          table: t,
          before: beforeM.percent,
          after: afterM.percent,
        })
      }
      if (beltIndex(afterM.belt) > beltIndex(beforeM.belt)) {
        beltChanges.push({ table: t, belt: afterM.belt })
      }
    }

    // Piggy Bank earnings for this session: correct answers, capped by
    // whatever weekly allowance remained at the point each one landed.
    let piggyEarnedCents = 0
    const weekTotalsSoFar = new Map<string, number>()
    for (const a of before) {
      if (!a.correct) continue
      const wk = weekKeyOf(a.createdAt)
      weekTotalsSoFar.set(wk, (weekTotalsSoFar.get(wk) ?? 0) + 1)
    }
    for (const a of sessionAttempts) {
      if (!a.correct) continue
      const wk = weekKeyOf(a.createdAt)
      const countBefore = weekTotalsSoFar.get(wk) ?? 0
      const earnedBefore = Math.min(countBefore, WEEKLY_CAP_CENTS)
      const earnedAfter = Math.min(countBefore + 1, WEEKLY_CAP_CENTS)
      piggyEarnedCents += earnedAfter - earnedBefore
      weekTotalsSoFar.set(wk, countBefore + 1)
    }

    return {
      sessionId: s.sessionId,
      date: s.date,
      mode: s.mode,
      timeSpentSeconds,
      questions: s.questions,
      correct: s.correct,
      incorrect: s.questions - s.correct,
      accuracy: s.accuracy,
      tablesPractised,
      factsMastered,
      masteryChanges,
      beltChanges,
      piggyEarnedCents,
    }
  })
}
