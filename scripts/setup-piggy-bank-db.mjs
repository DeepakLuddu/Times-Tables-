// One-time setup: creates the three tables the Piggy Bank feature needs.
// Safe to run more than once (IF NOT EXISTS everywhere).
//
// Usage (from the repo root, with DATABASE_URL available):
//   node --env-file=.env.local scripts/setup-piggy-bank-db.mjs

import pg from "pg"

const { Pool } = pg

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error(
    "DATABASE_URL is not set. Run this with --env-file=.env.local, e.g.\n" +
      "  node --env-file=.env.local scripts/setup-piggy-bank-db.mjs",
  )
  process.exit(1)
}

const pool = new Pool({ connectionString: DATABASE_URL })

const statements = [
  `CREATE TABLE IF NOT EXISTS "withdrawals" (
    "id" SERIAL PRIMARY KEY,
    "playerId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "balanceBeforeCents" INTEGER NOT NULL,
    "balanceAfterCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS "withdrawals_playerId_idx" ON "withdrawals" ("playerId")`,

  `CREATE TABLE IF NOT EXISTS "practiceTime" (
    "playerId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "activeSeconds" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY ("playerId", "date")
  )`,

  `CREATE TABLE IF NOT EXISTS "parentSettings" (
    "playerId" TEXT PRIMARY KEY,
    "pinHash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
]

try {
  for (const sql of statements) {
    await pool.query(sql)
  }
  console.log("Piggy Bank tables are ready: withdrawals, practiceTime, parentSettings.")
} catch (err) {
  console.error("Failed to set up Piggy Bank tables:", err)
  process.exit(1)
} finally {
  await pool.end()
}
