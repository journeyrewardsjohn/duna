import { OrganizationList } from "@clerk/nextjs";
import { DunaMark } from "@duna/ui";

export default function OrganizationOnboardingPage() {
  return (
    <main className="auth-page">
      <section className="organization-onboarding">
        <header>
          <DunaMark />
          <span>Duna HQ</span>
        </header>
        <div>
          <span className="hq-eyebrow">Your operating workspace</span>
          <h1>Choose or create an organization.</h1>
          <p>
            Clubs, coaching businesses, and facilities each operate inside a
            secure Duna organization.
          </p>
        </div>
        {process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? (
          <OrganizationList
            afterCreateOrganizationUrl="/"
            afterSelectOrganizationUrl="/"
            hidePersonal
          />
        ) : (
          <p>Clerk keys are required before organization setup can begin.</p>
        )}
      </section>
    </main>
  );
}
