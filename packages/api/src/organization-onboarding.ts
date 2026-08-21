import {
  auditLog,
  getDatabase,
  legalAcceptances,
  organizationMemberships,
  organizationStaffProfiles,
  organizations,
} from "@duna/db";
import {
  ORGANIZATION_PLAN_IDS,
  ORGANIZATION_PLANS,
  type OrganizationPlanId,
} from "@duna/core";
import type { User } from "@workos-inc/node";
import { eq } from "drizzle-orm";
import { organizationSlug, resolveWorkOSPerson } from "./context";

export type HqPlan = OrganizationPlanId;
export type OrganizationVolleyballType = "beach" | "indoor";

export const HQ_PLAN_OPTIONS: readonly {
  readonly id: HqPlan;
  readonly name: string;
  readonly priceLabel: string;
  readonly priceMinor?: number;
  readonly description: string;
  readonly recommendedFor: string;
  readonly features: readonly string[];
}[] = ORGANIZATION_PLAN_IDS.map((id) => {
  const definition = ORGANIZATION_PLANS[id];
  return {
    id,
    name: definition.productName,
    priceLabel:
      definition.monthlyPriceMinor === 0
        ? "$0"
        : `$${(definition.monthlyPriceMinor / 100).toLocaleString("en-US")} / month`,
    priceMinor: definition.monthlyPriceMinor,
    description: definition.tagline,
    recommendedFor:
      id === "coach"
        ? "Any coach, club, academy, or organization"
        : id === "small-club"
          ? "Organizations lowering transaction costs"
          : "High-volume and multi-location operators",
    features: definition.features,
  };
});

export const HQ_TERMS_VERSION = "2026-08-20";

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
  readonly volleyballTypes: readonly OrganizationVolleyballType[];
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
  const volleyballTypes = [...new Set(input.volleyballTypes)].filter(
    (type): type is OrganizationVolleyballType =>
      type === "beach" || type === "indoor",
  );
  if (volleyballTypes.length === 0) {
    throw new Error(
      "Choose whether this organization runs beach, indoor, or both.",
    );
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
      volleyballTypes,
      stripeSubscriptionStatus:
        selectedPlan.id === "coach" ? "free" : "incomplete",
      marketLaunchEnabled: false,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .onConflictDoUpdate({
      target: organizations.workosOrganizationId,
      set: {
        name: input.organizationName,
        plan: selectedPlan.id,
        volleyballTypes,
        stripeSubscriptionStatus:
          selectedPlan.id === "coach" ? "free" : "incomplete",
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
    database
      .insert(organizationStaffProfiles)
      .values({
        organizationId: organization.id,
        personId: person.id,
        staffRole: "director",
        active: true,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .onConflictDoUpdate({
        target: [
          organizationStaffProfiles.organizationId,
          organizationStaffProfiles.personId,
        ],
        set: {
          staffRole: "director",
          active: true,
          updatedAt: input.now,
        },
      }),
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
          volleyballTypes,
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
