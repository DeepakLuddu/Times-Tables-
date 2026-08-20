// Division's SubjectEngine. Division is NOT commutative (56÷7 ≠ 7÷56), so
// unlike multiplication:
//   - facts are stored unswapped as [dividend, divisor] — factKey/
//     normalizeFact never reorder the pair
//   - display order is never randomly flipped (see shared.ts's makeQuestionFor)
//   - a fact belongs to exactly ONE skill (its divisor), not two
//
// Division mastery is earned entirely independently of multiplication —
// nothing here reads multiplication data. The soft "your 7×8 knowledge
// helped" nudge lives in app/actions/dojo.ts's getQuestions, one layer up,
// since it needs the player's multiplication attempts too (which a single
// SubjectEngine shouldn't need to know about).

import type { FactPair, SkillAttemptRow, SubjectEngine } from "./types"

const MIN_DIVISOR = 1
const MAX_DIVISOR = 12
const MIN_QUOTIENT = 1
const MAX_QUOTIENT = 12

const SKILLS = Array.from({ length: 12 }, (_, i) => ({
  index: i + 1,
  label: `Divide by ${i + 1}`,
}))

// All 144 (dividend, divisor) pairs: for each divisor 1-12, the 12
// quotients 1-12 give 12 distinct dividends — mirrors multiplication's
// "12 facts per table" shape so mastery's weight proportions carry over
// unchanged, even though the total pool is bigger (no commutative collapse).
export const ALL_DIVISION_FACTS: FactPair[] = (() => {
  const facts: FactPair[] = []
  for (let divisor = MIN_DIVISOR; divisor <= MAX_DIVISOR; divisor++) {
    for (let quotient = MIN_QUOTIENT; quotient <= MAX_QUOTIENT; quotient++) {
      facts.push([divisor * quotient, divisor])
    }
  }
  return facts
})()

function factUniverse(divisor: number): FactPair[] {
  return Array.from({ length: MAX_QUOTIENT }, (_, i) => [
    divisor * (i + 1),
    divisor,
  ])
}

// Division-shaped misconceptions: off-by-one on the quotient, confusing the
// quotient with the divisor itself, or subtracting instead of dividing.
function distractorsForDivision(dividend: number, divisor: number): number[] {
  const quotient = dividend / divisor
  const candidates = [
    quotient + 1,
    quotient - 1,
    quotient + divisor,
    quotient - divisor,
    divisor,
    dividend - divisor,
  ]
  const unique = Array.from(new Set(candidates)).filter(
    (v) => v > 0 && v !== quotient,
  )
  const shuffled = [...unique].sort(() => Math.random() - 0.5)
  const picked = shuffled.slice(0, 3)
  let pad = quotient + 1
  while (picked.length < 3) {
    if (pad !== quotient && pad > 0 && !picked.includes(pad)) picked.push(pad)
    pad++
  }
  return picked
}

export const divisionEngine: SubjectEngine = {
  id: "division",
  label: "Division",
  skills: SKILLS,
  allFacts: ALL_DIVISION_FACTS,
  commutative: false,
  factUniverse,
  // Single membership: 56÷7 belongs only to "Divide by 7", never "Divide by 8".
  skillsForAttempt: (row: SkillAttemptRow) => [row.factorB],
  factKey: (a, b) => `${a}/${b}`,
  normalizeFact: (a, b) => [a, b],
  computeAnswer: (a, b) => a / b,
  distractorsFor: distractorsForDivision,
  formatFact: (a, b) => `${a} ÷ ${b}`,
  skillLabel: (i) => `Divide by ${i}`,
}
