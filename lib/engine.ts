// Times Dojo adaptive engine — pure functions over an attempts log.
// No database access here; everything is computed from arrays of attempts.

export type Mode = "practice" | "sprint"

export interface Attempt {
  factorA: number
  factorB: number
  correct: boolean
  mode: Mode
  sessionId: string
  createdAt: Date
  // Milliseconds from question shown to answer submitted. Optional because
  // attempts recorded before this field existed won't have it — treated as
  // "not fast" (never counts toward fluency) rather than an error.
  answerMs?: number
}

export interface Question {
  a: number // displayed first (order randomized)
  b: number
  answer: number
  options: number[] // 4 options, shuffled, includes the answer
  factKey: string
}

export interface FactStat {
  a: number // min factor
  b: number // max factor
  attempts: number
  correct: number
  accuracy: number // 0..1
  consecWrong: number // current trailing wrong streak
  recentMisses: number // misses among the last 5 attempts
  mastered: boolean
}

export const MIN_FACTOR = 1
export const MAX_FACTOR = 12

// Normalize a fact so (7,8) and (8,7) collapse to one entry.
export function normalizeFact(a: number, b: number): [number, number] {
  return a <= b ? [a, b] : [b, a]
}

export function factKey(a: number, b: number): string {
  const [x, y] = normalizeFact(a, b)
  return `${x}x${y}`
}

// All 78 unique facts, x <= y, both 1..12.
export const ALL_FACTS: [number, number][] = (() => {
  const facts: [number, number][] = []
  for (let x = MIN_FACTOR; x <= MAX_FACTOR; x++) {
    for (let y = x; y <= MAX_FACTOR; y++) {
      facts.push([x, y])
    }
  }
  return facts
})()

// Build per-fact stats from a chronological attempts log.
export function computeFactStats(attempts: Attempt[]): Map<string, FactStat> {
  const byFact = new Map<string, Attempt[]>()
  const sorted = [...attempts].sort(
    (m, n) => m.createdAt.getTime() - n.createdAt.getTime(),
  )
  for (const at of sorted) {
    const key = factKey(at.factorA, at.factorB)
    if (!byFact.has(key)) byFact.set(key, [])
    byFact.get(key)!.push(at)
  }

  const stats = new Map<string, FactStat>()
  for (const [key, list] of byFact) {
    const [x, y] = normalizeFact(list[0].factorA, list[0].factorB)
    const total = list.length
    const correct = list.filter((a) => a.correct).length
    const accuracy = total > 0 ? correct / total : 0

    // Trailing consecutive wrong streak.
    let consecWrong = 0
    for (let i = list.length - 1; i >= 0; i--) {
      if (!list[i].correct) consecWrong++
      else break
    }

    // Misses among the last 5 attempts.
    const last5 = list.slice(-5)
    const recentMisses = last5.filter((a) => !a.correct).length

    // Mastered: last 3 attempts all correct AND lifetime accuracy >= 90%.
    const last3 = list.slice(-3)
    const mastered =
      total >= 3 && last3.every((a) => a.correct) && accuracy >= 0.9

    stats.set(key, {
      a: x,
      b: y,
      attempts: total,
      correct,
      accuracy,
      consecWrong,
      recentMisses,
      mastered,
    })
  }
  return stats
}

// Selection weight for a single fact (higher = more likely to appear).
export function weightForFact(stat: FactStat | undefined): number {
  if (!stat) {
    // Never practiced: attempts < 3 bonus applies.
    return 0.3 + 1.0
  }
  let weight =
    0.3 +
    stat.recentMisses * 1.5 +
    stat.consecWrong * 2.0 +
    (stat.attempts < 3 ? 1.0 : 0)
  if (stat.mastered) weight *= 0.15 // rest mastered facts, but still resurface
  return weight
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

// Weighted random pick across all 78 facts.
export function pickWeightedFact(
  stats: Map<string, FactStat>,
  exclude?: Set<string>,
): [number, number] {
  const pool = exclude
    ? ALL_FACTS.filter(([x, y]) => !exclude.has(`${x}x${y}`))
    : ALL_FACTS
  const facts = pool.length > 0 ? pool : ALL_FACTS
  const weights = facts.map(([x, y]) => weightForFact(stats.get(`${x}x${y}`)))
  const total = weights.reduce((s, w) => s + w, 0)
  let r = Math.random() * total
  for (let i = 0; i < facts.length; i++) {
    r -= weights[i]
    if (r <= 0) return facts[i]
  }
  return facts[facts.length - 1]
}

// Distractors drawn from real multiplication misconceptions.
export function distractorsFor(a: number, b: number): number[] {
  const correct = a * b
  const candidates = [
    correct + a,
    correct - a,
    correct + b,
    correct - b,
    a * (b + 1),
    a * (b - 1),
    (a + 1) * b,
    (a - 1) * b,
  ]
  const unique = Array.from(new Set(candidates)).filter(
    (v) => v > 0 && v !== correct,
  )
  const picked = shuffle(unique).slice(0, 3)
  // Pad if we somehow have fewer than 3 (e.g. tiny products).
  let pad = correct + 1
  while (picked.length < 3) {
    if (pad !== correct && pad > 0 && !picked.includes(pad)) picked.push(pad)
    pad++
  }
  return picked
}

// Turn a normalized fact into a display question with randomized factor order.
export function makeQuestion(fact: [number, number]): Question {
  const [x, y] = fact
  const flip = Math.random() < 0.5
  const a = flip ? y : x
  const b = flip ? x : y
  const answer = a * b
  const options = shuffle([answer, ...distractorsFor(a, b)])
  return { a, b, answer, options, factKey: factKey(x, y) }
}

// ---- Worked-out explanation for a wrong answer ----
// Verified correct against all 144 facts (1-12 × 1-12). Checked in this exact
// order, first match wins, so each fact gets the simplest applicable trick.
// Do NOT reorder the checks.
export function explainFact(a: number, b: number): string[] {
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  const product = lo * hi
  const other = (target: number) => (lo === target ? hi : lo)

  if (lo === 1) {
    return [`${hi} × 1 is just ${hi}. Anything times 1 stays the same.`]
  }
  if (lo === 10 || hi === 10) {
    const n = other(10)
    return [`${n} × 10: add a zero to ${n} → ${product}.`]
  }
  if (lo === 2 || hi === 2) {
    const n = other(2)
    return [`${n} × 2 is doubling: ${n} + ${n} = ${product}.`]
  }
  if (lo === 5 || hi === 5) {
    const n = other(5)
    return [`${n} × 5 is half of ${n} × 10: ${n * 10} ÷ 2 = ${product}.`]
  }
  if (lo === 11 || hi === 11) {
    const n = other(11)
    if (n <= 9) return [`${n} × 11: just repeat the digit → ${n}${n}.`]
    return [`${n} × 11 = ${n} × 10 + ${n}: ${n * 10} + ${n} = ${product}.`]
  }
  if (lo === 9 || hi === 9) {
    const n = other(9)
    return [`${n} × 9 = ${n} × 10 − ${n}: ${n * 10} − ${n} = ${product}.`]
  }
  if (lo === 4 || hi === 4) {
    const n = other(4)
    return [`${n} × 4 is double, then double again: ${n} → ${n * 2} → ${product}.`]
  }
  if (lo === 3 || hi === 3) {
    const n = other(3)
    return [`${n} × 3: double ${n} and add one more ${n}: ${n * 2} + ${n} = ${product}.`]
  }
  if (lo === 6 || hi === 6) {
    const n = other(6)
    return [`${n} × 6 is double the ${n} × 3 fact: ${n} × 3 = ${n * 3}, doubled = ${product}.`]
  }
  if (lo === 12 || hi === 12) {
    const n = other(12)
    return [`${n} × 12 = ${n} × 10 + ${n} × 2: ${n * 10} + ${n * 2} = ${product}.`]
  }
  // The genuine no-shortcut facts: 7×7, 7×8, 8×8. Anchor to an easy ×5.
  const rest = hi - 5
  return [`${lo} × ${hi} = ${lo} × 5 + ${lo} × ${rest}: ${lo * 5} + ${lo * rest} = ${product}.`]
}

// ---- Belt tiers (table level) ----

// "purple" was added for the Belt Wall's mastery-percentage display (see
// lib/mastery.ts) to give a 7-tier ladder with more granular motivation
// steps. The OLD simple accuracy-based beltFor() below (still used only by
// the Parent Report, by earlier deliberate scope decision) never produces
// "purple" — it's a strict subset of this type, which is fine since a
// function isn't required to use every value of the type it returns.
export const BELT_ORDER = [
  "white",
  "yellow",
  "green",
  "blue",
  "purple",
  "brown",
  "black",
] as const
export type Belt = (typeof BELT_ORDER)[number]

export const BELT_LABEL: Record<Belt, string> = {
  white: "White",
  yellow: "Yellow",
  green: "Green",
  blue: "Blue",
  purple: "Purple",
  brown: "Brown",
  black: "Black",
}

export function beltFor(attempts: number, accuracy: number): Belt {
  if (attempts < 8) return "white"
  if (accuracy < 0.5) return "yellow"
  if (accuracy < 0.75) return "green"
  if (accuracy < 0.9) return "blue"
  if (accuracy < 0.98) return "brown"
  return "black"
}

export function beltIndex(belt: Belt): number {
  return BELT_ORDER.indexOf(belt)
}

export interface TableStat {
  table: number
  attempts: number
  correct: number
  accuracy: number
  belt: Belt
}

// Stats for one table (all facts involving that number).
export function computeTableStats(attempts: Attempt[]): Map<number, TableStat> {
  const result = new Map<number, TableStat>()
  for (let t = MIN_FACTOR; t <= MAX_FACTOR; t++) {
    const involved = attempts.filter((a) => a.factorA === t || a.factorB === t)
    const total = involved.length
    const correct = involved.filter((a) => a.correct).length
    const accuracy = total > 0 ? correct / total : 0
    result.set(t, {
      table: t,
      attempts: total,
      correct,
      accuracy,
      belt: beltFor(total, accuracy),
    })
  }
  return result
}
