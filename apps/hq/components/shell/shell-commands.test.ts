import { hqRoutes } from "@duna/core/hq-routes";
import { describe, expect, it } from "vitest";
import {
  parseShellCommand,
  shellCommands,
  shellCommandsFor,
} from "./shell-commands";
import {
  proposalChanges,
  proposalTier,
  operationTitle,
} from "./ask-duna-proposal";

describe("command palette", () => {
  it("lists every sidebar area and only real HQ addresses", () => {
    const templates = Object.values(hqRoutes).map(
      (template) =>
        new RegExp(
          `^${template.replace(/\[\[?\.{0,3}[^\]]+\]\]?/g, "[^/]+")}$`,
        ),
    );
    const places = shellCommands.flatMap((command) => {
      const parsed = parseShellCommand(command.value);
      return parsed.kind === "go" ? [parsed.href.split("?")[0]!] : [];
    });
    expect(places).toContain("/schedule");
    expect(places).toContain("/money");
    for (const path of places) {
      const served =
        templates.some((pattern) => pattern.test(path)) ||
        /^\/[a-z-]+$/.test(path);
      expect(served, path).toBe(true);
    }
    expect(new Set(shellCommands.map((c) => c.value)).size).toBe(
      shellCommands.length,
    );
  });

  it("never navigates away from HQ and ignores unknown commands", () => {
    expect(parseShellCommand("go://evil.example")).toEqual({ kind: "unknown" });
    expect(parseShellCommand("go:https://evil.example")).toEqual({
      kind: "unknown",
    });
    expect(parseShellCommand("do:format-disk")).toEqual({ kind: "unknown" });
    expect(parseShellCommand("do:ask")).toEqual({ kind: "do", action: "ask" });
  });
});

describe("People's switched palette entries", () => {
  const labels = (commands: readonly { label: string }[]) =>
    commands.map((command) => command.label);

  it("offers import and merge only when their switch is on", () => {
    expect(labels(shellCommandsFor(undefined))).not.toContain(
      "Import people from a file",
    );
    expect(
      labels(shellCommandsFor({ import: false, merge: false })),
    ).not.toContain("Merge duplicate people");
    const on = shellCommandsFor({ import: true, merge: true });
    expect(labels(on)).toContain("Import people from a file");
    expect(labels(on)).toContain("Merge duplicate people");
    // Still only real addresses, each once, kept with the People group.
    expect(new Set(on.map((c) => c.value)).size).toBe(on.length);
    const groups = on.map((command) => command.group);
    expect(groups.lastIndexOf("People")).toBeLessThan(groups.indexOf("Team"));
    expect(
      labels(shellCommandsFor({ import: true, merge: false })),
    ).not.toContain("Merge duplicate people");
  });
});

describe("Ask Duna proposals", () => {
  const action = {
    id: "act-1",
    operation: "operator.blockCourtTime",
    summary: "Block Court 2 from 2 to 4 PM",
    input: {
      courtId: "c2",
      startsAt: "14:00",
      endsAt: "16:00",
      idempotencyKey: "k",
    },
    status: "pending",
    expiresAt: "2026-11-28T00:00:00.000Z",
    result: null,
  };

  it("names the change and shows its new values without ids", () => {
    expect(operationTitle(action.operation)).toBe("Block court time");
    expect(proposalChanges(action)).toEqual([
      { label: "Starts at", before: "As it is now", after: "14:00" },
      { label: "Ends at", before: "As it is now", after: "16:00" },
    ]);
  });

  it("asks a strong confirmation for money and removals", () => {
    expect(proposalTier(action)).toBe("confirm");
    expect(
      proposalTier({ ...action, operation: "operator.refundBooking" }),
    ).toBe("strong");
  });
});
