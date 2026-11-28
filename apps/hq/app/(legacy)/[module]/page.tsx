import { hqOperatorModuleSlugs } from "@duna/core/hq-routes";
import { notFound } from "next/navigation";
import { ModulePanel } from "@/components/module-panels";
import {
  operatorModules,
  operatorPanelArea,
  type OperatorPanel,
} from "@/components/navigation";
import { OperatorShell } from "@/components/operator-shell";
import { getServerCaller } from "@/lib/api";

/** List pages served here: schedule, people, team, events, offerings, marketing, reports. */
function servedModule(module: string) {
  return (hqOperatorModuleSlugs as readonly string[]).includes(module)
    ? operatorModules.find((entry) => entry.slug === module)
    : undefined;
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  readonly params: Promise<{ module: string }>;
  readonly searchParams: Promise<{ type?: string }>;
}) {
  const { module } = await params;
  const { type } = await searchParams;
  if (module === "events" && type === "league") return { title: "Leagues" };
  return { title: servedModule(module)?.label ?? "HQ" };
}

export default async function OperatorModulePage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ module: string }>;
  readonly searchParams: Promise<{ draft?: string; type?: string }>;
}) {
  const { module } = await params;
  const { draft, type } = await searchParams;
  const item = servedModule(module);
  if (!item) notFound();
  // A league is an event type: /events?type=league shows the leagues panel.
  const panel: OperatorPanel =
    item.slug === "events" && type === "league" ? "leagues" : item.slug;
  const caller = await getServerCaller();
  const [dashboard, workspace, ticketApprovals, matches] = await Promise.all([
    caller.operator.dashboard(),
    caller.operator.workspace(),
    (async () => {
      if (panel !== "events" && panel !== "leagues") {
        return [];
      }
      try {
        return await caller.operator.pendingTicketApprovals();
      } catch (error) {
        // Event and league operators without payment authority can still use
        // their module; the payment queue remains default-deny and hidden.
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "FORBIDDEN"
        ) {
          return [];
        }
        throw error;
      }
    })(),
    process.env.DATABASE_URL
      ? caller.operator.scorableMatches()
      : Promise.resolve([]),
  ]);
  const activeType =
    panel === "events"
      ? "all-events"
      : panel === "leagues"
        ? "leagues"
        : undefined;
  return (
    <OperatorShell
      active={operatorPanelArea(panel)}
      messageDraftCount={workspace.messageDrafts.length}
      organization={dashboard.organization}
    >
      <ModulePanel
        activeType={activeType}
        dashboard={dashboard}
        focusedDraftId={draft}
        module={panel}
        matches={matches}
        ticketApprovals={ticketApprovals}
        workspace={workspace}
      />
    </OperatorShell>
  );
}
