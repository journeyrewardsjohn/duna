import { PlayerOnboarding } from "@/components/player-onboarding";
import { getServerCaller } from "@/lib/api";

export const metadata = { title: "Build your player profile" };
export const maxDuration = 300;

export default async function OnboardingPage() {
  const caller = await getServerCaller();
  const settings = await caller.player.settings();
  return <PlayerOnboarding settings={settings} />;
}
