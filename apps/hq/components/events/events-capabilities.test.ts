import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { appRouter } from "@duna/api";
import { describe, expect, it } from "vitest";
import {
  capabilitiesFrom,
  demoCapabilities,
  EVENT_CAPABILITY_PROCEDURES,
  type EventCapability,
} from "./events-capabilities";

/** Every procedure path the API router serves today. */
function routerPaths(): string[] {
  const definition = (
    appRouter as unknown as { _def?: { procedures?: Record<string, unknown> } }
  )._def;
  return Object.keys(definition?.procedures ?? {});
}

const actionsSource = () =>
  readFileSync(
    fileURLToPath(
      new URL("../../app/(next)/(hq)/events/actions.ts", import.meta.url),
    ),
    "utf8",
  );

describe("events capability switches", () => {
  it("turns a feature on only when its procedure exists", () => {
    expect(capabilitiesFrom(["operator.workspace"])).toEqual({
      messageEntrants: false,
      recordResult: false,
      changeFee: false,
    });
    const on = capabilitiesFrom([
      "operator.events.recordMatchResult",
      "operator.events.changeDivisionFee.preview",
    ]);
    expect(on.recordResult).toBe(true);
    expect(on.changeFee).toBe(true);
    expect(on.messageEntrants).toBe(false);
  });

  it("keeps the demo's features on, except sending, which the demo never does", () => {
    expect(demoCapabilities.recordResult).toBe(true);
    expect(demoCapabilities.changeFee).toBe(true);
    expect(demoCapabilities.messageEntrants).toBe(false);
  });

  it("never has a switch on while its action still answers “needs API”", () => {
    const source = actionsSource();
    const pattern = /needsApi\(\s*"(\w+)"/g;
    // The pattern recognises a waiting action, across lines too.
    expect([
      ...'needsApi(\n  "changeFee", "…")'.matchAll(pattern),
    ]).toHaveLength(1);
    const waiting = [...source.matchAll(pattern)].map(
      (match) => match[1] as EventCapability,
    );
    expect(waiting.length).toBeGreaterThan(0);
    for (const capability of waiting) {
      expect(Object.keys(EVENT_CAPABILITY_PROCEDURES)).toContain(capability);
    }
    const paths = routerPaths();
    expect(paths).toContain("operator.sessionDetail");
    const live = capabilitiesFrom(paths);
    for (const capability of waiting) {
      expect(
        live[capability],
        `${capability} is on (its procedure exists) but its action still answers "needs API": wire the action to ${EVENT_CAPABILITY_PROCEDURES[capability]}`,
      ).toBe(false);
    }
    // And every switch that is on is wired: its action calls the procedure.
    for (const [capability, path] of Object.entries(
      EVENT_CAPABILITY_PROCEDURES,
    ) as [EventCapability, string][]) {
      if (!live[capability]) continue;
      expect(
        source,
        `${capability} is on: an action must call ${path}`,
      ).toContain(`caller.${path}(`);
    }
  });

  it("calls only procedures the API router serves", () => {
    const paths = new Set(routerPaths());
    const called = [
      ...new Set(
        [...actionsSource().matchAll(/caller\.(operator\.[\w.]+)\(/g)].map(
          (match) => match[1]!,
        ),
      ),
    ];
    expect(called.length).toBeGreaterThan(10);
    for (const path of called) expect(paths, path).toContain(path);
  });
});
