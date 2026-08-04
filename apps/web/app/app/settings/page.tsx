import {
  GUARDIAN_CONSENT_DISCLOSURE,
  unavailableAccountDeletionReadiness,
} from "@duna/api";
import { FamilyWalletSettings } from "@/components/family-wallet-settings";
import { HouseholdSettings } from "@/components/household-settings";
import { MembershipSettings } from "@/components/membership-settings";
import { NotificationSettings } from "@/components/notification-settings";
import { PlayingProfileSettings } from "@/components/playing-profile-settings";
import { PrivacySettings } from "@/components/privacy-settings";
import { ProfileSettings } from "@/components/profile-settings";
import { SettingsSectionNav } from "@/components/settings-section-nav";
import { getServerCaller } from "@/lib/api";

export const metadata = { title: "Settings" };
export const maxDuration = 300;

export default async function SettingsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ membership?: string }>;
}) {
  const query = await searchParams;
  const caller = await getServerCaller();
  const [settings, familyWallets, deletionReadiness] = await Promise.all([
    caller.player.settings(),
    caller.player.familyWallets(),
    caller.player
      .accountDeletionReadiness()
      .catch(() => unavailableAccountDeletionReadiness),
  ]);
  const membershipNotice =
    query.membership === "success"
      ? "Payment was accepted. Duna+ will appear here as soon as the secure confirmation synchronizes."
      : query.membership === "cancelled"
        ? "Duna+ checkout was cancelled. No membership change was made."
        : undefined;

  return (
    <main className="standard-page settings-page">
      <section className="page-heading-row">
        <div>
          <span className="page-eyebrow">Account + preferences</span>
          <h1>Settings.</h1>
          <p>
            Identity, family, communication, payments, privacy, and membership.
          </p>
        </div>
      </section>

      <section className="settings-layout">
        <SettingsSectionNav showFamilyWallets={familyWallets.length > 0} />

        <div className="settings-content">
          <MembershipSettings
            initialNotice={membershipNotice}
            membership={settings.membership}
            plans={settings.dunaPlusPlans}
          />
          <ProfileSettings profile={settings.profile} />
          <PlayingProfileSettings settings={settings} />
          <HouseholdSettings
            ageBand={settings.profile.ageBand}
            consentDisclosure={GUARDIAN_CONSENT_DISCLOSURE}
            household={settings.household}
          />
          <FamilyWalletSettings wallets={familyWallets} />
          <NotificationSettings consents={settings.consents} />
          <PrivacySettings
            readiness={deletionReadiness}
            requests={settings.privacyRequests}
          />
        </div>
      </section>
    </main>
  );
}
