"use client";

import { useEffect } from "react";
import { signInHref, signUpHref } from "@/lib/app-routes";

function here(): string {
  return `${window.location.pathname}${window.location.search}`;
}

/**
 * Signed out on an app page: send the person to sign in and bring them back
 * to the same place (`returnTo`). In production the proxy does this before
 * the page renders; this covers demo servers and a session that ended while
 * the page was open. Without script the links still work.
 *
 * Used by both app layouts, so it has no styles of its own beyond the
 * design-system classes the `(next)` document loads.
 */
export function SignedOutRedirect({
  pathname,
  redirect = true,
}: {
  /** The page the person was on, when the server knows it. */
  readonly pathname?: string;
  readonly redirect?: boolean;
}) {
  useEffect(() => {
    if (redirect) window.location.replace(signInHref(here()));
  }, [redirect]);
  const returnTo = pathname ?? "/app";
  return (
    <section aria-labelledby="aps-signed-out" className="aps-state">
      <h1 className="td-display" id="aps-signed-out">
        Sign in to see your week
      </h1>
      <p className="td-lead">
        Your bookings, results and clubs are in your Duna account. Sign in and
        you&rsquo;ll come straight back here.
      </p>
      <p className="aps-state__actions">
        <a className="td-btn td-btn--primary" href={signInHref(returnTo)}>
          Sign in
        </a>
        <a className="td-btn td-btn--secondary" href={signUpHref(returnTo)}>
          Create an account
        </a>
      </p>
    </section>
  );
}
