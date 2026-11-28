/**
 * WAIVER-FIX: a guardian's waiver signature for a junior (signer role
 * "parent-or-guardian", 18 characters) and a teen's own acknowledgement
 * ("player-acknowledgement", 22) are stored through the real service path
 * and read back. Before migration 0123 `waiver_executions.signer_role` was
 * varchar(16) and both inserts failed.
 *
 * Also guards the whole defect class: every `column IN (...)` CHECK in the
 * schema must allow only values that fit the column's varchar length.
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
  testActor,
} from "./catalog-booking.test-support";
import { executeWaiver, loadWaiverRequirements } from "./waiver-service";

const { pg, db } = createCatalogTestDatabase();
state.db = db;

const ids = {
  club: "31000000-0000-4000-8000-000000000001",
  guardian: "32000000-0000-4000-8000-000000000001",
  junior: "32000000-0000-4000-8000-000000000002",
  waiver: "33000000-0000-4000-8000-000000000001",
  version: "33000000-0000-4000-8000-000000000002",
} as const;
const now = new Date("2026-11-28T12:00:00.000Z");

beforeAll(async () => {
  await applyAllMigrations(pg);
  await pg.exec(`
    INSERT INTO organizations (id, slug, name, currency, timezone)
      VALUES ('${ids.club}', 'waiver-club', 'Waiver Club', 'USD', 'UTC');
    INSERT INTO people (id, display_name, handle, birth_date, is_minor, age_band) VALUES
      ('${ids.guardian}', 'Pat Guardian', 'pat-guardian', '1980-02-02', false, 'adult'),
      ('${ids.junior}', 'Junie Junior', 'junie-junior', '2011-05-05', true, 'teen');
    INSERT INTO guardianships (guardian_id, minor_id, relationship, verified, review_status)
      VALUES ('${ids.guardian}', '${ids.junior}', 'parent', true, 'verified');
    INSERT INTO waiver_documents (id, organization_id, title, slug, status, current_version_id)
      VALUES ('${ids.waiver}', '${ids.club}', 'Club waiver', 'club-waiver', 'active', '${ids.version}');
    INSERT INTO waiver_versions (id, waiver_document_id, version, title, markdown, content_hash, requires_parent_for_minors, player_acknowledgement_minimum_age)
      VALUES ('${ids.version}', '${ids.waiver}', 1, 'Club waiver', 'Terms', 'hash-1', true, 13);
  `);
}, 120_000);

afterAll(async () => {
  await pg.close();
});

const signature = {
  organizationId: ids.club,
  waiverDocumentId: ids.waiver,
  subjectPersonId: ids.junior,
  acknowledgedSectionIds: [],
  displayedInline: true as const,
  scrolledToEnd: true as const,
  confirmed: true as const,
  now,
};

describe("waiver signer roles (WAIVER-FIX)", () => {
  it("stores a guardian's signature for a junior and a teen's acknowledgement, and reads both back", async () => {
    const guardian = await executeWaiver({
      ...signature,
      actor: testActor(ids.guardian, ids.club),
      typedLegalName: "Pat Guardian",
      requestId: crypto.randomUUID(),
    });
    expect(guardian.signerRole).toBe("parent-or-guardian");
    expect(guardian.remainingSignerRoles).toEqual(["player-acknowledgement"]);

    const teen = await executeWaiver({
      ...signature,
      actor: testActor(ids.junior, ids.club, "teen"),
      typedLegalName: "Junie Junior",
      requestId: crypto.randomUUID(),
    });
    expect(teen.signerRole).toBe("player-acknowledgement");
    expect(teen.remainingSignerRoles).toEqual([]);

    const stored = await pg.query<{
      signer_role: string;
      relationship: string | null;
    }>(
      `select signer_role, relationship from waiver_executions where subject_person_id = $1 order by occurred_at, signer_role`,
      [ids.junior],
    );
    expect(stored.rows.map((row) => row.signer_role).sort()).toEqual([
      "parent-or-guardian",
      "player-acknowledgement",
    ]);
    const [requirement] = await loadWaiverRequirements({
      actor: testActor(ids.guardian, ids.club),
      organizationId: ids.club,
      waiverDocumentIds: [ids.waiver],
      subjectPersonId: ids.junior,
      now,
    });
    expect(requirement?.completedSigners).toEqual(
      expect.arrayContaining(["parent-or-guardian", "player-acknowledgement"]),
    );
    expect(requirement?.complete).toBe(true);
  });

  it("every allowed value of every IN-list CHECK fits its varchar column", async () => {
    const [constraints, columns] = await Promise.all([
      pg.query<{ table: string; definition: string }>(
        `select conrelid::regclass::text as table, pg_get_constraintdef(oid) as definition
           from pg_constraint where contype = 'c' and conrelid <> 0`,
      ),
      pg.query<{ table_name: string; column_name: string; length: number }>(
        `select table_name, column_name, character_maximum_length as length
           from information_schema.columns
          where table_schema = 'public' and character_maximum_length is not null`,
      ),
    ]);
    const lengths = new Map(
      columns.rows.map((row) => [
        `${row.table_name}.${row.column_name}`,
        row.length,
      ]),
    );
    const checked: string[] = [];
    const tooLong: string[] = [];
    for (const { table, definition } of constraints.rows) {
      for (const match of definition.matchAll(
        /\(?(\w+)\)?(?:::text)?\s*=\s*ANY\s*\(\(?ARRAY\[([^\]]*)\]/g,
      )) {
        const key = `${table.replaceAll('"', "")}.${match[1]}`;
        const length = lengths.get(key);
        if (length === undefined) continue;
        checked.push(key);
        for (const [, value] of match[2]!.matchAll(/'([^']*)'/g)) {
          if (value!.length > length) {
            tooLong.push(`${key} varchar(${length}) '${value}'`);
          }
        }
      }
    }
    expect(checked).toContain("waiver_executions.signer_role");
    expect(checked.length).toBeGreaterThan(300);
    expect(tooLong).toEqual([]);
  });
});
