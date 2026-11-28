import { Button, PermissionDenied } from "@duna/ui/tideline";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { getHqSession, hasScope } from "./hq-session";
import { PageHeader } from "./page-header";
import { parseSidebarMode, SIDEBAR_STORAGE_KEY } from "./nav-state";
import { ShellFrame } from "./shell-frame";
import type { ShellSession } from "./session-types";

const playerAppUrl = (
  process.env.NEXT_PUBLIC_WEB_URL ?? "https://duna.coach"
).replace(/\/$/, "");

/** "You need access" for someone who is signed in but not staff here. */
export function NoHqAccess({ session }: { readonly session: ShellSession }) {
  if (session.access === "none") {
    return (
      <div className="hqs-state">
        <PageHeader title="Duna HQ" />
        <PermissionDenied
          action={
            <Button href="/sign-in" variant="primary">
              Sign in
            </Button>
          }
          area="Duna HQ"
          grantedBy="your club's owner to invite you, then sign in"
        />
      </div>
    );
  }
  return (
    <div className="hqs-state">
      <PageHeader title="Duna HQ" />
      <PermissionDenied
        action={
          <Button href={`${playerAppUrl}/app`} variant="secondary">
            Open Duna
          </Button>
        }
        area="Duna HQ"
        grantedBy="an owner of your club to add you to the team"
      />
    </div>
  );
}

/**
 * A page section that needs a permission scope: renders the kit's
 * "You need access" in its place when the person lacks it. The server
 * refuses the data too; this keeps the page honest instead of failing.
 *
 *   <RequireScope area="Money" scope="payments:read">…</RequireScope>
 */
export async function RequireScope({
  scope,
  area,
  children,
}: {
  readonly scope: string;
  readonly area: string;
  readonly children: ReactNode;
}) {
  const session = await getHqSession();
  if (hasScope(session, scope)) return children;
  return (
    <div className="hqs-state">
      <PermissionDenied
        area={area}
        grantedBy={`an owner of ${session.organization?.name ?? "your club"}`}
      />
    </div>
  );
}

/**
 * The server half of the shell, used by `app/(next)/(hq)/layout.tsx`: reads
 * the session and the remembered sidebar, and renders the page inside the
 * shell, or "You need access" for people who do not work in HQ.
 */
export async function HqShell({ children }: { readonly children: ReactNode }) {
  const [session, jar] = await Promise.all([getHqSession(), cookies()]);
  const sidebar = parseSidebarMode(jar.get(SIDEBAR_STORAGE_KEY)?.value);
  return (
    <ShellFrame session={session} sidebar={sidebar}>
      {session.access === "operator" ? (
        children
      ) : (
        <NoHqAccess session={session} />
      )}
    </ShellFrame>
  );
}
