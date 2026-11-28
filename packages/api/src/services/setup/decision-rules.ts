/**
 * The rules a kept or edited proposal must pass before it can be applied.
 * The same rules hold for the model's proposal (Keep) and for a person's
 * edit (Edit): phone and email formats, public https links, structured
 * hours, hex colours with a contrast check, prices in integer minor units.
 * Returns the value in the exact shape `apply` writes.
 */
import { foregroundFor, parseHexColor } from "@duna/tideline-core/club-mark";
import { z } from "zod";
import { setupPolicyKinds, setupSocialNetworks } from "./extraction-schema";
import { normaliseSetupUrl } from "./url-safety";
import {
  emailPattern,
  offeringCatalogKind,
  timePattern,
  toE164,
} from "./validate";

const publicHttpsUrl = z
  .string()
  .max(2_048)
  .transform((value, context) => {
    const checked = normaliseSetupUrl(value);
    if (!checked.ok) {
      context.addIssue({
        code: "custom",
        message: "Use a public web address.",
      });
      return z.NEVER;
    }
    const url = new URL(checked.url);
    url.protocol = "https:";
    return url.toString();
  });

const hex = z.string().transform((value, context) => {
  const rgb = parseHexColor(value);
  if (!rgb) {
    context.addIssue({ code: "custom", message: "Use a colour like #1A2B3C." });
    return z.NEVER;
  }
  return `#${[rgb.r, rgb.g, rgb.b].map((c) => c.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
});

const hoursWindow = z
  .object({
    weekday: z.number().int().min(0).max(6),
    opens: z.string().regex(timePattern),
    closes: z.string().regex(timePattern),
  })
  .refine((w) => w.opens < w.closes, {
    message: "Closing time must be after opening time.",
  });

const catalogKinds = Object.values(offeringCatalogKind).map(
  (k) => `${k.type}/${k.subtype}`,
);

const priceSchema = z.object({
  amountMinor: z.number().int().min(0).max(100_000_000),
  currency: z.string().regex(/^[A-Z]{3}$/),
  wording: z.string().max(80).optional(),
  per: z.string().max(16).optional(),
});

const rules: Readonly<
  Record<string, (callingCode: string) => z.ZodType<Record<string, unknown>>>
> = {
  "identity.name": () => z.object({ value: z.string().trim().min(1).max(160) }),
  "identity.tagline": () =>
    z.object({ value: z.string().trim().min(1).max(160) }),
  "identity.about": () =>
    z.object({ value: z.string().trim().min(1).max(4_000) }),
  "identity.sports": () =>
    z.object({
      values: z
        .array(z.enum(["beach", "indoor"]))
        .min(1)
        .max(2),
    }),
  "identity.logo": () => z.object({ url: publicHttpsUrl }),
  "identity.colors": () =>
    z.object({ primary: hex, accent: hex.optional() }).transform((value) => {
      const contrast = foregroundFor(value.primary);
      return {
        ...value,
        contrast: {
          foreground: contrast.foreground,
          ratio: contrast.ratio,
          passesText: contrast.passesText,
          passesGraphics: contrast.passesGraphics,
        },
      };
    }),
  "contact.phone": (callingCode) =>
    z.object({
      value: z.string().transform((value, context) => {
        const e164 = toE164(value, callingCode);
        if (!e164) {
          context.addIssue({
            code: "custom",
            message:
              "Write the full phone number, with the country code if outside North America.",
          });
          return z.NEVER;
        }
        return e164;
      }),
    }),
  "contact.email": () =>
    z.object({
      value: z
        .string()
        .trim()
        .toLowerCase()
        .refine(
          (value) => emailPattern.test(value),
          "Use an email address like name@club.com.",
        ),
    }),
  "contact.social": () =>
    z.object({ network: z.enum(setupSocialNetworks), url: publicHttpsUrl }),
  "places.hours": () =>
    z
      .object({ weekly: z.array(hoursWindow).max(21) })
      .refine(
        (value) =>
          new Set(value.weekly.map((w) => w.weekday)).size ===
          value.weekly.length,
        { message: "One opening window per day." },
      ),
  "places.venue": () =>
    z.object({
      name: z.string().trim().min(1).max(160),
      address: z
        .object({
          line1: z.string().max(200).optional(),
          locality: z.string().max(120).optional(),
          administrativeArea: z.string().max(120).optional(),
          postalCode: z.string().max(24).optional(),
          countryCode: z
            .string()
            .regex(/^[A-Z]{2}$/)
            .optional(),
        })
        .default({}),
      courtCount: z.number().int().min(0).max(200).nullable().default(null),
      surface: z
        .enum(["sand", "grass", "hard", "wood", "synthetic"])
        .nullable()
        .default(null),
      environment: z.enum(["indoor", "outdoor"]).nullable().default(null),
    }),
  "team.member": () =>
    z.object({
      displayName: z.string().trim().min(1).max(120),
      role: z.enum(["coach", "director", "manager", "front-desk"]),
      title: z.string().trim().max(120).optional(),
    }),
  "offerings.item": () =>
    z.object({
      title: z.string().trim().min(1).max(160),
      kind: z.enum(catalogKinds as [string, ...string[]]),
      description: z.string().trim().max(2_000).optional(),
      durationMinutes: z.number().int().min(5).max(1_440).optional(),
      price: priceSchema.nullable().default(null),
    }),
};

const policyRule = () =>
  z.object({
    kind: z.enum(setupPolicyKinds),
    title: z.string().trim().min(1).max(120),
    summary: z.string().trim().min(1).max(2_000),
    refundBeforeMinutes: z
      .number()
      .int()
      .min(0)
      .max(525_600)
      .nullable()
      .default(null),
  });

export class SetupDecisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SetupDecisionError";
  }
}

/** Validates and normalises a proposal value for its field; throws a plain message. */
export function validateDecisionPayload(
  fieldKey: string,
  payload: Readonly<Record<string, unknown>>,
  callingCode: string,
): Record<string, unknown> {
  const rule = fieldKey.startsWith("policies.") ? policyRule : rules[fieldKey];
  if (!rule) throw new SetupDecisionError("This item cannot be applied.");
  const parsed = rule(callingCode).safeParse(payload);
  if (!parsed.success) {
    throw new SetupDecisionError(
      parsed.error.issues[0]?.message ?? "Check this value and try again.",
    );
  }
  return parsed.data;
}
