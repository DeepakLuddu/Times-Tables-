// Exhaustive accuracy check for Times Dojo questions + explanations.
// Pure engine, so we can just run it over every fact many times.
import {
  distractorsFor,
  explainFact,
  makeQuestion,
  normalizeFact,
} from "../lib/engine"

let failures = 0
const fail = (msg: string) => {
  failures++
  console.log("FAIL:", msg)
}

const ITER = 300

// 1. Every generated question, across all 144 ordered pairs, many times.
for (let a = 1; a <= 12; a++) {
  for (let b = 1; b <= 12; b++) {
    const [x, y] = normalizeFact(a, b)
    for (let it = 0; it < ITER; it++) {
      const q = makeQuestion([x, y])

      // Answer must be the true product.
      if (q.answer !== q.a * q.b) {
        fail(`answer ${q.answer} != ${q.a}x${q.b}`)
      }
      // Displayed factors must match the fact (either order).
      const [qx, qy] = normalizeFact(q.a, q.b)
      if (qx !== x || qy !== y) fail(`displayed ${q.a}x${q.b} != fact ${x}x${y}`)

      // Exactly 4 options, all positive integers, unique.
      if (q.options.length !== 4) fail(`${x}x${y}: ${q.options.length} options`)
      if (new Set(q.options).size !== q.options.length)
        fail(`${x}x${y}: duplicate options ${q.options}`)
      for (const o of q.options) {
        if (!Number.isInteger(o) || o <= 0)
          fail(`${x}x${y}: bad option ${o}`)
      }
      // Correct answer present exactly once.
      const count = q.options.filter((o) => o === q.answer).length
      if (count !== 1) fail(`${x}x${y}: answer appears ${count}x`)
    }
  }
}

// 2. Distractors are never equal to the correct answer.
for (let a = 1; a <= 12; a++) {
  for (let b = 1; b <= 12; b++) {
    for (let it = 0; it < 50; it++) {
      const ds = distractorsFor(a, b)
      if (ds.length !== 3) fail(`${a}x${b}: ${ds.length} distractors`)
      for (const d of ds) {
        if (d === a * b) fail(`${a}x${b}: distractor equals answer`)
        if (!Number.isInteger(d) || d <= 0) fail(`${a}x${b}: bad distractor ${d}`)
      }
    }
  }
}

// 3. Every explanation states the correct result. Parse the value after the
// last "=" or "→" (the stated result); for the "× 1 is just N" prose case,
// parse the value after "just".
for (let a = 1; a <= 12; a++) {
  for (let b = 1; b <= 12; b++) {
    const lines = explainFact(a, b)
    if (lines.length === 0) fail(`${a}x${b}: no explanation`)
    const text = lines.join(" ")

    const resultMatch = text.match(/(?:=|→)\s*(\d+)/g)
    let stated: number
    if (resultMatch) {
      const lastToken = resultMatch[resultMatch.length - 1]
      stated = Number(lastToken.replace(/[^\d]/g, ""))
    } else {
      const just = text.match(/just\s+(\d+)/)
      stated = just ? Number(just[1]) : NaN
    }

    if (stated !== a * b) {
      fail(
        `${a}x${b}: explanation states ${stated}, product is ${a * b} :: "${text}"`,
      )
    }
  }
}

if (failures === 0) {
  console.log(
    `PASS: ${12 * 12} facts x ${ITER} questions, all distractors, all explanations correct.`,
  )
} else {
  console.log(`${failures} FAILURES`)
  process.exit(1)
}
