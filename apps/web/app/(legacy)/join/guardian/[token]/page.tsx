import { GUARDIAN_CONSENT_DISCLOSURE } from "@duna/api";
import { isWorkOSAuthKitConfigured } from "@duna/api/workos-environment";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { notFound } from "next/navigation";
import { GuardianInvitationPanel } from "@/components/guardian-invitation-panel";
import { getServerCaller } from "@/lib/api";

export const metadata = { title: "Guardian invitation" };

export default async function GuardianInvitationPage({
  params,
}: {
  readonly params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const caller = await getServerCaller();
  const invitation = await caller.public
    .guardianInvitation({ token })
    .catch(() => undefined);
  if (!invitation) notFound();
  const signedIn = isWorkOSAuthKitConfigured()
    ? Boolean((await withAuth()).user)
    : true;

  return (
    <main className="organization-invite-page" data-zone="operator">
      <GuardianInvitationPanel
        consentDisclosure={GUARDIAN_CONSENT_DISCLOSURE}
        invitation={invitation}
        signedIn={signedIn}
        token={token}
      />
    </main>
  );
}
