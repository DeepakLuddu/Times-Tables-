// Pure content generator for Subtraction's wrong-answer help — mirrors
// lib/help/addition-help.ts's structure. No React here; components/help/
// SubtractionHelp.tsx renders whatever this returns.

import type { HelpMethod } from "@/lib/subjects/types"
import { buildOptions } from "./shared"

export interface MicroQ {
  prompt: string
  options: number[]
  correctValue: number
}

export type SeeItPlan =
  | { kind: "takeAway"; a: number; b: number }
  | { kind: "placeValue"; aTens: number; aOnes: number; bTens: number; bOnes: number }

export interface MoveItPlan {
  start: number
  jumps: number[]
}

export type ThinkItPlan =
  | { kind: "countUp"; steps: string[] }
  | { kind: "regroup"; steps: string[] }

export interface SubtractionHelpPlan {
  seeIt: { plan: SeeItPlan; microQ: MicroQ }
  moveIt: { plan: MoveItPlan; microQ: MicroQ }
  thinkIt: { plan: ThinkItPlan; microQ: MicroQ }
  recommended: HelpMethod
}

// Matches lib/subjects/subtraction.ts's CLAIM_PRIORITY band index 8
// ("Two-digit subtraction with regrouping") — Think it shows place-value
// regrouping specifically for this band, per spec, rather than count-up.
const REGROUPING_BAND_INDEX = 8

function buildSeeIt(a: number, b: number, diff: number): SubtractionHelpPlan["seeIt"] {
  if (a >= 20) {
    const aTens = Math.floor(a / 10)
    const aOnes = a % 10
    const bTens = Math.floor(b / 10)
    const bOnes = b % 10
    return {
      plan: { kind: "placeValue", aTens, aOnes, bTens, bOnes },
      microQ: {
        prompt: `What is ${a} - ${b}?`,
        options: buildOptions(diff),
        correctValue: diff,
      },
    }
  }
  return {
    plan: { kind: "takeAway", a, b },
    microQ: {
      prompt: "How many are left?",
      options: buildOptions(diff),
      correctValue: diff,
    },
  }
}

function buildMoveIt(a: number, b: number, diff: number): SubtractionHelpPlan["moveIt"] {
  // Shorter hop wins: jumping back `b` from `a` is easier when b is small
  // relative to the gap; counting up from b to a is easier when b is close
  // to a (a small forward distance) — the app picks the clearer direction
  // rather than always subtracting backward.
  if (b <= diff) {
    const belowTen = a % 10
    if (belowTen > 0 && belowTen < b) {
      const rest = b - belowTen
      return {
        plan: { start: a, jumps: [-belowTen, -rest] },
        microQ: {
          prompt: "Where do you land?",
          options: buildOptions(diff, [a - belowTen]),
          correctValue: diff,
        },
      }
    }
    return {
      plan: { start: a, jumps: [-b] },
      microQ: {
        prompt: "Where do you land?",
        options: buildOptions(diff),
        correctValue: diff,
      },
    }
  }
  const toNextTen = (10 - (b % 10)) % 10
  if (toNextTen > 0 && toNextTen < diff) {
    const rest = diff - toNextTen
    return {
      plan: { start: b, jumps: [toNextTen, rest] },
      microQ: {
        prompt: "How far did you count?",
        options: buildOptions(diff, [toNextTen]),
        correctValue: diff,
      },
    }
  }
  return {
    plan: { start: b, jumps: [diff] },
    microQ: {
      prompt: "How far did you count?",
      options: buildOptions(diff),
      correctValue: diff,
    },
  }
}

function buildThinkIt(
  a: number,
  b: number,
  diff: number,
  bandIndex?: number,
): SubtractionHelpPlan["thinkIt"] {
  if (bandIndex === REGROUPING_BAND_INDEX) {
    const aTens = Math.floor(a / 10)
    const aOnes = a % 10
    return {
      plan: {
        kind: "regroup",
        steps: [
          `${a} = ${aTens} tens + ${aOnes} ones`,
          `${a} = ${aTens - 1} tens + ${aOnes + 10} ones`,
        ],
      },
      microQ: {
        prompt: `Now what is ${a} - ${b}?`,
        options: buildOptions(diff),
        correctValue: diff,
      },
    }
  }
  const toNextTen = (10 - (b % 10)) % 10
  if (toNextTen > 0 && toNextTen < diff) {
    const rest = diff - toNextTen
    return {
      plan: {
        kind: "countUp",
        steps: [`${b} → ${b + toNextTen} = +${toNextTen}`, `${b + toNextTen} → ${a} = +${rest}`],
      },
      microQ: {
        prompt: `What is ${toNextTen} + ${rest}?`,
        options: buildOptions(diff, [toNextTen, rest]),
        correctValue: diff,
      },
    }
  }
  return {
    plan: { kind: "countUp", steps: [`${b} → ${a} = +${diff}`] },
    microQ: {
      prompt: `What is ${a} - ${b}?`,
      options: buildOptions(diff),
      correctValue: diff,
    },
  }
}

function recommendMethod(a: number, b: number, diff: number, bandIndex?: number): HelpMethod {
  if (bandIndex === REGROUPING_BAND_INDEX) return "think"
  if (b <= 3) return "see"
  const toNextTen = (10 - (b % 10)) % 10
  if (toNextTen > 0 && toNextTen < diff) return "think"
  if (a < 20) return "see"
  if (a < 50) return "move"
  return "think"
}

export function buildSubtractionHelp(
  a: number,
  b: number,
  bandIndex?: number,
): SubtractionHelpPlan {
  const diff = a - b
  return {
    seeIt: buildSeeIt(a, b, diff),
    moveIt: buildMoveIt(a, b, diff),
    thinkIt: buildThinkIt(a, b, diff, bandIndex),
    recommended: recommendMethod(a, b, diff, bandIndex),
  }
}
