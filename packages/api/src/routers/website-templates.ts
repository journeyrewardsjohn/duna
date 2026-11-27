/**
 * Router seam: website-templates (owner: B8b). Website templates and onboarding of an existing site.
 *
 * Mounted exactly once in ../router.ts:
 *   operator.websiteTemplates  organizationProcedure(scope): signed in, scope checked, organization resolved server-side (ctx.organizationId)
 *   public.websiteTemplates  publicProcedure: anonymous allowed, IP rate limited; ctx.actor may still be present
 *
 * Add procedures here, never in router.ts. Zod schemas live in
 * ../contracts/website-templates.ts, service code in ../services/website-templates/, demo
 * fixtures in @duna/core/demo/website-templates. Read ./README.md first.
 */
import { organizationProcedure, publicProcedure, router } from "../auth";
import { domainSeamStatus, domainSeamStatusSchema } from "./seam-status";

const DOMAIN = "website-templates";

export const websiteTemplatesOperatorRouter = router({
  // Placeholder so the mount is type-checked and reachable in demo mode.
  // Replace it with real procedures; keep a demo-mode branch in each.
  status: organizationProcedure("sessions:read")
    .output(domainSeamStatusSchema)
    .query(() => domainSeamStatus(DOMAIN)),
});

export const websiteTemplatesPublicRouter = router({
  // Placeholder so the mount is type-checked and reachable in demo mode.
  // Replace it with real procedures; keep a demo-mode branch in each.
  status: publicProcedure
    .output(domainSeamStatusSchema)
    .query(() => domainSeamStatus(DOMAIN)),
});
