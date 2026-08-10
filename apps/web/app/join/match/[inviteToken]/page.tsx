import { isWorkOSAuthKitConfigured } from "@duna/api/workos-environment";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { notFound } from "next/navigation";
import { MatchParticipantInvitationPanel } from "@/components/match-participant-invitation-panel";
import { getServerCaller } from "@/lib/api";

export const metadata = { title: "Your match was reported in Duna" };

export default async function MatchParticipantInvitationPage({
  params,
}: {
  readonly params: Promise<{ inviteToken: string }>;
}) {
  const { inviteToken } = await params;
  const caller = await getServerCaller();
  const invitation = await caller.public
    .matchParticipantInvitation({ inviteToken })
    .catch(() => undefined);
  if (!invitation) notFound();
  const signedIn = isWorkOSAuthKitConfigured()
    ? Boolean((await withAuth()).user)
    : true;
  return (
    <main className="organization-invite-page match-invite-page">
      <MatchParticipantInvitationPanel
        invitation={invitation}
        inviteToken={inviteToken}
        signedIn={signedIn}
      />
    </main>
  );
}
