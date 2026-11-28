import { hqHref } from "@duna/core/hq-routes";
import type { Metadata } from "next";
import { PriceForm } from "@/components/offerings/price-form";
import {
  annualPrice,
  creditPrice,
  moneyPrice,
} from "@/components/offerings/offering-model";
import { loadPlatformFees } from "@/components/offerings/offerings-data";
import {
  LoadedState,
  loadOfferingPage,
  OfferingScreen,
  OfferingUnavailable,
  SectionDenied,
} from "@/components/offerings/offerings-screen";
import { PageSection } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Price" };

/** Price: how players pay and what, with Duna's fees as Money shows them. */
export default async function OfferingPricePage({
  params,
}: {
  readonly params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  const result = await loadOfferingPage(itemId);
  if (result.state !== "ok") return <OfferingUnavailable result={result} />;
  const { item, context, rule } = result.page;
  if (!context.access.money) {
    return (
      <OfferingScreen page={result.page} tab="price">
        <SectionDenied area="Prices" context={context} />
      </OfferingScreen>
    );
  }
  const fees = await loadPlatformFees();
  const money = moneyPrice(item);
  const annual = annualPrice(item);
  return (
    <OfferingScreen page={result.page} tab="price">
      <div className="of-split">
        <div className="of-split__main">
          <PageSection id="price" title="What it costs">
            <PriceForm
              canWrite={context.access.write}
              currency={context.currency}
              hasLadder={(rule.rule?.tiers.length ?? 0) > 0}
              itemId={item.id}
              live={item.status === "active"}
              title={item.title}
              values={{
                type: item.type as "service" | "plan" | "good",
                subtype: item.subtype,
                allowCard: item.allowCard,
                allowCash: item.allowCash,
                allowCredits: item.allowCredits,
                taxable: item.taxable,
                ...(money?.amountMinor !== undefined
                  ? { priceMinor: money.amountMinor }
                  : {}),
                ...(annual?.amountMinor !== undefined
                  ? { annualPriceMinor: annual.amountMinor }
                  : {}),
                ...(creditPrice(item) !== undefined
                  ? { creditCost: creditPrice(item) }
                  : {}),
                configuration: item.configuration,
              }}
            />
          </PageSection>
        </div>
        <div className="of-split__side">
          <PageSection id="fees" title="What players pay, all in">
            {fees.state === "ok" ? (
              <dl className="pt-facts">
                <div>
                  <dt>Service fee (added for players)</dt>
                  <dd>{fees.data.serviceFeeDescription}</dd>
                </div>
                <div>
                  <dt>Duna's fee on each sale</dt>
                  <dd className="pt-num">{`${(fees.data.organizationFeeBps / 100).toFixed(2)}%`}</dd>
                </div>
                <div>
                  <dt>Card processing</dt>
                  <dd>{fees.data.processingDescription}</dd>
                </div>
              </dl>
            ) : (
              <LoadedState
                context={context}
                loaded={fees}
                retryHref={hqHref("offeringPrice", { itemId })}
                what="Duna's fees"
              />
            )}
            <p className="pt-quiet">
              The exact lines for each sale are in Money › Transactions.
            </p>
          </PageSection>
        </div>
      </div>
    </OfferingScreen>
  );
}
