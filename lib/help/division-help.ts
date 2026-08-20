// Pure content generator for Division's wrong-answer help. Division has no
// `bandIndex` (see lib/subjects/division.ts), so heuristics key off
// dividend/divisor/quotient directly. The "Think it" method's mastered-
// multiplication-fact lookup is async (a DB read) and handled separately
// by components/help/DivisionHelp.tsx — this file only builds the
// synchronous content (numbers, prompts, options).

import type { HelpMethod } from "@/lib/subjects/types"
import { buildOptions } from "./shared"

export interface MicroQ {
  prompt: string
  options: number[]
  correctValue: number
}

export interface SeeItPlan {
  dividend: number
  divisor: number
}

export interface MoveItPlan {
  divisor: number
  jumpCount: number
}

export interface ThinkItPlan {
  divisor: number
  quotient: number
  dividend: number
}

export interface DivisionHelpPlan {
  seeIt: { plan: SeeItPlan; microQ: MicroQ }
  moveIt: { plan: MoveItPlan; microQ: MicroQ }
  thinkIt: { plan: ThinkItPlan; microQ: MicroQ }
  recommended: HelpMethod
}

function recommendMethod(dividend: number, divisor: number, quotient: number): HelpMethod {
  if (divisor <= 5 && dividend <= 30) return "see"
  if (quotient <= 10 && divisor <= 10) return "move"
  return "think"
}

export function buildDivisionHelp(dividend: number, divisor: number): DivisionHelpPlan {
  const quotient = dividend / divisor
  return {
    seeIt: {
      plan: { dividend, divisor },
      microQ: {
        prompt: "How many in each group?",
        options: buildOptions(quotient),
        correctValue: quotient,
      },
    },
    moveIt: {
      plan: { divisor, jumpCount: quotient },
      microQ: {
        prompt: "How many jumps did it take?",
        options: buildOptions(quotient),
        correctValue: quotient,
      },
    },
    thinkIt: {
      plan: { divisor, quotient, dividend },
      microQ: {
        prompt: `${divisor} × ? = ${dividend}`,
        options: buildOptions(quotient),
        correctValue: quotient,
      },
    },
    recommended: recommendMethod(dividend, divisor, quotient),
  }
}
