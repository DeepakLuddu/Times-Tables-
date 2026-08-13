import {
  pgTable,
  text,
  timestamp,
  boolean,
  serial,
  integer,
  primaryKey,
} from "drizzle-orm/pg-core"

// Times Dojo stores exactly one thing: a log of every answered question.
// Everything else (fact stats, belts, insights) is computed on read.
export const attempts = pgTable("attempts", {
  id: serial("id").primaryKey(),
  // Anonymous, client-generated player identifier (stored in localStorage).
  playerId: text("playerId").notNull(),
  // Client-generated id, one per Practice or Sprint sitting.
  sessionId: text("sessionId").notNull(),
  // 'practice' | 'sprint'
  mode: text("mode").notNull(),
  factorA: integer("factorA").notNull(),
  factorB: integer("factorB").notNull(),
  correct: boolean("correct").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
})

export type AttemptRow = typeof attempts.$inferSelect

// ---- Piggy Bank ----
// Balance itself is never stored directly — it's computed on read from the
// attempts log (1 cent per correct answer, capped at 500/week) minus the
// sum of withdrawals below. This table is the only mutation: a parent
// manually recording that they've paid the child outside the app.
export const withdrawals = pgTable("withdrawals", {
  id: serial("id").primaryKey(),
  playerId: text("playerId").notNull(),
  amountCents: integer("amountCents").notNull(),
  balanceBeforeCents: integer("balanceBeforeCents").notNull(),
  balanceAfterCents: integer("balanceAfterCents").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
})

export type WithdrawalRow = typeof withdrawals.$inferSelect

// Active practice seconds, one row per player per local calendar day.
// Incremented in small clamped deltas by the client's active-time tracker
// (see hooks in game-board.tsx) so idle/backgrounded time never counts.
export const practiceTime = pgTable(
  "practiceTime",
  {
    playerId: text("playerId").notNull(),
    // yyyy-mm-dd, the child's local date (not UTC).
    date: text("date").notNull(),
    activeSeconds: integer("activeSeconds").notNull().default(0),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.playerId, table.date] })],
)

export type PracticeTimeRow = typeof practiceTime.$inferSelect

// One row per player, created the first time a parent sets up their PIN.
// This is a lightweight UX gate (no real money moves through the app), not
// a security boundary — pinHash is salt:sha256(salt:pin).
export const parentSettings = pgTable("parentSettings", {
  playerId: text("playerId").primaryKey(),
  pinHash: text("pinHash").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
})

export type ParentSettingsRow = typeof parentSettings.$inferSelect
