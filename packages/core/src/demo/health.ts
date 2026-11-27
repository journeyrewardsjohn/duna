/**
 * Demo fixtures: health (H1, junior players). Three Health subjects for demo
 * mode and tests: an adult (the demo player, Mara Lewis), a 15-year-old with
 * Mara as verified guardian, and an 11-year-old with Mara as verified
 * guardian. Birth dates are derived from the `now` the caller passes so the
 * ages stay true; ids come from `demoId("health", n)`.
 *
 * See ./README.md for how demo mode is selected and the fixture rules.
 */
import { demoOrganization, demoPlayer } from "../demo";
import { demoId } from "./ids";

export const healthDemoIds = {
  adult: demoPlayer.id,
  teen: demoId("health", 1),
  child: demoId("health", 2),
  coach: demoId("health", 3),
  approvedGrant: demoId("health", 10),
  pendingGrant: demoId("health", 11),
} as const;

export interface HealthDemoGuardianLink {
  readonly guardianId: string;
  readonly reviewStatus: "pending" | "verified" | "rejected";
}

export interface HealthDemoPerson {
  readonly personId: string;
  readonly displayName: string;
  readonly birthDate: string;
  readonly guardians: readonly HealthDemoGuardianLink[];
  readonly storefrontCountry: string;
  /** Collection consents already recorded for a minor. */
  readonly teenOptedIn: boolean;
  readonly guardianApproved: boolean;
}

export interface HealthDemoGrant {
  readonly id: string;
  readonly ownerPersonId: string;
  readonly audienceKind: "player" | "coach" | "organization";
  readonly audiencePersonId?: string;
  readonly organizationId?: string;
  readonly audienceLabel: string;
  readonly categories: readonly ("heart" | "recovery" | "activity" | "body")[];
  readonly scopes: readonly ("summary" | "timeline" | "video-overlay")[];
  readonly approvalStatus: "not-required" | "pending" | "approved" | "denied";
  readonly createdAt: string;
  readonly expiresAt: string;
}

export interface HealthDemoSample {
  readonly id: string;
  readonly personId: string;
  readonly metric:
    | "heart-rate"
    | "resting-heart-rate"
    | "active-energy"
    | "exercise-minutes"
    | "sleep";
  readonly kind: "quantity" | "category";
  readonly startedAt: string;
  readonly endedAt: string;
  readonly value?: number;
  readonly unit?: string;
  readonly categoryValue?: string;
}

const DAY = 24 * 60 * 60 * 1_000;

function birthDateYearsAgo(now: Date, years: number, extraDays: number) {
  const date = new Date(
    Date.UTC(
      now.getUTCFullYear() - years,
      now.getUTCMonth(),
      now.getUTCDate(),
    ) -
      extraDays * DAY,
  );
  return date.toISOString().slice(0, 10);
}

export function healthDemoPeople(now: Date): readonly HealthDemoPerson[] {
  return [
    {
      personId: healthDemoIds.adult,
      displayName: demoPlayer.displayName,
      birthDate: birthDateYearsAgo(now, 32, 40),
      guardians: [],
      storefrontCountry: "USA",
      teenOptedIn: false,
      guardianApproved: false,
    },
    {
      personId: healthDemoIds.teen,
      displayName: "Sky Lewis",
      birthDate: birthDateYearsAgo(now, 15, 100),
      guardians: [{ guardianId: demoPlayer.id, reviewStatus: "verified" }],
      storefrontCountry: "USA",
      teenOptedIn: true,
      guardianApproved: true,
    },
    {
      personId: healthDemoIds.child,
      displayName: "Remy Lewis",
      birthDate: birthDateYearsAgo(now, 11, 60),
      guardians: [{ guardianId: demoPlayer.id, reviewStatus: "verified" }],
      storefrontCountry: "USA",
      teenOptedIn: false,
      guardianApproved: false,
    },
  ];
}

export function healthDemoPerson(
  personId: string,
  now: Date,
): HealthDemoPerson | undefined {
  return healthDemoPeople(now).find((person) => person.personId === personId);
}

export function healthDemoGrants(now: Date): readonly HealthDemoGrant[] {
  return [
    {
      id: healthDemoIds.approvedGrant,
      ownerPersonId: healthDemoIds.teen,
      audienceKind: "organization",
      organizationId: demoOrganization.id,
      audienceLabel: demoOrganization.name,
      categories: ["heart", "activity"],
      scopes: ["summary"],
      approvalStatus: "approved",
      createdAt: new Date(now.getTime() - 10 * DAY).toISOString(),
      expiresAt: new Date(now.getTime() + 80 * DAY).toISOString(),
    },
    {
      id: healthDemoIds.pendingGrant,
      ownerPersonId: healthDemoIds.teen,
      audienceKind: "coach",
      audiencePersonId: healthDemoIds.coach,
      audienceLabel: "Coach Dana Ortiz",
      categories: ["heart"],
      scopes: ["summary", "video-overlay"],
      approvalStatus: "pending",
      createdAt: new Date(now.getTime() - DAY).toISOString(),
      expiresAt: new Date(now.getTime() + 89 * DAY).toISOString(),
    },
  ];
}

/** A small, deterministic week of samples for the adult and the teen. */
export function healthDemoSamples(
  personId: string,
  now: Date,
): readonly HealthDemoSample[] {
  if (personId !== healthDemoIds.adult && personId !== healthDemoIds.teen) {
    return [];
  }
  const base = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    16,
  );
  const samples: HealthDemoSample[] = [];
  for (let day = 0; day < 7; day += 1) {
    const start = base - (day + 1) * DAY;
    const iso = (offsetMinutes: number) =>
      new Date(start + offsetMinutes * 60_000).toISOString();
    samples.push(
      {
        id: demoId("health", 100 + day * 10),
        personId,
        metric: "heart-rate",
        kind: "quantity",
        startedAt: iso(0),
        endedAt: iso(1),
        value: 128 + day * 3,
        unit: "count/min",
      },
      {
        id: demoId("health", 101 + day * 10),
        personId,
        metric: "active-energy",
        kind: "quantity",
        startedAt: iso(0),
        endedAt: iso(60),
        value: 420 + day * 15,
        unit: "kcal",
      },
      {
        id: demoId("health", 102 + day * 10),
        personId,
        metric: "exercise-minutes",
        kind: "quantity",
        startedAt: iso(0),
        endedAt: iso(60),
        value: 45 + day,
        unit: "min",
      },
    );
    if (personId === healthDemoIds.adult) {
      samples.push({
        id: demoId("health", 103 + day * 10),
        personId,
        metric: "resting-heart-rate",
        kind: "quantity",
        startedAt: iso(-600),
        endedAt: iso(-599),
        value: 52 + (day % 3),
        unit: "count/min",
      });
    }
  }
  return samples;
}
