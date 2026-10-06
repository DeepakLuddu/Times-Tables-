"use server"

import { db } from "@/lib/db"
import {
  attempts as attemptsTable,
  parentSettings as parentSettingsTable,
  practiceTime as practiceTimeTable,
  withdrawals as withdrawalsTable,
} from "@/lib/db/schema"
import type { Attempt } from "@/lib/engine"
import {
  type PiggyBankSummary,
  type WithdrawalEntry,
  computePiggyBank,
  weekStartOf,
} from "@/lib/piggybank"
import { and, eq, sql } from "drizzle-orm"
import { createHash, randomBytes } from "node:crypto"

// A single small helper duplicated here (rather than imported from dojo.ts)
// to keep the two action modules independent — both just read the same
// attempts table.
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
    mode: r.mode as Attempt["mode"],
    sessionId: r.sessionId,
    createdAt: r.createdAt,
  }))
}

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

// Full Piggy Bank summary for the game screen.
export async function getPiggyBankState(
  playerId: string,
): Promise<PiggyBankSummary> {
  const [attempts, withdrawals] = await Promise.all([
    loadAttempts(playerId),
    loadWithdrawals(playerId),
  ])
  return computePiggyBank(attempts, withdrawals)
}

// ---- Active practice time ----
// A max delta per call guards against a single inflated report (e.g. from
// devtools) — the client is expected to flush small amounts every few
// seconds while genuinely active (see the tracker in game-board.tsx).
const MAX_DELTA_SECONDS = 20

export async function addPracticeTime(
  playerId: string,
  dateKey: string,
  deltaSeconds: number,
): Promise<{ activeSeconds: number }> {
  if (!playerId || !dateKey) return { activeSeconds: 0 }
  const clamped = Math.max(
    0,
    Math.min(Math.round(deltaSeconds), MAX_DELTA_SECONDS),
  )
  if (clamped > 0) {
    await db
      .insert(practiceTimeTable)
      .values({ playerId, date: dateKey, activeSeconds: clamped })
      .onConflictDoUpdate({
        target: [practiceTimeTable.playerId, practiceTimeTable.date],
        set: {
          activeSeconds: sql`${practiceTimeTable.activeSeconds} + ${clamped}`,
          updatedAt: new Date(),
        },
      })
  }
  const row = await db
    .select()
    .from(practiceTimeTable)
    .where(
      and(
        eq(practiceTimeTable.playerId, playerId),
        eq(practiceTimeTable.date, dateKey),
      ),
    )
    .limit(1)
  return { activeSeconds: row[0]?.activeSeconds ?? 0 }
}

export async function getPracticeTimeToday(
  playerId: string,
  dateKey: string,
): Promise<number> {
  if (!playerId || !dateKey) return 0
  const row = await db
    .select()
    .from(practiceTimeTable)
    .where(
      and(
        eq(practiceTimeTable.playerId, playerId),
        eq(practiceTimeTable.date, dateKey),
      ),
    )
    .limit(1)
  return row[0]?.activeSeconds ?? 0
}

// ---- Parent PIN ----
// A lightweight UX gate, not a security boundary — no real money moves
// through the app, so this only needs to keep a curious kid out of the
// withdraw button, not resist a determined attacker.
function hashPin(pin: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${pin}`).digest("hex")
}

async function getPinRow(playerId: string) {
  const rows = await db
    .select()
    .from(parentSettingsTable)
    .where(eq(parentSettingsTable.playerId, playerId))
    .limit(1)
  return rows[0] ?? null
}

export async function hasParentPin(playerId: string): Promise<boolean> {
  if (!playerId) return false
  return (await getPinRow(playerId)) !== null
}

export async function setParentPin(
  playerId: string,
  pin: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!playerId) return { ok: false, error: "Missing player." }
  if (!/^\d{4,6}$/.test(pin)) {
    return { ok: false, error: "PIN must be 4 to 6 digits." }
  }
  const existing = await getPinRow(playerId)
  if (existing) return { ok: false, error: "A PIN is already set." }
  const salt = randomBytes(8).toString("hex")
  await db.insert(parentSettingsTable).values({
    playerId,
    pinHash: `${salt}:${hashPin(pin, salt)}`,
  })
  return { ok: true }
}

export async function checkParentPin(
  playerId: string,
  pin: string,
): Promise<boolean> {
  if (!playerId || !pin) return false
  const row = await getPinRow(playerId)
  if (!row) return false
  const [salt, hash] = row.pinHash.split(":")
  if (!salt || !hash) return false
  return hashPin(pin, salt) === hash
}

// ---- Parent-facing data + withdraw action ----

export interface ParentPiggyBankData {
  summary: PiggyBankSummary
  practiceSecondsThisWeek: number
}

async function practiceSecondsThisWeek(playerId: string): Promise<number> {
  const rows = await db
    .select()
    .from(practiceTimeTable)
    .where(eq(practiceTimeTable.playerId, playerId))
  const monday = weekStartOf(new Date()).toISOString().slice(0, 10)
  return rows
    .filter((r) => r.date >= monday)
    .reduce((s, r) => s + r.activeSeconds, 0)
}

export async function getParentPiggyBankData(
  playerId: string,
  pin: string,
): Promise<{ ok: boolean; error?: string; data?: ParentPiggyBankData }> {
  const valid = await checkParentPin(playerId, pin)
  if (!valid) return { ok: false, error: "Incorrect PIN." }

  const [attempts, withdrawals, seconds] = await Promise.all([
    loadAttempts(playerId),
    loadWithdrawals(playerId),
    practiceSecondsThisWeek(playerId),
  ])
  const summary = computePiggyBank(attempts, withdrawals)
  return { ok: true, data: { summary, practiceSecondsThisWeek: seconds } }
}

export async function withdrawFromPiggyBank(input: {
  playerId: string
  pin: string
  amountCents: number
}): Promise<{ ok: boolean; error?: string; summary?: PiggyBankSummary }> {
  const { playerId, pin, amountCents } = input
  if (!playerId) return { ok: false, error: "Missing player." }
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return { ok: false, error: "Enter a valid amount." }
  }
  const valid = await checkParentPin(playerId, pin)
  if (!valid) return { ok: false, error: "Incorrect PIN." }

  const [attempts, withdrawalsBefore] = await Promise.all([
    loadAttempts(playerId),
    loadWithdrawals(playerId),
  ])
  const before = computePiggyBank(attempts, withdrawalsBefore)
  // Guardrail: never let a withdrawal push the balance below zero.
  if (amountCents > before.balanceCents) {
    return { ok: false, error: "That's more than the current balance." }
  }

  const balanceAfterCents = before.balanceCents - amountCents
  await db.insert(withdrawalsTable).values({
    playerId,
    amountCents,
    balanceBeforeCents: before.balanceCents,
    balanceAfterCents,
  })

  const withdrawalsAfter = await loadWithdrawals(playerId)
  const summary = computePiggyBank(attempts, withdrawalsAfter)
  return { ok: true, summary }
}
