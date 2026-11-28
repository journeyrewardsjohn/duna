"use client";

import { SectionNav } from "@duna/ui/tideline";
import type {
  DeletionReadiness,
  FamilyWallet,
  MediaStudio,
  PlayerSettingsData,
} from "../api-types";
import { OfflineNotice } from "../states";
import { PlayingProfileForm } from "./playing-profile";
import {
  MessagesSection,
  PremiumSection,
  PrivacySection,
  ProfileSection,
  SettingsSection,
} from "./sections-a";
import {
  ArtworkSection,
  DataSection,
  FamilySection,
  SignOutSection,
} from "./sections-b";

/**
 * Settings (`/app/settings`, P-WEB-1): short forms that save in place, in
 * the order people look for them. Each section has an address
 * (`/app/settings#privacy`), so older links keep landing in the right place.
 */
export function SettingsView({
  settings,
  familyWallets,
  readiness,
  studio,
  membershipNotice,
  consentDisclosure,
  authConfigured,
}: {
  readonly settings: PlayerSettingsData;
  readonly familyWallets: readonly FamilyWallet[];
  readonly readiness: DeletionReadiness;
  readonly studio: MediaStudio | null;
  readonly membershipNotice?: string;
  readonly consentDisclosure: string;
  readonly authConfigured: boolean;
}) {
  const items = [
    { id: "profile", label: "Profile", href: "#profile" },
    { id: "privacy", label: "Who can see you", href: "#privacy" },
    { id: "playing", label: "Playing profile", href: "#playing" },
    { id: "household", label: "Family", href: "#household" },
    { id: "notifications", label: "Notifications", href: "#notifications" },
    { id: "membership", label: "Duna Premium", href: "#membership" },
    ...(studio
      ? [{ id: "artwork", label: "Profile artwork", href: "#artwork" }]
      : []),
    { id: "data", label: "Your data", href: "#data" },
    { id: "sign-out", label: "Sign out", href: "#sign-out" },
  ];
  return (
    <div className="pp-settings">
      <SectionNav
        className="pp-settings__nav"
        groups={[{ items }]}
        label="Settings"
      />
      <div className="pp-settings__body">
        <OfflineNotice />
        <ProfileSection settings={settings} />
        <PrivacySection settings={settings} />
        <SettingsSection
          id="playing"
          lead="Your level and history help Duna match you with the right games. Legal names stay private."
          title="Playing profile"
        >
          <PlayingProfileForm settings={settings} />
        </SettingsSection>
        <FamilySection
          consentDisclosure={consentDisclosure}
          settings={settings}
          wallets={familyWallets}
        />
        <MessagesSection settings={settings} />
        <PremiumSection
          settings={settings}
          {...(membershipNotice ? { notice: membershipNotice } : {})}
        />
        {studio ? <ArtworkSection studio={studio} /> : null}
        <DataSection readiness={readiness} settings={settings} />
        <SignOutSection authConfigured={authConfigured} />
      </div>
    </div>
  );
}
