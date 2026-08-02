import {
  auditLog,
  getDatabase,
  legalAcceptances,
  organizationMemberships,
  organizations,
} from "@duna/db";
import type { User } from "@workos-inc/node";
import { eq } from "drizzle-orm";
import { organizationSlug, resolveWorkOSPerson } from "./context";

export type HqPlan = "coach" | "small-club" | "club" | "multi-venue";

export const HQ_PLAN_OPTIONS: readonly {
  readonly id: HqPlan;
  readonly name: string;
  readonly priceLabel: string;
  readonly priceMinor?: number;
  readonly description: string;
  readonly recommendedFor: string;
  readonly features: readonly string[];
}[] = [
  {
    id: "coach",
    name: "Coach",
    priceLabel: "$0",
    priceMinor: 0,
    description: "Start a coaching business and pay only when you sell.",
    recommendedFor: "Independent coaches and new organizers",
    features: [
      "Events, services, and client management",
      "Public coach profile and booking",
      "0% marketplace take on clients you bring",
      "12–15% only on Duna-originated bookings",
    ],
  },
  {
    id: "small-club",
    name: "Small Club",
    priceLabel: "$199 / month",
    priceMinor: 19_900,
    description: "Run a growing club with memberships, credits, and staff.",
    recommendedFor: "Clubs with one location or a small team",
    features: [
      "Everything in Coach",
      "Memberships, credit packs, and marketing",
      "Team roles, facilities, and advanced reporting",
      "No separate platform take on club GMV",
    ],
  },
  {
    id: "club",
    name: "Club",
    priceLabel: "$499 / month",
    priceMinor: 49_900,
    description: "Operate a high-volume facility or established academy.",
    recommendedFor: "Facilities and mature clubs",
    features: [
      "Everything in Small Club",
      "Court inventory and operational controls",
      "Priority support and deeper analytics",
      "No separate platform take on club GMV",
    ],
  },
  {
    id: "multi-venue",
    name: "Multi-venue",
    priceLabel: "Custom",
    description: "One operating model across several venues or brands.",
    recommendedFor: "Regional and multi-location operators",
    features: [
      "Everything in Club",
      "Cross-location controls and reporting",
      "Custom implementation, data, and support",
    ],
  },
] as const;

export const HQ_TERMS_VERSION = "2026-08-02";

function planOption(plan: HqPlan) {
  const option = HQ_PLAN_OPTIONS.find((candidate) => candidate.id === plan);
  if (!option) throw new Error("The selected Duna HQ plan is invalid.");
  return option;
}

export async function provisionWorkOSOrganization(input: {
  readonly user: User;
  readonly workosOrganizationId: string;
  readonly organizationName: string;
  readonly plan: HqPlan;
  readonly termsAccepted: boolean;
  readonly termsUrl: string;
  readonly privacyUrl: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly now: Date;
}) {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to create a Duna workspace.");
  }
  if (!input.termsAccepted) {
    throw new Error("Duna HQ terms must be accepted to create a workspace.");
  }

  const database = getDatabase();
  const person = await resolveWorkOSPerson(input.user);
  const selectedPlan = planOption(input.plan);
  await database
    .insert(organizations)
    .values({
      workosOrganizationId: input.workosOrganizationId,
      slug: organizationSlug(
        input.organizationName,
        input.workosOrganizationId,
      ),
      name: input.organizationName,
      plan: selectedPlan.id,
      marketLaunchEnabled: false,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .onConflictDoUpdate({
      target: organizations.workosOrganizationId,
      set: {
        name: input.organizationName,
        plan: selectedPlan.id,
        updatedAt: input.now,
      },
    });

  const organization = await database.query.organizations.findFirst({
    where: eq(organizations.workosOrganizationId, input.workosOrganizationId),
  });
  if (!organization) {
    throw new Error("The Duna organization record could not be created.");
  }

  const acceptanceId = crypto.randomUUID();
  await database.batch([
    database
      .insert(organizationMemberships)
      .values({
        organizationId: organization.id,
        personId: person.id,
        role: "owner",
        scopes: [],
        active: true,
        joinedAt: input.now,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .onConflictDoNothing(),
    database.insert(legalAcceptances).values({
      id: acceptanceId,
      personId: person.id,
      organizationId: organization.id,
      documentKey: "hq-terms",
      documentVersion: HQ_TERMS_VERSION,
      acceptanceMethod: "clickwrap",
      evidence: {
        termsUrl: input.termsUrl,
        privacyUrl: input.privacyUrl,
        selectedPlan: selectedPlan.id,
        pricingSnapshot: {
          name: selectedPlan.name,
          priceLabel: selectedPlan.priceLabel,
          priceMinor: selectedPlan.priceMinor,
          recommendedFor: selectedPlan.recommendedFor,
        },
      },
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      acceptedAt: input.now,
      createdAt: input.now,
    }),
    database.insert(auditLog).values({
      organizationId: organization.id,
      actorPersonId: person.id,
      actorType: "person",
      action: "organization.created",
      entityType: "organization",
      entityId: organization.id,
      reason: `Created a Duna HQ workspace on the ${selectedPlan.id} plan and accepted HQ Terms ${HQ_TERMS_VERSION}.`,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);

  return {
    id: organization.id,
    slug: organization.slug,
    plan: selectedPlan.id,
    legalAcceptanceId: acceptanceId,
  };
}
