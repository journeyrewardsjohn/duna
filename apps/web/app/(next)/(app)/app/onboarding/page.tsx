import "@/components/player/player.css";

import type { Metadata } from "next";
import { getServerCaller } from "@/lib/api";
import { OnboardingFlow } from "@/components/player/onboarding/onboarding-flow";
import { loadSettingsPage } from "@/components/player/settings/settings-data";
import { ReadFailed } from "@/components/player/states";

export const metadata: Metadata = { title: "Set up your profile" };
export const maxDuration = 300;

/**
 * Set up your profile (`/app/onboarding`, P-WEB-1): who it is for, the
 * playing story, then the details. `?claimProfile=handle` starts a claim of
 * an existing unclaimed profile (when it is still claimable).
 */
export default async function OnboardingPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly claimProfile?: string }>;
}) {
  const [{ claimProfile }, loaded] = await Promise.all([
    searchParams,
    loadSettingsPage(),
  ]);
  const head = (
    <header className="pp-head">
      <div className="pp-head__text">
        <h1 className="td-display pp-title">Set up your profile</h1>
        <p className="td-lead">
          Three short steps. Each one can wait: you can finish later from
          Settings.
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
          what="Setup"
        />
      </div>
    );
  }
  let claimHandle: string | undefined;
  if (claimProfile) {
    const candidate = await (
      await getServerCaller()
    ).public
      .playerProfile({ handle: claimProfile })
      .catch(() => undefined);
    if (
      candidate &&
      (candidate.profileClaimStatus === "unclaimed" ||
        candidate.profileClaimStatus === "claim-pending")
    ) {
      claimHandle = candidate.handle;
    }
  }
  return (
    <div className="pp pp--narrow">
      {head}
      <OnboardingFlow
        {...(claimHandle ? { claimHandle } : {})}
        settings={loaded.value.settings}
      />
    </div>
  );
}
