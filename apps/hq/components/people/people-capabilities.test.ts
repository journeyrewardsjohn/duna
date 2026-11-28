import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The guard against shipping a dead end: a People capability switch turns
 * on by itself when its procedures appear in the API router, so if a switch
 * is on while its server action still answers "isn't switched on yet",
 * People would offer a button that cannot work. Each switch here runs its
 * actions against a stand-in caller and fails on the "needs API" answer.
 */
const logged: string[] = [];
const called: string[] = [];

vi.mock("@duna/observability", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@duna/observability")>()),
  log: {
    info: (event: string) => logged.push(event),
    warn: (event: string) => logged.push(event),
    error: (event: string) => logged.push(event),
  },
  report: () => "reference",
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/api", () => {
  const counts = {
    total: 1,
    create: 1,
    update: 0,
    duplicate: 0,
    problem: 0,
    juniors: 0,
    guardians: 0,
  };
  const answers: Record<string, unknown> = {
    "operator.people.importPreview": { counts, rows: [] },
    "operator.people.import": {
      status: "completed",
      processed: 1,
      total: 1,
      created: 1,
      updated: 0,
    },
  };
  // Any procedure path, recorded and answered (an empty object by default).
  const caller = (path: string[]): unknown =>
    new Proxy(async () => undefined, {
      // Not a promise: `await` must not treat the stand-in as one.
      get: (_target, key) =>
        key === "then" ? undefined : caller([...path, String(key)]),
      apply: async () => {
        called.push(path.join("."));
        return answers[path.join(".")] ?? {};
      },
    });
  return {
    getServerCaller: async () => caller([]),
    getServerContext: async () => ({ requestId: "request-1" }),
  };
});
vi.mock("@/components/people/people-data", () => ({
  isNotConfigured: () => false,
  loadPeople: async () => ({ state: "ok", data: { rows: [] } }),
  peopleContext: async () => ({ canExport: true }),
}));

const person = "10000000-0000-4000-8000-000000000201";
const other = "10000000-0000-4000-8000-000000000202";
const key = "10000000-0000-4000-8000-0000000000aa";

async function actions() {
  return import("@/app/(next)/(hq)/people/actions");
}

/** Every action each switch offers, called as its screen calls it. */
const actionsFor: Record<
  string,
  (a: Awaited<ReturnType<typeof actions>>) => Promise<{ ok: boolean }>[]
> = {
  import: (a) => [
    a.importPreviewAction({
      rows: [{ Name: "Sam Lee", Email: "sam@example.com" }],
      mapping: { name: "Name", email: "Email" },
    }),
    a.importPeopleAction({ previewId: key, idempotencyKey: key }),
  ],
  merge: (a) => [
    a.mergePreviewAction({ keepId: person, mergeId: other }),
    a.mergePeopleAction({ previewId: key, idempotencyKey: key }),
  ],
  notes: (a) => [
    a.addNoteAction({ personId: person, body: "Hi", idempotencyKey: key }),
    a.editNoteAction({ noteId: key, body: "Hi", idempotencyKey: key }),
    a.removeNoteAction({ noteId: key, idempotencyKey: key }),
  ],
  tags: (a) => [
    a.setTagsAction({
      personIds: [person],
      add: ["League"],
      idempotencyKey: key,
    }),
  ],
  household: (a) => [
    a.inviteGuardianAction({
      juniorPersonId: person,
      guardianName: "Sam Park",
      relationship: "parent",
      email: "sam@example.com",
      idempotencyKey: key,
    }),
    a.linkGuardianAction({
      juniorPersonId: person,
      guardianPersonId: other,
      relationship: "parent",
      idempotencyKey: key,
    }),
  ],
  documents: (a) => [
    a.requestSignatureAction({
      personId: person,
      waiverDocumentId: key,
      idempotencyKey: key,
    }),
  ],
  planChange: (a) => [
    a.planChangePreviewAction({
      personId: person,
      membershipId: key,
      toTierId: other,
      timing: "now",
    }),
    a.changePlanAction({
      personId: person,
      membershipId: key,
      toTierId: other,
      timing: "now",
      previewId: "preview",
      idempotencyKey: key,
    }),
  ],
  membershipChange: (a) => [
    a.changeMembershipAction({
      personId: person,
      planId: key,
      action: "pause",
      idempotencyKey: key,
    }),
  ],
};

describe("People capability switches never lead to a dead end", () => {
  // The whole API router loads once (slow on a cold CI runner).
  let paths: string[] = [];
  beforeAll(async () => {
    const { appRouter } = await import("@duna/api");
    paths = Object.keys(
      (appRouter as unknown as { _def: { procedures: object } })._def
        .procedures,
    );
  }, 120_000);

  beforeEach(() => {
    logged.length = 0;
    called.length = 0;
  });

  it("names every switch's actions here", async () => {
    const { PEOPLE_CAPABILITY_PROCEDURES } =
      await import("./people-capabilities");
    expect(Object.keys(actionsFor).sort()).toEqual(
      Object.keys(PEOPLE_CAPABILITY_PROCEDURES).sort(),
    );
  });

  it("every switch that is on reaches its procedures, never 'needs API'", async () => {
    const { capabilitiesFrom } = await import("./people-capabilities");
    const capabilities = capabilitiesFrom(paths);
    const loaded = await actions();
    for (const [capability, on] of Object.entries(capabilities)) {
      if (!on) continue;
      logged.length = 0;
      called.length = 0;
      const results = await Promise.all(actionsFor[capability]!(loaded));
      expect(logged, capability).not.toContain("hq.people.action_needs_api");
      for (const result of results) expect(result.ok, capability).toBe(true);
      expect(
        called.every((path) => path.startsWith("operator.people.")),
        capability,
      ).toBe(true);
      expect(called.length, capability).toBe(results.length);
    }
  }, 60_000);

  it("matches what the API serves today", async () => {
    const { capabilitiesFrom } = await import("./people-capabilities");
    const capabilities = capabilitiesFrom(paths);
    expect(capabilities).toEqual({
      import: true,
      merge: true,
      notes: true,
      tags: true,
      household: true,
      documents: true,
      // Needs a read of the club's plans with their ids (Needs API).
      planChange: false,
      // Pause, resume and cancel by staff are not built.
      membershipChange: false,
    });
  });
});
