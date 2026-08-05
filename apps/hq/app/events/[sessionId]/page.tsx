import { notFound } from "next/navigation";
import { EventOperationsWorkspace } from "@/components/event-operations-workspace";
import { OperatorShell } from "@/components/operator-shell";
import { getServerCaller } from "@/lib/api";

export const metadata = { title: "Session operations" };

export default async function EventOperationsPage({
  params,
}: {
  readonly params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const caller = await getServerCaller();
  const [dashboard, workspace] = await Promise.all([
    caller.operator.dashboard(),
    caller.operator.workspace(),
  ]);
  if (!workspace.sessions.some((session) => session.id === sessionId)) {
    notFound();
  }
  const detail = await caller.operator.sessionDetail({ sessionId });
  return (
    <OperatorShell
      active="events"
      messageDraftCount={workspace.messageDrafts.length}
      organization={dashboard.organization}
    >
      <EventOperationsWorkspace
        detail={detail}
        liveKitConfigured={Boolean(
          process.env.LIVEKIT_URL &&
          process.env.LIVEKIT_API_KEY &&
          process.env.LIVEKIT_API_SECRET,
        )}
        workspace={workspace}
      />
    </OperatorShell>
  );
}
