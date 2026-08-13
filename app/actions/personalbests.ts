"use server"

import { db } from "@/lib/db"
import { attempts as attemptsTable } from "@/lib/db/schema"
import type { Attempt, Mode } from "@/lib/engine"
import { type PersonalBests, computePersonalBests } from "@/lib/personal-bests"
import { eq } from "drizzle-orm"

// A small helper duplicated here (rather than imported from dojo.ts), same
// pattern as app/actions/piggybank.ts — keeps each action module
// independent; both just read the same attempts table.
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

// Everything the Personal Bests page needs, computed on read.
export async function getPersonalBests(playerId: string): Promise<PersonalBests> {
  const attempts = await loadAttempts(playerId)
  return computePersonalBests(attempts)
}
