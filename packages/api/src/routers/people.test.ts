/**
 * operator.people.* in demo mode (no database): HQ's demo screens get
 * fixtures, writes change nothing and send nothing, and scopes still apply.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PersonRole } from "@duna/core";
import { createDemoActor } from "../context";
import { createCaller } from "../router";
import { peopleDemoIds } from "../services/people/demo";

const previousDatabaseUrl = process.env.DATABASE_URL;
beforeEach(() => {
  delete process.env.DATABASE_URL;
});
afterEach(() => {
  if (previousDatabaseUrl !== undefined)
    process.env.DATABASE_URL = previousDatabaseUrl;
});

function people(roles: readonly PersonRole[] = ["manager"]) {
  return createCaller({
    actor: createDemoActor(roles),
    requestId: crypto.randomUUID(),
    now: new Date("2026-11-28T12:00:00.000Z"),
  }).operator.people;
}

describe("operator.people demo mode", () => {
  it("serves every read", async () => {
    const personId = peopleDemoIds.maya;
    expect((await people().notes.list({ personId })).notes).toHaveLength(1);
    expect((await people().tags.list({ personId })).personTags).toEqual([
      "League",
    ]);
    expect(
      (await people().household({ personId: peopleDemoIds.junior })).contact
        ?.personId,
    ).toBe(peopleDemoIds.guardian);
    expect((await people().documents({ personId })).documents[0]?.status).toBe(
      "superseded",
    );
    const change = await people().planChangePreview({
      personId,
      membershipId: peopleDemoIds.note,
      toTierId: peopleDemoIds.tierTo,
      timing: "now",
    });
    expect(change.status).toBe("unavailable");
  });

  it("previews an import from the rows given and never sends", async () => {
    const preview = await people().importPreview({
      rows: [{ Name: "Ada Lane" }, { Name: "" }],
      mapping: { name: "Name" },
    });
    expect(preview.counts).toMatchObject({ create: 1, problem: 1 });
    const result = await people().import({
      previewId: preview.previewId,
      confirmed: true,
      idempotencyKey: crypto.randomUUID(),
    });
    expect(result.messagesSent).toBe(0);
    const invite = await people().inviteGuardian({
      juniorPersonId: peopleDemoIds.junior,
      guardianName: "Sam Rivera",
      relationship: "parent",
      email: "sam@example.test",
      confirmed: true,
      idempotencyKey: crypto.randomUUID(),
    });
    expect(invite.sent).toBe(false);
  });

  it("keeps scopes: front desk reads, cannot write; a role without members:read cannot read", async () => {
    await expect(
      people(["front-desk"]).notes.list({ personId: peopleDemoIds.maya }),
    ).resolves.toBeDefined();
    await expect(
      people(["front-desk"]).mergePreview({
        keepId: peopleDemoIds.maya,
        mergeId: peopleDemoIds.jordan,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      people(["accountant"]).household({ personId: peopleDemoIds.maya }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("requires confirmation on import, merge and membership changes", async () => {
    await expect(
      people().merge({
        previewId: peopleDemoIds.mergePreview,
        confirmed: false as unknown as true,
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
