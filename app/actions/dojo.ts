"use server"

import { db } from "@/lib/db"
import { attempts as attemptsTable } from "@/lib/db/schema"
import {
  type Attempt,
  type Mode,
  type Question,
  type TableStat,
  beltIndex,
  computeFactStats,
  computeTableStats,
  makeQuestion,
  normalizeFact,
  pickWeightedFact,
} from "@/lib/engine"
import {
  type BeltPromotion,
  type ParentReport,
  type SessionSummary,
  type TroubleFact,
  allSessionSummaries,
  parentReport,
} from "@/lib/insights"
import { eq } from "drizzle-orm"

// Load a player's full attempts log as engine-ready Attempt objects.
async function loadAttempts(playerId: string): Promise<Attempt[]> {
  if (!playerId) return []
  const rows = await db
    .select()
    .from(attemptsTable)
    .where(eq(attemptsTable.playerId, playerId))
  return rows.map((r) => ({
    factorA: r.factorA,
    factorB: r.factorB,
    correct: r.correct,
    mode: r.mode as Mode,
    sessionId: r.sessionId,
    createdAt: r.createdAt,
  }))
}

// Record one answered question. Returns any belt promotions this answer
// triggered for the tables involved (fuels the celebration animation).
export async function recordAttempt(input: {
  playerId: string
  sessionId: string
  mode: Mode
  a: number
  b: number
  correct: boolean
}): Promise<{ promotions: BeltPromotion[] }> {
  if (!input.playerId || !input.sessionId) return { promotions: [] }

  const before = await loadAttempts(input.playerId)
  const beforeTables = computeTableStats(before)

  await db.insert(attemptsTable).values({
    playerId: input.playerId,
    sessionId: input.sessionId,
    mode: input.mode,
    factorA: input.a,
    factorB: input.b,
    correct: input.correct,
  })

  const newAttempt: Attempt = {
    factorA: input.a,
    factorB: input.b,
    correct: input.correct,
    mode: input.mode,
    sessionId: input.sessionId,
    createdAt: new Date(),
  }
  const afterTables = computeTableStats([...before, newAttempt])

  const promotions: BeltPromotion[] = []
  const involved = input.a === input.b ? [input.a] : [input.a, input.b]
  for (const t of involved) {
    const b = beforeTables.get(t)
    const a = afterTables.get(t)
    if (b && a && beltIndex(a.belt) > beltIndex(b.belt)) {
      promotions.push({ table: t, belt: a.belt })
    }
  }
  return { promotions }
}

// Generate a batch of questions using the adaptive engine.
// On the first batch of a sitting, positions 1 and 3 are forced to the
// most-recently-completed session's trouble facts (the closed loop).
export async function getQuestions(
  playerId: string,
  count: number,
  isFirstBatch: boolean,
): Promise<Question[]> {
  const attempts = await loadAttempts(playerId)
  const stats = computeFactStats(attempts)

  let forced: TroubleFact[] = []
  if (isFirstBatch) {
    const summaries = allSessionSummaries(attempts)
    if (summaries.length > 0) forced = summaries[0].troubleFacts
  }

  const questions: Question[] = []
  const forcedPositions: Record<number, TroubleFact | undefined> = {
    0: forced[0],
    2: forced[1],
  }

  for (let i = 0; i < count; i++) {
    const forcedFact = isFirstBatch ? forcedPositions[i] : undefined
    if (forcedFact) {
      questions.push(makeQuestion(normalizeFact(forcedFact.a, forcedFact.b)))
    } else {
      questions.push(makeQuestion(pickWeightedFact(stats)))
    }
  }
  return questions
}

export interface BeltWallData {
  tables: TableStat[]
  needsPractice: TroubleFact[]
  sessions: SessionSummary[]
  nextSessionFacts: TroubleFact[]
}

// Everything the Belt Wall / recap screen needs, computed on read.
export async function getBeltWallData(playerId: string): Promise<BeltWallData> {
  const attempts = await loadAttempts(playerId)
  const tableStats = computeTableStats(attempts)
  const factStats = computeFactStats(attempts)

  const tables = Array.from(tableStats.values()).sort(
    (a, b) => a.table - b.table,
  )

  // Facts that currently need practice: unmastered with a wrong pattern.
  const needsPractice: TroubleFact[] = Array.from(factStats.values())
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
    .slice(0, 12)
    .map((s) => ({ a: s.a, b: s.b }))

  const sessions = allSessionSummaries(attempts)
  const nextSessionFacts = sessions.length > 0 ? sessions[0].troubleFacts : []

  return { tables, needsPractice, sessions, nextSessionFacts }
}

// Aggregated report for the parent-facing view.
export async function getParentReport(
  playerId: string,
): Promise<ParentReport> {
  const attempts = await loadAttempts(playerId)
  return parentReport(attempts)
}
