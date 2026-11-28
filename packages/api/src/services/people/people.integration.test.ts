/**
 * operator.people.* in in-memory Postgres with every real migration, through
 * the real router: permissions per role, tenancy, idempotency, audit rows,
 * import preview = import result, merge rules, membership changes, and
 * fixed query counts on list reads.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@duna/db", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getDatabase: () => state.db,
  getReadOnlyDatabase: () => state.db,
  getTransactionalDatabase: () => state.db,
}));

import type { PersonRole } from "@duna/core";
import {
  applyAllMigrations,
  createCatalogTestDatabase,
} from "../../catalog-booking.test-support";
import { scopesForRoles, type ApiActor } from "../../context";
import { createCaller } from "../../router";

const { pg, db } = createCatalogTestDatabase();
state.db = db;

const ids = {
  club: "21000000-0000-4000-8000-000000000001",
  otherClub: "21000000-0000-4000-8000-000000000002",
  owner: "22000000-0000-4000-8000-000000000001",
  manager: "22000000-0000-4000-8000-000000000002",
  coach: "22000000-0000-4000-8000-000000000003",
  coachOther: "22000000-0000-4000-8000-000000000004",
  frontDesk: "22000000-0000-4000-8000-000000000005",
  otherOwner: "22000000-0000-4000-8000-000000000006",
  maya: "23000000-0000-4000-8000-000000000001",
  mayaDuplicate: "23000000-0000-4000-8000-000000000002",
  signedIn: "23000000-0000-4000-8000-000000000003",
  sharedWithOtherClub: "23000000-0000-4000-8000-000000000004",
  junior: "23000000-0000-4000-8000-000000000005",
  parent: "23000000-0000-4000-8000-000000000006",
  stranger: "23000000-0000-4000-8000-000000000007",
  outsider: "23000000-0000-4000-8000-000000000008",
  venue: "24000000-0000-4000-8000-000000000001",
  session: "24000000-0000-4000-8000-000000000002",
  tierBilled: "25000000-0000-4000-8000-000000000001",
  tierFree: "25000000-0000-4000-8000-000000000002",
  tierPlus: "25000000-0000-4000-8000-000000000003",
  membershipBilled: "26000000-0000-4000-8000-000000000001",
  membershipFree: "26000000-0000-4000-8000-000000000002",
  waiver: "27000000-0000-4000-8000-000000000001",
  waiverV1: "27000000-0000-4000-8000-000000000002",
  waiverV2: "27000000-0000-4000-8000-000000000003",
} as const;

const now = new Date("2026-11-28T12:00:00.000Z");

function actor(
  personId: string,
  roles: readonly PersonRole[],
  organizationId: string = ids.club,
): ApiActor {
  return {
    personId,
    displayName: "Staff",
    roles,
    organizationId,
    scopes: scopesForRoles(roles),
    ageBand: "adult",
    isDemo: false,
  };
}

const owner = actor(ids.owner, ["owner"]);
const manager = actor(ids.manager, ["manager"]);
const coach = actor(ids.coach, ["coach"]);
const coachOther = actor(ids.coachOther, ["coach"]);
const frontDesk = actor(ids.frontDesk, ["front-desk"]);
const otherOwner = actor(ids.otherOwner, ["owner"], ids.otherClub);

function people(viewer: ApiActor) {
  return createCaller({ actor: viewer, requestId: crypto.randomUUID(), now })
    .operator.people;
}

async function count(sql: string, params: unknown[] = []): Promise<number> {
  const result = await pg.query<{ count: number }>(sql, params);
  return Number(result.rows[0]?.count ?? 0);
}

async function seed() {
  const person = (
    id: string,
    name: string,
    extra: Record<string, string | boolean | null> = {},
  ) => {
    const columns = ["id", "display_name", "handle", ...Object.keys(extra)];
    const values = [
      id,
      name,
      `h-${id.slice(0, 2)}${id.slice(-6)}`,
      ...Object.values(extra),
    ];
    return pg.query(
      `INSERT INTO people (${columns.join(", ")}) VALUES (${values.map((_, i) => `$${i + 1}`).join(", ")})`,
      values,
    );
  };
  await pg.exec(`
    INSERT INTO organizations (id, slug, name, currency, timezone) VALUES
      ('${ids.club}', 'people-club', 'People Club', 'USD', 'UTC'),
      ('${ids.otherClub}', 'people-other', 'Other Club', 'USD', 'UTC');
  `);
  for (const [id, name] of [
    [ids.owner, "Owner"],
    [ids.manager, "Manager"],
    [ids.coach, "Coach One"],
    [ids.coachOther, "Coach Two"],
    [ids.frontDesk, "Front Desk"],
    [ids.otherOwner, "Other Owner"],
  ] as const) {
    await person(id, name, { birth_date: "1985-01-01", age_band: "adult" });
  }
  await person(ids.maya, "Maya Chen", {
    email: "maya@example.test",
    birth_date: "1995-03-03",
    age_band: "adult",
  });
  await person(ids.mayaDuplicate, "Maya C.", {
    email: "maya.c@example.test",
    profile_claim_status: "unclaimed",
  });
  await person(ids.signedIn, "Signed In", {
    workos_user_id: "user_test_signed_in",
  });
  await person(ids.sharedWithOtherClub, "Shared Elsewhere", {
    profile_claim_status: "unclaimed",
  });
  await person(ids.junior, "Junie Park", {
    birth_date: "2012-05-05",
    is_minor: true,
    age_band: "teen",
  });
  await person(ids.parent, "Pat Park", {
    email: "pat@example.test",
    birth_date: "1980-02-02",
    age_band: "adult",
  });
  await person(ids.stranger, "Stranger", {
    email: "taken@example.test",
    phone_e164: "+14155550199",
  });
  await person(ids.outsider, "Outsider");
  await pg.exec(`
    INSERT INTO organization_memberships (organization_id, person_id, role) VALUES
      ('${ids.club}', '${ids.owner}', 'owner'),
      ('${ids.club}', '${ids.manager}', 'manager'),
      ('${ids.club}', '${ids.coach}', 'coach'),
      ('${ids.club}', '${ids.coachOther}', 'coach'),
      ('${ids.club}', '${ids.frontDesk}', 'front-desk'),
      ('${ids.otherClub}', '${ids.otherOwner}', 'owner');
    INSERT INTO organization_participants (organization_id, person_id, relationship, status) VALUES
      ${[
        ids.maya,
        ids.mayaDuplicate,
        ids.signedIn,
        ids.sharedWithOtherClub,
        ids.junior,
        ids.parent,
      ]
        .map((id) => `('${ids.club}', '${id}', 'player', 'active')`)
        .join(", ")},
      ('${ids.otherClub}', '${ids.sharedWithOtherClub}', 'player', 'active'),
      ('${ids.otherClub}', '${ids.outsider}', 'player', 'active');
    INSERT INTO guardianships (guardian_id, minor_id, relationship, verified, review_status)
      VALUES ('${ids.parent}', '${ids.junior}', 'parent', true, 'verified');
    INSERT INTO venues (id, organization_id, slug, name, timezone) VALUES
      ('${ids.venue}', '${ids.club}', 'main', 'Main courts', 'UTC');
    INSERT INTO sessions (id, venue_id, coach_person_id, title, slug, starts_at, ends_at, timezone, status, capacity) VALUES
      ('${ids.session}', '${ids.venue}', '${ids.coach}', 'Thursday clinic', 'thursday-clinic',
       '2026-12-03T17:00:00Z', '2026-12-03T18:00:00Z', 'UTC', 'published', 8);
    INSERT INTO registrations (session_id, person_id, status, eligibility_decision) VALUES
      ('${ids.session}', '${ids.maya}', 'confirmed', '{}'::jsonb),
      ('${ids.session}', '${ids.junior}', 'confirmed', '{}'::jsonb);
    INSERT INTO membership_tiers (id, organization_id, code, name, price_minor, currency, interval, stripe_price_id) VALUES
      ('${ids.tierBilled}', '${ids.club}', 'monthly', 'Monthly', 6000, 'USD', 'month', 'price_test_monthly'),
      ('${ids.tierFree}', '${ids.club}', 'honorary', 'Honorary', 0, 'USD', 'month', NULL),
      ('${ids.tierPlus}', '${ids.club}', 'plus', 'Plus', 9000, 'USD', 'month', 'price_test_plus');
    INSERT INTO memberships (id, person_id, tier_id, status, stripe_subscription_id, current_period_ends_at) VALUES
      ('${ids.membershipBilled}', '${ids.maya}', '${ids.tierBilled}', 'active', 'sub_test_maya', '2026-12-15T00:00:00Z'),
      ('${ids.membershipFree}', '${ids.mayaDuplicate}', '${ids.tierFree}', 'active', NULL, NULL);
    INSERT INTO waiver_documents (id, organization_id, title, slug, status, current_version_id) VALUES
      ('${ids.waiver}', '${ids.club}', 'Club waiver', 'club-waiver', 'active', '${ids.waiverV2}');
    INSERT INTO waiver_versions (id, waiver_document_id, version, title, markdown, content_hash) VALUES
      ('${ids.waiverV1}', '${ids.waiver}', 1, 'Club waiver', 'v1', 'hash-1'),
      ('${ids.waiverV2}', '${ids.waiver}', 2, 'Club waiver', 'v2', 'hash-2');
    INSERT INTO waiver_assignments (organization_id, waiver_document_id, scope, required) VALUES
      ('${ids.club}', '${ids.waiver}', 'all-members', true);
    INSERT INTO waiver_executions (organization_id, waiver_document_id, waiver_version_id, subject_person_id, signer_person_id, signer_role, typed_legal_name, content_hash, occurred_at, expires_at) VALUES
      ('${ids.club}', '${ids.waiver}', '${ids.waiverV1}', '${ids.maya}', '${ids.maya}', 'adult-player', 'Maya Chen', 'hash-1', '2026-06-01T00:00:00Z', '2027-06-01T00:00:00Z');
  `);
  await pg.query(
    `INSERT INTO consents (person_id, scope, granted, disclosure_text, disclosure_text_hash, occurred_at)
     VALUES ($1, 'transactional', true, 'Club messages', 'hash', $2), ($3, 'transactional', true, 'Club messages', 'hash', $2)`,
    [ids.maya, now.toISOString(), ids.parent],
  );
}

beforeAll(async () => {
  await applyAllMigrations(pg);
  await seed();
}, 120_000);

afterAll(async () => {
  await pg.close();
});

describe("tenancy and roles", () => {
  it("another club's ids are not found, never forbidden", async () => {
    await expect(
      people(owner).household({ personId: ids.outsider }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      people(otherOwner).notes.list({ personId: ids.maya }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("coaches read only the people they coach, and never money", async () => {
    const household = await people(coach).household({
      personId: ids.junior,
    });
    expect(household.payer).toBeUndefined();
    expect(household.guardians[0]?.pays).toBeUndefined();
    await expect(
      people(coachOther).household({ personId: ids.junior }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("writes need members:write (owners and managers)", async () => {
    for (const viewer of [coach, frontDesk]) {
      await expect(
        people(viewer).notes.add({
          personId: ids.maya,
          body: "Hello",
          idempotencyKey: crypto.randomUUID(),
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });
});

describe("notes", () => {
  it("adds, lists, edits and removes, audited, without per-note queries", async () => {
    const note = await people(manager).notes.add({
      personId: ids.maya,
      body: "Prefers mornings.",
      idempotencyKey: crypto.randomUUID(),
    });
    expect(note.author.personId).toBe(ids.manager);
    const spy = vi.spyOn(pg, "query");
    await people(frontDesk).notes.list({ personId: ids.maya });
    const oneNote = spy.mock.calls.length;
    spy.mockClear();
    for (let index = 0; index < 4; index += 1) {
      await people(owner).notes.add({
        personId: ids.maya,
        body: `Note ${index}`,
        idempotencyKey: crypto.randomUUID(),
      });
    }
    spy.mockClear();
    const listed = await people(frontDesk).notes.list({ personId: ids.maya });
    expect(listed.notes).toHaveLength(5);
    expect(spy.mock.calls.length).toBe(oneNote);
    spy.mockRestore();

    await expect(
      people(owner).notes.edit({
        noteId: note.id,
        body: "Not mine",
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const edited = await people(manager).notes.edit({
      noteId: note.id,
      body: "Prefers early mornings.",
      idempotencyKey: crypto.randomUUID(),
    });
    expect(edited.editedAt).toBeDefined();
    await people(owner).notes.remove({
      noteId: note.id,
      idempotencyKey: crypto.randomUUID(),
    });
    const after = await people(owner).notes.list({ personId: ids.maya });
    expect(after.notes.map((row) => row.id)).not.toContain(note.id);
    expect(
      await count(
        `select count(*)::int as count from audit_log where action like 'people.note.%'`,
      ),
    ).toBe(7);
    expect(
      await count(
        `select count(*)::int as count from person_notes where id = $1 and body = '' and removed_at is not null`,
        [note.id],
      ),
    ).toBe(1);
  });

  it("an idempotency key replays the first result", async () => {
    const key = crypto.randomUUID();
    const input = { personId: ids.parent, body: "Once", idempotencyKey: key };
    const first = await people(owner).notes.add(input);
    const second = await people(owner).notes.add(input);
    expect(second.id).toBe(first.id);
    expect(
      await count(
        `select count(*)::int as count from person_notes where person_id = $1`,
        [ids.parent],
      ),
    ).toBe(1);
  });
});

describe("tags", () => {
  it("bulk tags, counts, and refuses people outside the club", async () => {
    const result = await people(owner).tags.set({
      personIds: [ids.maya, ids.parent, ids.junior],
      add: ["League"],
      remove: [],
      idempotencyKey: crypto.randomUUID(),
    });
    expect(result).toEqual({ people: 3, added: 3, removed: 0 });
    const listed = await people(owner).tags.list({ personId: ids.maya });
    expect(listed.tags).toContainEqual({ tag: "League", count: 3 });
    expect(listed.personTags).toEqual(["League"]);
    await expect(
      people(owner).tags.set({
        personIds: [ids.maya, ids.outsider],
        add: ["X"],
        remove: [],
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      people(owner).tags.set({
        personIds: Array.from({ length: 201 }, () => crypto.randomUUID()),
        add: ["Too many"],
        remove: [],
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("household and guardians", () => {
  it("shows guardians, who pays, who is contacted and consent", async () => {
    const junior = await people(owner).household({ personId: ids.junior });
    expect(junior.guardians).toEqual([
      expect.objectContaining({
        personId: ids.parent,
        reviewStatus: "verified",
        contacted: true,
      }),
    ]);
    expect(junior.contact?.personId).toBe(ids.parent);
    const parent = await people(owner).household({ personId: ids.parent });
    expect(parent.juniors[0]?.consent.state).toBe("not-recorded");
  });

  it("links a guardian pending review and invites through the existing flow without sending", async () => {
    const linked = await people(manager).linkGuardian({
      juniorPersonId: ids.junior,
      guardianPersonId: ids.maya,
      relationship: "aunt",
      confirmed: true,
      idempotencyKey: crypto.randomUUID(),
    });
    expect(linked).toMatchObject({
      reviewStatus: "pending",
      consent: "not-recorded",
    });
    const invite = await people(manager).inviteGuardian({
      juniorPersonId: ids.junior,
      guardianName: "Robin Park",
      relationship: "parent",
      email: "robin@example.test",
      confirmed: true,
      idempotencyKey: crypto.randomUUID(),
    });
    expect(invite.sent).toBe(false);
    expect(invite.inviteUrl).toContain("/join/guardian/");
    expect(invite.draft.contactHint).not.toContain("robin@");
    expect(
      await count(
        `select count(*)::int as count from guardian_invitations where minor_id = $1 and status = 'pending'`,
        [ids.junior],
      ),
    ).toBe(1);
    expect(await count(`select count(*)::int as count from messages`)).toBe(0);
  });
});

describe("documents", () => {
  it("lists waivers with version, signer and status, and drafts a signature request", async () => {
    const maya = await people(owner).documents({ personId: ids.maya });
    expect(maya.documents[0]).toMatchObject({
      title: "Club waiver",
      status: "superseded",
      versionSigned: 1,
      currentVersion: 2,
      signedBy: { personId: ids.maya, role: "self" },
      required: true,
    });
    const junior = await people(owner).documents({ personId: ids.junior });
    expect(junior.documents[0]?.status).toBe("missing");
    const draft = await people(owner).requestSignature({
      personId: ids.maya,
      waiverDocumentId: ids.waiver,
      idempotencyKey: crypto.randomUUID(),
    });
    expect(draft).toMatchObject({ recipientPersonId: ids.maya, sent: false });
    expect(draft.signUrl).toContain(`subjectPersonId=${ids.maya}`);
    expect(
      await count(
        `select count(*)::int as count from messages where id = $1 and status = 'draft'`,
        [draft.draftId],
      ),
    ).toBe(1);
    // A junior's request goes to their verified guardian, never the junior.
    // The existing draft path accepts a guardian only once they are part of
    // the club's sessions or staff; until then it answers honestly.
    await expect(
      people(owner).requestSignature({
        personId: ids.junior,
        waiverDocumentId: ids.waiver,
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
});

describe("import", () => {
  const mapping = {
    name: "Name",
    email: "Email",
    phoneE164: "Mobile",
    birthDate: "Born",
    guardianName: "Guardian",
    guardianEmail: "Guardian email",
    tags: "Tags",
  };
  const rows: Record<string, string>[] = [
    { Name: "Ada Lane", Email: "ada@example.test", Tags: "League" },
    {
      Name: "Kit Lane",
      Born: "2014-01-01",
      Guardian: "Lee Lane",
      "Guardian email": "lee@example.test",
    },
    {
      Name: "Sky Lane",
      Born: "2015-01-01",
      Guardian: "Lee Lane",
      "Guardian email": "lee@example.test",
    },
    { Name: "Maya Chen", Email: "maya@example.test", Tags: "Masters" },
    { Name: "Pat Park", Email: "pat@example.test" },
    { Name: "Bad Email", Email: "not-an-email" },
    { Name: "Taken", Email: "taken@example.test" },
    { Name: "Kid Alone", Born: "2016-01-01" },
  ];

  it("previews without writing, then writes exactly the preview, once", async () => {
    const peopleBefore = await count(
      `select count(*)::int as count from people`,
    );
    const preview = await people(owner).importPreview({ rows, mapping });
    expect(preview.rows.map((row) => row.action)).toEqual([
      "create",
      "create",
      "create",
      "update",
      "duplicate",
      "problem",
      "problem",
      "problem",
    ]);
    expect(preview.counts).toMatchObject({
      create: 3,
      update: 1,
      duplicate: 1,
      problem: 3,
      juniors: 2,
      guardians: 1,
    });
    expect(await count(`select count(*)::int as count from people`)).toBe(
      peopleBefore,
    );
    const key = crypto.randomUUID();
    const result = await people(owner).import({
      previewId: preview.previewId,
      confirmed: true,
      idempotencyKey: key,
    });
    expect(result).toMatchObject({
      status: "completed",
      created: preview.counts.create,
      updated: preview.counts.update,
      skipped: preview.counts.duplicate + preview.counts.problem,
      guardiansLinked: 2,
      messagesSent: 0,
    });
    // Three people and one shared guardian.
    expect(await count(`select count(*)::int as count from people`)).toBe(
      peopleBefore + 4,
    );
    expect(
      await count(
        `select count(*)::int as count from guardianships g join people p on p.id = g.guardian_id
          where p.email = 'lee@example.test' and g.review_status = 'pending' and g.verified = false`,
      ),
    ).toBe(2);
    expect(
      await count(
        `select count(*)::int as count from guardian_consents gc join people p on p.id = gc.guardian_id where p.email = 'lee@example.test'`,
      ),
    ).toBe(0);
    expect(
      await count(
        `select count(*)::int as count from person_tags where person_id = $1 and tag = 'Masters'`,
        [ids.maya],
      ),
    ).toBe(1);
    expect(
      await count(
        `select count(*)::int as count from messages where status <> 'draft'`,
      ),
    ).toBe(0);
    const replay = await people(owner).import({
      previewId: preview.previewId,
      confirmed: true,
      idempotencyKey: key,
    });
    expect(replay).toEqual(result);
    const again = await people(owner).import({
      previewId: preview.previewId,
      confirmed: true,
      idempotencyKey: crypto.randomUUID(),
    });
    expect(again.created).toBe(result.created);
    expect(await count(`select count(*)::int as count from people`)).toBe(
      peopleBefore + 4,
    );
    expect(
      await count(
        `select count(*)::int as count from people_import_batches where id = $1 and plan is null`,
        [preview.previewId],
      ),
    ).toBe(1);
    expect(
      await count(
        `select count(*)::int as count from audit_log where entity_id = $1 and action like 'people.import.%'`,
        [preview.previewId],
      ),
    ).toBe(2);
  });

  it("refuses a stale preview", async () => {
    const preview = await people(owner).importPreview({
      rows: [{ Name: "Maya Chen", Email: "maya@example.test", Tags: "New" }],
      mapping,
    });
    await pg.query(`update people set updated_at = now() where id = $1`, [
      ids.maya,
    ]);
    await expect(
      people(owner).import({
        previewId: preview.previewId,
        confirmed: true,
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("resumes an interrupted import from where it stopped", async () => {
    const preview = await people(owner).importPreview({
      rows: [
        { Name: "Row One", Email: "one@example.test" },
        { Name: "Row Two", Email: "two@example.test" },
      ],
      mapping,
    });
    await pg.query(
      `update people_import_batches set status = 'importing', processed_rows = 1 where id = $1`,
      [preview.previewId],
    );
    await people(owner).import({
      previewId: preview.previewId,
      confirmed: true,
      idempotencyKey: crypto.randomUUID(),
    });
    expect(
      await count(
        `select count(*)::int as count from people where email in ('one@example.test', 'two@example.test')`,
      ),
    ).toBe(1);
  });

  it("is for owners and managers only, and another club cannot run this club's preview", async () => {
    await expect(
      people(coach).importPreview({ rows: [{ Name: "X" }], mapping }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const preview = await people(owner).importPreview({
      rows: [{ Name: "Other Club Try" }],
      mapping,
    });
    await expect(
      people(otherOwner).import({
        previewId: preview.previewId,
        confirmed: true,
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("merge", () => {
  it("refuses records with a sign-in account, another club, or the same plan twice", async () => {
    const signIn = await people(owner).mergePreview({
      keepId: ids.maya,
      mergeId: ids.signedIn,
    });
    expect(signIn.canMerge).toBe(false);
    expect(signIn.blockers.map((b) => b.code)).toContain("sign-in-account");
    const elsewhere = await people(owner).mergePreview({
      keepId: ids.maya,
      mergeId: ids.sharedWithOtherClub,
    });
    expect(elsewhere.blockers.map((b) => b.code)).toContain("other-club");
    const ageMismatch = await people(owner).mergePreview({
      keepId: ids.maya,
      mergeId: ids.junior,
    });
    expect(ageMismatch.blockers.map((b) => b.code)).toContain("age-mismatch");
    await expect(
      people(owner).merge({
        previewId: signIn.previewId,
        confirmed: true,
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      people(owner).mergePreview({ keepId: ids.maya, mergeId: ids.outsider }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("moves everything the club holds, keeps payment history, and is idempotent", async () => {
    await pg.query(
      `INSERT INTO orders (organization_id, buyer_person_id, status, currency, subtotal_minor, total_minor, idempotency_key)
       VALUES ($1, $2, 'paid', 'USD', 2500, 2500, 'merge-test-order')`,
      [ids.club, ids.mayaDuplicate],
    );
    await pg.query(
      `INSERT INTO person_tags (organization_id, person_id, tag) VALUES ($1, $2, 'League'), ($1, $2, 'Dup only')`,
      [ids.club, ids.mayaDuplicate],
    );
    const preview = await people(owner).mergePreview({
      keepId: ids.maya,
      mergeId: ids.mayaDuplicate,
    });
    expect(preview.canMerge).toBe(true);
    expect(preview.moves).toMatchObject({
      payments: 1,
      memberships: 1,
      tags: 1,
    });
    const key = crypto.randomUUID();
    const result = await people(owner).merge({
      previewId: preview.previewId,
      confirmed: true,
      idempotencyKey: key,
    });
    expect(result.moved).toEqual(preview.moves);
    expect(
      await count(
        `select count(*)::int as count from orders where buyer_person_id = $1`,
        [ids.maya],
      ),
    ).toBe(1);
    expect(
      await count(
        `select count(*)::int as count from memberships where id = $1 and person_id = $2`,
        [ids.membershipFree, ids.maya],
      ),
    ).toBe(1);
    expect(
      await count(
        `select count(*)::int as count from people where id = $1 and profile_claim_status = 'merged'`,
        [ids.mayaDuplicate],
      ),
    ).toBe(1);
    expect(
      await count(
        `select count(*)::int as count from audit_log where action = 'people.merged' and entity_id = $1`,
        [ids.maya],
      ),
    ).toBe(1);
    const replay = await people(owner).merge({
      previewId: preview.previewId,
      confirmed: true,
      idempotencyKey: key,
    });
    expect(replay).toEqual(result);
  });

  it("refuses a preview the records changed after", async () => {
    await pg.query(
      `INSERT INTO people (id, display_name, handle, profile_claim_status) VALUES ($1, 'Parent Copy', 'parent-copy', 'unclaimed')`,
      ["23000000-0000-4000-8000-000000000009"],
    );
    await pg.query(
      `INSERT INTO organization_participants (organization_id, person_id, relationship) VALUES ($1, $2, 'player')`,
      [ids.club, "23000000-0000-4000-8000-000000000009"],
    );
    const preview = await people(owner).mergePreview({
      keepId: ids.parent,
      mergeId: "23000000-0000-4000-8000-000000000009",
    });
    await pg.query(
      `INSERT INTO person_tags (organization_id, person_id, tag) VALUES ($1, $2, 'Late')`,
      [ids.club, "23000000-0000-4000-8000-000000000009"],
    );
    await expect(
      people(owner).merge({
        previewId: preview.previewId,
        confirmed: true,
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
});

describe("membership changes", () => {
  it("a plan billed through Duna Pay is unavailable to change, with the figures shown", async () => {
    const input = {
      personId: ids.maya,
      membershipId: ids.membershipBilled,
      toTierId: ids.tierPlus,
      timing: "at-renewal" as const,
    };
    const preview = await people(owner).planChangePreview(input);
    expect(preview).toMatchObject({
      status: "unavailable",
      kind: "upgrade",
      billedThroughDuna: true,
      chargeNowMinor: 0,
      creditNowMinor: 0,
      nextCharge: { amountMinor: 6000, at: "2026-12-15T00:00:00.000Z" },
    });
    const change = await people(owner).changePlan({
      ...input,
      previewId: preview.previewId,
      confirmed: true,
      idempotencyKey: crypto.randomUUID(),
    });
    expect(change.status).toBe("unavailable");
    expect(
      await count(
        `select count(*)::int as count from memberships where id = $1 and tier_id = $2`,
        [ids.membershipBilled, ids.tierBilled],
      ),
    ).toBe(1);
  });

  it("an unbilled plan changes now with no money moved; a stale preview is refused", async () => {
    const input = {
      personId: ids.maya,
      membershipId: ids.membershipFree,
      toTierId: ids.tierBilled,
      timing: "now" as const,
    };
    const preview = await people(owner).planChangePreview(input);
    expect(preview).toMatchObject({ status: "available", chargeNowMinor: 0 });
    await expect(
      people(owner).changePlan({
        ...input,
        previewId: "stale",
        confirmed: true,
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    const change = await people(owner).changePlan({
      ...input,
      previewId: preview.previewId,
      confirmed: true,
      idempotencyKey: crypto.randomUUID(),
    });
    expect(change).toMatchObject({ status: "changed", tierId: ids.tierBilled });
    await expect(
      people(coach).changePlan({
        ...input,
        previewId: preview.previewId,
        confirmed: true,
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("memberProfile groupState", () => {
  it("carries the shared group-state words for each session", async () => {
    const profile = await createCaller({
      actor: owner,
      requestId: crypto.randomUUID(),
      now,
    }).operator.memberProfile({ personId: ids.junior });
    const session = profile.sessions.find((row) => row.id === ids.session);
    expect(session?.groupState?.words).toBeTruthy();
  });
});
