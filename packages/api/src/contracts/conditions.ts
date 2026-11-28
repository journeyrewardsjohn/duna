/**
 * Contract: conditions (owner: B11). Hourly weather, sun times and light
 * phases for a venue or a point, and wind relative to a court's
 * `orientation_deg`, served from the `conditions_hourly` /
 * `conditions_sun_times` cache. Frozen by W3-0; C5, H2, P5 and the Pro
 * schedule build against `@duna/core/demo/conditions`. Procedures:
 * `operator.conditions.*`, `public.conditions.*`. Without weather
 * credentials the forecast answers `source: "provider-not-configured"` with
 * no hours (sun times are computed and still served).
 */
import {
  conditionsAlertLevels,
  conditionsProviders,
  conditionsWindStrengths,
} from "@duna/db/schema";
import { z } from "zod";
import { w3DateSchema, w3DateTimeSchema, w3IdSchema } from "./w3-common";

export const conditionsAlertLevelSchema = z.enum(conditionsAlertLevels);
export const conditionsProviderSchema = z.enum(conditionsProviders);
export const conditionsWindStrengthSchema = z.enum(conditionsWindStrengths);
export const conditionsLightPhaseSchema = z.enum([
  "first-light",
  "full-sun",
  "golden-hour",
  "under-lights",
  "too-dark",
]);
/** Where the answer came from: fresh, from cache, too old, or no provider. */
export const conditionsSourceSchema = z.enum([
  "live",
  "cached",
  "stale",
  "provider-not-configured",
]);
export const conditionsWindRelativeSchema = z.enum([
  "along-court",
  "across-court",
  "diagonal",
  "calm",
  "orientation-unknown",
]);

export const conditionsPlaceInputSchema = z.union([
  z.object({ venueId: w3IdSchema }),
  z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
]);

export const conditionsForecastInputSchema = z.object({
  place: conditionsPlaceInputSchema,
  from: w3DateTimeSchema.optional(),
  hours: z.number().int().min(1).max(72).default(24),
});

export const conditionsHourSchema = z.object({
  hourStartsAt: w3DateTimeSchema,
  temperatureC: z.number().optional(),
  feelsLikeC: z.number().optional(),
  windSpeedKph: z.number().nonnegative().optional(),
  windGustKph: z.number().nonnegative().optional(),
  windDirectionDeg: z.number().int().min(0).max(359).optional(),
  windStrength: conditionsWindStrengthSchema.optional(),
  precipitationProbability: z.number().int().min(0).max(100).optional(),
  uvIndex: z.number().nonnegative().optional(),
  lightningDistanceKm: z.number().nonnegative().optional(),
  alertLevel: conditionsAlertLevelSchema,
  conditionCode: z.string().max(32).optional(),
  provider: conditionsProviderSchema,
});

export const conditionsForecastSchema = z.object({
  locationKey: z.string().min(1).max(64),
  venueId: w3IdSchema.optional(),
  timezone: z.string().min(1),
  source: conditionsSourceSchema,
  fetchedAt: w3DateTimeSchema.optional(),
  hours: z.array(conditionsHourSchema),
  /** Weather credit shown wherever hours are shown (required attribution). */
  attribution: z.string().optional(),
});

export const conditionsSunInputSchema = z.object({
  place: conditionsPlaceInputSchema,
  date: w3DateSchema,
});

export const conditionsSunSchema = z.object({
  locationKey: z.string().min(1).max(64),
  localDate: w3DateSchema,
  timezone: z.string().min(1),
  provider: conditionsProviderSchema,
  civilDawnAt: w3DateTimeSchema.optional(),
  sunriseAt: w3DateTimeSchema.optional(),
  goldenHourStartsAt: w3DateTimeSchema.optional(),
  sunsetAt: w3DateTimeSchema.optional(),
  civilDuskAt: w3DateTimeSchema.optional(),
  /** The day split into light phases; under-lights only where courts are lit. */
  phases: z.array(
    z.object({
      phase: conditionsLightPhaseSchema,
      startsAt: w3DateTimeSchema,
      endsAt: w3DateTimeSchema,
    }),
  ),
});

export const conditionsCourtWindInputSchema = z.object({
  courtId: w3IdSchema,
  hourStartsAt: w3DateTimeSchema.optional(),
});
export const conditionsCourtWindSchema = z.object({
  courtId: w3IdSchema,
  courtName: z.string().min(1),
  orientationDeg: z.number().int().min(0).max(179).optional(),
  lit: z.boolean(),
  windRelative: conditionsWindRelativeSchema,
  windStrength: conditionsWindStrengthSchema.optional(),
  /** "Gusts 22 mph · 2–4 PM". */
  note: z.string().optional(),
});

/** One venue's day for the schedule rail (W-Schedule-Stop, P04c). */
export const conditionsVenueDayInputSchema = z.object({
  venueId: w3IdSchema,
  date: w3DateSchema,
});
export const conditionsVenueDaySchema = z.object({
  venueId: w3IdSchema,
  date: w3DateSchema,
  forecast: conditionsForecastSchema,
  sun: conditionsSunSchema,
  courts: z.array(conditionsCourtWindSchema),
  /** The strongest alert in the day, for the banner ("Lightning 8 mi away"). */
  alert: z
    .object({
      level: conditionsAlertLevelSchema.exclude(["none"]),
      headline: z.string().min(1),
      hourStartsAt: w3DateTimeSchema,
    })
    .optional(),
});

export type ConditionsForecast = z.infer<typeof conditionsForecastSchema>;
export type ConditionsSun = z.infer<typeof conditionsSunSchema>;
export type ConditionsVenueDay = z.infer<typeof conditionsVenueDaySchema>;
