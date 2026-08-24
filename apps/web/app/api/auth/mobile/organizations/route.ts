import {
  createOrganizationPlanCheckout,
  provisionWorkOSOrganization,
  verifyWorkOSAccessToken,
  type HqPlan,
} from "@duna/api";
import { isOrganizationPlanId } from "@duna/core";
import { getWorkOS } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const claims = await verifyWorkOSAccessToken(
      authorization.slice("Bearer ".length),
    );
    const workos = getWorkOS();
    const [memberships, user] = await Promise.all([
      workos.userManagement.listOrganizationMemberships({
        limit: 100,
        statuses: ["active"],
        userId: claims.sub!,
      }),
      workos.userManagement.getUser(claims.sub!),
    ]);
    const organizations = memberships.data.map((membership) => ({
      id: membership.organizationId,
      name: membership.organizationName,
      role: membership.role.slug,
    }));
    return NextResponse.json(
      {
        organizations,
        user: {
          email: user.email,
          firstName: user.firstName,
          id: user.id,
          lastName: user.lastName,
          profilePictureUrl: user.profilePictureUrl,
        },
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const claims = await verifyWorkOSAccessToken(
      authorization.slice("Bearer ".length),
    );
    const body = (await request.json()) as {
      readonly name?: unknown;
      readonly plan?: unknown;
      readonly termsAccepted?: unknown;
      readonly volleyballTypes?: unknown;
    };
    const name =
      typeof body.name === "string" ? body.name.trim().slice(0, 100) : "";
    const plan = typeof body.plan === "string" ? body.plan : "";
    const volleyballTypes = Array.isArray(body.volleyballTypes)
      ? [...new Set(body.volleyballTypes)].filter(
          (value): value is "beach" | "indoor" =>
            value === "beach" || value === "indoor",
        )
      : [];
    if (
      name.length < 2 ||
      !isOrganizationPlanId(plan) ||
      body.termsAccepted !== true ||
      volleyballTypes.length === 0
    ) {
      return NextResponse.json(
        { error: "Complete the club name, type, plan, and terms." },
        { status: 400 },
      );
    }
    const workos = getWorkOS();
    const user = await workos.userManagement.getUser(claims.sub!);
    const organization = await workos.organizations.createOrganization({
      name,
    });
    const now = new Date();
    const publicWebUrl = (
      process.env.NEXT_PUBLIC_DUNA_WEB_URL ?? "https://duna.coach"
    ).replace(/\/$/, "");
    const provisioned = await provisionWorkOSOrganization({
      user,
      workosOrganizationId: organization.id,
      organizationName: organization.name,
      plan: plan as HqPlan,
      volleyballTypes,
      termsAccepted: true,
      termsUrl: `${publicWebUrl}/legal/hq-terms`,
      privacyUrl: `${publicWebUrl}/legal/privacy`,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
      userAgent: request.headers.get("user-agent") ?? undefined,
      now,
    });
    await workos.userManagement.createOrganizationMembership({
      organizationId: organization.id,
      roleSlug: "admin",
      userId: user.id,
    });
    const checkout =
      plan === "coach"
        ? undefined
        : await createOrganizationPlanCheckout({
            organizationId: provisioned.id,
            email: user.email,
            plan,
            interval: "month",
            successUrl:
              "https://duna.coach/pro/onboarding-complete?billing=success",
            cancelUrl:
              "https://duna.coach/pro/onboarding-complete?billing=cancelled",
            idempotencyKey: `duna-pro-${provisioned.id}-${plan}`,
          });
    return NextResponse.json(
      { id: organization.id, checkoutUrl: checkout?.url ?? undefined },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Duna could not create this organization.",
      },
      { status: 500 },
    );
  }
}
