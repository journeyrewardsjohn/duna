import type { OrganizationMoneyWorkspace } from "@duna/api";
import { hqHref } from "@duna/core/hq-routes";
import { Button, EmptyFirstUse } from "@duna/ui/tideline";
import { PageSection } from "../shell/page-header";
import {
  loadMoneyWorkspace,
  loadObligation,
  loadObligations,
  loadPayoutSettings,
} from "./money-data";
import {
  formatAmount,
  formatClubDate,
  formatClubDay,
  payoutRhythm,
  payoutStatusCopy,
  trancheStatusCopy,
} from "./money-model";
import { Amount, MoneyRow, Quiet, StateChip } from "./money-parts";
import type { MoneyContext } from "./money-screen";
import { BlockState } from "./money-states";
import { PayoutSettingsForm } from "./payout-settings-form";

type Payout = OrganizationMoneyWorkspace["payouts"][number];

export function payoutAmount(payout: Payout): string {
  return formatAmount({
    amountMinor: payout.amountMinor,
    currency: payout.currency,
  });
}

export function bankLabel(
  money: OrganizationMoneyWorkspace | undefined,
): string {
  const connect = money?.connect;
  return connect?.bankLast4
    ? `${connect.bankName ?? "Your bank"} ending ${connect.bankLast4}`
    : "your payout bank";
}

/** The schedule and statement names, as a sentence form (DP-Payouts). */
export async function PayoutSchedule({
  context,
}: {
  readonly context: MoneyContext;
  readonly returnHref?: string;
}) {
  const [settings, money] = await Promise.all([
    loadPayoutSettings(),
    loadMoneyWorkspace(),
  ]);
  return (
    <PageSection id="payout-schedule" title="Schedule and statements">
      {settings.state !== "ok" ? (
        <BlockState
          canSetUp={context.canWrite}
          feature="Payout schedule"
          loaded={settings}
          organization={context.organization}
          what="the payout schedule"
        />
      ) : (
        <PayoutSettingsForm
          bank={bankLabel(money.state === "ok" ? money.data : undefined)}
          canWrite={context.canWrite}
          value={{
            interval: settings.data.interval,
            weeklyDay: settings.data.weeklyDay,
            monthlyDay: settings.data.monthlyDay,
            minimumPayoutMinor: settings.data.minimumPayout.amountMinor,
            currency: settings.data.minimumPayout.currency,
            statementDescriptor: settings.data.statementDescriptor,
            payoutStatementDescriptor: settings.data.payoutStatementDescriptor,
            syncStatus: settings.data.syncStatus,
          }}
        />
      )}
    </PageSection>
  );
}

/** Every payout, newest first, with its state and arrival. */
export async function PayoutsList({
  context,
}: {
  readonly context: MoneyContext;
}) {
  const [money, payoutSettings] = await Promise.all([
    loadMoneyWorkspace(),
    loadPayoutSettings(),
  ]);
  if (money.state !== "ok") {
    return (
      <PageSection flush id="payouts-list" title="Payouts">
        <BlockState
          canSetUp={context.canWrite}
          feature="Payouts"
          loaded={money}
          organization={context.organization}
          retryHref={hqHref("moneyPayouts")}
          what="your payouts"
        />
      </PageSection>
    );
  }
  const { payouts, settings } = money.data;
  const rhythm =
    payoutSettings.state === "ok"
      ? payoutRhythm(payoutSettings.data)
      : payoutRhythm({
          interval: settings.payoutInterval,
          weeklyDay: settings.weeklyPayoutDay,
          monthlyDay: settings.monthlyPayoutDay,
        });
  return (
    <PageSection
      aside={<span className="td-meta">{rhythm}</span>}
      flush
      id="payouts-list"
      title="Payouts"
    >
      {payouts.length === 0 ? (
        <EmptyFirstUse
          action={
            <Button href={hqHref("moneyDunaPay")} size="sm" variant="secondary">
              Check Duna Pay setup
            </Button>
          }
          description="Once a sale has been delivered and its money has cleared, it's paid out to your bank on your schedule. Each payout shows here with the sales in it."
          icon="wallet"
          title="No payouts yet"
        />
      ) : (
        <ul className="money-list" aria-label="Payouts">
          {payouts.map((payout) => {
            const copy = payoutStatusCopy(payout.status);
            return (
              <MoneyRow
                amount={<Amount>{payoutAmount(payout)}</Amount>}
                href={hqHref("moneyPayout", { payoutId: payout.id })}
                key={payout.id}
                meta={
                  payout.status === "failed"
                    ? copy.sentence
                    : payout.expectedArrivalAt
                      ? `${payout.status === "paid" ? "Arrived" : "Arrives"} ${formatClubDate(payout.expectedArrivalAt, context.timeZone)}`
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

export interface PayoutSale {
  readonly obligationId: string;
  readonly title: string;
  readonly buyer?: string;
  readonly trancheId: string;
  readonly kind: string;
  readonly status: Parameters<typeof trancheStatusCopy>[0];
  readonly amount: { readonly amountMinor: number; readonly currency: string };
}

/** How many sales a payout page reads to find its portions (see Needs API). */
const PAYOUT_SCAN_LIMIT = 30;

/**
 * The sales in a payout, by portion, from Duna's payout ledger: each paid-out
 * portion names its payout. Reads the most recent sales that have paid out
 * anything; `complete` is false when more may exist than were read.
 */
export async function payoutSales(payoutId: string): Promise<{
  readonly sales: PayoutSale[];
  readonly complete: boolean;
  readonly state: "ok" | "unavailable";
}> {
  const obligations = await loadObligations();
  if (obligations.state !== "ok")
    return { sales: [], complete: false, state: "unavailable" };
  const candidates = obligations.data.items.filter(
    (item) => item.released.amountMinor > 0,
  );
  const scanned = candidates.slice(0, PAYOUT_SCAN_LIMIT);
  const details = await Promise.all(
    scanned.map((item) => loadObligation(item.id)),
  );
  const sales: PayoutSale[] = [];
  for (const detail of details) {
    if (detail.state !== "ok") continue;
    for (const tranche of detail.data.tranches) {
      if (tranche.payoutId !== payoutId) continue;
      sales.push({
        obligationId: detail.data.id,
        title: detail.data.title,
        buyer: detail.data.buyer?.displayName,
        trancheId: tranche.id,
        kind: tranche.kind,
        status: tranche.status,
        amount: tranche.amount,
      });
    }
  }
  return {
    sales,
    complete:
      candidates.length <= PAYOUT_SCAN_LIMIT && !obligations.data.nextCursor,
    state: "ok",
  };
}

const trancheKindLabel: Record<string, string> = {
  full: "Whole sale",
  "session-share": "One session's share",
  "weekly-portion": "One week's portion",
  "start-tranche": "Start payment",
  "membership-period": "Membership period",
  "reserve-remainder": "Reserve released",
};

export function trancheKind(kind: string): string {
  return trancheKindLabel[kind] ?? "Part of the sale";
}

/** The sales a payout paid, by portion. */
export function PayoutSalesList({
  sales,
  complete,
}: {
  readonly sales: readonly PayoutSale[];
  readonly complete: boolean;
}) {
  if (sales.length === 0) {
    return (
      <Quiet>
        {complete
          ? "Duna's payout ledger has no sales recorded for this payout. Payouts made before Duna Pay's ledger started don't list their sales."
          : "No recent sale names this payout. Older sales aren't listed here yet."}
      </Quiet>
    );
  }
  return (
    <>
      <ul className="money-list" aria-label="Sales in this payout">
        {sales.map((sale) => (
          <MoneyRow
            amount={<Amount>{formatAmount(sale.amount)}</Amount>}
            href={hqHref("moneyTransaction", {
              transactionId: sale.obligationId,
            })}
            key={sale.trancheId}
            meta={[sale.buyer, trancheKind(sale.kind)]
              .filter(Boolean)
              .join(" · ")}
            state={<StateChip copy={trancheStatusCopy(sale.status)} />}
            title={sale.title}
          />
        ))}
      </ul>
      {complete ? null : (
        <Quiet>Showing the sales found among your most recent ones.</Quiet>
      )}
    </>
  );
}
