/**
 * Shared Concierge types and the one error class every Concierge service
 * throws (B7). Routers turn it into a tRPC error with `toConciergeTrpcError`.
 */
import { TRPCError } from "@trpc/server";
import type { conciergeChannels } from "@duna/db/schema";
import { MessagingError } from "../../messaging-service";
import {
  IdempotencyConflictError,
  IdempotencyInProgressError,
} from "../../idempotency";

export type ConciergeChannel = (typeof conciergeChannels)[number];
export const OUTSIDE_CHANNELS = ["email", "imessage", "whatsapp"] as const;
export type ConciergeOutsideChannel = (typeof OUTSIDE_CHANNELS)[number];

export type ConciergeErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "BAD_REQUEST"
  | "CONFLICT"
  | "PRECONDITION_FAILED"
  | "TOO_MANY_REQUESTS";

export class ConciergeError extends Error {
  constructor(
    readonly code: ConciergeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ConciergeError";
  }
}

/** Map service errors to tRPC errors; anything else is rethrown untouched. */
export function toConciergeTrpcError(error: unknown): never {
  if (error instanceof ConciergeError) {
    throw new TRPCError({ code: error.code, message: error.message });
  }
  if (error instanceof MessagingError) {
    throw new TRPCError({ code: error.code, message: error.message });
  }
  if (error instanceof IdempotencyConflictError) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "This request was already used for something else.",
    });
  }
  if (error instanceof IdempotencyInProgressError) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "This send is already in progress.",
    });
  }
  throw error;
}

export async function guardedConcierge<T>(
  execute: () => Promise<T>,
): Promise<T> {
  try {
    return await execute();
  } catch (error) {
    return toConciergeTrpcError(error);
  }
}
