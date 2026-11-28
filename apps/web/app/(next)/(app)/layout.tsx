// The Player web app on the design system. Its sheet is token-based and in
// the `app` layer; no legacy sheet is imported under app/(next)
// (docs/plan/legacy-styles.md, scripts/design-contracts/web.ts).
import "./app-shell.css";

import { isWorkOSAuthKitConfigured } from "@duna/api/workos-environment";
import { report } from "@duna/observability";
import { ErrorState } from "@duna/ui/tideline";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell/app-shell";
import { getAppSession } from "@/components/app-shell/session";
import {
  signedOutSession,
  type AppSession,
} from "@/components/app-shell/session-types";
import { SignedOutRedirect } from "@/components/app-shell/signed-out";
import { DUNA_HQ_URL } from "@/lib/site-urls";

export const metadata: Metadata = {
  title: { default: "Duna", template: "%s · Duna" },
  robots: { index: false, follow: false },
};

/**
 * Every rebuilt Player web page (`/app/**` in this group): the shell around
 * the page with the person's session. Signed out, the shell shows sign-in and
 * the page sends the person to sign in, keeping their place. If the session
 * itself cannot be read, the shell says so with a reference.
 */
export default async function PlayerAppLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  let session: AppSession;
  try {
    session = await getAppSession();
  } catch (error) {
    const reference = report(error, { event: "web.app_shell.session_failed" });
    return (
      <AppShell
        session={signedOutSession(isWorkOSAuthKitConfigured(), DUNA_HQ_URL)}
      >
        <section className="aps-state">
          <h1 className="td-sr">Duna didn&rsquo;t load</h1>
          <ErrorState
            message="Something went wrong on our side, not yours. Reload the page. If it keeps happening, send Duna support the reference below."
            reference={reference}
            title="Your account didn’t load"
          />
        </section>
      </AppShell>
    );
  }
  return (
    <AppShell session={session}>
      {session.state === "signed-in" ? children : <SignedOutRedirect />}
    </AppShell>
  );
}
