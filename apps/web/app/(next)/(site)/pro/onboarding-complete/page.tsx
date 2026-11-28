import "../../pages.css";

import { Icon } from "@duna/ui/tideline";
import type { Metadata } from "next";
import { LinkButton } from "@/components/site/link-button";
import { DUNA_HQ_URL } from "@/lib/site-urls";

export const metadata: Metadata = {
  title: "Return to Duna Pro",
  robots: { index: false, follow: false },
};

/**
 * Where Duna Pro's web hand-off lands after a plan is chosen
 * (`/pro/onboarding-complete?billing=success`): back to the app, or to
 * billing on the web. Not indexed. Same address and wording as before.
 */
export default async function ProOnboardingCompletePage({
  searchParams,
}: {
  readonly searchParams: Promise<{ billing?: string }>;
}) {
  const { billing } = await searchParams;
  const succeeded = billing === "success";
  return (
    <main className="site-page-main" id="main" tabIndex={-1}>
      <section aria-labelledby="return-title" className="site-wrap site-return">
        <div className="site-return__card td-rise">
          <span aria-hidden="true" className="site-return__icon">
            <Icon name={succeeded ? "check" : "phone-bubble"} size="nav" />
          </span>
          <p className="site-label">
            {succeeded ? "Plan activated" : "Workspace saved"}
          </p>
          <h1 className="site-h2" id="return-title">
            {succeeded
              ? "Your club is ready to run."
              : "Continue whenever you’re ready."}
          </h1>
          <p className="site-body">
            {succeeded
              ? "Return to Duna Pro to finish your club profile, add your first venue, and invite your team."
              : "Your new organization is safely on the Free plan. You can activate a paid plan later from Duna HQ."}
          </p>
          <div className="site-actions">
            <LinkButton arrow href="duna-pro://" variant="primary">
              Open Duna Pro
            </LinkButton>
            <LinkButton href={`${DUNA_HQ_URL}/settings`} variant="secondary">
              Manage billing on the web
            </LinkButton>
          </div>
        </div>
      </section>
    </main>
  );
}
