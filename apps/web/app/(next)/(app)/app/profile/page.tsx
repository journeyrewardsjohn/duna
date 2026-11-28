import "@/components/player/player.css";

import type { Metadata } from "next";
import { headers } from "next/headers";
import { getAppSession } from "@/components/app-shell/session";
import { getServerCaller } from "@/lib/api";
import { settleServerRead } from "@/lib/server-read";
import { loadMatches } from "@/components/player/matches/matches-data";
import { ProfileView } from "@/components/player/profile/profile-view";
import { loadSettingsPage } from "@/components/player/settings/settings-data";
import { ReadFailed } from "@/components/player/states";

export const metadata: Metadata = { title: "Profile" };

/**
 * Profile (`/app/profile`, P-WEB-1): who I am as other players see me, the
 * Sand Rating with the provisional rule, who can see me with the public
 * preview, clubs and cards (to the wallet) and family with consent states.
 */
export default async function ProfilePage() {
  const session = await getAppSession();
  const caller = await getServerCaller();
  const [settings, matches, wallets] = await Promise.all([
    loadSettingsPage(),
    loadMatches(),
    settleServerRead(
      () => caller.player.organizationWallets(),
      "web.profile.wallets_failed",
    ),
  ]);
  if (!settings.ok || !matches.ok) {
    const failed = !settings.ok ? settings : !matches.ok ? matches : null;
    return (
      <div className="pp">
        <h1 className="td-display pp-title">Profile</h1>
        {failed && !failed.ok ? (
          <ReadFailed
            busy={failed.busy}
            reference={failed.reference}
            what="Your profile"
          />
        ) : null}
      </div>
    );
  }
  const timeZone =
    (await headers()).get("x-vercel-ip-timezone") ?? "America/Los_Angeles";
  return (
    <div className="pp">
      <ProfileView
        matches={matches.value.matches}
        me={matches.value.me}
        session={session}
        settings={settings.value.settings}
        timeZone={timeZone}
        wallets={wallets.ok ? wallets.value : null}
      />
    </div>
  );
}
