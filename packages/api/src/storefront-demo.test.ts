import {
  demoOrganizationStorefront,
  demoStorefrontSlugs,
} from "@duna/core/demo/storefront";
import { demoTournamentCompetition } from "@duna/core/demo/tournament";
import { describe, expect, it } from "vitest";
import {
  publicOrganizationStorefrontSchema,
  tournamentCompetitionSnapshotSchema,
} from "./contracts";
import { createApiContext } from "./context";
import { createCaller } from "./router";

const now = new Date("2026-12-08T17:00:00.000Z");

describe("demo club storefronts (SITE-5)", () => {
  it("every demo storefront parses against the public contract", () => {
    for (const slug of demoStorefrontSlugs) {
      const storefront = demoOrganizationStorefront(slug, now);
      expect(storefront, slug).toBeDefined();
      publicOrganizationStorefrontSchema.parse(storefront);
    }
  });

  it("sessions are in the future and keep their group state honest", () => {
    const storefront = demoOrganizationStorefront("south-bay-volleyball", now)!;
    for (const item of storefront.catalog) {
      for (const occurrence of item.upcomingOccurrences) {
        expect(Date.parse(occurrence.startsAt)).toBeGreaterThan(now.getTime());
        expect(occurrence.spotsRemaining).toBe(
          Math.max(0, occurrence.capacity - occurrence.bookedCount),
        );
      }
    }
  });

  it("an unknown club is not found", () => {
    expect(demoOrganizationStorefront("no-such-club", now)).toBeUndefined();
  });

  it("public.organizationStorefront serves the fixture in demo mode", async () => {
    const previous = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      const caller = createCaller(
        await createApiContext({ requestId: "storefront-demo" }),
      );
      const storefront = await caller.public.organizationStorefront({
        slug: "south-bay-volleyball",
      });
      expect(storefront.name).toBe("South Bay Volleyball Club");
      await expect(
        caller.public.organizationStorefront({ slug: "no-such-club" }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    } finally {
      if (previous !== undefined) process.env.DATABASE_URL = previous;
    }
  });

  it("the demo tournament's draw parses and names only public teams", () => {
    const draw = demoTournamentCompetition("sunset-open-qualifier");
    tournamentCompetitionSnapshotSchema.parse(draw);
    expect(JSON.stringify(draw)).not.toContain("Junior Private");
    expect(demoTournamentCompetition("other")).toBeUndefined();
  });
});
