import { conditionsDemo } from "@duna/core/demo/conditions";
import {
  conditionsAlertLevels,
  conditionsProviders,
  conditionsWindStrengths,
} from "@duna/db/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiContext, createDemoActor } from "../context";
import { createCaller } from "../router";
import { isNotImplementedYet } from "../routers/not-implemented";
import {
  conditionsCourtWindSchema,
  conditionsForecastSchema,
  conditionsLightPhaseSchema,
  conditionsSourceSchema,
  conditionsSunSchema,
  conditionsVenueDaySchema,
  conditionsWindRelativeSchema,
} from "./conditions";
import { expectCoverage } from "./w3-test-support";

const dataSource = vi.hoisted(() => ({ demo: true }));
vi.mock("../services/data-source", () => ({
  usesDemoData: () => dataSource.demo,
}));

describe("conditions contract and demo fixtures (W3-0)", () => {
  it("every fixture parses against its contract", () => {
    conditionsForecastSchema.parse(conditionsDemo.forecast);
    conditionsForecastSchema.parse(conditionsDemo.notConfigured);
    conditionsForecastSchema.parse(conditionsDemo.forecastLive);
    conditionsForecastSchema.parse(conditionsDemo.forecastStale);
    conditionsSunSchema.parse(conditionsDemo.sun);
    conditionsSunSchema.parse(conditionsDemo.sunComputed);
    for (const court of conditionsDemo.courts)
      conditionsCourtWindSchema.parse(court);
    conditionsVenueDaySchema.parse(conditionsDemo.venueDay);
  });

  it("covers every state", () => {
    const hours = conditionsDemo.forecast.hours;
    expectCoverage(
      conditionsAlertLevels,
      hours.map((h) => h.alertLevel),
    );
    expectCoverage(
      conditionsWindStrengths,
      hours.map((h) => h.windStrength),
    );
    expectCoverage(conditionsProviders, [
      ...hours.map((h) => h.provider),
      conditionsDemo.sun.provider,
      conditionsDemo.sunComputed.provider,
    ]);
    expectCoverage(
      conditionsLightPhaseSchema.options,
      conditionsDemo.sun.phases.map((p) => p.phase),
    );
    expectCoverage(
      conditionsWindRelativeSchema.options,
      conditionsDemo.courts.map((c) => c.windRelative),
    );
    expectCoverage(conditionsSourceSchema.options, [
      conditionsDemo.forecast.source,
      conditionsDemo.forecastLive.source,
      conditionsDemo.forecastStale.source,
      conditionsDemo.notConfigured.source,
    ]);
  });
});

describe("conditions routers in demo mode and connected mode (W3-0 stubs)", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    dataSource.demo = true;
  });

  const caller = () =>
    createCaller(createApiContext({ actor: createDemoActor() }));

  it("serves fixtures in demo mode", async () => {
    const api = caller();
    const day = await api.operator.conditions.venueDay({
      venueId: conditionsDemo.venueDay.venueId,
      date: "2026-11-28",
    });
    expect(day.alert?.level).toBe("stop");
    const forecast = await api.public.conditions.forecast({
      place: { latitude: 33.88, longitude: -118.41 },
      hours: 3,
    });
    expect(forecast.hours).toHaveLength(3);
    const sun = await api.public.conditions.sun({
      place: { latitude: 33.88, longitude: -118.41 },
      date: "2026-11-29",
    });
    expect(sun.provider).toBe("computed");
  });

  it("says 'not implemented yet' outside demo mode", async () => {
    dataSource.demo = false;
    const error = await caller()
      .public.conditions.sun({
        place: { latitude: 33.88, longitude: -118.41 },
        date: "2026-11-29",
      })
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(isNotImplementedYet(error)).toBe(true);
  });
});
