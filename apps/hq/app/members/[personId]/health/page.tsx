import { notFound } from "next/navigation";
import { MemberHealthDetails } from "@/components/member-health-details";
import { OperatorShell } from "@/components/operator-shell";
import { getServerCaller } from "@/lib/api";

export const metadata = { title: "Health details" };

export default async function MemberHealthDetailsPage({
  params,
}: {
  readonly params: Promise<{ personId: string }>;
}) {
  const { personId } = await params;
  const caller = await getServerCaller();
  const [dashboard, workspace, profile] = await Promise.all([
    caller.operator.dashboard(),
    caller.operator.workspace(),
    caller.operator.memberHealthProfile({ personId }).catch(() => undefined),
  ]);
  if (!profile) notFound();
  return (
    <OperatorShell
      active="members"
      messageDraftCount={workspace.messageDrafts.length}
      organization={dashboard.organization}
    >
      <MemberHealthDetails profile={profile} />
    </OperatorShell>
  );
}
