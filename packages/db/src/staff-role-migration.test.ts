import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const staffProfileMigration = readFileSync(
  fileURLToPath(
    new URL("../drizzle/0058_vengeful_lifeguard.sql", import.meta.url),
  ),
  "utf8",
);
const staffInvitationMigration = readFileSync(
  fileURLToPath(
    new URL("../drizzle/0059_petite_sally_floyd.sql", import.meta.url),
  ),
  "utf8",
);

describe("organization staff role migration", () => {
  it("preserves existing working roles before enforcing the new profile role", () => {
    expect(staffProfileMigration).toContain(
      "ADD COLUMN \"staff_role\" varchar(24) DEFAULT 'coach' NOT NULL",
    );
    expect(staffProfileMigration).toContain(
      'UPDATE "organization_staff_profiles" AS "staff"',
    );
    expect(staffProfileMigration).toContain(
      'SELECT DISTINCT ON ("organization_id", "person_id")',
    );
    expect(staffProfileMigration).toContain(
      "'coach', 'manager', 'front-desk', 'accountant'",
    );
  });

  it("allows an explicit not-set classification and director invitations", () => {
    expect(staffProfileMigration).toContain(
      "'not-set', '1099-contractor', 'w2-employee'",
    );
    expect(staffInvitationMigration).toContain(
      "'coach', 'director', 'manager', 'front-desk', 'accountant'",
    );
  });
});
