import { notFound } from "next/navigation";
import { MemberProfileWorkspace } from "@/components/member-profile-workspace";
import { OperatorShell } from "@/components/operator-shell";
import { getServerCaller } from "@/lib/api";

export const metadata = { title: "Member profile" };

export default async function MemberProfilePage({
  params,
}: {
  readonly params: Promise<{ personId: string }>;
}) {
  const { personId } = await params;
  const caller = await getServerCaller();
  const [dashboard, workspace, profile] = await Promise.all([
    caller.operator.dashboard(),
    caller.operator.workspace(),
    caller.operator.memberProfile({ personId }),
  ]);
  if (!workspace.people.some((person) => person.personId === personId)) {
    notFound();
  }
  return (
    <OperatorShell
      active="members"
      messageDraftCount={workspace.messageDrafts.length}
      organization={dashboard.organization}
    >
      <MemberProfileWorkspace profile={profile} workspace={workspace} />
    </OperatorShell>
  );
}
