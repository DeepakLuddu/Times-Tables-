"use server"

import { db } from "@/lib/db"
import {
  attempts as attemptsTable,
  beltAwards as beltAwardsTable,
  withdrawals as withdrawalsTable,
} from "@/lib/db/schema"
import { type Attempt, type Mode, type TableStat, beltIndex } from "@/lib/engine"
import {
  type BeltPromotion,
  type ParentReport,
  type SessionSummary,
  type TroubleFact,
  allSessionSummaries,
  parentReport,
} from "@/lib/insights"
import { type TableMastery, computeTableMastery } from "@/lib/mastery"
import {
  type PersonalBestDelta,
  computePersonalBests,
  detectNewPersonalBest,
} from "@/lib/personal-bests"
import {
  type EarningAttempt,
  type PiggyBankSummary,
  type WithdrawalEntry,
  computePiggyBank,
  crossedMultiple,
} from "@/lib/piggybank"
import { type DetailedSession, buildSessionLog } from "@/lib/session-log"
import { multiplicationEngine } from "@/lib/subjects/multiplication"
import { getSubjectEngine, SUBJECT_ENGINES } from "@/lib/subjects"
import {
  computeFactStatsFor,
  makeQuestionFor,
  pickWeightedFactFor,
  topWeakFactsFor,
} from "@/lib/subjects/shared"
import type {
  BlankSlot,
  HelpMethod,
  PracticeSubject,
  QuestionKind,
  Subject,
  SubjectQuestion,
} from "@/lib/subjects/types"
import { and, eq } from "drizzle-orm"

const AVAILABLE_SUBJECTS = Object.keys(SUBJECT_ENGINES) as Subject[]
// Mixed Maths unlocks once the child has real experience across most
// subjects — otherwise it'd just be whichever subject they've barely
// touched dominating the mix. Deliberately simple/adjustable, not a hard
// curriculum rule.
const MIXED_MATHS_MIN_ATTEMPTS_PER_SUBJECT = 30
const MIXED_MATHS_MIN_SUBJECTS = 3

async function loadWithdrawals(playerId: string): Promise<WithdrawalEntry[]> {
  if (!playerId) return []
  const rows = await db
    .select()
    .from(withdrawalsTable)
    .where(eq(withdrawalsTable.playerId, playerId))
  return rows.map((r) => ({
    id: r.id,
    amountCents: r.amountCents,
    balanceBeforeCents: r.balanceBeforeCents,
    balanceAfterCents: r.balanceAfterCents,
    createdAt: r.createdAt,
  }))
}

// What the correct-answer celebration needs to animate the coin flying
// into the piggy bank and to decide which milestone banner (if any) fires.
export interface PiggyBankDelta {
  earnedCents: number // 0 or 1 — 0 means this week's cap was already reached
  summary: PiggyBankSummary // authoritative state after this answer
  crossedDime: boolean // lifetime balance just crossed a $0.10 multiple
  crossedDollar: boolean // lifetime balance just crossed a $1.00 multiple
  reachedWeeklyCap: boolean // this answer is what hit the $5/week cap
}

// Load a player's attempts log as engine-ready Attempt objects. Piggy Bank
// and Personal Bests must always call this with no `subject` (they're
// unified across every subject); every mastery-related caller MUST pass a
// `subject` so lib/engine.ts's subject-blind fact-key logic never sees a
// mixed-subject array (a subtraction "7-3" and an addition "3+7" would
// otherwise collapse onto the same fact key).
async function loadAttempts(
  playerId: string,
  subject?: Subject,
): Promise<Attempt[]> {
  if (!playerId) return []
  const rows = await db
    .select()
    .from(attemptsTable)
    .where(
      subject
        ? and(eq(attemptsTable.playerId, playerId), eq(attemptsTable.subject, subject))
        : eq(attemptsTable.playerId, playerId),
    )
  return rows.map((r) => ({
    factorA: r.factorA,
    factorB: r.factorB,
    correct: r.correct,
    mode: r.mode as Mode,
    sessionId: r.sessionId,
    createdAt: r.createdAt,
    answerMs: r.answerMs ?? undefined,
    bandIndex: r.bandIndex,
    subject: r.subject,
  }))
}

// The Piggy Bank only needs {subject, correct, createdAt} — this narrows
// an unfiltered Attempt[] (which always carries a real `subject` string,
// the DB column is NOT NULL) into the stricter EarningAttempt shape.
function toEarningAttempts(attempts: Attempt[]): EarningAttempt[] {
  return attempts.map((a) => ({
    subject: a.subject as Subject,
    correct: a.correct,
    createdAt: a.createdAt,
  }))
}

// Which skill indexes (1-12) this player has already formally earned a
// belt for, within one subject — permanent once granted, regardless of
// later performance. Always subject-scoped: the same skill index (e.g. 7)
// means a different thing per subject, so awards must never be mixed.
async function loadBeltAwards(
  playerId: string,
  subject: Subject,
): Promise<Map<number, Date>> {
  if (!playerId) return new Map()
  const rows = await db
    .select()
    .from(beltAwardsTable)
    .where(
      and(
        eq(beltAwardsTable.playerId, playerId),
        eq(beltAwardsTable.subject, subject),
      ),
    )
  return new Map(rows.map((r) => [r.tableNumber, r.awardedAt]))
}

// Record one answered question. Returns any belt promotions this answer
// triggered for the skill(s) involved, plus the Piggy Bank delta — both
// fuel the correct-answer celebration animation.
export async function recordAttempt(input: {
  playerId: string
  sessionId: string
  mode: Mode
  subject: Subject
  practiceSubject?: PracticeSubject
  a: number
  b: number
  correct: boolean
  answerMs: number
  /** Which of the subject's 12 skill bands this fact came from — addition/subtraction only. */
  bandIndex?: number
  questionKind?: QuestionKind
  blankSlot?: BlankSlot
  /** Which wrong-answer help method this attempt followed, if it was a post-help retry. */
  helpMethod?: HelpMethod
}): Promise<{
  promotions: BeltPromotion[]
  piggyBank: PiggyBankDelta | null
  personalBest: PersonalBestDelta | null
}> {
  if (!input.playerId || !input.sessionId)
    return { promotions: [], piggyBank: null, personalBest: null }

  const engine = getSubjectEngine(input.subject)
  const practiceSubject = input.practiceSubject ?? input.subject

  // Piggy Bank and Personal Bests are unified across every subject, so
  // they always read the FULL (unfiltered) attempts log. Mastery is
  // subject-scoped, so it reads only this subject's attempts.
  const [beforeAll, beforeSubject, withdrawals, awards] = await Promise.all([
    loadAttempts(input.playerId),
    loadAttempts(input.playerId, input.subject),
    loadWithdrawals(input.playerId),
    loadBeltAwards(input.playerId, input.subject),
  ])
  const beforePiggy = computePiggyBank(toEarningAttempts(beforeAll), withdrawals)

  await db.insert(attemptsTable).values({
    playerId: input.playerId,
    sessionId: input.sessionId,
    mode: input.mode,
    subject: input.subject,
    practiceSubject,
    factorA: input.a,
    factorB: input.b,
    correct: input.correct,
    answerMs: Number.isFinite(input.answerMs)
      ? Math.max(0, Math.round(input.answerMs))
      : null,
    bandIndex: input.bandIndex ?? null,
    questionKind: input.questionKind ?? "solve",
    blankSlot: input.blankSlot ?? null,
    helpMethod: input.helpMethod ?? null,
  })

  const newAttempt: Attempt = {
    factorA: input.a,
    factorB: input.b,
    correct: input.correct,
    mode: input.mode,
    sessionId: input.sessionId,
    createdAt: new Date(),
    answerMs: Number.isFinite(input.answerMs) ? input.answerMs : undefined,
    bandIndex: input.bandIndex ?? null,
    subject: input.subject,
  }
  const afterAll = [...beforeAll, newAttempt]
  const afterSubject = [...beforeSubject, newAttempt]
  const afterPiggy = computePiggyBank(toEarningAttempts(afterAll), withdrawals)

  const piggyBank: PiggyBankDelta = {
    earnedCents: afterPiggy.balanceCents - beforePiggy.balanceCents,
    summary: afterPiggy,
    crossedDime: crossedMultiple(
      beforePiggy.balanceCents,
      afterPiggy.balanceCents,
      10,
    ),
    crossedDollar: crossedMultiple(
      beforePiggy.balanceCents,
      afterPiggy.balanceCents,
      100,
    ),
    reachedWeeklyCap:
      beforePiggy.earnedThisWeekCents < beforePiggy.weeklyCapCents &&
      afterPiggy.earnedThisWeekCents >= afterPiggy.weeklyCapCents,
  }

  // Belt tier now comes entirely from the mastery formula (lib/mastery.ts),
  // not raw accuracy. A skill's belt is earned exactly once — the instant
  // every requirement is met, we mint the award right here so it's
  // permanent from this same answer onward.
  const promotions: BeltPromotion[] = []
  const involved = engine.skillsForAttempt({
    factorA: input.a,
    factorB: input.b,
    bandIndex: input.bandIndex ?? null,
  })
  const newlyAwarded: number[] = []
  for (const t of involved) {
    const beforeMastery = computeTableMastery(
      engine,
      t,
      beforeSubject,
      awards.get(t) ?? null,
    )
    let afterAwardedAt = awards.get(t) ?? null
    let afterMastery = computeTableMastery(engine, t, afterSubject, afterAwardedAt)
    // percent === 99 means every requirement just became complete but the
    // belt hasn't been formally awarded yet — award it now.
    if (!afterAwardedAt && afterMastery.percent === 99) {
      afterAwardedAt = new Date()
      newlyAwarded.push(t)
      afterMastery = computeTableMastery(engine, t, afterSubject, afterAwardedAt)
    }
    if (beltIndex(afterMastery.belt) > beltIndex(beforeMastery.belt)) {
      promotions.push({ table: t, belt: afterMastery.belt, subject: input.subject })
    }
  }

  if (newlyAwarded.length > 0) {
    await db
      .insert(beltAwardsTable)
      .values(
        newlyAwarded.map((t) => ({
          playerId: input.playerId,
          subject: input.subject,
          tableNumber: t,
        })),
      )
      .onConflictDoNothing()
  }

  // Personal Bests — a separate, independent record-chasing system (see
  // lib/personal-bests.ts), unified across every subject like Piggy Bank.
  const personalBest = detectNewPersonalBest(
    computePersonalBests(beforeAll),
    computePersonalBests(afterAll),
  )

  return { promotions, piggyBank, personalBest }
}

// Whether Mixed Maths should be unlocked for this player yet.
export async function getMixedMathsEligibility(playerId: string): Promise<boolean> {
  if (!playerId) return false
  const counts = await Promise.all(
    AVAILABLE_SUBJECTS.map(async (s) => (await loadAttempts(playerId, s)).length),
  )
  const qualifyingSubjects = counts.filter(
    (c) => c >= MIXED_MATHS_MIN_ATTEMPTS_PER_SUBJECT,
  ).length
  return qualifyingSubjects >= MIXED_MATHS_MIN_SUBJECTS
}

// Used by Division's "Think it" wrong-answer help (Use Multiplication): a
// soft narrative link only, checking whether the player has independently
// demonstrated the mirrored multiplication fact — never used to shortcut
// division's own mastery, which is still earned entirely separately.
export async function getMultiplicationMasteryFor(
  playerId: string,
  a: number,
  b: number,
): Promise<boolean> {
  if (!playerId) return false
  const attempts = await loadAttempts(playerId, "multiplication")
  const stats = computeFactStatsFor(multiplicationEngine, attempts)
  const [x, y] = multiplicationEngine.normalizeFact(a, b)
  return stats.get(multiplicationEngine.factKey(x, y))?.mastered ?? false
}

// Mixed Maths draws each question from a different subject's own pool,
// weighted toward whichever subject the player is weakest in (lower
// accuracy = more likely to appear) — this is what stops Mixed Maths from
// letting the child predict the operation. Every question keeps its own
// true `subject` (SubjectQuestion.subject), so recordAttempt still credits
// the right subject's mastery/economy exactly like single-subject practice.
async function getMixedQuestions(
  playerId: string,
  count: number,
): Promise<SubjectQuestion[]> {
  const perSubject = await Promise.all(
    AVAILABLE_SUBJECTS.map(async (s) => {
      const engine = getSubjectEngine(s)
      const attempts = await loadAttempts(playerId, s)
      const stats = computeFactStatsFor(engine, attempts)
      const correct = attempts.filter((a) => a.correct).length
      const accuracy = attempts.length > 0 ? correct / attempts.length : 0.5
      return { engine, stats, accuracy }
    }),
  )
  // Baseline floor keeps every subject reachable even at 100% accuracy.
  const weights = perSubject.map((d) => Math.max(0.15, 1 - d.accuracy))
  const totalWeight = weights.reduce((s, w) => s + w, 0)

  const questions: SubjectQuestion[] = []
  for (let i = 0; i < count; i++) {
    let r = Math.random() * totalWeight
    let idx = 0
    for (; idx < weights.length - 1; idx++) {
      r -= weights[idx]
      if (r <= 0) break
    }
    const d = perSubject[idx]
    const fact = pickWeightedFactFor(d.engine, d.stats)
    questions.push(makeQuestionFor(d.engine, fact))
  }
  return questions
}

// Generate a batch of questions using the adaptive engine, scoped to one
// practiceSubject (or drawn across all four for Mixed Maths). On the first
// batch of a sitting, positions 1 and 3 are forced to the most-recently-
// completed session's trouble facts (the closed loop) — Mixed Maths skips
// this closed loop since "the most recent session" isn't well-defined
// across subjects.
export async function getQuestions(
  playerId: string,
  count: number,
  isFirstBatch: boolean,
  practiceSubject: PracticeSubject = "multiplication",
): Promise<SubjectQuestion[]> {
  if (practiceSubject === "mixed") {
    return getMixedQuestions(playerId, count)
  }
  const subject = practiceSubject
  const engine = getSubjectEngine(subject)
  const attempts = await loadAttempts(playerId, subject)
  const stats = computeFactStatsFor(engine, attempts)

  // Division gets a soft nudge toward facts whose multiplication
  // counterpart is already mastered — prior knowledge informs question
  // selection only, never mastery itself (division must still be earned
  // independently).
  let boost: ((a: number, b: number) => number) | undefined
  if (subject === "division") {
    const multAttempts = await loadAttempts(playerId, "multiplication")
    const multStats = computeFactStatsFor(multiplicationEngine, multAttempts)
    boost = (dividend: number, divisor: number) => {
      const quotient = dividend / divisor
      const [x, y] = multiplicationEngine.normalizeFact(divisor, quotient)
      const stat = multStats.get(multiplicationEngine.factKey(x, y))
      return stat?.mastered ? 1.3 : 1
    }
  }

  // Closed-loop trouble-fact review, forced into the first batch's opening
  // positions. Multiplication keeps using lib/insights.ts's session-scoped
  // detection (existing, unchanged behavior); every other subject uses the
  // subject-aware version — lib/insights.ts's factKey is hard-coded
  // commutative and would silently reverse a non-commutative fact (e.g.
  // subtraction's 15-8 becoming a nonsensical 8-15).
  let forced: TroubleFact[] = []
  if (isFirstBatch) {
    if (subject === "multiplication") {
      const summaries = allSessionSummaries(attempts)
      if (summaries.length > 0) forced = summaries[0].troubleFacts
    } else {
      forced = topWeakFactsFor(engine, stats, 2).map(([a, b]) => ({ a, b }))
    }
  }

  const questions: SubjectQuestion[] = []
  const forcedPositions: Record<number, TroubleFact | undefined> = {
    0: forced[0],
    2: forced[1],
  }

  for (let i = 0; i < count; i++) {
    const forcedFact = isFirstBatch ? forcedPositions[i] : undefined
    if (forcedFact) {
      questions.push(
        makeQuestionFor(engine, engine.normalizeFact(forcedFact.a, forcedFact.b)),
      )
    } else {
      questions.push(makeQuestionFor(engine, pickWeightedFactFor(engine, stats, { boost })))
    }
  }
  return questions
}

export interface BeltWallData {
  tables: TableStat[]
  mastery: TableMastery[]
  needsPractice: TroubleFact[]
  sessions: SessionSummary[]
  nextSessionFacts: TroubleFact[]
}

// Everything the Belt Wall / recap screen needs, computed on read, scoped
// to one subject (the Belt Wall shows one subject's 12 skills at a time —
// see the subject tabs in components/belt-wall.tsx).
export async function getBeltWallData(
  playerId: string,
  subject: Subject = "multiplication",
): Promise<BeltWallData> {
  const engine = getSubjectEngine(subject)
  const [attempts, awards] = await Promise.all([
    loadAttempts(playerId, subject),
    loadBeltAwards(playerId, subject),
  ])
  const factStats = computeFactStatsFor(engine, attempts)

  // The old flat per-table accuracy/legacy-belt breakdown isn't rendered
  // anywhere in the current UI (only `mastery`/`needsPractice`/
  // `nextSessionFacts` are) and was multiplication-specific (relied on
  // engine.ts's factorA===t||factorB===t predicate) — left empty for other
  // subjects rather than ported, since porting a genuinely dead field would
  // just be more surface area to keep correct.
  const tables: TableStat[] = []

  const mastery: TableMastery[] = engine.skills.map((s) =>
    computeTableMastery(engine, s.index, attempts, awards.get(s.index) ?? null),
  )

  // Facts that currently need practice: unmastered with a wrong pattern.
  const needsPractice: TroubleFact[] = Array.from(factStats.values())
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
    .slice(0, 12)
    .map((s) => ({ a: s.a, b: s.b }))

  // Same reasoning as getQuestions' forced-facts: lib/insights.ts's session
  // summaries are keyed by engine.ts's commutative factKey, which would
  // silently reverse a non-commutative fact for division/subtraction.
  // `sessions` itself isn't rendered anywhere in the current UI (only
  // `mastery`/`needsPractice`/`nextSessionFacts` are), so it's only worth
  // computing for multiplication, where it's already correct and unchanged.
  const sessions = subject === "multiplication" ? allSessionSummaries(attempts) : []
  const nextSessionFacts =
    subject === "multiplication"
      ? sessions.length > 0
        ? sessions[0].troubleFacts
        : []
      : topWeakFactsFor(engine, factStats, 2).map(([a, b]) => ({ a, b }))

  return { tables, mastery, needsPractice, sessions, nextSessionFacts }
}

// Aggregated report for the parent-facing view.
// NOTE: scoped to multiplication for now — lib/insights.ts's parentReport
// still uses engine.ts's subject-blind fact-key logic internally, so it
// must only ever see one subject's attempts until Phase 5 generalizes it
// to break down every subject (see the plan's filtering rule: unfiltered
// arrays may only reach subject-blind primitives when they're genuinely
// meant to be global, like Piggy Bank/Personal Bests — this isn't that).
export async function getParentReport(
  playerId: string,
): Promise<ParentReport> {
  const attempts = await loadAttempts(playerId, "multiplication")
  return parentReport(attempts)
}

// The detailed, per-session activity log — moved here from the
// child-facing Belt Wall (which now shows Recent Wins instead) since this
// raw level of detail is what a parent reviewing progress actually wants.
// NOTE: scoped to multiplication for now, same reason as getParentReport.
export async function getSessionLog(
  playerId: string,
): Promise<DetailedSession[]> {
  const [attempts, allAttempts, awards] = await Promise.all([
    loadAttempts(playerId, "multiplication"),
    loadAttempts(playerId),
    loadBeltAwards(playerId, "multiplication"),
  ])
  return buildSessionLog(attempts, awards, toEarningAttempts(allAttempts))
}
