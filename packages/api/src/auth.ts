import { TRPCError, initTRPC } from "@trpc/server";
import type { ApiContext } from "./context";
import { consumeRateLimit } from "./rate-limit";

export const t = initTRPC.context<ApiContext>().create();

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;

export interface RateLimitPolicy {
  readonly id: string;
  readonly capacity: number;
  readonly refillPerMinute: number;
  readonly cost?: number;
  readonly scope?: "actor" | "organization" | "ip";
}

export function rateLimitMiddleware(policy: RateLimitPolicy) {
  return t.middleware(async ({ ctx, next }) => {
    const identity =
      policy.scope === "organization"
        ? (ctx.actor?.organizationId ?? ctx.actor?.personId)
        : policy.scope === "ip"
          ? ctx.ipAddress
          : (ctx.actor?.personId ?? ctx.ipAddress);
    const decision = await consumeRateLimit({
      key: `${policy.id}:${identity ?? "anonymous"}`,
      capacity: policy.capacity,
      refillPerMinute: policy.refillPerMinute,
      cost: policy.cost,
      now: ctx.now,
    });
    if (!decision.allowed) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Rate limit exceeded. Retry in ${decision.retryAfterSeconds} seconds.`,
      });
    }
    return next();
  });
}

export const publicProcedure = t.procedure.use(
  rateLimitMiddleware({
    id: "public",
    capacity: 300,
    refillPerMinute: 300,
    scope: "ip",
  }),
);

const requireActor = t.middleware(({ ctx, next }) => {
  if (!ctx.actor) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sign in required" });
  }
  return next({ ctx: { ...ctx, actor: ctx.actor } });
});

export const protectedProcedure = t.procedure.use(requireActor).use(
  rateLimitMiddleware({
    id: "authenticated",
    capacity: 180,
    refillPerMinute: 180,
  }),
);

export const adultProcedure = protectedProcedure.use(
  t.middleware(({ ctx, next }) => {
    if (ctx.actor?.ageBand !== "adult") {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          "An adult identity is required. Minor activity must use a verified guardian flow.",
      });
    }
    return next({ ctx: { ...ctx, actor: ctx.actor } });
  }),
);

export function requireScope(scope: string) {
  return t.middleware(({ ctx, next }) => {
    if (!ctx.actor) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Sign in required",
      });
    }
    if (!ctx.actor.scopes.includes("*") && !ctx.actor.scopes.includes(scope)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Missing required scope: ${scope}`,
      });
    }
    return next({ ctx: { ...ctx, actor: ctx.actor } });
  });
}

export function organizationProcedure(scope: string) {
  return protectedProcedure
    .use(requireScope(scope))
    .use(
      rateLimitMiddleware({
        id: "organization",
        capacity: 1_200,
        refillPerMinute: 1_200,
        scope: "organization",
      }),
    )
    .use(({ ctx, next }) => {
      if (!ctx.actor.organizationId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "An organization context is required",
        });
      }
      return next({
        ctx: {
          ...ctx,
          actor: ctx.actor,
          organizationId: ctx.actor.organizationId,
        },
      });
    });
}

export const adminProcedure = protectedProcedure.use(
  t.middleware(({ ctx, next }) => {
    if (
      !ctx.actor ||
      (!ctx.actor.roles.includes("admin") &&
        !ctx.actor.roles.includes("super-admin"))
    ) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Platform administration access required",
      });
    }
    return next({ ctx: { ...ctx, actor: ctx.actor } });
  }),
);

export const superAdminProcedure = protectedProcedure.use(
  t.middleware(({ ctx, next }) => {
    if (!ctx.actor?.roles.includes("super-admin")) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Super Admin access required",
      });
    }
    return next({ ctx: { ...ctx, actor: ctx.actor } });
  }),
);
