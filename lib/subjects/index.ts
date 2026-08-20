// Registry of every subject's engine. Everything that iterates "all
// subjects" reads from SUBJECT_ENGINES/SUBJECTS, so this is the one place
// a new subject needs to be wired in to appear everywhere (practice
// routes, Belt Wall tabs, subject picker, ...).

import { additionEngine } from "./addition"
import { divisionEngine } from "./division"
import { multiplicationEngine } from "./multiplication"
import { subtractionEngine } from "./subtraction"
import type { Subject, SubjectEngine } from "./types"

export const SUBJECT_ENGINES: Partial<Record<Subject, SubjectEngine>> = {
  multiplication: multiplicationEngine,
  division: divisionEngine,
  addition: additionEngine,
  subtraction: subtractionEngine,
}

export function getSubjectEngine(subject: Subject): SubjectEngine {
  const engine = SUBJECT_ENGINES[subject]
  if (!engine) throw new Error(`No SubjectEngine registered for "${subject}"`)
  return engine
}

export * from "./types"
export { multiplicationEngine } from "./multiplication"
export { divisionEngine } from "./division"
export { additionEngine } from "./addition"
export { subtractionEngine } from "./subtraction"
