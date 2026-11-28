import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const directory = new URL("../drizzle/", import.meta.url);
const journal = JSON.parse(
  readFileSync(new URL("meta/_journal.json", directory), "utf8"),
) as {
  readonly entries: readonly { readonly idx: number; readonly tag: string }[];
};
const entry = journal.entries.find((candidate) =>
  candidate.tag.endsWith("_participation_engine"),
);
const migration = entry
  ? readFileSync(new URL(`${entry.tag}.sql`, directory), "utf8")
  : "";

async function apply(pg: PGlite, tag: string) {
  const sql = readFileSync(new URL(`${tag}.sql`, directory), "utf8");
  for (const statement of sql.split("--> statement-breakpoint")) {
    if (statement.trim()) await pg.exec(statement);
  }
}

describe("PART-2 participation migration", () => {
  it("is 0118 and journaled exactly once", () => {
    expect(entry?.idx).toBe(118);
    expect(
      journal.entries.filter((candidate) =>
        candidate.tag.endsWith("_participation_engine"),
      ),
    ).toHaveLength(1);
  });

  it("is additive: no drops, renames or column type changes", () => {
    expect(migration).not.toMatch(/\bDROP\b/i);
    expect(migration).not.toMatch(/\bRENAME\b/i);
    expect(migration).not.toMatch(/\bALTER COLUMN\b/i);
    expect(migration).not.toMatch(/^\s*DELETE\b/im);
    for (const table of [
      "organization_participation_defaults",
      "participation_decisions",
      "participation_waitlist_entries",
      "participation_invites",
      "participation_attendance",
      "participation_adjustments",
      "participation_notices",
      "participation_cancel_requests",
    ]) {
      expect(migration).toContain(`CREATE TABLE "${table}"`);
    }
  });
});

describe("PART-2 applied to a database with legacy rows", () => {
  const pg = new PGlite({ extensions: { btree_gist, pg_trgm, pgcrypto } });
  const org = "10000000-0000-4000-8000-0000000000a1";
  const person = "20000000-0000-4000-8000-0000000000a1";
  const item = "40000000-0000-4000-8000-0000000000a1";
  const variant = "40000000-0000-4000-8000-0000000000a2";
  const occurrence = "50000000-0000-4000-8000-0000000000a1";

  beforeAll(async () => {
    for (const { tag } of journal.entries.filter(
      (candidate) => candidate.idx < 118,
    )) {
      await apply(pg, tag);
    }
    await pg.exec(`
      INSERT INTO organizations (id, slug, name, currency, timezone)
        VALUES ('${org}', 'legacy-club', 'Legacy Club', 'USD', 'UTC');
      INSERT INTO people (id, display_name, handle) VALUES ('${person}', 'Host', 'host');
      INSERT INTO sessions (id, title, slug, starts_at, ends_at, timezone, status, capacity, minimum_capacity)
        VALUES ('60000000-0000-4000-8000-0000000000a1', 'Clinic', 'legacy-clinic',
          '2026-12-10T17:00:00Z', '2026-12-10T18:00:00Z', 'UTC', 'published', 8, 4),
               ('60000000-0000-4000-8000-0000000000a2', 'Open', 'legacy-open',
          '2026-12-10T17:00:00Z', '2026-12-10T18:00:00Z', 'UTC', 'published', 8, 1);
      INSERT INTO pickup_sessions (id, host_person_id, venue_label, title, starts_at, ends_at, capacity, smart_rules)
        VALUES ('70000000-0000-4000-8000-0000000000a1', '${person}', 'Beach', 'Pickup',
          '2026-12-12T16:00:00Z', '2026-12-12T18:00:00Z', 6,
          '{"waitlistEnabled": true, "allowLateCancellation": false, "minimumNoticeMinutes": 720, "autoCancelLowAttendance": true, "minimumAttendance": 4}'),
               ('70000000-0000-4000-8000-0000000000a2', '${person}', 'Beach', 'Casual',
          '2026-12-12T16:00:00Z', '2026-12-12T18:00:00Z', 6,
          '{"waitlistEnabled": true, "allowLateCancellation": false, "minimumNoticeMinutes": 60, "autoCancelLowAttendance": false, "minimumAttendance": 2}');
      INSERT INTO catalog_items (id, organization_id, type, subtype, slug, title, status, allow_credits, configuration)
        VALUES ('${item}', '${org}', 'service', 'group-lesson', 'clinic', 'Clinic', 'active', true,
          '{"capacity": 8, "participation": {"minParticipants": 3, "minimumPolicy": "cancel", "cutoffMinutesBeforeStart": 120, "settlementBasis": "cutoff", "creditTiers": []}}');
      INSERT INTO catalog_variants (id, organization_id, catalog_item_id, title)
        VALUES ('${variant}', '${org}', '${item}', 'Clinic');
      INSERT INTO catalog_session_occurrences (id, organization_id, catalog_item_id, starts_at, ends_at, timezone, local_date, local_time, capacity,
          participation_outcome, participation_decided_at, decided_headcount, status)
        VALUES ('${occurrence}', '${org}', '${item}', '2026-12-10T17:00:00Z', '2026-12-10T18:00:00Z', 'UTC', '2026-12-10', '17:00', 8,
          'cancel-under-minimum', '2026-12-10T15:00:00Z', 2, 'cancelled');
    `);
    await apply(pg, entry!.tag);
  }, 120_000);
  afterAll(() => pg.close());

  it("maps never-enforced minimums to rules that run, pending review (decision 7)", async () => {
    const sessions = await pg.query<{
      slug: string;
      participation: unknown;
      participation_review_state: string | null;
    }>(
      `select slug, participation, participation_review_state from sessions order by slug`,
    );
    expect(sessions.rows).toEqual([
      {
        slug: "legacy-clinic",
        participation: {
          version: 2,
          unit: "player",
          minParticipants: 4,
          minimumPolicy: "run",
          waitlist: true,
          tiers: [],
        },
        participation_review_state: "pending",
      },
      {
        slug: "legacy-open",
        participation: null,
        participation_review_state: null,
      },
    ]);
    const pickups = await pg.query<{
      title: string;
      participation: Record<string, unknown> | null;
    }>(`select title, participation from pickup_sessions order by title`);
    expect(pickups.rows[0]!.participation).toBeNull();
    expect(pickups.rows[1]!.participation).toMatchObject({
      minParticipants: 4,
      minimumPolicy: "run",
      lockMinutesBeforeStart: 720,
      waitlist: true,
    });
  });

  it("copies decided catalog occurrences into participation_decisions", async () => {
    const rows = await pg.query<Record<string, unknown>>(
      `select subject_type, outcome, cancel_reason, decided_group_size, lock_at from participation_decisions`,
    );
    expect(rows.rows).toEqual([
      {
        subject_type: "catalog-session-occurrence",
        outcome: "cancel-under-minimum",
        cancel_reason: "minimum-not-met",
        decided_group_size: 2,
        lock_at: new Date("2026-12-10T15:00:00Z"),
      },
    ]);
  });

  it("enforces one notice per person, kind and session (nulls not distinct)", async () => {
    const insert = `insert into participation_notices (organization_id, subject_type, subject_id, recipient_person_id, kind, scheduled_for)
      values ('${org}', 'catalog-session-occurrence', '${occurrence}', '${person}', 'staff-at-risk-digest', now())`;
    await pg.exec(insert);
    await expect(pg.exec(insert)).rejects.toThrow();
  });

  it("checks decision consistency", async () => {
    await expect(
      pg.exec(`insert into participation_decisions (organization_id, subject_type, subject_id, rule_snapshot, snapshot_at, lock_at, outcome)
        values ('${org}', 'session', gen_random_uuid(), '{}', now(), now(), 'minimum-met')`),
    ).rejects.toThrow();
    await expect(
      pg.exec(`insert into participation_decisions (organization_id, subject_type, subject_id, rule_snapshot, snapshot_at, lock_at, outcome, decided_at, decided_group_size)
        values ('${org}', 'session', gen_random_uuid(), '{}', now(), now(), 'cancelled-by-club', now(), 0)`),
    ).rejects.toThrow();
  });

  it("blocks a second active booking of the same session by the same person", async () => {
    const order = (id: string) =>
      `insert into orders (id, organization_id, buyer_person_id, status, currency, subtotal_minor, fee_total_minor, total_minor, idempotency_key)
        values ('${id}', '${org}', '${person}', 'paid', 'USD', 0, 0, 0, 'key-${id}')`;
    const line = (id: string, orderId: string) =>
      `insert into order_items (id, order_id, kind, reference_id, description, quantity, unit_amount_minor, total_amount_minor)
        values ('${id}', '${orderId}', 'catalog-service', '${variant}', 'Clinic', 1, 0, 0)`;
    const booking = (orderId: string, lineId: string, status = "ready") =>
      `insert into catalog_fulfillments (organization_id, order_id, order_item_id, catalog_item_id, catalog_variant_id, catalog_session_occurrence_id, person_id, kind, status)
        values ('${org}', '${orderId}', '${lineId}', '${item}', '${variant}', '${occurrence}', '${person}', 'appointment', '${status}')`;
    const ids = Array.from(
      { length: 6 },
      (_, index) => `80000000-0000-4000-8000-0000000000b${index}`,
    );
    await pg.exec(order(ids[0]!));
    await pg.exec(line(ids[1]!, ids[0]!));
    await pg.exec(booking(ids[0]!, ids[1]!));
    await pg.exec(order(ids[2]!));
    await pg.exec(line(ids[3]!, ids[2]!));
    await expect(pg.exec(booking(ids[2]!, ids[3]!))).rejects.toThrow();
    // A cancelled booking does not block booking again.
    await pg.exec(booking(ids[2]!, ids[3]!, "cancelled"));
  });
});
