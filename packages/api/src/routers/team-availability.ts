/**
 * Router seam: team-availability (owner: B3a). Staff availability schedules, blackouts, time off and coverage.
 *
 * Mounted exactly once in ../router.ts:
 *   operator.teamAvailability  organizationProcedure(scope): signed in, scope checked, organization resolved server-side (ctx.organizationId)
 *
 * Add procedures here, never in router.ts. Zod schemas live in
 * ../contracts/team-availability.ts, service code in ../services/team-availability/, demo
 * fixtures in @duna/core/demo/team-availability. Read ./README.md first.
 */
import { organizationProcedure, router } from "../auth";
import { domainSeamStatus, domainSeamStatusSchema } from "./seam-status";

const DOMAIN = "team-availability";

export const teamAvailabilityOperatorRouter = router({
  // Placeholder so the mount is type-checked and reachable in demo mode.
  // Replace it with real procedures; keep a demo-mode branch in each.
  status: organizationProcedure("members:read")
    .output(domainSeamStatusSchema)
    .query(() => domainSeamStatus(DOMAIN)),
});
