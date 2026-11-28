/**
 * B3a data step: copy legacy staff availability
 * (`organization_staff_profiles.availability`) into named schedules,
 * windows and blackouts. Idempotent: a member already copied is skipped, so
 * it is safe to run any number of times (and the service also copies a
 * member before their first availability write).
 *
 *   DATABASE_URL=… pnpm --filter @duna/api exec tsx scripts/migrate-legacy-staff-availability.ts [organizationId]
 *
 * Writes go to the primary (DATABASE_URL), never the read replica.
 */
import { log } from "@duna/observability";
import { migrateLegacyStaffAvailability } from "../src/services/team-availability";

const organizationId = process.argv[2];
const result = await migrateLegacyStaffAvailability(
  organizationId ? { organizationId } : {},
);
log.info("team-availability.legacy.script-finished", {
  organizationId: organizationId ?? "all",
  copied: result.copied,
  alreadyCopied: result.alreadyCopied,
});
