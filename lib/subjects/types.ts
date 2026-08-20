// Shared contract every subject (multiplication, division, addition,
// subtraction) implements, so the mastery engine, adaptive engine, and
// question generator can operate generically instead of hard-coding
// "times table" assumptions everywhere.
//
// Multiplication's implementation (lib/subjects/multiplication.ts) is a
// thin wrapper around the pre-existing lib/engine.ts functions — nothing
// about multiplication's actual computation changes.

export type Subject = "multiplication" | "division" | "addition" | "subtraction"
export type PracticeSubject = Subject | "mixed"

// 'solve': normal "a OP b = ?" (the blank is the result — every subject
// supports this). 'missingOperand': "a OP ? = c" or "? OP b = c" — only
// addition/subtraction's dedicated bands use this; the blank is one of the
// operands, not the result.
export type QuestionKind = "solve" | "missingOperand"
export type BlankSlot = "a" | "b"

// Which wrong-answer teaching method (see components/help/) a retry
// attempt followed — a soft signal for future recommendations, never a
// fixed "learning style" label. Addition/Subtraction/Division only;
// multiplication keeps its separate FactVisuals experience untouched.
export type HelpMethod = "see" | "move" | "think"

export interface SubjectQuestion {
  a: number
  b: number
  /** The value the child is solving for — the result for 'solve', the blanked operand for 'missingOperand'. */
  answer: number
  options: number[]
  factKey: string
  questionKind: QuestionKind
  blankSlot?: BlankSlot
  /** For 'missingOperand' questions, the fixed right-hand side shown in the equation (a+b, computed before blanking). */
  displayResult?: number
  /** Which of the subject's 12 skill bands this fact was drawn from, if the subject uses bands (addition/subtraction). */
  bandIndex?: number
  /** The real skill domain this question belongs to — always one of the 4 real subjects, set by makeQuestionFor. In Mixed Maths this varies question-to-question even though practiceSubject stays 'mixed'. */
  subject: Subject
}

export const SUBJECTS: Subject[] = [
  "multiplication",
  "division",
  "addition",
  "subtraction",
]

// A fact pair as stored/displayed: [a, b]. For non-commutative subjects the
// order is meaningful (division: [dividend, divisor]; subtraction:
// [minuend, subtrahend]) and must never be swapped.
export type FactPair = [number, number]

export interface SkillDef {
  /** 1-12 — a times table, a "divide by N", or an addition/subtraction band. */
  index: number
  label: string
}

// The minimal shape of a logged attempt needed to work out which skill(s)
// it counts toward.
export interface SkillAttemptRow {
  factorA: number
  factorB: number
  bandIndex: number | null
}

export interface SubjectEngine {
  id: Subject
  label: string
  /** Always 12 skill units, one per subject-specific pathway. */
  skills: SkillDef[]
  /** The subject's full adaptive practice pool (mirrors engine.ts's ALL_FACTS). */
  allFacts: FactPair[]
  /** Whether (a,b) and (b,a) represent the same fact — true for +/×, false for −/÷. */
  commutative: boolean

  /** All facts belonging to one skill unit, for mastery's coverage/weak-facts components. */
  factUniverse(skillIndex: number): FactPair[]
  /** Which skill unit(s) a specific attempt counts toward (1 or 2 for multiplication, 1 otherwise). */
  skillsForAttempt(row: SkillAttemptRow): number[]

  factKey(a: number, b: number): string
  normalizeFact(a: number, b: number): FactPair
  computeAnswer(a: number, b: number): number
  distractorsFor(a: number, b: number): number[]
  /** "8 × 7" / "56 ÷ 7" / "8 + 7" / "15 - 8" */
  formatFact(a: number, b: number): string
  skillLabel(skillIndex: number): string
  explainFact?(a: number, b: number): string[]

  /**
   * Only defined by band-based subjects (addition/subtraction): looks up
   * which band a fact belongs to and whether it's a 'missingOperand' band.
   * Absent for multiplication/division, which always produce plain 'solve'
   * questions with no band classification needed at question-build time.
   */
  classifyFact?(
    a: number,
    b: number,
  ): { bandIndex: number; questionKind: QuestionKind; blankSlot?: BlankSlot }
  /** For 'missingOperand' facts, generate plausible wrong guesses for the blanked operand (not the result). */
  distractorsForBlank?(a: number, b: number, blankSlot: BlankSlot): number[]
}
