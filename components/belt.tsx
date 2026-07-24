import type { Belt as BeltTier } from "@/lib/engine"
import { cn } from "@/lib/utils"

const BELT_BG: Record<BeltTier, string> = {
  white: "bg-belt-white",
  yellow: "bg-belt-yellow",
  green: "bg-belt-green",
  blue: "bg-belt-blue",
  brown: "bg-belt-brown",
  black: "bg-belt-black",
}

const KNOT_BG: Record<BeltTier, string> = {
  white: "bg-belt-white",
  yellow: "bg-belt-yellow",
  green: "bg-belt-green",
  blue: "bg-belt-blue",
  brown: "bg-belt-brown",
  black: "bg-belt-black",
}

// A stylized karate belt: a band with a center knot and two hanging tails.
export function Belt({
  tier,
  className,
}: {
  tier: BeltTier
  className?: string
}) {
  const band = BELT_BG[tier]
  const knot = KNOT_BG[tier]
  // White belt needs a visible edge on the light card surface.
  const edge = "ring-1 ring-black/15 shadow-sm"

  return (
    <div
      className={cn("relative flex items-center justify-center", className)}
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
