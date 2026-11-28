import { describe, expect, it } from "vitest";
import type { HealthMetric } from "../../contracts";
import { deriveMinorCollectionConsent } from "./consent";
import {
  HEALTH_ACTIONS,
  HEALTH_ADULT_GRANT_MAX_DAYS,
  HEALTH_MINOR_GRANT_MAX_DAYS,
  HEALTH_MINOR_METRICS,
  HEALTH_POLICY_VERSION,
  HEALTH_RETENTION_MONTHS,
  checkHealthGrantRequest,
  decideGuardianApproval,
  decideHealthAction,
  filterSamplesForBand,
  healthAgeBand,
  healthGrantIsEffective,
  healthRetentionCutoffs,
  isHealthSampleExpired,
  normalizeStorefront,
  organizationViewerRolesFor,
  selectExpiredHealthSamples,
  subtractMonths,
  type HealthAction,
  type HealthAgeBand,
  type HealthPermit,
  type HealthRefusalReason,
} from "./policy";

const BANDS: readonly HealthAgeBand[] = [
  "unknown",
  "under-13",
  "teen",
  "adult",
];
const STOREFRONTS = {
  us: "USA",
  "not-us": "CAN",
  missing: undefined,
} as const;

/**
 * Independent statement of the owner's policy (27 Nov 2026), written as a
 * table rather than by calling the implementation.
 */
function expected(input: {
  readonly band: HealthAgeBand;
  readonly action: HealthAction;
  readonly flag: boolean;
  readonly storefront: keyof typeof STOREFRONTS;
  readonly teenOptedIn: boolean;
  readonly guardianApproved: boolean;
}): true | HealthRefusalReason {
  if (["revoke-grant", "withdraw", "disconnect"].includes(input.action)) {
    return true;
  }
  if (input.band === "unknown") return "birth-date-required";
  if (input.band === "under-13") return "under-13";
  if (input.band === "teen" && !input.flag) return "juniors-paused";
  if (input.action === "view-own" || input.action === "opt-in") return true;
  // sync, check-in, create-grant
  if (input.storefront === "missing") return "region-unknown";
  if (input.storefront === "not-us") return "region-not-supported";
  if (input.band === "adult") return true;
  if (input.action === "check-in") return "not-offered-to-minors";
  if (!input.teenOptedIn) return "teen-opt-in-required";
  if (!input.guardianApproved) return "guardian-approval-required";
  return true;
}

describe("Health policy matrix (band x action x flag x storefront x consent)", () => {
  const cases: Parameters<typeof expected>[0][] = [];
  for (const band of BANDS)
    for (const action of HEALTH_ACTIONS)
      for (const flag of [true, false])
        for (const storefront of Object.keys(
          STOREFRONTS,
        ) as (keyof typeof STOREFRONTS)[])
          for (const teenOptedIn of [true, false])
            for (const guardianApproved of [true, false])
              cases.push({
                band,
                action,
                flag,
                storefront,
                teenOptedIn,
                guardianApproved,
              });

  it("covers every combination", () => {
    expect(cases).toHaveLength(4 * 8 * 2 * 3 * 2 * 2);
  });

  it.each(cases)(
    "$band $action flag=$flag storefront=$storefront teen=$teenOptedIn guardian=$guardianApproved",
    (input) => {
      const decision = decideHealthAction({
        action: input.action,
        band: input.band,
        juniorsEnabled: input.flag,
        storefront: STOREFRONTS[input.storefront],
        teenOptedIn: input.teenOptedIn,
        guardianApproved: input.guardianApproved,
      });
      const want = expected(input);
      if (want === true) {
        expect(decision.allowed).toBe(true);
      } else {
        expect(decision).toMatchObject({ allowed: false, reason: want });
        if (!decision.allowed)
          expect(decision.message.length).toBeGreaterThan(20);
      }
    },
  );

  it("tells an under-13 player plainly that Health is not available yet", () => {
    const decision = decideHealthAction({
      action: "sync",
      band: "under-13",
      juniorsEnabled: true,
      storefront: "USA",
      teenOptedIn: true,
      guardianApproved: true,
    });
    expect(decision).toMatchObject({
      allowed: false,
      reason: "under-13",
      message: "Duna Health is not available for players under 13 yet.",
    });
  });
});

describe("Health permits", () => {
  const permitFor = (band: HealthAgeBand) =>
    decideHealthAction({
      action: "view-own",
      band,
      juniorsEnabled: true,
      teenOptedIn: true,
      guardianApproved: true,
    }) as HealthPermit;

  it("limits minors to heart rate, workouts, active energy and exercise minutes", () => {
    const teen = permitFor("teen");
    expect([...teen.allowedMetrics].sort()).toEqual(
      ["active-energy", "exercise-minutes", "heart-rate", "workout"].sort(),
    );
    expect([...teen.allowedCategories].sort()).toEqual(["activity", "heart"]);
    expect(teen.allowedAudiences).toEqual(["coach", "organization"]);
    expect(teen.maxGrantDays).toBe(HEALTH_MINOR_GRANT_MAX_DAYS);
    expect(teen.grantRequiresGuardianApproval).toBe(true);
  });

  it("keeps adults on today's rules", () => {
    const adult = permitFor("adult");
    expect(adult.allowedMetrics).toHaveLength(19);
    expect(adult.allowedCategories).toHaveLength(4);
    expect(adult.allowedAudiences).toEqual(["player", "coach", "organization"]);
    expect(adult.maxGrantDays).toBe(HEALTH_ADULT_GRANT_MAX_DAYS);
    expect(adult.grantRequiresGuardianApproval).toBe(false);
  });

  it("drops every metric outside a minor's allowlist and keeps the rest", () => {
    const metrics: HealthMetric[] = [
      "heart-rate",
      "resting-heart-rate",
      "heart-rate-variability",
      "sleep",
      "workout",
      "active-energy",
      "steps",
      "exercise-minutes",
      "weight",
      "oxygen-saturation",
    ];
    const { kept, dropped } = filterSamplesForBand(
      metrics.map((metric) => ({ metric })),
      HEALTH_MINOR_METRICS,
    );
    expect(kept.map((sample) => sample.metric)).toEqual([
      "heart-rate",
      "workout",
      "active-energy",
      "exercise-minutes",
    ]);
    expect(dropped).toBe(6);
    expect(
      filterSamplesForBand(
        metrics.map((metric) => ({ metric })),
        permitFor("adult").allowedMetrics,
      ).dropped,
    ).toBe(0);
  });
});

describe("Health age bands are recomputed from the birth date", () => {
  const at = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

  it("crosses 13 and 18 exactly on the birthday", () => {
    expect(healthAgeBand("2013-11-28", at("2026-11-27"))).toBe("under-13");
    expect(healthAgeBand("2013-11-27", at("2026-11-27"))).toBe("teen");
    expect(healthAgeBand("2008-11-28", at("2026-11-27"))).toBe("teen");
    expect(healthAgeBand("2008-11-27", at("2026-11-27"))).toBe("adult");
  });

  it("does not keep a stale band: the same person changes band over time", () => {
    const birthDate = "2013-06-15";
    expect(healthAgeBand(birthDate, at("2026-06-14"))).toBe("under-13");
    expect(healthAgeBand(birthDate, at("2026-06-15"))).toBe("teen");
    expect(healthAgeBand(birthDate, at("2031-06-14"))).toBe("teen");
    expect(healthAgeBand(birthDate, at("2031-06-15"))).toBe("adult");
  });

  it("treats a 29 February birthday as reached on 1 March", () => {
    expect(healthAgeBand("2008-02-29", at("2026-02-28"))).toBe("teen");
    expect(healthAgeBand("2008-02-29", at("2026-03-01"))).toBe("adult");
  });

  it("returns unknown without a valid birth date", () => {
    expect(healthAgeBand(undefined, at("2026-11-27"))).toBe("unknown");
    expect(healthAgeBand(null, at("2026-11-27"))).toBe("unknown");
    expect(healthAgeBand("2010-02-30", at("2026-11-27"))).toBe("unknown");
    expect(healthAgeBand("2030-01-01", at("2026-11-27"))).toBe("unknown");
  });
});

describe("Storefront claims", () => {
  it("normalizes alpha-2 and case, and rejects junk", () => {
    expect(normalizeStorefront(" usa ")).toBe("USA");
    expect(normalizeStorefront("US")).toBe("USA");
    expect(normalizeStorefront("GBR")).toBe("GBR");
    expect(normalizeStorefront("")).toBeUndefined();
    expect(normalizeStorefront("U$A")).toBeUndefined();
    expect(normalizeStorefront(null)).toBeUndefined();
  });
});

describe("Guardian approval", () => {
  const base = {
    subjectBand: "teen" as HealthAgeBand,
    guardianBand: "adult" as HealthAgeBand,
    guardianshipStatus: "verified",
    juniorsEnabled: true,
  };

  it("needs a verified link, an adult guardian, a teen and the switch on", () => {
    expect(decideGuardianApproval(base)).toEqual({ allowed: true });
    expect(
      decideGuardianApproval({ ...base, guardianshipStatus: "pending" }),
    ).toMatchObject({ reason: "not-a-linked-guardian" });
    expect(
      decideGuardianApproval({ ...base, guardianshipStatus: undefined }),
    ).toMatchObject({ reason: "not-a-linked-guardian" });
    expect(
      decideGuardianApproval({ ...base, guardianBand: "teen" }),
    ).toMatchObject({ reason: "guardian-must-be-adult" });
    expect(
      decideGuardianApproval({ ...base, guardianBand: "unknown" }),
    ).toMatchObject({ reason: "guardian-must-be-adult" });
    expect(
      decideGuardianApproval({ ...base, subjectBand: "under-13" }),
    ).toMatchObject({ reason: "subject-not-eligible" });
    expect(
      decideGuardianApproval({ ...base, subjectBand: "adult" }),
    ).toMatchObject({ reason: "subject-not-eligible" });
    expect(
      decideGuardianApproval({ ...base, juniorsEnabled: false }),
    ).toMatchObject({ reason: "juniors-paused" });
  });
});

describe("Minor collection consent", () => {
  const guardian = "11111111-1111-4111-8111-111111111111";
  const other = "22222222-2222-4222-8222-222222222222";
  const t = (minute: number) => new Date(Date.UTC(2026, 10, 27, 12, minute));
  const record = (
    actorRole: "subject" | "guardian",
    decision: "granted" | "denied" | "withdrawn",
    minute: number,
    actorPersonId: string | null = actorRole === "guardian" ? guardian : null,
    policyVersion = HEALTH_POLICY_VERSION,
  ) => ({
    actorRole,
    actorPersonId,
    kind: "collection" as const,
    decision,
    policyVersion,
    occurredAt: t(minute),
  });

  it("needs both the teen's opt-in and a linked adult guardian's approval", () => {
    const both = deriveMinorCollectionConsent(
      [record("subject", "granted", 1), record("guardian", "granted", 2)],
      { linkedAdultGuardianIds: [guardian] },
    );
    expect(both).toMatchObject({
      teenOptedIn: true,
      guardianApproved: true,
      approvingGuardianId: guardian,
    });
    expect(
      deriveMinorCollectionConsent([record("subject", "granted", 1)], {
        linkedAdultGuardianIds: [guardian],
      }),
    ).toMatchObject({ teenOptedIn: true, guardianApproved: false });
  });

  it("ignores approval from someone who is no longer a linked adult guardian", () => {
    expect(
      deriveMinorCollectionConsent(
        [
          record("subject", "granted", 1),
          record("guardian", "granted", 2, other),
        ],
        { linkedAdultGuardianIds: [guardian] },
      ).guardianApproved,
    ).toBe(false);
    expect(
      deriveMinorCollectionConsent(
        [record("subject", "granted", 1), record("guardian", "granted", 2)],
        { linkedAdultGuardianIds: [] },
      ).guardianApproved,
    ).toBe(false);
  });

  it("resets both consents after a withdrawal by either party", () => {
    const byTeen = deriveMinorCollectionConsent(
      [
        record("subject", "granted", 1),
        record("guardian", "granted", 2),
        record("subject", "withdrawn", 3),
      ],
      { linkedAdultGuardianIds: [guardian] },
    );
    expect(byTeen).toMatchObject({
      teenOptedIn: false,
      guardianApproved: false,
      withdrawnBy: "subject",
    });
    const byGuardian = deriveMinorCollectionConsent(
      [
        record("subject", "granted", 1),
        record("guardian", "granted", 2),
        record("guardian", "withdrawn", 3),
        record("subject", "granted", 4),
      ],
      { linkedAdultGuardianIds: [guardian] },
    );
    expect(byGuardian).toMatchObject({
      teenOptedIn: true,
      guardianApproved: false,
      withdrawnBy: "guardian",
    });
  });

  it("requires consent under the current policy version", () => {
    expect(
      deriveMinorCollectionConsent(
        [
          record("subject", "granted", 1, null, "older"),
          record("guardian", "granted", 2, guardian, "older"),
        ],
        { linkedAdultGuardianIds: [guardian] },
      ),
    ).toMatchObject({ teenOptedIn: false, guardianApproved: false });
  });
});

describe("Health grant rules", () => {
  const now = new Date("2026-11-27T12:00:00.000Z");
  const days = (count: number) =>
    new Date(now.getTime() + count * 24 * 60 * 60 * 1_000);
  const permit = (band: HealthAgeBand) =>
    decideHealthAction({
      action: "create-grant",
      band,
      juniorsEnabled: true,
      storefront: "USA",
      teenOptedIn: true,
      guardianApproved: true,
    }) as HealthPermit;
  const request = (
    band: HealthAgeBand,
    overrides: Partial<Parameters<typeof checkHealthGrantRequest>[0]> = {},
  ) =>
    checkHealthGrantRequest({
      permit: permit(band),
      audienceKind: "coach",
      categories: ["heart"],
      scopes: ["summary"],
      expiresAt: days(90),
      now,
      ...overrides,
    });

  it("lets a minor share only with a coach or club staff, for at most 90 days", () => {
    expect(request("teen")).toBeUndefined();
    expect(request("teen", { audienceKind: "organization" })).toBeUndefined();
    expect(request("teen", { audienceKind: "player" })).toBe(
      "audience-not-allowed",
    );
    expect(request("teen", { expiresAt: days(91) })).toBe("expiry-too-long");
    expect(request("teen", { expiresAt: days(0) })).toBe("expiry-in-past");
    expect(request("teen", { categories: ["recovery"] })).toBe(
      "category-not-allowed",
    );
    expect(
      request("teen", { categories: ["activity"], scopes: ["video-overlay"] }),
    ).toBe("video-overlay-needs-heart");
  });

  it("keeps adults' player grants and one-year maximum", () => {
    expect(request("adult", { audienceKind: "player" })).toBeUndefined();
    expect(request("adult", { expiresAt: days(366) })).toBeUndefined();
    expect(request("adult", { expiresAt: days(367) })).toBe("expiry-too-long");
    expect(request("adult", { categories: [] })).toBe("no-categories");
  });

  it("makes a minor's grant readable only after guardian approval", () => {
    const grant = {
      audienceKind: "coach" as const,
      expiresAt: days(30),
      revokedAt: null,
      ownerBand: "teen" as HealthAgeBand,
      juniorsEnabled: true,
      now,
    };
    expect(
      healthGrantIsEffective({ ...grant, approvalStatus: "pending" }),
    ).toBe(false);
    expect(healthGrantIsEffective({ ...grant, approvalStatus: "denied" })).toBe(
      false,
    );
    expect(
      healthGrantIsEffective({ ...grant, approvalStatus: "approved" }),
    ).toBe(true);
    expect(
      healthGrantIsEffective({
        ...grant,
        approvalStatus: "approved",
        juniorsEnabled: false,
      }),
    ).toBe(false);
    expect(
      healthGrantIsEffective({
        ...grant,
        audienceKind: "player",
        approvalStatus: "approved",
      }),
    ).toBe(false);
    expect(
      healthGrantIsEffective({
        ...grant,
        approvalStatus: "approved",
        revokedAt: now,
      }),
    ).toBe(false);
    expect(
      healthGrantIsEffective({
        ...grant,
        approvalStatus: "approved",
        expiresAt: now,
      }),
    ).toBe(false);
  });

  it("ends guardian-approved grants at 18 and keeps adult grants", () => {
    const grant = {
      audienceKind: "coach" as const,
      expiresAt: days(30),
      ownerBand: "adult" as HealthAgeBand,
      juniorsEnabled: true,
      now,
    };
    expect(
      healthGrantIsEffective({ ...grant, approvalStatus: "approved" }),
    ).toBe(false);
    expect(
      healthGrantIsEffective({ ...grant, approvalStatus: "not-required" }),
    ).toBe(true);
    for (const ownerBand of ["unknown", "under-13"] as const) {
      expect(
        healthGrantIsEffective({
          ...grant,
          ownerBand,
          approvalStatus: "not-required",
        }),
      ).toBe(false);
    }
  });

  it("limits organization grants for minors to coaching staff", () => {
    expect(organizationViewerRolesFor("teen")).toEqual(["coach"]);
    expect(organizationViewerRolesFor("adult")).toEqual([
      "owner",
      "manager",
      "coach",
    ]);
  });
});

describe("Health retention selection", () => {
  const now = new Date("2026-11-27T04:40:00.000Z");
  const cutoffs = healthRetentionCutoffs(now);
  const adultBirth = "1990-01-01";
  const teenBirth = "2011-05-01";

  it("uses 24 months for adults and 12 months for anyone under 18 today", () => {
    expect(HEALTH_RETENTION_MONTHS).toEqual({ adult: 24, minor: 12 });
    expect(cutoffs.adultStartedBefore.toISOString()).toBe(
      "2024-11-27T04:40:00.000Z",
    );
    expect(cutoffs.minorStartedBefore.toISOString()).toBe(
      "2025-11-27T04:40:00.000Z",
    );
    expect(cutoffs.minorBornAfter).toBe("2008-11-27");
    expect(cutoffs.adultCheckInsBefore).toBe("2024-11-27");
    expect(cutoffs.minorCheckInsBefore).toBe("2025-11-27");
  });

  it("selects exactly the expired rows, in order, up to the batch limit", () => {
    const rows = [
      {
        id: "adult-25m",
        startedAt: subtractMonths(now, 25),
        birthDate: adultBirth,
      },
      {
        id: "adult-23m",
        startedAt: subtractMonths(now, 23),
        birthDate: adultBirth,
      },
      {
        id: "teen-13m",
        startedAt: subtractMonths(now, 13),
        birthDate: teenBirth,
      },
      {
        id: "teen-11m",
        startedAt: subtractMonths(now, 11),
        birthDate: teenBirth,
      },
      { id: "nodob-25m", startedAt: subtractMonths(now, 25), birthDate: null },
      { id: "nodob-13m", startedAt: subtractMonths(now, 13), birthDate: null },
      // Turned 18 today: adult window applies.
      {
        id: "eighteen-13m",
        startedAt: subtractMonths(now, 13),
        birthDate: "2008-11-27",
      },
      // Turns 18 tomorrow: still a minor.
      {
        id: "seventeen-13m",
        startedAt: subtractMonths(now, 13),
        birthDate: "2008-11-28",
      },
    ];
    expect(
      selectExpiredHealthSamples(rows, now, 100).map((row) => row.id),
    ).toEqual(["adult-25m", "teen-13m", "nodob-25m", "seventeen-13m"]);
    expect(
      selectExpiredHealthSamples(rows, now, 2).map((row) => row.id),
    ).toEqual(["adult-25m", "teen-13m"]);
    expect(selectExpiredHealthSamples(rows, now, 0)).toEqual([]);
  });

  it("keeps a sample exactly at the cutoff and deletes one a millisecond older", () => {
    expect(
      isHealthSampleExpired(
        { startedAt: cutoffs.adultStartedBefore, birthDate: adultBirth },
        now,
      ),
    ).toBe(false);
    expect(
      isHealthSampleExpired(
        {
          startedAt: new Date(cutoffs.adultStartedBefore.getTime() - 1),
          birthDate: adultBirth,
        },
        now,
      ),
    ).toBe(true);
    expect(
      isHealthSampleExpired(
        { startedAt: cutoffs.minorStartedBefore, birthDate: teenBirth },
        now,
      ),
    ).toBe(false);
  });

  it("subtracts calendar months and clamps to month end", () => {
    expect(
      subtractMonths(new Date("2026-03-31T00:00:00.000Z"), 1).toISOString(),
    ).toBe("2026-02-28T00:00:00.000Z");
    expect(
      subtractMonths(new Date("2028-02-29T00:00:00.000Z"), 12).toISOString(),
    ).toBe("2027-02-28T00:00:00.000Z");
  });
});
