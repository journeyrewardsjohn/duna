/**
 * Router seam: website-workspace (owner: B8a). Website Changes workspace (flag website.workspace).
 *
 * Mounted exactly once in ../router.ts:
 *   operator.websiteWorkspace  organizationProcedure(scope): signed in, scope checked, organization resolved server-side (ctx.organizationId)
 *
 * Add procedures here, never in router.ts. Zod schemas live in
 * ../contracts/website-workspace.ts, service code in ../services/website-workspace/, demo
 * fixtures in @duna/core/demo/website-workspace. Read ./README.md first.
 */
import { organizationProcedure, router } from "../auth";
import { domainSeamStatus, domainSeamStatusSchema } from "./seam-status";

const DOMAIN = "website-workspace";

export const websiteWorkspaceOperatorRouter = router({
  // Placeholder so the mount is type-checked and reachable in demo mode.
  // Replace it with real procedures; keep a demo-mode branch in each.
  status: organizationProcedure("sessions:read")
    .output(domainSeamStatusSchema)
    .query(() => domainSeamStatus(DOMAIN)),
});
