import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { OrganizationInvitationPanel } from "@/components/organization-invitation-panel";
import { getServerCaller } from "@/lib/api";

export const metadata = { title: "Organization invitation" };

export default async function OrganizationInvitationPage({
  params,
}: {
  readonly params: Promise<{ inviteToken: string }>;
}) {
  const { inviteToken } = await params;
  const caller = await getServerCaller();
  const invitation = await caller.public
    .playerInvitation({ inviteToken })
    .catch(() => undefined);
  if (!invitation) notFound();
  const { userId } = await auth();
  return (
    <main className="organization-invite-page">
      <OrganizationInvitationPanel
        invitation={invitation}
        inviteToken={inviteToken}
        signedIn={Boolean(userId)}
      />
    </main>
  );
}
