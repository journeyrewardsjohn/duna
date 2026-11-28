import { hqOperatorModuleSlugs } from "@duna/core/hq-routes";
import { notFound } from "next/navigation";
import { ModulePanel } from "@/components/module-panels";
import { operatorModules, operatorPanelArea } from "@/components/navigation";
import { OperatorShell } from "@/components/operator-shell";
import { getServerCaller } from "@/lib/api";

/** List pages served here: marketing and reports (Events moved to app/(next)). */
function servedModule(module: string) {
  return (hqOperatorModuleSlugs as readonly string[]).includes(module)
    ? operatorModules.find((entry) => entry.slug === module)
    : undefined;
}

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ module: string }>;
}) {
  const { module } = await params;
  return { title: servedModule(module)?.label ?? "HQ" };
}

export default async function OperatorModulePage({
  params,
}: {
  readonly params: Promise<{ module: string }>;
}) {
  const { module } = await params;
  const item = servedModule(module);
  if (!item) notFound();
  const caller = await getServerCaller();
  const [dashboard, workspace] = await Promise.all([
    caller.operator.dashboard(),
    caller.operator.workspace(),
  ]);
  return (
    <OperatorShell
      active={operatorPanelArea(item.slug)}
      messageDraftCount={workspace.messageDrafts.length}
      organization={dashboard.organization}
    >
      <ModulePanel
        dashboard={dashboard}
        module={item.slug}
        workspace={workspace}
      />
    </OperatorShell>
  );
}
