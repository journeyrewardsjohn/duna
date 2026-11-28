/**
 * Service seam: Concierge (owner: B7). Threads (the existing messaging
 * conversations), the Send review, one delivery per person on one frozen
 * channel, inbound replies and each person's channels. Read
 * docs/product/concierge.md.
 *
 * Other packages hand work to Concierge through ONE function:
 * `createConciergeDraftFromHandoff` (it never sends).
 */
export {
  chooseChannel,
  isWithinQuietHours,
  type ChannelChoice,
  type ConciergeMessageKind,
  type RecipientChannelFacts,
} from "./channel-choice";
export {
  conciergeHandoffContextTypes,
  createConciergeDraftFromHandoff,
  ensureConciergeThread,
  handOffToConcierge,
  type ConciergeHandoffContextType,
  type ConciergeHandoffResult,
} from "./handoff";
export {
  CONCIERGE_DELIVER_JOB,
  cancelConciergeSend,
  confirmConciergeSend,
  draftConciergeSend,
  editConciergeDraft,
  loadConciergeDeliveries,
  loadConciergeProposal,
  setConciergeRecipientChannel,
} from "./proposals";
export {
  applyConciergeDeliveryStatus,
  processConciergeDelivery,
} from "./delivery";
export {
  dismissConciergeQuarantine,
  listConciergeQuarantine,
  receiveConciergeEmailWebhook,
  receiveConciergeWhatsappWebhook,
  routeConciergePhoneInbound,
} from "./inbound";
export {
  connectConciergeChannel,
  loadConciergeChannels,
  revokeConciergeEndpoint,
  setConciergeClubMute,
  setConciergePreference,
  verifyConciergeChannel,
} from "./channels";
export {
  assignConciergeThread,
  listConciergeThreads,
  loadConciergeThread,
  setConciergeThreadMute,
} from "./threads";
export { guardedConcierge, ConciergeError } from "./types";
