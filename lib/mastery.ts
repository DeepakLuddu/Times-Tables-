// Belt Wall mastery engine — an 8-part weighted formula computed on read
// from the attempts log, same computed-on-read philosophy as engine.ts and
// insights.ts. This REPLACES the old simple attempts+accuracy belt tiers:
// a table's belt color and percentage now both come from here.
//
// The only piece of state this needs beyond the attempts log is whether a
// table's belt has already been formally awarded (see lib/db/schema.ts's
// beltAwards table) — once awarded, a table is permanently pinned at 100%
// even if later performance dips, per product requirement.
//
// Two numbers matter for each component: `numerator`/`denominator` for
// display (denominator is always the fixed window/target size, matching
// the spec's example breakdown), and `required` for the weighted score
// (which can be lower than denominator — e.g. recent accuracy needs 19 of
// the last 20, not a perfect 20/20).

import {
  type Attempt,
  type Belt,
  computeFactStats,
  factKey,
  normalizeFact,
} from "./engine"

export const VOLUME_REQUIRED = 75
export const RECENT_WINDOW = 20
export const RECENT_REQUIRED = 19
export const LONGTERM_WINDOW = 50
export const LONGTERM_REQUIRED = 47
export const DEMOS_PER_FACT = 3
export const FLUENCY_WINDOW = 20
// No explicit fluency threshold was specified alongside the other seven —
// this mirrors the ~95%-of-window generosity used for recent accuracy
// (19 of 20) rather than requiring a flawless window.
export const FLUENCY_REQUIRED = 19
// "Fast" = answered within 4 seconds. Also an assumption, tuned for a
// 9-year-old rather than an adult's reflexes.
export const FLUENCY_FAST_MS = 4000
export const SESSIONS_REQUIRED = 5
export const DAYS_REQUIRED = 7

export type MasteryKey =
  | "volume"
  | "recentAccuracy"
  | "longTermAccuracy"
  | "factCoverage"
  | "weakFactsEliminated"
  | "fluency"
  | "sessions"
  | "daysSpread"

export interface MasteryComponent {
  key: MasteryKey
  label: string
  numerator: number
  denominator: number
  weight: number
  complete: boolean
}

export type MasteryState =
  | "needsPractice"
  | "buildingMastery"
  | "almostThere"
  | "challengeReady"
  | "mastered"

export const MASTERY_STATE_LABEL: Record<MasteryState, string> = {
  needsPractice: "Needs Practice",
  buildingMastery: "Building Mastery",
  almostThere: "Almost There",
  challengeReady: "Belt Challenge Ready",
  mastered: "MASTERED",
}

export interface TableMastery {
  table: number
  percent: number // 0-95, or 99, or 100 — never anything in between 96-98
  belt: Belt
  state: MasteryState
  stateLabel: string
  mastered: boolean
  /** All 8 weighted components — the full accounting behind the percent. */
  components: MasteryComponent[]
  /** One short, plain-language suggestion of what to practise next. */
  recommendation: string
}

function dayKeyUTC(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// Every table pairs with partners 1-12 (the 12 facts that make up a table).
const ALL_PARTNERS = Array.from({ length: 12 }, (_, i) => i + 1)

function buildComponents(
  table: number,
  allAttempts: Attempt[],
): { components: MasteryComponent[]; requiredMap: Record<MasteryKey, number> } {
  const tableAttempts = allAttempts
    .filter((a) => a.factorA === table || a.factorB === table)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  const total = tableAttempts.length

  const volumeNumerator = Math.min(total, VOLUME_REQUIRED)

  const recentSlice = tableAttempts.slice(-RECENT_WINDOW)
  const recentCorrect = recentSlice.filter((a) => a.correct).length

  const longSlice = tableAttempts.slice(-LONGTERM_WINDOW)
  const longCorrect = longSlice.filter((a) => a.correct).length

  const factStats = computeFactStats(allAttempts)
  const partners = ALL_PARTNERS
  let coveredFacts = 0
  let weakClearFacts = 0
  for (const p of partners) {
    const [x, y] = normalizeFact(table, p)
    const stat = factStats.get(factKey(x, y))
    const correctCount = stat?.correct ?? 0
    if (correctCount >= DEMOS_PER_FACT) coveredFacts++
    const isWeak = stat
      ? stat.recentMisses > 0 ||
        stat.consecWrong > 0 ||
        (stat.attempts >= 2 && stat.accuracy < 0.6)
      : false
    if (!isWeak) weakClearFacts++
  }

  const fluencySlice = tableAttempts.slice(-FLUENCY_WINDOW)
  const fluencyCount = fluencySlice.filter(
    (a) =>
      a.correct &&
      typeof a.answerMs === "number" &&
      a.answerMs <= FLUENCY_FAST_MS,
  ).length

  const sessionCount = new Set(tableAttempts.map((a) => a.sessionId)).size
  const dayCount = new Set(tableAttempts.map((a) => dayKeyUTC(a.createdAt)))
    .size

  const components: MasteryComponent[] = [
    {
      key: "volume",
      label: "Practice",
      numerator: volumeNumerator,
      denominator: VOLUME_REQUIRED,
      weight: 20,
      complete: total >= VOLUME_REQUIRED,
    },
    {
      key: "recentAccuracy",
      label: "Recent accuracy",
      numerator: recentCorrect,
      denominator: RECENT_WINDOW,
      weight: 20,
      complete: recentCorrect >= RECENT_REQUIRED,
    },
    {
      key: "longTermAccuracy",
      label: "Long-term accuracy",
      numerator: longCorrect,
      denominator: LONGTERM_WINDOW,
      weight: 15,
      complete: longCorrect >= LONGTERM_REQUIRED,
    },
    {
      key: "factCoverage",
      label: "Fact mastery",
      numerator: coveredFacts,
      denominator: 12,
      weight: 15,
      complete: coveredFacts === 12,
    },
    {
      key: "weakFactsEliminated",
      label: "Weak facts cleared",
      numerator: weakClearFacts,
      denominator: 12,
      weight: 10,
      complete: weakClearFacts === 12,
    },
    {
      key: "fluency",
      label: "Fluency",
      numerator: fluencyCount,
      denominator: FLUENCY_WINDOW,
      weight: 10,
      complete: fluencyCount >= FLUENCY_REQUIRED,
    },
    {
      key: "sessions",
      label: "Sessions",
      numerator: Math.min(sessionCount, SESSIONS_REQUIRED),
      denominator: SESSIONS_REQUIRED,
      weight: 5,
      complete: sessionCount >= SESSIONS_REQUIRED,
    },
    {
      key: "daysSpread",
      label: "Days practised",
      numerator: Math.min(dayCount, DAYS_REQUIRED),
      denominator: DAYS_REQUIRED,
      weight: 5,
      complete: dayCount >= DAYS_REQUIRED,
    },
  ]

  const requiredMap: Record<MasteryKey, number> = {
    volume: VOLUME_REQUIRED,
    recentAccuracy: RECENT_REQUIRED,
    longTermAccuracy: LONGTERM_REQUIRED,
    factCoverage: 12,
    weakFactsEliminated: 12,
    fluency: FLUENCY_REQUIRED,
    sessions: SESSIONS_REQUIRED,
    daysSpread: DAYS_REQUIRED,
  }

  return { components, requiredMap }
}

function beltForPercent(percent: number): Belt {
  if (percent >= 100) return "black"
  if (percent >= 99) return "brown"
  if (percent >= 80) return "blue"
  if (percent >= 65) return "green"
  if (percent >= 50) return "yellow"
  return "white"
}

function stateForPercent(percent: number): MasteryState {
  if (percent >= 100) return "mastered"
  if (percent >= 99) return "challengeReady"
  if (percent >= 80) return "almostThere"
  if (percent >= 50) return "buildingMastery"
  return "needsPractice"
}

function buildRecommendation(
  table: number,
  allAttempts: Attempt[],
  mastered: boolean,
): string {
  if (mastered) {
    return "Fully mastered — keep it sharp with the occasional review."
  }
  const factStats = computeFactStats(allAttempts)
  const partners = ALL_PARTNERS
  const scored = partners.map((p) => {
    const [x, y] = normalizeFact(table, p)
    const stat = factStats.get(factKey(x, y))
    const correct = stat?.correct ?? 0
    const weak = stat
      ? stat.recentMisses > 0 ||
        stat.consecWrong > 0 ||
        (stat.attempts >= 2 && stat.accuracy < 0.6)
      : false
    const undercovered = correct < DEMOS_PER_FACT
    return { a: x, b: y, weak, undercovered, correct }
  })
  const priority = scored
    .filter((s) => s.weak || s.undercovered)
    .sort((m, n) => {
      if (m.weak !== n.weak) return m.weak ? -1 : 1
      return m.correct - n.correct
    })
  if (priority.length === 0) {
    return "Great work — every fact in this table is solid. Keep the streak going."
  }
  const picks = priority.slice(0, 2)
  const label = picks.map((p) => `${p.a} × ${p.b}`).join(" and ")
  return `Next goal: practise ${label}`
}

// The core entry point. `awardedAt` is null until the table's belt has
// been formally earned (see recordAttempt in app/actions/dojo.ts) — once
// non-null, this always returns 100% / mastered regardless of what the
// live components say.
export function computeTableMastery(
  table: number,
  allAttempts: Attempt[],
  awardedAt: Date | null,
): TableMastery {
  const { components, requiredMap } = buildComponents(table, allAttempts)

  if (awardedAt) {
    return {
      table,
      percent: 100,
      belt: "black",
      state: "mastered",
      stateLabel: MASTERY_STATE_LABEL.mastered,
      mastered: true,
      components,
      recommendation: buildRecommendation(table, allAttempts, true),
    }
  }

  const allComplete = components.every((c) => c.complete)
  const rawPercent = components.reduce((sum, c) => {
    const required = requiredMap[c.key]
    const fraction = required > 0 ? Math.min(1, c.numerator / required) : 1
    return sum + fraction * c.weight
  }, 0)

  // 0-95% while building, capped below 100 until every requirement is met;
  // 99% the instant everything is complete but not yet formally awarded.
  const percent = allComplete ? 99 : Math.min(95, Math.round(rawPercent))
  const state = stateForPercent(percent)

  return {
    table,
    percent,
    belt: beltForPercent(percent),
    state,
    stateLabel: MASTERY_STATE_LABEL[state],
    mastered: false,
    components,
    recommendation: buildRecommendation(table, allAttempts, false),
  }
}
