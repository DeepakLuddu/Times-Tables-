// One-time setup for the multi-subject maths system (Multiplication +
// Division + Addition + Subtraction sharing one Piggy Bank / Belt Wall /
// Recent Wins / Personal Bests):
//   - adds subject-tagging columns to "attempts"
//   - adds a "subject" column to "beltAwards" and widens its primary key
//     to (playerId, subject, tableNumber) so the same skill index (1-12)
//     can be independently awarded per subject
//   - adds a "subject" column to "practiceTime" and widens its primary key
//     to (playerId, date, subject)
// Every new column defaults to 'multiplication' (or 'solve' for
// questionKind), so existing rows keep their exact original meaning.
// Safe to run more than once (IF NOT EXISTS / guarded constraint swaps).
//
// Usage (from the repo root, with DATABASE_URL available):
//   node --env-file=.env.local scripts/setup-multi-subject-db.mjs

import pg from "pg"

const { Pool } = pg

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error(
    "DATABASE_URL is not set. Run this with --env-file=.env.local, e.g.\n" +
      "  node --env-file=.env.local scripts/setup-multi-subject-db.mjs",
  )
  process.exit(1)
}

const pool = new Pool({ connectionString: DATABASE_URL })

const statements = [
  `ALTER TABLE "attempts" ADD COLUMN IF NOT EXISTS "subject" TEXT NOT NULL DEFAULT 'multiplication'`,
  `ALTER TABLE "attempts" ADD COLUMN IF NOT EXISTS "practiceSubject" TEXT NOT NULL DEFAULT 'multiplication'`,
  `ALTER TABLE "attempts" ADD COLUMN IF NOT EXISTS "bandIndex" INTEGER`,
  `ALTER TABLE "attempts" ADD COLUMN IF NOT EXISTS "questionKind" TEXT NOT NULL DEFAULT 'solve'`,
  `ALTER TABLE "attempts" ADD COLUMN IF NOT EXISTS "blankSlot" TEXT`,

  `ALTER TABLE "beltAwards" ADD COLUMN IF NOT EXISTS "subject" TEXT NOT NULL DEFAULT 'multiplication'`,
  `ALTER TABLE "practiceTime" ADD COLUMN IF NOT EXISTS "subject" TEXT NOT NULL DEFAULT 'multiplication'`,
]

// Postgres has no "ADD CONSTRAINT IF NOT EXISTS", so PK swaps are guarded
// by checking pg_constraint directly. Both tables' original PK columns
// (playerId, tableNumber) / (playerId, date) stay unique once combined with
// the new subject column defaulting existing rows to 'multiplication', so
// this is a pure widening — no data conflict is possible.
const pkSwaps = [
  {
    table: "beltAwards",
    oldConstraint: "beltAwards_pkey",
    newColumns: `"playerId", "subject", "tableNumber"`,
  },
  {
    table: "practiceTime",
    oldConstraint: "practiceTime_pkey",
    newColumns: `"playerId", "date", "subject"`,
  },
]

try {
  for (const sql of statements) {
    await pool.query(sql)
  }

  for (const { table, oldConstraint, newColumns } of pkSwaps) {
    const { rows } = await pool.query(
      `SELECT 1 FROM pg_constraint WHERE conname = $1`,
      [oldConstraint],
    )
    if (rows.length > 0) {
      await pool.query(`ALTER TABLE "${table}" DROP CONSTRAINT "${oldConstraint}"`)
    }
    const { rows: after } = await pool.query(
      `SELECT 1 FROM pg_constraint WHERE conname = $1`,
      [oldConstraint],
    )
    if (after.length === 0) {
      await pool.query(
        `ALTER TABLE "${table}" ADD CONSTRAINT "${oldConstraint}" PRIMARY KEY (${newColumns})`,
      )
    }
  }

  console.log(
    "Multi-subject schema is ready: attempts.subject/practiceSubject/bandIndex/questionKind/blankSlot, " +
      "beltAwards.subject (+ widened PK), practiceTime.subject (+ widened PK).",
  )
} catch (err) {
  console.error("Failed to set up multi-subject schema:", err)
  process.exit(1)
} finally {
  await pool.end()
}
