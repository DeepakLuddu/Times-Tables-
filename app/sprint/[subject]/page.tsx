import { GameBoard } from "@/components/game-board"
import { SUBJECT_ENGINES } from "@/lib/subjects"
import type { PracticeSubject } from "@/lib/subjects/types"
import { notFound } from "next/navigation"

// 'mixed' is routable — see app/practice/[subject]/page.tsx for why the
// eligibility gate lives client-side in GameBoard instead of here.
function isKnownPracticeSubject(value: string): value is PracticeSubject {
  return value === "mixed" || value in SUBJECT_ENGINES
}

export default async function SprintSubjectPage({
  params,
}: {
  params: Promise<{ subject: string }>
}) {
  const { subject } = await params
  if (!isKnownPracticeSubject(subject)) notFound()
  return <GameBoard mode="sprint" practiceSubject={subject} />
}
