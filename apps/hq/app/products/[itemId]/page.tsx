import { notFound } from "next/navigation";
import { CatalogItemEditor } from "@/components/catalog-item-editor";
import { OperatorShell } from "@/components/operator-shell";
import { getServerCaller } from "@/lib/api";

export const metadata = { title: "Edit product" };

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ itemId: string }>;
  readonly searchParams: Promise<{ created?: string }>;
}) {
  const { itemId } = await params;
  const query = await searchParams;
  const caller = await getServerCaller();
  const [dashboard, workspace] = await Promise.all([
    caller.operator.dashboard(),
    caller.operator.workspace(),
  ]);
  const item = workspace.catalog.find((candidate) => candidate.id === itemId);
  if (!item) notFound();

  return (
    <OperatorShell
      active="products"
      messageDraftCount={workspace.messageDrafts.length}
      organization={dashboard.organization}
    >
      <CatalogItemEditor
        created={query.created === "1"}
        item={item}
        workspace={workspace}
      />
    </OperatorShell>
  );
}
