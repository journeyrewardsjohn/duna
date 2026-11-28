import { notFound } from "next/navigation";
import { GuidedProductBuilder } from "@/components/guided-product-builder";
import { OperatorShell } from "@/components/operator-shell";
import { getServerCaller } from "@/lib/api";

export const metadata = { title: "Revise product" };

export default async function ProductBuilderPage({
  params,
}: {
  readonly params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  const caller = await getServerCaller();
  const [dashboard, workspace, waivers] = await Promise.all([
    caller.operator.dashboard(),
    caller.operator.workspace(),
    caller.operator.waiverWorkspace(),
  ]);
  const sourceItem = workspace.catalog.find((item) => item.id === itemId);
  if (!sourceItem || sourceItem.type === "event") notFound();

  return (
    <OperatorShell
      active="products"
      messageDraftCount={workspace.messageDrafts.length}
      organization={dashboard.organization}
    >
      <GuidedProductBuilder
        initialItem={sourceItem}
        waivers={waivers}
        workspace={workspace}
      />
    </OperatorShell>
  );
}
