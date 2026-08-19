import type { Belt as BeltTier } from "@/lib/engine"
import { cn } from "@/lib/utils"

const BELT_BG: Record<BeltTier, string> = {
  white: "bg-belt-white",
  yellow: "bg-belt-yellow",
  green: "bg-belt-green",
  blue: "bg-belt-blue",
  purple: "bg-belt-purple",
  brown: "bg-belt-brown",
  black: "bg-belt-black",
}

const KNOT_BG: Record<BeltTier, string> = {
  white: "bg-belt-white",
  yellow: "bg-belt-yellow",
  green: "bg-belt-green",
  blue: "bg-belt-blue",
  purple: "bg-belt-purple",
  brown: "bg-belt-brown",
  black: "bg-belt-black",
}

// A stylized karate belt: a band with a center knot and two hanging tails.
export function Belt({
  tier,
  locked,
  className,
}: {
  tier: BeltTier
  /**
   * "Belt Challenge Ready" state (99%): the black belt is within reach but
   * not yet formally awarded, so it renders as an outlined/ghost
   * silhouette rather than a solid fill — it must never look identical to
   * an actually-earned black belt.
   */
  locked?: boolean
  className?: string
}) {
  const band = locked ? "bg-transparent" : BELT_BG[tier]
  const knot = locked ? "bg-transparent" : KNOT_BG[tier]
  // White belt needs a visible edge on the light card surface.
  const edge = locked
    ? "ring-2 ring-dashed ring-belt-black/50"
    : "ring-1 ring-black/15 shadow-sm"

  return (
    <div
      className={cn(
        "relative flex items-center justify-center",
        locked && "opacity-70",
        className,
      )}
      aria-hidden="true"
    >
      {/* Band */}
      <div className={cn("h-3 w-full rounded-full", band, edge)} />
      {/* Knot */}
      <div className="absolute flex items-center justify-center">
        <div className={cn("h-5 w-5 rotate-45 rounded-[4px]", knot, edge)} />
        {/* Tails */}
        <div
          className={cn(
            "absolute left-1/2 top-3 h-4 w-2 -translate-x-3 rotate-6 rounded-b-sm",
            band,
            edge,
          )}
        />
        <div
          className={cn(
            "absolute left-1/2 top-3 h-4 w-2 translate-x-1 -rotate-6 rounded-b-sm",
            band,
            edge,
          )}
        />
      </div>
    </div>
  )
}
