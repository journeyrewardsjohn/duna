import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { appRouter } from "@duna/api";
import { describe, expect, it } from "vitest";
import {
  capabilitiesFrom,
  demoCapabilities,
  SCHEDULE_CAPABILITY_PROCEDURES,
  type ScheduleCapability,
} from "./schedule-capabilities";

/** Every procedure path the API router serves today. */
function routerPaths(): string[] {
  const definition = (
    appRouter as unknown as { _def?: { procedures?: Record<string, unknown> } }
  )._def;
  return Object.keys(definition?.procedures ?? {});
}

describe("schedule capability switches", () => {
  it("turns a feature on only when its procedure exists", () => {
    expect(capabilitiesFrom(["operator.workspace"])).toEqual({
      createBooking: false,
      moveBooking: false,
      cancelBooking: false,
      deskPayment: false,
      removeBlock: false,
    });
    const on = capabilitiesFrom([
      "operator.schedule.createCourtBooking",
      "operator.schedule.recordDeskPayment.preview",
      "operator.schedule.moveCourtBookings",
    ]);
    expect(on.createBooking).toBe(true);
    expect(on.deskPayment).toBe(true);
    expect(on.moveBooking).toBe(false);
  });

  it("keeps every feature on in demo mode", () => {
    expect(Object.values(demoCapabilities).every(Boolean)).toBe(true);
  });

  it("never has a switch on while its action still answers “needs API”", () => {
    const source = readFileSync(
      fileURLToPath(
        new URL("../../app/(next)/(hq)/schedule/actions.ts", import.meta.url),
      ),
      "utf8",
    );
    const waiting = [...source.matchAll(/needsApi\(\s*"(\w+)"/g)].map(
      (match) => match[1] as ScheduleCapability,
    );
    expect(waiting.length).toBeGreaterThan(0);
    for (const capability of waiting) {
      expect(Object.keys(SCHEDULE_CAPABILITY_PROCEDURES)).toContain(capability);
    }
    const paths = routerPaths();
    expect(paths).toContain("operator.workspace");
    const live = capabilitiesFrom(paths);
    for (const capability of waiting) {
      expect(
        live[capability],
        `${capability} is on (its procedure exists) but its action still answers "needs API": wire the action to ${SCHEDULE_CAPABILITY_PROCEDURES[capability]}`,
      ).toBe(false);
    }
  });
});
