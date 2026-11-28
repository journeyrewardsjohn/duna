/**
 * Shared shapes for the W3 domain contracts (W3-0, schema steward). Every
 * domain contract imports money, ids, dates and pagination from here so the
 * fifteen wave-3 packages agree on one representation.
 *
 * Money is always integer minor units plus an upper-case ISO 4217 currency
 * (`moneySchema` from ../contracts). State enums are built from the tuples
 * exported by the database schema (`@duna/db/schema`), so a state added to
 * a CHECK constraint is added to the contract in the same change.
 */
import { matchStatusEnum } from "@duna/db/schema";
import { z } from "zod";
import { currencySchema, moneySchema } from "../contracts";

export const w3IdSchema = z.uuid();
/** ISO calendar date, "2026-12-01". */
export const w3DateSchema = z.iso.date();
/** ISO instant with offset, "2026-12-01T16:00:00.000Z". */
export const w3DateTimeSchema = z.iso.datetime({ offset: true });
/** Wall-clock time of day, "07:30" or "07:30:00". */
export const w3TimeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/);
/** 0 = Sunday … 6 = Saturday. */
export const w3WeekdaySchema = z.number().int().min(0).max(6);
export const w3CurrencySchema = currencySchema;
export const w3MoneySchema = moneySchema;
/** A non-negative amount (prices, totals); refunds and reversals are separate rows. */
export const w3AmountSchema = z.object({
  amountMinor: z.number().int().nonnegative(),
  currency: currencySchema,
});
/** Basis points, 0–10000 (2.5% = 250). */
export const w3BasisPointsSchema = z.number().int().min(0).max(10_000);
export const w3PercentSchema = z.number().min(0).max(100);
/** Load on Duna's 0–100 scale. */
export const w3LoadSchema = z.number().int().min(0).max(100);

export const w3PageInputSchema = z.object({
  cursor: z.string().max(256).optional(),
  limit: z.number().int().min(1).max(100).default(25),
});
export function w3PageSchema<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().optional(),
  });
}

/** A short person reference for lists (never contact details). */
export const w3PersonRefSchema = z.object({
  personId: w3IdSchema,
  displayName: z.string().min(1),
  initials: z.string().min(1).max(3).optional(),
  avatarUrl: z.url().optional(),
});

/** Every mutation that moves money, sends or publishes carries one. */
export const w3IdempotencyKeySchema = z.string().min(8).max(160);

export function w3Enum<const T extends readonly [string, ...string[]]>(
  values: T,
) {
  return z.enum(values);
}

/**
 * Every `match_status`, including W3-0's "not-finished" (a match stopped
 * part-way with a partial score). NetScore (C1) designs one state per value.
 */
export const w3MatchStatusSchema = z.enum(matchStatusEnum.enumValues);

export type W3Money = z.infer<typeof w3MoneySchema>;
export type W3Amount = z.infer<typeof w3AmountSchema>;
export type W3PersonRef = z.infer<typeof w3PersonRefSchema>;
