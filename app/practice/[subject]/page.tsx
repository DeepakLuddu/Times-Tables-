import { GameBoard } from "@/components/game-board"
import { SUBJECT_ENGINES } from "@/lib/subjects"
import type { PracticeSubject } from "@/lib/subjects/types"
import { notFound } from "next/navigation"

// 'mixed' is routable (GameBoard itself gates it client-side on
// eligibility — playerId only exists in localStorage, so that check can't
// happen server-side here).
function isKnownPracticeSubject(value: string): value is PracticeSubject {
  return value === "mixed" || value in SUBJECT_ENGINES
}

export default async function PracticeSubjectPage({
  params,
}: {
  params: Promise<{ subject: string }>
}) {
  const { subject } = await params
  if (!isKnownPracticeSubject(subject)) notFound()
  return <GameBoard mode="practice" practiceSubject={subject} />
}
