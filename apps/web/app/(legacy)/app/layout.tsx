import { isWorkOSAuthKitConfigured } from "@duna/api/workos-environment";
import type { ReactNode } from "react";
import { SignedOutRedirect } from "@/components/app-shell/signed-out";
import { PlayerShell } from "@/components/player-shell";
import { getServerCaller, getServerContext } from "@/lib/api";

/**
 * The pages of `/app` not rebuilt yet keep the old player shell until their
 * screen package moves them to `app/(next)/(app)` (docs/design/player-web-shell.md).
 * Signed out, they send the person to sign in and back to the same page.
 */
export default async function PlayerLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const context = await getServerContext();
  if (!context.actor) return <SignedOutRedirect />;
  const caller = await getServerCaller();
  const [dashboard, organizationAccess] = await Promise.all([
    caller.player.dashboard(),
    caller.player.organizationAccess(),
  ]);
  return (
    <PlayerShell
      authConfigured={isWorkOSAuthKitConfigured()}
      organizationAccess={organizationAccess}
      player={dashboard.player}
    >
      {children}
    </PlayerShell>
  );
}
