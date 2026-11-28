/**
 * Router seam: team-pay (owner: B3b). Staff compensation, pay periods and pay runs.
 *
 * Mounted exactly once in ../router.ts:
 *   operator.teamPay  organizationProcedure(scope): signed in, scope checked, organization resolved server-side (ctx.organizationId)
 *
 * Add procedures here, never in router.ts. Zod schemas live in
 * ../contracts/team-pay.ts, service code in ../services/team-pay/, demo
 * fixtures in @duna/core/demo/team-pay. Read ./README.md first.
 */
import { organizationProcedure, router } from "../auth";
import { domainSeamStatus, domainSeamStatusSchema } from "./seam-status";

const DOMAIN = "team-pay";

export const teamPayOperatorRouter = router({
  // Placeholder so the mount is type-checked and reachable in demo mode.
  // Replace it with real procedures; keep a demo-mode branch in each.
  status: organizationProcedure("payments:read")
    .output(domainSeamStatusSchema)
    .query(() => domainSeamStatus(DOMAIN)),
});
