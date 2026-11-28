import {
  appRouter,
  type OperatorDivisionDetail,
  type OperatorSessionDetail,
  type OperatorWorkspace,
  type TicketApprovalSummary,
  type TournamentCompetitionSnapshot,
} from "@duna/api";
import { formatMoney, formatVenueTime } from "@duna/core";
import { log, report } from "@duna/observability";
import { cookies } from "next/headers";
import { cache } from "react";
import { getServerCaller } from "@/lib/api";
import { isPermissionDenied } from "@/lib/permission-denied";
import { isNotConfiguredAnswer } from "../money/money-data";
import { schedulePermissions } from "../schedule/schedule-data";
import { getHqSession, hasScope } from "../shell/hq-session";
import type { ShellSession } from "../shell/session-types";
import {
  capabilitiesFrom,
  demoCapabilities,
  type EventCapabilities,
} from "./events-capabilities";
import {
  applyDemoToDetail,
  DEMO_EVENTS_COOKIE,
  demoEvent,
  demoPlace,
  demoSessions,
  isDemoEventId,
  parseDemoEvents,
} from "./events-demo";
import {
  eventPermissionsFrom,
  eventRows,
  eventView,
  type EventPermissions,
  type EventRow,
  type EventView,
} from "./events-model";

/**
 * Events' data (H-EVENTS): one server read per request. The list reads the
 * operator workspace (every session and registration) and, for people who
 * may approve tickets, the approvals waiting. An open event reads its
 * detail, each division's detail and the competition snapshot (pools,
 * rounds and scores). A failing part never fails the page: the snapshot or
 * a division is simply left out and the screen says so.
 */

export interface EventsContext {
  readonly organization: string;
  readonly timeZone: string;
  readonly nowMs: number;
  readonly demo: boolean;
  readonly permissions: EventPermissions;
  readonly capabilities: EventCapabilities;
  /** Where the public event pages are. */
  readonly publicBase: string;
}

export interface TicketApprovalRow {
  readonly orderId: string;
  readonly ticketTypeId: string;
  readonly sessionId: string;
  readonly event: string;
  readonly ticket: string;
  readonly buyer: string;
  readonly quantity: number;
  readonly total: string;
  readonly purchased: string;
}

export type EventListLoad =
  | {
      readonly state: "ok";
      readonly rows: readonly EventRow[];
      readonly approvals: readonly TicketApprovalRow[];
      readonly context: EventsContext;
    }
  | { readonly state: "denied" }
  | { readonly state: "error"; readonly reference: string };

export type EventLoad =
  | {
      readonly state: "ok";
      readonly view: EventView;
      readonly approvals: readonly TicketApprovalRow[];
      /** Parts that could not be read (the rest works). */
      readonly partial: readonly string[];
      readonly context: EventsContext;
    }
  | { readonly state: "missing" }
  | { readonly state: "denied" }
  | { readonly state: "error"; readonly reference: string };

/** Every procedure path the API router serves. */
function procedurePaths(): string[] {
  const definition = (
    appRouter as unknown as { _def?: { procedures?: Record<string, unknown> } }
  )._def;
  return Object.keys(definition?.procedures ?? {});
}

/**
 * Role rules for Events. An event's money (what it collected, its orders,
 * refunds and fees) is a payments read, as in People: owners, managers and
 * accountants. Collecting at the desk (payments:collect, a coach or the
 * front desk) does not show an event's money. Refunds are payments:write.
 */
export function eventPermissions(session: ShellSession): EventPermissions {
  const schedule = schedulePermissions(session);
  return eventPermissionsFrom({
    change: schedule.change,
    checkIn: schedule.checkIn,
    paymentsRead: hasScope(session, "payments:read"),
    paymentsWrite: hasScope(session, "payments:write"),
    messagesPropose: hasScope(session, "messages:propose"),
  });
}

function publicBase(): string {
  return (
    process.env.NEXT_PUBLIC_DUNA_WEB_URL?.replace(/\/$/, "") ??
    process.env.NEXT_PUBLIC_WEB_URL?.replace(/\/$/, "") ??
    "https://duna.coach"
  );
}

async function demoStore() {
  return parseDemoEvents((await cookies()).get(DEMO_EVENTS_COOKIE)?.value);
}

function approvalRow(
  approval: TicketApprovalSummary,
  timeZone: string,
): TicketApprovalRow {
  return {
    orderId: approval.orderId,
    ticketTypeId: approval.ticketTypeId,
    sessionId: approval.sessionId,
    event: approval.eventTitle,
    ticket: approval.ticketName,
    buyer: approval.buyerName,
    quantity: approval.quantity,
    total: formatMoney(approval.totalMinor, approval.currency),
    purchased: formatVenueTime(approval.purchasedAt, timeZone, "en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }),
  };
}

async function approvalsFor(
  caller: Awaited<ReturnType<typeof getServerCaller>>,
  permissions: EventPermissions,
  timeZone: string,
): Promise<TicketApprovalRow[]> {
  // Approving issues tickets someone paid for: owners (payments:write) only.
  if (!permissions.refund) return [];
  try {
    const approvals = await caller.operator.pendingTicketApprovals();
    return approvals.map((approval) => approvalRow(approval, timeZone));
  } catch (error) {
    if (!isPermissionDenied(error) && !isNotConfiguredAnswer(error)) {
      log.warn("hq.events.approvals_unavailable", {});
    }
    return [];
  }
}

function contextOf(
  session: ShellSession,
  workspace: OperatorWorkspace,
  nowMs: number,
): EventsContext {
  return {
    organization: workspace.organization.name,
    timeZone: workspace.organization.timezone,
    nowMs,
    demo: session.demo,
    permissions: eventPermissions(session),
    capabilities: session.demo
      ? demoCapabilities
      : capabilitiesFrom(procedurePaths()),
    publicBase: publicBase(),
  };
}

/** The Events list. Cached per request. */
export const loadEventList = cache(
  async (nowMs = Date.now()): Promise<EventListLoad> => {
    const session = await getHqSession();
    const caller = await getServerCaller();
    let workspace: OperatorWorkspace;
    try {
      workspace = await caller.operator.workspace();
    } catch (error) {
      if (isPermissionDenied(error)) return { state: "denied" };
      const reference = report(error, { event: "hq.events.list_failed" });
      return { state: "error", reference };
    }
    const context = contextOf(session, workspace, nowMs);
    let sessions = workspace.sessions;
    if (session.demo) {
      const store = await demoStore();
      const place = demoPlace(workspace);
      const fixtures = demoSessions(place, nowMs, store);
      sessions = [
        ...sessions.map((entry) =>
          store.cancelled.includes(entry.id)
            ? { ...entry, status: "cancelled" as const }
            : entry,
        ),
        ...fixtures,
      ];
      const registrations = [
        ...workspace.eventRegistrations,
        ...fixtures.flatMap((fixture) => {
          const event = demoEvent(fixture.id, place, nowMs, store);
          return (event?.detail.teams ?? [])
            .filter((team) => team.selectionStatus === "confirmed")
            .map((team) => ({
              id: team.registrationId,
              sessionId: fixture.id,
              personId: team.id,
              displayName: team.captainName,
              status: "confirmed" as const,
              ticketCount: team.expectedTeamSize,
              registeredAt: team.registeredAt,
            }));
        }),
      ];
      return {
        state: "ok",
        rows: eventRows(sessions, registrations, nowMs),
        approvals: await approvalsFor(
          caller,
          context.permissions,
          context.timeZone,
        ),
        context,
      };
    }
    return {
      state: "ok",
      rows: eventRows(sessions, workspace.eventRegistrations, nowMs),
      approvals: await approvalsFor(
        caller,
        context.permissions,
        context.timeZone,
      ),
      context,
    };
  },
);

/** One open event. Cached per request, so every tab's page shares the read. */
export const loadEvent = cache(
  async (sessionId: string, nowMs = Date.now()): Promise<EventLoad> => {
    const session = await getHqSession();
    const caller = await getServerCaller();
    let workspace: OperatorWorkspace;
    try {
      workspace = await caller.operator.workspace();
    } catch (error) {
      if (isPermissionDenied(error)) return { state: "denied" };
      const reference = report(error, { event: "hq.events.event_failed" });
      return { state: "error", reference };
    }
    const context = contextOf(session, workspace, nowMs);
    const partial: string[] = [];
    let detail: OperatorSessionDetail;
    let divisions: OperatorDivisionDetail[] = [];
    let competition: TournamentCompetitionSnapshot | undefined;
    let courts: { id: string; name: string }[];

    if (session.demo && isDemoEventId(sessionId)) {
      const store = await demoStore();
      const place = demoPlace(workspace);
      const event = demoEvent(sessionId, place, nowMs, store);
      if (!event) return { state: "missing" };
      detail = event.detail;
      divisions = event.divisions;
      competition = event.competition;
      courts = [...place.courts];
    } else {
      if (!workspace.sessions.some((entry) => entry.id === sessionId)) {
        return { state: "missing" };
      }
      try {
        detail = await caller.operator.sessionDetail({ sessionId });
      } catch (error) {
        if (isPermissionDenied(error)) return { state: "denied" };
        const reference = report(error, { event: "hq.events.detail_failed" });
        return { state: "error", reference };
      }
      if (session.demo) detail = applyDemoToDetail(detail, await demoStore());
      const venue = workspace.venues.find(
        (candidate) => candidate.id === detail.session.venueId,
      );
      courts = (venue?.courts ?? []).map((court) => ({
        id: court.id,
        name: court.name,
      }));
      if (detail.entryDivisions.length > 0) {
        const answers = await Promise.allSettled(
          detail.entryDivisions.map((division) =>
            caller.operator.divisionDetail({ divisionId: division.id }),
          ),
        );
        divisions = answers.flatMap((answer) =>
          answer.status === "fulfilled" ? [answer.value] : [],
        );
        if (divisions.length < answers.length) {
          partial.push("divisions");
          log.warn("hq.events.divisions_unavailable", {
            missing: answers.length - divisions.length,
          });
        }
        try {
          competition = await caller.operator.tournamentCompetition({
            sessionId,
          });
        } catch (error) {
          if (!isPermissionDenied(error) && !isNotConfiguredAnswer(error)) {
            log.warn("hq.events.competition_unavailable", {});
          }
          partial.push("results");
        }
        if (courts.length === 0 && divisions[0])
          courts = [...divisions[0].courts];
      }
    }
    const view = eventView({
      detail,
      divisions,
      ...(competition ? { competition } : {}),
      courts,
      permissions: context.permissions,
      nowMs,
    });
    const approvals = (
      await approvalsFor(caller, context.permissions, context.timeZone)
    ).filter((approval) => approval.sessionId === sessionId);
    return { state: "ok", view, approvals, partial, context };
  },
);
