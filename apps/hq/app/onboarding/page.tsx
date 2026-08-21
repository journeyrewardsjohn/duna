import {
  HQ_PLAN_OPTIONS,
  HQ_TERMS_VERSION,
  type HqPlan,
  provisionWorkOSOrganization,
} from "@duna/api";
import { isWorkOSAuthKitConfigured } from "@duna/api/workos-environment";
import { DunaMark } from "@duna/ui";
import {
  getWorkOS,
  switchToOrganization,
  withAuth,
} from "@workos-inc/authkit-nextjs";
import {
  ArrowRight,
  Building2,
  Check,
  Layers3,
  Plus,
  ShieldCheck,
  SunMedium,
  Warehouse,
} from "lucide-react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

const planIds = new Set(HQ_PLAN_OPTIONS.map((plan) => plan.id));

async function createWorkspace(formData: FormData) {
  "use server";

  const { user } = await withAuth();
  if (!user) redirect("/sign-in?returnTo=/onboarding");
  const name = String(formData.get("name") ?? "")
    .trim()
    .slice(0, 100);
  if (name.length < 2) redirect("/onboarding?error=name");
  const plan = String(formData.get("plan") ?? "coach") as HqPlan;
  if (!planIds.has(plan)) redirect("/onboarding?error=plan");
  const volleyballType = String(formData.get("volleyballType") ?? "");
  if (!["beach", "indoor", "both"].includes(volleyballType)) {
    redirect("/onboarding?error=volleyballType");
  }
  const volleyballTypes =
    volleyballType === "both"
      ? (["beach", "indoor"] as const)
      : volleyballType === "indoor"
        ? (["indoor"] as const)
        : (["beach"] as const);
  const termsAccepted = formData.get("termsAccepted") === "on";
  if (!termsAccepted) redirect("/onboarding?error=terms");

  const workos = getWorkOS();
  const organization = await workos.organizations.createOrganization({ name });
  const requestHeaders = await headers();
  const publicWebUrl =
    process.env.NEXT_PUBLIC_WEB_URL?.replace(/\/$/, "") ??
    process.env.NEXT_PUBLIC_DUNA_WEB_URL?.replace(/\/$/, "") ??
    "https://duna.coach";
  await provisionWorkOSOrganization({
    user,
    workosOrganizationId: organization.id,
    organizationName: organization.name,
    plan,
    volleyballTypes,
    termsAccepted,
    termsUrl: `${publicWebUrl}/legal/hq-terms`,
    privacyUrl: `${publicWebUrl}/legal/privacy`,
    ipAddress: requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim(),
    userAgent: requestHeaders.get("user-agent") ?? undefined,
    now: new Date(),
  });
  await workos.userManagement.createOrganizationMembership({
    organizationId: organization.id,
    roleSlug: "admin",
    userId: user.id,
  });
  await switchToOrganization(organization.id, {
    returnTo:
      plan === "coach"
        ? "/"
        : `/onboarding/complete?plan=${plan}&checkoutId=${crypto.randomUUID()}`,
  });
}

async function chooseWorkspace(formData: FormData) {
  "use server";

  const { user } = await withAuth();
  if (!user) redirect("/sign-in?returnTo=/onboarding");
  const organizationId = String(formData.get("organizationId") ?? "");
  const memberships =
    await getWorkOS().userManagement.listOrganizationMemberships({
      userId: user.id,
    });
  const allowed = memberships.data.some(
    (membership) => membership.organizationId === organizationId,
  );
  if (!allowed) redirect("/onboarding?error=workspace");
  await switchToOrganization(organizationId, { returnTo: "/" });
}

export default async function OrganizationOnboardingPage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    error?: string;
    mode?: string;
    plan?: string;
    source?: string;
  }>;
}) {
  const query = await searchParams;
  const createOnly = query.mode === "create";
  const selectedPlan = planIds.has(query.plan as HqPlan)
    ? (query.plan as HqPlan)
    : "coach";
  const configured = isWorkOSAuthKitConfigured();
  const auth = configured ? await withAuth() : undefined;
  const memberships =
    configured && auth?.user
      ? await getWorkOS().userManagement.listOrganizationMemberships({
          userId: auth.user.id,
        })
      : undefined;
  const organizations = memberships
    ? await Promise.all(
        memberships.data.map((membership) =>
          getWorkOS().organizations.getOrganization(membership.organizationId),
        ),
      )
    : [];
  const publicWebUrl =
    process.env.NEXT_PUBLIC_WEB_URL?.replace(/\/$/, "") ??
    process.env.NEXT_PUBLIC_DUNA_WEB_URL?.replace(/\/$/, "") ??
    "https://duna.coach";
  const error =
    query.error === "terms"
      ? "Accept the Duna HQ Terms and Privacy Policy to create a workspace."
      : query.error === "volleyballType"
        ? "Choose whether this organization runs beach volleyball, indoor volleyball, or both."
        : query.error === "plan"
          ? "Choose a valid Duna HQ plan."
          : query.error === "name"
            ? "Enter a business or club name with at least two characters."
            : query.error === "workspace"
              ? "That workspace is not available to this account."
              : undefined;

  return (
    <main className="auth-page">
      <section className="organization-onboarding organization-onboarding--workos">
        <header>
          <DunaMark />
          <span>Duna HQ</span>
        </header>
        <div>
          <span className="hq-eyebrow">Your operating workspace</span>
          <h1>
            {createOnly
              ? "Create a new organization."
              : "Bring your business into Duna."}
          </h1>
          <p>
            {createOnly
              ? "Start a separate business without mixing members, money, or settings with your current organization."
              : "Choose an existing workspace or start a separate business with the plan that fits today. One administrator can manage multiple organizations without mixing members, money, or settings."}
          </p>
        </div>

        {configured ? (
          <div className="workspace-onboarding-grid">
            {error && (
              <p className="workspace-onboarding-error" role="alert">
                {error}
              </p>
            )}
            {!createOnly && organizations.length > 0 && (
              <div className="workspace-choice-list">
                <span className="hq-eyebrow">Your workspaces</span>
                {organizations.map((organization) => (
                  <form action={chooseWorkspace} key={organization.id}>
                    <input
                      name="organizationId"
                      type="hidden"
                      value={organization.id}
                    />
                    <button className="workspace-choice" type="submit">
                      <span>
                        <Building2 aria-hidden size={20} />
                        <strong>{organization.name}</strong>
                      </span>
                      <ArrowRight aria-hidden size={18} />
                    </button>
                  </form>
                ))}
              </div>
            )}
            <form action={createWorkspace} className="workspace-create-form">
              <div className="workspace-create-form__heading">
                <span>
                  <Layers3 aria-hidden size={20} />
                </span>
                <div>
                  <span className="hq-eyebrow">Create a workspace</span>
                  <h2>What are you building?</h2>
                  <p>
                    Every workspace has its own customers, payments, staff, and
                    plan. You can add another organization later.
                  </p>
                </div>
              </div>
              <label htmlFor="workspace-name">
                Business, club, or coaching brand
                <input
                  autoComplete="organization"
                  id="workspace-name"
                  minLength={2}
                  name="name"
                  placeholder="Beach Elite Volleyball"
                  required
                />
              </label>

              <fieldset className="workspace-club-type-picker">
                <legend>
                  <span className="hq-eyebrow">Your volleyball operation</span>
                  <strong>Where do your teams play?</strong>
                  <small>
                    This shapes your starting workspace. You can add the other
                    discipline later in Settings.
                  </small>
                </legend>
                <div>
                  <label>
                    <input
                      name="volleyballType"
                      required
                      type="radio"
                      value="beach"
                    />
                    <span>
                      <SunMedium aria-hidden size={19} />
                      <strong>Beach</strong>
                    </span>
                  </label>
                  <label>
                    <input
                      name="volleyballType"
                      required
                      type="radio"
                      value="indoor"
                    />
                    <span>
                      <Warehouse aria-hidden size={19} />
                      <strong>Indoor</strong>
                    </span>
                  </label>
                  <label>
                    <input
                      name="volleyballType"
                      required
                      type="radio"
                      value="both"
                    />
                    <span>
                      <Layers3 aria-hidden size={19} />
                      <strong>Both</strong>
                    </span>
                  </label>
                </div>
              </fieldset>

              <fieldset className="workspace-plan-picker">
                <legend>
                  <span className="hq-eyebrow">Plans + pricing</span>
                  <strong>Choose how you want to start.</strong>
                </legend>
                <div>
                  {HQ_PLAN_OPTIONS.map((plan) => (
                    <label
                      className="workspace-plan-card"
                      key={plan.id}
                      title={plan.description}
                    >
                      <input
                        defaultChecked={plan.id === selectedPlan}
                        name="plan"
                        type="radio"
                        value={plan.id}
                      />
                      <span className="workspace-plan-card__check">
                        <Check aria-hidden size={15} />
                      </span>
                      <span className="workspace-plan-card__name">
                        <strong>{plan.name}</strong>
                        <b>{plan.priceLabel}</b>
                      </span>
                      <small>{plan.recommendedFor}</small>
                      <p>{plan.description}</p>
                      <ul>
                        {plan.features.map((feature) => (
                          <li key={feature}>
                            <Check aria-hidden size={13} /> {feature}
                          </li>
                        ))}
                      </ul>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="workspace-pricing-note">
                <ShieldCheck aria-hidden size={18} />
                <span>
                  <strong>Start with a clean workspace.</strong>
                  <small>
                    Free includes every Duna HQ feature. If you choose a paid
                    plan, secure Stripe checkout is the next step. Card
                    processing, organization, and player service fees remain
                    itemized before transactions.
                  </small>
                </span>
              </div>

              <label className="workspace-terms">
                <input name="termsAccepted" required type="checkbox" />
                <span>
                  I am authorized to bind this organization and agree to the{" "}
                  <a
                    href={`${publicWebUrl}/legal/hq-terms`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Duna HQ Terms
                  </a>{" "}
                  (version {HQ_TERMS_VERSION}) and{" "}
                  <a
                    href={`${publicWebUrl}/legal/privacy`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Privacy Policy
                  </a>
                  .
                </span>
              </label>
              <button className="hq-button hq-button--primary" type="submit">
                <Plus aria-hidden size={17} />
                Create workspace
              </button>
            </form>
          </div>
        ) : (
          <p className="auth-setup-note">
            WorkOS is not configured in this preview environment.
          </p>
        )}
      </section>
    </main>
  );
}
