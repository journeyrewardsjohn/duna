import type { A11yAllowance } from "./a11y";
import type { QualityAllowance } from "./quality";

/**
 * Defects the automatic checks found on `main` when Q0 landed, so the journeys
 * that already work can pass while each defect has an owner. Each entry names
 * the page, the evidence and the work package that removes it. Delete an entry
 * the moment its defect is fixed; never add one to make a new feature pass
 * (a test that needs an exception uses its own `qualityAllowances`, with a
 * reason a reviewer accepts).
 */
export const knownIssues: readonly QualityAllowance[] = [
  {
    kind: "console-error",
    match: /\/api\/ask-duna\/conversations/,
    reason:
      "S1: every HQ page asks /api/ask-duna/conversations, which answers 401 to the demo actor, so the console logs an error on every HQ page in demo mode. The Ask Duna panel should show its own 'not available here' state without a failing request.",
  },
  {
    kind: "server-error",
    match: /\/api\/messaging\/updates/,
    reason:
      "H3 (HQ Inbox) and P7 (web Concierge): the live-updates stream answers 503 in demo mode; it should report 'live updates not configured yet' without a server error.",
  },
  {
    kind: "console-error",
    match: /\/api\/messaging\/updates/,
    reason: "Same defect as the 503 above, as the browser logs it.",
  },
  {
    kind: "server-error",
    match: /\/api\/mapbox\/token/,
    reason:
      "C3 (Map): with no map token the token route answers 503; the map should show its honest 'not configured yet' state from a normal response.",
  },
  {
    kind: "console-error",
    match: /\/api\/mapbox\/token/,
    reason: "Same defect as the 503 above, as the browser logs it.",
  },
];

/** Accessibility-scan findings on `main`, with the same rules. */
export const knownA11yFindings: readonly A11yAllowance[] = [
  {
    page: /\/training\/practice-plans\/create/,
    match: /searchbox without a name/,
    reason: "H7: the practice plan builder's block search has no label.",
  },
  {
    page: /\/marketing\/audiences(?:$|[?#/])/,
    match: /searchbox without a name/,
    reason: "H13: the Audiences search field has no label.",
  },
  {
    page: /\/(?:ask|account)(?:$|[?#/])/,
    match: /main-landmark/,
    reason: "S1: /ask and /account render without a main landmark.",
  },
];
