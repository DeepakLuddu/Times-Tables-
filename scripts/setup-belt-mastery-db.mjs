// One-time setup for the Belt Wall mastery-percentage feature:
//   - adds the "answerMs" column to the existing attempts table (used for
//     the fluency component)
//   - creates the beltAwards table (permanently pins a table at 100% once
//     its 8-part mastery formula is first satisfied)
// Safe to run more than once (IF NOT EXISTS everywhere).
//
// Usage (from the repo root, with DATABASE_URL available):
//   node --env-file=.env.local scripts/setup-belt-mastery-db.mjs

import pg from "pg"

const { Pool } = pg

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error(
    "DATABASE_URL is not set. Run this with --env-file=.env.local, e.g.\n" +
      "  node --env-file=.env.local scripts/setup-belt-mastery-db.mjs",
  )
  process.exit(1)
}

const pool = new Pool({ connectionString: DATABASE_URL })

const statements = [
  `ALTER TABLE "attempts" ADD COLUMN IF NOT EXISTS "answerMs" INTEGER`,

  `CREATE TABLE IF NOT EXISTS "beltAwards" (
    "playerId" TEXT NOT NULL,
    "tableNumber" INTEGER NOT NULL,
    "awardedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY ("playerId", "tableNumber")
  )`,
]

try {
  for (const sql of statements) {
    await pool.query(sql)
  }
  console.log(
    "Belt Wall mastery tables/columns are ready: attempts.answerMs, beltAwards.",
  )
} catch (err) {
  console.error("Failed to set up Belt Wall mastery schema:", err)
  process.exit(1)
} finally {
  await pool.end()
}
