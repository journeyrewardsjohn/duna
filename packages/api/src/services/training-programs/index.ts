/**
 * Service seam: training-programs (owner: B4). Programs, their sessions
 * (`training_events`), conflicts, after-practice records and practice
 * plans, called from ../../routers/training-programs.ts. Pure schedule and
 * timeline maths live in ./schedule and ./plan-timeline; ./legacy keeps
 * programs from the legacy training workspace readable and copies them once
 * on first write. See docs/product/training.md.
 */
export {
  copyLegacyProgramStructure,
  effectiveStructure,
  LEGACY_PROGRAM_COPIED,
  legacyExceptions,
  legacySlots,
} from "./legacy";
export {
  blockLoad,
  checkTimeline,
  planTotals,
  proposeBlocks,
  timelineMinutes,
} from "./plan-timeline";
export {
  listPracticePlans,
  practicePlanDetail,
  proposePracticePlan,
  savePracticePlan,
} from "./plans-service";
export { followedPeople, myPrograms, mySchedule } from "./player-service";
export {
  activateProgram,
  cancelProgram,
  createProgram,
  datesInSentence,
  listPrograms,
  programDetail,
  programStatus,
  programSummaries,
  proposeFromSentence,
  updateProgram,
} from "./programs-service";
export {
  currentWeekNumber,
  generateOccurrences,
  planRegeneration,
  programWeeks,
} from "./schedule";
export {
  addSession,
  assignSessionCoaches,
  cancelSession,
  listConflicts,
  listSessions,
  recordSessionOutcome,
  resolveConflict,
  sessionOutcome,
  setSessionPlan,
} from "./sessions-service";
export type { TrainingContext } from "./shared";
