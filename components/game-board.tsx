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
import { PersonalBestCelebration } from "@/components/personal-best-celebration"
import { DAILY_GOAL_SECONDS, PiggyBank } from "@/components/piggy-bank"
import {
  PiggyCelebration,
  type PiggyCelebrationData,
} from "@/components/piggy-celebration"
import { type Mode, type Question, makeQuestion } from "@/lib/engine"
import type { BeltPromotion as BeltPromotionData } from "@/lib/insights"
import type { PersonalBestDelta } from "@/lib/personal-bests"
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
const FLASH_MS = 650
// Correct answers that land on a streak milestone get a slightly longer
// beat so the "5 STREAK!" banner has time to read before the next question.
const MILESTONE_FLASH_MS = 900
// A missed fact comes back after this many other questions (min..max), so
// the kid gets a second go while it's still fresh, but not while the answer
// is still sitting in their head from a moment ago.
const RETRY_GAP_MIN = 3
const RETRY_GAP_MAX = 5
// Typed answers include typing time; credit this much per digit so the
// speed signal still measures recall, not finger speed.
const TYPING_ALLOWANCE_MS = 400
const MAX_TYPED_DIGITS = 3
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
  // Digits typed so far for a typed-answer question.
  const [typedStr, setTypedStr] = useState("")
  const submitRef = useRef<HTMLButtonElement>(null)
  // After a wrong answer we pause and show pickable visuals; the kid taps to
  // continue when they're ready.
  const [reviewing, setReviewing] = useState(false)
  const [streak, setStreak] = useState(0)
  const [answered, setAnswered] = useState(0)
  const [correctCount, setCorrectCount] = useState(0)

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

  const startSitting = useCallback(async (pid: string) => {
    sessionIdRef.current = newSessionId()
    setQuestions([])
    setIdx(0)
    setStatus("idle")
    setChosen(null)
    setTypedStr("")
    setReviewing(false)
    setStreak(0)
    setAnswered(0)
    setCorrectCount(0)
    setPromoQueue([])
    setCelebration(null)
    setPiggyCelebration(null)
    setPersonalBestCelebration(null)
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
    setTypedStr("")
    setReviewing(false)
    setCelebration(null)
    setPiggyCelebration(null)
    setIdx((i) => i + 1)
  }, [])

  function handleAnswer(
    option: number,
    buttonEl: HTMLButtonElement | null,
    typed = false,
  ) {
    if (status !== "idle" || !current) return
    const elapsed = Date.now() - questionShownAtRef.current
    const answerMs = typed
      ? Math.max(0, elapsed - TYPING_ALLOWANCE_MS * String(option).length)
      : elapsed
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
      // Spaced retry: slot the same fact back in a few questions from now,
      // unless one is already queued ahead.
      const missed = current
      const missedAt = idx
      setQuestions((qs) => {
        if (qs.slice(missedAt + 1).some((q) => q.factKey === missed.factKey)) {
          return qs
        }
        const gap =
          RETRY_GAP_MIN +
          Math.floor(Math.random() * (RETRY_GAP_MAX - RETRY_GAP_MIN + 1))
        const retry = makeQuestion([
          Math.min(missed.a, missed.b),
          Math.max(missed.a, missed.b),
        ])
        const next = [...qs]
        next.splice(missedAt + 1 + gap, 0, retry)
        return next
      })
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
      // Personal Bests are only known once the server confirms this
      // answer, so (unlike streak/Piggy Bank) there's no optimistic
      // version — the banner appears a beat after the answer lands.
      if (res.personalBest) {
        setPersonalBestCelebration(res.personalBest)
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

  const isTyped = Boolean(current?.typed)
  const inputOpen = isTyped && status === "idle" && !reviewing

  function pressDigit(d: string) {
    if (!inputOpen) return
    setTypedStr((s) => (s.length >= MAX_TYPED_DIGITS ? s : s + d))
  }
  function backspace() {
    if (!inputOpen) return
    setTypedStr((s) => s.slice(0, -1))
  }
  function submitTyped() {
    if (!inputOpen || typedStr === "") return
    handleAnswer(Number(typedStr), submitRef.current, true)
  }

  // Physical keyboard support for typed answers (re-bound each render so it
  // always sees the latest typedStr/handler — cheap, and avoids stale closures).
  useEffect(() => {
    if (!inputOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key >= "0" && e.key <= "9") pressDigit(e.key)
      else if (e.key === "Backspace") backspace()
      else if (e.key === "Enter") submitTyped()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  const promoOverlay = promotion ? (
    <BeltPromotion
      table={promotion.table}
      belt={promotion.belt}
      onDismiss={() => setPromoQueue((q) => q.slice(1))}
    />
  ) : null

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
        {isTyped ? (
          <div
            className={cn(
              "mt-2 flex items-center gap-3 font-mono text-5xl font-bold tabular-nums",
              status === "idle" && "text-foreground",
              status === "correct" && "text-secondary",
              status === "wrong" && "text-destructive",
            )}
            aria-live="polite"
          >
            <span className="text-foreground/30">=</span>
            <span className="min-w-[3ch] text-center">
              {status === "idle" ? typedStr || "?" : chosen}
            </span>
            {status === "wrong" && (
              <span className="text-2xl text-secondary">
                it&apos;s {current.answer}
              </span>
            )}
          </div>
        ) : (
          <div className="mt-2 font-mono text-4xl text-foreground/30">=</div>
        )}
      </div>

      {/* Typed answer keypad — only for facts that are already secure */}
      {isTyped && !reviewing && (
        <div className="grid grid-cols-3 gap-2 pb-4">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button
              key={d}
              type="button"
              disabled={!inputOpen}
              onClick={() => pressDigit(d)}
              className="flex h-16 items-center justify-center rounded-2xl bg-card font-mono text-3xl font-bold text-card-foreground shadow-md transition-transform active:scale-95"
            >
              {d}
            </button>
          ))}
          <button
            type="button"
            aria-label="Delete last digit"
            disabled={!inputOpen}
            onClick={backspace}
            className="flex h-16 items-center justify-center rounded-2xl bg-muted font-mono text-3xl font-bold text-foreground shadow-md transition-transform active:scale-95"
          >
            ⌫
          </button>
          <button
            type="button"
            disabled={!inputOpen}
            onClick={() => pressDigit("0")}
            className="flex h-16 items-center justify-center rounded-2xl bg-card font-mono text-3xl font-bold text-card-foreground shadow-md transition-transform active:scale-95"
          >
            0
          </button>
          <button
            ref={submitRef}
            type="button"
            aria-label="Submit answer"
            disabled={!inputOpen || typedStr === ""}
            onClick={submitTyped}
            className="flex h-16 items-center justify-center rounded-2xl bg-primary font-mono text-3xl font-bold text-primary-foreground shadow-md transition-transform active:scale-95 disabled:opacity-40"
          >
            ✓
          </button>
        </div>
      )}

      {/* Answers 2x2 */}
      <div className={cn("grid grid-cols-2 gap-3 pb-4", isTyped && "hidden")}>
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

