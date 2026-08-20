"use client"

import type { HelpMethod } from "@/lib/subjects/types"
import { cn } from "@/lib/utils"

const METHODS: { key: HelpMethod; icon: string; label: string }[] = [
  { key: "see", icon: "👀", label: "See it" },
  { key: "move", icon: "➡️", label: "Move it" },
  { key: "think", icon: "🧠", label: "Think it" },
]

// The first screen of the wrong-answer teaching flow for Addition/
// Subtraction/Division — deliberately generic ("See it"/"Move it"/"Think
// it"), not the specific strategy name (that only appears once a method
// is chosen, inside the per-subject help widget), so a 9-year-old isn't
// hit with vocabulary before they understand the method.
export function HelpChooser({
  recommended,
  onChoose,
}: {
  recommended: HelpMethod | null
  onChoose: (method: HelpMethod) => void
}) {
  return (
    <div className="mb-2 rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-lg">
      <p className="mb-3 text-center font-display text-lg font-semibold text-primary">
        Not quite. Pick a way to work it out:
      </p>
      <div className="flex flex-col gap-2.5">
        {METHODS.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => onChoose(m.key)}
            className="relative flex items-center gap-3 rounded-2xl bg-muted px-5 py-4 text-left font-display text-xl font-semibold text-foreground transition-transform active:scale-[0.98]"
          >
            <span className="text-3xl leading-none" aria-hidden="true">
              {m.icon}
            </span>
            {m.label}
            {recommended === m.key && (
              <span
                className={cn(
                  "ml-auto rounded-full bg-secondary px-3 py-1 font-sans text-xs font-semibold text-secondary-foreground",
                )}
              >
                Recommended
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
