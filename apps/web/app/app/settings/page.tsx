import { GUARDIAN_CONSENT_DISCLOSURE } from "@duna/api";
import {
  Bell,
  CreditCard,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
  WalletCards,
} from "lucide-react";
import { FamilyWalletSettings } from "@/components/family-wallet-settings";
import { HouseholdSettings } from "@/components/household-settings";
import { MembershipSettings } from "@/components/membership-settings";
import { NotificationSettings } from "@/components/notification-settings";
import { PlayingProfileSettings } from "@/components/playing-profile-settings";
import { PrivacySettings } from "@/components/privacy-settings";
import { ProfileSettings } from "@/components/profile-settings";
import { getServerCaller } from "@/lib/api";

export const metadata = { title: "Settings" };

export default async function SettingsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ membership?: string }>;
}) {
  const query = await searchParams;
  const caller = await getServerCaller();
  const [settings, familyWallets] = await Promise.all([
    caller.player.settings(),
    caller.player.familyWallets(),
  ]);
  const membershipNotice =
    query.membership === "success"
      ? "Stripe accepted the checkout. Duna+ will appear here as soon as the signed webhook synchronizes it."
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
        <nav aria-label="Settings sections">
          <a className="active" href="#membership">
            <CreditCard size={17} /> Membership
          </a>
          <a href="#profile">
            <UserRound size={17} /> Profile
          </a>
          <a href="#playing-profile">
            <Sparkles size={17} /> Player details
          </a>
          <a href="#household">
            <Users size={17} /> Household
          </a>
          {familyWallets.length > 0 && (
            <a href="#family-wallets">
              <WalletCards size={17} /> Family wallets
            </a>
          )}
          <a href="#notifications">
            <Bell size={17} /> Notifications
          </a>
          <a href="#privacy">
            <ShieldCheck size={17} /> Privacy + safety
          </a>
        </nav>

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
          <PrivacySettings requests={settings.privacyRequests} />
        </div>
      </section>
    </main>
  );
}
