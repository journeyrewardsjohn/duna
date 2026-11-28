"use client";

import { buttonClassName } from "@duna/ui/tideline";
import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { siteLinks } from "./links";

interface AccountLinkProps {
  /** Whether sign-in is configured on this deployment. */
  readonly configured: boolean;
  readonly block?: boolean;
}

/**
 * The kit's secondary button, as the plain link it renders for an address:
 * both destinations are full page loads, and the header needs none of the
 * Button's pending-state script for a link.
 */
function AccountButton({
  block,
  href,
  children,
}: {
  readonly block?: boolean;
  readonly href: string;
  readonly children: string;
}) {
  return (
    <a
      className={buttonClassName(
        { block, size: "sm", variant: "secondary" },
        "site-account",
      )}
      href={href}
    >
      <span className="td-btn__label">{children}</span>
    </a>
  );
}

function SignIn({ block }: { readonly block?: boolean }) {
  return (
    <AccountButton block={block} href={siteLinks.signIn}>
      Sign in
    </AccountButton>
  );
}

function SignedInAware({ block }: { readonly block?: boolean }) {
  const { loading, user } = useAuth();
  if (loading || !user) return <SignIn block={block} />;
  return (
    <AccountButton block={block} href={siteLinks.app}>
      Open Duna
    </AccountButton>
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
