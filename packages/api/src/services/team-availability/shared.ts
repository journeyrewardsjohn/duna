/**
 * Team availability (B3a): shared types, permissions and row mapping.
 *
 * Who may do what (documented in docs/product/team.md):
 * - Read any member's availability and coverage: `members:read` (coaches,
 *   front desk, managers, directors, owners).
 * - Edit availability (schedules, blackouts) and request time off: the
 *   member themselves, or anyone with `members:write` (managers, directors,
 *   owners).
 * - Approve or decline time off and act on coverage: `members:write`, and
 *   never on your own time off unless you are the owner.
 * - Cancel time off: the member who asked, or `members:write`.
 */
import {
  getDatabase,
  getTransactionalDatabase,
  organizationStaffProfiles,
  organizations,
  people,
} from "@duna/db";
import {
  minuteOfDayFromTime,
  type StaffAvailabilitySchedule,
  type StaffAvailabilityWindow,
  timeFromMinuteOfDay,
} from "@duna/scheduling";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import type { ApiActor } from "../../context";

export type Transaction = Parameters<
  Parameters<ReturnType<typeof getTransactionalDatabase>["transaction"]>[0]
>[0];

export interface TeamActor {
  readonly actor: ApiActor;
  readonly organizationId: string;
  readonly requestId: string;
  readonly now: Date;
  readonly ipAddress?: string;
}

export interface StaffRow {
  readonly id: string;
  readonly organizationId: string;
  readonly personId: string;
  readonly displayName: string;
  readonly avatarUrl?: string;
  readonly staffRole: string;
  readonly active: boolean;
  readonly createdAt: Date;
  readonly legacyAvailability: readonly Readonly<Record<string, unknown>>[];
}

export function hasScope(actor: ApiActor, scope: string): boolean {
  return actor.scopes.includes("*") || actor.scopes.includes(scope);
}

export function isOwner(actor: ApiActor): boolean {
  return actor.roles.includes("owner") || actor.scopes.includes("*");
}

export function forbidden(message: string): never {
  throw new TRPCError({ code: "FORBIDDEN", message });
}

export function notFound(message: string): never {
  throw new TRPCError({ code: "NOT_FOUND", message });
}

export function conflict(message: string): never {
  throw new TRPCError({ code: "CONFLICT", message });
}

export function badRequest(message: string): never {
  throw new TRPCError({ code: "BAD_REQUEST", message });
}

/** Self-service or a manager (members:write). */
export function assertCanEditAvailability(
  context: TeamActor,
  staff: StaffRow,
): void {
  if (staff.personId === context.actor.personId) return;
  if (hasScope(context.actor, "members:write")) return;
  forbidden(
    "Only this team member or a manager can change their availability.",
  );
}

export function assertManager(context: TeamActor): void {
  if (!hasScope(context.actor, "members:write")) {
    forbidden("Only a manager can do this.");
  }
}

export function initials(displayName: string): string {
  const letters = displayName
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase())
    .join("");
  return letters.slice(0, 2) || "?";
}

export function staffRef(row: StaffRow) {
  return {
    personId: row.personId,
    displayName: row.displayName,
    initials: initials(row.displayName),
    ...(row.avatarUrl ? { avatarUrl: row.avatarUrl } : {}),
    staffProfileId: row.id,
  };
}

const staffColumns = {
  id: organizationStaffProfiles.id,
  organizationId: organizationStaffProfiles.organizationId,
  personId: organizationStaffProfiles.personId,
  displayName: people.displayName,
  avatarUrl: people.avatarUrl,
  staffRole: organizationStaffProfiles.staffRole,
  active: organizationStaffProfiles.active,
  createdAt: organizationStaffProfiles.createdAt,
  legacyAvailability: organizationStaffProfiles.availability,
};

function toStaffRow(row: {
  id: string;
  organizationId: string;
  personId: string;
  displayName: string;
  avatarUrl: string | null;
  staffRole: string;
  active: boolean;
  createdAt: Date;
  legacyAvailability: readonly Record<string, unknown>[];
}): StaffRow {
  return {
    ...row,
    avatarUrl: row.avatarUrl ?? undefined,
  };
}

export async function loadStaff(
  organizationId: string,
  staffProfileId: string,
): Promise<StaffRow> {
  const [row] = await getDatabase()
    .select(staffColumns)
    .from(organizationStaffProfiles)
    .innerJoin(people, eq(people.id, organizationStaffProfiles.personId))
    .where(
      and(
        eq(organizationStaffProfiles.organizationId, organizationId),
        eq(organizationStaffProfiles.id, staffProfileId),
      ),
    );
  if (!row) notFound("This team member is not part of the organisation.");
  return toStaffRow(row);
}

export async function loadOrganizationStaff(
  organizationId: string,
  options: {
    readonly activeOnly?: boolean;
    readonly ids?: readonly string[];
  } = {},
): Promise<StaffRow[]> {
  const rows = await getDatabase()
    .select(staffColumns)
    .from(organizationStaffProfiles)
    .innerJoin(people, eq(people.id, organizationStaffProfiles.personId))
    .where(
      and(
        eq(organizationStaffProfiles.organizationId, organizationId),
        options.activeOnly
          ? eq(organizationStaffProfiles.active, true)
          : undefined,
        options.ids && options.ids.length > 0
          ? inArray(organizationStaffProfiles.id, [...options.ids])
          : undefined,
      ),
    );
  return rows.map(toStaffRow);
}

export async function organizationTimezone(
  organizationId: string,
): Promise<string> {
  const [row] = await getDatabase()
    .select({ timezone: organizations.timezone })
    .from(organizations)
    .where(eq(organizations.id, organizationId));
  return row?.timezone ?? "UTC";
}

/** "HH:MM[:SS]" → minutes; "24:00:00" (stored end of day) → 1440. */
export function minutesOf(time: string): number {
  return minuteOfDayFromTime(time.slice(0, 5));
}

/** Minutes → the contract's "HH:MM"; 1440 → "00:00" (midnight end). */
export function contractTime(minutes: number): string {
  return timeFromMinuteOfDay(minutes % 1_440);
}

export interface WindowRow {
  readonly id: string;
  readonly weekday: number;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly kind: string;
  readonly label: string | null;
  readonly venueId: string | null;
}

/**
 * Stored windows → contract windows. An overnight window is stored as two
 * rows (… → 24:00 and 00:00 → …) because the table requires end > start;
 * here they are joined back into one window that ends after midnight.
 */
export function joinOvernightWindows(rows: readonly WindowRow[]) {
  const sorted = [...rows].sort(
    (left, right) =>
      left.weekday - right.weekday ||
      minutesOf(left.startsAt) - minutesOf(right.startsAt),
  );
  const used = new Set<string>();
  const windows: {
    id: string;
    weekday: number;
    startMinute: number;
    endMinute: number;
    kind: string;
    label?: string;
    venueId?: string;
  }[] = [];
  for (const row of sorted) {
    if (used.has(row.id)) continue;
    used.add(row.id);
    const startMinute = minutesOf(row.startsAt);
    let endMinute = minutesOf(row.endsAt);
    if (endMinute === 1_440) {
      const next = sorted.find(
        (candidate) =>
          !used.has(candidate.id) &&
          candidate.weekday === (row.weekday + 1) % 7 &&
          minutesOf(candidate.startsAt) === 0 &&
          candidate.kind === row.kind &&
          candidate.label === row.label &&
          candidate.venueId === row.venueId &&
          minutesOf(candidate.endsAt) < startMinute,
      );
      if (next) {
        used.add(next.id);
        endMinute = 1_440 + minutesOf(next.endsAt);
      }
    }
    windows.push({
      id: row.id,
      weekday: row.weekday,
      startMinute,
      endMinute,
      kind: row.kind,
      ...(row.label ? { label: row.label } : {}),
      ...(row.venueId ? { venueId: row.venueId } : {}),
    });
  }
  return windows;
}

/** Contract window input → stored rows (overnight windows split at midnight). */
export function splitWindowForStorage(window: {
  readonly weekday: number;
  readonly startsAt: string;
  readonly endsAt: string;
}): { weekday: number; startsAt: string; endsAt: string }[] {
  const start = minutesOf(window.startsAt);
  const end = minutesOf(window.endsAt);
  if (end > start) {
    return [
      {
        weekday: window.weekday,
        startsAt: timeFromMinuteOfDay(start),
        endsAt: timeFromMinuteOfDay(end),
      },
    ];
  }
  const parts = [
    {
      weekday: window.weekday,
      startsAt: timeFromMinuteOfDay(start),
      endsAt: "24:00",
    },
  ];
  if (end > 0) {
    parts.push({
      weekday: (window.weekday + 1) % 7,
      startsAt: "00:00",
      endsAt: timeFromMinuteOfDay(end),
    });
  }
  return parts;
}

export function toPureSchedule(schedule: {
  readonly id: string;
  readonly status: string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly timezone: string;
  readonly windows: readonly WindowRow[];
}): StaffAvailabilitySchedule {
  const windows: StaffAvailabilityWindow[] = joinOvernightWindows(
    schedule.windows,
  ).map((window) => ({
    weekday: window.weekday,
    startMinute: window.startMinute,
    endMinute: window.endMinute,
    kind: window.kind,
    ...(window.venueId ? { venueId: window.venueId } : {}),
  }));
  return {
    id: schedule.id,
    status: schedule.status as StaffAvailabilitySchedule["status"],
    effectiveFrom: schedule.effectiveFrom,
    ...(schedule.effectiveTo ? { effectiveTo: schedule.effectiveTo } : {}),
    timezone: schedule.timezone,
    windows,
  };
}
