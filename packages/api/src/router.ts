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
  adminProcedure,
  createCallerFactory,
  organizationProcedure,
  protectedProcedure,
  publicProcedure,
  router,
} from "./auth";
import { createDunaPlusCheckout, isStripeConfigured } from "./payments";
import { demoRepository } from "./repository";
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

const publicRouter = router({
  health: publicProcedure.query(() => ({
    status: "ok" as const,
    service: "duna-api",
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
    .query(({ input }) =>
      demoRepository.public.events().filter((event) => {
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
    .query(({ input }) => {
      const event = demoRepository.public.eventBySlug(input.slug);
      if (!event) throw new TRPCError({ code: "NOT_FOUND" });
      return event;
    }),
  venues: publicProcedure.query(() => demoRepository.public.venues()),
  playerProfile: publicProcedure
    .input(z.object({ handle: z.string().min(1) }))
    .query(({ input }) => {
      const player = demoRepository.public.playerByHandle(input.handle);
      if (!player) throw new TRPCError({ code: "NOT_FOUND" });
      return player;
    }),
});

const playerRouter = router({
  dashboard: protectedProcedure.query(() => demoRepository.player.dashboard()),
  matches: protectedProcedure.query(() => demoRepository.player.matchHistory()),
  wallet: protectedProcedure.query(() => demoRepository.player.wallet()),
  quote: protectedProcedure
    .input(
      z.object({
        items: z.array(moneyItemSchema).min(1),
        isDunaPlus: z.boolean(),
      }),
    )
    .query(({ input }) =>
      priceConsumerOrder({
        items: input.items,
        currency: "USD",
        isDunaPlus: input.isDunaPlus,
      }),
    ),
  createPickup: protectedProcedure
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
    .mutation(({ input }) => demoRepository.player.createPickup(input)),
  foldScore: protectedProcedure
    .input(
      z.object({
        events: z.array(z.record(z.string(), z.unknown())),
        scoringSystem: z.enum(["rally", "sideout"]).default("rally"),
      }),
    )
    .query(({ input }) =>
      foldScore(input.events as unknown as ScoreEvent[], {
        ...standardBeachFormat,
        scoringSystem: input.scoringSystem,
      }),
    ),
  startDunaPlusCheckout: protectedProcedure
    .input(
      z.object({
        interval: z.enum(["month", "year"]),
        successUrl: z.url(),
        cancelUrl: z.url(),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
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
    }),
});

const operatorRouter = router({
  dashboard: organizationProcedure("reports:read").query(() =>
    demoRepository.operator.dashboard(),
  ),
  organization: organizationProcedure("members:read").query(() =>
    demoRepository.operator.organization(),
  ),
  members: organizationProcedure("members:read").query(() =>
    demoRepository.operator.members(),
  ),
  events: organizationProcedure("sessions:read").query(() =>
    demoRepository.operator.events(),
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
    .mutation(({ input }) => {
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
    .mutation(({ input }) => scheduleTournament(input)),
  proposeLeague: organizationProcedure("sessions:write")
    .input(
      z.object({
        title: z.string().min(3),
        format: z.string().min(2),
        weeks: z.number().int().min(1).max(52),
        teamCapacity: z.number().int().min(2).max(256),
        priceMinor: z.number().int().nonnegative(),
        currency: z.string().length(3),
      }),
    )
    .mutation(({ input, ctx }) =>
      proposeAgentAction({
        toolName: "leagues.create",
        toolInput: input,
        proposedDiff: {
          entity: "league",
          operation: "create",
          values: input,
        },
        actorPersonId: ctx.actor!.personId,
        now: ctx.now,
      }),
    ),
  proposeMessage: organizationProcedure("messages:propose")
    .input(
      z.object({
        recipientCount: z.number().int().positive(),
        segment: z.string().min(2),
        channel: z.enum(["email", "sms", "push"]),
        subject: z.string().optional(),
        body: z.string().min(1),
      }),
    )
    .mutation(({ input, ctx }) =>
      proposeAgentAction({
        toolName: "messages.send",
        toolInput: input,
        proposedDiff: {
          operation: "send",
          recipients: input.recipientCount,
          channel: input.channel,
        },
        actorPersonId: ctx.actor!.personId,
        now: ctx.now,
      }),
    ),
});

const adminRouter = router({
  overview: adminProcedure.query(() => demoRepository.admin.overview()),
  organizations: adminProcedure.query(() =>
    demoRepository.admin.organizations(),
  ),
  queues: adminProcedure.query(() => demoRepository.admin.queues()),
  audit: adminProcedure.query(() => demoRepository.admin.audit()),
  confirmAgentAction: adminProcedure
    .input(
      z.object({
        draftId: z.string().uuid(),
        confirmationNonce: z.string().uuid().optional(),
      }),
    )
    .mutation(({ input, ctx }) =>
      confirmAgentAction({
        draftId: input.draftId,
        actorPersonId: ctx.actor!.personId,
        confirmationNonce: input.confirmationNonce,
        now: ctx.now,
      }),
    ),
  toolRiskRegistry: adminProcedure.query(() => toolRiskRegistry),
});

export const appRouter = router({
  public: publicRouter,
  player: playerRouter,
  operator: operatorRouter,
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
