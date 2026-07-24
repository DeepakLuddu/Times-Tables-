"use client"

import { useState } from "react"
import Image from "next/image"
import { GamePlay } from "@/components/game-play"
import { SignOutButton } from "@/components/sign-out-button"
import { Button } from "@/components/ui/button"
import type { ProgressSummary } from "@/app/actions/game"
import { Star, Flame, Sparkles, Trophy, Lock, Check } from "lucide-react"
import { cn } from "@/lib/utils"

const ALL_TABLES = Array.from({ length: 12 }, (_, i) => i + 1)

type View = "home" | "playing"
type Mode = "practice" | "challenge"

export function GameHome({ name, progress }: { name: string; progress: ProgressSummary }) {
  const [view, setView] = useState<View>("home")
  const [mode, setMode] = useState<Mode>("practice")
  const [selectedTables, setSelectedTables] = useState<number[]>(ALL_TABLES)

  function toggleTable(n: number) {
    setSelectedTables((prev) => (prev.includes(n) ? prev.filter((t) => t !== n) : [...prev, n].sort((a, b) => a - b)))
  }

  function startGame(m: Mode) {
    setMode(m)
    setView("playing")
  }

  if (view === "playing") {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8">
        <GamePlay
          tables={selectedTables.length > 0 ? selectedTables : ALL_TABLES}
          mode={mode}
          onExit={() => {
            setView("home")
            // Refresh server data on return so stars/streak update.
            window.location.reload()
          }}
        />
      </div>
    )
  }

  const masteredCount = progress.tableMastery.filter((t) => t.mastered).length

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      {/* Header */}
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Image
            src="/mascot-fox.png"
            alt=""
            width={48}
            height={48}
            className="h-12 w-12 object-contain"
          />
          <div>
            <p className="text-sm font-semibold text-muted-foreground">Hi, {name}!</p>
            <h1 className="font-serif text-xl font-extrabold leading-none">Times Table Heroes</h1>
          </div>
        </div>
        <SignOutButton />
      </header>

      {/* Stats row */}
      <div className="mb-6 grid grid-cols-3 gap-3">
        <StatCard icon={<Star className="h-6 w-6" fill="currentColor" />} value={progress.totalStars} label="Stars" tone="accent" />
        <StatCard icon={<Flame className="h-6 w-6" fill="currentColor" />} value={progress.streak} label="Day streak" tone="primary" />
        <StatCard icon={<Trophy className="h-6 w-6" fill="currentColor" />} value={masteredCount} label="Mastered" tone="secondary" />
      </div>

      {/* Daily goal banner */}
      <div
        className={cn(
          "mb-6 flex items-center gap-3 rounded-2xl border-2 px-5 py-4",
          progress.playedToday ? "border-secondary/40 bg-secondary/10" : "border-accent/50 bg-accent/15",
        )}
      >
        <Sparkles className="h-6 w-6 shrink-0 text-accent-foreground" aria-hidden="true" />
        <p className="text-sm font-semibold text-pretty">
          {progress.playedToday
            ? "You've practiced today. Amazing! Keep your streak going tomorrow."
            : "You haven't played yet today. Play one round to keep your streak alive!"}
        </p>
      </div>

      {/* Table picker */}
      <section className="mb-6 rounded-3xl border-2 border-border bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-serif text-lg font-bold">Pick your tables</h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSelectedTables(ALL_TABLES)}
              className="rounded-full px-3 py-1 text-xs font-bold text-secondary underline-offset-2 hover:underline"
            >
              All
            </button>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {ALL_TABLES.map((n) => {
            const active = selectedTables.includes(n)
            const mastered = progress.tableMastery.find((t) => t.factor === n)?.mastered
            return (
              <button
                key={n}
                type="button"
                onClick={() => toggleTable(n)}
                aria-pressed={active}
                className={cn(
                  "relative flex h-14 items-center justify-center rounded-xl border-4 font-serif text-xl font-extrabold transition-all",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-foreground hover:border-primary/40",
                )}
              >
                {n}
                {mastered && (
                  <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                    <Check className="h-3 w-3" aria-hidden="true" />
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {selectedTables.length === 0
            ? "Tap a number to choose which tables to practice."
            : `Practicing the ${selectedTables.join(", ")} times ${selectedTables.length === 1 ? "table" : "tables"}.`}
        </p>
      </section>

      {/* Play buttons */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Button
          size="lg"
          onClick={() => startGame("practice")}
          className="h-auto flex-col gap-1 rounded-2xl bg-secondary py-5 text-secondary-foreground hover:bg-secondary/90"
        >
          <span className="font-serif text-lg font-extrabold">Practice Mode</span>
          <span className="text-xs font-medium opacity-90">Relaxed, no timer</span>
        </Button>
        <Button
          size="lg"
          onClick={() => startGame("challenge")}
          className="h-auto flex-col gap-1 rounded-2xl py-5"
        >
          <span className="font-serif text-lg font-extrabold">Star Challenge</span>
          <span className="text-xs font-medium opacity-90">Beat the timer for stars!</span>
        </Button>
      </div>
    </div>
  )
}

function StatCard({
  icon,
  value,
  label,
  tone,
}: {
  icon: React.ReactNode
  value: number
  label: string
  tone: "accent" | "primary" | "secondary"
}) {
  const toneClasses = {
    accent: "text-accent-foreground",
    primary: "text-primary",
    secondary: "text-secondary",
  }[tone]

  return (
    <div className="flex flex-col items-center gap-1 rounded-2xl border-2 border-border bg-card px-2 py-4 text-center">
      <span className={toneClasses}>{icon}</span>
      <span className="font-serif text-2xl font-extrabold leading-none">{value}</span>
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
    </div>
  )
}
