"use server"

import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { factStats, gameSessions } from "@/lib/db/schema"
import { and, eq, sql } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Unauthorized")
  return session.user.id
}

export type AnswerResult = {
  factor: number
  multiplier: number
  correct: boolean
  timeMs: number
}

// Save the results of a completed game round.
export async function saveRound(results: AnswerResult[]) {
  const userId = await getUserId()

  const correctAnswers = results.filter((r) => r.correct).length
  const questionsAnswered = results.length
  // 1 star per correct answer, bonus star for a perfect round.
  const starsEarned = correctAnswers + (correctAnswers === questionsAnswered && questionsAnswered > 0 ? 1 : 0)

  const today = new Date().toISOString().slice(0, 10)

  await db.insert(gameSessions).values({
    userId,
    playDate: today,
    starsEarned,
    questionsAnswered,
    correctAnswers,
  })

  // Upsert per-fact mastery stats.
  for (const r of results) {
    await db
      .insert(factStats)
      .values({
        userId,
        factor: r.factor,
        multiplier: r.multiplier,
        correct: r.correct ? 1 : 0,
        attempts: 1,
        bestTimeMs: r.correct ? r.timeMs : null,
      })
      .onConflictDoUpdate({
        target: [factStats.userId, factStats.factor, factStats.multiplier],
        set: {
          correct: sql`${factStats.correct} + ${r.correct ? 1 : 0}`,
          attempts: sql`${factStats.attempts} + 1`,
          bestTimeMs: r.correct
            ? sql`LEAST(COALESCE(${factStats.bestTimeMs}, 2147483647), ${r.timeMs})`
            : factStats.bestTimeMs,
          updatedAt: new Date(),
        },
      })
  }

  revalidatePath("/")
  return { starsEarned, correctAnswers, questionsAnswered }
}

export type ProgressSummary = {
  totalStars: number
  streak: number
  playedToday: boolean
  tableMastery: { factor: number; correct: number; attempts: number; mastered: boolean }[]
}

export async function getProgress(): Promise<ProgressSummary> {
  const userId = await getUserId()

  const sessions = await db
    .select({
      playDate: gameSessions.playDate,
      starsEarned: gameSessions.starsEarned,
    })
    .from(gameSessions)
    .where(eq(gameSessions.userId, userId))

  const totalStars = sessions.reduce((sum, s) => sum + s.starsEarned, 0)

  // Compute streak from distinct play dates.
  const days = new Set(sessions.map((s) => s.playDate))
  const todayStr = new Date().toISOString().slice(0, 10)
  const playedToday = days.has(todayStr)

  let streak = 0
  const cursor = new Date()
  // If not played today, start counting from yesterday so an active streak isn't broken mid-day.
  if (!playedToday) cursor.setDate(cursor.getDate() - 1)
  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }

  const stats = await db
    .select({
      factor: factStats.factor,
      correct: factStats.correct,
      attempts: factStats.attempts,
    })
    .from(factStats)
    .where(eq(factStats.userId, userId))

  const byFactor = new Map<number, { correct: number; attempts: number }>()
  for (let f = 1; f <= 12; f++) byFactor.set(f, { correct: 0, attempts: 0 })
  for (const s of stats) {
    const entry = byFactor.get(s.factor)
    if (entry) {
      entry.correct += s.correct
      entry.attempts += s.attempts
    }
  }

  const tableMastery = Array.from(byFactor.entries()).map(([factor, v]) => {
    const accuracy = v.attempts > 0 ? v.correct / v.attempts : 0
    // "Mastered" = decent sample size with high accuracy.
    const mastered = v.attempts >= 12 && accuracy >= 0.9
    return { factor, correct: v.correct, attempts: v.attempts, mastered }
  })

  return { totalStars, streak, playedToday, tableMastery }
}

// Per-fact accuracy so the game can prioritize weaker facts.
export async function getWeakFacts() {
  const userId = await getUserId()
  const stats = await db
    .select()
    .from(factStats)
    .where(eq(factStats.userId, userId))
  return stats.map((s) => ({
    factor: s.factor,
    multiplier: s.multiplier,
    accuracy: s.attempts > 0 ? s.correct / s.attempts : 0,
    attempts: s.attempts,
  }))
}
