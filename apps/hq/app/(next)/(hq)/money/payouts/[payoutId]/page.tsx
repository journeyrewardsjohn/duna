import { hqHref } from "@duna/core/hq-routes";
import { Button, Notice, ObjectHeader } from "@duna/ui/tideline";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadMoneyWorkspace } from "@/components/money/money-data";
import {
  formatAmount,
  formatClubDate,
  payoutStatusCopy,
} from "@/components/money/money-model";
import { MoneyScreen, moneyContext } from "@/components/money/money-screen";
import { BlockState } from "@/components/money/money-states";
import { renderLink } from "@/components/money/money-link";
import {
  bankLabel,
  payoutAmount,
  payoutSales,
  PayoutSalesList,
} from "@/components/money/payouts";
import { PageSection } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Payout" };

/**
 * One payout as an open object: its amount, state, bank and arrival, what
 * to do when it failed, and the sales it paid, by portion.
 */
export default async function MoneyPayoutPage({
  params,
}: {
  readonly params: Promise<{ payoutId: string }>;
}) {
  const { payoutId } = await params;
  const context = await moneyContext();
  if (context.session.access !== "operator") return null;
  const [money, ledger] = await Promise.all([
    loadMoneyWorkspace(),
    payoutSales(payoutId),
  ]);
  const payout =
    money.state === "ok"
      ? money.data.payouts.find((candidate) => candidate.id === payoutId)
      : undefined;
  if (money.state === "ok" && !payout && ledger.sales.length === 0) notFound();
  const copy = payout ? payoutStatusCopy(payout.status) : undefined;
  const bank = bankLabel(money.state === "ok" ? money.data : undefined);
  const amount = payout
    ? payoutAmount(payout)
    : ledger.sales.length > 0
      ? formatAmount({
          amountMinor: ledger.sales.reduce(
            (sum, sale) => sum + sale.amount.amountMinor,
            0,
          ),
          currency: ledger.sales[0]!.amount.currency,
        })
      : undefined;
  const created = payout
    ? formatClubDate(payout.createdAt, context.timeZone)
    : undefined;
  return (
    <MoneyScreen
      askLabel={`Payout${amount ? ` of ${amount}` : ""}${created ? ` created ${created}` : ""} (${payoutId})`}
      askStarters={[
        "Which sales are in this payout?",
        "When will this payout arrive?",
      ]}
      crumb={created ? `Payout of ${created}` : "Payout"}
      header={
        <ObjectHeader
          back={{ href: hqHref("moneyPayouts"), label: "Payouts" }}
          description={copy?.sentence}
          facts={[
            ...(amount
              ? [
                  {
                    label: payout ? "Amount" : "Sales total",
                    value: amount,
                    numeric: true,
                  },
                ]
              : []),
            ...(created ? [{ label: "Created", value: created }] : []),
            ...(payout?.expectedArrivalAt
              ? [
                  {
                    label: payout.status === "paid" ? "Arrived" : "Expected",
                    value: formatClubDate(
                      payout.expectedArrivalAt,
                      context.timeZone,
                    ),
                  },
                ]
              : []),
            { label: "To", value: bank },
          ]}
          renderLink={renderLink}
          status={copy ? { label: copy.label, tone: copy.tone } : undefined}
          title={`Payout to ${(money.state === "ok" ? money.data.connect.bankName : undefined) ?? "your bank"}`}
        />
      }
      parentHref={hqHref("moneyPayouts")}
      tab="payouts"
      title="Payout"
    >
      {money.state !== "ok" ? (
        <BlockState
          loaded={money}
          organization={context.organization}
          what="this payout"
        />
      ) : null}
      {payout?.status === "failed" ? (
        <Notice
          action={
            <Button
              href={hqHref("moneyDunaPayPayouts")}
              size="sm"
              variant="primary"
            >
              Check the payout bank
            </Button>
          }
          title="This payout didn't reach your bank"
          tone="attention"
        >
          The money is back in your balance. It goes out with the next payout
          once the bank details are fixed. Nothing is lost.
        </Notice>
      ) : null}
      <PageSection flush id="payout-sales" title="Sales in this payout">
        {ledger.state === "unavailable" ? (
          <p className="money-quiet">
            The sales in this payout can't be listed right now. The payout
            itself is shown above.
          </p>
        ) : (
          <PayoutSalesList complete={ledger.complete} sales={ledger.sales} />
        )}
      </PageSection>
    </MoneyScreen>
  );
}
