"use client"

import { Belt } from "@/components/belt"
import { useTheme } from "@/components/theme-provider"
import type { Belt as BeltTier } from "@/lib/engine"
import { cn } from "@/lib/utils"

const MARK_BG: Record<BeltTier, string> = {
  white: "bg-belt-white",
  yellow: "bg-belt-yellow",
  green: "bg-belt-green",
  blue: "bg-belt-blue",
  purple: "bg-belt-purple",
  brown: "bg-belt-brown",
  black: "bg-belt-black",
}

const SIZE: Record<"sm" | "md" | "lg", string> = {
  sm: "size-7 text-base",
  md: "size-10 text-2xl",
  lg: "size-16 text-4xl",
}

// The child-facing rank graphic. In the Ninja world it is exactly the
// karate belt; in every other world it's a tier-coloured medallion holding
// that world's glyph for the tier. Same tiers, same colours, same meaning.
export function RankMark({
  tier,
  locked,
  className,
  size = "md",
}: {
  tier: BeltTier
  locked?: boolean
  /** Used for the karate belt in the Ninja world. */
  className?: string
  /** Medallion size in every other world. */
  size?: "sm" | "md" | "lg"
}) {
  const { theme } = useTheme()
  if (theme.id === "ninja") {
    return <Belt tier={tier} locked={locked} className={className} />
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex items-center justify-center rounded-full leading-none",
        SIZE[size],
        locked
          ? "border-2 border-dashed border-current opacity-60"
          : cn(MARK_BG[tier], "ring-2 ring-black/15 shadow-sm"),
      )}
    >
      {theme.rankEmoji[tier]}
    </span>
  )
}
