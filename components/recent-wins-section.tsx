"use client"

import { getRecentWins } from "@/app/actions/recentwins"
import { formatWinDate, type RecentWinsData } from "@/lib/recent-wins"
import { getPlayerId } from "@/lib/player"
import { Sparkles, Target } from "lucide-react"
import { useEffect, useState } from "react"

function isToday(iso: string): boolean {
  const d = new Date(iso)
  const now = new Date()
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  )
}

export function RecentWinsSection({ playerId }: { playerId: string }) {
  const [data, setData] = useState<RecentWinsData | null>(null)

  useEffect(() => {
    const pid = playerId || getPlayerId()
    void getRecentWins(pid).then(setData)
  }, [playerId])

  if (!data) return null

  return (
    <>
      {data.bestToday && (
        <section className="mt-8 rounded-2xl border border-secondary/40 bg-secondary/10 px-5 py-4">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-secondary">
            Best thing you did today
          </h2>
          <p className="mt-1 text-balance font-display text-lg font-semibold text-foreground">
            {data.bestToday}
          </p>
        </section>
      )}

      <section className="mt-4 rounded-2xl border border-primary/40 bg-primary/10 px-5 py-4">
        <div className="flex items-center gap-2">
          <Target className="size-5 text-primary" />
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-primary">
            Next challenge
          </h2>
        </div>
        <p className="mt-1 text-balance font-display text-lg font-semibold text-foreground">
          {data.nextChallenge}
        </p>
      </section>

      <section className="mt-8 pb-6">
        <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-foreground">
          <Sparkles className="size-5 text-primary" />
          Recent Wins
        </h2>
        {data.wins.length === 0 ? (
          <p className="mt-2 font-sans text-sm text-foreground/50">
            No wins yet — answer a few questions to get started.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {data.wins.map((w, i) => (
              <li
                key={`${w.type}-${w.date}-${i}`}
                className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3 text-card-foreground shadow-sm"
              >
                <span className="text-xl leading-none" aria-hidden="true">
                  {w.icon}
                </span>
                <span className="flex-1 font-sans text-sm font-medium">
                  {w.text}
                </span>
                <span className="font-sans text-xs text-card-foreground/40">
                  {isToday(w.date) ? "Today" : formatWinDate(w.date)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
