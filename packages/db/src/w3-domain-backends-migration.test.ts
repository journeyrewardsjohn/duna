import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const directory = new URL("../drizzle/", import.meta.url);
const files = readdirSync(directory).filter((name) =>
  name.endsWith("_w3_domain_backends.sql"),
);
const migration = files[0]
  ? readFileSync(new URL(files[0], directory), "utf8")
  : "";

/** Every table W3-0 adds, by domain (docs/plan/w3-contracts.md). */
const W3_TABLES = [
  // setup (B1)
  "organization_profiles",
  "setup_runs",
  "setup_run_pages",
  "setup_proposals",
  // pay (B2)
  "organization_pay_accounts",
  "pay_obligations",
  "pay_release_tranches",
  "pay_delivery_events",
  "pay_holds",
  "pay_reserves",
  "pay_dispute_cases",
  "pay_obligation_refunds",
  "pay_recoveries",
  "pay_fee_quotes",
  // premium (fees)
  "premium_subscriptions",
  "premium_subscription_events",
  // team-availability (B3a)
  "staff_availability_schedules",
  "staff_availability_windows",
  "staff_blackouts",
  "staff_time_off",
  "staff_coverage_requests",
  "staff_coverage_offers",
  // team-pay (B3b)
  "staff_compensation",
  "staff_pay_periods",
  "staff_pay_runs",
  "staff_pay_run_lines",
  "staff_pay_exports",
  // team-payouts (B3c)
  "staff_connected_accounts",
  "staff_contractor_payouts",
  // training-programs (B4)
  "training_program_coaches",
  "training_program_weekly_slots",
  "training_program_date_exceptions",
  "training_program_weeks",
  "training_event_coaches",
  // training-drills (B5, B6a)
  "training_drill_review_checks",
  "training_drill_listings",
  "training_drill_purchases",
  "training_drill_scenes",
  // training-scene-ai (B6d)
  "training_scene_ai_runs",
  // concierge (B7)
  "person_channel_endpoints",
  "person_channel_preferences",
  "concierge_send_proposals",
  "concierge_send_recipients",
  "concierge_deliveries",
  // website-workspace (B8a)
  "website_pages",
  "website_changes",
  "website_change_pages",
  "website_change_jobs",
  "website_change_checks",
  "website_change_messages",
  "website_publish_events",
  // website-templates (B8b)
  "website_templates",
  "website_site_starts",
  // facility (B9)
  "facility_listings",
  "facility_access_rules",
  "facility_access_requests",
  "court_play_stops",
  // search (B10)
  "search_documents",
  // conditions (B11)
  "conditions_hourly",
  "conditions_sun_times",
  // households (FAM)
  "households",
  "household_members",
  "household_invitations",
  "household_consents",
  // legal (L3)
  "legal_document_versions",
] as const;

describe("W3-0 migration 0116 (static)", () => {
  it("exists exactly once and is numbered 0116", () => {
    expect(files).toEqual(["0116_w3_domain_backends.sql"]);
  });

  it("creates every W3 table and nothing else", () => {
    const created = [...migration.matchAll(/CREATE TABLE "([a-z_]+)"/g)].map(
      (match) => match[1],
    );
    expect(new Set(created)).toEqual(new Set(W3_TABLES));
    expect(created).toHaveLength(W3_TABLES.length);
  });

  it("is additive: no table, column or type drops, renames or type changes", () => {
    expect(migration).not.toMatch(/\bDROP (TABLE|COLUMN|TYPE|INDEX)\b/i);
    expect(migration).not.toMatch(/\bRENAME\b/i);
    expect(migration).not.toMatch(/\bALTER COLUMN\b/i);
    expect(migration).not.toMatch(/^\s*(DELETE|INSERT|TRUNCATE)\b/im);
  });

  it("drops exactly one constraint, to widen the legal document key check", () => {
    const drops = [...migration.matchAll(/DROP CONSTRAINT "([a-z_]+)"/g)].map(
      (match) => match[1],
    );
    expect(drops).toEqual(["legal_acceptance_document_valid"]);
    expect(migration).toContain('"legal_acceptance_document_key_format"');
  });

  it("only appends enum values (never reorders or recreates a type)", () => {
    const typeChanges = [...migration.matchAll(/ALTER TYPE [^\n]+/g)].map(
      (match) => match[0],
    );
    expect(typeChanges).toEqual([
      `ALTER TYPE "public"."match_status" ADD VALUE 'not-finished' BEFORE 'pending-verification';--> statement-breakpoint`,
    ]);
    for (const statement of typeChanges) expect(statement).toMatch(/ADD VALUE/);
  });

  it("rewrites rows only to place Duna-curated drills in the Duna scope", () => {
    const updates = [...migration.matchAll(/^\s*UPDATE [^\n]+/gim)].map(
      (match) => match[0].trim(),
    );
    expect(updates).toEqual([
      `UPDATE "training_drills" SET "scope" = 'duna' WHERE "organization_id" IS NULL;`,
    ]);
  });
});

describe("W3-0 migration 0116 (applied to an empty database)", () => {
  const pg = new PGlite({ extensions: { btree_gist, pg_trgm, pgcrypto } });
  const org = "d0ff0000-0000-4000-8000-000000000001";
  const person = "d0ff0000-0000-4000-8000-000000000002";
  const child = "d0ff0000-0000-4000-8000-000000000003";

  beforeAll(async () => {
    const journal = JSON.parse(
      readFileSync(new URL("meta/_journal.json", directory), "utf8"),
    ) as { readonly entries: readonly { readonly tag: string }[] };
    for (const entry of journal.entries) {
      const sql = readFileSync(new URL(`${entry.tag}.sql`, directory), "utf8");
      for (const statement of sql.split("--> statement-breakpoint")) {
        if (statement.trim()) await pg.exec(statement);
      }
    }
    await pg.exec(`
      INSERT INTO organizations (id, slug, name) VALUES ('${org}', 'w3-test', 'W3 Test Club');
      INSERT INTO people (id, display_name, handle) VALUES
        ('${person}', 'Guardian', 'w3-guardian'),
        ('${child}', 'Child', 'w3-child');
    `);
  }, 120_000);

  afterAll(async () => {
    await pg.close();
  });

  it("applies cleanly after every earlier migration", async () => {
    const result = await pg.query<{ name: string }>(
      `SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const names = new Set(result.rows.map((row) => row.name));
    for (const table of W3_TABLES) expect(names.has(table)).toBe(true);
  });

  it("accepts the new enum values once committed", async () => {
    const result = await pg.query<{ value: string }>(
      `SELECT unnest(enum_range(NULL::match_status))::text AS value`,
    );
    expect(result.rows.map((row) => row.value)).toContain("not-finished");
  });

  it("records any legal document key, and a guardian accepting for a child", async () => {
    await pg.exec(`
      INSERT INTO legal_acceptances (person_id, document_key, document_version, accepted_as, on_behalf_of_person_id, surface)
      VALUES ('${person}', 'guardians-and-youth', '1.0-draft', 'guardian', '${child}', 'guardian-flow');
      INSERT INTO legal_acceptances (person_id, document_key, document_version)
      VALUES ('${person}', 'consumer-terms', '2026-08-04');
    `);
    await expect(
      pg.exec(`
        INSERT INTO legal_acceptances (person_id, document_key, document_version, accepted_as)
        VALUES ('${person}', 'terms', '1.0', 'guardian');
      `),
    ).rejects.toThrow(/legal_acceptance_on_behalf_shape/);
    await expect(
      pg.exec(`
        INSERT INTO legal_acceptances (person_id, document_key, document_version)
        VALUES ('${person}', 'Not A Key!', '1.0');
      `),
    ).rejects.toThrow(/legal_acceptance_document_key_format/);
  });

  it("keeps money consistent on obligations and fee quotes", async () => {
    await pg.exec(`
      INSERT INTO orders (id, organization_id, buyer_person_id, status, currency, subtotal_minor, total_minor, idempotency_key)
      VALUES ('d0ff0000-0000-4000-8000-000000000010', '${org}', '${person}', 'paid', 'USD', 10000, 10300, 'w3-test-order');
    `);
    await pg.exec(`
      INSERT INTO pay_obligations (organization_id, order_id, product_kind, delivery_rule, gross_minor, application_fee_minor, tax_minor, proceeds_minor)
      VALUES ('${org}', 'd0ff0000-0000-4000-8000-000000000010', 'service/court-rental', 'scheduled-end', 10300, 650, 0, 9650);
    `);
    await expect(
      pg.exec(`
        INSERT INTO pay_obligations (organization_id, order_id, product_kind, delivery_rule, gross_minor, application_fee_minor, tax_minor, proceeds_minor)
        VALUES ('${org}', 'd0ff0000-0000-4000-8000-000000000010', 'service/court-rental', 'scheduled-end', 10300, 650, 0, 10300);
      `),
    ).rejects.toThrow(/pay_obligation_amounts_valid/);
    await expect(
      pg.exec(`
        INSERT INTO pay_fee_quotes (organization_id, surface, subtotal_minor, service_fee_minor, total_minor, fee_rule_version)
        VALUES ('${org}', 'web-checkout', 10000, 300, 10000, '2026-11');
      `),
    ).rejects.toThrow(/pay_fee_quote_amounts_valid/);
  });

  it("caps a triggered reserve at 180 days", async () => {
    await expect(
      pg.exec(`
        INSERT INTO pay_reserves (organization_id, kind, trigger, status, percent_bps, starts_at, ends_at, review_at, notice_reason, notice_sent_at)
        VALUES ('${org}', 'rolling', 'refund-rate', 'active', 1000, '2026-12-01', '2027-07-01', '2026-12-31', 'Refund rate above 10%', '2026-12-01');
      `),
    ).rejects.toThrow(/pay_reserve_duration_valid/);
  });

  it("makes delivery events and consent records append-only", async () => {
    const obligation = await pg.query<{ id: string }>(
      `SELECT id FROM pay_obligations LIMIT 1`,
    );
    const obligationId = obligation.rows[0]?.id;
    await pg.exec(`
      INSERT INTO pay_delivery_events (organization_id, obligation_id, kind, occurred_at, source_type, idempotency_key)
      VALUES ('${org}', '${obligationId}', 'booking-ended', now(), 'court_booking', 'booking-ended:1');
    `);
    await expect(
      pg.exec(`UPDATE pay_delivery_events SET kind = 'session-ended'`),
    ).rejects.toThrow(/append-only/);
    await pg.exec(`
      INSERT INTO household_consents (guardian_person_id, child_person_id, kind, decision, method, disclosure_version, disclosure_text_hash)
      VALUES ('${person}', '${child}', 'account', 'granted', 'checkbox-attestation', '1.0', '${"a".repeat(64)}');
    `);
    await expect(pg.exec(`DELETE FROM household_consents`)).rejects.toThrow(
      /append-only/,
    );
  });

  it("requires a guardian account holder for a child profile", async () => {
    await expect(
      pg.exec(`
        INSERT INTO households (id, name, created_by_person_id) VALUES ('d0ff0000-0000-4000-8000-000000000020', 'Home', '${person}');
        INSERT INTO household_members (household_id, person_id, role) VALUES ('d0ff0000-0000-4000-8000-000000000020', '${child}', 'child');
      `),
    ).rejects.toThrow(/household_member_child_managed/);
  });
});
