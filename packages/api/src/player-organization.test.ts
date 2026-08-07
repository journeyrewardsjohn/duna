import { demoOrganization } from "@duna/core/demo";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDemoActor } from "./context";
import {
  buildPlayerOrganizationAccess,
  loadPlayerOrganizationAccess,
  validatePlayerOrganizationSelection,
} from "./player-organization";

afterEach(() => vi.unstubAllEnvs());

describe("player organization access", () => {
  it("keeps player and working roles visible in demo mode", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const access = await loadPlayerOrganizationAccess(createDemoActor());
    expect(access.activeOrganizationId).toBe(demoOrganization.id);
    expect(access.organizations[0]).toMatchObject({
      id: demoOrganization.id,
      isActive: true,
      roles: ["manager", "coach"],
      staff: { active: true, role: "director" },
    });
  });

  it("only permits the seeded organization without a connected database", async () => {
    vi.stubEnv("DATABASE_URL", "");
    await expect(
      validatePlayerOrganizationSelection({
        actor: createDemoActor(),
        organizationId: demoOrganization.id,
      }),
    ).resolves.toEqual({ organizationId: demoOrganization.id });
  });

  it("keeps multiple memberships switchable while joining player and staff identity", () => {
    const actor = {
      ...createDemoActor(["player", "manager"]),
      organizationId: "10000000-0000-4000-8000-000000000002",
    };
    const access = buildPlayerOrganizationAccess(actor, [
      {
        organizationId: "10000000-0000-4000-8000-000000000001",
        organizationSlug: "north-shore",
        organizationName: "North Shore Volleyball",
        membershipRole: "coach",
        staffActive: true,
        staffRole: "coach",
      },
      {
        organizationId: "10000000-0000-4000-8000-000000000002",
        organizationSlug: "south-bay",
        organizationName: "South Bay Volleyball Club",
        membershipRole: "manager",
        staffActive: null,
        staffRole: null,
      },
    ]);

    expect(access.organizations).toHaveLength(2);
    expect(access.organizations[0]).toMatchObject({
      name: "North Shore Volleyball",
      isActive: false,
      staff: { active: true, role: "coach" },
    });
    expect(access.organizations[1]).toMatchObject({
      name: "South Bay Volleyball Club",
      isActive: true,
      canManage: true,
      canSelfEnroll: true,
    });
  });
});
