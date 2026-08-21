import { describe, expect, it } from "vitest";
import { resolveWorkOSMembershipRoleSlug } from "./organization-access-service";
import { membershipRoleForOrganizationStaffRole } from "./operator-service";

describe("organization access WorkOS role selection", () => {
  it("uses the WorkOS environment default instead of an internal Duna staff role", () => {
    expect(resolveWorkOSMembershipRoleSlug()).toBeUndefined();
  });

  it("preserves an explicitly configured provider role slug", () => {
    expect(resolveWorkOSMembershipRoleSlug("club-operator")).toBe(
      "club-operator",
    );
  });

  it("does not send an empty provider role slug", () => {
    expect(resolveWorkOSMembershipRoleSlug("   ")).toBeUndefined();
  });
});

describe("organization Director membership selection", () => {
  it("keeps Director as a staff role rather than creating another Owner", () => {
    expect(membershipRoleForOrganizationStaffRole("director")).toBe("manager");
  });

  it("keeps ordinary staff memberships aligned to their staff role", () => {
    expect(membershipRoleForOrganizationStaffRole("coach")).toBe("coach");
    expect(membershipRoleForOrganizationStaffRole("manager")).toBe("manager");
  });
});
