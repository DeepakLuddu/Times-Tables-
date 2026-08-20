import { Clock, Flame, ShieldCheck, Trophy, Users } from "lucide-react"
import Image from "next/image"
import Link from "next/link"

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center px-6 py-10">
      <div className="flex flex-col items-center text-center">
        <Image
          src="/dojo-mascot.png"
          alt="Maths Dojo mascot, a red panda in a karate gi"
          width={180}
          height={180}
          priority
          className="size-44 rounded-full border-4 border-primary/40 object-cover shadow-xl"
        />
        <h1 className="mt-2 font-display text-5xl font-bold text-primary">
          Maths Dojo
        </h1>
        <p className="mt-2 text-balance font-display text-lg font-semibold text-foreground">
          Train your maths. Earn your black belts.
        </p>
        <p className="mt-1 text-balance font-sans text-base text-foreground/70">
          Master addition, subtraction, multiplication and division through
          personalised practice, challenges and rewards.
        </p>
      </div>

      <div className="mt-10 flex w-full flex-col gap-4">
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
              Belt Wall
            </span>
            <span className="font-sans text-sm text-foreground/60">
              See your belts and what to work on next.
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
