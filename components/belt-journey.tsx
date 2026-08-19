import { Belt } from "@/components/belt"
import { BELT_THRESHOLDS } from "@/lib/mastery"
import { BELT_LABEL } from "@/lib/engine"

// A compact reference strip showing the whole belt ladder at a glance —
// answers "what am I working toward, in general?" before the grid answers
// it per table. Deliberately a static legend rather than a per-child
// computed indicator (each of the 12 tables has its own independent belt,
// so there's no single "current belt" to point at here) — it just makes
// the progression system itself easy to read in one glance.
export function BeltJourney() {
  return (
    <section className="mt-5 rounded-2xl bg-card px-4 py-3 shadow-sm">
      <p className="font-display text-xs font-semibold uppercase tracking-wide text-card-foreground/50">
        Your Belt Journey
      </p>
      <div className="mt-2 flex items-end justify-between gap-1">
        {BELT_THRESHOLDS.map((t, i) => (
          <div
            key={t.belt}
            className="flex flex-1 flex-col items-center gap-1"
          >
            <Belt tier={t.belt} className="h-2.5 w-full" />
            <span className="text-center font-sans text-[9px] font-medium leading-tight text-card-foreground/60">
              {BELT_LABEL[t.belt]}
              {i === BELT_THRESHOLDS.length - 1 && (
                <>
                  <br />
                  <span className="text-card-foreground/40">
                    Full Mastery
                  </span>
                </>
              )}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}
