/**
 * B3b data step: copy legacy compensation and income goals from
 * `organization_staff_profiles` into `staff_compensation` and
 * `operator_earnings_goals`. Idempotent: a member already copied is skipped
 * (the old HQ Team editor also copies a member before saving).
 *
 *   DATABASE_URL=… pnpm --filter @duna/api exec tsx scripts/migrate-legacy-staff-compensation.ts [organizationId]
 *
 * Writes go to the primary (DATABASE_URL), never the read replica.
 */
import { log } from "@duna/observability";
import { migrateLegacyStaffCompensation } from "../src/services/team-pay/legacy";

const organizationId = process.argv[2];
const result = await migrateLegacyStaffCompensation(
  organizationId ? { organizationId } : {},
);
log.info("team-pay.legacy.script-finished", {
  organizationId: organizationId ?? "all",
  copied: result.copied,
  alreadyCopied: result.alreadyCopied,
});
