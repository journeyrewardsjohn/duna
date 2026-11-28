import { isWorkOSAuthKitConfigured } from "@duna/api/workos-environment";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { notFound } from "next/navigation";
import { TeamInvitationPanel } from "@/components/team-invitation-panel";
import { getServerCaller } from "@/lib/api";

export const metadata = { title: "Team invitation" };

export default async function TeamInvitationPage({
  params,
}: {
  readonly params: Promise<{ inviteToken: string }>;
}) {
  const { inviteToken } = await params;
  const caller = await getServerCaller();
  const invitation = await caller.public
    .staffInvitation({ inviteToken })
    .catch(() => undefined);
  if (!invitation) notFound();
  const signedIn = isWorkOSAuthKitConfigured()
    ? Boolean((await withAuth()).user)
    : true;
  return (
    <main className="organization-invite-page" data-zone="operator">
      <TeamInvitationPanel
        invitation={invitation}
        inviteToken={inviteToken}
        signedIn={signedIn}
      />
    </main>
  );
}
