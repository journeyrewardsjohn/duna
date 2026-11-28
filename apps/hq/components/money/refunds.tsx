import { hqHref } from "@duna/core/hq-routes";
import { Chip } from "@duna/ui/tideline";
import { PageSection } from "../shell/page-header";
import { loadMoneyWorkspace, loadObligations } from "./money-data";
import {
  formatAmount,
  formatClubDate,
  obligationStatusCopy,
} from "./money-model";
import { Amount, MoneyRow, Quiet, StateChip } from "./money-parts";
import type { MoneyContext } from "./money-screen";
import { BlockState } from "./money-states";
import { RefundPolicyForm } from "./refund-policy-form";

/** Refunds given, newest sales first, from the sale records. */
export async function RefundHistory({
  context,
}: {
  readonly context: MoneyContext;
}) {
  const obligations = await loadObligations();
  return (
    <PageSection
      aside={
        <a
          className="money-link"
          href={`${hqHref("moneyTransactions")}?refund=1`}
        >
          Refund a sale
        </a>
      }
      flush
      id="refund-history"
      title="Refunds given"
    >
      {obligations.state !== "ok" ? (
        <BlockState
          canSetUp={context.canWrite}
          feature="Refund history"
          loaded={obligations}
          organization={context.organization}
          what="refunds"
        />
      ) : (
        (() => {
          const refunded = obligations.data.items.filter(
            (item) => item.refunded.amountMinor > 0,
          );
          if (refunded.length === 0) {
            return (
              <Quiet>
                No refunds yet. To refund someone, open the sale in Transactions
                and choose Refund this sale.
              </Quiet>
            );
          }
          return (
            <ul aria-label="Refunds given" className="money-list">
              {refunded.map((item) => (
                <MoneyRow
                  amount={
                    <Amount tone="out">{`−${formatAmount(item.refunded)}`}</Amount>
                  }
                  href={hqHref("moneyTransaction", { transactionId: item.id })}
                  key={item.id}
                  meta={[
                    item.buyer?.displayName,
                    `of ${formatAmount(item.gross)} paid`,
                    formatClubDate(item.settledAt, context.timeZone),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  state={<StateChip copy={obligationStatusCopy(item.status)} />}
                  title={item.title}
                />
              ))}
            </ul>
          );
        })()
      )}
    </PageSection>
  );
}

function policyWindow(minutes: number | undefined): string {
  if (minutes === undefined) return "Refundable before the start";
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return `Refundable until ${days} ${days === 1 ? "day" : "days"} before the start`;
  }
  const hours = Math.round(minutes / 60);
  return `Refundable until ${hours} ${hours === 1 ? "hour" : "hours"} before the start`;
}

/** The club's refund policies, and adding one. */
export async function RefundPolicies({
  context,
}: {
  readonly context: MoneyContext;
}) {
  const money = await loadMoneyWorkspace();
  return (
    <PageSection id="refund-policies" title="Refund policies">
      {money.state !== "ok" ? (
        <BlockState
          loaded={money}
          organization={context.organization}
          what="refund policies"
        />
      ) : (
        <>
          {money.data.refundPolicies.length === 0 ? (
            <Quiet>
              No policy yet. Until you add one, players see “[club policy]”
              where your terms will go.
            </Quiet>
          ) : (
            <ul aria-label="Refund policies" className="money-policies">
              {money.data.refundPolicies.map((policy) => (
                <li key={policy.id}>
                  <div className="money-policies__head">
                    <strong>{policy.name}</strong>
                    {policy.isDefault ? <Chip tone="info">Default</Chip> : null}
                    {!policy.active ? <Chip>Retired</Chip> : null}
                  </div>
                  <span className="td-meta">
                    {policy.mode === "non-refundable"
                      ? "Not refundable"
                      : policyWindow(policy.refundBeforeMinutes)}
                    {` · version ${policy.version}`}
                  </span>
                  <p className="money-policies__terms">{policy.terms}</p>
                </li>
              ))}
            </ul>
          )}
          {context.canWrite ? (
            <RefundPolicyForm organization={context.organization} />
          ) : null}
        </>
      )}
    </PageSection>
  );
}
