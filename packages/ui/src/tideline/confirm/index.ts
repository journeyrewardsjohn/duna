/** Confirmation in three tiers (Undo, confirm, strong confirm) with one API, and ProposalCard. */
export {
  ConfirmSlot,
  useConfirm,
  type ConfirmOutcome,
  type ConfirmRequest,
  type ConfirmSlotProps,
  type DialogConfirmRequest,
  type UndoRequest,
  type UseConfirm,
  type UseConfirmOptions,
} from "./confirm";
export {
  confirmProblems,
  initialFocusFor,
  isDestructiveBulk,
  secondStepFor,
  typedMatches,
  type BulkScope,
  type ConfirmRules,
  type ConfirmTier,
  type SecondStep,
} from "./confirm-core";
export {
  ProposalCard,
  type ProposalCardProps,
  type ProposalChange,
} from "./proposal-card";
