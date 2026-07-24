"use server"

import { db } from "@/lib/db"
import { attempts as attemptsTable } from "@/lib/db/schema"
import {
  type Attempt,
  type Mode,
  type Question,
  type TableStat,
  computeFactStats,
  computeTableStats,
  makeQuestion,
  normalizeFact,
  pickWeightedFact,
} from "@/lib/engine"
import {
  type SessionSummary,
  type TroubleFact,
  allSessionSummaries,
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

// Record one answered question.
export async function recordAttempt(input: {
  playerId: string
  sessionId: string
  mode: Mode
  a: number
  b: number
  correct: boolean
}): Promise<void> {
  if (!input.playerId || !input.sessionId) return
  await db.insert(attemptsTable).values({
    playerId: input.playerId,
    sessionId: input.sessionId,
    mode: input.mode,
    factorA: input.a,
    factorB: input.b,
    correct: input.correct,
  })
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
