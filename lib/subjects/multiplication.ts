// Multiplication's SubjectEngine — a thin wrapper around the pre-existing
// lib/engine.ts functions. Nothing about multiplication's computation is
// reimplemented here, so its behavior is guaranteed identical to before
// this multi-subject extension existed.

import {
  ALL_FACTS,
  distractorsFor,
  explainFact,
  factKey,
  normalizeFact,
} from "@/lib/engine"
import type { FactPair, SkillAttemptRow, SubjectEngine } from "./types"

const SKILLS = Array.from({ length: 12 }, (_, i) => ({
  index: i + 1,
  label: `${i + 1} Times Table`,
}))

// The 12 facts that make up one table — identical to mastery.ts's old
// ALL_PARTNERS loop (normalizeFact(table, partner) for partner 1..12).
function factUniverse(table: number): FactPair[] {
  return Array.from({ length: 12 }, (_, i) => normalizeFact(table, i + 1))
}

export const multiplicationEngine: SubjectEngine = {
  id: "multiplication",
  label: "Multiplication",
  skills: SKILLS,
  allFacts: ALL_FACTS,
  commutative: true,
  factUniverse,
  // Dual membership: fact 7×8 belongs to both the 7s and 8s tables — the
  // exact rule dojo.ts's recordAttempt has always used.
  skillsForAttempt: (row: SkillAttemptRow) =>
    row.factorA === row.factorB ? [row.factorA] : [row.factorA, row.factorB],
  factKey,
  normalizeFact,
  computeAnswer: (a, b) => a * b,
  distractorsFor,
  formatFact: (a, b) => `${a} × ${b}`,
  skillLabel: (i) => `${i} Times Table`,
  explainFact,
}
