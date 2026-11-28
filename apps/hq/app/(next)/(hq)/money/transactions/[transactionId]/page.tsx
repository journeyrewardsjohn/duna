import { hqHref } from "@duna/core/hq-routes";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  loadMoneyWorkspace,
  loadObligation,
  loadTransaction,
} from "@/components/money/money-data";
import { formatAmount } from "@/components/money/money-model";
import { MoneyScreen, moneyContext } from "@/components/money/money-screen";
import { BlockState } from "@/components/money/money-states";
import { ObligationSale, PaymentSale } from "@/components/money/sale-detail";

export const metadata: Metadata = { title: "Transaction" };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One sale as an open object. A Duna Pay sale record when there is one
 * (delivery, release, fees, refunds); otherwise the payment record (older
 * payments, credit orders, membership invoices).
 */
export default async function MoneyTransactionPage({
  params,
}: {
  readonly params: Promise<{ transactionId: string }>;
}) {
  const { transactionId: raw } = await params;
  let id: string;
  try {
    id = decodeURIComponent(raw);
  } catch {
    notFound();
  }
  const context = await moneyContext();
  if (context.session.access !== "operator") return null;
  const sale = uuid.test(id) ? await loadObligation(id) : undefined;
  if (sale?.state === "ok") {
    const money = await loadMoneyWorkspace();
    const fund =
      money.state === "ok"
        ? money.data.transactions.find(
            (row) => row.orderId === sale.data.orderId,
          )
        : undefined;
    const buyer = sale.data.buyer?.displayName;
    return (
      <MoneyScreen
        askLabel={`Sale: ${sale.data.title}${buyer ? ` for ${buyer}` : ""}, ${formatAmount(sale.data.gross)} (${sale.data.id})`}
        askStarters={[
          "When will this sale be paid out?",
          "What happens if I refund half of this?",
          "Why is this sale held?",
        ]}
        crumb={sale.data.title}
        header={
          <ObligationSale context={context} fund={fund} sale={sale.data} />
        }
        parentHref={hqHref("moneyTransactions")}
        tab="transactions"
        title={sale.data.title}
      >
        {null}
      </MoneyScreen>
    );
  }
  const payment = await loadTransaction(id);
  if (payment.state === "ok") {
    return (
      <MoneyScreen
        askLabel={`Payment: ${payment.data.description} from ${payment.data.buyerName} (${payment.data.id})`}
        askStarters={[
          "What was bought in this payment?",
          "Can I refund this payment?",
        ]}
        crumb={payment.data.description}
        header={<PaymentSale context={context} payment={payment.data} />}
        parentHref={hqHref("moneyTransactions")}
        tab="transactions"
        title={payment.data.description}
      >
        {null}
      </MoneyScreen>
    );
  }
  if (payment.state === "not-found" && (!sale || sale.state === "not-found"))
    notFound();
  const failure = sale && sale.state !== "not-found" ? sale : payment;
  return (
    <MoneyScreen
      askLabel="A transaction"
      askStarters={[]}
      tab="transactions"
      title="Transaction"
    >
      {failure.state === "not-found" ? null : (
        <BlockState
          canSetUp={context.canWrite}
          loaded={failure}
          organization={context.organization}
          retryHref={hqHref("moneyTransactions")}
          what="this transaction"
        />
      )}
    </MoneyScreen>
  );
}
