// Recent Wins — a short, child-facing list of meaningful achievement
// events, replacing the old raw "Past Sessions" transaction log. Same
// "compute on read" philosophy as the rest of the app: nothing is stored
// as a discrete "win" record. Instead, each win type is derived by
// replaying the attempts log (and the small amount of related state —
// Piggy Bank withdrawals, daily practice minutes, belt awards) looking
// for the moments something actually changed for the better.
//
// To keep this cheap, most replays only look back over the player's most
// recent LOOKBACK_SESSIONS sessions — Recent Wins only ever needs to
// answer "what happened lately," not reconstruct a lifetime archive.

import {
  BELT_LABEL,
  type Attempt,
  type Belt,
  beltIndex,
  computeFactStats,
  factKey,
  normalizeFact,
} from "./engine"
import { allSessionSummaries } from "./insights"
import { type TableMastery, computeTableMastery } from "./mastery"
import {
  type PersonalBests,
  formatShortDate as formatPersonalBestDate,
} from "./personal-bests"
import {
  WEEKLY_CAP_CENTS,
  crossedMultiple,
  formatCents,
  weekStartOf,
} from "./piggybank"

const LOOKBACK_SESSIONS = 20
const RECENT_WINS_LIMIT = 6
const HIGH_QUALITY_MIN_QUESTIONS = 10
const HIGH_QUALITY_MIN_ACCURACY = 90
const DAILY_GOAL_SECONDS = 15 * 60

export type WinType =
  | "blackBeltEarned"
  | "beltChallengeUnlocked"
  | "beltReached"
  | "factMastered"
  | "personalBest"
  | "piggyMilestone"
  | "dailyGoalCompleted"
  | "sessionHighlight"

export interface WinEvent {
  type: WinType
  date: string // ISO
  icon: string
  /** Short bullet text for the Recent Wins list, e.g. "8s reached Green Belt". */
  text: string
  /** Fuller sentence for "Best thing you did today", e.g. "Your 8 times table reached Green Belt today." */
  sentence: string
  /** Lower = more significant, used only to pick the single "best thing today". */
  priority: number
}

export interface RecentWinsData {
  wins: WinEvent[]
  bestToday: string | null
  nextChallenge: string
}

function weekKeyOf(d: Date): string {
  return weekStartOf(d).toISOString().slice(0, 10)
}

// Local calendar day, matching lib/piggybank.ts's localDateKey convention
// (the daily goal is about the child's "today", not a UTC day).
function localDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function isToday(iso: string, now: Date): boolean {
  return localDateKey(new Date(iso)) === localDateKey(now)
}

function sortedByTime(attempts: Attempt[]): Attempt[] {
  return [...attempts].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  )
}

// End time of each session (its last attempt), oldest first.
function sessionBoundaries(
  sorted: Attempt[],
): { sessionId: string; endTime: number }[] {
  const ends = new Map<string, number>()
  for (const a of sorted) {
    const t = a.createdAt.getTime()
    const prev = ends.get(a.sessionId)
    if (prev === undefined || t > prev) ends.set(a.sessionId, t)
  }
  return Array.from(ends.entries())
    .map(([sessionId, endTime]) => ({ sessionId, endTime }))
    .sort((a, b) => a.endTime - b.endTime)
}

// ---- Belt tier crossings: new belt reached, Belt Challenge unlocked (99%), Black Belt earned (100%) ----

function beltCrossingEvents(
  sorted: Attempt[],
  awards: Map<number, Date>,
): WinEvent[] {
  const boundaries = sessionBoundaries(sorted)
  if (boundaries.length === 0) return []
  const recent = boundaries.slice(-LOOKBACK_SESSIONS)
  const seedIdx = Math.max(0, boundaries.length - LOOKBACK_SESSIONS - 1)
  const seedBoundary = boundaries[seedIdx]
  const cumulativeAt = (endTime: number) =>
    sorted.filter((a) => a.createdAt.getTime() <= endTime)

  const lastBelt = new Map<number, Belt>()
  const lastAwarded = new Map<number, boolean>()
  const seedHasLookbackGap = boundaries.length > LOOKBACK_SESSIONS
  const seedAttempts = seedHasLookbackGap
    ? cumulativeAt(seedBoundary.endTime)
    : []
  for (let t = 1; t <= 12; t++) {
    if (seedHasLookbackGap) {
      const alreadyAwarded =
        awards.has(t) && awards.get(t)!.getTime() <= seedBoundary.endTime
      const m = computeTableMastery(
        t,
        seedAttempts,
        alreadyAwarded ? awards.get(t)! : null,
      )
      lastBelt.set(t, m.belt)
      lastAwarded.set(t, alreadyAwarded)
    } else {
      lastBelt.set(t, "white")
      lastAwarded.set(t, false)
    }
  }

  const events: WinEvent[] = []
  for (const b of recent) {
    const cumulative = cumulativeAt(b.endTime)
    for (let t = 1; t <= 12; t++) {
      const awardedNow =
        awards.has(t) && awards.get(t)!.getTime() <= b.endTime
      const m = computeTableMastery(
        t,
        cumulative,
        awardedNow ? awards.get(t)! : null,
      )
      const wasAwarded = lastAwarded.get(t)!
      if (awardedNow && !wasAwarded) {
        events.push({
          type: "blackBeltEarned",
          date: awards.get(t)!.toISOString(),
          icon: "🥋",
          text: `${t}s earned Black Belt!`,
          sentence: `You earned your Black Belt in the ${t} times table today.`,
          priority: 0,
        })
        lastAwarded.set(t, true)
        lastBelt.set(t, "black")
        continue
      }
      const prevBelt = lastBelt.get(t)!
      if (!awardedNow && m.state === "challengeReady" && prevBelt !== "black") {
        events.push({
          type: "beltChallengeUnlocked",
          date: new Date(b.endTime).toISOString(),
          icon: "🥋",
          text: `${t}s unlocked the Belt Challenge`,
          sentence: `Your ${t} times table is ready for its Belt Challenge.`,
          priority: 1,
        })
        lastBelt.set(t, "black")
        continue
      }
      if (
        m.state === "progress" &&
        beltIndex(m.belt) > beltIndex(prevBelt)
      ) {
        events.push({
          type: "beltReached",
          date: new Date(b.endTime).toISOString(),
          icon: "🥋",
          text: `${t}s reached ${BELT_LABEL[m.belt]} Belt`,
          sentence: `Your ${t} times table reached ${BELT_LABEL[m.belt]} Belt today.`,
          priority: 3,
        })
        lastBelt.set(t, m.belt)
      }
    }
  }
  return events
}

// ---- Facts newly mastered (single forward pass, O(n)) ----

function factMasteredEvents(
  sorted: Attempt[],
  recentSessionIds: Set<string>,
): WinEvent[] {
  const perFact = new Map<
    string,
    { correct: number; total: number; last3: boolean[]; mastered: boolean }
  >()
  const events: WinEvent[] = []
  for (const at of sorted) {
    const key = factKey(at.factorA, at.factorB)
    const rec = perFact.get(key) ?? {
      correct: 0,
      total: 0,
      last3: [],
      mastered: false,
    }
    rec.total++
    if (at.correct) rec.correct++
    rec.last3.push(at.correct)
    if (rec.last3.length > 3) rec.last3.shift()
    const accuracy = rec.correct / rec.total
    const nowMastered =
      rec.total >= 3 && rec.last3.every(Boolean) && accuracy >= 0.9
    if (nowMastered && !rec.mastered) {
      rec.mastered = true
      if (recentSessionIds.has(at.sessionId)) {
        const [x, y] = normalizeFact(at.factorA, at.factorB)
        events.push({
          type: "factMastered",
          date: at.createdAt.toISOString(),
          icon: "⭐",
          text: `Mastered ${x} × ${y}`,
          sentence: `You mastered ${x} × ${y} today.`,
          priority: 4,
        })
      }
    } else {
      rec.mastered = nowMastered
    }
    perFact.set(key, rec)
  }
  return events
}

// ---- Personal Bests (reuses the history already computed there) ----

function personalBestEvents(pb: PersonalBests): WinEvent[] {
  const events: WinEvent[] = []
  const fcr = pb.fastestCleanRun.history[0]
  if (fcr) {
    events.push({
      type: "personalBest",
      date: fcr.date,
      icon: "⚡",
      text: `New fastest clean run: ${fcr.label}`,
      sentence: `You set a new fastest clean run: ${fcr.label}.`,
      priority: 2,
    })
  }
  const ls = pb.longestStreak.history[0]
  if (ls) {
    events.push({
      type: "personalBest",
      date: ls.date,
      icon: "🔥",
      text: `New longest streak: ${ls.label}`,
      sentence: `You beat your longest streak — now ${ls.label} correct in a row!`,
      priority: 2,
    })
  }
  const ba = pb.bestAccuracy.history[0]
  if (ba) {
    events.push({
      type: "personalBest",
      date: ba.date,
      icon: "🎯",
      text: `New best accuracy: ${ba.label}`,
      sentence: `You set a new best accuracy: ${ba.label}.`,
      priority: 2,
    })
  }
  const mi = pb.mostImproved.history[0]
  if (mi) {
    events.push({
      type: "personalBest",
      date: mi.date,
      icon: "📈",
      text: `Most improved: ${mi.label}`,
      sentence: `Your ${mi.label.split(" +")[0]} is your most-improved table.`,
      priority: 2,
    })
  }
  return events
}

// ---- Piggy Bank milestones (single forward pass, mirroring computePiggyBank's weekly cap logic) ----

function piggyMilestoneEvents(
  sorted: Attempt[],
  recentSessionIds: Set<string>,
): WinEvent[] {
  const correctByWeek = new Map<string, number>()
  let lifetimeEarned = 0
  const weekCapAnnounced = new Set<string>()
  const events: WinEvent[] = []
  for (const at of sorted) {
    if (!at.correct) continue
    const wk = weekKeyOf(at.createdAt)
    const before = correctByWeek.get(wk) ?? 0
    const earnedBefore = Math.min(before, WEEKLY_CAP_CENTS)
    const earnedAfter = Math.min(before + 1, WEEKLY_CAP_CENTS)
    correctByWeek.set(wk, before + 1)
    if (earnedAfter <= earnedBefore) continue

    lifetimeEarned++
    const inWindow = recentSessionIds.has(at.sessionId)
    if (crossedMultiple(lifetimeEarned - 1, lifetimeEarned, 100) && inWindow) {
      events.push({
        type: "piggyMilestone",
        date: at.createdAt.toISOString(),
        icon: "🐷",
        text: `Earned ${formatCents(lifetimeEarned)} lifetime`,
        sentence: `Your Piggy Bank passed ${formatCents(lifetimeEarned)}!`,
        priority: 5,
      })
    } else if (
      crossedMultiple(lifetimeEarned - 1, lifetimeEarned, 10) &&
      inWindow
    ) {
      events.push({
        type: "piggyMilestone",
        date: at.createdAt.toISOString(),
        icon: "🐷",
        text: `Earned ${formatCents(lifetimeEarned)}`,
        sentence: `You earned ${formatCents(lifetimeEarned)} in your Piggy Bank today.`,
        priority: 6,
      })
    }
    if (
      earnedAfter >= WEEKLY_CAP_CENTS &&
      earnedBefore < WEEKLY_CAP_CENTS &&
      inWindow &&
      !weekCapAnnounced.has(wk)
    ) {
      weekCapAnnounced.add(wk)
      events.push({
        type: "piggyMilestone",
        date: at.createdAt.toISOString(),
        icon: "🐷",
        text: "Piggy Bank full this week!",
        sentence: `You hit your ${formatCents(WEEKLY_CAP_CENTS)} Piggy Bank cap for the week!`,
        priority: 5,
      })
    }
  }
  return events
}

// ---- Daily 15-minute practice goal completed ----

function dailyGoalEvents(
  practiceDays: { date: string; seconds: number }[],
): WinEvent[] {
  return practiceDays
    .filter((d) => d.seconds >= DAILY_GOAL_SECONDS)
    .map((d) => ({
      type: "dailyGoalCompleted" as const,
      // Day-level precision only — anchor mid-day so "is this today"
      // comparisons behave using the same local-day key either way.
      date: `${d.date}T12:00:00.000Z`,
      icon: "✓",
      text: "Completed 15-minute goal",
      sentence: "You completed your 15-minute practice goal today.",
      priority: 7,
    }))
}

// ---- High-quality sessions ("🔥 23 correct answers" / "🎯 96% accuracy") ----

function sessionHighlightEvents(attempts: Attempt[]): WinEvent[] {
  const sessions = allSessionSummaries(attempts).slice(0, LOOKBACK_SESSIONS)
  const events: WinEvent[] = []
  for (const s of sessions) {
    if (
      s.questions >= HIGH_QUALITY_MIN_QUESTIONS &&
      s.accuracy >= HIGH_QUALITY_MIN_ACCURACY
    ) {
      events.push({
        type: "sessionHighlight",
        date: s.date,
        icon: "🔥",
        text: `${s.correct} correct answers`,
        sentence: `You got ${s.correct} correct answers in one sitting today.`,
        priority: 6,
      })
      events.push({
        type: "sessionHighlight",
        date: s.date,
        icon: "🎯",
        text: `${s.accuracy}% accuracy`,
        sentence: `You hit ${s.accuracy}% accuracy in a session today.`,
        priority: 6,
      })
    }
  }
  return events
}

// ---- Next Challenge: one specific, actionable, data-driven suggestion ----

function componentNudge(m: TableMastery): string {
  const weakest = [...m.components]
    .filter((c) => !c.complete)
    .sort((a, b) => a.numerator / a.denominator - b.numerator / b.denominator)[0]
  if (!weakest) return `Keep practising your ${m.table} times table.`
  switch (weakest.key) {
    case "sessions":
      return `Play one more practice session on your ${m.table} times table.`
    case "daysSpread":
      return `Practise your ${m.table} times table on a different day this week.`
    case "fluency":
      return `Try answering ${m.table}× questions a little faster.`
    case "volume":
      return `Answer a few more ${m.table}× questions to build up practice.`
    default:
      return `Keep practising your ${m.table} times table.`
  }
}

function pickNextChallenge(mastery: TableMastery[]): string {
  const active = mastery.filter((m) => !m.mastered)
  if (active.length === 0) {
    return "Every table is mastered — keep your streak sharp!"
  }
  const readyForChallenge = active.find((m) => m.state === "challengeReady")
  if (readyForChallenge) {
    return `Your ${readyForChallenge.table} times table is ready — take the Belt Challenge!`
  }
  const withNext = active.filter((m) => m.percentToNext !== null)
  const pool = withNext.length > 0 ? withNext : active
  const closest = [...pool].sort(
    (a, b) => (a.percentToNext ?? 999) - (b.percentToNext ?? 999),
  )[0]
  if (
    closest.percentToNext !== null &&
    closest.nextBelt &&
    closest.percentToNext <= 5
  ) {
    return `You're only ${closest.percentToNext}% away from your ${BELT_LABEL[closest.nextBelt]} Belt in ${closest.table}s.`
  }
  if (/^(Great work|Fully mastered)/.test(closest.recommendation)) {
    return componentNudge(closest)
  }
  return closest.recommendation.replace(/^Next goal: /, "Next challenge: ")
}

// The core entry point. `now` is injectable for tests; defaults to the
// real current time.
export function computeRecentWins(
  attempts: Attempt[],
  practiceDays: { date: string; seconds: number }[],
  awards: Map<number, Date>,
  personalBests: PersonalBests,
  now: Date = new Date(),
): RecentWinsData {
  const sorted = sortedByTime(attempts)
  const boundaries = sessionBoundaries(sorted)
  const recentSessionIds = new Set(
    boundaries.slice(-LOOKBACK_SESSIONS).map((b) => b.sessionId),
  )

  const events: WinEvent[] = [
    ...beltCrossingEvents(sorted, awards),
    ...factMasteredEvents(sorted, recentSessionIds),
    ...personalBestEvents(personalBests),
    ...piggyMilestoneEvents(sorted, recentSessionIds),
    ...dailyGoalEvents(practiceDays),
    ...sessionHighlightEvents(attempts),
  ]

  events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  const wins = events.slice(0, RECENT_WINS_LIMIT)

  const todayWins = wins.filter((w) => isToday(w.date, now))
  const bestToday =
    todayWins.length > 0
      ? [...todayWins].sort((a, b) => a.priority - b.priority)[0].sentence
      : null

  const mastery = Array.from({ length: 12 }, (_, i) => i + 1).map((t) =>
    computeTableMastery(t, attempts, awards.get(t) ?? null),
  )
  const nextChallenge = pickNextChallenge(mastery)

  return { wins, bestToday, nextChallenge }
}

// Re-exported so consumers only need one import for date formatting across
// the Recent Wins UI (same "Aug 12" convention used everywhere else).
export const formatWinDate = formatPersonalBestDate
