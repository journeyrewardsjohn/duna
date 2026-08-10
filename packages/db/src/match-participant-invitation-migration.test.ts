import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  fileURLToPath(new URL("../drizzle/0063_faulty_shard.sql", import.meta.url)),
  "utf8",
);

describe("match participant invitation migration", () => {
  it("stores a unique match claim token and both contact channels", () => {
    expect(migration).toContain('CREATE TABLE "match_participant_invitations"');
    expect(migration).toContain('"invite_token" varchar(96) NOT NULL');
    expect(migration).toContain('"invited_email" text');
    expect(migration).toContain('"invited_phone_e164" varchar(24)');
    expect(migration).toContain(
      'CONSTRAINT "match_participant_invitations_invite_token_unique" UNIQUE("invite_token")',
    );
  });

  it("requires a destination and constrains invitation lifecycle states", () => {
    expect(migration).toContain(
      '"match_participant_invitations"."invited_email" IS NOT NULL OR "match_participant_invitations"."invited_phone_e164" IS NOT NULL',
    );
    expect(migration).toContain(
      "IN ('pending', 'claimed', 'expired', 'cancelled')",
    );
    expect(migration).toContain(
      "IN ('not-configured', 'queued', 'sent', 'failed')",
    );
  });

  it("keeps one provisional invitation per match participant", () => {
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "match_participant_invitation_person_unique"',
    );
    expect(migration).toContain('("match_id","provisional_person_id")');
  });
});
