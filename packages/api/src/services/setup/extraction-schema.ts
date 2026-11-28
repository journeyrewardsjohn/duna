/**
 * The only output channel of the extraction model: a strict schema per fact
 * type. Every fact carries a short verbatim `quote` from the page; code
 * (./validate.ts) refuses any fact whose quote is not on the page, so the
 * model can only point at text that exists, never add a fact of its own.
 *
 * Fields are required-and-nullable (not optional) so the schema works with
 * strict structured outputs.
 */
import { z } from "zod";

const quote = z.string().max(400);
const text = (max: number) => z.string().max(max);

export const setupSocialNetworks = [
  "instagram",
  "facebook",
  "tiktok",
  "youtube",
  "x",
  "linkedin",
  "other",
] as const;

export const setupOfferingKinds = [
  "private-lesson",
  "group-lesson",
  "program",
  "clinic",
  "camp",
  "league",
  "open-play",
  "court-rental",
  "membership",
  "tournament",
  "other",
] as const;

export const setupPolicyKinds = [
  "cancellation",
  "refund",
  "weather",
  "waiver",
  "conduct",
  "other",
] as const;

export const setupRawExtractionSchema = z.object({
  clubName: z.object({ value: text(160), quote }).nullable(),
  tagline: z.object({ value: text(160), quote }).nullable(),
  about: z.object({ value: text(1_200), quote }).nullable(),
  sports: z
    .array(
      z.object({
        value: z.enum(["beach", "indoor", "grass", "other"]),
        quote,
      }),
    )
    .max(6),
  phones: z.array(z.object({ value: text(40), quote })).max(6),
  emails: z.array(z.object({ value: text(254), quote })).max(6),
  socials: z
    .array(
      z.object({
        network: z.enum(setupSocialNetworks),
        url: text(300),
        quote,
      }),
    )
    .max(8),
  locations: z
    .array(
      z.object({
        name: text(160).nullable(),
        street: text(200).nullable(),
        locality: text(120).nullable(),
        region: text(120).nullable(),
        postalCode: text(24).nullable(),
        country: text(2).nullable(),
        courtCount: z.number().int().min(0).max(200).nullable(),
        surface: z.enum([
          "sand",
          "grass",
          "hard",
          "wood",
          "synthetic",
          "unknown",
        ]),
        environment: z.enum(["indoor", "outdoor", "unknown"]),
        quote,
      }),
    )
    .max(6),
  hours: z
    .array(
      z.object({
        weekday: z.number().int().min(0).max(6),
        opens: text(5),
        closes: text(5),
        quote,
      }),
    )
    .max(21),
  staff: z
    .array(
      z.object({
        name: text(120),
        role: z.enum(["coach", "director", "manager", "front-desk", "other"]),
        title: text(120).nullable(),
        quote,
      }),
    )
    .max(20),
  offerings: z
    .array(
      z.object({
        title: text(160),
        kind: z.enum(setupOfferingKinds),
        priceText: text(80).nullable(),
        amount: z.number().min(0).max(1_000_000).nullable(),
        currency: text(3).nullable(),
        per: z.enum([
          "session",
          "hour",
          "month",
          "year",
          "season",
          "once",
          "unknown",
        ]),
        durationMinutes: z.number().int().min(5).max(1_440).nullable(),
        description: text(400).nullable(),
        quote,
      }),
    )
    .max(20),
  policies: z
    .array(
      z.object({
        kind: z.enum(setupPolicyKinds),
        title: text(120),
        summary: text(600),
        noticeHours: z
          .number()
          .min(0)
          .max(24 * 60)
          .nullable(),
        quote,
      }),
    )
    .max(8),
});

export type SetupRawExtraction = z.infer<typeof setupRawExtractionSchema>;

export const emptySetupExtraction: SetupRawExtraction = {
  clubName: null,
  tagline: null,
  about: null,
  sports: [],
  phones: [],
  emails: [],
  socials: [],
  locations: [],
  hours: [],
  staff: [],
  offerings: [],
  policies: [],
};
