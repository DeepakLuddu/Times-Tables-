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
import { type EarningAttempt, allocateWeeklyEarnings, weekStartOf } from "./piggybank"
import { multiplicationEngine } from "./subjects/multiplication"

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
  // The player's FULL, unfiltered attempts log (every subject) — needed to
  // compute an accurate "earned this session" figure now that the Piggy
  // Bank's weekly cap is shared across all four subjects. Using only the
  // (multiplication-filtered) `attempts` above would understate how much
  // of the week's cap other subjects' practice had already used.
  allAttempts: EarningAttempt[] = [],
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
      const beforeM = computeTableMastery(
        multiplicationEngine,
        t,
        before,
        awards.get(t) ?? null,
      )
      const afterM = computeTableMastery(
        multiplicationEngine,
        t,
        including,
        awards.get(t) ?? null,
      )
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

    // Piggy Bank earnings for this session, via the one canonical allocator
    // (lib/piggybank.ts's allocateWeeklyEarnings) — computed as the delta
    // in this session's week bucket between "everything up to just before
    // this session" and "everything through this session's last answer",
    // using the FULL cross-subject attempts log so another subject's
    // practice earlier in the week is correctly accounted for.
    const weekOfSession = weekKeyOf(first.createdAt)
    const allBefore = allAttempts.filter(
      (a) => a.createdAt.getTime() < first.createdAt.getTime(),
    )
    const allThroughSession = allAttempts.filter(
      (a) => a.createdAt.getTime() <= last.createdAt.getTime(),
    )
    const centsBefore =
      allocateWeeklyEarnings(allBefore).get(weekOfSession)?.totalCents ?? 0
    const centsThrough =
      allocateWeeklyEarnings(allThroughSession).get(weekOfSession)?.totalCents ?? 0
    const piggyEarnedCents = Math.max(0, centsThrough - centsBefore)

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
