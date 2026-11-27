/**
 * Router seam: setup (owner: B1). Organisation profile and AI setup.
 *
 * Mounted exactly once in ../router.ts:
 *   operator.setup  organizationProcedure(scope): signed in, scope checked, organization resolved server-side (ctx.organizationId)
 *
 * Add procedures here, never in router.ts. Zod schemas live in
 * ../contracts/setup.ts, service code in ../services/setup/, demo
 * fixtures in @duna/core/demo/setup. Read ./README.md first.
 */
import { organizationProcedure, router } from "../auth";
import { domainSeamStatus, domainSeamStatusSchema } from "./seam-status";

const DOMAIN = "setup";

export const setupOperatorRouter = router({
  // Placeholder so the mount is type-checked and reachable in demo mode.
  // Replace it with real procedures; keep a demo-mode branch in each.
  status: organizationProcedure("sessions:read")
    .output(domainSeamStatusSchema)
    .query(() => domainSeamStatus(DOMAIN)),
});
