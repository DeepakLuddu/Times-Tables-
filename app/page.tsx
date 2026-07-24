import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { getProgress } from "@/app/actions/game"
import { GameHome } from "@/components/game-home"

export default async function HomePage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect("/sign-in")

  const progress = await getProgress()
  const firstName = session.user.name?.split(" ")[0] || "friend"

  return (
    <main className="min-h-svh bg-background">
      <GameHome name={firstName} progress={progress} />
    </main>
  )
}
