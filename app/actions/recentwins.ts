"use server"

import { db } from "@/lib/db"
import {
  attempts as attemptsTable,
  beltAwards as beltAwardsTable,
  practiceTime as practiceTimeTable,
} from "@/lib/db/schema"
import type { Attempt, Mode } from "@/lib/engine"
import type { EarningAttempt } from "@/lib/piggybank"
import { computePersonalBests } from "@/lib/personal-bests"
import { type RecentWinsData, computeRecentWins } from "@/lib/recent-wins"
import { SUBJECT_ENGINES } from "@/lib/subjects"
import type { Subject } from "@/lib/subjects/types"
import { and, desc, eq } from "drizzle-orm"

const AVAILABLE_SUBJECTS = Object.keys(SUBJECT_ENGINES) as Subject[]

async function loadAttemptsFor(playerId: string, subject: Subject): Promise<Attempt[]> {
  if (!playerId) return []
  const rows = await db
    .select()
    .from(attemptsTable)
    .where(
      and(eq(attemptsTable.playerId, playerId), eq(attemptsTable.subject, subject)),
    )
  return rows.map((r) => ({
    factorA: r.factorA,
    factorB: r.factorB,
    correct: r.correct,
    mode: r.mode as Mode,
    sessionId: r.sessionId,
    createdAt: r.createdAt,
    answerMs: r.answerMs ?? undefined,
    bandIndex: r.bandIndex,
  }))
}

// Personal Bests / Piggy Bank milestones are unified across every subject
// (one global board, not four), so — unlike loadAttemptsFor above — this
// is intentionally unfiltered.
async function loadAllAttempts(playerId: string): Promise<Attempt[]> {
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
    subject: r.subject,
  }))
}

async function loadBeltAwardsFor(
  playerId: string,
  subject: Subject,
): Promise<Map<number, Date>> {
  if (!playerId) return new Map()
  const rows = await db
    .select()
    .from(beltAwardsTable)
    .where(
      and(eq(beltAwardsTable.playerId, playerId), eq(beltAwardsTable.subject, subject)),
    )
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
  // practiceTime is now bucketed by subject (see lib/db/schema.ts) — the
  // 15-minute daily goal is global, so sum every bucket sharing a date.
  const byDate = new Map<string, number>()
  for (const r of rows) {
    byDate.set(r.date, (byDate.get(r.date) ?? 0) + r.activeSeconds)
  }
  return Array.from(byDate.entries())
    .map(([date, seconds]) => ({ date, seconds }))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 14)
}

// Everything the "Recent Wins" child-facing section needs, computed on
// read: the short achievement list, "best thing you did today", and the
// data-driven "next challenge" suggestion — spanning every subject.
export async function getRecentWins(playerId: string): Promise<RecentWinsData> {
  const [subjectResults, allAttempts, practiceDays] = await Promise.all([
    Promise.all(
      AVAILABLE_SUBJECTS.map(async (subject) => ({
        subject,
        attempts: await loadAttemptsFor(playerId, subject),
        awards: await loadBeltAwardsFor(playerId, subject),
      })),
    ),
    loadAllAttempts(playerId),
    loadRecentPracticeDays(playerId),
  ])

  const subjectAttempts: Partial<Record<Subject, Attempt[]>> = {}
  const subjectAwards: Partial<Record<Subject, Map<number, Date>>> = {}
  for (const r of subjectResults) {
    subjectAttempts[r.subject] = r.attempts
    subjectAwards[r.subject] = r.awards
  }

  const personalBests = computePersonalBests(allAttempts)
  const earningAttempts: EarningAttempt[] = allAttempts.map((a) => ({
    subject: (a.subject as Subject) ?? "multiplication",
    correct: a.correct,
    createdAt: a.createdAt,
  }))

  return computeRecentWins(
    subjectAttempts,
    subjectAwards,
    practiceDays,
    personalBests,
    earningAttempts,
  )
}
