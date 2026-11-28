import {
  convertLegacyStaffAvailability,
  isFreeThroughout,
  legacyAvailabilityInputs,
  type StaffAvailabilitySchedule,
  type StaffBlackoutInput,
  type StaffTimeOffInput,
} from "@duna/scheduling";
import { z } from "zod";
import { venueWallTimeToUtc } from "./court-checkout";

const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const localTimeSchema = z.string().regex(/^\d{2}:\d{2}$/);

const weeklySessionSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  startsAt: localTimeSchema,
});

const oneOffSessionSchema = z.object({
  date: localDateSchema,
  startsAt: localTimeSchema,
});

export const sessionScheduleConfigurationSchema = z
  .object({
    mode: z.enum(["flexible", "one-off", "recurring"]),
    timezone: z.string().trim().min(1).max(80),
    startsOn: localDateSchema.optional(),
    endsOn: localDateSchema.optional(),
    weekly: z.array(weeklySessionSchema).max(14).default([]),
    oneOff: z.array(oneOffSessionSchema).max(120).default([]),
    blackoutDates: z.array(localDateSchema).max(120).default([]),
  })
  .superRefine((value, context) => {
    if (value.mode === "recurring") {
      if (!value.startsOn || !value.endsOn || value.startsOn > value.endsOn) {
        context.addIssue({
          code: "custom",
          message: "Recurring sessions need a valid start and end date.",
        });
      }
      if (
        value.startsOn &&
        value.endsOn &&
        new Date(`${value.endsOn}T12:00:00.000Z`).getTime() -
          new Date(`${value.startsOn}T12:00:00.000Z`).getTime() >
          730 * 24 * 60 * 60 * 1_000
      ) {
        context.addIssue({
          code: "custom",
          message: "Recurring session schedules can span at most two years.",
        });
      }
      if (value.weekly.length === 0) {
        context.addIssue({
          code: "custom",
          message: "Choose at least one weekly session day and time.",
        });
      }
    }
    if (value.mode === "one-off" && value.oneOff.length === 0) {
      context.addIssue({
        code: "custom",
        message: "Add at least one one-off session date and time.",
      });
    }
  });

export const virtualDeliveryConfigurationSchema = z.object({
  provider: z.literal("google-meet"),
  createMeetingOnPurchase: z.literal(true),
  inviteCoach: z.literal(true),
  invitePlayer: z.literal(true),
  autoRecord: z.boolean(),
  autoTranscribe: z.boolean(),
  generateAiSummary: z.boolean(),
  recordingConsentRequired: z.literal(true),
});

export type SessionScheduleConfiguration = z.infer<
  typeof sessionScheduleConfigurationSchema
>;
export type VirtualDeliveryConfiguration = z.infer<
  typeof virtualDeliveryConfigurationSchema
>;

export interface SessionDeliveryConfiguration {
  readonly durationMinutes: number;
  readonly deliveryMode: "venue" | "online";
  readonly sessionSchedule?: SessionScheduleConfiguration;
  readonly virtualDelivery?: VirtualDeliveryConfiguration;
  readonly coachAssignmentMode: "all" | "selected";
  readonly coachPersonIds: readonly string[];
  readonly requiredCoachCount: number;
  readonly customerCoachSelection: boolean;
}

export interface SessionCoachAvailability {
  readonly personId: string;
  readonly displayName: string;
  readonly email?: string;
  /** Legacy jsonb, read only while the member has not been copied (B3a). */
  readonly availability: readonly Record<string, unknown>[];
  /** Named schedules, blackouts and time off from the B3a tables. */
  readonly staffAvailability?: {
    readonly schedules: readonly StaffAvailabilitySchedule[];
    readonly blackouts: readonly StaffBlackoutInput[];
    readonly timeOff: readonly StaffTimeOffInput[];
  };
  readonly busyRanges?: readonly {
    readonly startsAt: string;
    readonly endsAt: string;
  }[];
}

export interface BookableSessionOccurrence {
  readonly key: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly localDate: string;
  readonly localTime: string;
  readonly timezone: string;
  readonly availableCoaches: readonly {
    readonly personId: string;
    readonly displayName: string;
  }[];
  readonly requiredCoachCount: number;
}

function object(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}

export function parseSessionDeliveryConfiguration(
  value: Readonly<Record<string, unknown>>,
): SessionDeliveryConfiguration | undefined {
  const durationMinutes = Number(value.durationMinutes ?? 0);
  const deliveryMode = value.deliveryMode === "online" ? "online" : "venue";
  const scheduleResult = sessionScheduleConfigurationSchema.safeParse(
    object(value.sessionSchedule),
  );
  const virtualResult = virtualDeliveryConfigurationSchema.safeParse(
    object(value.virtualDelivery),
  );
  const coachPersonIds = Array.isArray(value.coachPersonIds)
    ? value.coachPersonIds.filter(
        (entry): entry is string =>
          typeof entry === "string" && entry.length > 0,
      )
    : [];
  if (!Number.isSafeInteger(durationMinutes) || durationMinutes < 15) {
    return undefined;
  }
  return {
    durationMinutes,
    deliveryMode,
    sessionSchedule: scheduleResult.success ? scheduleResult.data : undefined,
    virtualDelivery:
      deliveryMode === "online" && virtualResult.success
        ? virtualResult.data
        : undefined,
    coachAssignmentMode:
      value.coachAssignmentMode === "selected" ? "selected" : "all",
    coachPersonIds,
    requiredCoachCount: Math.max(
      1,
      Number.isSafeInteger(Number(value.requiredCoachCount))
        ? Number(value.requiredCoachCount)
        : 1,
    ),
    customerCoachSelection: value.customerCoachSelection !== false,
  };
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function weekday(date: string): number {
  return new Date(`${date}T12:00:00.000Z`).getUTCDay();
}

/**
 * Whether a coach can take an occurrence: one call to the shared
 * availabilityFor (@duna/scheduling). Coaches on the B3a tables use their
 * schedules, blackouts and approved time off; a coach not copied yet uses
 * the legacy jsonb read in the session's time zone, as before. Busy blocks
 * from connected calendars are commitments either way.
 */
function coachAvailable(input: {
  readonly coach: SessionCoachAvailability;
  readonly timezone: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
}): boolean {
  const absences = input.coach.staffAvailability ?? {
    ...legacyAvailabilityInputs(
      convertLegacyStaffAvailability({
        entries: input.coach.availability,
        timezone: input.timezone,
        undatedEffectiveFrom: "1970-01-01",
      }),
      `legacy:${input.coach.personId}`,
    ),
    timeOff: [],
  };
  return isFreeThroughout(
    { staffProfileId: input.coach.personId },
    {
      startsAt: input.startsAt.toISOString(),
      endsAt: input.endsAt.toISOString(),
    },
    {
      schedules: absences.schedules,
      blackouts: absences.blackouts,
      timeOff: absences.timeOff,
      commitments: (input.coach.busyRanges ?? []).map((range, index) => ({
        id: `busy:${index}`,
        kind: "calendar" as const,
        startsAt: range.startsAt,
        endsAt: range.endsAt,
      })),
    },
  );
}

export function sessionOccurrenceKey(input: {
  readonly startsAt: string;
  readonly endsAt: string;
}): string {
  return `${input.startsAt}|${input.endsAt}`;
}

export function generateBookableSessionOccurrences(input: {
  readonly configuration: SessionDeliveryConfiguration;
  readonly coaches: readonly SessionCoachAvailability[];
  readonly now: Date;
  readonly horizonDays?: number;
  readonly limit?: number;
}): readonly BookableSessionOccurrence[] {
  const schedule = input.configuration.sessionSchedule;
  if (!schedule || schedule.mode === "flexible") return [];
  const horizonDays = Math.min(730, Math.max(1, input.horizonDays ?? 180));
  const limit = Math.min(2_000, Math.max(1, input.limit ?? 64));
  const horizonDate = addDays(
    input.now.toISOString().slice(0, 10),
    horizonDays,
  );
  const candidates: { readonly date: string; readonly startsAt: string }[] = [];

  if (schedule.mode === "one-off") {
    candidates.push(...schedule.oneOff);
  } else if (schedule.startsOn && schedule.endsOn) {
    const lastDate =
      schedule.endsOn < horizonDate ? schedule.endsOn : horizonDate;
    for (
      let date = schedule.startsOn;
      date <= lastDate;
      date = addDays(date, 1)
    ) {
      for (const window of schedule.weekly) {
        if (window.weekday === weekday(date)) {
          candidates.push({ date, startsAt: window.startsAt });
        }
      }
    }
  }

  const blackoutDates = new Set(schedule.blackoutDates);
  const occurrences: BookableSessionOccurrence[] = [];
  for (const candidate of candidates.sort((left, right) =>
    `${left.date}T${left.startsAt}`.localeCompare(
      `${right.date}T${right.startsAt}`,
    ),
  )) {
    if (blackoutDates.has(candidate.date)) continue;
    const startsAt = venueWallTimeToUtc(
      `${candidate.date}T${candidate.startsAt}`,
      schedule.timezone,
    );
    const endsAt = new Date(
      startsAt.getTime() + input.configuration.durationMinutes * 60_000,
    );
    if (startsAt <= input.now) continue;
    const availableCoaches = input.coaches.filter((coach) =>
      coachAvailable({
        coach,
        timezone: schedule.timezone,
        startsAt,
        endsAt,
      }),
    );
    if (availableCoaches.length < input.configuration.requiredCoachCount) {
      continue;
    }
    const occurrence = {
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
    };
    occurrences.push({
      key: sessionOccurrenceKey(occurrence),
      ...occurrence,
      localDate: candidate.date,
      localTime: candidate.startsAt,
      timezone: schedule.timezone,
      availableCoaches: availableCoaches.map((coach) => ({
        personId: coach.personId,
        displayName: coach.displayName,
      })),
      requiredCoachCount: input.configuration.requiredCoachCount,
    });
    if (occurrences.length >= limit) break;
  }
  return occurrences;
}

export function validateSessionScheduleConfiguration(
  value: unknown,
): SessionScheduleConfiguration {
  return sessionScheduleConfigurationSchema.parse(value);
}
