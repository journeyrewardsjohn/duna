/**
 * Router seam: concierge (owner: B7). Concierge threads, Send card and per-person delivery (flags concierge.channel.*).
 *
 * Mounted exactly once in ../router.ts:
 *   operator.concierge  organizationProcedure(scope): signed in, scope checked, organization resolved server-side (ctx.organizationId)
 *   player.concierge  protectedProcedure: signed-in actor; add .use(requireScope(...)) per procedure
 *
 * Add procedures here, never in router.ts. Zod schemas live in
 * ../contracts/concierge.ts, service code in ../services/concierge/, demo
 * fixtures in @duna/core/demo/concierge. Read ./README.md first.
 */
import { organizationProcedure, protectedProcedure, router } from "../auth";
import { domainSeamStatus, domainSeamStatusSchema } from "./seam-status";

const DOMAIN = "concierge";

export const conciergeOperatorRouter = router({
  // Placeholder so the mount is type-checked and reachable in demo mode.
  // Replace it with real procedures; keep a demo-mode branch in each.
  status: organizationProcedure("messages:read")
    .output(domainSeamStatusSchema)
    .query(() => domainSeamStatus(DOMAIN)),
});

export const conciergePlayerRouter = router({
  // Placeholder so the mount is type-checked and reachable in demo mode.
  // Replace it with real procedures; keep a demo-mode branch in each.
  status: protectedProcedure
    .output(domainSeamStatusSchema)
    .query(() => domainSeamStatus(DOMAIN)),
});
