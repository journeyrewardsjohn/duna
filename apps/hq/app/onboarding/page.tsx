import { isWorkOSAuthKitConfigured } from "@duna/api/workos-environment";
import { DunaMark } from "@duna/ui";
import {
  getWorkOS,
  switchToOrganization,
  withAuth,
} from "@workos-inc/authkit-nextjs";
import { ArrowRight, Building2, Plus } from "lucide-react";
import { redirect } from "next/navigation";

async function createWorkspace(formData: FormData) {
  "use server";

  const { user } = await withAuth();
  if (!user) redirect("/sign-in?returnTo=/onboarding");
  const name = String(formData.get("name") ?? "")
    .trim()
    .slice(0, 100);
  if (name.length < 2) redirect("/onboarding?error=name");

  const workos = getWorkOS();
  const organization = await workos.organizations.createOrganization({ name });
  await workos.userManagement.createOrganizationMembership({
    organizationId: organization.id,
    roleSlug: "admin",
    userId: user.id,
  });
  await switchToOrganization(organization.id, { returnTo: "/" });
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

export default async function OrganizationOnboardingPage() {
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

  return (
    <main className="auth-page">
      <section className="organization-onboarding organization-onboarding--workos">
        <header>
          <DunaMark />
          <span>Duna HQ</span>
        </header>
        <div>
          <span className="hq-eyebrow">Your operating workspace</span>
          <h1>Bring your business into Duna.</h1>
          <p>
            Choose an existing club, coaching business, or facility—or create a
            clean new workspace in seconds.
          </p>
        </div>

        {configured ? (
          <div className="workspace-onboarding-grid">
            {organizations.length > 0 && (
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
              <span className="hq-eyebrow">Create a workspace</span>
              <label htmlFor="workspace-name">Business or club name</label>
              <div>
                <input
                  autoComplete="organization"
                  id="workspace-name"
                  minLength={2}
                  name="name"
                  placeholder="Beach Elite Volleyball"
                  required
                />
                <button className="hq-button hq-button--primary" type="submit">
                  <Plus aria-hidden size={17} />
                  Create workspace
                </button>
              </div>
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
