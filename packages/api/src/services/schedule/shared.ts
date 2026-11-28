/**
 * Shared parts of the front desk's schedule service (SCHED-API): the error
 * type the router maps to tRPC codes, the caller, and the permission rules.
 *
 * Permissions (existing scopes only; see docs/product/schedule.md):
 * - create / move / cancel a court booking, remove a block: `sessions:write`
 *   (front desk, manager, owner);
 * - a staff price on a new booking, or a cancellation that refunds money:
 *   `payments:write` (owner);
 * - record a desk payment: `payments:collect` and `sessions:write` (front
 *   desk, owner);
 * - money fields in answers: `payments:read`, `payments:write` or
 *   `payments:collect`.
 * Another club's ids answer NOT_FOUND, never FORBIDDEN.
 */
import type { ApiActor } from "../../context";

export type ScheduleErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "CONFLICT"
  | "BAD_REQUEST"
  | "PRECONDITION_FAILED"
  | "DATABASE_REQUIRED";

export class ScheduleError extends Error {
  constructor(
    readonly code: ScheduleErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ScheduleError";
  }
}

export interface ScheduleCaller {
  readonly actor: ApiActor;
  readonly organizationId: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}

export function hasScope(actor: ApiActor, scope: string): boolean {
  return actor.scopes.includes("*") || actor.scopes.includes(scope);
}

/** Totals, paid amounts and refunds are shown only with a money permission. */
export function canSeeMoney(actor: ApiActor): boolean {
  return (
    hasScope(actor, "payments:read") ||
    hasScope(actor, "payments:write") ||
    hasScope(actor, "payments:collect")
  );
}

export function requireScope(actor: ApiActor, scope: string): void {
  if (!hasScope(actor, scope)) {
    throw new ScheduleError("FORBIDDEN", `Missing required scope: ${scope}`);
  }
}

export function requireDatabase(): void {
  if (!process.env.DATABASE_URL) {
    throw new ScheduleError(
      "DATABASE_REQUIRED",
      "The schedule needs the connected Duna Database.",
    );
  }
}

export function notFound(what: string): never {
  throw new ScheduleError("NOT_FOUND", `${what} was not found.`);
}

export function minutesBetween(startsAt: Date, endsAt: Date): number {
  return Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000);
}
