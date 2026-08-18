import { notFound } from "next/navigation";
import { ModulePanel } from "@/components/module-panels";
import { productNavigationItems } from "@/components/navigation";
import { OperatorShell } from "@/components/operator-shell";
import { getServerCaller } from "@/lib/api";

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ productType: string }>;
}) {
  const { productType } = await params;
  const item = productNavigationItems.find(
    (candidate) => candidate.slug === productType && "productType" in candidate,
  );
  return { title: item && "title" in item ? item.title : "Products" };
}

export default async function ProductTypePage({
  params,
}: {
  readonly params: Promise<{ productType: string }>;
}) {
  const { productType } = await params;
  const item = productNavigationItems.find(
    (candidate) => candidate.slug === productType && "productType" in candidate,
  );
  if (!item || !("productType" in item)) notFound();

  const caller = await getServerCaller();
  const [dashboard, workspace] = await Promise.all([
    caller.operator.dashboard(),
    caller.operator.workspace(),
  ]);

  return (
    <OperatorShell
      active="products"
      activeChild={item.slug}
      messageDraftCount={workspace.messageDrafts.length}
      organization={dashboard.organization}
    >
      <ModulePanel
        dashboard={dashboard}
        matches={[]}
        module="products"
        pageCopy={{
          eyebrow: "Products · dedicated workspace",
          title: item.title,
          description: item.description,
        }}
        productScope={item.productType}
        ticketApprovals={[]}
        workspace={workspace}
      />
    </OperatorShell>
  );
}
