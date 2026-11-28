/**
 * Every active coach's availability for a date range in one call
 * (`operator.teamAvailability.range`, SCHED-API), so the calendar does not
 * read coaches one by one. The answer is the shared rule's own inputs
 * (`availabilityFor` in @duna/scheduling) without commitments: schedules,
 * blackouts and time off, loaded by team availability's own loader
 * (`loadAbsenceInputs`: four queries, whatever the number of coaches;
 * coaches still on the legacy column are converted the same way).
 */
import { addCalendarDays, wallTimeToInstant } from "@duna/scheduling";
import {
  loadAbsenceInputs,
  loadOrganizationStaff,
  organizationTimezone,
} from "../team-availability";
import { requireDatabase, ScheduleError } from "./shared";

export async function teamAvailabilityRange(input: {
  readonly organizationId: string;
  readonly from: string;
  readonly to: string;
}) {
  requireDatabase();
  if (input.to < input.from) {
    throw new ScheduleError("BAD_REQUEST", "The range must end after it starts.");
  }
  if (addCalendarDays(input.from, 62) < input.to) {
    throw new ScheduleError("BAD_REQUEST", "Ask for at most 62 days at a time.");
  }
  const [staff, timezone] = await Promise.all([
    loadOrganizationStaff(input.organizationId, { activeOnly: true }),
    organizationTimezone(input.organizationId),
  ]);
  const range = {
    startsAt: new Date(wallTimeToInstant(input.from, 0, timezone)),
    endsAt: new Date(
      wallTimeToInstant(addCalendarDays(input.to, 1), 0, timezone),
    ),
  };
  const inputs = await loadAbsenceInputs(staff, range, timezone);
  return {
    from: input.from,
    to: input.to,
    staff: staff
      .toSorted((left, right) => left.displayName.localeCompare(right.displayName))
      .map((member) => {
        const own = inputs.get(member.id);
        return {
          staffProfileId: member.id,
          personId: member.personId,
          displayName: member.displayName,
          schedules: (own?.schedules ?? []).map((schedule) => ({
            id: schedule.id,
            status: schedule.status,
            effectiveFrom: schedule.effectiveFrom,
            ...(schedule.effectiveTo ? { effectiveTo: schedule.effectiveTo } : {}),
            timezone: schedule.timezone,
            windows: schedule.windows.map((window) => ({
              weekday: window.weekday,
              startMinute: window.startMinute,
              endMinute: window.endMinute,
              ...(window.kind ? { kind: window.kind } : {}),
              ...(window.venueId ? { venueId: window.venueId } : {}),
            })),
          })),
          blackouts: (own?.blackouts ?? []).map((blackout) => ({
            id: blackout.id,
            startsAt: blackout.startsAt,
            endsAt: blackout.endsAt,
            ...(blackout.scope ? { scope: blackout.scope } : {}),
            ...(blackout.recurrence ? { recurrence: blackout.recurrence } : {}),
            ...(blackout.timezone ? { timezone: blackout.timezone } : {}),
          })),
          timeOff: own?.timeOff ?? [],
          legacy: own?.legacy ?? false,
        };
      }),
  };
}
