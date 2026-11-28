import { isWorkOSAuthKitConfigured } from "@duna/api/workos-environment";
import type { ReactNode } from "react";
import { SignedOutRedirect } from "@/components/app-shell/signed-out";
import { PlayerShell } from "@/components/player-shell";
import { ServerReadFailed } from "@/components/observability/server-read-failed";
import { getServerCaller, getServerContext } from "@/lib/api";
import { settleServerRead } from "@/lib/server-read";

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
  // A refused or failed read shows the busy / error state instead of
  // throwing to the root boundary (lib/server-read.ts).
  const loaded = await settleServerRead(
    () =>
      Promise.all([
        caller.player.dashboard(),
        caller.player.organizationAccess(),
      ]),
    "web.playerShell.read.failed",
  );
  if (!loaded.ok) {
    return <ServerReadFailed busy={loaded.busy} reference={loaded.reference} />;
  }
  const [dashboard, organizationAccess] = loaded.value;
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
