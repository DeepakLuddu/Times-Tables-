"use server"

import { db } from "@/lib/db"
import {
  attempts as attemptsTable,
  beltAwards as beltAwardsTable,
  practiceTime as practiceTimeTable,
} from "@/lib/db/schema"
import type { Attempt, Mode } from "@/lib/engine"
import { computePersonalBests } from "@/lib/personal-bests"
import { type RecentWinsData, computeRecentWins } from "@/lib/recent-wins"
import { desc, eq } from "drizzle-orm"

// Small helpers duplicated here rather than imported from dojo.ts, same
// pattern as app/actions/piggybank.ts and app/actions/personalbests.ts.
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

async function loadBeltAwards(playerId: string): Promise<Map<number, Date>> {
  if (!playerId) return new Map()
  const rows = await db
    .select()
    .from(beltAwardsTable)
    .where(eq(beltAwardsTable.playerId, playerId))
  return new Map(rows.map((r) => [r.tableNumber, r.awardedAt]))
}

// Recent Wins only needs recent daily-goal completions, not a lifetime
// archive — the most recent 14 days is plenty.
async function loadRecentPracticeDays(
  playerId: string,
): Promise<{ date: string; seconds: number }[]> {
  if (!playerId) return []
  const rows = await db
    .select()
    .from(practiceTimeTable)
    .where(eq(practiceTimeTable.playerId, playerId))
    .orderBy(desc(practiceTimeTable.date))
    .limit(14)
  return rows.map((r) => ({ date: r.date, seconds: r.activeSeconds }))
}

// Everything the "Recent Wins" child-facing section needs, computed on
// read: the short achievement list, "best thing you did today", and the
// data-driven "next challenge" suggestion.
export async function getRecentWins(playerId: string): Promise<RecentWinsData> {
  const [attempts, awards, practiceDays] = await Promise.all([
    loadAttempts(playerId),
    loadBeltAwards(playerId),
    loadRecentPracticeDays(playerId),
  ])
  const personalBests = computePersonalBests(attempts)
  return computeRecentWins(attempts, practiceDays, awards, personalBests)
}
