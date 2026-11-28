import { isWorkOSAuthKitConfigured } from "@duna/api/workos-environment";
import { withAuth } from "@workos-inc/authkit-nextjs";
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
  const signedIn = isWorkOSAuthKitConfigured()
    ? Boolean((await withAuth()).user)
    : true;
  return (
    <main className="organization-invite-page" data-zone="operator">
      <OrganizationInvitationPanel
        invitation={invitation}
        inviteToken={inviteToken}
        signedIn={signedIn}
      />
    </main>
  );
}
