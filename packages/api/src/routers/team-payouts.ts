/**
 * Router seam: team-payouts (owner: B3c). 1099 contractor payouts (flag team.contractorPayouts).
 *
 * Mounted exactly once in ../router.ts:
 *   operator.teamPayouts  organizationProcedure(scope): signed in, scope checked, organization resolved server-side (ctx.organizationId)
 *
 * Add procedures here, never in router.ts. Zod schemas live in
 * ../contracts/team-payouts.ts, service code in ../services/team-payouts/, demo
 * fixtures in @duna/core/demo/team-payouts. Read ./README.md first.
 */
import { organizationProcedure, router } from "../auth";
import { domainSeamStatus, domainSeamStatusSchema } from "./seam-status";

const DOMAIN = "team-payouts";

export const teamPayoutsOperatorRouter = router({
  // Placeholder so the mount is type-checked and reachable in demo mode.
  // Replace it with real procedures; keep a demo-mode branch in each.
  status: organizationProcedure("payments:read")
    .output(domainSeamStatusSchema)
    .query(() => domainSeamStatus(DOMAIN)),
});
