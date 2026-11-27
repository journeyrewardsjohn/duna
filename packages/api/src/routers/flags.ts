/**
 * Client-readable feature flags, mounted as `public.flags`.
 *
 * `public.flags.enabled` returns every `clientVisible` registry flag evaluated
 * for the caller. The organization comes from the signed-in actor on the
 * server (never from input); anonymous callers get global rows and defaults.
 * Server code calls isFeatureEnabled() from ../feature-flag-evaluator instead.
 */
import { clientVisibleFeatureFlagKeys } from "@duna/core";
import { z } from "zod";
import { publicProcedure, router } from "../auth";
import { evaluateClientFeatureFlags } from "../feature-flag-evaluator";

const [firstKey, ...otherKeys] = clientVisibleFeatureFlagKeys;

export const clientFeatureFlagsSchema = z.record(
  z.enum([firstKey!, ...otherKeys]),
  z.boolean(),
);

export const flagsPublicRouter = router({
  enabled: publicProcedure.output(clientFeatureFlagsSchema).query(({ ctx }) =>
    evaluateClientFeatureFlags({
      organizationId: ctx.actor?.organizationId,
      context: ctx,
    }),
  ),
});
