import { notFound } from "next/navigation";
import { DivisionCompetitionWorkspace } from "@/components/division-competition-workspace";
import { OperatorShell } from "@/components/operator-shell";
import { getServerCaller } from "@/lib/api";

export const metadata = { title: "Division competition operations" };

export default async function DivisionCompetitionPage({
  params,
}: {
  readonly params: Promise<{ sessionId: string; divisionId: string }>;
}) {
  const { sessionId, divisionId } = await params;
  const caller = await getServerCaller();
  const [dashboard, workspace, detail] = await Promise.all([
    caller.operator.dashboard(),
    caller.operator.workspace(),
    caller.operator.divisionDetail({ divisionId }).catch(() => undefined),
  ]);
  if (!detail || detail.session.id !== sessionId) notFound();
  return (
    <OperatorShell
      active="events"
      messageDraftCount={workspace.messageDrafts.length}
      organization={dashboard.organization}
    >
      <DivisionCompetitionWorkspace detail={detail} />
    </OperatorShell>
  );
}
