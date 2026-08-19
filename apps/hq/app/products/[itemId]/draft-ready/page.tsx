import { notFound } from "next/navigation";
import { OperatorShell } from "@/components/operator-shell";
import { ProductDraftReady } from "@/components/product-draft-ready";
import { getServerCaller } from "@/lib/api";

export const metadata = { title: "Draft saved" };

export default async function ProductDraftReadyPage({
  params,
}: {
  readonly params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  const caller = await getServerCaller();
  const [dashboard, workspace] = await Promise.all([
    caller.operator.dashboard(),
    caller.operator.workspace(),
  ]);
  const item = workspace.catalog.find((candidate) => candidate.id === itemId);
  if (!item || item.type === "event") notFound();
  const versions = await caller.operator.catalogItemVersions({
    catalogItemId: item.id,
  });

  return (
    <OperatorShell
      active="products"
      messageDraftCount={workspace.messageDrafts.length}
      organization={dashboard.organization}
    >
      <ProductDraftReady
        currency={workspace.organization.currency}
        currentVersion={versions.find((version) => version.current)?.version}
        item={item}
      />
    </OperatorShell>
  );
}
