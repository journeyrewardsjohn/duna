import type { OrganizationPayoutReceipt } from "@duna/api";
import { formatMoney } from "@duna/core";
import {
  ArrowLeft,
  CalendarClock,
  Check,
  CircleAlert,
  Landmark,
  ReceiptText,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MoneyPageContent } from "@/components/money-page";
import { getServerCaller } from "@/lib/api";

export const metadata = { title: "Payout receipt" };

function dateTime(value: string | undefined): string {
  if (!value) return "Stripe is calculating the arrival date";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function PayoutReceiptPage({
  params,
}: {
  readonly params: Promise<{ payoutId: string }>;
}) {
  const { payoutId } = await params;
  const caller = await getServerCaller();
  let receipt: OrganizationPayoutReceipt;
  try {
    receipt = await caller.operator.payoutReceipt({ payoutId });
  } catch {
    notFound();
  }
  const failed = ["failed", "canceled"].includes(receipt.status);

  return (
    <MoneyPageContent view="balance">
      <section className="hq-card hq-card--inset money-receipt-page">
        <header>
          <Link href="/payments">
            <ArrowLeft size={16} /> Back to balance
          </Link>
          <span className={failed ? "is-failed" : ""}>
            {failed ? <CircleAlert size={16} /> : <Check size={16} />}
            {receipt.status.replaceAll("_", " ")}
          </span>
        </header>

        <div className="money-receipt-page__hero">
          <span>
            <ReceiptText size={24} /> Payout receipt
          </span>
          <h2>{formatMoney(receipt.amountMinor, receipt.currency)}</h2>
          <p>
            {failed ? "Payout update from Stripe" : "Sent toward"}{" "}
            <strong>
              {receipt.destinationName}
              {receipt.destinationLast4
                ? ` •••• ${receipt.destinationLast4}`
                : ""}
            </strong>
          </p>
          {receipt.livemode === false && <b>Stripe test mode</b>}
        </div>

        <div className="money-receipt-page__timeline">
          <article>
            <ShieldCheck size={20} />
            <span>
              <small>Requested</small>
              <strong>{dateTime(receipt.createdAt)}</strong>
              <p>Duna excluded every refund-held or uncleared transaction.</p>
            </span>
          </article>
          <article>
            <Landmark size={20} />
            <span>
              <small>Stripe payout status</small>
              <strong>{receipt.status.replaceAll("_", " ")}</strong>
              <p>
                Standard payouts can move from pending to in transit before the
                receiving bank confirms payment.
              </p>
            </span>
          </article>
          <article>
            <CalendarClock size={20} />
            <span>
              <small>Expected in the bank</small>
              <strong>{dateTime(receipt.expectedArrivalAt)}</strong>
              <p>
                This estimate comes from Stripe and accounts for weekends and
                bank holidays.
              </p>
            </span>
          </article>
        </div>

        {failed && (
          <div className="money-notice money-notice--error">
            <CircleAlert size={16} />
            {receipt.failureMessage ??
              "Stripe reported that this payout did not reach the bank."}
          </div>
        )}

        <dl className="money-receipt-page__evidence">
          <div>
            <dt>Stripe payout ID</dt>
            <dd>{receipt.stripePayoutId ?? "Awaiting Stripe reference"}</dd>
          </div>
          <div>
            <dt>Method</dt>
            <dd>{receipt.method}</dd>
          </div>
          <div>
            <dt>Currency</dt>
            <dd>{receipt.currency}</dd>
          </div>
          <div>
            <dt>Bank statement</dt>
            <dd>{receipt.statementDescriptor ?? "Set by Stripe"}</dd>
          </div>
          {receipt.traceId && (
            <div>
              <dt>Bank trace ID</dt>
              <dd>{receipt.traceId}</dd>
            </div>
          )}
          {receipt.destinationId && (
            <div>
              <dt>Stripe destination ID</dt>
              <dd>{receipt.destinationId}</dd>
            </div>
          )}
        </dl>

        <footer>
          <small>
            This receipt is backed by Stripe’s current payout status. If the
            bank reports a delay or failure, the status above changes without
            altering the original amount or destination snapshot.
          </small>
          <Link className="hq-button hq-button--primary" href="/payments">
            Done
          </Link>
        </footer>
      </section>
    </MoneyPageContent>
  );
}
