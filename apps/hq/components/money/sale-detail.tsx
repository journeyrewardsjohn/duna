import type {
  OrganizationMoneyWorkspace,
  PayObligationDetail,
} from "@duna/api";
import { hqHref } from "@duna/core/hq-routes";
import { Button, Notice, ObjectHeader } from "@duna/ui/tideline";
import { PageSection } from "../shell/page-header";
import {
  deliveryEventLabel,
  deliveryRuleCopy,
  formatAmount,
  formatClubDate,
  formatClubDateTime,
  obligationStatusCopy,
  refundableMinor,
  refundSource,
  trancheStatusCopy,
} from "./money-model";
import { Amount, Facts, MoneyRow, Quiet, StateChip } from "./money-parts";
import type { MoneyContext } from "./money-screen";
import { renderLink } from "./money-link";
import { paymentStatusLabel } from "./sales";
import { trancheKind } from "./payouts";
import { RefundPanel } from "./refund-panel";

type FundRow = OrganizationMoneyWorkspace["transactions"][number];

/** "Order 1a2b3c4d": how a sale is named to support. */
export function orderReference(orderId: string): string {
  return `Order ${orderId.slice(0, 8)}`;
}

/** The fee lines a sale's payment record returned, all-in. */
function FeeBreakdown({
  fund,
  fallback,
}: {
  readonly fund?: FundRow;
  readonly fallback: string;
}) {
  if (!fund) {
    return (
      <>
        <Facts
          items={[
            { label: "Duna fees on this sale", value: fallback, numeric: true },
          ]}
        />
        <Quiet>The fee lines for this sale aren't itemised yet.</Quiet>
      </>
    );
  }
  const money = (amountMinor: number) =>
    formatAmount({ amountMinor, currency: fund.currency });
  return (
    <Facts
      items={[
        {
          label: "The player paid",
          value: money(fund.grossMinor),
          numeric: true,
        },
        {
          label: "Player service fee (paid by the player, kept by Duna)",
          value: money(fund.consumerFeeMinor),
          numeric: true,
        },
        {
          label: "Duna platform fee",
          value: money(fund.organizationFeeMinor),
          numeric: true,
        },
        {
          label: "Card processing",
          value: money(fund.processingFeeMinor),
          numeric: true,
        },
        ...(fund.taxMinor > 0
          ? [{ label: "Sales tax", value: money(fund.taxMinor), numeric: true }]
          : []),
        ...(fund.refundedMinor > 0
          ? [
              {
                label: "Refunded",
                value: money(fund.refundedMinor),
                numeric: true,
              },
            ]
          : []),
        { label: "You receive", value: money(fund.netMinor), numeric: true },
      ]}
    />
  );
}

/** A Duna Pay sale as an open object: what was bought, delivery, release, fees, refunds. */
export function ObligationSale({
  sale,
  fund,
  context,
}: {
  readonly sale: PayObligationDetail;
  readonly fund?: FundRow;
  readonly context: MoneyContext;
}) {
  const copy = obligationStatusCopy(sale.status);
  const buyer = sale.buyer?.displayName ?? "The buyer";
  const remaining = refundableMinor({
    grossMinor: sale.gross.amountMinor,
    refundedMinor: sale.refunded.amountMinor,
  });
  const canRefund =
    context.canWrite && remaining > 0 && sale.status !== "disputed";
  return (
    <>
      <ObjectHeader
        back={{ href: hqHref("moneyTransactions"), label: "Transactions" }}
        description={`${buyer} · paid by card${sale.settledAt ? ` · ${formatClubDate(sale.settledAt, context.timeZone)}` : ""}`}
        facts={[
          { label: "Paid", value: formatAmount(sale.gross), numeric: true },
          {
            label: "Duna fees",
            value: formatAmount(sale.applicationFee),
            numeric: true,
          },
          ...(sale.tax.amountMinor > 0
            ? [{ label: "Tax", value: formatAmount(sale.tax), numeric: true }]
            : []),
          {
            label: "You receive",
            value: formatAmount(sale.proceeds),
            numeric: true,
          },
          {
            label: "Paid out so far",
            value: formatAmount(sale.released),
            numeric: true,
          },
          ...(sale.refunded.amountMinor > 0
            ? [
                {
                  label: "Refunded",
                  value: formatAmount(sale.refunded),
                  numeric: true,
                },
              ]
            : []),
        ]}
        renderLink={renderLink}
        status={{ label: copy.label, tone: copy.tone }}
        title={sale.title}
      />
      <p className="money-lead">{copy.sentence}</p>
      {sale.status === "disputed" ? (
        <Notice
          action={
            <Button href={hqHref("moneyDisputes")} size="sm" variant="primary">
              Open disputes
            </Button>
          }
          title="This payment is disputed"
          tone="attention"
        >
          Refunding is paused while the buyer's bank decides. Respond to the
          dispute instead.
        </Notice>
      ) : null}
      <div className="money-cols">
        <div className="money-col money-col--main">
          <PageSection flush id="sale-release" title="When you're paid">
            <p className="money-section-lead">
              {deliveryRuleCopy(sale.deliveryRule)}
            </p>
            {sale.tranches.length === 0 ? (
              <Quiet>Nothing is scheduled for this sale.</Quiet>
            ) : (
              <ul className="money-list" aria-label="Payout portions">
                {sale.tranches.map((tranche) => {
                  const status = trancheStatusCopy(tranche.status);
                  const when =
                    tranche.releasedAt ??
                    tranche.releasableAt ??
                    tranche.deliveredAt ??
                    tranche.deliveryDueAt;
                  return (
                    <MoneyRow
                      amount={<Amount>{formatAmount(tranche.amount)}</Amount>}
                      href={
                        tranche.payoutId
                          ? hqHref("moneyPayout", {
                              payoutId: tranche.payoutId,
                            })
                          : undefined
                      }
                      key={tranche.id}
                      meta={[
                        status.sentence,
                        formatClubDate(when, context.timeZone),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                      state={<StateChip copy={status} />}
                      title={trancheKind(tranche.kind)}
                    />
                  );
                })}
              </ul>
            )}
          </PageSection>
          <PageSection flush id="sale-delivery" title="What happened">
            {sale.deliveryEvents.length === 0 ? (
              <Quiet>
                {sale.deliveryEndsAt
                  ? `Nothing recorded yet. Delivery is expected by ${formatClubDate(sale.deliveryEndsAt, context.timeZone)}.`
                  : "Nothing recorded yet."}
              </Quiet>
            ) : (
              <ol className="money-timeline">
                {sale.deliveryEvents.map((event) => (
                  <li key={event.id}>
                    <span className="money-timeline__what">
                      {deliveryEventLabel(event.kind)}
                    </span>
                    <span className="td-meta">
                      {formatClubDateTime(event.occurredAt, context.timeZone)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </PageSection>
        </div>
        <div className="money-col">
          <PageSection id="sale-fees" title="Fees, all in">
            <FeeBreakdown
              fallback={formatAmount(sale.applicationFee)}
              fund={fund}
            />
          </PageSection>
          <PageSection id="sale-refunds" title="Refunds">
            {sale.refunds.length === 0 ? (
              <Quiet>No refunds on this sale.</Quiet>
            ) : (
              <ul
                className="money-list money-list--tight"
                aria-label="Refunds on this sale"
              >
                {sale.refunds.map((refund) => (
                  <MoneyRow
                    amount={
                      <Amount tone="out">{`−${formatAmount(refund.amount)}`}</Amount>
                    }
                    key={refund.id}
                    meta={[
                      formatClubDate(refund.createdAt, context.timeZone),
                      refund.serviceFeeKept.amountMinor > 0
                        ? `Duna kept ${formatAmount(refund.serviceFeeKept)} service fee`
                        : undefined,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    title={refundSource(refund.source)}
                  />
                ))}
              </ul>
            )}
            {canRefund ? (
              <RefundPanel
                buyerName={buyer}
                currency={sale.gross.currency}
                orderId={sale.orderId}
                paidMinor={sale.gross.amountMinor}
                reference={orderReference(sale.orderId)}
                refundableMinor={remaining}
                title={sale.title}
              />
            ) : remaining === 0 ? (
              <Quiet>Nothing is left to refund.</Quiet>
            ) : !context.canWrite ? (
              <Quiet>Only an owner can refund a sale.</Quiet>
            ) : null}
          </PageSection>
          {sale.holdIds.length > 0 ? (
            <PageSection id="sale-holds" title="Held">
              <Quiet>
                {`${sale.holdIds.length === 1 ? "A hold covers" : `${sale.holdIds.length} holds cover`} this sale, so it isn't paid out yet.`}
              </Quiet>
              <Button href={hqHref("moneyHolds")} size="sm" variant="secondary">
                See holds and reserves
              </Button>
            </PageSection>
          ) : null}
        </div>
      </div>
    </>
  );
}

export interface PaymentDetail {
  readonly id: string;
  readonly occurredAt: string;
  readonly status: string;
  readonly buyerName: string;
  readonly description: string;
  readonly currency: string;
  readonly grossMinor: number;
  readonly processingFeeMinor?: number;
  readonly organizationFeeMinor?: number;
  readonly taxMinor?: number;
  readonly refundMinor?: number;
  readonly netMinor?: number;
  readonly orderId?: string;
  readonly items: readonly {
    readonly id: string;
    readonly description: string;
    readonly quantity: number;
    readonly totalAmountMinor: number;
  }[];
  readonly processor: { readonly paymentMethod?: string };
  readonly timeline: readonly {
    readonly at: string;
    readonly label: string;
    readonly detail: string;
  }[];
}

/** A payment without a Duna Pay sale record (older payments, credit orders, invoices). */
export function PaymentSale({
  payment,
  context,
}: {
  readonly payment: PaymentDetail;
  readonly context: MoneyContext;
}) {
  const state = paymentStatusLabel(payment.status);
  const money = (amountMinor: number) =>
    formatAmount({ amountMinor, currency: payment.currency });
  const fees =
    payment.processingFeeMinor !== undefined ||
    payment.organizationFeeMinor !== undefined
      ? (payment.processingFeeMinor ?? 0) + (payment.organizationFeeMinor ?? 0)
      : undefined;
  const remaining = refundableMinor({
    grossMinor: payment.grossMinor,
    refundedMinor: payment.refundMinor ?? 0,
  });
  const paidWith = payment.processor.paymentMethod
    ? `paid by ${payment.processor.paymentMethod.replaceAll("_", " ")}`
    : undefined;
  return (
    <>
      <ObjectHeader
        back={{ href: hqHref("moneyTransactions"), label: "Transactions" }}
        description={[
          payment.buyerName,
          paidWith,
          formatClubDate(payment.occurredAt, context.timeZone),
        ]
          .filter(Boolean)
          .join(" · ")}
        facts={[
          { label: "Paid", value: money(payment.grossMinor), numeric: true },
          ...(fees !== undefined
            ? [{ label: "Fees", value: money(fees), numeric: true }]
            : []),
          ...(payment.refundMinor
            ? [
                {
                  label: "Refunded",
                  value: money(payment.refundMinor),
                  numeric: true,
                },
              ]
            : []),
          ...(payment.netMinor !== undefined
            ? [
                {
                  label: "You receive",
                  value: money(payment.netMinor),
                  numeric: true,
                },
              ]
            : []),
        ]}
        renderLink={renderLink}
        status={{ label: state.label, tone: state.tone }}
        title={payment.description}
      />
      <div className="money-cols">
        <div className="money-col money-col--main">
          <PageSection flush id="payment-items" title="What was bought">
            {payment.items.length === 0 ? (
              <Quiet>No items are recorded on this payment.</Quiet>
            ) : (
              <ul className="money-list">
                {payment.items.map((item) => (
                  <MoneyRow
                    amount={<Amount>{money(item.totalAmountMinor)}</Amount>}
                    key={item.id}
                    meta={item.quantity > 1 ? `${item.quantity} ×` : undefined}
                    title={item.description}
                  />
                ))}
              </ul>
            )}
          </PageSection>
          <PageSection flush id="payment-timeline" title="What happened">
            {payment.timeline.length === 0 ? (
              <Quiet>Nothing recorded yet.</Quiet>
            ) : (
              <ol className="money-timeline">
                {payment.timeline.map((entry, index) => (
                  <li key={`${entry.at}-${index}`}>
                    <span className="money-timeline__what">{entry.label}</span>
                    <span className="td-meta">
                      {[
                        formatClubDateTime(entry.at, context.timeZone),
                        entry.detail,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </PageSection>
        </div>
        <div className="money-col">
          <PageSection id="payment-refund" title="Refunds">
            {payment.orderId && context.canWrite && remaining > 0 ? (
              <RefundPanel
                buyerName={payment.buyerName}
                currency={payment.currency}
                orderId={payment.orderId}
                paidMinor={payment.grossMinor}
                reference={orderReference(payment.orderId)}
                refundableMinor={remaining}
                title={payment.description}
              />
            ) : (
              <Quiet>
                {!context.canWrite
                  ? "Only an owner can refund a payment."
                  : remaining === 0
                    ? "Nothing is left to refund."
                    : "This payment isn't linked to an order, so it can't be refunded here."}
              </Quiet>
            )}
          </PageSection>
        </div>
      </div>
    </>
  );
}
