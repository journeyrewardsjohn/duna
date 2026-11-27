/**
 * Provider readiness for the owner, mounted as `admin.readiness`.
 *
 * `admin.readiness.providers` is Super Admin only and returns provider names,
 * statuses and the NAMES of missing environment variables, never values. A
 * later package renders it as a "Production readiness" page.
 */
import { router, superAdminProcedure } from "../auth";
import {
  loadProviderReadiness,
  providerReadinessSchema,
} from "../provider-readiness";

export const readinessAdminRouter = router({
  providers: superAdminProcedure
    .output(providerReadinessSchema)
    .query(() => loadProviderReadiness()),
});
