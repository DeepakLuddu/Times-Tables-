import {
  pgTable,
  text,
  timestamp,
  boolean,
  serial,
  integer,
  primaryKey,
} from "drizzle-orm/pg-core"

// Maths Dojo stores exactly one thing: a log of every answered question.
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
  // Milliseconds from question shown to answer submitted. Nullable because
  // rows recorded before this column existed won't have it.
  answerMs: integer("answerMs"),
  // The real skill domain this question belongs to — drives mastery scoping
  // and Piggy Bank reward-bucket allocation. Never 'mixed'. Defaults to
  // 'multiplication' so every historical row keeps its original meaning.
  subject: text("subject").notNull().default("multiplication"),
  // What the child selected for this sitting — the 4 subjects or 'mixed'.
  // Used only for session/streak/run labelling (e.g. Personal Bests showing
  // "Mixed Maths"), never for mastery — see lib/subjects.
  practiceSubject: text("practiceSubject").notNull().default("multiplication"),
  // Which of a subject's 12 skill bands this fact was generated for. Only
  // set for addition/subtraction, where band membership isn't reliably
  // derivable from factorA/factorB after the fact (unlike multiplication's
  // dual-table membership or division's single-divisor membership).
  bandIndex: integer("bandIndex"),
  // 'solve' (normal "a OP b = ?") or 'missingOperand' ("a + ? = c") — only
  // the addition/subtraction "missing-number" bands use the latter.
  questionKind: text("questionKind").notNull().default("solve"),
  // Which slot was blanked for a 'missingOperand' question: 'a' | 'b' | 'result'.
  blankSlot: text("blankSlot"),
  // Which wrong-answer help method ('see' | 'move' | 'think') this attempt
  // followed, set only on the retry attempt after a help interaction — null
  // on the original wrong attempt and every other normal attempt. A soft
  // signal for future recommendations, not a fixed "learning style" label.
  helpMethod: text("helpMethod"),
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
    // The practiceSubject bucket this time was logged under (the 4 subjects
    // or 'mixed'). The 15-minute daily goal sums across every bucket for a
    // date, so this splits the existing single-row-per-day total without
    // changing that goal's meaning.
    subject: text("subject").notNull().default("multiplication"),
  },
  (table) => [
    primaryKey({ columns: [table.playerId, table.date, table.subject] }),
  ],
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

// ---- Belt Wall mastery ----
// A table's belt is earned exactly once, the moment its 8-part mastery
// formula (lib/mastery.ts) first hits 100%. From then on the Belt Wall
// pins that table's card at 100% / MASTERED permanently, regardless of
// later performance — this row is what "permanently" means.
export const beltAwards = pgTable(
  "beltAwards",
  {
    playerId: text("playerId").notNull(),
    // Generic "skill index 1-12 within subject" — times-table N, divide-by
    // N, or addition/subtraction band N, depending on `subject`.
    tableNumber: integer("tableNumber").notNull(),
    awardedAt: timestamp("awardedAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
    subject: text("subject").notNull().default("multiplication"),
  },
  (table) => [
    primaryKey({ columns: [table.playerId, table.subject, table.tableNumber] }),
  ],
)

export type BeltAwardRow = typeof beltAwards.$inferSelect
