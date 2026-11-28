import { hqHref } from "@duna/core/hq-routes";
import { Button, EmptyFirstUse, Notice } from "@duna/ui/tideline";
import Link from "next/link";
import { cache } from "react";
import { PageSection } from "../shell/page-header";
import {
  loadAccount,
  loadDisputes,
  loadHolds,
  loadMoneyHome,
  loadMoneyWorkspace,
  loadObligations,
  loadPayoutSettings,
  loadRecoveries,
} from "./money-data";
import {
  accountSentence,
  accountStatusCopy,
  deadlineLabel,
  formatAmount,
  formatBps,
  formatClubDate,
  formatClubDay,
  holdReason,
  obligationStatusCopy,
  payoutRhythm,
  payoutStatusCopy,
  recoveryStatusCopy,
} from "./money-model";
import { Amount, Figure, MoneyRow, Quiet, StateChip } from "./money-parts";
import type { MoneyContext } from "./money-screen";
import { BlockState } from "./money-states";
import { RequestPayoutButton } from "./request-payout";
import { setupNext } from "./money-setup";

/** Duna Pay's state in one line, with the one next thing, when it isn't ready. */
export async function OverviewStatus({
  context,
}: {
  readonly context: MoneyContext;
}) {
  const account = await loadAccount();
  if (account.state !== "ok") return null;
  if (account.data.status === "ready") return null;
  const copy = accountStatusCopy(account.data.status);
  const next = setupNext(account.data);
  return (
    <Notice
      action={
        next.kind === "step" ? (
          <Button href={next.step.href} size="sm" variant="primary">
            {copy.next ?? next.step.label}
          </Button>
        ) : (
          <Button href={hqHref("moneyDunaPay")} size="sm" variant="secondary">
            See Duna Pay
          </Button>
        )
      }
      className="money-status"
      title={`Duna Pay: ${copy.label}`}
      tone={
        copy.tone === "danger"
          ? "danger"
          : copy.tone === "attention"
            ? "attention"
            : "info"
      }
    >
      {accountSentence(account.data, context.timeZone)}
    </Notice>
  );
}

/** What the club is owed and when: from the live balance (processor and ledger). */
export async function OverviewBalance({
  context,
  scheduleLink = true,
}: {
  readonly context: MoneyContext;
  readonly scheduleLink?: boolean;
}) {
  const [money, payoutSettings] = await Promise.all([
    loadMoneyWorkspace(),
    loadPayoutSettings(),
  ]);
  if (money.state !== "ok") {
    return (
      <PageSection id="money-balance" title="Balance">
        <BlockState
          canSetUp={context.canWrite}
          feature="Balance"
          loaded={money}
          organization={context.organization}
          retryHref={hqHref("money")}
          what="the balance"
        />
      </PageSection>
    );
  }
  const { balance, currency, settings, connect } = money.data;
  const amount = (amountMinor: number) =>
    formatAmount({ amountMinor, currency });
  const nextRelease = formatClubDate(balance.nextReleaseAt, context.timeZone);
  const bank = connect.bankLast4
    ? `${connect.bankName ?? "Your bank"} ending ${connect.bankLast4}`
    : "your payout bank";
  return (
    <section aria-label="Balance" className="money-balance">
      <div className="money-figures">
        <Figure
          id="money-available"
          label="Ready to pay out"
          note={
            payoutSettings.state === "ok"
              ? payoutRhythm(payoutSettings.data)
              : payoutRhythm({
                  interval: settings.payoutInterval,
                  weeklyDay: settings.weeklyPayoutDay,
                  monthlyDay: settings.monthlyPayoutDay,
                })
          }
          value={amount(balance.availableMinor)}
        />
        <Figure
          id="money-on-the-way"
          label="On the way to your bank"
          value={amount(balance.inTransitMinor)}
        />
        <Figure
          id="money-held"
          label="Held"
          note={
            balance.heldMinor > 0 ? (
              <Link className="money-link" href={hqHref("moneyHolds")}>
                Why it's held
              </Link>
            ) : (
              "Nothing held"
            )
          }
          value={amount(balance.heldMinor)}
        />
        <Figure
          id="money-clearing"
          label="Clearing or waiting for sessions"
          note={
            nextRelease && balance.nextReleaseMinor > 0
              ? `${amount(balance.nextReleaseMinor)} ready on ${nextRelease}`
              : undefined
          }
          value={amount(balance.pendingMinor)}
        />
      </div>
      {context.canWrite ? (
        <div className="money-balance__actions">
          {balance.availableMinor > 0 ? (
            <RequestPayoutButton
              available={amount(balance.availableMinor)}
              bank={bank}
            />
          ) : (
            <span className="money-quiet">
              Nothing is ready to pay out yet.
            </span>
          )}
          {scheduleLink ? (
            <Button href={hqHref("moneyPayouts")} size="md" variant="ghost">
              Payout schedule
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/** Anything that needs the owner: disputes with deadlines, failed payouts, money owed. */
export async function OverviewAttention({
  context,
}: {
  readonly context: MoneyContext;
}) {
  const [disputes, money, recoveries] = await Promise.all([
    loadDisputes(),
    loadMoneyWorkspace(),
    loadRecoveries(),
  ]);
  const now = new Date();
  const items: {
    key: string;
    title: string;
    meta: string;
    href: string;
    action: string;
  }[] = [];
  if (disputes.state === "ok") {
    for (const dispute of disputes.data.items) {
      if (dispute.status !== "needs-response") continue;
      const due = dispute.organizationEvidenceDueBy ?? dispute.evidenceDueBy;
      items.push({
        key: `dispute-${dispute.id}`,
        title: `Dispute: ${formatAmount(dispute.amount)}${dispute.buyer ? ` from ${dispute.buyer.displayName}` : ""}`,
        meta: due
          ? `${deadlineLabel(due, now)} · respond by ${formatClubDate(due, context.timeZone)}`
          : "Respond as soon as you can",
        href: hqHref("moneyDispute", { disputeId: dispute.id }),
        action: "Respond",
      });
    }
  }
  if (money.state === "ok") {
    for (const payout of money.data.payouts) {
      if (payout.status !== "failed") continue;
      items.push({
        key: `payout-${payout.id}`,
        title: `Payout of ${formatAmount({ amountMinor: payout.amountMinor, currency: payout.currency })} failed`,
        meta: payoutStatusCopy("failed").sentence,
        href: hqHref("moneyPayout", { payoutId: payout.id }),
        action: "Review",
      });
    }
  }
  if (recoveries.state === "ok") {
    for (const recovery of recoveries.data) {
      if (recovery.status !== "pending" && recovery.status !== "failed")
        continue;
      const copy = recoveryStatusCopy(recovery.status);
      items.push({
        key: `recovery-${recovery.id}`,
        title: `${formatAmount(recovery.amount)} owed after a refund or dispute`,
        meta: copy.sentence,
        href: hqHref("moneyHolds"),
        action: "See details",
      });
    }
  }
  const failed = [disputes, money, recoveries].find(
    (loaded) => loaded.state === "error",
  );
  return (
    <PageSection flush id="money-attention" title="Needs you">
      {items.length === 0 ? (
        failed && failed.state === "error" ? (
          <BlockState
            loaded={failed}
            organization={context.organization}
            retryHref={hqHref("money")}
            what="what needs you"
          />
        ) : (
          <Quiet>
            Nothing needs you. Disputes, failed payouts and money owed show up
            here.
          </Quiet>
        )
      ) : (
        <ul className="money-list">
          {items.map((item) => (
            <MoneyRow
              href={item.href}
              key={item.key}
              meta={item.meta}
              title={item.title}
              trailing={
                <Button href={item.href} size="sm" variant="secondary">
                  {item.action}
                </Button>
              }
            />
          ))}
        </ul>
      )}
    </PageSection>
  );
}

/** Money that is held, and why, in plain words. */
export async function OverviewHolds({
  context,
}: {
  readonly context: MoneyContext;
}) {
  const holds = await loadHolds();
  return (
    <PageSection
      aside={
        <a className="money-link" href={hqHref("moneyHolds")}>
          Holds and reserves
        </a>
      }
      flush
      id="money-held"
      title="Held, and why"
    >
      {holds.state !== "ok" ? (
        <BlockState
          loaded={holds}
          organization={context.organization}
          what="holds"
        />
      ) : holds.data.filter((hold) => hold.status === "active").length === 0 ? (
        <Quiet>
          Nothing is held. Money held for a dispute or a reserve shows here with
          the reason.
        </Quiet>
      ) : (
        <ul className="money-list">
          {holds.data
            .filter((hold) => hold.status === "active")
            .map((hold) => (
              <MoneyRow
                amount={<Amount>{formatAmount(hold.amount)}</Amount>}
                key={hold.id}
                meta={
                  hold.releaseAfter
                    ? `${holdReason(hold.kind)} Released after ${formatClubDate(hold.releaseAfter, context.timeZone)}.`
                    : holdReason(hold.kind)
                }
                title={hold.reason}
              />
            ))}
        </ul>
      )}
    </PageSection>
  );
}

/** The latest payouts, from the live payout records. */
export async function OverviewPayouts({
  context,
}: {
  readonly context: MoneyContext;
}) {
  const money = await loadMoneyWorkspace();
  return (
    <PageSection
      aside={
        <a className="money-link" href={hqHref("moneyPayouts")}>
          All payouts
        </a>
      }
      flush
      id="money-recent-payouts"
      title="Recent payouts"
    >
      {money.state !== "ok" ? (
        <BlockState
          loaded={money}
          organization={context.organization}
          what="payouts"
        />
      ) : money.data.payouts.length === 0 ? (
        <Quiet>
          No payouts yet. Your first one shows here once a sale has been
          delivered and the money has cleared.
        </Quiet>
      ) : (
        <ul className="money-list">
          {money.data.payouts.slice(0, 5).map((payout) => {
            const copy = payoutStatusCopy(payout.status);
            return (
              <MoneyRow
                amount={
                  <Amount>
                    {formatAmount({
                      amountMinor: payout.amountMinor,
                      currency: payout.currency,
                    })}
                  </Amount>
                }
                href={hqHref("moneyPayout", { payoutId: payout.id })}
                key={payout.id}
                meta={
                  payout.expectedArrivalAt
                    ? `Arrives ${formatClubDate(payout.expectedArrivalAt, context.timeZone)}`
                    : `Created ${formatClubDate(payout.createdAt, context.timeZone)}`
                }
                state={<StateChip copy={copy} />}
                title={`Payout · ${formatClubDay(payout.createdAt, context.timeZone)}`}
              />
            );
          })}
        </ul>
      )}
    </PageSection>
  );
}

/** The latest sales, as the club thinks of them. */
export async function OverviewSales({
  context,
}: {
  readonly context: MoneyContext;
}) {
  const obligations = await loadObligations();
  return (
    <PageSection
      aside={
        <a className="money-link" href={hqHref("moneyTransactions")}>
          All transactions
        </a>
      }
      flush
      id="money-recent-sales"
      title="Recent sales"
    >
      {obligations.state !== "ok" ? (
        <BlockState
          canSetUp={context.canWrite}
          feature="Sales"
          loaded={obligations}
          organization={context.organization}
          what="sales"
        />
      ) : obligations.data.items.length === 0 ? (
        <Quiet>No sales yet.</Quiet>
      ) : (
        <ul className="money-list">
          {obligations.data.items.slice(0, 5).map((sale) => (
            <MoneyRow
              amount={<Amount>{formatAmount(sale.gross)}</Amount>}
              href={hqHref("moneyTransaction", { transactionId: sale.id })}
              key={sale.id}
              meta={[
                sale.buyer?.displayName,
                formatClubDate(sale.settledAt, context.timeZone),
              ]
                .filter(Boolean)
                .join(" · ")}
              state={<StateChip copy={obligationStatusCopy(sale.status)} />}
              title={sale.title}
            />
          ))}
        </ul>
      )}
    </PageSection>
  );
}

/** This month's sales and Duna's fees, when the Money home answers. */
export async function OverviewMonth({
  context,
}: {
  readonly context: MoneyContext;
}) {
  const home = await loadMoneyHome();
  return (
    <PageSection id="money-month" title="This month">
      {home.state !== "ok" ? (
        home.state === "not-configured" ? (
          <Quiet>
            Monthly totals appear here once Duna Pay reports them for your club.
          </Quiet>
        ) : (
          <BlockState
            loaded={home}
            organization={context.organization}
            what="this month's totals"
          />
        )
      ) : (
        <dl className="money-facts">
          <div className="money-facts__item">
            <dt>Sales</dt>
            <dd className="money-amount">
              {formatAmount(home.data.thisMonth.gross)}
            </dd>
          </div>
          <div className="money-facts__item">
            <dt>Duna fees ({formatBps(home.data.thisMonth.dunaFeeBps)})</dt>
            <dd className="money-amount">
              {formatAmount(home.data.thisMonth.dunaFees)}
            </dd>
          </div>
          {home.data.thisMonth.changeBps !== undefined ? (
            <div className="money-facts__item">
              <dt>Against last month</dt>
              <dd className="money-amount">
                {home.data.thisMonth.changeBps >= 0 ? "+" : "−"}
                {formatBps(Math.abs(home.data.thisMonth.changeBps))}
              </dd>
            </div>
          ) : null}
        </dl>
      )}
    </PageSection>
  );
}

/** No sales, no payouts and nothing in the balance: the club hasn't started. */
export const isFirstUse = cache(async (): Promise<boolean> => {
  const [obligations, money] = await Promise.all([
    loadObligations(),
    loadMoneyWorkspace(),
  ]);
  return (
    obligations.state === "ok" &&
    obligations.data.items.length === 0 &&
    money.state === "ok" &&
    money.data.payouts.length === 0 &&
    money.data.balance.availableMinor === 0 &&
    money.data.balance.pendingMinor === 0 &&
    money.data.balance.heldMinor === 0 &&
    money.data.balance.inTransitMinor === 0
  );
});

/** A club with no sales and no money yet: an intentional first page. */
export async function OverviewFirstUse({
  context,
}: {
  readonly context: MoneyContext;
}) {
  const account = await loadAccount();
  const ready = account.state === "ok" && account.data.status === "ready";
  return (
    <EmptyFirstUse
      action={
        ready ? (
          <Button href={hqHref("offeringCreate")} variant="primary">
            Create something to sell
          </Button>
        ) : (
          <Button href={hqHref("moneyDunaPay")} variant="primary">
            Set up Duna Pay
          </Button>
        )
      }
      description={
        ready
          ? `When players pay ${context.organization} for bookings, lessons and events, what you're owed and when it arrives shows here.`
          : `Set up Duna Pay so players can pay ${context.organization} online. What you're owed and when it arrives then shows here.`
      }
      icon="wallet"
      title="No money in or out yet"
    />
  );
}
