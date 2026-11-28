"use client";

import { Button } from "@duna/ui/tideline";
import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { siteLinks } from "./links";

interface AccountLinkProps {
  /** Whether sign-in is configured on this deployment. */
  readonly configured: boolean;
  readonly block?: boolean;
}

function SignIn({ block }: { readonly block?: boolean }) {
  return (
    <Button
      block={block}
      className="site-account"
      href={siteLinks.signIn}
      size="sm"
      variant="secondary"
    >
      Sign in
    </Button>
  );
}

function SignedInAware({ block }: { readonly block?: boolean }) {
  const { loading, user } = useAuth();
  if (loading || !user) return <SignIn block={block} />;
  return (
    <Button
      block={block}
      className="site-account"
      href={siteLinks.app}
      size="sm"
      variant="secondary"
    >
      Open Duna
    </Button>
  );
}

/**
 * Sign in, or, for a visitor who is already signed in, the way into the app.
 * Without sign-in configured it is a plain link to the sign-in page, which
 * explains that state itself.
 */
export function AccountLink({ configured, block }: AccountLinkProps) {
  return configured ? (
    <SignedInAware block={block} />
  ) : (
    <SignIn block={block} />
  );
}
