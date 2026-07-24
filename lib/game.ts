export type Question = {
  factor: number
  multiplier: number
  answer: number
  choices: number[]
}

const QUESTIONS_PER_ROUND = 10

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function makeChoices(answer: number): number[] {
  const choices = new Set<number>([answer])
  let guard = 0
  while (choices.size < 4 && guard < 50) {
    guard++
    const delta = Math.floor(Math.random() * 11) - 5 // -5..5
    const candidate = answer + delta
    if (candidate > 0 && candidate !== answer) choices.add(candidate)
  }
  // Fallback fillers if we couldn't find enough near answers.
  let filler = 1
  while (choices.size < 4) {
    if (!choices.has(filler)) choices.add(filler)
    filler++
  }
  return shuffle(Array.from(choices))
}

/**
 * Build a round of questions.
 * `tables` is the set of factors (1-12) to include.
 * `weights` optionally biases selection toward weaker facts (higher weight = more likely).
 */
export function buildRound(
  tables: number[],
  weights?: Map<string, number>,
): Question[] {
  const pool: { factor: number; multiplier: number }[] = []
  for (const factor of tables) {
    for (let multiplier = 1; multiplier <= 12; multiplier++) {
      pool.push({ factor, multiplier })
    }
  }

  const weighted: { factor: number; multiplier: number }[] = []
  for (const p of pool) {
    const key = `${p.factor}x${p.multiplier}`
    const w = weights?.get(key) ?? 1
    const copies = Math.max(1, Math.round(w))
    for (let i = 0; i < copies; i++) weighted.push(p)
  }

  const questions: Question[] = []
  const used = new Set<string>()
  const shuffledPool = shuffle(weighted)

  for (const p of shuffledPool) {
    if (questions.length >= QUESTIONS_PER_ROUND) break
    const key = `${p.factor}x${p.multiplier}`
    if (used.has(key)) continue
    used.add(key)
    const answer = p.factor * p.multiplier
    questions.push({ factor: p.factor, multiplier: p.multiplier, answer, choices: makeChoices(answer) })
  }

  // If the selected tables are too small to fill a round, allow repeats.
  while (questions.length < QUESTIONS_PER_ROUND && pool.length > 0) {
    const p = pool[Math.floor(Math.random() * pool.length)]
    const answer = p.factor * p.multiplier
    questions.push({ factor: p.factor, multiplier: p.multiplier, answer, choices: makeChoices(answer) })
  }

  return questions
}

export { QUESTIONS_PER_ROUND }
