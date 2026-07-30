import { TRPCError, initTRPC } from "@trpc/server";
import type { ApiContext } from "./context";

export const t = initTRPC.context<ApiContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;

const requireActor = t.middleware(({ ctx, next }) => {
  if (!ctx.actor) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sign in required" });
  }
  return next({ ctx: { ...ctx, actor: ctx.actor } });
});

export const protectedProcedure = t.procedure.use(requireActor);

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
  return protectedProcedure.use(requireScope(scope)).use(({ ctx, next }) => {
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
