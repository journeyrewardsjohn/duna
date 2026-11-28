/**
 * Router seam: conditions (owner: B11). Hourly weather, sun times and light
 * phases, wind on court. Shapes are frozen in ../contracts/conditions.ts
 * (W3-0). Pages never call the weather provider directly: the service reads
 * `conditions_hourly` / `conditions_sun_times` and refills on expiry.
 *
 * Mounted once in ../router.ts:
 *   operator.conditions  organizationProcedure("sessions:read")
 *   public.conditions    publicProcedure (anonymous, IP rate limited)
 *
 * Every procedure returns its fixture from @duna/core/demo/conditions in
 * demo mode and throws `notImplementedYet` otherwise until B11 lands the
 * service in ../services/conditions/. Read ./README.md first.
 */
import { conditionsDemo } from "@duna/core/demo/conditions";
import { TRPCError } from "@trpc/server";
import { organizationProcedure, publicProcedure, router } from "../auth";
import {
  conditionsCourtWindInputSchema,
  conditionsCourtWindSchema,
  conditionsForecastInputSchema,
  conditionsForecastSchema,
  conditionsSunInputSchema,
  conditionsSunSchema,
  conditionsVenueDayInputSchema,
  conditionsVenueDaySchema,
} from "../contracts/conditions";
import { usesDemoData } from "../services/data-source";
import { notImplementedYet } from "./not-implemented";
import { domainSeamStatus, domainSeamStatusSchema } from "./seam-status";

const DOMAIN = "conditions";
const read = organizationProcedure("sessions:read");

function demoSun(place: { venueId?: string }, date: string) {
  const base = place.venueId ? conditionsDemo.sun : conditionsDemo.sunComputed;
  return { ...base, localDate: date };
}

export const conditionsOperatorRouter = router({
  status: read
    .output(domainSeamStatusSchema)
    .query(() => domainSeamStatus(DOMAIN)),

  /** A venue's day: forecast, sun, wind on each court, strongest alert. */
  venueDay: read
    .input(conditionsVenueDayInputSchema)
    .output(conditionsVenueDaySchema)
    .query(({ input }) => {
      if (usesDemoData()) {
        return { ...conditionsDemo.venueDay, date: input.date };
      }
      return notImplementedYet(DOMAIN, "venueDay");
    }),

  /** Wind relative to one court's orientation for an hour (default: now). */
  courtWind: read
    .input(conditionsCourtWindInputSchema)
    .output(conditionsCourtWindSchema)
    .query(({ input }) => {
      if (usesDemoData()) {
        const court = conditionsDemo.courts.find(
          (candidate) => candidate.courtId === input.courtId,
        );
        if (!court) throw new TRPCError({ code: "NOT_FOUND" });
        return court;
      }
      return notImplementedYet(DOMAIN, "courtWind");
    }),
});

export const conditionsPublicRouter = router({
  status: publicProcedure
    .output(domainSeamStatusSchema)
    .query(() => domainSeamStatus(DOMAIN)),

  /** Hourly forecast for a venue or a point (booking pages, club page). */
  forecast: publicProcedure
    .input(conditionsForecastInputSchema)
    .output(conditionsForecastSchema)
    .query(({ input }) => {
      if (usesDemoData()) {
        const hours = conditionsDemo.forecast.hours.slice(0, input.hours);
        return { ...conditionsDemo.forecast, hours };
      }
      return notImplementedYet(DOMAIN, "forecast");
    }),

  /** Sunrise, sunset and light phases for a date. */
  sun: publicProcedure
    .input(conditionsSunInputSchema)
    .output(conditionsSunSchema)
    .query(({ input }) => {
      if (usesDemoData()) {
        return demoSun(input.place as { venueId?: string }, input.date);
      }
      return notImplementedYet(DOMAIN, "sun");
    }),
});
