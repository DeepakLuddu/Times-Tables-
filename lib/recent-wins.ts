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

import { BELT_LABEL, type Attempt, type Belt, beltIndex } from "./engine"
import { allSessionSummaries } from "./insights"
import { type TableMastery, computeTableMastery } from "./mastery"
import { getSubjectEngine, SUBJECT_ENGINES } from "./subjects"
import type { Subject, SubjectEngine } from "./subjects/types"
import {
  type PersonalBests,
  formatShortDate as formatPersonalBestDate,
} from "./personal-bests"
import {
  type EarningAttempt,
  WEEKLY_CAP_CENTS,
  allocateOneAnswer,
  crossedMultiple,
  emptyBucket,
  formatCents,
  weekKey as piggyWeekKey,
} from "./piggybank"

// Every subject with a registered SubjectEngine gets its own belt/fact-
// mastery scan — addition/subtraction join automatically once registered
// in lib/subjects/index.ts, no changes needed here.
const AVAILABLE_SUBJECTS = Object.keys(SUBJECT_ENGINES) as Subject[]

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
// Scoped to one subject at a time (see computeRecentWins, which runs this
// once per subject and merges the results) — a skill index like "7" means
// something different per subject, so mixing them here would be wrong.

function beltCrossingEventsForSubject(
  engine: SubjectEngine,
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
  for (const skill of engine.skills) {
    const t = skill.index
    if (seedHasLookbackGap) {
      const alreadyAwarded =
        awards.has(t) && awards.get(t)!.getTime() <= seedBoundary.endTime
      const m = computeTableMastery(
        engine,
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
    for (const skill of engine.skills) {
      const t = skill.index
      const label = engine.skillLabel(t)
      const awardedNow =
        awards.has(t) && awards.get(t)!.getTime() <= b.endTime
      const m = computeTableMastery(
        engine,
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
          text: `${label} earned Black Belt!`,
          sentence: `You earned your Black Belt in ${label} today.`,
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
          text: `${label} unlocked the Belt Challenge`,
          sentence: `${label} is ready for its Belt Challenge.`,
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
          text: `${label} reached ${BELT_LABEL[m.belt]} Belt`,
          sentence: `${label} reached ${BELT_LABEL[m.belt]} Belt today.`,
          priority: 3,
        })
        lastBelt.set(t, m.belt)
      }
    }
  }
  return events
}

// ---- Facts newly mastered (single forward pass, O(n)) ----
// Subject-scoped via `engine`'s own factKey/normalizeFact/formatFact —
// using the generic (multiplication-only) versions from lib/engine.ts here
// would silently reverse a non-commutative fact like subtraction's 15-8.

function factMasteredEventsForSubject(
  engine: SubjectEngine,
  sorted: Attempt[],
  recentSessionIds: Set<string>,
  // Only passed for division: lets a division fact's mastery event credit
  // the multiplication knowledge that (per the design) may have primed it
  // — a soft narrative link only, never a mastery shortcut (division still
  // has to earn its own mastery independently, same as every other fact
  // in this replay).
  multiplicationMasteredFacts?: Set<string>,
): WinEvent[] {
  const perFact = new Map<
    string,
    { correct: number; total: number; last3: boolean[]; mastered: boolean }
  >()
  const events: WinEvent[] = []
  for (const at of sorted) {
    const key = engine.factKey(at.factorA, at.factorB)
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
        const [x, y] = engine.normalizeFact(at.factorA, at.factorB)
        const label = engine.formatFact(x, y)
        // For division: x=dividend, y=divisor → the multiplication fact
        // that "explains" it is divisor × quotient (y × (x/y)).
        const multCounterpartKey =
          engine.id === "division" ? `${Math.min(y, x / y)}x${Math.max(y, x / y)}` : null
        const linked =
          multCounterpartKey != null &&
          multiplicationMasteredFacts?.has(multCounterpartKey)
        if (linked) {
          const quotient = x / y
          events.push({
            type: "factMastered",
            date: at.createdAt.toISOString(),
            icon: "⭐",
            text: `Mastered ${label}`,
            sentence: `Your ${y} × ${quotient} knowledge helped you master ${label}.`,
            priority: 4,
          })
        } else {
          events.push({
            type: "factMastered",
            date: at.createdAt.toISOString(),
            icon: "⭐",
            text: `Mastered ${label}`,
            sentence: `You mastered ${label} today.`,
            priority: 4,
          })
        }
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

// ---- Piggy Bank milestones (single forward pass through the FULL,
// cross-subject attempts log, via the one canonical per-answer allocation
// rule — lib/piggybank.ts's allocateOneAnswer — so the $4-balanced +
// $1-flexible model can't drift out of sync with the rest of the app) ----

// "In window" here means "recent" by simple wall-clock time rather than
// session membership, since a session boundary computed from one subject's
// attempts (see computeRecentWins) doesn't meaningfully bound attempts
// from a completely different subject's sessions.
const PIGGY_MILESTONE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000

function piggyMilestoneEvents(allAttempts: EarningAttempt[], now: Date): WinEvent[] {
  const sorted = [...allAttempts].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  )
  const windowStart = now.getTime() - PIGGY_MILESTONE_WINDOW_MS
  const weeks = new Map<string, ReturnType<typeof emptyBucket>>()
  let lifetimeEarned = 0
  const weekCapAnnounced = new Set<string>()
  const events: WinEvent[] = []
  for (const at of sorted) {
    if (!at.correct) continue
    const wk = piggyWeekKey(at.createdAt)
    let bucket = weeks.get(wk)
    if (!bucket) {
      bucket = emptyBucket()
      weeks.set(wk, bucket)
    }
    const earnedBefore = bucket.totalCents
    const earnedThisAnswer = allocateOneAnswer(bucket, at.subject)
    if (earnedThisAnswer === 0) continue
    const earnedAfter = bucket.totalCents

    lifetimeEarned++
    const inWindow = at.createdAt.getTime() >= windowStart
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
  const label = getSubjectEngine(m.subject).skillLabel(m.table)
  const weakest = [...m.components]
    .filter((c) => !c.complete)
    .sort((a, b) => a.numerator / a.denominator - b.numerator / b.denominator)[0]
  if (!weakest) return `Keep practising ${label}.`
  switch (weakest.key) {
    case "sessions":
      return `Play one more practice session on ${label}.`
    case "daysSpread":
      return `Practise ${label} on a different day this week.`
    case "fluency":
      return `Try answering ${label} questions a little faster.`
    case "volume":
      return `Answer a few more ${label} questions to build up practice.`
    default:
      return `Keep practising ${label}.`
  }
}

// Considers every subject's skills together and picks the single best
// "what to do next" suggestion — never a generic "keep practising" when a
// specific one is available (challenge-ready beats close-to-next-belt
// beats a targeted recommendation).
function pickNextChallenge(mastery: TableMastery[]): string {
  const active = mastery.filter((m) => !m.mastered)
  if (active.length === 0) {
    return "Every skill is mastered — keep your streak sharp!"
  }
  const readyForChallenge = active.find((m) => m.state === "challengeReady")
  if (readyForChallenge) {
    const label = getSubjectEngine(readyForChallenge.subject).skillLabel(
      readyForChallenge.table,
    )
    return `${label} is ready — take the Belt Challenge!`
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
    const label = getSubjectEngine(closest.subject).skillLabel(closest.table)
    return `You're only ${closest.percentToNext}% away from your ${BELT_LABEL[closest.nextBelt]} Belt in ${label}.`
  }
  if (/^(Great work|Fully mastered)/.test(closest.recommendation)) {
    return componentNudge(closest)
  }
  return closest.recommendation.replace(/^Next goal: /, "Next challenge: ")
}

// The core entry point. `now` is injectable for tests; defaults to the
// real current time.
//
// `subjectAttempts`/`subjectAwards` hold each subject's own attempts/belt
// awards, keyed by subject — belt-crossing and fact-mastered detection run
// once per subject (a skill index like "7" means something different in
// each one, and non-commutative subjects need their own factKey), then
// every subject's events and mastery are merged for the shared child-
// facing feed. `allAttempts` is the FULL, unfiltered, cross-subject log,
// needed for Piggy Bank milestones now the weekly cap is shared across
// every subject; `combinedAttempts` is the concatenation of every
// subject's attempts, used only for session-highlight detection (safe
// across subjects since it only reads question/correct counts per
// session, never fact identity).
export function computeRecentWins(
  subjectAttempts: Partial<Record<Subject, Attempt[]>>,
  subjectAwards: Partial<Record<Subject, Map<number, Date>>>,
  practiceDays: { date: string; seconds: number }[],
  personalBests: PersonalBests,
  allAttempts: EarningAttempt[] = [],
  now: Date = new Date(),
): RecentWinsData {
  const events: WinEvent[] = []
  const allMastery: TableMastery[] = []
  const combinedAttempts: Attempt[] = []

  // Multiplication's mastered-fact set, precomputed once, so division's
  // fact-mastered events can credit it (a soft narrative link only).
  const multAttempts = subjectAttempts.multiplication
  let multiplicationMasteredFacts: Set<string> | undefined
  if (multAttempts && multAttempts.length > 0) {
    const multEngine = getSubjectEngine("multiplication")
    const perFact = new Map<string, { correct: number; total: number }>()
    for (const at of sortedByTime(multAttempts)) {
      const key = multEngine.factKey(at.factorA, at.factorB)
      const rec = perFact.get(key) ?? { correct: 0, total: 0 }
      rec.total++
      if (at.correct) rec.correct++
      perFact.set(key, rec)
    }
    multiplicationMasteredFacts = new Set(
      Array.from(perFact.entries())
        .filter(([, r]) => r.total >= 3 && r.correct / r.total >= 0.9)
        .map(([k]) => k),
    )
  }

  for (const subject of AVAILABLE_SUBJECTS) {
    const attempts = subjectAttempts[subject] ?? []
    if (attempts.length === 0) continue
    const engine = getSubjectEngine(subject)
    const awards = subjectAwards[subject] ?? new Map<number, Date>()
    const sorted = sortedByTime(attempts)
    const boundaries = sessionBoundaries(sorted)
    const recentSessionIds = new Set(
      boundaries.slice(-LOOKBACK_SESSIONS).map((b) => b.sessionId),
    )

    events.push(...beltCrossingEventsForSubject(engine, sorted, awards))
    events.push(
      ...factMasteredEventsForSubject(
        engine,
        sorted,
        recentSessionIds,
        subject === "division" ? multiplicationMasteredFacts : undefined,
      ),
    )

    for (const skill of engine.skills) {
      allMastery.push(
        computeTableMastery(engine, skill.index, attempts, awards.get(skill.index) ?? null),
      )
    }

    combinedAttempts.push(...attempts)
  }

  events.push(...personalBestEvents(personalBests))
  events.push(...piggyMilestoneEvents(allAttempts, now))
  events.push(...dailyGoalEvents(practiceDays))
  events.push(...sessionHighlightEvents(combinedAttempts))

  events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  const wins = events.slice(0, RECENT_WINS_LIMIT)

  const todayWins = wins.filter((w) => isToday(w.date, now))
  const bestToday =
    todayWins.length > 0
      ? [...todayWins].sort((a, b) => a.priority - b.priority)[0].sentence
      : null

  const nextChallenge = pickNextChallenge(allMastery)

  return { wins, bestToday, nextChallenge }
}

// Re-exported so consumers only need one import for date formatting across
// the Recent Wins UI (same "Aug 12" convention used everywhere else).
export const formatWinDate = formatPersonalBestDate
