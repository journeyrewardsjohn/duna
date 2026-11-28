import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const eventWorkspace = readFileSync(
  new URL("./event-operations-workspace.tsx", import.meta.url),
  "utf8",
);
const divisionWorkspace = readFileSync(
  new URL("./division-competition-workspace.tsx", import.meta.url),
  "utf8",
);

describe("tournament launch workspace", () => {
  it("makes the event-wide launch sequence explicit", () => {
    expect(eventWorkspace).toContain("Close registration");
    expect(eventWorkspace).toContain("Publish &amp; Set Live");
    expect(eventWorkspace).toContain("Message to participants");
    expect(eventWorkspace).toContain("Complete each unfinished gate");
  });

  it("keeps seed and pool overrides noted and separately finalized", () => {
    expect(divisionWorkspace).toContain("Finalize Seeding");
    expect(divisionWorkspace).toContain("Finalize Pools");
    expect(divisionWorkspace).toContain("Required override note");
    expect(divisionWorkspace).toContain("Save audited swap");
    expect(divisionWorkspace).toContain("Override note:");
  });
});
