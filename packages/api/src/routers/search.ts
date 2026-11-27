/**
 * Router seam: search (owner: B10). Search API (where / when / what) with map bounds and availability.
 *
 * Mounted exactly once in ../router.ts:
 *   public.search  publicProcedure: anonymous allowed, IP rate limited; ctx.actor may still be present
 *   player.search  protectedProcedure: signed-in actor; add .use(requireScope(...)) per procedure
 *
 * Add procedures here, never in router.ts. Zod schemas live in
 * ../contracts/search.ts, service code in ../services/search/, demo
 * fixtures in @duna/core/demo/search. Read ./README.md first.
 */
import { protectedProcedure, publicProcedure, router } from "../auth";
import { domainSeamStatus, domainSeamStatusSchema } from "./seam-status";

const DOMAIN = "search";

export const searchPublicRouter = router({
  // Placeholder so the mount is type-checked and reachable in demo mode.
  // Replace it with real procedures; keep a demo-mode branch in each.
  status: publicProcedure
    .output(domainSeamStatusSchema)
    .query(() => domainSeamStatus(DOMAIN)),
});

export const searchPlayerRouter = router({
  // Placeholder so the mount is type-checked and reachable in demo mode.
  // Replace it with real procedures; keep a demo-mode branch in each.
  status: protectedProcedure
    .output(domainSeamStatusSchema)
    .query(() => domainSeamStatus(DOMAIN)),
});
