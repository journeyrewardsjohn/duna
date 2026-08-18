import { notFound } from "next/navigation";
import { GuidedProductBuilder } from "@/components/guided-product-builder";
import { OperatorShell } from "@/components/operator-shell";
import { ProductVersionHistory } from "@/components/product-version-history";
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
  const versions = await caller.operator.catalogItemVersions({
    catalogItemId: item.id,
  });

  return (
    <OperatorShell
      active="products"
      messageDraftCount={workspace.messageDrafts.length}
      organization={dashboard.organization}
    >
      <main className="hq-page">
        {query.created === "1" && (
          <p
            className="operator-action-notice operator-action-notice--success"
            role="status"
          >
            Your private draft is ready. Continue in the same guided flow
            whenever you edit it.
          </p>
        )}
        {item.type === "event" ? (
          <p className="hq-card">
            Events continue in their dedicated event builder.
          </p>
        ) : (
          <GuidedProductBuilder initialItem={item} workspace={workspace} />
        )}
        <ProductVersionHistory catalogItemId={item.id} versions={versions} />
      </main>
    </OperatorShell>
  );
}
