import { PlayerOnboarding } from "@/components/player-onboarding";
import { getServerCaller } from "@/lib/api";

export const metadata = { title: "Build your player profile" };
export const maxDuration = 300;

export default async function OnboardingPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ claimProfile?: string }>;
}) {
  const caller = await getServerCaller();
  const { claimProfile } = await searchParams;
  const settings = await caller.player.settings();
  let claimCandidate:
    | {
        id: string;
        handle: string;
        displayName: string;
        avatarUrl?: string;
        profileClaimStatus: "unclaimed" | "claim-pending";
        isProfessional: boolean;
      }
    | undefined;
  if (claimProfile) {
    try {
      const candidate = await caller.public.playerProfile({
        handle: claimProfile,
      });
      if (
        candidate.profileClaimStatus === "unclaimed" ||
        candidate.profileClaimStatus === "claim-pending"
      ) {
        claimCandidate = {
          id: candidate.id,
          handle: candidate.handle,
          displayName: candidate.displayName,
          avatarUrl: candidate.avatarUrl ?? undefined,
          profileClaimStatus: candidate.profileClaimStatus,
          isProfessional: candidate.isProfessional ?? false,
        };
      }
    } catch {
      // The normal onboarding flow remains available if the public profile
      // disappeared or is no longer claimable.
    }
  }
  return (
    <PlayerOnboarding settings={settings} claimCandidate={claimCandidate} />
  );
}
