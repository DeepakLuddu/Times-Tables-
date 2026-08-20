// One-time setup for the wrong-answer teaching flow (Addition/Subtraction/
// Division "See it / Move it / Think it"): adds a nullable column tracking
// which help method a retry attempt followed, as a soft signal for future
// recommendations. Null on every attempt that isn't a post-help retry.
// Safe to run more than once (IF NOT EXISTS).
//
// Usage (from the repo root, with DATABASE_URL available):
//   node --env-file=.env.local scripts/setup-help-method-db.mjs

import pg from "pg"

const { Pool } = pg

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error(
    "DATABASE_URL is not set. Run this with --env-file=.env.local, e.g.\n" +
      "  node --env-file=.env.local scripts/setup-help-method-db.mjs",
  )
  process.exit(1)
}

const pool = new Pool({ connectionString: DATABASE_URL })

const statements = [
  `ALTER TABLE "attempts" ADD COLUMN IF NOT EXISTS "helpMethod" TEXT`,
]

try {
  for (const sql of statements) {
    await pool.query(sql)
  }
  console.log("Help-method tracking is ready: attempts.helpMethod.")
} catch (err) {
  console.error("Failed to set up help-method schema:", err)
  process.exit(1)
} finally {
  await pool.end()
}
