"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Image from "next/image"
import { buildRound, QUESTIONS_PER_ROUND, type Question } from "@/lib/game"
import { saveRound, type AnswerResult } from "@/app/actions/game"
import { Button } from "@/components/ui/button"
import { Star, Check, X, Zap, ArrowLeft } from "lucide-react"
import { cn } from "@/lib/utils"

type Mode = "practice" | "challenge"

const CHALLENGE_SECONDS = 8

export function GamePlay({
  tables,
  mode,
  weights,
  onExit,
}: {
  tables: number[]
  mode: Mode
  weights?: Map<string, number>
  onExit: () => void
}) {
  const questions = useMemo(() => buildRound(tables, weights), [tables, weights])
  const [index, setIndex] = useState(0)
  const [results, setResults] = useState<AnswerResult[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [locked, setLocked] = useState(false)
  const [startTime, setStartTime] = useState(() => Date.now())
  const [timeLeft, setTimeLeft] = useState(CHALLENGE_SECONDS)
  const [finished, setFinished] = useState(false)
  const [saving, setSaving] = useState(false)
  const [summary, setSummary] = useState<{ starsEarned: number; correctAnswers: number; questionsAnswered: number } | null>(
    null,
  )

  const current: Question | undefined = questions[index]

  const handleAnswer = useCallback(
    (choice: number | null) => {
      if (locked || !current) return
      setLocked(true)
      setSelected(choice)
      const timeMs = Date.now() - startTime
      const correct = choice === current.answer
      setResults((prev) => [
        ...prev,
        { factor: current.factor, multiplier: current.multiplier, correct, timeMs },
      ])

      window.setTimeout(() => {
        if (index + 1 >= questions.length) {
          setFinished(true)
        } else {
          setIndex((i) => i + 1)
          setSelected(null)
          setLocked(false)
          setStartTime(Date.now())
          setTimeLeft(CHALLENGE_SECONDS)
        }
      }, 900)
    },
    [locked, current, startTime, index, questions.length],
  )

  // Challenge-mode countdown timer.
  useEffect(() => {
    if (mode !== "challenge" || locked || finished) return
    if (timeLeft <= 0) {
      handleAnswer(null)
      return
    }
    const t = window.setTimeout(() => setTimeLeft((s) => s - 1), 1000)
    return () => window.clearTimeout(t)
  }, [mode, timeLeft, locked, finished, handleAnswer])

  // Save results once the round finishes.
  useEffect(() => {
    if (!finished || summary || saving) return
    setSaving(true)
    saveRound(results)
      .then((res) => setSummary(res))
      .catch(() => setSummary({ starsEarned: 0, correctAnswers: results.filter((r) => r.correct).length, questionsAnswered: results.length }))
      .finally(() => setSaving(false))
  }, [finished, results, summary, saving])

  if (finished) {
    const correct = results.filter((r) => r.correct).length
    const total = results.length
    const perfect = correct === total
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-6 rounded-3xl border-4 border-accent/40 bg-card p-8 text-center shadow-xl">
        <Image
          src="/mascot-celebrate.png"
          alt="Fox mascot celebrating"
          width={160}
          height={160}
          className="h-40 w-40 object-contain"
        />
        <div>
          <h2 className="font-serif text-3xl font-extrabold text-balance">
            {perfect ? "Perfect round!" : correct >= total * 0.7 ? "Great job!" : "Nice try!"}
          </h2>
          <p className="mt-1 text-muted-foreground">
            You got {correct} out of {total} right.
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-2xl bg-accent/20 px-6 py-4">
          <Star className="h-8 w-8 text-accent-foreground" fill="currentColor" aria-hidden="true" />
          <span className="font-serif text-3xl font-extrabold">+{summary?.starsEarned ?? correct}</span>
          <span className="font-semibold text-muted-foreground">stars</span>
        </div>

        <div className="flex w-full flex-col gap-3">
          <Button size="lg" onClick={onExit} className="rounded-2xl text-base font-bold">
            Back to home
          </Button>
        </div>
      </div>
    )
  }

  if (!current) return null

  const progress = ((index + (locked ? 1 : 0)) / QUESTIONS_PER_ROUND) * 100

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      {/* Top bar */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={onExit}
          aria-label="Quit game"
          className="rounded-full text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-secondary transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="min-w-14 text-right font-serif text-sm font-bold text-muted-foreground">
          {index + 1}/{QUESTIONS_PER_ROUND}
        </span>
      </div>

      {/* Challenge timer */}
      {mode === "challenge" && (
        <div className="flex items-center justify-center gap-2">
          <Zap
            className={cn("h-5 w-5", timeLeft <= 3 ? "text-destructive" : "text-accent-foreground")}
            fill="currentColor"
            aria-hidden="true"
          />
          <div className="h-2 w-40 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full transition-all duration-1000 ease-linear", timeLeft <= 3 ? "bg-destructive" : "bg-accent")}
              style={{ width: `${(timeLeft / CHALLENGE_SECONDS) * 100}%` }}
            />
          </div>
          <span className="w-6 font-serif text-sm font-bold">{timeLeft}s</span>
        </div>
      )}

      {/* Question */}
      <div className="flex flex-col items-center rounded-3xl border-4 border-primary/15 bg-card px-6 py-10 shadow-lg">
        <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">What is</p>
        <p className="mt-2 font-serif text-6xl font-extrabold text-foreground sm:text-7xl">
          {current.factor} {"×"} {current.multiplier}
        </p>
      </div>

      {/* Choices */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        {current.choices.map((choice) => {
          const isCorrect = choice === current.answer
          const isSelected = choice === selected
          const showState = locked && (isCorrect || isSelected)
          return (
            <button
              key={choice}
              type="button"
              disabled={locked}
              onClick={() => handleAnswer(choice)}
              className={cn(
                "flex h-20 items-center justify-center rounded-2xl border-4 font-serif text-3xl font-extrabold transition-all sm:h-24",
                "border-border bg-card text-foreground hover:border-secondary hover:bg-secondary/5",
                locked && isCorrect && "border-secondary bg-secondary text-secondary-foreground",
                locked && isSelected && !isCorrect && "border-destructive bg-destructive/10 text-destructive",
                locked && !showState && "opacity-50",
              )}
            >
              <span className="flex items-center gap-2">
                {choice}
                {locked && isCorrect && <Check className="h-6 w-6" aria-hidden="true" />}
                {locked && isSelected && !isCorrect && <X className="h-6 w-6" aria-hidden="true" />}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
