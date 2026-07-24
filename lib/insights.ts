// Session insight engine — diffs stats from just-before a session against
// stats including it, and turns the difference into plain-English messages.
// This is what closes the loop: the trouble facts surfaced here are fed back
// in to force the opening questions of the next session.

import {
  type Attempt,
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

export interface SessionSummary {
  sessionId: string
  mode: Mode
  date: string // ISO string, last attempt time
  questions: number
  correct: number
  accuracy: number // 0..100 (percent)
  insights: Insight[]
  troubleFacts: TroubleFact[] // persistent + new trouble, drives next session
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

  // Level up: a table's belt tier increased during the session.
  for (let t = 1; t <= 12; t++) {
    const b = beforeTables.get(t)!
    const a = afterTables.get(t)!
    if (beltIndex(a.belt) > beltIndex(b.belt)) {
      insights.push({
        type: "levelUp",
        text: `Your ${tableName(t)} reached ${beltName(a.belt)} belt!`,
      })
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

export { ORDINAL }
