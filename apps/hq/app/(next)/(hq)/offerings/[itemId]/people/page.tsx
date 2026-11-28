import { hqHref } from "@duna/core/hq-routes";
import type { Metadata } from "next";
import Link from "next/link";
import { CoachesForm } from "@/components/offerings/people-form";
import {
  activeCoaches,
  loadWorkspace,
} from "@/components/offerings/offerings-data";
import {
  LoadedState,
  loadOfferingPage,
  OfferingScreen,
  OfferingUnavailable,
} from "@/components/offerings/offerings-screen";
import { PageSection } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "People" };

/** People: the coaches who run it, and the players who bought it. */
export default async function OfferingPeoplePage({
  params,
}: {
  readonly params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  const result = await loadOfferingPage(itemId);
  if (result.state !== "ok") return <OfferingUnavailable result={result} />;
  const { item, context } = result.page;
  const workspace = await loadWorkspace();
  const coaches =
    workspace.state === "ok"
      ? activeCoaches(workspace.data).map((coach) => ({
          id: coach.personId,
          name: coach.displayName,
        }))
      : [];
  const customers =
    workspace.state === "ok"
      ? workspace.data.productCustomers.filter(
          (entry) => entry.catalogItemId === item.id,
        )
      : [];
  return (
    <OfferingScreen page={result.page} tab="people">
      {item.type === "service" ? (
        <PageSection id="coaches" title="Coaches">
          <CoachesForm
            canWrite={context.access.write}
            coaches={coaches}
            configuration={item.configuration}
            itemId={item.id}
            live={item.status === "active"}
            title={item.title}
          />
        </PageSection>
      ) : null}
      <PageSection id="customers" title="Who bought it" flush>
        {workspace.state !== "ok" ? (
          <LoadedState
            context={context}
            loaded={workspace}
            retryHref={hqHref("offeringPeople", { itemId })}
            what="who bought it"
          />
        ) : customers.length === 0 ? (
          <p className="pt-quiet of-pad">Nobody yet.</p>
        ) : (
          <ul className="pt-roster of-pad">
            {customers.map((customer) => (
              <li key={customer.personId}>
                <Link
                  className="of-inline-link"
                  href={hqHref("member", { personId: customer.personId })}
                >
                  {customer.displayName}
                </Link>
                <span className="pt-quiet">
                  {`${customer.purchaseCount} purchase${customer.purchaseCount === 1 ? "" : "s"} · last ${new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: context.timeZone }).format(new Date(customer.lastPurchaseAt))}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </PageSection>
    </OfferingScreen>
  );
}
