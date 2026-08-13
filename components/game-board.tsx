"use client"

import { getQuestions, recordAttempt } from "@/app/actions/dojo"
import { addPracticeTime, getPiggyBankState, getPracticeTimeToday } from "@/app/actions/piggybank"
import {
  AnswerCelebration,
  isMilestoneStreak,
  type CelebrationData,
} from "@/components/answer-celebration"
import { BeltPromotion } from "@/components/belt-promotion"
import { FactVisuals } from "@/components/fact-visuals"
import { DAILY_GOAL_SECONDS, PiggyBank } from "@/components/piggy-bank"
import {
  PiggyCelebration,
  type PiggyCelebrationData,
} from "@/components/piggy-celebration"
import type { Mode, Question } from "@/lib/engine"
import type { BeltPromotion as BeltPromotionData } from "@/lib/insights"
import { getPlayerId, newSessionId } from "@/lib/player"
import {
  type PiggyBankSummary,
  WEEKLY_CAP_CENTS,
  localDateKey,
} from "@/lib/piggybank"
import { cn } from "@/lib/utils"
import { Flame, House } from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"

const BATCH = 12
const SPRINT_SECONDS = 60
const FLASH_MS = 650
// Correct answers that land on a streak milestone get a slightly longer
// beat so the "5 STREAK!" banner has time to read before the next question.
const MILESTONE_FLASH_MS = 900
// The kid should never be left staring at a page with no interaction for
// this long and still have it count as "active practice."
const IDLE_MS = 30_000
// How often accumulated active seconds get persisted to the server.
const PRACTICE_FLUSH_MS = 8_000

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
}

type Status = "idle" | "correct" | "wrong"

export function GameBoard({ mode }: { mode: Mode }) {
  const [playerId, setPlayerId] = useState("")
  const sessionIdRef = useRef("")
  const [questions, setQuestions] = useState<Question[]>([])
  const [idx, setIdx] = useState(0)
  const [status, setStatus] = useState<Status>("idle")
  const [chosen, setChosen] = useState<number | null>(null)
  // After a wrong answer we pause and show pickable visuals; the kid taps to
  // continue when they're ready.
  const [reviewing, setReviewing] = useState(false)
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

  const startSitting = useCallback(async (pid: string) => {
    sessionIdRef.current = newSessionId()
    setQuestions([])
    setIdx(0)
    setStatus("idle")
    setChosen(null)
    setReviewing(false)
    setStreak(0)
    setAnswered(0)
    setCorrectCount(0)
    setTimeLeft(SPRINT_SECONDS)
    setFinished(false)
    setPromoQueue([])
    setCelebration(null)
    setPiggyCelebration(null)
    const first = await getQuestions(pid, BATCH, true)
    setQuestions(first)
  }, [])

  useEffect(() => {
    const pid = getPlayerId()
    setPlayerId(pid)
    if (!startedRef.current) {
      startedRef.current = true
      void startSitting(pid)
      void getPiggyBankState(pid).then(setPiggy)
      void getPracticeTimeToday(pid, localDateKey()).then((seconds) =>
        setTodaySeconds(seconds),
      )
    }
  }, [startSitting])

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
  // while a belt promotion celebration OR the wrong-answer visuals are on
  // screen so exploring them never burns the kid's time.
  useEffect(() => {
    if (
      mode !== "sprint" ||
      finished ||
      questions.length === 0 ||
      promotion ||
      reviewing
    )
      return
    if (timeLeft <= 0) {
      setFinished(true)
      return
    }
    const t = setTimeout(() => setTimeLeft((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [mode, finished, timeLeft, questions.length, promotion, reviewing])

  const current = questions[idx]

  // Reset the "question shown at" clock every time a new question appears.
  useEffect(() => {
    questionShownAtRef.current = Date.now()
  }, [idx])

  const loadMore = useCallback(async () => {
    if (fetchingRef.current || !playerId) return
    fetchingRef.current = true
    const more = await getQuestions(playerId, BATCH, false)
    setQuestions((q) => [...q, ...more])
    fetchingRef.current = false
  }, [playerId])

  const advance = useCallback(() => {
    setStatus("idle")
    setChosen(null)
    setReviewing(false)
    setCelebration(null)
    setPiggyCelebration(null)
    setIdx((i) => i + 1)
  }, [])

  function handleAnswer(option: number, buttonEl: HTMLButtonElement | null) {
    if (status !== "idle" || !current || finished) return
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

      // Optimistic Piggy Bank update: mirrors the server's cap logic so the
      // coin animation and balance bump feel instant, then gets silently
      // corrected once recordAttempt's authoritative summary comes back.
      if (buttonEl && piggy) {
        const willEarn = piggy.earnedThisWeekCents < piggy.weeklyCapCents
        const earnedCents = willEarn ? 1 : 0
        const newBalanceCents = piggy.balanceCents + earnedCents
        const newEarnedThisWeekCents = Math.min(
          piggy.earnedThisWeekCents + earnedCents,
          piggy.weeklyCapCents,
        )
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
      // Pause and let the kid explore the visuals before continuing.
      setReviewing(true)
    }

    void recordAttempt({
      playerId,
      sessionId: sessionIdRef.current,
      mode,
      a: current.a,
      b: current.b,
      correct: isCorrect,
      answerMs,
    }).then((res) => {
      if (res.promotions.length > 0) {
        setPromoQueue((q) => [...q, ...res.promotions])
      }
      // Reconcile with the server's authoritative numbers (silent — the
      // celebration already played off the optimistic update above).
      if (res.piggyBank) {
        setPiggy(res.piggyBank.summary)
      }
    })

    if (idx >= questions.length - 3) void loadMore()

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

  // ---- Loading ----
  if (!current) {
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

      {/* Equation */}
      <div className="flex flex-1 flex-col items-center justify-center">
        <div
          className={cn(
            "font-mono text-7xl font-bold tabular-nums transition-colors sm:text-8xl",
            status === "correct" && "text-secondary",
            status === "wrong" && "text-destructive",
            status === "idle" && "text-foreground",
          )}
          aria-live="polite"
        >
          {current.a} <span className="text-primary">×</span> {current.b}
        </div>
        <div className="mt-2 font-mono text-4xl text-foreground/30">=</div>
      </div>

      {/* Answers 2x2 */}
      <div className="grid grid-cols-2 gap-3 pb-4">
        {current.options.map((opt) => {
          const isChosen = chosen === opt
          const isAnswer = opt === current.answer
          const showCorrect = status !== "idle" && isAnswer
          const showWrong = status === "wrong" && isChosen
          return (
            <button
              key={opt}
              type="button"
              disabled={status !== "idle"}
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

      {/* Pickable visuals after a wrong answer */}
      {reviewing && (
        <FactVisuals
          key={`${current.a}x${current.b}`}
          a={current.a}
          b={current.b}
          onContinue={advance}
        />
      )}

      {mode === "practice" && !reviewing && (
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
