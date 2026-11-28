/**
 * Service seam: team-availability (owner: B3a). Staff availability schedules,
 * blackouts, time off and coverage, called from
 * ../../routers/team-availability.ts. Availability itself is decided by the
 * pure `availabilityFor` in @duna/scheduling; this directory loads the data
 * (./inputs), keeps the legacy column readable (./legacy) and records every
 * change with an audit row.
 */
export {
  addBlackout,
  decideTimeOff,
  removeBlackout,
  requestTimeOff,
  staffAvailabilityPage,
  transitionSchedule,
  upsertSchedule,
} from "./availability-service";
export {
  coverageAction,
  coverageGrid,
  coverageRequests,
  openCoverageForUnavailability,
  sessionsNeedingCover,
} from "./coverage-service";
export {
  type DetailedCommitment,
  type MemberAvailability,
  loadAbsenceInputs,
  loadBookingAvailability,
  loadCommitments,
  loadMemberAvailability,
} from "./inputs";
export {
  copyLegacyAvailability,
  type LegacyEditorBlackout,
  type LegacyEditorWindow,
  legacyAvailabilityView,
  migrateLegacyStaffAvailability,
  saveFromLegacyEditor,
} from "./legacy";
export {
  type StaffRow,
  type TeamActor,
  loadOrganizationStaff,
  loadStaff,
  organizationTimezone,
} from "./shared";
