import { pgTable, text, timestamp, boolean, serial, integer } from "drizzle-orm/pg-core"

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
