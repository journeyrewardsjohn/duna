/**
 * Router seam: team-availability (owner: B3a). Named schedules, blackouts,
 * time off and coverage. Shapes are frozen in
 * ../contracts/team-availability.ts (W3-0).
 *
 * Mounted once in ../router.ts as `operator.teamAvailability`
 * (organizationProcedure: signed in, scope checked, organisation resolved
 * server-side). Reads need "members:read". A member edits their own
 * availability and asks for time off with "members:read" (the service
 * checks it is their own profile); editing someone else, deciding time off
 * and acting on coverage need "members:write".
 *
 * Every procedure returns its fixture from
 * @duna/core/demo/team-availability in demo mode and calls the B3a service
 * in ../services/team-availability/ otherwise.
 */
import {
  teamAvailabilityDemo,
  teamAvailabilityDemoBlackouts,
  teamAvailabilityDemoCoverageRequests,
  teamAvailabilityDemoSchedules,
  teamAvailabilityDemoTimeOff,
} from "@duna/core/demo/team-availability";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { organizationProcedure, router } from "../auth";
import {
  teamAvailabilityAddBlackoutInputSchema,
  teamAvailabilityBlackoutSchema,
  teamAvailabilityCoverageActionInputSchema,
  teamAvailabilityCoverageGridInputSchema,
  teamAvailabilityCoverageGridSchema,
  teamAvailabilityCoverageRequestSchema,
  teamAvailabilityCoverageRequestsInputSchema,
  teamAvailabilityCoverageRequestsSchema,
  teamAvailabilityDecideTimeOffInputSchema,
  teamAvailabilityRemoveBlackoutInputSchema,
  teamAvailabilityRequestTimeOffInputSchema,
  teamAvailabilityScheduleSchema,
  teamAvailabilityScheduleTransitionInputSchema,
  teamAvailabilityStaffInputSchema,
  teamAvailabilityStaffSchema,
  teamAvailabilityTimeOffSchema,
  teamAvailabilityUpsertScheduleInputSchema,
} from "../contracts/team-availability";
import { usesDemoData } from "../services/data-source";
import * as service from "../services/team-availability";
import { domainSeamStatus, domainSeamStatusSchema } from "./seam-status";

const DOMAIN = "team-availability";
const read = organizationProcedure("members:read");
/** Self-service writes: the service allows the member or a manager. */
const selfOrManager = organizationProcedure("members:read");
const write = organizationProcedure("members:write");

function teamContext(ctx: {
  readonly actor: Parameters<typeof service.staffAvailabilityPage>[0]["actor"];
  readonly organizationId: string;
  readonly requestId: string;
  readonly now: Date;
  readonly ipAddress?: string;
}): service.TeamActor {
  return {
    actor: ctx.actor,
    organizationId: ctx.organizationId,
    requestId: ctx.requestId,
    now: ctx.now,
    ...(ctx.ipAddress ? { ipAddress: ctx.ipAddress } : {}),
  };
}
const DEMO_NOW = "2026-11-27T18:00:00.000Z";

function find<T extends { id: string }>(rows: readonly T[], id: string): T {
  const row = rows.find((candidate) => candidate.id === id);
  if (!row) throw new TRPCError({ code: "NOT_FOUND" });
  return row;
}

export const teamAvailabilityOperatorRouter = router({
  status: read
    .output(domainSeamStatusSchema)
    .query(() => domainSeamStatus(DOMAIN)),

  /** One staff member's schedules, blackouts and time off (TM-Availability). */
  staff: read
    .input(teamAvailabilityStaffInputSchema)
    .output(teamAvailabilityStaffSchema)
    .query(async ({ input, ctx }) => {
      if (usesDemoData()) {
        const page = teamAvailabilityDemo.staff;
        return {
          staff: { ...page.staff, staffProfileId: input.staffProfileId },
          schedules: teamAvailabilityDemoSchedules.filter(
            (schedule) => schedule.staffProfileId === input.staffProfileId,
          ),
          blackouts: page.blackouts.filter(
            (row) => row.staffProfileId === input.staffProfileId,
          ),
          timeOff: page.timeOff.filter(
            (row) => row.staffProfileId === input.staffProfileId,
          ),
        };
      }
      return service.staffAvailabilityPage(
        teamContext(ctx),
        input.staffProfileId,
      );
    }),

  /** Create or replace a named schedule and its windows (stays draft). */
  upsertSchedule: selfOrManager
    .input(teamAvailabilityUpsertScheduleInputSchema)
    .output(teamAvailabilityScheduleSchema)
    .mutation(async ({ input, ctx }) => {
      if (usesDemoData()) {
        const base = input.scheduleId
          ? find(teamAvailabilityDemoSchedules, input.scheduleId)
          : teamAvailabilityDemoSchedules[2]!;
        return {
          ...base,
          staffProfileId: input.staffProfileId,
          name: input.name,
          effectiveFrom: input.effectiveFrom,
          ...(input.effectiveTo ? { effectiveTo: input.effectiveTo } : {}),
          timezone: input.timezone,
          ...(input.sourceText ? { sourceText: input.sourceText } : {}),
          windows: input.windows.map((window, index) => ({
            ...window,
            id: base.windows[index]?.id ?? base.id,
          })),
          updatedAt: DEMO_NOW,
        };
      }
      return service.upsertSchedule(teamContext(ctx), input);
    }),

  /** draft → active | fallback; active | fallback → archived. */
  transitionSchedule: selfOrManager
    .input(teamAvailabilityScheduleTransitionInputSchema)
    .output(teamAvailabilityScheduleSchema)
    .mutation(async ({ input, ctx }) => {
      if (usesDemoData()) {
        return {
          ...find(teamAvailabilityDemoSchedules, input.scheduleId),
          status: input.to,
          updatedAt: DEMO_NOW,
        };
      }
      return service.transitionSchedule(teamContext(ctx), input);
    }),

  addBlackout: selfOrManager
    .input(teamAvailabilityAddBlackoutInputSchema)
    .output(teamAvailabilityBlackoutSchema)
    .mutation(async ({ input, ctx }) => {
      if (usesDemoData()) {
        return { ...teamAvailabilityDemoBlackouts[0]!, ...input };
      }
      return service.addBlackout(teamContext(ctx), input);
    }),

  removeBlackout: selfOrManager
    .input(teamAvailabilityRemoveBlackoutInputSchema)
    .output(z.object({ removed: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      if (usesDemoData()) {
        find(teamAvailabilityDemoBlackouts, input.blackoutId);
        return { removed: true };
      }
      return service.removeBlackout(teamContext(ctx), input.blackoutId);
    }),

  requestTimeOff: selfOrManager
    .input(teamAvailabilityRequestTimeOffInputSchema)
    .output(teamAvailabilityTimeOffSchema)
    .mutation(async ({ input, ctx }) => {
      if (usesDemoData()) {
        return {
          ...teamAvailabilityDemoTimeOff[1]!,
          ...input,
          requestedAt: DEMO_NOW,
        };
      }
      return service.requestTimeOff(teamContext(ctx), input);
    }),

  /** requested → approved | declined (a manager) | cancelled (the requester or a manager). */
  decideTimeOff: selfOrManager
    .input(teamAvailabilityDecideTimeOffInputSchema)
    .output(teamAvailabilityTimeOffSchema)
    .mutation(async ({ input, ctx }) => {
      if (usesDemoData()) {
        const row = find(teamAvailabilityDemoTimeOff, input.timeOffId);
        return {
          ...row,
          status: input.decision,
          ...(input.decision === "cancelled" ? {} : { decidedAt: DEMO_NOW }),
          ...(input.note ? { decisionNote: input.note } : {}),
        };
      }
      return service.decideTimeOff(teamContext(ctx), input);
    }),

  /** Hour × weekday: sessions against coaches free (TM-Coverage). */
  coverageGrid: read
    .input(teamAvailabilityCoverageGridInputSchema)
    .output(teamAvailabilityCoverageGridSchema)
    .query(async ({ input, ctx }) => {
      if (usesDemoData()) {
        return {
          ...teamAvailabilityDemo.coverageGrid,
          weekStartsOn: input.weekStartsOn,
        };
      }
      return service.coverageGrid(teamContext(ctx), input.weekStartsOn);
    }),

  /** Sessions that need cover, with ranked substitutes. */
  coverageRequests: read
    .input(teamAvailabilityCoverageRequestsInputSchema)
    .output(teamAvailabilityCoverageRequestsSchema)
    .query(async ({ input, ctx }) => {
      if (usesDemoData()) {
        return {
          requests: teamAvailabilityDemoCoverageRequests.filter(
            (request) => !input.status || input.status.includes(request.status),
          ),
        };
      }
      return service.coverageRequests(teamContext(ctx), input);
    }),

  /** suggest | ask | assign | decline | cancel on one coverage request. */
  coverageAction: write
    .input(teamAvailabilityCoverageActionInputSchema)
    .output(teamAvailabilityCoverageRequestSchema)
    .mutation(async ({ input, ctx }) => {
      if (usesDemoData()) {
        const request = find(
          teamAvailabilityDemoCoverageRequests,
          input.requestId,
        );
        if (input.action === "assign") {
          const offer = find(request.offers, input.offerId);
          return {
            ...request,
            status: "covered" as const,
            coveredBy: offer.staff,
            offers: request.offers.map((row) =>
              row.id === offer.id
                ? { ...row, status: "assigned" as const }
                : row,
            ),
            resolvedAt: DEMO_NOW,
          };
        }
        if (input.action === "cancel") {
          return {
            ...request,
            status: "cancelled" as const,
            resolvedAt: DEMO_NOW,
          };
        }
        return request;
      }
      return service.coverageAction(teamContext(ctx), input);
    }),
});
