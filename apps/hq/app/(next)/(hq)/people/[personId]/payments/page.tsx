import { formatMoney } from "@duna/core";
import { hqHref } from "@duna/core/hq-routes";
import { Chip } from "@duna/ui/tideline";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AccessDeniedState } from "@/lib/access-state";
import { PageSection } from "@/components/shell/page-header";
import { firstName, shortDate } from "@/components/people/people-model";
import { PersonScreen, personPage } from "@/components/people/people-screen";

export const metadata: Metadata = { title: "Payments" };

/**
 * A person › Payments: a read of what Money has for them, each payment
 * linking into Money (refunds happen there, not here). Only for roles that
 * read payments; anyone else reaching the address gets "You need access",
 * with nothing about the person's money.
 */
export default async function PersonPaymentsPage({
  params,
}: {
  readonly params: Promise<{ personId: string }>;
}) {
  const { personId } = await params;
  const found = await personPage(personId);
  if (found.kind === "missing") notFound();
  if (found.kind === "state") return found.node;
  const { page } = found;
  const { record, context } = page;
  const { row, profile } = record;
  const first = firstName(row.name);
  if (!context.canSeePayments) {
    return (
      <PersonScreen askStarters={[]} page={page} tab="payments">
        <div className="hqs-state">
          <AccessDeniedState
            area="Payments"
            grantedBy={`an owner of ${context.organization}`}
          />
        </div>
      </PersonScreen>
    );
  }
  const now = new Date(context.now);
  const currency = record.people.currency;
  const spent = row.spendMinor ?? 0;
  const refunded = profile.purchases.reduce(
    (sum, purchase) => sum + purchase.refundedMinor,
    0,
  );
  return (
    <PersonScreen
      askStarters={[
        `What has ${first} paid this year?`,
        `Has ${first} had any refunds?`,
      ]}
      page={page}
      tab="payments"
    >
      <dl aria-label={`${first}'s payments`} className="people-figures">
        <div className="people-figure">
          <dt>Lifetime spend</dt>
          <dd className="people-num">{formatMoney(spent, currency)}</dd>
        </div>
        <div className="people-figure">
          <dt>Payments</dt>
          <dd className="people-num">{profile.purchases.length}</dd>
        </div>
        <div className="people-figure">
          <dt>Refunded</dt>
          <dd className="people-num">{formatMoney(refunded, currency)}</dd>
        </div>
      </dl>
      <PageSection
        aside={
          <Link className="people-link" href={hqHref("moneyTransactions")}>
            All transactions in Money
          </Link>
        }
        flush
        id="payments"
        title="Payments"
      >
        {profile.purchases.length === 0 ? (
          <p className="people-quiet people-pad">{`${first} hasn't paid the club yet.`}</p>
        ) : (
          <ul className="people-payments">
            {profile.purchases.map((purchase) => (
              <li key={purchase.orderId}>
                <span className="people-payments__what">
                  <Link
                    className="people-link"
                    href={hqHref("moneyTransaction", {
                      transactionId: purchase.orderId,
                    })}
                  >
                    {purchase.description}
                  </Link>
                  <span className="people-quiet">
                    {shortDate(purchase.purchasedAt, context.timeZone, now)}
                  </span>
                </span>
                <span className="people-num">
                  {formatMoney(purchase.amountMinor, purchase.currency)}
                </span>
                <Chip
                  tone={
                    purchase.refundedMinor > 0
                      ? "info"
                      : purchase.status === "paid"
                        ? "positive"
                        : undefined
                  }
                >
                  {purchase.refundedMinor > 0
                    ? `${formatMoney(purchase.refundedMinor, purchase.currency)} refunded`
                    : purchase.status.replaceAll("-", " ")}
                </Chip>
              </li>
            ))}
          </ul>
        )}
      </PageSection>
      <p className="people-quiet">
        Refunds and receipts are in Money: open a payment to refund it there.
      </p>
    </PersonScreen>
  );
}
