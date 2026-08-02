import { notFound } from "next/navigation";
import { OperatorShell } from "@/components/operator-shell";
import { TeamMemberEditor } from "@/components/team-member-editor";
import { getServerCaller } from "@/lib/api";

export const metadata = { title: "Team profile" };

export default async function TeamMemberPage({
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
  const person = workspace.staff.find(
    (candidate) => candidate.personId === personId,
  );
  if (!person) notFound();

  return (
    <OperatorShell
      active="team"
      messageDraftCount={workspace.messageDrafts.length}
      organization={dashboard.organization}
    >
      <TeamMemberEditor person={person} />
    </OperatorShell>
  );
}
