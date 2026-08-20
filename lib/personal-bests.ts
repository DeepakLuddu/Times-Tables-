// Personal Bests engine — a second, independent long-term motivation system
// alongside belts and the Piggy Bank. Same "compute on read" philosophy as
// the rest of the app: nothing is stored directly. Both the CURRENT record
// values and the small history of when each record was broken are derived
// purely by replaying the attempts log (and the sessions built from it).
//
// Belts = what the child has mastered.
// Personal Bests = the best they have ever performed.

import type { Attempt } from "./engine"
import { formatMinSec } from "./piggybank"
import { allSessionSummaries } from "./insights"
import { SUBJECT_ENGINES, getSubjectEngine } from "./subjects"
import type { Subject } from "./subjects/types"

const AVAILABLE_SUBJECTS = Object.keys(SUBJECT_ENGINES) as Subject[]

// A "clean run" completes the moment a correct streak reaches this length
// with zero incorrect answers inside it.
export const CLEAN_RUN_LENGTH = 20

// A session only counts toward Best Accuracy once it has at least this
// many answered questions — short warm-up sessions can't cheaply post a
// misleading 100%.
export const MIN_ACCURACY_SESSION_QUESTIONS = 20

// Most Improved Table compares the first N attempts on a table against the
// most recent N. Requiring 2x that many total attempts keeps the two
// windows from overlapping, so early progress can't be double-counted.
export const IMPROVEMENT_WINDOW = 20
export const MIN_TABLE_ATTEMPTS_FOR_IMPROVEMENT = IMPROVEMENT_WINDOW * 2

export interface RecordHistoryEntry {
  /** ISO timestamp of the attempt/session that set this record. */
  date: string
  /** Short display value at the time, e.g. "1:18", "47", "98%". */
  label: string
}

export interface FastestCleanRunRecord {
  key: "fastestCleanRun"
  achieved: boolean
  elapsedMs: number | null
  questions: number
  date: string | null
  history: RecordHistoryEntry[]
}

export interface LongestStreakRecord {
  key: "longestStreak"
  achieved: boolean
  streak: number
  date: string | null
  history: RecordHistoryEntry[]
}

export interface BestAccuracyRecord {
  key: "bestAccuracy"
  achieved: boolean
  accuracy: number // 0..100
  correct: number
  questions: number
  date: string | null
  history: RecordHistoryEntry[]
}

export interface MostImprovedRecord {
  key: "mostImproved"
  achieved: boolean
  table: number | null
  subject: Subject | null
  /** Precomputed display label, e.g. "7 Times Table" / "Divide by 8" / "Facts within 20". */
  skillLabel: string | null
  earlyAccuracy: number | null // 0..100
  recentAccuracy: number | null // 0..100
  improvement: number | null // percentage points, recent - early
  date: string | null
  history: RecordHistoryEntry[]
}

export interface PersonalBests {
  fastestCleanRun: FastestCleanRunRecord
  longestStreak: LongestStreakRecord
  bestAccuracy: BestAccuracyRecord
  mostImproved: MostImprovedRecord
}

function sortedByTime(attempts: Attempt[]): Attempt[] {
  return [...attempts].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  )
}

export function formatClock(elapsedMs: number): string {
  return formatMinSec(elapsedMs / 1000)
}

// ---- Fastest Clean Run + Longest Streak ----
// Both come from a single pass: a streak is any run of consecutive correct
// answers (resets on a wrong answer, never bounded by session). A "clean
// run" record is captured at the instant a streak first reaches
// CLEAN_RUN_LENGTH — continuing the streak further doesn't get faster, so
// that instant is always the fastest point of that particular run.

interface StreakScan {
  bestStreak: number
  streakHistory: RecordHistoryEntry[] // chronological, oldest first
  bestCleanRunMs: number | null
  cleanRunDate: string | null
  cleanRunHistory: RecordHistoryEntry[] // chronological, oldest first
}

function scanStreaksAndCleanRuns(sorted: Attempt[]): StreakScan {
  let currentStreak = 0
  let runStartIdx = -1
  let bestStreak = 0
  let bestCleanRunMs: number | null = null
  let cleanRunDate: string | null = null
  const streakHistory: RecordHistoryEntry[] = []
  const cleanRunHistory: RecordHistoryEntry[] = []

  for (let i = 0; i < sorted.length; i++) {
    const at = sorted[i]
    if (at.correct) {
      currentStreak++
      if (runStartIdx === -1) runStartIdx = i
      if (currentStreak > bestStreak) {
        bestStreak = currentStreak
        streakHistory.push({
          date: at.createdAt.toISOString(),
          label: String(bestStreak),
        })
      }
      if (currentStreak === CLEAN_RUN_LENGTH) {
        const first = sorted[runStartIdx]
        // Approximate "run started" as when the first question of the run
        // was shown (its answer time subtracted from when it was
        // recorded), falling back to its recorded time if answerMs is
        // unavailable (older attempts, or the very first ever recorded).
        const start = first.createdAt.getTime() - (first.answerMs ?? 0)
        const elapsedMs = Math.max(0, at.createdAt.getTime() - start)
        if (bestCleanRunMs === null || elapsedMs < bestCleanRunMs) {
          bestCleanRunMs = elapsedMs
          cleanRunDate = at.createdAt.toISOString()
          cleanRunHistory.push({
            date: cleanRunDate,
            label: formatClock(elapsedMs),
          })
        }
      }
    } else {
      currentStreak = 0
      runStartIdx = -1
    }
  }

  return {
    bestStreak,
    streakHistory,
    bestCleanRunMs,
    cleanRunDate,
    cleanRunHistory,
  }
}

// ---- Best Accuracy Session ----
// Reuses the same session summaries as the rest of the app (Belt Wall,
// Parent Report) rather than recomputing session boundaries separately.

function scanBestAccuracy(attempts: Attempt[]): {
  achieved: boolean
  accuracy: number
  correct: number
  questions: number
  date: string | null
  history: RecordHistoryEntry[]
} {
  const chronological = allSessionSummaries(attempts)
    .slice()
    .reverse() // allSessionSummaries is most-recent-first; walk oldest-first
    .filter((s) => s.questions >= MIN_ACCURACY_SESSION_QUESTIONS)

  let best: (typeof chronological)[number] | null = null
  const history: RecordHistoryEntry[] = []
  for (const s of chronological) {
    const better =
      !best ||
      s.accuracy > best.accuracy ||
      (s.accuracy === best.accuracy && s.questions > best.questions)
    if (better) {
      best = s
      history.push({ date: s.date, label: `${s.accuracy}%` })
    }
  }

  return {
    achieved: best !== null,
    accuracy: best?.accuracy ?? 0,
    correct: best?.correct ?? 0,
    questions: best?.questions ?? 0,
    date: best?.date ?? null,
    history,
  }
}

// ---- Most Improved Table ----
// Compares a table's earliest attempts against its most recent, using
// rolling windows rather than a single session-to-session diff so one
// lucky or unlucky session can't swing the result.

interface MostImprovedSnapshot {
  achieved: boolean
  table: number | null
  subject: Subject | null
  skillLabel: string | null
  earlyAccuracy: number | null
  recentAccuracy: number | null
  improvement: number | null
  date: string | null
}

function accuracyOf(list: Attempt[]): number {
  if (list.length === 0) return 0
  const correct = list.filter((a) => a.correct).length
  return Math.round((correct / list.length) * 100)
}

// Scans every subject's skills (not just multiplication's 12 tables) to
// find the single most-improved skill globally. Attempts are grouped by
// their own `subject` first — mixing subjects before filtering by "table"
// would be wrong, since e.g. multiplication's "7×8" and division's "56÷7"
// both touch the number 7 but belong to entirely different skill spaces.
function computeMostImprovedSnapshot(sorted: Attempt[]): MostImprovedSnapshot {
  let best: {
    table: number
    subject: Subject
    early: number
    recent: number
    improvement: number
    date: string
  } | null = null

  const bySubject = new Map<Subject, Attempt[]>()
  for (const a of sorted) {
    const subject = (a.subject as Subject) ?? "multiplication"
    if (!bySubject.has(subject)) bySubject.set(subject, [])
    bySubject.get(subject)!.push(a)
  }

  for (const subject of AVAILABLE_SUBJECTS) {
    const subjAttempts = bySubject.get(subject)
    if (!subjAttempts || subjAttempts.length === 0) continue
    const engine = getSubjectEngine(subject)
    for (const skill of engine.skills) {
      const t = skill.index
      const list = subjAttempts.filter((a) =>
        engine
          .skillsForAttempt({ factorA: a.factorA, factorB: a.factorB, bandIndex: a.bandIndex ?? null })
          .includes(t),
      )
      if (list.length < MIN_TABLE_ATTEMPTS_FOR_IMPROVEMENT) continue
      const early = list.slice(0, IMPROVEMENT_WINDOW)
      const recent = list.slice(-IMPROVEMENT_WINDOW)
      const earlyAcc = accuracyOf(early)
      const recentAcc = accuracyOf(recent)
      const improvement = recentAcc - earlyAcc
      if (improvement <= 0) continue
      if (!best || improvement > best.improvement) {
        best = {
          table: t,
          subject,
          early: earlyAcc,
          recent: recentAcc,
          improvement,
          date: recent[recent.length - 1].createdAt.toISOString(),
        }
      }
    }
  }

  if (!best) {
    return {
      achieved: false,
      table: null,
      subject: null,
      skillLabel: null,
      earlyAccuracy: null,
      recentAccuracy: null,
      improvement: null,
      date: null,
    }
  }
  return {
    achieved: true,
    table: best.table,
    subject: best.subject,
    skillLabel: getSubjectEngine(best.subject).skillLabel(best.table),
    earlyAccuracy: best.early,
    recentAccuracy: best.recent,
    improvement: best.improvement,
    date: best.date,
  }
}

// History for Most Improved is evaluated at each session boundary
// (day-level precision is all the record list needs) rather than after
// every single attempt, which keeps this cheap and matches how the other
// records only need "which day" for their history list.
function computeMostImprovedHistory(sorted: Attempt[]): RecordHistoryEntry[] {
  const sessionEnds = new Map<string, number>()
  for (const a of sorted) {
    const t = a.createdAt.getTime()
    const prev = sessionEnds.get(a.sessionId)
    if (prev === undefined || t > prev) sessionEnds.set(a.sessionId, t)
  }
  const boundaries = Array.from(sessionEnds.values()).sort((a, b) => a - b)

  let bestImprovement = 0
  const history: RecordHistoryEntry[] = []
  for (const boundary of boundaries) {
    const cumulative = sorted.filter((a) => a.createdAt.getTime() <= boundary)
    const snap = computeMostImprovedSnapshot(cumulative)
    if (
      snap.achieved &&
      snap.improvement !== null &&
      snap.improvement > bestImprovement
    ) {
      bestImprovement = snap.improvement
      history.push({
        date: snap.date ?? new Date(boundary).toISOString(),
        label: `${snap.skillLabel} +${snap.improvement}%`,
      })
    }
  }
  return history
}

// Recompute every Personal Best from scratch from the raw attempts log.
export function computePersonalBests(attempts: Attempt[]): PersonalBests {
  const sorted = sortedByTime(attempts)
  const streakScan = scanStreaksAndCleanRuns(sorted)
  const accuracy = scanBestAccuracy(sorted)
  const improved = computeMostImprovedSnapshot(sorted)

  return {
    fastestCleanRun: {
      key: "fastestCleanRun",
      achieved: streakScan.bestCleanRunMs !== null,
      elapsedMs: streakScan.bestCleanRunMs,
      questions: streakScan.bestCleanRunMs !== null ? CLEAN_RUN_LENGTH : 0,
      date: streakScan.cleanRunDate,
      history: streakScan.cleanRunHistory.slice().reverse(),
    },
    longestStreak: {
      key: "longestStreak",
      achieved: streakScan.bestStreak > 0,
      streak: streakScan.bestStreak,
      date: streakScan.streakHistory.at(-1)?.date ?? null,
      history: streakScan.streakHistory.slice().reverse(),
    },
    bestAccuracy: {
      key: "bestAccuracy",
      achieved: accuracy.achieved,
      accuracy: accuracy.accuracy,
      correct: accuracy.correct,
      questions: accuracy.questions,
      date: accuracy.date,
      history: accuracy.history.slice().reverse(),
    },
    mostImproved: {
      key: "mostImproved",
      achieved: improved.achieved,
      table: improved.table,
      subject: improved.subject,
      skillLabel: improved.skillLabel,
      earlyAccuracy: improved.earlyAccuracy,
      recentAccuracy: improved.recentAccuracy,
      improvement: improved.improvement,
      date: improved.date,
      history: computeMostImprovedHistory(sorted).reverse(),
    },
  }
}

// ---- New-record detection, for the in-game celebration ----

export interface PersonalBestDelta {
  key: keyof PersonalBests
  title: string
  value: string
  sublabel: string
}

// If more than one record breaks on the same answer, only the highest
// priority one celebrates — mirrors how the Piggy Bank caps itself to one
// milestone banner per answer, so the screen never stacks celebrations.
const PRIORITY: (keyof PersonalBests)[] = [
  "fastestCleanRun",
  "longestStreak",
  "bestAccuracy",
  "mostImproved",
]

export function detectNewPersonalBest(
  before: PersonalBests,
  after: PersonalBests,
): PersonalBestDelta | null {
  for (const key of PRIORITY) {
    if (key === "fastestCleanRun") {
      const b = before.fastestCleanRun
      const a = after.fastestCleanRun
      if (
        a.achieved &&
        a.elapsedMs !== null &&
        (!b.achieved || (b.elapsedMs !== null && a.elapsedMs < b.elapsedMs))
      ) {
        return {
          key,
          title: "Fastest Clean Run",
          value: formatClock(a.elapsedMs),
          sublabel: `${a.questions} / ${a.questions} correct`,
        }
      }
    } else if (key === "longestStreak") {
      const b = before.longestStreak
      const a = after.longestStreak
      if (a.streak > b.streak) {
        return {
          key,
          title: "Longest Streak",
          value: String(a.streak),
          sublabel: "correct answers",
        }
      }
    } else if (key === "bestAccuracy") {
      const b = before.bestAccuracy
      const a = after.bestAccuracy
      const improved =
        a.achieved &&
        (!b.achieved ||
          a.accuracy > b.accuracy ||
          (a.accuracy === b.accuracy && a.questions > b.questions))
      if (improved) {
        return {
          key,
          title: "Best Accuracy",
          value: `${a.accuracy}%`,
          sublabel: `${a.correct} / ${a.questions} correct`,
        }
      }
    } else if (key === "mostImproved") {
      const b = before.mostImproved
      const a = after.mostImproved
      if (
        a.achieved &&
        a.improvement !== null &&
        (!b.achieved ||
          b.improvement === null ||
          a.improvement > b.improvement)
      ) {
        return {
          key,
          title: "Most Improved",
          value: a.skillLabel ?? "—",
          sublabel: `${a.earlyAccuracy}% → ${a.recentAccuracy}% (+${a.improvement}%)`,
        }
      }
    }
  }
  return null
}

// Short "Aug 12" style date, matching the formatting already used
// elsewhere in the app (Parent Report, Piggy Bank parent view).
export function formatShortDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })
}
