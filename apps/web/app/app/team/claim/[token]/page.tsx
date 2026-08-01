import { notFound } from "next/navigation";
import { TeamClaimPanel } from "@/components/team-claim-panel";
import { getServerCaller } from "@/lib/api";

export const metadata = {
  title: "Join team",
  description: "Claim your place on a Duna event team.",
};

export default async function TeamClaimPage({
  params,
}: {
  readonly params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const caller = await getServerCaller();
  const claim = await caller.player
    .teamClaim({ claimToken: token })
    .catch(() => undefined);
  if (!claim) notFound();
  return <TeamClaimPanel claim={claim} claimToken={token} />;
}
