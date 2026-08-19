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
  readonly searchParams: Promise<{ draft?: string; stripe?: string }>;
}) {
  const { module } = await params;
  const { draft, stripe } = await searchParams;
  const item = operatorModules.find((entry) => entry.slug === module);
  if (!item || module === "overview") notFound();
  const caller = await getServerCaller();
  if (module === "payments" && stripe === "return") {
    try {
      await caller.operator.refreshStripeOnboarding({
        idempotencyKey: crypto.randomUUID(),
      });
    } catch (error) {
      console.error("Stripe onboarding status refresh failed.", error);
    }
  }
  const [dashboard, workspace, ticketApprovals, matches] = await Promise.all([
    caller.operator.dashboard(),
    caller.operator.workspace(),
    (async () => {
      if (
        module !== "events" &&
        module !== "leagues" &&
        module !== "payments"
      ) {
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
  const activeChild =
    module === "products"
      ? "all-products"
      : module === "events"
        ? "all-events"
        : module === "leagues"
          ? "leagues"
          : undefined;
  return (
    <OperatorShell
      active={module === "leagues" ? "events" : (module as OperatorModule)}
      activeChild={activeChild}
      messageDraftCount={workspace.messageDrafts.length}
      organization={dashboard.organization}
    >
      <ModulePanel
        dashboard={dashboard}
        focusedDraftId={draft}
        module={module as OperatorModule}
        matches={matches}
        ticketApprovals={ticketApprovals}
        workspace={workspace}
      />
    </OperatorShell>
  );
}
