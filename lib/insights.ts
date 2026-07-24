// Session insight engine — diffs stats from just-before a session against
// stats including it, and turns the difference into plain-English messages.
// This is what closes the loop: the trouble facts surfaced here are fed back
// in to force the opening questions of the next session.

import {
  ALL_FACTS,
  type Attempt,
  type Belt,
  type Mode,
  beltIndex,
  computeFactStats,
  computeTableStats,
  factKey,
  normalizeFact,
} from "./engine"

export type InsightType =
  | "levelUp"
  | "improved"
  | "persistentTrouble"
  | "newTrouble"
  | "speedIssue"

export interface Insight {
  type: InsightType
  text: string
}

export interface TroubleFact {
  a: number
  b: number
}

export interface BeltPromotion {
  table: number
  belt: Belt
}

export interface SessionSummary {
  sessionId: string
  mode: Mode
  date: string // ISO string, last attempt time
  questions: number
  correct: number
  accuracy: number // 0..100 (percent)
  insights: Insight[]
  troubleFacts: TroubleFact[] // persistent + new trouble, drives next session
  promotions: BeltPromotion[] // belts earned during this session
}

const ORDINAL = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"]

function factLabel(a: number, b: number): string {
  const [x, y] = normalizeFact(a, b)
  return `${x} × ${y}`
}

function tableName(t: number): string {
  return `${t}s`
}

function beltName(belt: string): string {
  return belt.charAt(0).toUpperCase() + belt.slice(1)
}

// Count misses per normalized fact within a set of attempts.
function missCounts(attempts: Attempt[]): Map<string, number> {
  const misses = new Map<string, number>()
  for (const at of attempts) {
    if (!at.correct) {
      const key = factKey(at.factorA, at.factorB)
      misses.set(key, (misses.get(key) ?? 0) + 1)
    }
  }
  return misses
}

// Was this fact already showing a wrong pattern before the session?
function wasFlaggedBefore(
  beforeStats: ReturnType<typeof computeFactStats>,
  key: string,
): boolean {
  const s = beforeStats.get(key)
  if (!s) return false
  return (
    s.recentMisses > 0 ||
    s.consecWrong > 0 ||
    (s.attempts >= 2 && s.accuracy < 0.6)
  )
}

// Compute the full insight summary for one completed session.
export function sessionInsights(
  allAttempts: Attempt[],
  sessionId: string,
): SessionSummary | null {
  const sessionAttempts = allAttempts
    .filter((a) => a.sessionId === sessionId)
    .sort((m, n) => m.createdAt.getTime() - n.createdAt.getTime())
  if (sessionAttempts.length === 0) return null

  const mode = sessionAttempts[0].mode
  const sessionStart = sessionAttempts[0].createdAt.getTime()
  const lastAt = sessionAttempts[sessionAttempts.length - 1].createdAt

  const before = allAttempts.filter((a) => a.createdAt.getTime() < sessionStart)
  const including = [...before, ...sessionAttempts]

  const beforeFacts = computeFactStats(before)
  const afterFacts = computeFactStats(including)
  const beforeTables = computeTableStats(before)
  const afterTables = computeTableStats(including)

  const insights: Insight[] = []
  const promotions: BeltPromotion[] = []

  // Level up: a table's belt tier increased during the session.
  for (let t = 1; t <= 12; t++) {
    const b = beforeTables.get(t)!
    const a = afterTables.get(t)!
    if (beltIndex(a.belt) > beltIndex(b.belt)) {
      insights.push({
        type: "levelUp",
        text: `Your ${tableName(t)} reached ${beltName(a.belt)} belt!`,
      })
      promotions.push({ table: t, belt: a.belt })
    }
  }

  // Improved: a fact newly mastered this session.
  const sessionFactKeys = new Set(
    sessionAttempts.map((a) => factKey(a.factorA, a.factorB)),
  )
  for (const key of sessionFactKeys) {
    const wasMastered = beforeFacts.get(key)?.mastered ?? false
    const nowMastered = afterFacts.get(key)?.mastered ?? false
    if (!wasMastered && nowMastered) {
      const s = afterFacts.get(key)!
      insights.push({
        type: "improved",
        text: `${factLabel(s.a, s.b)} is now mastered. Nice.`,
      })
    }
  }

  // Persistent / new trouble: facts missed 2+ times this session.
  const sessionMisses = missCounts(sessionAttempts)
  const troubleFacts: TroubleFact[] = []
  for (const [key, count] of sessionMisses) {
    if (count < 2) continue
    const s = afterFacts.get(key)!
    const flagged = wasFlaggedBefore(beforeFacts, key)
    troubleFacts.push({ a: s.a, b: s.b })
    if (flagged) {
      insights.push({
        type: "persistentTrouble",
        text: `${factLabel(s.a, s.b)} is still tripping things up — ${count} misses this session, same as before.`,
      })
    } else {
      insights.push({
        type: "newTrouble",
        text: `${factLabel(s.a, s.b)} started slipping — ${count} misses this session. We'll bring it back next time.`,
      })
    }
  }

  // Speed issue (sprint only): accuracy well below the untimed baseline.
  const correctCount = sessionAttempts.filter((a) => a.correct).length
  const sessionAccuracy = correctCount / sessionAttempts.length
  if (mode === "sprint") {
    const practiceBefore = before.filter((a) => a.mode === "practice")
    if (practiceBefore.length >= 5) {
      const baseline =
        practiceBefore.filter((a) => a.correct).length / practiceBefore.length
      if (sessionAccuracy <= baseline - 0.15) {
        insights.push({
          type: "speedIssue",
          text: `Under the clock your accuracy dropped to ${Math.round(
            sessionAccuracy * 100,
          )}% (usually ${Math.round(
            baseline * 100,
          )}%). You know these — just breathe and slow down.`,
        })
      }
    }
  }

  return {
    sessionId,
    mode,
    date: lastAt.toISOString(),
    questions: sessionAttempts.length,
    correct: correctCount,
    accuracy: Math.round(sessionAccuracy * 100),
    insights,
    troubleFacts,
    promotions,
  }
}

// Ordered list of completed sessions (most recent first) with insights.
export function allSessionSummaries(allAttempts: Attempt[]): SessionSummary[] {
  // Preserve first-seen order by session, then sort by recency.
  const order: string[] = []
  const seen = new Set<string>()
  const sorted = [...allAttempts].sort(
    (m, n) => m.createdAt.getTime() - n.createdAt.getTime(),
  )
  for (const at of sorted) {
    if (!seen.has(at.sessionId)) {
      seen.add(at.sessionId)
      order.push(at.sessionId)
    }
  }
  const summaries = order
    .map((sid) => sessionInsights(allAttempts, sid))
    .filter((s): s is SessionSummary => s !== null)
  return summaries.reverse() // most recent first
}

// ---- Parent-facing report ----

export interface ParentTable {
  table: number
  belt: Belt
  accuracy: number // percent
  attempts: number
}

export interface ParentTrouble {
  a: number
  b: number
  accuracy: number // percent
  attempts: number
  misses: number
}

export interface DayActivity {
  date: string // yyyy-mm-dd (UTC)
  questions: number
  correct: number
  accuracy: number // percent, 0 when no questions
}

export interface ParentReport {
  totalQuestions: number
  totalCorrect: number
  overallAccuracy: number // percent
  sessionsCount: number
  factsAttempted: number // out of 78
  factsMastered: number
  masteryPercent: number
  lastPlayed: string | null // ISO
  tables: ParentTable[]
  strongTables: number[] // brown or black belt
  troubleFacts: ParentTrouble[]
  recentActivity: DayActivity[] // last 14 days, chronological
  recommendation: string
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// Aggregate everything a parent needs from the raw attempts log.
export function parentReport(allAttempts: Attempt[]): ParentReport {
  const totalQuestions = allAttempts.length
  const totalCorrect = allAttempts.filter((a) => a.correct).length
  const overallAccuracy =
    totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0

  const sessionsCount = new Set(allAttempts.map((a) => a.sessionId)).size

  const factStats = computeFactStats(allAttempts)
  const factsAttempted = factStats.size
  const factsMastered = Array.from(factStats.values()).filter(
    (s) => s.mastered,
  ).length
  const masteryPercent = Math.round((factsMastered / ALL_FACTS.length) * 100)

  const tableStats = computeTableStats(allAttempts)
  const tables: ParentTable[] = Array.from(tableStats.values())
    .sort((a, b) => a.table - b.table)
    .map((t) => ({
      table: t.table,
      belt: t.belt,
      accuracy: Math.round(t.accuracy * 100),
      attempts: t.attempts,
    }))

  const strongTables = tables
    .filter((t) => beltIndex(t.belt) >= beltIndex("brown"))
    .map((t) => t.table)

  // Trouble facts: attempted, not mastered, showing a wrong pattern.
  const troubleFacts: ParentTrouble[] = Array.from(factStats.values())
    .filter(
      (s) =>
        !s.mastered &&
        s.attempts > 0 &&
        (s.recentMisses > 0 || s.consecWrong > 0 || s.accuracy < 0.6),
    )
    .sort(
      (a, b) =>
        b.consecWrong - a.consecWrong ||
        b.recentMisses - a.recentMisses ||
        a.accuracy - b.accuracy,
    )
    .slice(0, 8)
    .map((s) => ({
      a: s.a,
      b: s.b,
      accuracy: Math.round(s.accuracy * 100),
      attempts: s.attempts,
      misses: s.attempts - s.correct,
    }))

  // Last 14 days of activity, chronological.
  const byDay = new Map<string, { questions: number; correct: number }>()
  for (const at of allAttempts) {
    const key = dayKey(at.createdAt)
    const entry = byDay.get(key) ?? { questions: 0, correct: 0 }
    entry.questions++
    if (at.correct) entry.correct++
    byDay.set(key, entry)
  }
  const recentActivity: DayActivity[] = []
  const now = new Date()
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now)
    d.setUTCDate(d.getUTCDate() - i)
    const key = dayKey(d)
    const entry = byDay.get(key) ?? { questions: 0, correct: 0 }
    recentActivity.push({
      date: key,
      questions: entry.questions,
      correct: entry.correct,
      accuracy:
        entry.questions > 0
          ? Math.round((entry.correct / entry.questions) * 100)
          : 0,
    })
  }

  const sortedByTime = [...allAttempts].sort(
    (m, n) => n.createdAt.getTime() - m.createdAt.getTime(),
  )
  const lastPlayed =
    sortedByTime.length > 0 ? sortedByTime[0].createdAt.toISOString() : null

  let recommendation: string
  if (totalQuestions === 0) {
    recommendation =
      "No practice yet. Have them try a short Practice session to get started."
  } else if (troubleFacts.length > 0) {
    const list = troubleFacts
      .slice(0, 3)
      .map((f) => `${f.a} × ${f.b}`)
      .join(", ")
    recommendation = `Focus area: ${list}. These come up first in the next session — a few minutes of daily Practice will help them stick.`
  } else if (masteryPercent >= 90) {
    recommendation =
      "Nearly every fact is mastered. Sprint mode is great for keeping recall fast and confident."
  } else {
    recommendation =
      "Steady progress with no trouble spots flagged. Keep up short, regular Practice sessions to build mastery across all tables."
  }

  return {
    totalQuestions,
    totalCorrect,
    overallAccuracy,
    sessionsCount,
    factsAttempted,
    factsMastered,
    masteryPercent,
    lastPlayed,
    tables,
    strongTables,
    troubleFacts,
    recentActivity,
    recommendation,
  }
}

export { ORDINAL }
