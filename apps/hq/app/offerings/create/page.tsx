import { HqCreationFlow } from "@duna/ui";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { GuidedProductBuilder } from "@/components/guided-product-builder";
import { OperatorShell } from "@/components/operator-shell";
import { getServerCaller } from "@/lib/api";

export const metadata = { title: "Create a product" };

export default async function CreateProductPage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    clone?: string;
    type?: string;
    subtype?: string;
  }>;
}) {
  const { clone, type, subtype } = await searchParams;
  const caller = await getServerCaller();
  const [dashboard, workspace] = await Promise.all([
    caller.operator.dashboard(),
    caller.operator.workspace(),
  ]);
  const source = clone
    ? workspace.catalog.find((candidate) => candidate.id === clone)
    : undefined;

  return (
    <OperatorShell
      active="products"
      messageDraftCount={workspace.messageDrafts.length}
      organization={dashboard.organization}
    >
      <HqCreationFlow
        key={JSON.stringify([
          dashboard.organization.id,
          source?.id,
          type,
          subtype,
        ])}
        title="Create offer"
        noun="offer"
        backHref="/products"
        backLabel="Offers"
        initialManual={Boolean(
          source || (type && ["service", "plan", "good"].includes(type)),
        )}
        examples={[
          "Create a private lesson with one of our coaches.",
          "Set up a monthly membership with session credits.",
          "Create a six-week junior group program.",
        ]}
      >
        <main className="hq-page operator-create-page">
          <header className="hq-page-heading operator-create-page__heading">
            <Link
              aria-label="Back to products"
              className="operator-create-page__back"
              href="/products"
            >
              <ArrowLeft aria-hidden size={20} />
            </Link>
            <div className="operator-create-page__copy">
              <span className="hq-eyebrow">Offers</span>
              <h1>{source ? `Clone ${source.title}` : "Create offer"}</h1>
              <p>
                {source
                  ? "Everything is copied into a new private draft. Make the few changes that distinguish this offer before publishing."
                  : "Set up a service, membership or product. Save a draft before publishing."}
              </p>
            </div>
          </header>
          <section className="operator-control-surface">
            <GuidedProductBuilder
              initialItem={source}
              mode={source ? "clone" : "create"}
              workspace={workspace}
            />
          </section>
        </main>
      </HqCreationFlow>
    </OperatorShell>
  );
}
