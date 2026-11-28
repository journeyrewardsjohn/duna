/**
 * Schema: conditions (owner: B11). Cached hourly weather and daily sun times
 * per location, so pages never call the weather provider directly. Court
 * orientation (`courts.orientation_deg`) lives in ../schema.ts. Rows are a
 * cache: safe to delete, refilled on demand. Written by the W3-0 schema
 * steward.
 */
import { sql } from "drizzle-orm";
import {
  check,
  date,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { venues } from "../schema";
import { at, nullOrOneOf, oneOf } from "./_columns";

export const conditionsAlertLevels = ["none", "watch", "stop"] as const;
export const conditionsProviders = ["tomorrow-io", "noaa", "computed"] as const;
export const conditionsWindStrengths = [
  "calm",
  "light",
  "steady",
  "strong",
] as const;

/**
 * One forecast hour for a location. `locationKey` is "venue:<uuid>" for a
 * venue or "geo:<lat>,<lng>" rounded to 2 decimals for anything else.
 */
export const conditionsHourly = pgTable(
  "conditions_hourly",
  {
    locationKey: varchar("location_key", { length: 64 }).notNull(),
    hourStartsAt: at("hour_starts_at").notNull(),
    venueId: uuid("venue_id").references(() => venues.id, {
      onDelete: "cascade",
    }),
    temperatureC: doublePrecision("temperature_c"),
    feelsLikeC: doublePrecision("feels_like_c"),
    windSpeedKph: doublePrecision("wind_speed_kph"),
    windGustKph: doublePrecision("wind_gust_kph"),
    windDirectionDeg: integer("wind_direction_deg"),
    windStrength: varchar("wind_strength", { length: 8 }),
    precipitationProbability: integer("precipitation_probability"),
    uvIndex: doublePrecision("uv_index"),
    lightningDistanceKm: doublePrecision("lightning_distance_km"),
    alertLevel: varchar("alert_level", { length: 8 }).notNull().default("none"),
    conditionCode: varchar("condition_code", { length: 32 }),
    provider: varchar("provider", { length: 12 }).notNull(),
    fetchedAt: at("fetched_at").notNull(),
    expiresAt: at("expires_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.locationKey, table.hourStartsAt] }),
    index("conditions_hourly_expires_idx").on(table.expiresAt),
    check(
      "conditions_hourly_alert_valid",
      oneOf(table.alertLevel, conditionsAlertLevels),
    ),
    check(
      "conditions_hourly_provider_valid",
      oneOf(table.provider, conditionsProviders),
    ),
    check(
      "conditions_hourly_wind_strength_valid",
      nullOrOneOf(table.windStrength, conditionsWindStrengths),
    ),
    check(
      "conditions_hourly_ranges_valid",
      sql`(${table.windDirectionDeg} IS NULL OR ${table.windDirectionDeg} BETWEEN 0 AND 359) AND (${table.precipitationProbability} IS NULL OR ${table.precipitationProbability} BETWEEN 0 AND 100) AND coalesce(${table.windSpeedKph}, 0) >= 0 AND coalesce(${table.windGustKph}, 0) >= 0 AND coalesce(${table.uvIndex}, 0) >= 0 AND coalesce(${table.lightningDistanceKm}, 0) >= 0`,
    ),
    check(
      "conditions_hourly_expiry_valid",
      sql`${table.expiresAt} > ${table.fetchedAt}`,
    ),
  ],
);

/** Sunrise, sunset and the light phases for one location and local date. */
export const conditionsSunTimes = pgTable(
  "conditions_sun_times",
  {
    locationKey: varchar("location_key", { length: 64 }).notNull(),
    localDate: date("local_date", { mode: "string" }).notNull(),
    timezone: varchar("timezone", { length: 64 }).notNull(),
    civilDawnAt: at("civil_dawn_at"),
    sunriseAt: at("sunrise_at"),
    goldenHourStartsAt: at("golden_hour_starts_at"),
    sunsetAt: at("sunset_at"),
    civilDuskAt: at("civil_dusk_at"),
    computedAt: at("computed_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.locationKey, table.localDate] }),
    check(
      "conditions_sun_order_valid",
      sql`${table.sunriseAt} IS NULL OR ${table.sunsetAt} IS NULL OR ${table.sunsetAt} > ${table.sunriseAt}`,
    ),
  ],
);
