import { eq, and } from "drizzle-orm";
import { verifiedGuardianMembership } from "./messaging-guardian-access";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import * as schema from "../../db/src/schema";
const pg = new PGlite();
const database = drizzle(pg, { schema });
vi.mock("@duna/db", async () => ({
  ...(await vi.importActual<typeof import("@duna/db")>("@duna/db")),
  getTransactionalDatabase: () => database,
}));
vi.mock("./messaging-service", () => ({
  MessagingError: class extends Error {
    constructor(
      readonly code: string,
      message: string,
    ) {
      super(message);
    }
  },
  sendConversationMessage: vi.fn().mockResolvedValue({}),
}));
import { sendConversationMessage } from "./messaging-service";
import {
  createClubServiceConversation,
  loadClubContact,
} from "./club-service-contact";
const person = "10000000-0000-4000-8000-000000000001";
const guardian = "10000000-0000-4000-8000-000000000002";
const club = "20000000-0000-4000-8000-000000000001";
const otherClub = "20000000-0000-4000-8000-000000000002";
const actor = {
  personId: person,
  displayName: "Player",
  ageBand: "adult" as const,
  roles: ["player" as const],
  scopes: [],
  isDemo: false,
};
const request = () => ({
  actor,
  club: "alpha",
  body: "Can I book a lesson?",
  clientMessageId: crypto.randomUUID(),
  requestId: "test",
});
beforeAll(async () => {
  await pg.exec(
    `CREATE TABLE people (id uuid PRIMARY KEY, is_minor boolean DEFAULT false, status text DEFAULT 'active'); CREATE TABLE organizations (id uuid PRIMARY KEY, slug text, name text, system_key text); CREATE TABLE organization_themes (organization_id uuid, published_at timestamptz); CREATE TABLE club_websites (id uuid, organization_id uuid, published_revision_id uuid); CREATE TABLE guardianships (guardian_id uuid, minor_id uuid, verified boolean, review_status text);`,
  );
  for (const file of [
    "0000_outstanding_black_knight.sql",
    "0065_duna_messaging_platform.sql",
  ]) {
    const chunks = readFileSync(
      new URL(`../../db/drizzle/${file}`, import.meta.url),
      "utf8",
    ).split("--> statement-breakpoint");
    for (const statement of chunks) {
      const s = statement.trim();
      if (
        (s.startsWith("CREATE TYPE") && file.startsWith("0065")) ||
        /^CREATE TABLE "(audit_log|idempotency_records|messaging_blocks|messaging_conversation_participants|messaging_conversations|messaging_relationships)"/.test(
          s,
        ) ||
        /^CREATE UNIQUE INDEX "(messaging_context_conversation_unique|messaging_participant_principal_unique|messaging_relationship_source_key_unique|idempotency_procedure_key_unique)"/.test(
          s,
        )
      )
        await pg.exec(s);
    }
  }
  await pg.exec(
    `ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS conversation_id varchar(128);`,
  );
});
afterAll(() => pg.close());
beforeEach(async () => {
  vi.clearAllMocks();
  await pg.exec(`TRUNCATE people, organizations, organization_themes, club_websites, guardianships, messaging_blocks, messaging_conversation_participants, messaging_conversations, messaging_relationships, audit_log, idempotency_records;
INSERT INTO people (id) VALUES ('${person}'), ('${guardian}');
INSERT INTO organizations VALUES ('${club}', 'alpha', 'Alpha Club', NULL), ('${otherClub}', 'beta', 'Beta Club', NULL);
INSERT INTO organization_themes VALUES ('${club}', now()), ('${otherClub}', now());`);
});
describe("explicit club service contact", () => {
  it("preview names only the chosen published club and never sends", async () => {
    expect(await loadClubContact("alpha")).toMatchObject({
      id: club,
      name: "Alpha Club",
    });
    expect(sendConversationMessage).not.toHaveBeenCalled();
    expect(
      (await pg.query("select * from messaging_conversations")).rows,
    ).toHaveLength(0);
    await expect(loadClubContact("missing")).rejects.toThrow("not available");
  });
  it("keeps two clubs in separate conversations and rejects cross-club request replay", async () => {
    const first = request();
    const a = await createClubServiceConversation(first);
    const b = await createClubServiceConversation({
      ...request(),
      club: "beta",
    });
    expect(a.id).not.toBe(b.id);
    const rows = (
      await pg.query<{ conversation_id: string; organization_id: string }>(
        "select conversation_id, organization_id from messaging_conversation_participants where principal_type='organization' order by organization_id",
      )
    ).rows;
    expect(rows).toEqual([
      { conversation_id: a.id, organization_id: club },
      { conversation_id: b.id, organization_id: otherClub },
    ]);
    await expect(
      createClubServiceConversation({ ...first, club: "beta" }),
    ).rejects.toThrow("already used");
  });
  it("denies minors without an active verified adult guardian before any conversation exists", async () => {
    await pg.exec(
      `UPDATE people SET is_minor=true WHERE id='${person}'; INSERT INTO guardianships VALUES ('${guardian}', '${person}', false, 'pending');`,
    );
    await expect(createClubServiceConversation(request())).rejects.toThrow(
      "verified parent",
    );
    expect(
      (await pg.query("select * from messaging_conversations")).rows,
    ).toHaveLength(0);
    expect(sendConversationMessage).not.toHaveBeenCalled();
  });
  it("adds the verified guardian and retains canonical youth screening", async () => {
    await pg.exec(
      `UPDATE people SET is_minor=true WHERE id='${person}'; INSERT INTO guardianships VALUES ('${guardian}', '${person}', true, 'verified');`,
    );
    const result = await createClubServiceConversation(request());
    const guardians = (
      await pg.query(
        "select person_id, guardian_of_person_id from messaging_conversation_participants where role='guardian' and left_at is null",
      )
    ).rows;
    expect(guardians).toEqual([
      { person_id: guardian, guardian_of_person_id: person },
    ]);
    expect(
      (
        await pg.query(
          "select minor_present, safety_screening_required from messaging_conversations",
        )
      ).rows[0],
    ).toEqual({ minor_present: true, safety_screening_required: true });
    expect(sendConversationMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        asPrincipal: "user",
        message: expect.objectContaining({
          conversationId: result.id,
          kind: "text",
        }),
      }),
    );
  });
  it("serializes duplicate initiation and preserves canonical message idempotency keys", async () => {
    const input = request();
    const [a, b] = await Promise.all([
      createClubServiceConversation(input),
      createClubServiceConversation(input),
    ]);
    expect(a.id).toBe(b.id);
    expect(
      (await pg.query("select * from messaging_conversations")).rows,
    ).toHaveLength(1);
    expect(
      (await pg.query("select * from idempotency_records")).rows,
    ).toHaveLength(1);
    for (const [call] of vi.mocked(sendConversationMessage).mock.calls)
      expect(call.message).toMatchObject({
        conversationId: a.id,
        clientMessageId: input.clientMessageId,
      });
  });
  it("blocks club contact when a parent has blocked that club", async () => {
    await pg.exec(
      `UPDATE people SET is_minor=true WHERE id='${person}'; INSERT INTO guardianships VALUES ('${guardian}', '${person}', true, 'verified'); INSERT INTO messaging_blocks (blocker_person_id, blocked_principal_type, blocked_principal_id) VALUES ('${guardian}', 'organization', '${club}');`,
    );
    await expect(createClubServiceConversation(request())).rejects.toThrow(
      "blocked",
    );
    expect(sendConversationMessage).not.toHaveBeenCalled();
  });
  it("does not expose unpublished or system organizations", async () => {
    await pg.exec(
      `DELETE FROM organization_themes; UPDATE organizations SET system_key='platform' WHERE id='${otherClub}';`,
    );
    await expect(loadClubContact("alpha")).rejects.toThrow("not published");
    await expect(loadClubContact("beta")).rejects.toThrow("not available");
  });
  it("revocation immediately excludes guardian read/sync/push membership without reopening contact", async () => {
    await pg.exec(
      `UPDATE people SET is_minor=true WHERE id='${person}'; INSERT INTO guardianships VALUES ('${guardian}', '${person}', true, 'verified');`,
    );
    await createClubServiceConversation(request());
    const eligible = () =>
      database
        .select({ id: schema.messagingConversationParticipants.id })
        .from(schema.messagingConversationParticipants)
        .where(
          and(
            eq(schema.messagingConversationParticipants.personId, guardian),
            verifiedGuardianMembership(),
          ),
        );
    expect(await eligible()).toHaveLength(1);
    await pg.exec(
      `UPDATE guardianships SET verified=false, review_status='rejected';`,
    );
    expect(await eligible()).toHaveLength(0);
    expect(
      await database.query.messagingConversationParticipants.findFirst({
        where: and(
          eq(schema.messagingConversationParticipants.personId, guardian),
          verifiedGuardianMembership(),
        ),
      }),
    ).toBeUndefined();
  });
  it("failed-send receipt replay synchronizes changed guardians before canonical send", async () => {
    const newGuardian = "10000000-0000-4000-8000-000000000003";
    await pg.exec(
      `UPDATE people SET is_minor=true WHERE id='${person}'; INSERT INTO guardianships VALUES ('${guardian}', '${person}', true, 'verified'); INSERT INTO people (id) VALUES ('${newGuardian}');`,
    );
    const input = request();
    vi.mocked(sendConversationMessage).mockRejectedValueOnce(
      new Error("temporary failure"),
    );
    await expect(createClubServiceConversation(input)).rejects.toThrow(
      "temporary failure",
    );
    await pg.exec(
      `UPDATE guardianships SET verified=false; INSERT INTO guardianships VALUES ('${newGuardian}', '${person}', true, 'verified');`,
    );
    await createClubServiceConversation(input);
    expect(
      (
        await pg.query(
          "select person_id from messaging_conversation_participants where role='guardian' and left_at is null",
        )
      ).rows,
    ).toEqual([{ person_id: newGuardian }]);
  });
  it("retries after send failure using the durable conversation receipt", async () => {
    const input = request();
    vi.mocked(sendConversationMessage).mockRejectedValueOnce(
      new Error("temporary failure"),
    );
    await expect(createClubServiceConversation(input)).rejects.toThrow(
      "temporary failure",
    );
    const result = await createClubServiceConversation(input);
    expect(
      (await pg.query("select id from messaging_conversations")).rows,
    ).toEqual([{ id: result.id }]);
  });
});
