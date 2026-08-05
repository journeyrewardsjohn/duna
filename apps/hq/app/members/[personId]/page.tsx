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
  const [dashboard, workspace] = await Promise.all([
    caller.operator.dashboard(),
    caller.operator.workspace(),
  ]);
  if (!workspace.people.some((person) => person.personId === personId)) {
    notFound();
  }
  const profile = await caller.operator.memberProfile({ personId });
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
