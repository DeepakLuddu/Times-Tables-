// Shared helpers for the per-subject wrong-answer help content generators
// (lib/help/addition-help.ts etc.) — building the small multiple-choice
// option sets used by each method's required MicroQuestion step.

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

// Builds a small shuffled option set around `correct`, optionally forcing
// specific plausible-but-wrong values (e.g. intermediate step values) to
// be included ahead of generic near-miss padding.
export function buildOptions(
  correct: number,
  near: number[] = [],
  count = 3,
): number[] {
  const candidates = [
    ...near,
    correct + 1,
    correct - 1,
    correct + 2,
    correct - 2,
    correct + 10,
    correct - 10,
  ]
  const seen = new Set([correct])
  const picked: number[] = []
  for (const c of candidates) {
    if (c < 0 || seen.has(c)) continue
    seen.add(c)
    picked.push(c)
    if (picked.length >= count) break
  }
  let pad = correct + count + 1
  while (picked.length < count) {
    if (pad >= 0 && !seen.has(pad)) {
      seen.add(pad)
      picked.push(pad)
    }
    pad++
  }
  return shuffle([correct, ...picked])
}
