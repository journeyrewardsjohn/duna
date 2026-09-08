import type { OperatorWorkspace } from "./contracts";

export type OrganizationSetupStepId =
  "business" | "venue" | "people" | "brand" | "payments" | "offering";

export interface OrganizationSetupStep {
  readonly id: OrganizationSetupStepId;
  readonly label: string;
  readonly detail: string;
  readonly href: string;
  readonly actionLabel: string;
  readonly complete: boolean;
}

export interface OrganizationSetupReadiness {
  readonly completedCount: number;
  readonly totalCount: number;
  readonly completionPercent: number;
  readonly complete: boolean;
  readonly nextStep?: OrganizationSetupStep;
  readonly steps: readonly OrganizationSetupStep[];
}

/**
 * One shared, deterministic definition of organization readiness powers both
 * the HQ setup UI and Duna AI. It is guidance, not an authorization boundary.
 */
export function getOrganizationSetupReadiness(
  workspace: OperatorWorkspace,
): OrganizationSetupReadiness {
  const organization = workspace.organization;
  const businessReady = Boolean(
    organization.name.trim().length >= 2 &&
    organization.timezone &&
    organization.volleyballTypes.length,
  );
  const venueReady = workspace.venues.some(
    (venue) => venue.status === "active" && venue.courts.length > 0,
  );
  const peopleReady = workspace.people.length > 0 || workspace.staff.length > 1;
  const brandReady = Boolean(
    workspace.theme.publishedAt &&
    workspace.theme.tagline &&
    (workspace.theme.logoUrl || workspace.theme.markUrl),
  );
  const addressReady = Boolean(
    organization.addressLine1 &&
    organization.locality &&
    organization.administrativeArea &&
    organization.postalCode,
  );
  const paymentsReady = organization.stripeChargesEnabled && addressReady;
  const offeringReady =
    workspace.sessions.length > 0 ||
    workspace.catalog.some(
      (item) => item.status === "active" && item.visibility === "public",
    );

  const steps: readonly OrganizationSetupStep[] = [
    {
      id: "business",
      label: "Confirm your business",
      detail:
        "Set the name, volleyball format, and time zone Duna should use everywhere.",
      href: "/settings?section=business",
      actionLabel: "Review business",
      complete: businessReady,
    },
    {
      id: "venue",
      label: "Add a venue and court",
      detail:
        "Tell Duna where you operate so scheduling, capacity, and discovery work correctly.",
      href: "/locations/create",
      actionLabel: "Add a venue",
      complete: venueReady,
    },
    {
      id: "people",
      label: "Bring in your first people",
      detail:
        "Add a player, member, guardian, or teammate so the workspace reflects the real organization.",
      href: "/members/invite",
      actionLabel: "Add a person",
      complete: peopleReady,
    },
    {
      id: "brand",
      label: "Publish your player-facing brand",
      detail:
        "Add a logo and short story, then publish the Theme Kit players and parents will see.",
      href: "/settings/theme",
      actionLabel: "Open Theme Kit",
      complete: brandReady,
    },
    {
      id: "payments",
      label: "Connect payments",
      detail:
        "Add the legal address and complete secure payout verification before selling online.",
      href: "/payments/setup",
      actionLabel: "Set up payments",
      complete: paymentsReady,
    },
    {
      id: "offering",
      label: "Create your first offering",
      detail:
        "Create an event, lesson, membership, or product and review it before sharing it.",
      href: "/events/create",
      actionLabel: "Create an offering",
      complete: offeringReady,
    },
  ];
  const completedCount = steps.filter((step) => step.complete).length;

  return {
    completedCount,
    totalCount: steps.length,
    completionPercent: Math.round((completedCount / steps.length) * 100),
    complete: completedCount === steps.length,
    nextStep: steps.find((step) => !step.complete),
    steps,
  };
}
