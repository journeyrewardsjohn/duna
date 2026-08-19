import { notFound } from "next/navigation";
import { ModulePanel } from "@/components/module-panels";
import { eventNavigationItems } from "@/components/navigation";
import { OperatorShell } from "@/components/operator-shell";
import { getServerCaller } from "@/lib/api";

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ eventType: string }>;
}) {
  const { eventType } = await params;
  const item = eventNavigationItems.find(
    (candidate) => candidate.slug === eventType && "eventKinds" in candidate,
  );
  return { title: item && "title" in item ? item.title : "Events" };
}

export default async function EventTypePage({
  params,
}: {
  readonly params: Promise<{ eventType: string }>;
}) {
  const { eventType } = await params;
  const item = eventNavigationItems.find(
    (candidate) => candidate.slug === eventType && "eventKinds" in candidate,
  );
  if (!item || !("eventKinds" in item)) notFound();

  const caller = await getServerCaller();
  const [dashboard, workspace, ticketApprovals, matches] = await Promise.all([
    caller.operator.dashboard(),
    caller.operator.workspace(),
    caller.operator.pendingTicketApprovals().catch(() => []),
    process.env.DATABASE_URL
      ? caller.operator.scorableMatches()
      : Promise.resolve([]),
  ]);

  return (
    <OperatorShell
      active="events"
      activeChild={item.slug}
      messageDraftCount={workspace.messageDrafts.length}
      organization={dashboard.organization}
    >
      <ModulePanel
        dashboard={dashboard}
        eventKinds={item.eventKinds}
        matches={matches}
        module="events"
        pageCopy={{
          eyebrow: "Events · dedicated workspace",
          title: item.title,
          description: item.description,
        }}
        ticketApprovals={ticketApprovals}
        workspace={workspace}
      />
    </OperatorShell>
  );
}
