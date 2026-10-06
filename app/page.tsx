"use client"

import { ThemePicker } from "@/components/theme-picker"
import { useTheme } from "@/components/theme-provider"
import { cn } from "@/lib/utils"
import { Clock, Flame, ShieldCheck, Trophy, Users } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useState } from "react"

export default function HomePage() {
  const { theme, ready, firstVisit } = useTheme()
  const [pickerOpen, setPickerOpen] = useState(false)
  const showPicker = ready && (pickerOpen || firstVisit)

  return (
    <main
      className={cn(
        "mx-auto flex min-h-dvh w-full max-w-md flex-col items-center px-6 py-10",
        // Hold the text back for a beat so a returning child never sees the
        // default world's wording flash before their own.
        !ready && "invisible",
      )}
    >
      {showPicker && <ThemePicker onClose={() => setPickerOpen(false)} />}

      <div className="flex flex-col items-center text-center">
        {theme.id === "ninja" ? (
          <Image
            src="/dojo-mascot.png"
            alt={theme.mascotLabel}
            width={180}
            height={180}
            priority
            className="size-44 rounded-full border-4 border-primary/40 object-cover shadow-xl"
          />
        ) : (
          <div
            role="img"
            aria-label={theme.mascotLabel}
            className="flex size-44 items-center justify-center rounded-full border-4 border-primary/40 bg-muted text-8xl shadow-xl"
          >
            {theme.emoji}
          </div>
        )}
        <h1 className="mt-2 text-balance font-display text-5xl font-bold text-primary">
          {theme.appName}
        </h1>
        <p className="mt-2 text-balance font-sans text-base text-foreground/70">
          {theme.tagline}
        </p>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="mt-3 flex items-center gap-2 rounded-full border border-border px-4 py-2 font-sans text-sm text-foreground/80 transition-colors hover:bg-muted"
        >
          <span aria-hidden="true">{theme.emoji}</span>
          Change world
        </button>
      </div>

      <div className="mt-8 flex w-full flex-col gap-4">
        <Link
          href="/practice"
          className="group flex items-center gap-4 rounded-3xl bg-secondary px-6 py-5 text-secondary-foreground shadow-lg transition-transform active:scale-[0.98]"
        >
          <Flame className="size-8 shrink-0" />
          <span className="flex flex-col">
            <span className="font-display text-2xl font-semibold">Practice</span>
            <span className="font-sans text-sm text-secondary-foreground/80">
              No clock. Just you and the numbers.
            </span>
          </span>
        </Link>

        <Link
          href="/sprint"
          className="group flex items-center gap-4 rounded-3xl bg-primary px-6 py-5 text-primary-foreground shadow-lg transition-transform active:scale-[0.98]"
        >
          <Clock className="size-8 shrink-0" />
          <span className="flex flex-col">
            <span className="font-display text-2xl font-semibold">Sprint</span>
            <span className="font-sans text-sm text-primary-foreground/80">
              60 seconds. How many can you land?
            </span>
          </span>
        </Link>

        <Link
          href="/belts"
          className="group flex items-center gap-4 rounded-3xl border border-border px-6 py-5 text-foreground shadow-sm transition-colors hover:bg-muted"
        >
          <ShieldCheck className="size-8 shrink-0 text-primary" />
          <span className="flex flex-col">
            <span className="font-display text-2xl font-semibold">
              {theme.wallName}
            </span>
            <span className="font-sans text-sm text-foreground/60">
              {theme.wallBlurb}
            </span>
          </span>
        </Link>

        <Link
          href="/personal-bests"
          className="group flex items-center gap-4 rounded-3xl border border-border px-6 py-5 text-foreground shadow-sm transition-colors hover:bg-muted"
        >
          <Trophy className="size-8 shrink-0 text-primary" />
          <span className="flex flex-col">
            <span className="font-display text-2xl font-semibold">
              Personal Bests
            </span>
            <span className="font-sans text-sm text-foreground/60">
              Your greatest maths achievements.
            </span>
          </span>
        </Link>
      </div>

      <Link
        href="/parents"
        className="mt-8 flex items-center gap-2 font-sans text-sm text-foreground/50 underline-offset-4 transition-colors hover:text-foreground hover:underline"
      >
        <Users className="size-4" />
        For parents
      </Link>
    </main>
  )
}
