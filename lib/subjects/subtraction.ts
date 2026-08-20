// Subtraction's SubjectEngine — mirrors addition.ts's generator-defined,
// claim-priority band structure, but subtraction is NOT commutative
// (15-8 ≠ 8-15) so facts are stored unswapped as [minuend, subtrahend] and
// display order is never randomized (see shared.ts's makeQuestionFor).
// Every generated fact keeps the minuend >= subtrahend (no negative
// results) — appropriate for the target age range.

import type {
  BlankSlot,
  FactPair,
  QuestionKind,
  SkillAttemptRow,
  SubjectEngine,
} from "./types"

interface RawBand {
  index: number
  label: string
  generate: () => FactPair[]
  questionKind: QuestionKind
}

function range(from: number, to: number): number[] {
  const out: number[] = []
  for (let i = from; i <= to; i++) out.push(i)
  return out
}

// ---- Band generators — all [minuend, subtrahend], minuend >= subtrahend ----

function within10Gen(): FactPair[] {
  const facts: FactPair[] = []
  for (let a = 1; a <= 10; a++) {
    for (let b = 1; b < a; b++) facts.push([a, b])
  }
  return facts
}

function within20Gen(): FactPair[] {
  const facts: FactPair[] = []
  for (let a = 11; a <= 20; a++) {
    for (let b = 1; b < a; b++) facts.push([a, b])
  }
  return facts
}

// "Inverse facts": the subtraction inverse of an addition doubles fact
// (n+n=2n implies 2n-n=n) — a genuinely distinct, well-defined band rather
// than a vague relabeling of "subtracting from 10".
function inverseDoublesGen(): FactPair[] {
  return range(1, 12).map((n) => [2 * n, n])
}

function subtractingFrom10Gen(): FactPair[] {
  return range(1, 9).map((b) => [10, b])
}

function subtractingFrom20Gen(): FactPair[] {
  return range(1, 19).map((b) => [20, b])
}

function subtractingTensGen(): FactPair[] {
  const facts: FactPair[] = []
  const tens = [20, 30, 40, 50, 60, 70, 80, 90]
  for (let i = 0; i < 12; i++) {
    facts.push([tens[i % tens.length], 10 * (1 + (i % (tens.length - 1)))])
  }
  return facts
}

function twoDigitNoRegroupGen(): FactPair[] {
  const facts: FactPair[] = []
  for (let i = 0; i < 12; i++) {
    const a = 30 + i * 6
    const unitsA = a % 10
    const unitsB = Math.min(unitsA, (i % 5) + 1) // units(b) <= units(a): no borrow
    const tensB = 1 + (i % (Math.floor(a / 10) - 1 || 1))
    facts.push([a, tensB * 10 + unitsB])
  }
  return facts
}

function twoDigitRegroupGen(): FactPair[] {
  const facts: FactPair[] = []
  for (let i = 0; i < 12; i++) {
    const a = 30 + i * 6
    const unitsA = a % 10
    const unitsB = Math.min(9, unitsA + 1 + (i % 3)) // units(b) > units(a): forces borrow
    const tensB = 1 + (i % (Math.floor(a / 10) - 1 || 1))
    facts.push([a, tensB * 10 + unitsB])
  }
  return facts
}

function missingNumberGen(): FactPair[] {
  const facts: FactPair[] = []
  for (let b = 1; b <= 14; b++) {
    facts.push([b + Math.max(1, 20 - b - (b % 5)), b])
  }
  return facts
}

function mentalStrategiesGen(): FactPair[] {
  const facts: FactPair[] = []
  for (let i = 0; i < 12; i++) {
    facts.push([58 + i * 4, 14 + i * 3])
  }
  return facts
}

function mixedSubtractionGen(): FactPair[] {
  const facts: FactPair[] = []
  for (let i = 0; i < 12; i++) {
    facts.push([45 + i * 3, 9 + (i % 8)])
  }
  return facts
}

function mixedMasteryGen(): FactPair[] {
  const facts: FactPair[] = []
  for (let i = 0; i < 14; i++) {
    facts.push([70 + i * 4, 18 + (i % 11)])
  }
  return facts
}

const CLAIM_PRIORITY: RawBand[] = [
  { index: 3, label: "Number bonds / inverse facts", generate: inverseDoublesGen, questionKind: "solve" },
  { index: 4, label: "Subtracting from 10", generate: subtractingFrom10Gen, questionKind: "solve" },
  { index: 5, label: "Subtracting from 20", generate: subtractingFrom20Gen, questionKind: "solve" },
  { index: 6, label: "Subtracting tens", generate: subtractingTensGen, questionKind: "solve" },
  {
    index: 7,
    label: "Two-digit subtraction without regrouping",
    generate: twoDigitNoRegroupGen,
    questionKind: "solve",
  },
  {
    index: 8,
    label: "Two-digit subtraction with regrouping",
    generate: twoDigitRegroupGen,
    questionKind: "solve",
  },
  {
    index: 9,
    label: "Missing-number subtraction",
    generate: missingNumberGen,
    questionKind: "missingOperand",
  },
  {
    index: 10,
    label: "Mental subtraction strategies",
    generate: mentalStrategiesGen,
    questionKind: "solve",
  },
  { index: 11, label: "Mixed subtraction", generate: mixedSubtractionGen, questionKind: "solve" },
  { index: 12, label: "Mixed subtraction mastery", generate: mixedMasteryGen, questionKind: "solve" },
  { index: 1, label: "Facts within 10", generate: within10Gen, questionKind: "solve" },
  { index: 2, label: "Facts within 20", generate: within20Gen, questionKind: "solve" },
]

// Non-commutative: never reorder — (15,8) and (8,15) are different facts
// (and 8-15 wouldn't even be a valid kid-facing question).
function normalizeFact(a: number, b: number): FactPair {
  return [a, b]
}
function factKey(a: number, b: number): string {
  return `${a}-${b}`
}

const factToBand = new Map<string, RawBand>()
const bandFacts = new Map<number, FactPair[]>()
for (const band of CLAIM_PRIORITY) {
  const claimed: FactPair[] = []
  for (const [a, b] of band.generate()) {
    const key = factKey(a, b)
    if (factToBand.has(key)) continue
    factToBand.set(key, band)
    claimed.push([a, b])
  }
  bandFacts.set(band.index, claimed)
}

const SKILLS = range(1, 12).map((index) => ({
  index,
  label: CLAIM_PRIORITY.find((b) => b.index === index)!.label,
}))

const ALL_SUBTRACTION_FACTS: FactPair[] = Array.from(factToBand.keys()).map((key) => {
  const [a, b] = key.split("-").map(Number)
  return [a, b]
})

function distractorsForSubtraction(a: number, b: number): number[] {
  const correct = a - b
  const candidates = [correct + 1, correct - 1, correct + 10, correct - 10, b, a]
  const unique = Array.from(new Set(candidates)).filter((v) => v >= 0 && v !== correct)
  const picked = [...unique].sort(() => Math.random() - 0.5).slice(0, 3)
  let pad = correct + 2
  while (picked.length < 3) {
    if (pad !== correct && pad >= 0 && !picked.includes(pad)) picked.push(pad)
    pad++
  }
  return picked
}

function distractorsForBlankSubtraction(a: number, b: number, blankSlot: BlankSlot): number[] {
  const blankValue = blankSlot === "a" ? a : b
  const candidates = [blankValue + 1, blankValue - 1, blankValue + 2, blankValue - 2]
  const unique = Array.from(new Set(candidates)).filter((v) => v >= 0 && v !== blankValue)
  const picked = [...unique].sort(() => Math.random() - 0.5).slice(0, 3)
  let pad = blankValue + 3
  while (picked.length < 3) {
    if (pad !== blankValue && pad >= 0 && !picked.includes(pad)) picked.push(pad)
    pad++
  }
  return picked
}

export const subtractionEngine: SubjectEngine = {
  id: "subtraction",
  label: "Subtraction",
  skills: SKILLS,
  allFacts: ALL_SUBTRACTION_FACTS,
  commutative: false,
  factUniverse: (skillIndex) => bandFacts.get(skillIndex) ?? [],
  skillsForAttempt: (row: SkillAttemptRow) => (row.bandIndex != null ? [row.bandIndex] : []),
  factKey,
  normalizeFact,
  computeAnswer: (a, b) => a - b,
  distractorsFor: distractorsForSubtraction,
  formatFact: (a, b) => `${a} - ${b}`,
  skillLabel: (i) => SKILLS.find((s) => s.index === i)?.label ?? `Band ${i}`,
  classifyFact: (a, b) => {
    const band = factToBand.get(factKey(a, b))
    if (!band) return { bandIndex: 1, questionKind: "solve" }
    if (band.questionKind === "missingOperand") {
      return {
        bandIndex: band.index,
        questionKind: "missingOperand",
        blankSlot: Math.random() < 0.5 ? "a" : "b",
      }
    }
    return { bandIndex: band.index, questionKind: "solve" }
  },
  distractorsForBlank: distractorsForBlankSubtraction,
}
