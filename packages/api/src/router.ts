import { TRPCError } from "@trpc/server";
import { priceConsumerOrder } from "@duna/pricing";
import { scheduleTournament, solveAvailableSlots } from "@duna/scheduling";
import {
  createUndoEvent,
  foldScore,
  generateDoubleElimination,
  generatePoolPlay,
  generateRoundRobin,
  generateSingleElimination,
  standardBeachFormat,
  type ScoreEvent,
  type SeededTeam,
} from "@duna/league-engine";
import { z } from "zod";
import {
  adultProcedure,
  adminProcedure,
  createCallerFactory,
  organizationProcedure,
  protectedProcedure,
  publicProcedure,
  rateLimitMiddleware,
  router,
} from "./auth";
import type { ApiContext } from "./context";
import {
  adminOverviewSchema,
  adminQueueSchema,
  agentDraftSchema,
  auditEventSchema,
  availableSlotSchema,
  bracketSchema,
  eventSummarySchema,
  matchSummarySchema,
  operatorDashboardSchema,
  organizationSummarySchema,
  personSummarySchema,
  playerDashboardSchema,
  playerWalletSchema,
  pricingSchema,
  scoreStateSchema,
  tournamentScheduleSchema,
  venueSummarySchema,
} from "./contracts";
import {
  executeIdempotent,
  IdempotencyConflictError,
  IdempotencyInProgressError,
} from "./idempotency";
import { createDunaPlusCheckout, isStripeConfigured } from "./payments";
import { getRepository } from "./repository";
import {
  confirmAgentAction,
  proposeAgentAction,
  toolRiskRegistry,
} from "./risk";

const moneyItemSchema = z.object({
  id: z.string().min(1),
  kind: z.enum([
    "booking",
    "registration",
    "membership",
    "package",
    "ticket",
    "merchandise",
    "wallet-load",
  ]),
  description: z.string().min(1),
  quantity: z.number().int().positive(),
  unitAmountMinor: z.number().int().nonnegative(),
});

const availabilityModeSchema = z.enum([
  "open",
  "private-lessons-only",
  "group-only",
  "league-reserved",
  "rentals-only",
  "members-only",
  "maintenance",
  "blocked",
]);

const timeRangeSchema = z.object({
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
});

const availabilityBlockSchema = timeRangeSchema.extend({
  id: z.string().min(1),
  resourceId: z.string().min(1),
  mode: availabilityModeSchema,
});

const busyRangeSchema = timeRangeSchema.extend({
  id: z.string().min(1),
  resourceId: z.string().min(1),
  kind: z.enum(["booking", "buffer", "blackout", "hold"]),
});

const tournamentMatchRequestSchema = z.object({
  id: z.string().min(1),
  divisionId: z.string().min(1),
  teamIds: z.tuple([z.string().min(1), z.string().min(1)]),
  durationMinutes: z.number().int().positive(),
  earliestStart: z.iso.datetime().optional(),
  dependsOnMatchIds: z.array(z.string().min(1)).optional(),
});

const courtWindowSchema = timeRangeSchema.extend({
  courtId: z.string().min(1),
  divisionIds: z.array(z.string().min(1)).min(1),
});

async function runIdempotentMutation<T extends object>(input: {
  readonly key: string;
  readonly procedure: string;
  readonly request: Readonly<Record<string, unknown>>;
  readonly ctx: ApiContext;
  readonly execute: () => Promise<T>;
}): Promise<T> {
  try {
    return (
      await executeIdempotent({
        key: input.key,
        procedure: input.procedure,
        personId: input.ctx.actor?.personId,
        organizationId: input.ctx.actor?.organizationId,
        request: input.request,
        now: input.ctx.now,
        execute: input.execute,
      })
    ).result;
  } catch (error) {
    if (error instanceof IdempotencyConflictError) {
      throw new TRPCError({ code: "CONFLICT", message: error.message });
    }
    if (error instanceof IdempotencyInProgressError) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: error.message,
      });
    }
    throw error;
  }
}

const publicRouter = router({
  health: publicProcedure
    .output(
      z.object({
        status: z.literal("ok"),
        service: z.literal("duna-api"),
        time: z.iso.datetime(),
        databaseConfigured: z.boolean(),
        stripeConfigured: z.boolean(),
      }),
    )
    .query(() => ({
      status: "ok" as const,
      service: "duna-api" as const,
      time: new Date().toISOString(),
      databaseConfigured: Boolean(process.env.DATABASE_URL),
      stripeConfigured: isStripeConfigured(),
    })),
  events: publicProcedure
    .input(
      z
        .object({
          kind: z
            .enum([
              "tournament",
              "league",
              "clinic",
              "open-play",
              "private-lesson",
              "court-rental",
              "pickup",
            ])
            .optional(),
          rating: z.number().min(1).max(8).optional(),
        })
        .optional(),
    )
    .output(z.array(eventSummarySchema).readonly())
    .query(async ({ input }) =>
      (await getRepository().public.events()).filter((event) => {
        if (input?.kind && event.kind !== input.kind) return false;
        if (
          input?.rating !== undefined &&
          event.ratingRange &&
          (input.rating < event.ratingRange[0] ||
            input.rating > event.ratingRange[1])
        ) {
          return false;
        }
        return true;
      }),
    ),
  eventBySlug: publicProcedure
    .input(z.object({ slug: z.string().min(1) }))
    .output(eventSummarySchema)
    .query(async ({ input }) => {
      const event = await getRepository().public.eventBySlug(input.slug);
      if (!event) throw new TRPCError({ code: "NOT_FOUND" });
      return event;
    }),
  venues: publicProcedure
    .output(z.array(venueSummarySchema).readonly())
    .query(() => getRepository().public.venues()),
  playerProfile: publicProcedure
    .input(z.object({ handle: z.string().min(1) }))
    .output(personSummarySchema)
    .query(async ({ input }) => {
      const player = await getRepository().public.playerByHandle(input.handle);
      if (!player) throw new TRPCError({ code: "NOT_FOUND" });
      return player;
    }),
});

const playerRouter = router({
  dashboard: protectedProcedure
    .output(playerDashboardSchema)
    .query(({ ctx }) => getRepository().player.dashboard(ctx.actor!.personId)),
  matches: protectedProcedure
    .output(z.array(matchSummarySchema).readonly())
    .query(({ ctx }) =>
      getRepository().player.matchHistory(ctx.actor!.personId),
    ),
  wallet: protectedProcedure
    .output(playerWalletSchema)
    .query(({ ctx }) => getRepository().player.wallet(ctx.actor!.personId)),
  quote: protectedProcedure
    .input(
      z.object({
        items: z.array(moneyItemSchema).min(1),
        isDunaPlus: z.boolean(),
      }),
    )
    .output(pricingSchema)
    .query(({ input }) =>
      priceConsumerOrder({
        items: input.items,
        currency: "USD",
        isDunaPlus: input.isDunaPlus,
      }),
    ),
  createPickup: adultProcedure
    .use(
      rateLimitMiddleware({
        id: "pickup-create",
        capacity: 12,
        refillPerMinute: 6,
      }),
    )
    .input(
      z
        .object({
          title: z.string().min(3).max(80),
          startsAt: z.iso.datetime(),
          endsAt: z.iso.datetime(),
          venueName: z.string().min(2),
          capacity: z.number().int().min(4).max(48),
          ratingMinimum: z.number().min(1).max(8).optional(),
          ratingMaximum: z.number().min(1).max(8).optional(),
          idempotencyKey: z.string().uuid(),
        })
        .refine(
          (value) => new Date(value.endsAt) > new Date(value.startsAt),
          "Pickup must end after it begins",
        ),
    )
    .output(eventSummarySchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "player.createPickup",
        request: input,
        ctx,
        execute: async () =>
          getRepository().player.createPickup({
            title: input.title,
            startsAt: input.startsAt,
            endsAt: input.endsAt,
            venueName: input.venueName,
            capacity: input.capacity,
            ratingMinimum: input.ratingMinimum,
            ratingMaximum: input.ratingMaximum,
            hostPersonId: ctx.actor!.personId,
            organizationId: ctx.actor!.organizationId,
            requestId: ctx.requestId,
            ipAddress: ctx.ipAddress,
          }),
      }),
    ),
  foldScore: protectedProcedure
    .input(
      z.object({
        events: z.array(z.record(z.string(), z.unknown())),
        scoringSystem: z.enum(["rally", "sideout"]).default("rally"),
      }),
    )
    .output(scoreStateSchema)
    .query(({ input }) =>
      foldScore(input.events as unknown as ScoreEvent[], {
        ...standardBeachFormat,
        scoringSystem: input.scoringSystem,
      }),
    ),
  startDunaPlusCheckout: adultProcedure
    .use(
      rateLimitMiddleware({
        id: "checkout",
        capacity: 10,
        refillPerMinute: 5,
      }),
    )
    .input(
      z.object({
        interval: z.enum(["month", "year"]),
        successUrl: z.url(),
        cancelUrl: z.url(),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(
      z.object({
        id: z.string(),
        url: z.string().nullable(),
        demo: z.boolean(),
      }),
    )
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "player.startDunaPlusCheckout",
        request: input,
        ctx,
        execute: async () => {
          if (!isStripeConfigured()) {
            return {
              id: "demo_checkout",
              url: `${input.successUrl}?demoCheckout=complete`,
              demo: true,
            };
          }
          return {
            ...(await createDunaPlusCheckout({
              personId: ctx.actor!.personId,
              interval: input.interval,
              successUrl: input.successUrl,
              cancelUrl: input.cancelUrl,
              idempotencyKey: input.idempotencyKey,
            })),
            demo: false,
          };
        },
      }),
    ),
});

const operatorRouter = router({
  dashboard: organizationProcedure("reports:read")
    .output(operatorDashboardSchema)
    .query(({ ctx }) =>
      getRepository().operator.dashboard(ctx.actor!.organizationId!),
    ),
  organization: organizationProcedure("members:read")
    .output(organizationSummarySchema)
    .query(({ ctx }) =>
      getRepository().operator.organization(ctx.actor!.organizationId!),
    ),
  members: organizationProcedure("members:read")
    .output(z.array(personSummarySchema).readonly())
    .query(({ ctx }) =>
      getRepository().operator.members(ctx.actor!.organizationId!),
    ),
  events: organizationProcedure("sessions:read")
    .output(z.array(eventSummarySchema).readonly())
    .query(({ ctx }) =>
      getRepository().operator.events(ctx.actor!.organizationId!),
    ),
  availableSlots: organizationProcedure("sessions:read")
    .input(
      z.object({
        coachId: z.string().optional(),
        courtIds: z.array(z.string()).min(1),
        durationMinutes: z.number().int().positive(),
        bufferBeforeMinutes: z.number().int().nonnegative(),
        bufferAfterMinutes: z.number().int().nonnegative(),
        incrementMinutes: z.number().int().positive(),
        window: timeRangeSchema,
        allowedModes: z.array(availabilityModeSchema),
        coachAvailability: z.array(availabilityBlockSchema).optional(),
        courtAvailability: z.array(availabilityBlockSchema),
        busyRanges: z.array(busyRangeSchema),
      }),
    )
    .output(z.array(availableSlotSchema).readonly())
    .query(({ input }) => solveAvailableSlots(input)),
  generateBracket: organizationProcedure("sessions:write")
    .input(
      z.object({
        id: z.string().min(1),
        format: z.enum([
          "single-elimination",
          "double-elimination-true-reset",
          "double-elimination-modified",
          "double-elimination-crossover",
          "round-robin",
          "pool-play",
        ]),
        teams: z.array(
          z.object({
            id: z.string().min(1),
            seed: z.number().int().positive(),
            name: z.string().min(1),
          }),
        ),
        poolCount: z.number().int().positive().optional(),
      }),
    )
    .output(bracketSchema)
    .query(({ input }) => {
      const teams = input.teams as readonly SeededTeam[];
      switch (input.format) {
        case "single-elimination":
          return generateSingleElimination({ id: input.id, teams });
        case "double-elimination-true-reset":
          return generateDoubleElimination({
            id: input.id,
            teams,
            variant: "true-reset",
          });
        case "double-elimination-modified":
          return generateDoubleElimination({
            id: input.id,
            teams,
            variant: "modified",
          });
        case "double-elimination-crossover":
          return generateDoubleElimination({
            id: input.id,
            teams,
            variant: "crossover",
          });
        case "round-robin":
          return generateRoundRobin({ id: input.id, teams });
        case "pool-play":
          return generatePoolPlay({
            id: input.id,
            teams,
            poolCount: input.poolCount ?? 4,
          });
      }
    }),
  generateSchedule: organizationProcedure("sessions:write")
    .input(
      z.object({
        matches: z.array(tournamentMatchRequestSchema),
        courtWindows: z.array(courtWindowSchema),
        minimumRestMinutes: z.number().int().nonnegative(),
      }),
    )
    .output(tournamentScheduleSchema)
    .query(({ input }) => scheduleTournament(input)),
  proposeLeague: organizationProcedure("sessions:write")
    .use(
      rateLimitMiddleware({
        id: "agent-league-proposal",
        capacity: 20,
        refillPerMinute: 10,
      }),
    )
    .input(
      z.object({
        title: z.string().min(3),
        format: z.string().min(2),
        weeks: z.number().int().min(1).max(52),
        teamCapacity: z.number().int().min(2).max(256),
        priceMinor: z.number().int().nonnegative(),
        currency: z.string().length(3),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(agentDraftSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "operator.proposeLeague",
        request: input,
        ctx,
        execute: async () => {
          const league = {
            title: input.title,
            format: input.format,
            weeks: input.weeks,
            teamCapacity: input.teamCapacity,
            priceMinor: input.priceMinor,
            currency: input.currency,
          };
          return proposeAgentAction({
            toolName: "leagues.create",
            toolInput: league,
            proposedDiff: {
              entity: "league",
              operation: "create",
              values: league,
            },
            actorPersonId: ctx.actor!.personId,
            organizationId: ctx.actor!.organizationId,
            conversationId: ctx.requestId,
            now: ctx.now,
          });
        },
      }),
    ),
  proposeMessage: organizationProcedure("messages:propose")
    .use(
      rateLimitMiddleware({
        id: "message-proposal",
        capacity: 5,
        refillPerMinute: 2,
      }),
    )
    .input(
      z.object({
        recipientCount: z.number().int().positive(),
        segment: z.string().min(2),
        channel: z.enum(["email", "sms", "push"]),
        subject: z.string().optional(),
        body: z.string().min(1),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(agentDraftSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "operator.proposeMessage",
        request: input,
        ctx,
        execute: async () => {
          const message = {
            recipientCount: input.recipientCount,
            segment: input.segment,
            channel: input.channel,
            subject: input.subject,
            body: input.body,
          };
          return proposeAgentAction({
            toolName: "messages.send",
            toolInput: message,
            proposedDiff: {
              operation: "send",
              recipients: message.recipientCount,
              channel: message.channel,
            },
            actorPersonId: ctx.actor!.personId,
            organizationId: ctx.actor!.organizationId,
            conversationId: ctx.requestId,
            now: ctx.now,
          });
        },
      }),
    ),
});

const agentConfirmationSchema = z.object({
  draftId: z.string().uuid(),
  confirmationNonce: z.string().uuid().optional(),
  idempotencyKey: z.string().uuid(),
});

const agentRouter = router({
  confirmAction: protectedProcedure
    .use(
      rateLimitMiddleware({
        id: "agent-confirmation",
        capacity: 20,
        refillPerMinute: 10,
      }),
    )
    .input(agentConfirmationSchema)
    .output(agentDraftSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "agent.confirmAction",
        request: input,
        ctx,
        execute: async () =>
          confirmAgentAction({
            draftId: input.draftId,
            actorPersonId: ctx.actor!.personId,
            organizationId: ctx.actor!.organizationId,
            confirmationNonce: input.confirmationNonce,
            requestId: ctx.requestId,
            ipAddress: ctx.ipAddress,
            now: ctx.now,
          }),
      }),
    ),
});

const adminRouter = router({
  overview: adminProcedure
    .output(adminOverviewSchema)
    .query(() => getRepository().admin.overview()),
  organizations: adminProcedure
    .output(z.array(organizationSummarySchema).readonly())
    .query(() => getRepository().admin.organizations()),
  queues: adminProcedure
    .output(z.array(adminQueueSchema).readonly())
    .query(() => getRepository().admin.queues()),
  audit: adminProcedure
    .output(z.array(auditEventSchema).readonly())
    .query(() => getRepository().admin.audit()),
  confirmAgentAction: adminProcedure
    .use(
      rateLimitMiddleware({
        id: "admin-agent-confirmation",
        capacity: 20,
        refillPerMinute: 10,
      }),
    )
    .input(agentConfirmationSchema)
    .output(agentDraftSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "admin.confirmAgentAction",
        request: input,
        ctx,
        execute: async () =>
          confirmAgentAction({
            draftId: input.draftId,
            actorPersonId: ctx.actor!.personId,
            organizationId: ctx.actor!.organizationId,
            confirmationNonce: input.confirmationNonce,
            requestId: ctx.requestId,
            ipAddress: ctx.ipAddress,
            now: ctx.now,
          }),
      }),
    ),
  toolRiskRegistry: adminProcedure
    .output(z.record(z.string(), z.enum(["read", "propose", "confirm-always"])))
    .query(() => toolRiskRegistry),
});

export const appRouter = router({
  public: publicRouter,
  player: playerRouter,
  operator: operatorRouter,
  agent: agentRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
export const createCaller = createCallerFactory(appRouter);

export function lastScoringEventUndo(
  events: readonly ScoreEvent[],
  id: string,
  occurredAt: string,
) {
  return createUndoEvent(events, { id, occurredAt });
}
