"use client"

import { getMixedMathsEligibility, getQuestions, recordAttempt } from "@/app/actions/dojo"
import { addPracticeTime, getPiggyBankState, getPracticeTimeToday } from "@/app/actions/piggybank"
import {
  AnswerCelebration,
  isMilestoneStreak,
  type CelebrationData,
} from "@/components/answer-celebration"
import { BeltPromotion } from "@/components/belt-promotion"
import { FactVisuals } from "@/components/fact-visuals"
import { AdditionHelp } from "@/components/help/AdditionHelp"
import { DivisionHelp } from "@/components/help/DivisionHelp"
import { HelpChooser } from "@/components/help/HelpChooser"
import { SubtractionHelp } from "@/components/help/SubtractionHelp"
import { buildAdditionHelp } from "@/lib/help/addition-help"
import { buildDivisionHelp } from "@/lib/help/division-help"
import { buildSubtractionHelp } from "@/lib/help/subtraction-help"
import { PersonalBestCelebration } from "@/components/personal-best-celebration"
import { DAILY_GOAL_SECONDS, PiggyBank } from "@/components/piggy-bank"
import {
  PiggyCelebration,
  type PiggyCelebrationData,
} from "@/components/piggy-celebration"
import type { Mode } from "@/lib/engine"
import type { BeltPromotion as BeltPromotionData } from "@/lib/insights"
import type { PersonalBestDelta } from "@/lib/personal-bests"
import { getPlayerId, newSessionId } from "@/lib/player"
import {
  type PiggyBankSummary,
  type WeeklyEarningsBucket,
  WEEKLY_CAP_CENTS,
  allocateOneAnswer,
  localDateKey,
} from "@/lib/piggybank"
import { getSubjectEngine } from "@/lib/subjects"
import type {
  HelpMethod,
  PracticeSubject,
  Subject,
  SubjectQuestion,
} from "@/lib/subjects/types"
import { cn } from "@/lib/utils"
import { Flame, House } from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"

const OPERATOR_SYMBOL: Record<Subject, string> = {
  multiplication: "×",
  division: "÷",
  addition: "+",
  subtraction: "−",
}

const BATCH = 12
const SPRINT_SECONDS = 60
const FLASH_MS = 650
// How long a wrong answer stays on screen (correct answer highlighted)
// before auto-advancing, for subjects without a FactVisuals-style review.
const WRONG_ANSWER_PAUSE_MS = 1800
// Correct answers that land on a streak milestone get a slightly longer
// beat so the "5 STREAK!" banner has time to read before the next question.
const MILESTONE_FLASH_MS = 900
// The kid should never be left staring at a page with no interaction for
// this long and still have it count as "active practice."
const IDLE_MS = 30_000
// How often accumulated active seconds get persisted to the server.
const PRACTICE_FLUSH_MS = 8_000

// Subjects with a wrong-answer "See it / Move it / Think it" teaching flow
// (components/help/) — multiplication keeps its separate, untouched
// FactVisuals experience. Extend hasHelpFlow/renderHelpWidget/
// recommendedHelpMethod together as each subject's widget is built.
function hasHelpFlow(subject: Subject): boolean {
  return subject === "addition" || subject === "subtraction" || subject === "division"
}

function recommendedHelpMethod(
  subject: Subject,
  a: number,
  b: number,
  bandIndex?: number,
): HelpMethod | null {
  if (subject === "addition") return buildAdditionHelp(a, b).recommended
  if (subject === "subtraction") return buildSubtractionHelp(a, b, bandIndex).recommended
  if (subject === "division") return buildDivisionHelp(a, b).recommended
  return null
}

const EMPTY_WEEKLY_BREAKDOWN: WeeklyEarningsBucket = {
  bySubjectCents: { multiplication: 0, division: 0, addition: 0, subtraction: 0 },
  flexibleCents: 0,
  totalCents: 0,
}

const EMPTY_PIGGY: PiggyBankSummary = {
  balanceCents: 0,
  earnedThisWeekCents: 0,
  weeklyCapCents: WEEKLY_CAP_CENTS,
  weekStart: "",
  totalCorrect: 0,
  correctThisWeek: 0,
  currentStreak: 0,
  bestStreak: 0,
  withdrawals: [],
  weeklyBreakdown: EMPTY_WEEKLY_BREAKDOWN,
}

type Status = "idle" | "correct" | "wrong"

export function GameBoard({
  mode,
  practiceSubject = "multiplication",
}: {
  mode: Mode
  practiceSubject?: PracticeSubject
}) {
  const [playerId, setPlayerId] = useState("")
  const sessionIdRef = useRef("")
  const [questions, setQuestions] = useState<SubjectQuestion[]>([])
  const [idx, setIdx] = useState(0)
  const [status, setStatus] = useState<Status>("idle")
  const [chosen, setChosen] = useState<number | null>(null)
  // After a wrong answer we pause and show pickable visuals; the kid taps to
  // continue when they're ready. Multiplication-only (FactVisuals).
  const [reviewing, setReviewing] = useState(false)
  // The "See it / Move it / Think it" teaching flow for Addition/
  // Subtraction/Division — a separate state machine from `reviewing`.
  // "closed": normal idle/correct/wrong flow. "choosing": the method
  // picker is shown. "teaching": the chosen method's interactive widget is
  // shown. Retry itself isn't a distinct stage — once the widget's one
  // required step is solved, helpStage goes straight back to "closed" and
  // the same question (idx unchanged) becomes answerable again.
  const [helpStage, setHelpStage] = useState<"closed" | "choosing" | "teaching">(
    "closed",
  )
  // Which method the child picked — kept set through the retry tap itself
  // (only advance() clears it) so recordAttempt can tag the retry attempt
  // with it. Also doubles as "have we already had one help round for this
  // question" (a wrong retry falls back to the plain highlight-and-advance
  // instead of reopening the chooser — one round only, see handleAnswer).
  const [helpMethod, setHelpMethod] = useState<HelpMethod | null>(null)
  const [streak, setStreak] = useState(0)
  const [answered, setAnswered] = useState(0)
  const [correctCount, setCorrectCount] = useState(0)

  // Sprint state
  const [timeLeft, setTimeLeft] = useState(SPRINT_SECONDS)
  const [finished, setFinished] = useState(false)

  // Belt promotion celebration queue.
  const [promoQueue, setPromoQueue] = useState<BeltPromotionData[]>([])
  const promotion = promoQueue[0] ?? null

  // Correct-answer celebration (star burst + "+1" flying toward the streak
  // badge, plus a bigger banner at streak milestones).
  const [celebration, setCelebration] = useState<CelebrationData | null>(null)
  const streakBadgeRef = useRef<HTMLDivElement>(null)

  // Piggy Bank: balance/weekly-earned/streaks (persisted, computed on the
  // server from the attempts log) plus the coin-fly celebration.
  const [piggy, setPiggy] = useState<PiggyBankSummary | null>(null)
  const [piggyBounceKey, setPiggyBounceKey] = useState(0)
  const [piggyCelebration, setPiggyCelebration] =
    useState<PiggyCelebrationData | null>(null)
  const piggyRef = useRef<HTMLDivElement>(null)

  // Personal Bests: a separate record-chasing system from belts/Piggy Bank
  // (see lib/personal-bests.ts). Cleared on its own timer, independent of
  // answer-advance, so it never slows the game down.
  const [personalBestCelebration, setPersonalBestCelebration] =
    useState<PersonalBestDelta | null>(null)

  // Today's active-practice seconds, toward the 15-minute goal. Only ticks
  // while this tab is visible and the kid has interacted recently.
  const [todaySeconds, setTodaySeconds] = useState(0)
  const lastActivityRef = useRef(Date.now())
  const pendingSecondsRef = useRef(0)

  // When the current question appeared, for the Belt Wall fluency component
  // (time from question shown to answer submitted).
  const questionShownAtRef = useRef(Date.now())

  const fetchingRef = useRef(false)
  const startedRef = useRef(false)

  // Mixed Maths eligibility gate — null while unknown/loading, otherwise
  // whether the child has enough cross-subject experience yet (see
  // getMixedMathsEligibility in app/actions/dojo.ts). Every other subject
  // is always eligible.
  const [mixedEligible, setMixedEligible] = useState<boolean | null>(
    practiceSubject === "mixed" ? null : true,
  )

  const startSitting = useCallback(async (pid: string) => {
    sessionIdRef.current = newSessionId()
    setQuestions([])
    setIdx(0)
    setStatus("idle")
    setChosen(null)
    setReviewing(false)
    setHelpStage("closed")
    setHelpMethod(null)
    setStreak(0)
    setAnswered(0)
    setCorrectCount(0)
    setTimeLeft(SPRINT_SECONDS)
    setFinished(false)
    setPromoQueue([])
    setCelebration(null)
    setPiggyCelebration(null)
    setPersonalBestCelebration(null)
    const first = await getQuestions(pid, BATCH, true, practiceSubject)
    setQuestions(first)
  }, [practiceSubject])

  useEffect(() => {
    const pid = getPlayerId()
    setPlayerId(pid)
    if (!startedRef.current) {
      startedRef.current = true
      if (practiceSubject === "mixed") {
        void getMixedMathsEligibility(pid).then((eligible) => {
          setMixedEligible(eligible)
          if (eligible) void startSitting(pid)
        })
      } else {
        void startSitting(pid)
      }
      void getPiggyBankState(pid).then(setPiggy)
      void getPracticeTimeToday(pid, localDateKey()).then((seconds) =>
        setTodaySeconds(seconds),
      )
    }
  }, [startSitting, practiceSubject])

  // Track "active" time: only while the tab is visible and the kid has
  // interacted recently, never while backgrounded or idle.
  useEffect(() => {
    function markActive() {
      lastActivityRef.current = Date.now()
    }
    markActive()
    window.addEventListener("pointerdown", markActive)
    window.addEventListener("keydown", markActive)
    window.addEventListener("touchstart", markActive)
    return () => {
      window.removeEventListener("pointerdown", markActive)
      window.removeEventListener("keydown", markActive)
      window.removeEventListener("touchstart", markActive)
    }
  }, [])

  useEffect(() => {
    const tick = window.setInterval(() => {
      const isVisible = document.visibilityState === "visible"
      const isActive = Date.now() - lastActivityRef.current < IDLE_MS
      if (isVisible && isActive) {
        pendingSecondsRef.current += 1
        setTodaySeconds((s) => s + 1)
      }
    }, 1000)
    return () => window.clearInterval(tick)
  }, [])

  // Flush accumulated active seconds to the server periodically (and once
  // more on unmount, best-effort) rather than on every single tick.
  useEffect(() => {
    if (!playerId) return
    const flush = () => {
      const delta = pendingSecondsRef.current
      if (delta > 0) {
        pendingSecondsRef.current = 0
        void addPracticeTime(playerId, localDateKey(), delta)
      }
    }
    const flushTimer = window.setInterval(flush, PRACTICE_FLUSH_MS)
    return () => {
      window.clearInterval(flushTimer)
      flush()
    }
  }, [playerId])

  // Sprint countdown starts once the first question is on screen. It pauses
  // while a belt promotion celebration OR a wrong-answer teaching moment
  // (multiplication's FactVisuals, or the new See it/Move it/Think it flow)
  // is on screen, so exploring them never burns the kid's time — a teaching
  // moment shouldn't race a timer in any mode.
  useEffect(() => {
    if (
      mode !== "sprint" ||
      finished ||
      questions.length === 0 ||
      promotion ||
      reviewing ||
      helpStage !== "closed"
    )
      return
    if (timeLeft <= 0) {
      setFinished(true)
      return
    }
    const t = setTimeout(() => setTimeLeft((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [mode, finished, timeLeft, questions.length, promotion, reviewing, helpStage])

  const current = questions[idx]

  // Reset the "question shown at" clock every time a new question appears.
  useEffect(() => {
    questionShownAtRef.current = Date.now()
  }, [idx])

  // Guards against a wrong-tap-then-retry-tap pair (two handleAnswer calls
  // for the same idx, once the help flow is in play) triggering the same
  // prefetch boundary twice.
  const loadMoreTriggeredForIdxRef = useRef(-1)

  const loadMore = useCallback(async () => {
    if (fetchingRef.current || !playerId) return
    fetchingRef.current = true
    const more = await getQuestions(playerId, BATCH, false, practiceSubject)
    setQuestions((q) => [...q, ...more])
    fetchingRef.current = false
  }, [playerId, practiceSubject])

  const advance = useCallback(() => {
    setStatus("idle")
    setChosen(null)
    setReviewing(false)
    setHelpStage("closed")
    setHelpMethod(null)
    setCelebration(null)
    setPiggyCelebration(null)
    setIdx((i) => i + 1)
  }, [])

  // Re-arms the exact same question (idx unchanged, so `current` — same
  // a/b/options/questionKind — is reused as-is) after the child completes
  // the one required step in a help widget. helpMethod is deliberately
  // NOT cleared here: the upcoming retry tap's recordAttempt call still
  // needs to read it, so it stays set until advance() genuinely moves on.
  const retrySameQuestion = useCallback(() => {
    setStatus("idle")
    setChosen(null)
    setHelpStage("closed")
    questionShownAtRef.current = Date.now()
  }, [])

  function handleAnswer(option: number, buttonEl: HTMLButtonElement | null) {
    if (status !== "idle" || !current || finished) return
    // The real subject THIS question belongs to — equals `subject` for a
    // single-subject sitting, but varies question-to-question in Mixed
    // Maths (see SubjectQuestion.subject / getMixedQuestions in dojo.ts).
    const questionSubject = current.subject
    const questionEngine = getSubjectEngine(questionSubject)
    const answerMs = Date.now() - questionShownAtRef.current
    const isCorrect = option === current.answer
    setChosen(option)
    setStatus(isCorrect ? "correct" : "wrong")
    setAnswered((n) => n + 1)

    let newStreak = streak
    let piggyBigMilestone = false
    if (isCorrect) {
      newStreak = streak + 1
      setCorrectCount((n) => n + 1)
      setStreak(newStreak)
      if (buttonEl) {
        setCelebration({
          origin: buttonEl.getBoundingClientRect(),
          target: streakBadgeRef.current?.getBoundingClientRect() ?? null,
          streak: newStreak,
        })
      }

      // Optimistic Piggy Bank update: mirrors the server's cap logic (via
      // the same allocateOneAnswer used server-side, so the $4-balanced +
      // $1-flexible model can't drift out of sync here) so the coin
      // animation and balance bump feel instant, then gets silently
      // corrected once recordAttempt's authoritative summary comes back.
      if (buttonEl && piggy) {
        const newWeeklyBreakdown: WeeklyEarningsBucket = {
          bySubjectCents: { ...piggy.weeklyBreakdown.bySubjectCents },
          flexibleCents: piggy.weeklyBreakdown.flexibleCents,
          totalCents: piggy.weeklyBreakdown.totalCents,
        }
        const earnedCents = allocateOneAnswer(newWeeklyBreakdown, questionSubject)
        const newBalanceCents = piggy.balanceCents + earnedCents
        const newEarnedThisWeekCents = newWeeklyBreakdown.totalCents
        const crossedDime =
          Math.floor(piggy.balanceCents / 10) <
          Math.floor(newBalanceCents / 10)
        const crossedDollar =
          Math.floor(piggy.balanceCents / 100) <
          Math.floor(newBalanceCents / 100)
        const reachedWeeklyCap =
          piggy.earnedThisWeekCents < piggy.weeklyCapCents &&
          newEarnedThisWeekCents >= piggy.weeklyCapCents
        piggyBigMilestone = reachedWeeklyCap || crossedDollar

        setPiggy({
          ...piggy,
          balanceCents: newBalanceCents,
          earnedThisWeekCents: newEarnedThisWeekCents,
          weeklyBreakdown: newWeeklyBreakdown,
          correctThisWeek: piggy.correctThisWeek + 1,
          totalCorrect: piggy.totalCorrect + 1,
          currentStreak: piggy.currentStreak + 1,
          bestStreak: Math.max(piggy.bestStreak, piggy.currentStreak + 1),
        })
        setPiggyBounceKey((k) => k + 1)
        setPiggyCelebration({
          origin: buttonEl.getBoundingClientRect(),
          target: piggyRef.current?.getBoundingClientRect() ?? null,
          earnedCents,
          crossedDime,
          crossedDollar,
          reachedWeeklyCap,
          balanceAfterCents: newBalanceCents,
        })
      }
    } else {
      setStreak(0)
      setCelebration(null)
      setPiggyCelebration(null)
      if (questionEngine.explainFact) {
        // Pause and let the kid explore the visuals before continuing —
        // FactVisuals only has a mnemonic/array visual for subjects whose
        // engine provides explainFact (currently just multiplication).
        setReviewing(true)
      } else if (helpMethod !== null) {
        // This is the retry (helpMethod is only set once a method has been
        // chosen) and it's STILL wrong — one help round only (per design:
        // "keep explanations short," and the adaptive engine already
        // resurfaces anything still shaky). Fall back to the plain
        // highlight-and-advance rather than reopening the chooser.
        window.setTimeout(advance, WRONG_ANSWER_PAUSE_MS)
      } else if (hasHelpFlow(questionSubject)) {
        // First wrong answer on a subject with a teaching flow — offer it
        // instead of just revealing the answer.
        setHelpStage("choosing")
      } else {
        window.setTimeout(advance, WRONG_ANSWER_PAUSE_MS)
      }
    }

    void recordAttempt({
      playerId,
      sessionId: sessionIdRef.current,
      mode,
      subject: questionSubject,
      practiceSubject,
      a: current.a,
      b: current.b,
      correct: isCorrect,
      answerMs,
      bandIndex: current.bandIndex,
      questionKind: current.questionKind,
      blankSlot: current.blankSlot,
      helpMethod: helpMethod ?? undefined,
    }).then((res) => {
      if (res.promotions.length > 0) {
        setPromoQueue((q) => [...q, ...res.promotions])
      }
      // Reconcile with the server's authoritative numbers (silent — the
      // celebration already played off the optimistic update above).
      if (res.piggyBank) {
        setPiggy(res.piggyBank.summary)
      }
      // Personal Bests are only known once the server confirms this
      // answer, so (unlike streak/Piggy Bank) there's no optimistic
      // version — the banner appears a beat after the answer lands.
      if (res.personalBest) {
        setPersonalBestCelebration(res.personalBest)
      }
    })

    if (idx >= questions.length - 3 && loadMoreTriggeredForIdxRef.current !== idx) {
      loadMoreTriggeredForIdxRef.current = idx
      void loadMore()
    }

    // Correct answers keep the quick pop + auto-advance (a beat longer at
    // streak or Piggy Bank milestones so the banner is readable). Wrong
    // answers stay put until the kid dismisses the visuals card.
    if (isCorrect) {
      const delay =
        isMilestoneStreak(newStreak) || piggyBigMilestone
          ? MILESTONE_FLASH_MS
          : FLASH_MS
      window.setTimeout(advance, delay)
    }
  }

  const promoOverlay = promotion ? (
    <BeltPromotion
      table={promotion.table}
      belt={promotion.belt}
      subject={promotion.subject}
      onDismiss={() => setPromoQueue((q) => q.slice(1))}
    />
  ) : null

  // ---- Sprint results screen ----
  if (mode === "sprint" && finished) {
    const accuracy =
      answered > 0 ? Math.round((correctCount / answered) * 100) : 0
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center justify-center gap-8 px-6 py-10 text-center">
        {promoOverlay}
        <p className="font-display text-xl text-primary">Time&apos;s up!</p>
        <div className="w-full rounded-2xl bg-card px-8 py-10 text-card-foreground shadow-xl">
          <p className="font-display text-lg text-card-foreground/70">
            You answered
          </p>
          <p className="font-mono text-6xl font-bold text-card-foreground">
            {correctCount}
            <span className="text-card-foreground/40">/{answered}</span>
          </p>
          <p className="mt-2 font-mono text-2xl font-semibold text-secondary">
            {accuracy}% correct
          </p>
        </div>
        <div className="flex w-full flex-col gap-3">
          <button
            type="button"
            onClick={() => startSitting(playerId)}
            className="flex items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-4 font-display text-xl font-semibold text-primary-foreground transition-transform active:scale-95"
          >
            Sprint again
          </button>
          <Link
            href="/"
            className="flex items-center justify-center gap-2 rounded-2xl border border-border px-6 py-4 font-display text-lg text-foreground transition-colors hover:bg-muted"
          >
            <House className="size-5" /> Back to the dojo
          </Link>
        </div>
      </main>
    )
  }

  // ---- Mixed Maths locked ----
  if (practiceSubject === "mixed" && mixedEligible === false) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 px-6 py-10 text-center">
        <span className="text-5xl" aria-hidden="true">
          🔒
        </span>
        <p className="font-display text-xl font-semibold text-foreground">
          Mixed Maths isn&apos;t unlocked yet
        </p>
        <p className="font-sans text-sm text-foreground/60">
          Practise a bit more in each subject to unlock Mixed Maths.
        </p>
        <Link
          href="/practice"
          className="mt-2 flex items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-4 font-display text-lg font-semibold text-primary-foreground transition-transform active:scale-95"
        >
          <House className="size-5" /> Choose a subject
        </Link>
      </main>
    )
  }

  // ---- Loading ----
  if (!current || mixedEligible === null) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-6">
        <p className="animate-pulse font-display text-xl text-foreground/60">
          Lining up your questions…
        </p>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-6 py-6">
      {promoOverlay}
      {celebration && (
        <AnswerCelebration
          key={idx}
          origin={celebration.origin}
          target={celebration.target}
          streak={celebration.streak}
        />
      )}
      {piggyCelebration && (
        <PiggyCelebration
          key={`piggy-${idx}`}
          origin={piggyCelebration.origin}
          target={piggyCelebration.target}
          earnedCents={piggyCelebration.earnedCents}
          crossedDime={piggyCelebration.crossedDime}
          crossedDollar={piggyCelebration.crossedDollar}
          reachedWeeklyCap={piggyCelebration.reachedWeeklyCap}
          balanceAfterCents={piggyCelebration.balanceAfterCents}
        />
      )}
      {personalBestCelebration && (
        // Deliberately NOT keyed on idx — this overlays across a question
        // change instead of restarting, so it stays on screen for its own
        // ~1.6s regardless of how fast the child moves to the next question.
        <PersonalBestCelebration
          key={personalBestCelebration.key}
          delta={personalBestCelebration}
          onDone={() => setPersonalBestCelebration(null)}
        />
      )}
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <Link
          href="/"
          aria-label="Quit and go home"
          className="flex size-11 items-center justify-center rounded-full border border-border text-foreground/80 transition-colors hover:bg-muted"
        >
          <House className="size-5" />
        </Link>

        {mode === "practice" ? (
          <div
            ref={streakBadgeRef}
            className="flex items-center gap-2 rounded-full bg-muted px-4 py-2"
          >
            <Flame
              key={`flame-${streak}`}
              className={cn(
                "size-5",
                streak > 0 && "animate-streak-pop",
                streak > 0 ? "text-primary" : "text-foreground/30",
              )}
            />
            <span
              key={`count-${streak}`}
              className={cn(
                "font-mono text-lg font-bold text-foreground",
                streak > 0 && "animate-streak-pop",
              )}
            >
              {streak}
            </span>
          </div>
        ) : (
          <SprintTimer timeLeft={timeLeft} />
        )}
      </div>

      {/* Piggy Bank */}
      <div className="mt-3">
        <PiggyBank
          ref={piggyRef}
          summary={piggy ?? EMPTY_PIGGY}
          todaySeconds={todaySeconds}
          bounceKey={piggyBounceKey}
        />
      </div>

      {/* "Now try it again" — shown only in the brief post-help retry window */}
      {helpMethod !== null && helpStage === "closed" && status === "idle" && (
        <p className="mt-3 text-center font-display text-base font-semibold text-primary">
          Now try it again
        </p>
      )}

      {/* Equation */}
      <div className="flex flex-1 flex-col items-center justify-center">
        {current.questionKind === "missingOperand" ? (
          <div
            className={cn(
              "font-mono text-5xl font-bold tabular-nums transition-colors sm:text-6xl",
              status === "correct" && "text-secondary",
              status === "wrong" && "text-destructive",
              status === "idle" && "text-foreground",
            )}
            aria-live="polite"
          >
            {current.blankSlot === "a" ? "▢" : current.a}{" "}
            <span className="text-primary">{OPERATOR_SYMBOL[current.subject]}</span>{" "}
            {current.blankSlot === "b" ? "▢" : current.b}{" "}
            <span className="text-foreground/40">=</span> {current.displayResult}
          </div>
        ) : (
          <>
            <div
              className={cn(
                "font-mono text-7xl font-bold tabular-nums transition-colors sm:text-8xl",
                status === "correct" && "text-secondary",
                status === "wrong" && "text-destructive",
                status === "idle" && "text-foreground",
              )}
              aria-live="polite"
            >
              {current.a}{" "}
              <span className="text-primary">{OPERATOR_SYMBOL[current.subject]}</span>{" "}
              {current.b}
            </div>
            <div className="mt-2 font-mono text-4xl text-foreground/30">=</div>
          </>
        )}
      </div>

      {/* Answers 2x2 */}
      <div className="grid grid-cols-2 gap-3 pb-4">
        {current.options.map((opt) => {
          const isChosen = chosen === opt
          const isAnswer = opt === current.answer
          // Suppressed while a help interaction is open: revealing the
          // correct button here would let the retry be "solved" by memory
          // of the highlight rather than the teaching step, defeating the
          // whole point of the flow.
          const showCorrect = status !== "idle" && helpStage === "closed" && isAnswer
          const showWrong = status === "wrong" && helpStage === "closed" && isChosen
          return (
            <button
              key={opt}
              type="button"
              disabled={status !== "idle" || helpStage !== "closed"}
              onClick={(e) => handleAnswer(opt, e.currentTarget)}
              className={cn(
                "flex h-24 items-center justify-center rounded-2xl font-mono text-4xl font-bold shadow-md transition-all active:scale-95 sm:h-28",
                "bg-card text-card-foreground",
                showCorrect && "bg-secondary text-secondary-foreground",
                showWrong && "bg-destructive text-destructive-foreground",
                status === "idle" && "hover:-translate-y-0.5",
              )}
            >
              {opt}
            </button>
          )
        })}
      </div>

      {/* Pickable visuals after a wrong answer — multiplication only */}
      {reviewing && (
        <FactVisuals
          key={`${current.a}x${current.b}`}
          a={current.a}
          b={current.b}
          onContinue={advance}
        />
      )}

      {/* "See it / Move it / Think it" wrong-answer teaching flow —
          Addition/Subtraction/Division (see hasHelpFlow) */}
      {helpStage === "choosing" && (
        <HelpChooser
          recommended={recommendedHelpMethod(
            current.subject,
            current.a,
            current.b,
            current.bandIndex,
          )}
          onChoose={(method) => {
            setHelpMethod(method)
            setHelpStage("teaching")
          }}
        />
      )}
      {helpStage === "teaching" && helpMethod && current.subject === "addition" && (
        <AdditionHelp
          key={`${helpMethod}-${current.a}-${current.b}`}
          a={current.a}
          b={current.b}
          method={helpMethod}
          onSolved={retrySameQuestion}
        />
      )}
      {helpStage === "teaching" && helpMethod && current.subject === "subtraction" && (
        <SubtractionHelp
          key={`${helpMethod}-${current.a}-${current.b}`}
          a={current.a}
          b={current.b}
          bandIndex={current.bandIndex}
          method={helpMethod}
          onSolved={retrySameQuestion}
        />
      )}
      {helpStage === "teaching" && helpMethod && current.subject === "division" && (
        <DivisionHelp
          key={`${helpMethod}-${current.a}-${current.b}`}
          a={current.a}
          b={current.b}
          playerId={playerId}
          method={helpMethod}
          onSolved={retrySameQuestion}
        />
      )}

      {mode === "practice" && !reviewing && helpStage === "closed" && (
        <p className="pb-2 text-center font-sans text-sm text-foreground/40">
          {answered} answered · keep the streak going
        </p>
      )}
    </main>
  )
}

function SprintTimer({ timeLeft }: { timeLeft: number }) {
  const pct = (timeLeft / SPRINT_SECONDS) * 100
  return (
    <div className="flex items-center gap-3">
      <div className="h-2.5 w-32 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-1000 ease-linear"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-8 text-right font-mono text-lg font-bold text-foreground tabular-nums">
        {timeLeft}
      </span>
    </div>
  )
}
