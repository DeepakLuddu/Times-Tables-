"use server"

import { db } from "@/lib/db"
import {
  attempts as attemptsTable,
  beltAwards as beltAwardsTable,
  withdrawals as withdrawalsTable,
} from "@/lib/db/schema"
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
import { type TableMastery, computeTableMastery } from "@/lib/mastery"
import {
  type PersonalBestDelta,
  computePersonalBests,
  detectNewPersonalBest,
} from "@/lib/personal-bests"
import {
  type PiggyBankSummary,
  type WithdrawalEntry,
  computePiggyBank,
  crossedMultiple,
} from "@/lib/piggybank"
import { eq } from "drizzle-orm"

async function loadWithdrawals(playerId: string): Promise<WithdrawalEntry[]> {
  if (!playerId) return []
  const rows = await db
    .select()
    .from(withdrawalsTable)
    .where(eq(withdrawalsTable.playerId, playerId))
  return rows.map((r) => ({
    id: r.id,
    amountCents: r.amountCents,
    balanceBeforeCents: r.balanceBeforeCents,
    balanceAfterCents: r.balanceAfterCents,
    createdAt: r.createdAt,
  }))
}

// What the correct-answer celebration needs to animate the coin flying
// into the piggy bank and to decide which milestone banner (if any) fires.
export interface PiggyBankDelta {
  earnedCents: number // 0 or 1 — 0 means this week's cap was already reached
  summary: PiggyBankSummary // authoritative state after this answer
  crossedDime: boolean // lifetime balance just crossed a $0.10 multiple
  crossedDollar: boolean // lifetime balance just crossed a $1.00 multiple
  reachedWeeklyCap: boolean // this answer is what hit the $5/week cap
}

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
    answerMs: r.answerMs ?? undefined,
  }))
}

// Which tables this player has already formally earned a belt for —
// permanent once granted, regardless of later performance.
async function loadBeltAwards(playerId: string): Promise<Map<number, Date>> {
  if (!playerId) return new Map()
  const rows = await db
    .select()
    .from(beltAwardsTable)
    .where(eq(beltAwardsTable.playerId, playerId))
  return new Map(rows.map((r) => [r.tableNumber, r.awardedAt]))
}

// Record one answered question. Returns any belt promotions this answer
// triggered for the tables involved, plus the Piggy Bank delta — both fuel
// the correct-answer celebration animation.
export async function recordAttempt(input: {
  playerId: string
  sessionId: string
  mode: Mode
  a: number
  b: number
  correct: boolean
  answerMs: number
}): Promise<{
  promotions: BeltPromotion[]
  piggyBank: PiggyBankDelta | null
  personalBest: PersonalBestDelta | null
}> {
  if (!input.playerId || !input.sessionId)
    return { promotions: [], piggyBank: null, personalBest: null }

  const [before, withdrawals, awards] = await Promise.all([
    loadAttempts(input.playerId),
    loadWithdrawals(input.playerId),
    loadBeltAwards(input.playerId),
  ])
  const beforePiggy = computePiggyBank(before, withdrawals)

  await db.insert(attemptsTable).values({
    playerId: input.playerId,
    sessionId: input.sessionId,
    mode: input.mode,
    factorA: input.a,
    factorB: input.b,
    correct: input.correct,
    answerMs: Number.isFinite(input.answerMs)
      ? Math.max(0, Math.round(input.answerMs))
      : null,
  })

  const newAttempt: Attempt = {
    factorA: input.a,
    factorB: input.b,
    correct: input.correct,
    mode: input.mode,
    sessionId: input.sessionId,
    createdAt: new Date(),
    answerMs: Number.isFinite(input.answerMs) ? input.answerMs : undefined,
  }
  const after = [...before, newAttempt]
  const afterPiggy = computePiggyBank(after, withdrawals)

  const piggyBank: PiggyBankDelta = {
    earnedCents: afterPiggy.balanceCents - beforePiggy.balanceCents,
    summary: afterPiggy,
    crossedDime: crossedMultiple(
      beforePiggy.balanceCents,
      afterPiggy.balanceCents,
      10,
    ),
    crossedDollar: crossedMultiple(
      beforePiggy.balanceCents,
      afterPiggy.balanceCents,
      100,
    ),
    reachedWeeklyCap:
      beforePiggy.earnedThisWeekCents < beforePiggy.weeklyCapCents &&
      afterPiggy.earnedThisWeekCents >= afterPiggy.weeklyCapCents,
  }

  // Belt tier now comes entirely from the mastery formula (lib/mastery.ts),
  // not raw accuracy. A table's belt is earned exactly once — the instant
  // every requirement is met, we mint the award right here so it's
  // permanent from this same answer onward.
  const promotions: BeltPromotion[] = []
  const involved = input.a === input.b ? [input.a] : [input.a, input.b]
  const newlyAwarded: number[] = []
  for (const t of involved) {
    const beforeMastery = computeTableMastery(t, before, awards.get(t) ?? null)
    let afterAwardedAt = awards.get(t) ?? null
    let afterMastery = computeTableMastery(t, after, afterAwardedAt)
    // percent === 99 means every requirement just became complete but the
    // belt hasn't been formally awarded yet — award it now.
    if (!afterAwardedAt && afterMastery.percent === 99) {
      afterAwardedAt = new Date()
      newlyAwarded.push(t)
      afterMastery = computeTableMastery(t, after, afterAwardedAt)
    }
    if (beltIndex(afterMastery.belt) > beltIndex(beforeMastery.belt)) {
      promotions.push({ table: t, belt: afterMastery.belt })
    }
  }

  if (newlyAwarded.length > 0) {
    await db
      .insert(beltAwardsTable)
      .values(
        newlyAwarded.map((t) => ({
          playerId: input.playerId,
          tableNumber: t,
        })),
      )
      .onConflictDoNothing()
  }

  // Personal Bests — a separate, independent record-chasing system (see
  // lib/personal-bests.ts). Detecting the delta here, the same way as the
  // Piggy Bank, is what drives the "NEW PERSONAL BEST!" celebration.
  const personalBest = detectNewPersonalBest(
    computePersonalBests(before),
    computePersonalBests(after),
  )

  return { promotions, piggyBank, personalBest }
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
  mastery: TableMastery[]
  needsPractice: TroubleFact[]
  sessions: SessionSummary[]
  nextSessionFacts: TroubleFact[]
}

// Everything the Belt Wall / recap screen needs, computed on read.
export async function getBeltWallData(playerId: string): Promise<BeltWallData> {
  const [attempts, awards] = await Promise.all([
    loadAttempts(playerId),
    loadBeltAwards(playerId),
  ])
  const tableStats = computeTableStats(attempts)
  const factStats = computeFactStats(attempts)

  const tables = Array.from(tableStats.values()).sort(
    (a, b) => a.table - b.table,
  )

  const mastery: TableMastery[] = Array.from({ length: 12 }, (_, i) => i + 1).map(
    (t) => computeTableMastery(t, attempts, awards.get(t) ?? null),
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

  return { tables, mastery, needsPractice, sessions, nextSessionFacts }
}

// Aggregated report for the parent-facing view.
export async function getParentReport(
  playerId: string,
): Promise<ParentReport> {
  const attempts = await loadAttempts(playerId)
  return parentReport(attempts)
}
