"use client"

import { getPersonalBests } from "@/app/actions/personalbests"
import type { AnyRecord } from "@/components/personal-best-card"
import { PersonalBestCard } from "@/components/personal-best-card"
import { PersonalBestDetail } from "@/components/personal-best-detail"
import type { PersonalBests as PersonalBestsData } from "@/lib/personal-bests"
import { getPlayerId } from "@/lib/player"
import { House, Trophy } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"

export function PersonalBests() {
  const [data, setData] = useState<PersonalBestsData | null>(null)
  const [selected, setSelected] = useState<AnyRecord | null>(null)

  useEffect(() => {
    const pid = getPlayerId()
    void getPersonalBests(pid).then(setData)
  }, [])

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5 py-6">
      {selected && (
        <PersonalBestDetail record={selected} onClose={() => setSelected(null)} />
      )}

      <div className="flex items-center gap-3">
        <Link
          href="/"
          aria-label="Back to home"
          className="flex size-11 items-center justify-center rounded-full border border-border text-foreground/80 transition-colors hover:bg-muted"
        >
          <House className="size-5" />
        </Link>
        <div>
          <h1 className="flex items-center gap-2 font-display text-3xl font-bold text-primary">
            <Trophy className="size-7" />
            Personal Bests
          </h1>
          <p className="font-sans text-sm text-foreground/60">
            Your greatest maths achievements
          </p>
        </div>
      </div>

      {!data ? (
        <p className="mt-16 text-center font-display text-lg text-foreground/50">
          Loading your records…
        </p>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <PersonalBestCard
            record={data.fastestCleanRun}
            onTap={() => setSelected(data.fastestCleanRun)}
          />
          <PersonalBestCard
            record={data.longestStreak}
            onTap={() => setSelected(data.longestStreak)}
          />
          <PersonalBestCard
            record={data.bestAccuracy}
            onTap={() => setSelected(data.bestAccuracy)}
          />
          <PersonalBestCard
            record={data.mostImproved}
            onTap={() => setSelected(data.mostImproved)}
          />
        </div>
      )}
    </main>
  )
}
