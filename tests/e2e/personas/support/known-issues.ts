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
export const knownIssues: readonly QualityAllowance[] = [];

/** Accessibility-scan findings on `main`, with the same rules. */
export const knownA11yFindings: readonly A11yAllowance[] = [];
