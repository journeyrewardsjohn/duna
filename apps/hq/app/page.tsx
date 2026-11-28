import { OperatorOverview } from "@/components/operator-overview";
import { OperatorShell } from "@/components/operator-shell";
import { orAccessDenied } from "@/lib/access";
import { getServerCaller } from "@/lib/api";

export default async function HqPage() {
  const caller = await getServerCaller();
  const loaded = await orAccessDenied(
    "Duna HQ",
    () =>
      Promise.all([
        caller.operator.dashboard(),
        caller.operator.members(),
        caller.operator.workspace(),
        process.env.DATABASE_URL
          ? caller.operator.scorableMatches()
          : Promise.resolve([]),
      ]),
    {
      backHref:
        process.env.NEXT_PUBLIC_WEB_URL?.replace(/\/$/, "") ??
        process.env.NEXT_PUBLIC_DUNA_WEB_URL?.replace(/\/$/, "") ??
        "https://duna.coach",
      backLabel: "Open Duna",
    },
  );
  if ("denied" in loaded) return loaded.denied;
  const [dashboard, members, workspace, matches] = loaded.value;
  return (
    <OperatorShell
      active="overview"
      messageDraftCount={workspace.messageDrafts.length}
      organization={dashboard.organization}
    >
      <OperatorOverview
        dashboard={dashboard}
        matches={matches}
        members={members}
        workspace={workspace}
      />
    </OperatorShell>
  );
}
