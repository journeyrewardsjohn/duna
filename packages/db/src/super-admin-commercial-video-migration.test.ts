import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  fileURLToPath(
    new URL("../drizzle/0099_thankful_morlocks.sql", import.meta.url),
  ),
  "utf8",
);

describe("Super Admin commercial and video allowance migration", () => {
  it("persists explicit plan access and bounded Stripe discount policy", () => {
    expect(migration).toContain(
      'ALTER TABLE "organizations" ADD COLUMN "admin_plan_override"',
    );
    expect(migration).toContain(
      'ALTER TABLE "organizations" ADD COLUMN "stripe_subscription_discount_bps"',
    );
    expect(migration).toContain(
      'CONSTRAINT "organization_admin_plan_override_valid"',
    );
    expect(migration).toContain(
      'CONSTRAINT "organization_subscription_discount_valid"',
    );
  });

  it("requires every additive video grant to have one valid target and positive value", () => {
    expect(migration).toContain('CREATE TABLE "video_allowance_grants"');
    expect(migration).toContain(
      'CONSTRAINT "video_allowance_grant_target_valid"',
    );
    expect(migration).toContain(
      'CONSTRAINT "video_allowance_grant_seconds_valid"',
    );
    expect(migration).toContain(
      'CREATE INDEX "video_allowance_grant_organization_idx"',
    );
    expect(migration).toContain(
      'CREATE INDEX "video_allowance_grant_person_idx"',
    );
  });
});
