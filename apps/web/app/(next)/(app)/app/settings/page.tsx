import "@/components/player/player.css";

import { GUARDIAN_CONSENT_DISCLOSURE } from "@duna/api";
import type { Metadata } from "next";
import { loadSettingsPage } from "@/components/player/settings/settings-data";
import { SettingsView } from "@/components/player/settings/settings-view";
import { ReadFailed } from "@/components/player/states";

export const metadata: Metadata = { title: "Settings" };
export const maxDuration = 300;

/**
 * Settings (`/app/settings`, P-WEB-1): profile, who can see you, playing
 * profile, family, notifications and channels, Premium, artwork, your data
 * and sign out. `?membership=success|cancelled` comes back from Premium
 * checkout.
 */
export default async function SettingsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly membership?: string }>;
}) {
  const [{ membership }, loaded] = await Promise.all([
    searchParams,
    loadSettingsPage(),
  ]);
  const head = (
    <header className="pp-head">
      <div className="pp-head__text">
        <h1 className="td-display pp-title">Settings</h1>
        <p className="td-lead">
          Your profile, family, messages, membership and data. Changes save as
          you make them.
        </p>
      </div>
    </header>
  );
  if (!loaded.ok) {
    return (
      <div className="pp">
        {head}
        <ReadFailed
          busy={loaded.busy}
          reference={loaded.reference}
          what="Settings"
        />
      </div>
    );
  }
  const { session, settings, familyWallets, readiness, studio } = loaded.value;
  const membershipNotice =
    membership === "success"
      ? "Payment accepted. Premium shows here as soon as the payment is confirmed."
      : membership === "cancelled"
        ? "Premium checkout was cancelled. Nothing changed."
        : undefined;
  return (
    <div className="pp">
      {head}
      <SettingsView
        authConfigured={session.authConfigured}
        consentDisclosure={GUARDIAN_CONSENT_DISCLOSURE}
        familyWallets={familyWallets}
        {...(membershipNotice ? { membershipNotice } : {})}
        readiness={readiness}
        settings={settings}
        studio={studio}
      />
    </div>
  );
}
