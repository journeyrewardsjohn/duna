/**
 * Service seam: setup (owner: B1). Organisation profile and AI-assisted
 * setup from a website address. Called from ../../routers/setup.ts; the
 * router branches on usesDemoData() before anything here touches the
 * database. How it works in plain words: docs/product/club-setup.md.
 *
 * - url-safety.ts: SSRF rules (public http/https names only, resolved
 *   addresses checked, redirects re-checked, same-site pages).
 * - discovery.ts: which pages to read; robots.txt.
 * - reader.ts / extractor.ts: the hosted reader and the AI gateway, behind
 *   seams tests replace.
 * - sanitize.ts / validate.ts: untrusted page text in, verified facts out.
 * - merge.ts: one proposal per fact across pages; a re-read proposes only
 *   differences, with before / after.
 * - runs.ts: start, advance (resumable, lease-fenced), finish, fail, cancel.
 * - proposals.ts / decision-rules.ts: Keep / Edit / Skip and audited apply.
 * - profile.ts: the club profile by hand (no website needed).
 * - readiness.ts: the Club setup readiness list.
 */
export { setupLimits } from "./limits";
export {
  isSetupFailureReason,
  setupFailureMessages,
  setupFailureReasons,
  type SetupFailureReason,
} from "./failure-reasons";
export {
  advanceSetupRun,
  cancelSetupRun,
  getLatestSetupRun,
  getSetupRun,
  processPendingSetupRuns,
  purgeExpiredSetupRunData,
  startSetupRun,
  type SetupRunDependencies,
} from "./runs";
export {
  applySetupProposals,
  decideSetupProposal,
  decideSetupProposalGroup,
  listSetupProposals,
} from "./proposals";
export { loadSetupProfile, updateSetupProfile } from "./profile";
export { computeSetupReadiness } from "./readiness";
