import { Badge } from "@duna/ui";
import { notFound } from "next/navigation";
import { MoneyPageContent } from "@/components/money-page";
import { getServerCaller } from "@/lib/api";
function money(value: number | undefined, currency: string) {
  if (value === undefined) return "Not available";
  return new Intl.NumberFormat("en-US", {
    style: "currency" as const,
    currency,
  }).format(value / 100);
}
function tone(status: string) {
  return /failed|declined|overdue|disputed|cancelled/i.test(status)
    ? "danger"
    : /pending|processing|scheduled/i.test(status)
      ? "warning"
      : /paid|succeeded|complete|available|recovered/i.test(status)
        ? "positive"
        : "neutral";
}
export default async function TransactionDetailPage({
  params,
}: {
  readonly params: Promise<{ transactionId: string }>;
}) {
  const { transactionId } = await params;
  const caller = await getServerCaller();
  try {
    const transaction = await caller.operator.transaction({ transactionId });
    return (
      <MoneyPageContent view="transactions">
        <header className="hq-page-heading">
          <div>
            <span className="hq-eyebrow">
              <Badge tone={tone(transaction.status)}>
                {transaction.status}
              </Badge>{" "}
              · {transaction.source}
            </span>
            <h1>{transaction.description}</h1>
            <p>
              {transaction.buyerName} ·{" "}
              {new Date(transaction.occurredAt).toLocaleString()}
            </p>
          </div>
        </header>
        <section className="module-card">
          <h2>Amounts</h2>
          {transaction.amountStatus === "partial" && (
            <p>
              Some fee or net fields are not available from this source. Duna
              leaves them blank instead of estimating them.
            </p>
          )}
          <dl>
            <dt>Gross</dt>
            <dd>{money(transaction.grossMinor, transaction.currency)}</dd>
            <dt>Processing fees</dt>
            <dd>
              {money(transaction.processingFeeMinor, transaction.currency)}
            </dd>
            <dt>Organization fees</dt>
            <dd>
              {money(transaction.organizationFeeMinor, transaction.currency)}
            </dd>
            <dt>Tax</dt>
            <dd>{money(transaction.taxMinor, transaction.currency)}</dd>
            <dt>Discounts</dt>
            <dd>{money(transaction.discountMinor, transaction.currency)}</dd>
            <dt>Refunded</dt>
            <dd>{money(transaction.refundMinor, transaction.currency)}</dd>
            <dt>Disputed</dt>
            <dd>{money(transaction.disputedMinor, transaction.currency)}</dd>
            <dt>Net</dt>
            <dd>{money(transaction.netMinor, transaction.currency)}</dd>
          </dl>
        </section>
        <section className="module-card">
          <h2>Timeline</h2>
          <ol>
            {transaction.timeline.map((entry) => (
              <li key={`${entry.at}-${entry.label}`}>
                <strong>{entry.label}</strong>
                <small>
                  {entry.detail} · {new Date(entry.at).toLocaleString()}
                </small>
              </li>
            ))}
          </ol>
        </section>
      </MoneyPageContent>
    );
  } catch {
    notFound();
  }
}
