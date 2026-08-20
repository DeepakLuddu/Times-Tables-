// Pure content generator for Addition's wrong-answer help — decides which
// visual variant each method uses (per number size, spec §13) and builds
// the one required micro-question for each. No React here; components/
// help/AdditionHelp.tsx renders whatever this returns.

import type { HelpMethod } from "@/lib/subjects/types"
import { buildOptions } from "./shared"

export interface MicroQ {
  prompt: string
  options: number[]
  correctValue: number
}

export type SeeItPlan =
  | { kind: "counters"; a: number; b: number }
  | { kind: "tenFrame"; a: number; b: number; complement: number; remainder: number }
  | { kind: "placeValue"; aTens: number; aOnes: number; bTens: number; bOnes: number }

export interface MoveItPlan {
  start: number
  jumps: number[]
}

export interface ThinkItPlan {
  strategyName: string
  steps: string[]
}

export interface AdditionHelpPlan {
  seeIt: { plan: SeeItPlan; microQ: MicroQ }
  moveIt: { plan: MoveItPlan; microQ: MicroQ }
  thinkIt: { plan: ThinkItPlan; microQ: MicroQ }
  recommended: HelpMethod
}

function buildSeeIt(a: number, b: number, sum: number): AdditionHelpPlan["seeIt"] {
  if (a >= 10 || b >= 10) {
    const aTens = Math.floor(a / 10)
    const aOnes = a % 10
    const bTens = Math.floor(b / 10)
    const bOnes = b % 10
    return {
      plan: { kind: "placeValue", aTens, aOnes, bTens, bOnes },
      microQ: {
        prompt: `What is ${a} + ${b}?`,
        options: buildOptions(sum, [aOnes + bOnes]),
        correctValue: sum,
      },
    }
  }
  if (sum > 10) {
    const complement = 10 - a
    const remainder = b - complement
    return {
      plan: { kind: "tenFrame", a, b, complement, remainder },
      microQ: {
        prompt: `What is 10 + ${remainder}?`,
        options: buildOptions(sum, [10, remainder]),
        correctValue: sum,
      },
    }
  }
  return {
    plan: { kind: "counters", a, b },
    microQ: {
      prompt: "How many counters in total?",
      options: buildOptions(sum),
      correctValue: sum,
    },
  }
}

function buildMoveIt(a: number, b: number, sum: number): AdditionHelpPlan["moveIt"] {
  const toNextTen = (10 - (a % 10)) % 10
  if (toNextTen > 0 && toNextTen < b) {
    const rest = b - toNextTen
    return {
      plan: { start: a, jumps: [toNextTen, rest] },
      microQ: {
        prompt: "Where do you land?",
        options: buildOptions(sum, [a + toNextTen]),
        correctValue: sum,
      },
    }
  }
  return {
    plan: { start: a, jumps: [b] },
    microQ: {
      prompt: "Where do you land?",
      options: buildOptions(sum),
      correctValue: sum,
    },
  }
}

function buildThinkIt(a: number, b: number, sum: number): AdditionHelpPlan["thinkIt"] {
  if (a === b) {
    return {
      plan: { strategyName: "Doubles", steps: [`${a} + ${a} = double ${a}`] },
      microQ: {
        prompt: `What is double ${a}?`,
        options: buildOptions(sum),
        correctValue: sum,
      },
    }
  }
  if (Math.abs(a - b) === 1) {
    const small = Math.min(a, b)
    return {
      plan: {
        strategyName: "Near doubles",
        steps: [`double ${small} = ${small * 2}`, "then one more"],
      },
      microQ: {
        prompt: `What is ${small * 2} + 1?`,
        options: buildOptions(sum, [small * 2]),
        correctValue: sum,
      },
    }
  }
  if (sum === 10 || sum === 20) {
    return {
      plan: { strategyName: "Number bonds", steps: [`${a} and ${b} are a number bond`] },
      microQ: {
        prompt: `What is ${a} + ${b}?`,
        options: buildOptions(sum),
        correctValue: sum,
      },
    }
  }
  const toNextTen = a < 10 ? (10 - a) % 10 : 0
  if (toNextTen > 0 && toNextTen < b) {
    const remainder = b - toNextTen
    return {
      plan: {
        strategyName: "Make 10",
        steps: [`${a} + ${toNextTen} = 10`, `${b} = ${toNextTen} + ${remainder}`],
      },
      microQ: {
        prompt: `What is 10 + ${remainder}?`,
        options: buildOptions(sum, [10, remainder]),
        correctValue: sum,
      },
    }
  }
  const aTens = Math.floor(a / 10) * 10
  const aOnes = a % 10
  const bTens = Math.floor(b / 10) * 10
  const bOnes = b % 10
  const tensSum = aTens + bTens
  const onesSum = aOnes + bOnes
  return {
    plan: {
      strategyName: "Add tens first",
      steps: [`${aTens || 0} + ${bTens || 0} = ${tensSum}`, `then the ones: ${aOnes} + ${bOnes} = ${onesSum}`],
    },
    microQ: {
      prompt: `What is ${tensSum} + ${onesSum}?`,
      options: buildOptions(sum, [tensSum, onesSum]),
      correctValue: sum,
    },
  }
}

function recommendMethod(a: number, b: number): HelpMethod {
  if (a === b || Math.abs(a - b) === 1 || a + b === 10 || a + b === 20) return "think"
  const toNextTen = a < 10 ? (10 - a) % 10 : 0
  if (toNextTen > 0 && toNextTen < b) return "think"
  const largest = Math.max(a, b)
  if (largest < 10) return "see"
  if (largest < 30) return "move"
  return "think"
}

export function buildAdditionHelp(a: number, b: number): AdditionHelpPlan {
  const sum = a + b
  return {
    seeIt: buildSeeIt(a, b, sum),
    moveIt: buildMoveIt(a, b, sum),
    thinkIt: buildThinkIt(a, b, sum),
    recommended: recommendMethod(a, b),
  }
}
