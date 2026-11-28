import { appRouter, type OperatorWorkspace } from "@duna/api";
import {
  participationDisplay,
  renderParticipationCopy,
  resolveParticipationRuleV2,
} from "@duna/core";
import { log, report } from "@duna/observability";
import { addCalendarDays, localDateOf } from "@duna/scheduling";
import type { HourlyConditions, SunTimes } from "@duna/tideline-core";
import { cookies } from "next/headers";
import { cache } from "react";
import { getServerCaller } from "@/lib/api";
import { isPermissionDenied } from "@/lib/permission-denied";
import { isNotConfiguredAnswer } from "../money/money-data";
import {
  sessionFromOccurrence,
  type SessionView,
} from "../participation/session-model";
import { getHqSession, hasScope } from "../shell/hq-session";
import type { ShellSession } from "../shell/session-types";
import { withBookingPayments } from "./schedule-desk";
import {
  capabilitiesFrom,
  demoCapabilities,
  type ScheduleCapabilities,
} from "./schedule-capabilities";
import {
  applyDemoStore,
  DEMO_SCHEDULE_COOKIE,
  demoCoaches,
  demoDayItems,
  parseDemoSchedule,
} from "./schedule-demo";
import {
  type CoachFacts,
  type CourtFacts,
  type ItemKind,
  type ItemPerson,
  type ScheduleItem,
  type ScheduleQuery,
  placeToday,
  viewDays,
} from "./schedule-model";

/**
 * Schedule's data (H-SCHEDULE): one server read per request that turns the
 * operator workspace's calendar, its places and courts, the club's group
 * sessions (`operator.catalogSessionOccurrences`) and the day's conditions (`operator.conditions.venueDay`) into what the
 * calendar draws. A failing part never fails the page: conditions and
 * availability are simply left out (and the screen says so).
 */

export interface PlaceFacts {
  readonly id: string;
  readonly name: string;
  readonly timeZone: string;
  readonly courts: readonly (CourtFacts & {
    readonly lit: boolean;
    readonly status: string;
  })[];
}

export interface ScheduleConditions {
  readonly placeId: string;
  readonly placeName: string;
  readonly hours: readonly HourlyConditions[];
  readonly sun: SunTimes | null;
  readonly readAt?: number;
  readonly alert?: {
    readonly headline: string;
    readonly level: "watch" | "stop";
  };
  readonly attribution?: string;
  readonly litCourts: number;
}

/** What a viewer may do here, by the procedures' scopes. */
export interface SchedulePermissions {
  /** Create, move, block, close, cancel (sessions:write). */
  readonly change: boolean;
  /** Refunds, staff prices and free bookings of paid time (payments:write). */
  readonly refund: boolean;
  /** Sees amounts (payments:read, payments:write or payments:collect). */
  readonly money: boolean;
  /** Records payments taken at the desk (payments:collect). */
  readonly collect: boolean;
  /** Check people in: staff with sessions:write, or a coach on their own sessions. */
  readonly checkIn: boolean;
  /** A coach without write access sees their own day by default. */
  readonly ownDayOnly: boolean;
}

export interface ScheduleData {
  readonly organization: string;
  readonly timeZone: string;
  readonly today: string;
  readonly nowMs: number;
  readonly places: readonly PlaceFacts[];
  readonly coaches: readonly CoachFacts[];
  readonly items: readonly ScheduleItem[];
  readonly people: readonly { readonly id: string; readonly name: string }[];
  /** Group sessions of offerings, for the one session panel (Offerings'). */
  readonly sessions: Readonly<Record<string, SessionView>>;
  /** Equipment that can be reserved for a session (not for sale, some free). */
  readonly inventory: readonly {
    readonly id: string;
    readonly label: string;
    readonly available: number;
  }[];
  readonly conditions:
    | { readonly state: "ready"; readonly day: ScheduleConditions }
    | { readonly state: "no-data" | "not-configured" | "many-places" };
  readonly demo: boolean;
  readonly viewerId?: string;
  readonly permissions: SchedulePermissions;
  /** Features whose backend has landed (schedule-capabilities.ts). */
  readonly capabilities: ScheduleCapabilities;
}

/** Every procedure path the API router serves. */
function procedurePaths(): string[] {
  const definition = (
    appRouter as unknown as { _def?: { procedures?: Record<string, unknown> } }
  )._def;
  return Object.keys(definition?.procedures ?? {});
}

export type ScheduleLoad =
  | { readonly state: "ok"; readonly data: ScheduleData }
  | { readonly state: "denied" }
  | { readonly state: "error"; readonly reference: string };

const sessionKinds: Readonly<Record<string, ItemKind>> = {
  "private-lesson": "lesson",
  clinic: "session",
  "open-play": "session",
  tournament: "event",
  league: "event",
  "court-rental": "booking",
  pickup: "booking",
};

function personFromAttendee(
  attendee: OperatorWorkspace["calendar"]["entries"][number]["attendees"][number],
  index: number,
  entryId: string,
): ItemPerson {
  return {
    id:
      attendee.registrationId ??
      attendee.participationId ??
      attendee.personId ??
      `${entryId}:${index}`,
    ...(attendee.personId ? { personId: attendee.personId } : {}),
    name: attendee.displayName,
    checkedIn:
      attendee.status === "checked-in" ||
      attendee.attendanceStatus === "attended",
    ...(attendee.attendanceStatus === "no-show" ? { noShow: true } : {}),
    ...(attendee.status === "payment-pending"
      ? { payment: "due" as const }
      : attendee.status === "paid"
        ? { payment: "paid" as const }
        : {}),
    minor: attendee.isMinor,
  };
}

const goneStatuses = new Set(["cancelled", "declined", "refunded"]);

function groupWords(input: {
  readonly capacity: number;
  readonly booked: number;
  readonly minimum?: number;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly timeZone: string;
  readonly now: Date;
  readonly state?: string;
}) {
  const rule =
    input.minimum && input.minimum > 1
      ? resolveParticipationRuleV2(
          {
            version: 2,
            unit: "player",
            minParticipants: input.minimum,
            minimumPolicy: "run",
            waitlist: false,
            tiers: [],
          },
          { capacity: input.capacity },
        )
      : undefined;
  const display = participationDisplay({
    rule,
    capacity: input.capacity,
    booked: input.booked,
    startsAt: new Date(input.startsAt),
    endsAt: new Date(input.endsAt),
    now: input.now,
    timeZone: input.timeZone,
  });
  return {
    groupStatus: renderParticipationCopy(display.status),
    ...(display.line
      ? { groupLine: renderParticipationCopy(display.line) }
      : {}),
    groupNeedsPeople: display.numbers.needed > 0,
  };
}

/** The workspace's calendar as items. */
export function calendarItems(
  workspace: OperatorWorkspace,
  now: Date,
): ScheduleItem[] {
  const places = new Map(workspace.venues.map((venue) => [venue.id, venue]));
  const courtPlace = new Map(
    workspace.venues.flatMap((venue) =>
      venue.courts.map((court) => [court.id, venue] as const),
    ),
  );
  const items: ScheduleItem[] = [];
  for (const entry of workspace.calendar.entries) {
    const venue =
      (entry.venueId ? places.get(entry.venueId) : undefined) ??
      (entry.courtId ? courtPlace.get(entry.courtId) : undefined);
    const kind: ItemKind =
      entry.sourceType === "operator-block" || entry.sourceType === "busy-block"
        ? "block"
        : entry.sourceType === "booking" || entry.sourceType === "pickup"
          ? "booking"
          : (sessionKinds[entry.kind ?? ""] ?? "session");
    const people = entry.attendees
      .filter((attendee) => !goneStatuses.has(attendee.status))
      .map((attendee, index) => personFromAttendee(attendee, index, entry.id));
    const cancelled = entry.status === "cancelled";
    const source =
      entry.sourceType === "session"
        ? ("calendar-session" as const)
        : entry.sourceType === "booking"
          ? ("court-booking" as const)
          : entry.sourceType === "pickup"
            ? ("pickup" as const)
            : ("block" as const);
    items.push({
      id: entry.id,
      source,
      kind,
      title:
        entry.sourceType === "pickup"
          ? `Player match · ${entry.title}`
          : entry.title,
      who:
        kind === "lesson" || kind === "session"
          ? [entry.coachName, people[0]?.name].filter(Boolean).join(" · ") ||
            undefined
          : kind === "booking"
            ? people[0]?.name
            : entry.sourceType === "busy-block"
              ? "From a connected calendar"
              : undefined,
      startsAt: entry.startsAt,
      endsAt: entry.endsAt,
      timeZone: venue?.timezone ?? entry.timezone,
      ...(venue ? { placeId: venue.id, placeName: venue.name } : {}),
      ...(entry.courtId
        ? { courtId: entry.courtId, courtName: entry.courtName }
        : {}),
      ...(entry.coachPersonId
        ? { coachId: entry.coachPersonId, coachName: entry.coachName }
        : {}),
      status: entry.status,
      ...(cancelled ? { cancelled: true } : {}),
      capacity: entry.capacity,
      booked: entry.participantCount,
      ...(kind === "session" && entry.capacity > 1
        ? groupWords({
            capacity: entry.capacity,
            booked: entry.participantCount,
            startsAt: entry.startsAt,
            endsAt: entry.endsAt,
            timeZone: venue?.timezone ?? entry.timezone,
            now,
          })
        : {}),
      people,
      ...(entry.equipment.length > 0
        ? {
            equipment: entry.equipment.map((row) => ({
              id: row.reservationId,
              label: row.label,
              quantity: row.quantity,
            })),
          }
        : {}),
      // Sessions move by propose + confirm, court bookings by
      // operator.schedule.moveCourtBooking; player matches and blocks stay.
      movable:
        !cancelled &&
        (entry.sourceType === "booking" ||
          (entry.draggable &&
            entry.sourceType === "session" &&
            kind !== "event")),
      ...(kind === "event" ? { href: `/events/${entry.id}` } : {}),
      ...(kind === "block"
        ? {
            reason: entry.title,
            blockMode:
              entry.status === "maintenance"
                ? ("maintenance" as const)
                : ("blocked" as const),
            // A connected calendar's busy time is the coach's, not the club's.
            removable: entry.sourceType === "operator-block",
          }
        : {}),
    });
  }
  // Court overrides (blackouts, maintenance) the calendar does not already show.
  for (const venue of workspace.venues) {
    for (const court of venue.courts) {
      for (const override of court.overrides) {
        if (override.mode !== "blocked" && override.mode !== "maintenance")
          continue;
        const shown = items.some(
          (item) =>
            item.kind === "block" &&
            item.courtId === court.id &&
            item.startsAt === override.startsAt,
        );
        if (shown) continue;
        items.push({
          id: override.id,
          source: "court-override",
          kind: "block",
          title: override.mode === "maintenance" ? "Maintenance" : "Blocked",
          who: override.reason,
          reason: override.reason,
          blockMode: /weather/i.test(override.reason)
            ? "weather"
            : override.mode,
          startsAt: override.startsAt,
          endsAt: override.endsAt,
          timeZone: venue.timezone,
          placeId: venue.id,
          placeName: venue.name,
          courtId: court.id,
          courtName: court.name,
          status: override.mode,
          people: [],
          movable: false,
          removable: true,
        });
      }
    }
  }
  return items;
}

type Occurrence = Awaited<
  ReturnType<
    Awaited<
      ReturnType<typeof getServerCaller>
    >["operator"]["catalogSessionOccurrences"]
  >
>[number];

/** A group session of an offering as an item, in the shared words. */
export function occurrenceItem(
  occurrence: Occurrence,
  now: Date,
): ScheduleItem {
  const participation = occurrence.participation;
  const cancelled = occurrence.status === "cancelled";
  const booked = participation?.bookedCount ?? occurrence.confirmedCount;
  return {
    id: occurrence.id,
    source: "catalog-occurrence",
    kind: "session",
    title: occurrence.title,
    ...(occurrence.coach?.displayName
      ? { who: occurrence.coach.displayName }
      : {}),
    startsAt: occurrence.startsAt,
    endsAt: occurrence.endsAt,
    timeZone: occurrence.venue?.timeZone ?? occurrence.timezone,
    // Where and who (PART-B): the session's own court and coach lanes.
    ...(occurrence.venue
      ? { placeId: occurrence.venue.id, placeName: occurrence.venue.name }
      : {}),
    ...(occurrence.court
      ? { courtId: occurrence.court.id, courtName: occurrence.court.name }
      : {}),
    ...(occurrence.coach
      ? {
          coachId: occurrence.coach.id,
          coachName: occurrence.coach.displayName,
        }
      : {}),
    status: occurrence.status,
    ...(cancelled ? { cancelled: true } : {}),
    capacity: occurrence.capacity,
    booked,
    ...groupWords({
      capacity: occurrence.capacity,
      booked,
      minimum: participation?.minParticipants,
      startsAt: occurrence.startsAt,
      endsAt: occurrence.endsAt,
      timeZone: occurrence.timezone,
      now,
    }),
    people: occurrence.bookings
      .filter((booking) => booking.confirmed)
      .map((booking) => ({
        id: booking.fulfillmentId,
        personId: booking.personId,
        name: booking.displayName,
        checkedIn: booking.attendance === "attended",
        ...(booking.attendance === "no-show" ? { noShow: true } : {}),
      })),
    movable: false,
    href: `/offerings/${occurrence.catalogItemId}?session=${occurrence.id}`,
  };
}

function venueFacts(workspace: OperatorWorkspace): PlaceFacts[] {
  return workspace.venues
    .filter((venue) => venue.status !== "closed")
    .map((venue) => ({
      id: venue.id,
      name: venue.name,
      timeZone: venue.timezone,
      courts: venue.courts
        .filter((court) => court.status !== "closed")
        .map((court) => ({
          id: court.id,
          name: court.name,
          placeId: venue.id,
          timeZone: venue.timezone,
          lit: court.lit,
          status: court.status,
          windows: court.schedule,
          overrides: court.overrides,
        })),
    }));
}

async function conditionsFor(
  caller: Awaited<ReturnType<typeof getServerCaller>>,
  place: PlaceFacts,
  date: string,
  demo: boolean,
): Promise<ScheduleData["conditions"]> {
  try {
    const day = await caller.operator.conditions.venueDay({
      venueId: place.id,
      date,
    });
    // Demo fixtures describe one day; shift them onto the day shown so the
    // demo has conditions every day. Real forecasts are never moved.
    const fixtureDate = day.sun.localDate;
    const shift =
      demo && fixtureDate !== date
        ? Date.parse(`${date}T00:00:00Z`) -
          Date.parse(`${fixtureDate}T00:00:00Z`)
        : 0;
    const instant = (value?: string) =>
      value ? Date.parse(value) + shift : null;
    const hours = day.forecast.hours
      .map((hour) => ({
        at: Date.parse(hour.hourStartsAt) + shift,
        ...(hour.temperatureC !== undefined
          ? { temperatureC: hour.temperatureC }
          : {}),
        ...(hour.windSpeedKph !== undefined
          ? { windSpeedKph: hour.windSpeedKph }
          : {}),
        ...(hour.windGustKph !== undefined
          ? { windGustKph: hour.windGustKph }
          : {}),
        ...(hour.windDirectionDeg !== undefined
          ? { windFromDeg: hour.windDirectionDeg }
          : {}),
        ...(hour.precipitationProbability !== undefined
          ? { precipChancePct: hour.precipitationProbability }
          : {}),
        ...(hour.uvIndex !== undefined ? { uvIndex: hour.uvIndex } : {}),
      }))
      .filter((hour) => localDateOf(hour.at, place.timeZone) === date);
    if (hours.length === 0) return { state: "no-data" };
    const sunrise = instant(day.sun.sunriseAt);
    const sunset = instant(day.sun.sunsetAt);
    const sun: SunTimes | null =
      sunrise !== null && sunset !== null
        ? {
            sunrise,
            sunset,
            civilDawn: instant(day.sun.civilDawnAt),
            civilDusk: instant(day.sun.civilDuskAt),
            goldenHourStart: instant(day.sun.goldenHourStartsAt),
            solarNoon: Math.round((sunrise + sunset) / 2),
            daylight: "normal",
            whiteNight: false,
          }
        : null;
    return {
      state: "ready",
      day: {
        placeId: place.id,
        placeName: place.name,
        hours,
        sun,
        ...(day.forecast.fetchedAt
          ? { readAt: Date.parse(day.forecast.fetchedAt) + shift }
          : {}),
        ...(day.alert
          ? {
              alert: {
                headline: day.alert.headline,
                level: day.alert.level === "stop" ? "stop" : "watch",
              },
            }
          : {}),
        ...(day.forecast.attribution
          ? { attribution: day.forecast.attribution }
          : {}),
        litCourts: place.courts.filter((court) => court.lit).length,
      },
    };
  } catch (error) {
    if (isNotConfiguredAnswer(error) || isPermissionDenied(error)) {
      return { state: "not-configured" };
    }
    report(error, { event: "hq.schedule.conditions_failed" });
    return { state: "no-data" };
  }
}

export function schedulePermissions(
  session: ShellSession,
): SchedulePermissions {
  const change = hasScope(session, "sessions:write");
  const isCoach = session.roles.includes("coach");
  const refund = hasScope(session, "payments:write");
  const collect = hasScope(session, "payments:collect");
  return {
    change,
    refund,
    money: refund || collect || hasScope(session, "payments:read"),
    collect,
    checkIn: change || isCoach,
    ownDayOnly: !change && isCoach,
  };
}

async function demoStore() {
  return parseDemoSchedule((await cookies()).get(DEMO_SCHEDULE_COOKIE)?.value);
}

/** Loads everything the view in `query` shows. Cached per request. */
export const loadSchedule = cache(
  async (query: ScheduleQuery, nowMs = Date.now()): Promise<ScheduleLoad> => {
    const session = await getHqSession();
    const caller = await getServerCaller();
    const now = new Date(nowMs);
    let workspace: OperatorWorkspace;
    try {
      workspace = await caller.operator.workspace();
    } catch (error) {
      if (isPermissionDenied(error)) return { state: "denied" };
      const reference = report(error, { event: "hq.schedule.load_failed" });
      return { state: "error", reference };
    }
    const timeZone = workspace.organization.timezone;
    const places = venueFacts(workspace);
    const days = viewDays(query);
    const from = days[0]!;
    const to = days.at(-1)!;
    const zone =
      places.find((place) => place.id === query.place)?.timeZone ??
      places[0]?.timeZone ??
      timeZone;
    const today = placeToday(nowMs, zone);
    const people = workspace.people
      .filter((person) => person.status === "active")
      .map((person) => ({ id: person.personId, name: person.displayName }));

    let items = calendarItems(workspace, now);
    let coaches: CoachFacts[] = workspace.staff
      .filter(
        (member) =>
          member.active &&
          ["coach", "director", "manager"].includes(member.role),
      )
      .map((member) => ({
        id: member.personId,
        name: member.displayName,
        staffProfileId: member.id,
      }));

    const demo = session.demo;
    if (demo && places[0]) {
      const place = places[0];
      coaches =
        coaches.length > 0
          ? coaches
          : demoCoaches.map((coach) => ({ ...coach }));
      const store = await demoStore();
      items = applyDemoStore(
        [
          ...items,
          ...demoDayItems({
            // The agenda's day strip shows three days either side.
            from: addCalendarDays(from, -4),
            to: addCalendarDays(to, 4),
            zone: place.timeZone,
            today,
            nowMs,
            placeId: place.id,
            placeName: place.name,
            courts: place.courts,
            people,
          }),
        ],
        store,
        {
          zone: place.timeZone,
          placeId: place.id,
          placeName: place.name,
          courts: place.courts,
          coaches,
        },
      );
    }

    // Group sessions without their state yet get it in the shared words.
    items = items.map((item) =>
      item.kind === "session" && !item.groupStatus && (item.capacity ?? 0) > 1
        ? {
            ...item,
            ...groupWords({
              capacity: item.capacity!,
              booked: item.people.length || (item.booked ?? 0),
              minimum: item.minimum,
              startsAt: item.startsAt,
              endsAt: item.endsAt,
              timeZone: item.timeZone,
              now,
            }),
          }
        : item,
    );

    // Group sessions of offerings: shown in the shared words.
    const sessions: Record<string, SessionView> = {};
    try {
      const occurrences = await caller.operator.catalogSessionOccurrences({
        from: new Date(
          Date.parse(`${addCalendarDays(from, -1)}T00:00:00Z`),
        ).toISOString(),
        to: new Date(
          Date.parse(`${addCalendarDays(to, 2)}T00:00:00Z`),
        ).toISOString(),
      });
      items = [
        ...items,
        ...occurrences.map((occurrence) => occurrenceItem(occurrence, now)),
      ];
      for (const occurrence of occurrences) {
        sessions[occurrence.id] = sessionFromOccurrence(occurrence, {
          now,
          clubName: workspace.organization.name,
        });
      }
      // The calendar shows the same shared words as the session panel.
      items = items.map((item) => {
        const view =
          item.source === "catalog-occurrence" ? sessions[item.id] : undefined;
        return view
          ? {
              ...item,
              groupStatus: view.status,
              ...(view.line ? { groupLine: view.line } : {}),
              groupNeedsPeople: view.display.numbers.needed > 0,
            }
          : item;
      });
    } catch (error) {
      if (!isPermissionDenied(error) && !isNotConfiguredAnswer(error)) {
        log.warn("hq.schedule.sessions_unavailable", {});
      }
    }

    // Court bookings' money, one read for the range (money permission only).
    const permissionsNow = schedulePermissions(session);
    if (permissionsNow.money) {
      try {
        const answer = await caller.operator.schedule.bookingPayments({
          from: new Date(
            Date.parse(`${addCalendarDays(from, -1)}T00:00:00Z`),
          ).toISOString(),
          to: new Date(
            Date.parse(`${addCalendarDays(to, 2)}T00:00:00Z`),
          ).toISOString(),
        });
        items = withBookingPayments(items, answer.bookings);
      } catch (error) {
        if (!isPermissionDenied(error) && !isNotConfiguredAnswer(error)) {
          log.warn("hq.schedule.booking_payments_unavailable", {});
        }
      }
    }

    // Coaches' availability is read only when the person needs it (creating,
    // moving, "Who is free"): see `coachAvailabilityAction`. Reading it for
    // every page view would spend one request per coach.

    const permissions = permissionsNow;
    const conditionsPlace =
      places.find((place) => place.id === query.place) ??
      (places.length === 1 ? places[0] : undefined);
    const conditions: ScheduleData["conditions"] =
      query.view === "week"
        ? { state: "no-data" }
        : conditionsPlace
          ? await conditionsFor(caller, conditionsPlace, query.date, demo)
          : places.length > 1
            ? { state: "many-places" }
            : { state: "no-data" };

    return {
      state: "ok",
      data: {
        organization: workspace.organization.name,
        timeZone: zone,
        today,
        nowMs,
        places,
        coaches,
        items,
        people,
        sessions,
        // The demo club has no equipment store to reserve from.
        inventory: (demo ? [] : workspace.inventory)
          .filter(
            (item) =>
              item.purpose !== "sale" &&
              item.quantityOnHand > item.quantityReserved,
          )
          .map((item) => ({
            id: item.id,
            label: `${item.itemTitle}${item.variantTitle && item.variantTitle !== item.itemTitle ? ` · ${item.variantTitle}` : ""}`,
            available: item.quantityOnHand - item.quantityReserved,
          })),
        conditions,
        demo,
        ...(session.person ? { viewerId: session.person.id } : {}),
        permissions,
        capabilities: demo
          ? demoCapabilities
          : capabilitiesFrom(procedurePaths()),
      },
    };
  },
);
