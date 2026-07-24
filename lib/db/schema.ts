import { pgTable, text, timestamp, boolean, serial, integer, date } from "drizzle-orm/pg-core"

// ---- Better Auth tables (do not rename columns) ----

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expiresAt").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
})

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

// ---- App tables (scoped per user via userId, no FK by default) ----

// One row per multiplication fact (factor x multiplier) the child has practiced.
export const factStats = pgTable("fact_stats", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull(),
  factor: integer("factor").notNull(),
  multiplier: integer("multiplier").notNull(),
  correct: integer("correct").notNull().default(0),
  attempts: integer("attempts").notNull().default(0),
  bestTimeMs: integer("bestTimeMs"),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

// One row per completed game round, used for stars and daily streaks.
export const gameSessions = pgTable("game_sessions", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull(),
  playDate: date("playDate").notNull(),
  starsEarned: integer("starsEarned").notNull().default(0),
  questionsAnswered: integer("questionsAnswered").notNull().default(0),
  correctAnswers: integer("correctAnswers").notNull().default(0),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})
