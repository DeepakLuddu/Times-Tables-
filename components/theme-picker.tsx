"use client"

import { useTheme } from "@/components/theme-provider"
import { THEME_LIST } from "@/lib/themes"
import { cn } from "@/lib/utils"
import { X } from "lucide-react"

// "Choose your world" — six cards, one tap each. Shown automatically the
// first time a device opens the app, and any time from the home screen.
export function ThemePicker({ onClose }: { onClose: () => void }) {
  const { theme, setTheme, firstVisit } = useTheme()

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Choose your world"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/90 px-5 py-8 backdrop-blur-sm"
    >
      <div className="w-full max-w-md">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-3xl font-bold text-primary">
              Choose your world
            </h2>
            <p className="mt-1 font-sans text-sm text-foreground/70">
              Same times tables, your kind of adventure. You can change it any
              time.
            </p>
          </div>
          {!firstVisit && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border text-foreground/70 transition-colors hover:bg-muted"
            >
              <X className="size-5" />
            </button>
          )}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          {THEME_LIST.map((t) => {
            const selected = t.id === theme.id && !firstVisit
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTheme(t.id)
                  onClose()
                }}
                aria-pressed={selected}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-2xl border-2 px-3 py-4 text-center shadow-md transition-transform active:scale-95",
                  selected ? "border-primary" : "border-transparent",
                )}
                style={{ background: t.swatch[0], color: "#fff" }}
              >
                <span
                  className="flex size-16 items-center justify-center rounded-full text-4xl"
                  style={{ background: `${t.swatch[1]}33`, boxShadow: `0 0 0 2px ${t.swatch[1]}` }}
                >
                  {t.emoji}
                </span>
                <span className="font-display text-base font-semibold" style={{ color: t.swatch[1] }}>
                  {t.name}
                </span>
                <span className="font-sans text-xs leading-snug text-white/75">
                  {t.blurb}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
