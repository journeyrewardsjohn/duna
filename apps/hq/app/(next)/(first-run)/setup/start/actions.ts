"use server";

import {
  HQ_PLAN_OPTIONS,
  type HqPlan,
  provisionWorkOSOrganization,
} from "@duna/api";
import { log } from "@duna/observability";
import {
  getWorkOS,
  switchToOrganization,
  withAuth,
} from "@workos-inc/authkit-nextjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { normaliseWebsiteInput } from "@/components/setup/setup-model";

const planIds = new Set(HQ_PLAN_OPTIONS.map((plan) => plan.id));

const publicWebUrl = () =>
  process.env.NEXT_PUBLIC_WEB_URL?.replace(/\/$/, "") ??
  process.env.NEXT_PUBLIC_DUNA_WEB_URL?.replace(/\/$/, "") ??
  "https://duna.coach";

/**
 * Creates the club (a new organisation) for the signed-in person, makes
 * them its owner and switches to it. Then the first run continues with the
 * website question; an address given here starts the read on arrival.
 * Paid plans go through checkout first.
 */
export async function createClubAction(formData: FormData) {
  const { user } = await withAuth();
  if (!user) redirect("/sign-in?returnTo=/setup/start");
  const name = String(formData.get("name") ?? "")
    .trim()
    .slice(0, 100);
  if (name.length < 2) redirect("/setup/start?error=name");
  const plan = String(formData.get("plan") ?? "coach") as HqPlan;
  const interval = formData.get("interval") === "year" ? "year" : "month";
  if (!planIds.has(plan)) redirect("/setup/start?error=plan");
  const volleyballType = String(formData.get("volleyballType") ?? "");
  if (!["beach", "indoor", "both"].includes(volleyballType)) {
    redirect("/setup/start?error=volleyballType");
  }
  const volleyballTypes =
    volleyballType === "both"
      ? (["beach", "indoor"] as const)
      : volleyballType === "indoor"
        ? (["indoor"] as const)
        : (["beach"] as const);
  const termsAccepted = formData.get("termsAccepted") === "on";
  if (!termsAccepted) redirect("/setup/start?error=terms");
  const websiteInput = String(formData.get("website") ?? "").trim();
  const website = websiteInput
    ? normaliseWebsiteInput(websiteInput)
    : undefined;
  if (websiteInput && !website) redirect("/setup/start?error=website");

  const workos = getWorkOS();
  const organization = await workos.organizations.createOrganization({ name });
  const requestHeaders = await headers();
  await provisionWorkOSOrganization({
    user,
    workosOrganizationId: organization.id,
    organizationName: organization.name,
    plan,
    volleyballTypes,
    termsAccepted,
    termsUrl: `${publicWebUrl()}/legal/hq-terms`,
    privacyUrl: `${publicWebUrl()}/legal/privacy`,
    ipAddress: requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim(),
    userAgent: requestHeaders.get("user-agent") ?? undefined,
    now: new Date(),
  });
  await workos.userManagement.createOrganizationMembership({
    organizationId: organization.id,
    roleSlug: "admin",
    userId: user.id,
  });
  log.info("hq.setup.club_created", { plan, withWebsite: Boolean(website) });
  const next = website ? `?website=${encodeURIComponent(website)}` : "";
  await switchToOrganization(organization.id, {
    returnTo:
      plan === "coach"
        ? `/setup/start${next}`
        : `/setup/start/complete?plan=${plan}&interval=${interval}&checkoutId=${crypto.randomUUID()}${website ? `&website=${encodeURIComponent(website)}` : ""}`,
  });
}

/** Opens one of the person's existing clubs. */
export async function chooseClubAction(formData: FormData) {
  const { user } = await withAuth();
  if (!user) redirect("/sign-in?returnTo=/setup/start");
  const organizationId = String(formData.get("organizationId") ?? "");
  const memberships =
    await getWorkOS().userManagement.listOrganizationMemberships({
      userId: user.id,
    });
  const allowed = memberships.data.some(
    (membership) => membership.organizationId === organizationId,
  );
  if (!allowed) redirect("/setup/start?error=workspace");
  await switchToOrganization(organizationId, { returnTo: "/" });
}
