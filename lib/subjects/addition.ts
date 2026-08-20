// Addition's SubjectEngine. Unlike multiplication/division, addition's 12
// "skill bands" aren't a single times-table-style number line — they're
// named curriculum stages (facts within 10, doubles, two-digit with
// regrouping, ...) whose fact pools are defined by GENERATORS, not derived
// by classifying (a,b) after the fact. Two bands genuinely overlap in raw
// number space (5+5 is both a "double" and a "fact within 10"), so each
// fact is greedily claimed by the most specific applicable band — see
// CLAIM_PRIORITY below — and that claim is fixed for both the adaptive
// pool and mastery's fact-coverage accounting.

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

// ---- Band generators ----

function doublesGen(): FactPair[] {
  return range(1, 12).map((n) => [n, n])
}

function nearDoublesGen(): FactPair[] {
  return range(1, 12).map((n) => [n, n + 1])
}

function bondsTo10Gen(): FactPair[] {
  return range(1, 9).map((a) => [a, 10 - a])
}

function bondsTo20Gen(): FactPair[] {
  return range(1, 19).map((a) => [a, 20 - a])
}

function addingTensGen(): FactPair[] {
  const tens = [10, 20, 30, 40, 50, 60, 70, 80, 90]
  const facts: FactPair[] = []
  for (let i = 0; i < 12; i++) {
    facts.push([tens[i % tens.length], (i % 9) + 1])
  }
  return facts
}

function twoDigitNoRegroupGen(): FactPair[] {
  const facts: FactPair[] = []
  for (let i = 0; i < 12; i++) {
    const a = 10 + i * 6 // 10, 16, 22, ... spread across the two-digit range
    const unitsA = a % 10
    const unitsB = Math.max(0, 9 - unitsA - (i % 3)) // keep units(a)+units(b) <= 9
    const tensB = 1 + (i % 7)
    facts.push([a, tensB * 10 + unitsB])
  }
  return facts
}

function twoDigitRegroupGen(): FactPair[] {
  const facts: FactPair[] = []
  for (let i = 0; i < 12; i++) {
    const a = 10 + i * 6
    const unitsA = (a % 10) + 5 <= 9 ? (a % 10) + 5 : a % 10 // bias toward big units digits
    const base = 10 - unitsA + 5 + (i % 4) // pushes units(a)+units(b) >= 10
    const unitsB = Math.min(9, Math.max(1, base))
    const tensB = 1 + (i % 7)
    facts.push([Math.floor(a / 10) * 10 + unitsA, tensB * 10 + unitsB])
  }
  return facts
}

function missingNumberGen(): FactPair[] {
  const facts: FactPair[] = []
  for (let a = 1; a <= 14; a++) {
    facts.push([a, Math.max(1, 20 - a - (a % 5))])
  }
  return facts
}

function mentalStrategiesGen(): FactPair[] {
  const facts: FactPair[] = []
  for (let i = 0; i < 12; i++) {
    facts.push([23 + i * 5, 14 + i * 3])
  }
  return facts
}

function mixedMasteryGen(): FactPair[] {
  const facts: FactPair[] = []
  for (let i = 0; i < 14; i++) {
    facts.push([31 + i * 4, 27 - (i % 9)])
  }
  return facts
}

function within10Gen(): FactPair[] {
  const facts: FactPair[] = []
  for (let a = 0; a <= 10; a++) {
    for (let b = a; b <= 10; b++) {
      // Exclude the degenerate 0+0 — "adding zero" (e.g. 0+7) is still a
      // legitimate identity-property fact worth keeping.
      if (a + b <= 10 && a + b > 0) facts.push([a, b])
    }
  }
  return facts
}

function within20Gen(): FactPair[] {
  const facts: FactPair[] = []
  for (let a = 0; a <= 19; a++) {
    for (let b = a; b <= 19; b++) {
      if (a + b > 10 && a + b <= 20) facts.push([a, b])
    }
  }
  return facts
}

// Most specific/narrow bands claim their facts first; the two broad
// "facts within N" bands mop up whatever's left in their range. Skill
// *display* order (1-12) is unrelated to this claim order — see SKILL_LABELS.
const CLAIM_PRIORITY: RawBand[] = [
  { index: 5, label: "Doubles", generate: doublesGen, questionKind: "solve" },
  { index: 6, label: "Near doubles", generate: nearDoublesGen, questionKind: "solve" },
  { index: 3, label: "Number bonds to 10", generate: bondsTo10Gen, questionKind: "solve" },
  { index: 4, label: "Number bonds to 20", generate: bondsTo20Gen, questionKind: "solve" },
  { index: 7, label: "Adding tens", generate: addingTensGen, questionKind: "solve" },
  {
    index: 8,
    label: "Two-digit addition without regrouping",
    generate: twoDigitNoRegroupGen,
    questionKind: "solve",
  },
  {
    index: 9,
    label: "Two-digit addition with regrouping",
    generate: twoDigitRegroupGen,
    questionKind: "solve",
  },
  {
    index: 10,
    label: "Missing-number addition",
    generate: missingNumberGen,
    questionKind: "missingOperand",
  },
  {
    index: 11,
    label: "Mental addition strategies",
    generate: mentalStrategiesGen,
    questionKind: "solve",
  },
  { index: 12, label: "Mixed addition mastery", generate: mixedMasteryGen, questionKind: "solve" },
  { index: 1, label: "Facts within 10", generate: within10Gen, questionKind: "solve" },
  { index: 2, label: "Facts within 20", generate: within20Gen, questionKind: "solve" },
]

function normalizeFact(a: number, b: number): FactPair {
  return a <= b ? [a, b] : [b, a]
}
function factKey(a: number, b: number): string {
  const [x, y] = normalizeFact(a, b)
  return `${x}+${y}`
}

// ---- Build the claimed (non-overlapping) per-band fact universe ----

const factToBand = new Map<string, RawBand>()
const bandFacts = new Map<number, FactPair[]>()
for (const band of CLAIM_PRIORITY) {
  const claimed: FactPair[] = []
  for (const [rawA, rawB] of band.generate()) {
    const [x, y] = normalizeFact(rawA, rawB)
    const key = factKey(x, y)
    if (factToBand.has(key)) continue
    factToBand.set(key, band)
    claimed.push([x, y])
  }
  bandFacts.set(band.index, claimed)
}

const SKILLS = range(1, 12).map((index) => ({
  index,
  label: CLAIM_PRIORITY.find((b) => b.index === index)!.label,
}))

const ALL_ADDITION_FACTS: FactPair[] = Array.from(factToBand.keys()).map((key) => {
  const [x, y] = key.split("+").map(Number)
  return [x, y]
})

function distractorsForAddition(a: number, b: number): number[] {
  const correct = a + b
  const candidates = [correct + 1, correct - 1, correct + 10, correct - 10, a, b]
  const unique = Array.from(new Set(candidates)).filter((v) => v >= 0 && v !== correct)
  const picked = [...unique].sort(() => Math.random() - 0.5).slice(0, 3)
  let pad = correct + 2
  while (picked.length < 3) {
    if (pad !== correct && pad >= 0 && !picked.includes(pad)) picked.push(pad)
    pad++
  }
  return picked
}

function distractorsForBlankAddition(a: number, b: number, blankSlot: BlankSlot): number[] {
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

export const additionEngine: SubjectEngine = {
  id: "addition",
  label: "Addition",
  skills: SKILLS,
  allFacts: ALL_ADDITION_FACTS,
  commutative: true,
  factUniverse: (skillIndex) => bandFacts.get(skillIndex) ?? [],
  skillsForAttempt: (row: SkillAttemptRow) => (row.bandIndex != null ? [row.bandIndex] : []),
  factKey,
  normalizeFact,
  computeAnswer: (a, b) => a + b,
  distractorsFor: distractorsForAddition,
  formatFact: (a, b) => `${a} + ${b}`,
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
  distractorsForBlank: distractorsForBlankAddition,
}
