/**
 * PRIV-1: operator.memberProfile returns a member's health block only to a
 * viewer the Health service itself would let read that person's summary,
 * narrowed to the club the profile is read in. Everyone else gets no block
 * at all (not null, not a flag), and no health value anywhere in the JSON.
 *
 * In-memory Postgres with every real migration; the procedures run through
 * the real router so scope checks, tenancy and the Health rule all apply.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@duna/db", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getDatabase: () => state.db,
  getReadOnlyDatabase: () => state.db,
  getTransactionalDatabase: () => state.db,
}));

import {
  applyAllMigrations,
  createCatalogTestDatabase,
} from "./catalog-booking.test-support";
import type { ApiActor } from "./context";
import { scopesForRoles } from "./context";
import { encryptHealthPayload } from "./health-service";
import { createCaller } from "./router";
import { readAskDunaOperation } from "./ask-duna-tools";
import type { PersonRole } from "@duna/core";

const { pg, db } = createCatalogTestDatabase();
state.db = db;

const ids = {
  club: "11000000-0000-4000-8000-000000000001",
  otherClub: "11000000-0000-4000-8000-000000000002",
  tier: "12000000-0000-4000-8000-000000000001",
  otherTier: "12000000-0000-4000-8000-000000000002",
  owner: "13000000-0000-4000-8000-000000000001",
  manager: "13000000-0000-4000-8000-000000000002",
  coachShared: "13000000-0000-4000-8000-000000000003",
  coachOther: "13000000-0000-4000-8000-000000000004",
  frontDesk: "13000000-0000-4000-8000-000000000005",
  accountant: "13000000-0000-4000-8000-000000000006",
  guardian: "13000000-0000-4000-8000-000000000007",
  otherClubOwner: "13000000-0000-4000-8000-000000000008",
  /** Adult who shared a summary with coachShared only. */
  adultCoachGrant: "14000000-0000-4000-8000-000000000001",
  /** Adult who shared a summary with the club. */
  adultClubGrant: "14000000-0000-4000-8000-000000000002",
  /** 15-year-old whose guardian approved a grant to the club. */
  junior: "14000000-0000-4000-8000-000000000003",
  /** Adult who shared with a different club only. */
  adultOtherClubGrant: "14000000-0000-4000-8000-000000000004",
} as const;

const now = new Date("2026-11-28T12:00:00.000Z");
const expires = "2027-01-15T00:00:00.000Z";
/** Distinctive values that must never appear for a non-viewer. */
const STEPS = 7_319;
const RESTING_HEART_RATE = 47;
/** A metric a 13-to-17-year-old may sync (steps is not one). */
const ACTIVE_ENERGY = 613;

function actor(
  personId: string,
  roles: readonly PersonRole[],
  organizationId: string = ids.club,
): ApiActor {
  return {
    personId,
    displayName: "Viewer",
    roles,
    organizationId,
    scopes: scopesForRoles(roles),
    ageBand: "adult",
    isDemo: false,
  };
}

function caller(viewer: ApiActor) {
  return createCaller({ actor: viewer, requestId: crypto.randomUUID(), now });
}

async function seed() {
  const staff: [string, string][] = [
    [ids.owner, "owner"],
    [ids.manager, "manager"],
    [ids.coachShared, "coach"],
    [ids.coachOther, "coach"],
    [ids.frontDesk, "front-desk"],
    [ids.accountant, "accountant"],
  ];
  const subjects: [string, string, string][] = [
    [ids.adultCoachGrant, "Avery Adult", "1990-05-01"],
    [ids.adultClubGrant, "Blake Adult", "1988-02-11"],
    [ids.junior, "Casey Junior", "2011-06-01"],
    [ids.adultOtherClubGrant, "Drew Adult", "1992-09-09"],
  ];
  await pg.exec(`
    INSERT INTO organizations (id, slug, name, currency, timezone) VALUES
      ('${ids.club}', 'priv-club', 'Privacy Club', 'USD', 'UTC'),
      ('${ids.otherClub}', 'other-club', 'Other Club', 'USD', 'UTC');
    INSERT INTO people (id, display_name, handle, birth_date) VALUES
      ${[...staff.map(([id], index) => `('${id}', 'Staff ${index}', 'staff-${index}', '1980-01-01')`), `('${ids.guardian}', 'Guardian', 'guardian', '1979-03-03')`, `('${ids.otherClubOwner}', 'Other owner', 'other-owner', '1975-01-01')`, ...subjects.map(([id, name, birth], index) => `('${id}', '${name}', 'subject-${index}', '${birth}')`)].join(",\n      ")};
    UPDATE people SET is_minor = true WHERE id = '${ids.junior}';
    INSERT INTO organization_memberships (organization_id, person_id, role) VALUES
      ${[...staff.map(([id, role]) => `('${ids.club}', '${id}', '${role}')`), `('${ids.otherClub}', '${ids.otherClubOwner}', 'owner')`, `('${ids.otherClub}', '${ids.owner}', 'manager')`].join(", ")};
    INSERT INTO membership_tiers (id, organization_id, code, name, price_minor, currency, interval) VALUES
      ('${ids.tier}', '${ids.club}', 'adult', 'Adult', 5000, 'USD', 'month'),
      ('${ids.otherTier}', '${ids.otherClub}', 'adult', 'Adult', 5000, 'USD', 'month');
    INSERT INTO memberships (person_id, tier_id, status) VALUES
      ${subjects.map(([id]) => `('${id}', '${ids.tier}', 'active')`).join(", ")},
      ('${ids.adultOtherClubGrant}', '${ids.otherTier}', 'active');
    INSERT INTO organization_participants (organization_id, person_id, relationship, status) VALUES
      ${subjects.map(([id]) => `('${ids.club}', '${id}', 'member', 'active')`).join(", ")};
    INSERT INTO guardianships (guardian_id, minor_id, relationship, verified, review_status)
      VALUES ('${ids.guardian}', '${ids.junior}', 'parent', true, 'verified');
    INSERT INTO health_sharing_grants (owner_person_id, audience_kind, audience_person_id, organization_id, categories, scopes, consent_version, consent_text_hash, expires_at, approval_status) VALUES
      ('${ids.adultCoachGrant}', 'coach', '${ids.coachShared}', NULL, ARRAY['activity','heart'], ARRAY['summary'], 'v1', 'hash', '${expires}', 'not-required'),
      ('${ids.adultClubGrant}', 'organization', NULL, '${ids.club}', ARRAY['activity','heart'], ARRAY['summary'], 'v1', 'hash', '${expires}', 'not-required'),
      ('${ids.junior}', 'organization', NULL, '${ids.club}', ARRAY['activity','heart'], ARRAY['summary'], 'v1', 'hash', '${expires}', 'approved'),
      ('${ids.adultOtherClubGrant}', 'organization', NULL, '${ids.otherClub}', ARRAY['activity','heart'], ARRAY['summary'], 'v1', 'hash', '${expires}', 'not-required');
  `);
  for (const [personId] of subjects) {
    await pg.query(
      `INSERT INTO health_connections (person_id, consent_version, enabled_categories, timezone, last_synced_at)
       VALUES ($1, 'v1', ARRAY['activity','heart'], 'UTC', $2)`,
      [personId, now.toISOString()],
    );
    for (const [metric, value, unit] of [
      ["steps", STEPS, "count"],
      ["resting-heart-rate", RESTING_HEART_RATE, "count/min"],
      ["active-energy", ACTIVE_ENERGY, "kcal"],
    ] as const) {
      const payload = encryptHealthPayload({ value, unit });
      await pg.query(
        `INSERT INTO health_samples (person_id, external_id_hash, metric, sample_kind, started_at, ended_at, encrypted_payload, encryption_iv, auth_tag, key_version)
         VALUES ($1, $2, $3, 'quantity', $4, $5, $6, $7, $8, $9)`,
        [
          personId,
          `${personId}:${metric}`.slice(0, 64),
          metric,
          "2026-11-27T08:00:00.000Z",
          "2026-11-27T09:00:00.000Z",
          payload.encryptedPayload,
          payload.encryptionIv,
          payload.authTag,
          payload.keyVersion,
        ],
      );
    }
  }
}

const previousKey = process.env.HEALTH_DATA_ENCRYPTION_KEY;

beforeAll(async () => {
  process.env.HEALTH_DATA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString(
    "base64",
  );
  await applyAllMigrations(pg);
  await seed();
}, 120_000);

afterAll(async () => {
  if (previousKey === undefined) delete process.env.HEALTH_DATA_ENCRYPTION_KEY;
  else process.env.HEALTH_DATA_ENCRYPTION_KEY = previousKey;
  await pg.close();
});

async function profileFor(viewer: ApiActor, personId: string) {
  return caller(viewer).operator.memberProfile({ personId });
}

/** No health value, for anyone: values come only from memberHealthProfile. */
function expectNoValues(profile: object) {
  const json = JSON.stringify(profile);
  expect(json).not.toContain(String(STEPS));
  expect(json).not.toContain(String(ACTIVE_ENERGY));
  // A JSON value ("key":47), never a clock time: a bare ":47" matched the
  // minute of any timestamp and failed whenever CI ran at HH:47.
  expect(json).not.toMatch(new RegExp(`":${RESTING_HEART_RATE}(?![\\d.])`));
  expect(json).not.toMatch(
    /metrics|restingHeartRate|readinessScore|heartRate|observedAt|steps/,
  );
}

type Profile = Awaited<ReturnType<typeof profileFor>>;

/** A viewer the Health rule names: canView, the deprecated marker, no values. */
function expectViewer(profile: Profile) {
  expect(profile.healthAccess).toEqual({ canView: true });
  expect(profile.health?.source).toBe("apple-healthkit");
  expect(profile.health?.metrics).toBeUndefined();
  expectNoValues(profile);
}

/** Anyone else: canView false and no `health` key at all. */
function expectNonViewer(profile: Profile) {
  expect(profile.healthAccess).toEqual({ canView: false });
  expect(Object.keys(profile)).not.toContain("health");
  expect(JSON.stringify(profile)).not.toContain("apple-healthkit");
  expectNoValues(profile);
}

async function accessRecords(): Promise<number> {
  const result = await pg.query<{ count: number }>(
    `select count(*)::int as count from audit_log where action like 'health.%'`,
  );
  return result.rows[0]?.count ?? 0;
}

describe("operator.memberProfile health (PRIV-1)", () => {
  const owner = actor(ids.owner, ["owner"]);
  const manager = actor(ids.manager, ["manager"]);
  const coachShared = actor(ids.coachShared, ["coach"]);
  const coachOther = actor(ids.coachOther, ["coach"]);
  const frontDesk = actor(ids.frontDesk, ["front-desk"]);

  it("a club-wide grant: owner, manager and the club's coaches may view; front desk may not", async () => {
    for (const viewer of [owner, manager, coachShared, coachOther]) {
      const profile = await profileFor(viewer, ids.adultClubGrant);
      expectViewer(profile);
      expect(profile.health?.scopes).toEqual(
        expect.arrayContaining(["activity", "heart"]),
      );
    }
    expectNonViewer(await profileFor(frontDesk, ids.adultClubGrant));
  }, 60_000);

  it("a share to one coach by name: that coach may view, nobody else", async () => {
    expectViewer(await profileFor(coachShared, ids.adultCoachGrant));
    for (const viewer of [owner, manager, coachOther, frontDesk]) {
      expectNonViewer(await profileFor(viewer, ids.adultCoachGrant));
    }
  }, 60_000);

  it("a junior's guardian-approved club grant: coaches only, never owners or managers", async () => {
    expectViewer(await profileFor(coachOther, ids.junior));
    for (const viewer of [owner, manager, frontDesk]) {
      expectNonViewer(await profileFor(viewer, ids.junior));
    }
  }, 60_000);

  it("a junior's grant without guardian approval reaches nobody", async () => {
    await pg.query(
      `update health_sharing_grants set approval_status = 'pending' where owner_person_id = $1`,
      [ids.junior],
    );
    try {
      for (const viewer of [owner, manager, coachShared, coachOther]) {
        expectNonViewer(await profileFor(viewer, ids.junior));
      }
    } finally {
      await pg.query(
        `update health_sharing_grants set approval_status = 'approved' where owner_person_id = $1`,
        [ids.junior],
      );
    }
  }, 60_000);

  it("a grant to another club does not count in this club, even for staff of both", async () => {
    // ids.owner owns this club and manages the other one.
    expectNonViewer(await profileFor(owner, ids.adultOtherClubGrant));
  }, 60_000);

  it("a minor viewer may never view another person's health", async () => {
    const teenCoach = { ...coachOther, ageBand: "teen" as const };
    expectNonViewer(await profileFor(teenCoach, ids.adultClubGrant));
  }, 60_000);

  it("reading memberProfile writes no Health access record for any role", async () => {
    const before = await accessRecords();
    for (const viewer of [owner, manager, coachShared, coachOther, frontDesk]) {
      for (const personId of [
        ids.adultClubGrant,
        ids.adultCoachGrant,
        ids.junior,
      ]) {
        await profileFor(viewer, personId);
      }
    }
    expect(await accessRecords()).toBe(before);
    // The recording read is still the one place values come from.
    const history = await caller(coachShared).operator.memberHealthProfile({
      personId: ids.adultCoachGrant,
    });
    expect(JSON.stringify(history)).toContain(String(STEPS));
    expect(await accessRecords()).toBe(before + 1);
  }, 60_000);

  it("roles without members:read cannot read the profile at all", async () => {
    for (const viewer of [
      actor(ids.accountant, ["accountant"]),
      actor(ids.guardian, ["guardian"]),
    ]) {
      await expect(profileFor(viewer, ids.junior)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    }
  }, 60_000);

  it("another club's staff cannot open this club's member", async () => {
    await expect(
      profileFor(
        actor(ids.otherClubOwner, ["owner"], ids.otherClub),
        ids.adultClubGrant,
      ),
    ).rejects.toThrow();
  }, 60_000);

  it("Ask Duna never receives the marker, even for a permitted viewer", async () => {
    await pg.query(
      `INSERT INTO ask_duna_controls (id, enabled) VALUES ('global', true) ON CONFLICT (id) DO NOTHING`,
    );
    const result = (await readAskDunaOperation(
      owner,
      "operator.memberProfile",
      {
        personId: ids.adultClubGrant,
      },
    )) as object;
    expect(Object.keys(result)).not.toContain("health");
    expectNoValues(result);
  }, 60_000);
});
