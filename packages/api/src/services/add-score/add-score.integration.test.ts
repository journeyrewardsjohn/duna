import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@duna/db", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getDatabase: () => state.db,
  getTransactionalDatabase: () => state.db,
}));

import {
  applyAllMigrations,
  createCatalogTestDatabase,
  testActor,
} from "../../catalog-booking.test-support";
import type { AddScoreDraftData } from "../../contracts/add-score";
import {
  expireProviderContent,
  listCandidates,
  resolveCandidate,
} from "./candidates";
import {
  AddScoreError,
  claimScoreDraft,
  cleanUpScoreDrafts,
  previewScoreDraft,
  readScoreDraft,
  saveScoreDraft,
} from "./service";

const { pg, db } = createCatalogTestDatabase();
state.db = db;

const org = "11000000-0000-4000-8000-000000000001";
const venue = "12000000-0000-4000-8000-000000000001";
const claimer = "13000000-0000-4000-8000-000000000001";
const stranger = "13000000-0000-4000-8000-000000000002";
const junior = "13000000-0000-4000-8000-000000000003";
const staff = "13000000-0000-4000-8000-000000000004";
const now = new Date("2026-11-28T18:00:00.000Z");
let ipCounter = 0;
/** A fresh address per test so rate-limit buckets never leak between tests. */
const nextIp = () => `198.51.100.${(ipCounter += 1)}`;

const place = {
  kind: "described" as const,
  name: "North Lot courts",
  address: "Behind the north parking lot",
  latitude: 33.8857,
  longitude: -118.4105,
  surface: "beach-sand" as const,
  nets: 2,
};
const score = {
  format: 2 as const,
  matchType: "competitive" as const,
  playedOn: "2026-11-27",
  sets: [
    { you: 21, them: 18 },
    { you: 19, them: 21 },
    { you: 15, them: 12 },
  ],
};
const players = {
  you: { firstName: "Sam" },
  teammates: [{ firstName: "Ana" }],
  opponents: [{ firstName: "Bo", lastInitial: "R" }, { firstName: "Cy" }],
  agreed: true,
};

async function count(table: string): Promise<number> {
  const result = await pg.query<{ n: number }>(
    `select count(*)::int as n from ${table}`,
  );
  return result.rows[0]?.n ?? 0;
}

/** Saves all three steps and returns the cookie token. */
async function fullDraft(
  ip = nextIp(),
  overrides: { readonly place?: AddScoreDraftData["place"] } = {},
): Promise<string> {
  const first = await saveScoreDraft({
    step: "where",
    data: { place: overrides.place ?? place },
    ipAddress: ip,
    requestId: crypto.randomUUID(),
    now,
  });
  if (first.status !== "saved" || !first.newToken) {
    throw new Error(`where step failed: ${JSON.stringify(first)}`);
  }
  const token = first.newToken;
  for (const [step, data] of [
    ["score", score],
    ["players", players],
  ] as const) {
    const saved = await saveScoreDraft({
      token,
      step,
      data,
      ipAddress: ip,
      requestId: crypto.randomUUID(),
      now,
    });
    expect(saved.status).toBe("saved");
  }
  return token;
}

const claimPlayers = {
  teammates: [{ firstName: "Ana", lastName: "K" }],
  opponents: [
    { firstName: "Bo", lastName: "R" },
    { firstName: "Cy", lastName: "Lee" },
  ],
};

function claim(token: string, personId = claimer, extra = {}) {
  return claimScoreDraft({
    actor: testActor(personId),
    claim: {
      token,
      ...claimPlayers,
      idempotencyKey: crypto.randomUUID(),
      ...extra,
    },
    requestId: crypto.randomUUID(),
    ipAddress: nextIp(),
    now,
  });
}

beforeAll(async () => {
  vi.stubEnv("TOMORROW_IO_API_KEY", "");
  await applyAllMigrations(pg);
}, 120_000);

afterAll(async () => {
  vi.unstubAllEnvs();
  await pg.close();
});

beforeEach(async () => {
  await pg.exec(`
    TRUNCATE organizations, people, score_drafts, venue_candidates, rate_limit_buckets CASCADE;
    INSERT INTO organizations (id, slug, name, currency, timezone)
      VALUES ('${org}', 'pier-club', 'Pier Club', 'USD', 'America/Los_Angeles');
    INSERT INTO venues (id, organization_id, slug, name, status, timezone, latitude, longitude, google_place_id)
      VALUES ('${venue}', '${org}', 'pier', 'Pier Courts', 'active', 'America/Los_Angeles', 33.8847, -118.4109, 'ChIJpier-courts-0001');
    INSERT INTO people (id, display_name, handle, profile_claim_status)
      VALUES ('${claimer}', 'Sam Player', 'sam', 'claimed'),
             ('${stranger}', 'Someone Else', 'someone', 'claimed'),
             ('${junior}', 'Young Player', 'young', 'claimed'),
             ('${staff}', 'Staff', 'staff', 'claimed');
  `);
});

describe("draft lifecycle", () => {
  it("starts on the first step, resumes, and knows which steps are done", async () => {
    const ip = nextIp();
    const first = await saveScoreDraft({
      step: "where",
      data: { place },
      ipAddress: ip,
      requestId: "r1",
      now,
    });
    expect(first.status).toBe("saved");
    if (first.status !== "saved") return;
    expect(first.newToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.draft.completed).toEqual(["where"]);
    expect(first.draft.place).toMatchObject({
      isNew: true,
      label: "North Lot courts",
    });
    expect(new Date(first.draft.expiresAt).getTime() - now.getTime()).toBe(
      7 * 86_400_000,
    );

    // The token is never stored; only its hash.
    const stored = await pg.query<{ token_hash: string }>(
      "select token_hash from score_drafts",
    );
    expect(stored.rows[0]?.token_hash).not.toContain(first.newToken!);

    const read = await readScoreDraft({
      token: first.newToken,
      ipAddress: ip,
      requestId: "r2",
      now,
    });
    expect(read).toMatchObject({ state: "active" });
    expect(
      await readScoreDraft({ ipAddress: ip, requestId: "r3", now }),
    ).toEqual({
      state: "none",
    });
  });

  it("an invalid step is answered in place and starts nothing", async () => {
    const result = await saveScoreDraft({
      step: "score",
      data: { ...score, sets: [{ you: 21, them: 20 }] },
      ipAddress: nextIp(),
      requestId: "r",
      now,
    });
    expect(result).toEqual({
      status: "invalid",
      fieldErrors: {
        sets: "Every set is won by at least 2 points. Check each set.",
      },
    });
    expect(await count("score_drafts")).toBe(0);
  });

  it("expires seven days after it was started, and the cleanup deletes it", async () => {
    const token = await fullDraft();
    const later = new Date(now.getTime() + 7 * 86_400_000 + 1);
    expect(
      await readScoreDraft({
        token,
        ipAddress: nextIp(),
        requestId: "r",
        now: later,
      }),
    ).toEqual({ state: "expired" });
    expect(await count("score_drafts")).toBe(0);

    await fullDraft();
    await fullDraft();
    expect(await count("score_drafts")).toBe(2);
    expect(await cleanUpScoreDrafts({ now: later })).toMatchObject({
      draftsDeleted: 2,
    });
    expect(await count("score_drafts")).toBe(0);
  });
});

describe("what this result would do", () => {
  it("reads the draft and writes nothing anywhere", async () => {
    const token = await fullDraft();
    const before = {
      matches: await count("matches"),
      ratings: await count("ratings"),
      ratingEvents: await count("rating_events"),
      drafts: await pg.query("select updated_at, data from score_drafts"),
    };
    const preview = await previewScoreDraft({
      token,
      ipAddress: nextIp(),
      requestId: "r",
      now,
    });
    expect(preview.state).toBe("ready");
    if (preview.state !== "ready") return;
    expect(preview.preview).toMatchObject({
      result: "won",
      counts: true,
      reason: "competitive-doubles",
    });
    expect(preview.preview.whatItWouldDo?.change).toBeGreaterThan(0);
    expect(await count("matches")).toBe(before.matches);
    expect(await count("ratings")).toBe(before.ratings);
    expect(await count("rating_events")).toBe(before.ratingEvents);
    expect(
      (await pg.query("select updated_at, data from score_drafts")).rows,
    ).toEqual(before.drafts.rows);
  });

  it("says what is missing before the draft is complete", async () => {
    const ip = nextIp();
    const first = await saveScoreDraft({
      step: "where",
      data: { place },
      ipAddress: ip,
      requestId: "r",
      now,
    });
    if (first.status !== "saved") throw new Error("not saved");
    expect(
      await previewScoreDraft({
        token: first.newToken,
        ipAddress: ip,
        requestId: "r",
        now,
      }),
    ).toEqual({ state: "not-ready", missing: ["score", "players"] });
  });
});

describe("claim", () => {
  it("creates exactly one unverified match, moves no rating, and is idempotent", async () => {
    const token = await fullDraft();
    const first = await claim(token);
    expect(first.status).toBe("claimed");
    const matchRows = await pg.query<{
      id: string;
      status: string;
      rating_eligible: boolean;
      created_by_person_id: string;
    }>("select id, status, rating_eligible, created_by_person_id from matches");
    expect(matchRows.rows).toHaveLength(1);
    expect(matchRows.rows[0]).toMatchObject({
      id: first.matchId,
      status: "pending-verification",
      rating_eligible: false,
      created_by_person_id: claimer,
    });
    expect(await count("ratings")).toBe(0);
    expect(await count("rating_events")).toBe(0);

    const again = await claim(token);
    expect(again).toEqual({
      status: "already-claimed",
      matchId: first.matchId,
    });
    expect(await count("matches")).toBe(1);

    // The draft keeps only who claimed it and the match.
    const draft = await pg.query<{ status: string; data: unknown }>(
      "select status, data from score_drafts",
    );
    expect(draft.rows[0]).toEqual({ status: "claimed", data: {} });
    expect(
      await readScoreDraft({ token, ipAddress: nextIp(), requestId: "r", now }),
    ).toEqual({ state: "claimed", matchId: first.matchId });
  });

  it("can never be claimed by someone else", async () => {
    const token = await fullDraft();
    await claim(token);
    await expect(claim(token, stranger)).rejects.toMatchObject({
      code: "CLAIMED_BY_SOMEONE_ELSE",
    });
    expect(await count("matches")).toBe(1);
  });

  it("refuses an under-13 account and leaves the draft as it was", async () => {
    const token = await fullDraft();
    await expect(
      claimScoreDraft({
        actor: testActor(junior, undefined, "under-13"),
        claim: { token, ...claimPlayers, idempotencyKey: crypto.randomUUID() },
        requestId: "r",
        now,
      }),
    ).rejects.toMatchObject({ code: "UNDER_13" });
    expect(await count("matches")).toBe(0);
    const draft = await pg.query<{ status: string }>(
      "select status from score_drafts",
    );
    expect(draft.rows[0]?.status).toBe("draft");
    // A teen may claim (the existing recorder allows it).
    const teen = await claimScoreDraft({
      actor: testActor(junior, undefined, "teen"),
      claim: { token, ...claimPlayers, idempotencyKey: crypto.randomUUID() },
      requestId: "r",
      now,
    });
    expect(teen.status).toBe("claimed");
  });

  it("needs every player for the format, and hands the draft back on failure", async () => {
    const token = await fullDraft();
    await expect(
      claim(token, claimer, { opponents: [claimPlayers.opponents[0]] }),
    ).rejects.toMatchObject({ code: "PLAYERS_DO_NOT_MATCH" });
    // A contact that already belongs to a claimed profile: the recorder
    // refuses it, and the draft is still there to fix and retry.
    await pg.exec(
      `update people set email = 'someone@example.com' where id = '${stranger}'`,
    );
    await expect(
      claim(token, claimer, {
        opponents: [
          { ...claimPlayers.opponents[0], email: "someone@example.com" },
          claimPlayers.opponents[1],
        ],
      }),
    ).rejects.toThrow(/already has a Duna profile/);
    const draft = await pg.query<{ status: string }>(
      "select status from score_drafts",
    );
    expect(draft.rows[0]?.status).toBe("draft");
    expect((await claim(token)).status).toBe("claimed");
  });

  it("refuses an expired draft", async () => {
    const token = await fullDraft();
    await expect(
      claimScoreDraft({
        actor: testActor(claimer),
        claim: { token, ...claimPlayers, idempotencyKey: crypto.randomUUID() },
        requestId: "r",
        now: new Date(now.getTime() + 8 * 86_400_000),
      }),
    ).rejects.toMatchObject({ code: "EXPIRED" });
  });
});

describe("rate limits", () => {
  it("one address can start 12 drafts an hour; the 13th is told to wait", async () => {
    const ip = nextIp();
    for (let index = 0; index < 12; index += 1) {
      const saved = await saveScoreDraft({
        step: "where",
        data: { place },
        ipAddress: ip,
        requestId: "r",
        now,
      });
      expect(saved.status).toBe("saved");
    }
    const error = await saveScoreDraft({
      step: "where",
      data: { place },
      ipAddress: ip,
      requestId: "r",
      now,
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AddScoreError);
    expect(error).toMatchObject({ code: "RATE_LIMITED" });
    expect((error as AddScoreError).retryAfterSeconds).toBeGreaterThan(0);
    // Another address is unaffected.
    expect(
      (
        await saveScoreDraft({
          step: "where",
          data: { place },
          ipAddress: nextIp(),
          requestId: "r",
          now,
        })
      ).status,
    ).toBe("saved");
    // The bucket key never holds the raw address.
    const keys = await pg.query<{ key: string }>(
      "select key from rate_limit_buckets",
    );
    expect(keys.rows.every((row) => !row.key.includes(ip))).toBe(true);
  });

  it("one draft can be saved 30 times in a burst", async () => {
    const token = await fullDraft();
    let limited = false;
    for (let index = 0; index < 40 && !limited; index += 1) {
      try {
        await saveScoreDraft({
          token,
          step: "score",
          data: score,
          ipAddress: nextIp(),
          requestId: "r",
          now,
        });
      } catch (error) {
        limited = (error as AddScoreError).code === "RATE_LIMITED";
      }
    }
    expect(limited).toBe(true);
  });
});

describe("candidate venues", () => {
  const providerPlace = {
    kind: "places" as const,
    placeId: "ChIJnew-court-000001",
    name: "Dockside Sand Courts",
    address: "1 Harbor Way",
    latitude: 33.9,
    longitude: -118.42,
  };

  it("a provider place becomes one candidate counted once per draft", async () => {
    await fullDraft(nextIp(), { place: providerPlace });
    await fullDraft(nextIp(), { place: providerPlace });
    const rows = await pg.query<{
      source: string;
      google_place_id: string;
      distinct_submitters: number;
      status: string;
    }>(
      "select source, google_place_id, distinct_submitters, status from venue_candidates",
    );
    expect(rows.rows).toEqual([
      {
        source: "places",
        google_place_id: "ChIJnew-court-000001",
        distinct_submitters: 2,
        status: "pending",
      },
    ]);
  });

  it("a place Duna already lists is that venue, not a candidate", async () => {
    const token = await fullDraft(nextIp(), {
      place: { ...providerPlace, placeId: "ChIJpier-courts-0001" },
    });
    expect(await count("venue_candidates")).toBe(0);
    const draft = await pg.query<{ venue_id: string }>(
      "select venue_id from score_drafts",
    );
    expect(draft.rows[0]?.venue_id).toBe(venue);
    const read = await readScoreDraft({
      token,
      ipAddress: nextIp(),
      requestId: "r",
      now,
    });
    expect(read.state === "active" && read.draft.place?.isNew).toBe(false);
  });

  it("a described court near a similar one joins it; near a venue it suggests the venue", async () => {
    await fullDraft();
    await fullDraft(nextIp(), {
      place: {
        ...place,
        name: "North Lot Court",
        latitude: 33.8858,
        longitude: -118.4106,
      },
    });
    await fullDraft(nextIp(), {
      place: {
        kind: "described",
        name: "Pier Courts north end",
        address: "By the pier",
        latitude: 33.8849,
        longitude: -118.411,
      },
    });
    const rows = await pg.query<{
      described_name: string;
      distinct_submitters: number;
      suggested_venue_id: string | null;
    }>(
      "select described_name, distinct_submitters, suggested_venue_id from venue_candidates order by described_name",
    );
    expect(rows.rows).toEqual([
      {
        described_name: "North Lot courts",
        distinct_submitters: 2,
        suggested_venue_id: null,
      },
      {
        described_name: "Pier Courts north end",
        distinct_submitters: 1,
        suggested_venue_id: venue,
      },
    ]);
  });

  it("claiming counts the submitter as claimed; changing the place moves the count", async () => {
    const ip = nextIp();
    const token = await fullDraft(ip);
    await saveScoreDraft({
      token,
      step: "where",
      data: { place: providerPlace },
      ipAddress: ip,
      requestId: "r",
      now,
    });
    const before = await pg.query<{
      source: string;
      distinct_submitters: number;
    }>(
      "select source, distinct_submitters from venue_candidates order by source",
    );
    expect(before.rows).toEqual([
      { source: "described", distinct_submitters: 0 },
      { source: "places", distinct_submitters: 1 },
    ]);
    await claim(token);
    const after = await pg.query<{ claimed_submitters: number }>(
      "select claimed_submitters from venue_candidates where source = 'places'",
    );
    expect(after.rows[0]?.claimed_submitters).toBe(1);
  });

  it("staff list, dismiss and promote; provider content goes after 30 days", async () => {
    await fullDraft(nextIp(), { place: providerPlace });
    await fullDraft();
    const pending = await listCandidates({ status: "pending", limit: 10, now });
    expect(pending).toHaveLength(2);
    const described = pending.find((item) => item.source === "described")!;
    const fromProvider = pending.find((item) => item.source === "places")!;
    expect(fromProvider.name).toBe("Dockside Sand Courts");

    expect(
      await resolveCandidate({
        decision: {
          action: "dismiss",
          candidateId: described.id,
          note: "Duplicate of a car park",
        },
        reviewerPersonId: staff,
        now,
      }),
    ).toMatchObject({ status: "dismissed", venueId: null });
    await expect(
      resolveCandidate({
        decision: {
          action: "promote",
          candidateId: described.id,
          organizationId: org,
          name: "North Lot",
          timezone: "America/Los_Angeles",
        },
        reviewerPersonId: staff,
        now,
      }),
    ).rejects.toMatchObject({ code: "ALREADY_RESOLVED" });

    const promoted = await resolveCandidate({
      decision: {
        action: "promote",
        candidateId: fromProvider.id,
        organizationId: org,
        name: "Dockside Sand Courts",
        timezone: "America/Los_Angeles",
      },
      reviewerPersonId: staff,
      now,
    });
    expect(promoted.status).toBe("promoted");
    // A promoted court is a DRAFT venue: not public until an operator publishes it.
    const created = await pg.query<{ status: string; google_place_id: string }>(
      `select status, google_place_id from venues where id = '${promoted.venueId}'`,
    );
    expect(created.rows[0]).toEqual({
      status: "draft",
      google_place_id: "ChIJnew-court-000001",
    });

    await fullDraft(nextIp(), {
      place: { ...providerPlace, placeId: "ChIJanother-court-02" },
    });
    // Both provider-sourced candidates, the promoted one included.
    expect(
      await expireProviderContent(new Date(now.getTime() + 31 * 86_400_000)),
    ).toBe(2);
    const expired = await listCandidates({
      status: "pending",
      limit: 10,
      now: new Date(now.getTime() + 31 * 86_400_000),
    });
    expect(expired[0]).toMatchObject({
      name: null,
      address: null,
      latitude: null,
      providerContentExpired: true,
      googlePlaceId: "ChIJanother-court-02",
    });
  });
});
