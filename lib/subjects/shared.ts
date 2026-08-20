// Generic versions of lib/engine.ts's per-fact stats / weighted-selection /
// question-building logic, parameterized by a SubjectEngine instead of
// hard-coding multiplication's commutative factKey/normalizeFact/a*b.
//
// These are NEW functions, not edits to lib/engine.ts — multiplication's
// SubjectEngine (lib/subjects/multiplication.ts) passes in the exact same
// factKey/normalizeFact/weightForFact/distractorsFor lib/engine.ts already
// used, so running multiplication through this generic path produces
// byte-identical results to the original hard-coded functions.

import type { Attempt, FactStat } from "@/lib/engine"
import { weightForFact } from "@/lib/engine"
import type { SubjectEngine, SubjectQuestion } from "./types"

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

// Build per-fact stats from a chronological, subject-scoped attempts log.
// Identical algorithm to lib/engine.ts's computeFactStats, keyed by the
// subject's own factKey/normalizeFact instead of the hard-coded ones.
export function computeFactStatsFor(
  engine: SubjectEngine,
  attempts: Attempt[],
): Map<string, FactStat> {
  const byFact = new Map<string, Attempt[]>()
  const sorted = [...attempts].sort(
    (m, n) => m.createdAt.getTime() - n.createdAt.getTime(),
  )
  for (const at of sorted) {
    const key = engine.factKey(at.factorA, at.factorB)
    if (!byFact.has(key)) byFact.set(key, [])
    byFact.get(key)!.push(at)
  }

  const stats = new Map<string, FactStat>()
  for (const [key, list] of byFact) {
    const [x, y] = engine.normalizeFact(list[0].factorA, list[0].factorB)
    const total = list.length
    const correct = list.filter((a) => a.correct).length
    const accuracy = total > 0 ? correct / total : 0

    let consecWrong = 0
    for (let i = list.length - 1; i >= 0; i--) {
      if (!list[i].correct) consecWrong++
      else break
    }

    const last5 = list.slice(-5)
    const recentMisses = last5.filter((a) => !a.correct).length

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

// Facts currently showing a wrong pattern, subject-aware (correct even for
// non-commutative subjects, unlike lib/insights.ts's trouble-fact
// detection, which is hard-coded to multiplication's commutative factKey
// and would silently reverse a fact like subtraction's 15-8 into a
// nonsensical 8-15). Same "unmastered + wrong pattern" rule used across
// the app's other trouble-fact lists.
export function topWeakFactsFor(
  engine: SubjectEngine,
  stats: Map<string, FactStat>,
  limit: number,
): FactPairResult[] {
  return Array.from(stats.values())
    .filter(
      (s) =>
        !s.mastered &&
        s.attempts > 0 &&
        (s.recentMisses > 0 || s.consecWrong > 0 || s.accuracy < 0.6),
    )
    .sort(
      (a, b) =>
        b.consecWrong - a.consecWrong ||
        b.recentMisses - a.recentMisses ||
        a.accuracy - b.accuracy,
    )
    .slice(0, limit)
    .map((s) => [s.a, s.b])
}

// Weighted random pick across a subject's full fact pool. `boost`, if
// given, multiplies a fact's base weight further (used for division's soft
// nudge toward facts whose multiplication counterpart is already mastered).
export function pickWeightedFactFor(
  engine: SubjectEngine,
  stats: Map<string, FactStat>,
  opts?: { exclude?: Set<string>; boost?: (a: number, b: number) => number },
): FactPairResult {
  const pool = opts?.exclude
    ? engine.allFacts.filter(([x, y]) => !opts.exclude!.has(engine.factKey(x, y)))
    : engine.allFacts
  const facts = pool.length > 0 ? pool : engine.allFacts
  const weights = facts.map(([x, y]) => {
    const base = weightForFact(stats.get(engine.factKey(x, y)))
    return opts?.boost ? base * opts.boost(x, y) : base
  })
  const total = weights.reduce((s, w) => s + w, 0)
  let r = Math.random() * total
  for (let i = 0; i < facts.length; i++) {
    r -= weights[i]
    if (r <= 0) return facts[i]
  }
  return facts[facts.length - 1]
}

type FactPairResult = [number, number]

// Turn a normalized fact into a display Question, using the subject's own
// answer formula and distractor generator. Display order is only
// randomized for commutative subjects (multiplication, addition) — flipping
// a non-commutative fact (division, subtraction) would ask a different
// question.
//
// If the subject implements classifyFact (addition/subtraction), a fact
// may come back as a 'missingOperand' question instead of a plain 'solve'
// one — the equation still shows a+b=c, but the blank is one operand
// rather than the result, and `answer`/`options` describe the blank.
export function makeQuestionFor(
  engine: SubjectEngine,
  fact: [number, number],
): SubjectQuestion {
  const [x, y] = fact
  const flip = engine.commutative && Math.random() < 0.5
  const a = flip ? y : x
  const b = flip ? x : y
  const factKey = engine.factKey(x, y)

  const classification = engine.classifyFact?.(a, b)
  if (classification?.questionKind === "missingOperand" && classification.blankSlot) {
    const displayResult = engine.computeAnswer(a, b)
    const blankSlot = classification.blankSlot
    const blankAnswer = blankSlot === "a" ? a : b
    const distractors =
      engine.distractorsForBlank?.(a, b, blankSlot) ?? engine.distractorsFor(a, b)
    return {
      a,
      b,
      answer: blankAnswer,
      options: shuffle([blankAnswer, ...distractors]),
      factKey,
      questionKind: "missingOperand",
      blankSlot,
      displayResult,
      bandIndex: classification.bandIndex,
      subject: engine.id,
    }
  }

  const answer = engine.computeAnswer(a, b)
  const options = shuffle([answer, ...engine.distractorsFor(a, b)])
  return {
    a,
    b,
    answer,
    options,
    factKey,
    questionKind: "solve",
    bandIndex: classification?.bandIndex,
    subject: engine.id,
  }
}
