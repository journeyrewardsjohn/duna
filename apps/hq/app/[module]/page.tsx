import { notFound } from "next/navigation";
import { ModulePanel } from "@/components/module-panels";
import { operatorModules, type OperatorModule } from "@/components/navigation";
import { OperatorShell } from "@/components/operator-shell";
import { getServerCaller } from "@/lib/api";

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ module: string }>;
}) {
  const { module } = await params;
  const item = operatorModules.find((entry) => entry.slug === module);
  return { title: item?.label ?? "HQ" };
}

export default async function OperatorModulePage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ module: string }>;
  readonly searchParams: Promise<{ draft?: string }>;
}) {
  const { module } = await params;
  const { draft } = await searchParams;
  const item = operatorModules.find((entry) => entry.slug === module);
  if (!item || module === "overview") notFound();
  const caller = await getServerCaller();
  const [dashboard, workspace, ticketApprovals] = await Promise.all([
    caller.operator.dashboard(),
    caller.operator.workspace(),
    caller.operator.pendingTicketApprovals(),
  ]);
  return (
    <OperatorShell
      active={module as OperatorModule}
      messageDraftCount={workspace.messageDrafts.length}
      organization={dashboard.organization}
    >
      <ModulePanel
        dashboard={dashboard}
        focusedDraftId={draft}
        module={module as OperatorModule}
        ticketApprovals={ticketApprovals}
        workspace={workspace}
      />
    </OperatorShell>
  );
}
