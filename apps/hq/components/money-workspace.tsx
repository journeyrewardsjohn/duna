"use client";

import type { OrganizationMoneyWorkspace } from "@duna/api";
import { formatMoney } from "@duna/core";
import { Badge, Numeric } from "@duna/ui";
import {
  ArrowRight,
  ArrowUpRight,
  Banknote,
  CalendarClock,
  Check,
  CircleAlert,
  CreditCard,
  Download,
  Landmark,
  LockKeyhole,
  ReceiptText,
  RefreshCw,
  Scale,
  Search,
  ShieldCheck,
  Sparkles,
  WalletCards,
  X,
} from "lucide-react";
import { useActionState, useMemo, useState } from "react";
import {
  createManualPayoutAction,
  createRefundPolicyAction,
  updateMoneySettingsAction,
  type OperatorActionState,
} from "@/app/actions";

const initialState: OperatorActionState = { status: "idle", message: "" };
type ActivityFilter = "all" | "available" | "held" | "fees" | "refunds";
export type MoneyView =
  "balance" | "disputes" | "payout-settings" | "refund-policies";

function Notice({ state }: { readonly state: OperatorActionState }) {
  if (state.status === "idle") return null;
  return (
    <p className={`money-notice money-notice--${state.status}`} role="status">
      {state.status === "success" ? (
        <Check size={15} />
      ) : (
        <CircleAlert size={15} />
      )}
      {state.message}
    </p>
  );
}

function dateTime(value: string | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function shortDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function policyWindow(minutes: number | undefined): string {
  if (minutes === undefined) return "Funds release after payment clears";
  if (minutes % 1_440 === 0) {
    const days = minutes / 1_440;
    return `${days} day${days === 1 ? "" : "s"} before start`;
  }
  const hours = minutes / 60;
  return `${hours} hour${hours === 1 ? "" : "s"} before start`;
}

function descriptorDraft(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9 .,&+-]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 22);
}

function payoutRhythm(money: OrganizationMoneyWorkspace): string {
  const { payoutInterval, weeklyPayoutDay, monthlyPayoutDay } = money.settings;
  if (payoutInterval === "manual") return "Only when you request it";
  if (payoutInterval === "weekly") {
    return `Every ${weeklyPayoutDay[0]!.toUpperCase()}${weeklyPayoutDay.slice(1)}`;
  }
  if (payoutInterval === "monthly") return `Day ${monthlyPayoutDay} each month`;
  return "Every day when funds are eligible";
}

function chartGeometry(
  points: OrganizationMoneyWorkspace["earnings"]["points"],
) {
  const maximum = Math.max(1, ...points.map((point) => point.netMinor));
  const coordinates = points.map((point, index) => ({
    x: (index / Math.max(1, points.length - 1)) * 520,
    y: 122 - (point.netMinor / maximum) * 100,
  }));
  const path = coordinates
    .map(
      (point, index) =>
        `${index ? "L" : "M"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`,
    )
    .join(" ");
  return { path, area: `${path} L 520 132 L 0 132 Z` };
}

function exportTransactions(money: OrganizationMoneyWorkspace) {
  const header = [
    "Date",
    "Transaction",
    "Customer",
    "Gross",
    "Processing fee",
    "Duna fee",
    "Tax",
    "Refunded",
    "Net",
    "Status",
    "Available at",
  ];
  const rows = money.transactions.map((transaction) => [
    transaction.occurredAt,
    transaction.description,
    transaction.customerName,
    (transaction.grossMinor / 100).toFixed(2),
    (transaction.processingFeeMinor / 100).toFixed(2),
    (transaction.organizationFeeMinor / 100).toFixed(2),
    (transaction.taxMinor / 100).toFixed(2),
    (transaction.refundedMinor / 100).toFixed(2),
    (transaction.netMinor / 100).toFixed(2),
    transaction.status,
    transaction.availableAt ?? "",
  ]);
  const csv = [header, ...rows]
    .map((row) =>
      row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","),
    )
    .join("\n");
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `duna-money-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function MoneyHero({
  money,
  onPayout,
}: {
  readonly money: OrganizationMoneyWorkspace;
  readonly onPayout: () => void;
}) {
  const processorEarnings = money.connect.liveData
    ? money.connect.earnings30d
    : money.earnings;
  const { path, area } = chartGeometry(processorEarnings.points);
  const account =
    money.connect.bankAccounts.find((item) => item.defaultForCurrency) ??
    money.connect.bankAccounts[0];
  return (
    <section className="money-hero">
      <div className="money-hero__available">
        <span className="money-hero__label">
          <i /> Available to you
        </span>
        <Numeric>
          {formatMoney(money.balance.availableMinor, money.currency)}
        </Numeric>
        <p>
          Cleared by Stripe and outside every cancellation or refund window.
        </p>
        {money.balance.nextReleaseAt ? (
          <span className="money-hero__release">
            <CalendarClock size={15} />
            {formatMoney(money.balance.nextReleaseMinor, money.currency)}{" "}
            becomes available {dateTime(money.balance.nextReleaseAt)}
          </span>
        ) : (
          <span className="money-hero__release">
            <Check size={15} /> No scheduled refund holds are waiting to release
          </span>
        )}
        <button
          disabled={
            !money.connect.payoutsEnabled || money.balance.availableMinor <= 0
          }
          onClick={onPayout}
          type="button"
        >
          Move funds <ArrowRight size={15} />
        </button>
      </div>
      <div className="money-hero__chart">
        <span>30-day Stripe net activity</span>
        <strong>
          {formatMoney(processorEarnings.netMinor, money.currency)}
        </strong>
        <small>
          {formatMoney(processorEarnings.grossMinor, money.currency)} collected
          · {formatMoney(processorEarnings.feesMinor, money.currency)} in Stripe
          fees
        </small>
        <svg
          aria-label="Net earnings over the last 30 days"
          preserveAspectRatio="none"
          role="img"
          viewBox="0 0 520 138"
        >
          <path className="money-hero__chart-area" d={area} />
          <path className="money-hero__chart-line" d={path} />
        </svg>
        <footer>
          <span>
            {processorEarnings.points[0]
              ? shortDate(processorEarnings.points[0].date)
              : ""}
          </span>
          <span>Today</span>
        </footer>
      </div>
      <div className="money-hero__destination">
        <span>Connected payout account</span>
        <strong>
          {account
            ? `${account.name} •••• ${account.last4}`
            : "Bank connection needed"}
        </strong>
        <small>
          {account?.status === "connected"
            ? "Verified payout destination"
            : "Finish setup before requesting a payout"}
        </small>
        <div>
          <span>
            <Landmark size={16} /> Stripe standard available
          </span>
          <strong>
            {formatMoney(
              money.connect.stripeAvailableMinor ?? 0,
              money.currency,
            )}
          </strong>
          <small>
            {formatMoney(money.connect.stripePendingMinor ?? 0, money.currency)}{" "}
            pending
            {(money.connect.stripeInstantAvailableMinor ?? 0) > 0
              ? ` · ${formatMoney(
                  money.connect.stripeInstantAvailableMinor ?? 0,
                  money.currency,
                )} eligible for an instant payout in Stripe`
              : ""}
          </small>
        </div>
        {money.connect.settingsUrl ? (
          <a href={money.connect.settingsUrl} rel="noreferrer" target="_blank">
            Open Stripe account <ArrowUpRight size={14} />
          </a>
        ) : (
          <a href="/payments/setup">
            {money.connect.connected
              ? "Manage connection"
              : "Finish Stripe setup"}{" "}
            <ArrowUpRight size={14} />
          </a>
        )}
      </div>
    </section>
  );
}

function PayoutModal({
  money,
  onClose,
  payoutAction,
  payoutPending,
  payoutState,
}: {
  readonly money: OrganizationMoneyWorkspace;
  readonly onClose: () => void;
  readonly payoutAction: (payload: FormData) => void;
  readonly payoutPending: boolean;
  readonly payoutState: OperatorActionState;
}) {
  const account =
    money.connect.bankAccounts.find((item) => item.defaultForCurrency) ??
    money.connect.bankAccounts[0];
  return (
    <div className="money-modal-backdrop" role="presentation">
      <section
        aria-labelledby="payout-title"
        aria-modal="true"
        className="money-modal"
        role="dialog"
      >
        <header>
          <div>
            <span className="hq-eyebrow">Move available funds</span>
            <h2 id="payout-title">Transfer to your bank.</h2>
          </div>
          <button
            aria-label="Close payout dialog"
            onClick={onClose}
            type="button"
          >
            <X size={20} />
          </button>
        </header>
        <p>
          Duna will send only funds that Stripe has cleared and that are outside
          all cancellation windows.
        </p>
        <div className="money-modal__destination">
          <Landmark size={21} />
          <span>
            <strong>
              {account
                ? `${account.name} •••• ${account.last4}`
                : "No connected bank"}
            </strong>
            <small>
              Standard payout · arrival timing is confirmed by Stripe
            </small>
          </span>
          <Check size={18} />
        </div>
        <div className="money-modal__amount">
          <span>Amount available now</span>
          <Numeric>
            {formatMoney(money.balance.availableMinor, money.currency)}
          </Numeric>
          <small>
            {formatMoney(
              money.balance.heldMinor + money.balance.pendingMinor,
              money.currency,
            )}{" "}
            remains protected or clearing
          </small>
        </div>
        <form action={payoutAction}>
          <label className="money-check">
            <input name="confirmed" required type="checkbox" value="true" />
            <span>
              I confirm this payout to the connected destination above.
            </span>
          </label>
          <Notice state={payoutState} />
          <footer>
            <button
              className="hq-button hq-button--secondary"
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button
              className="hq-button hq-button--primary"
              disabled={
                payoutPending || !account || money.balance.availableMinor <= 0
              }
              type="submit"
            >
              {payoutPending ? "Requesting…" : "Request payout"}{" "}
              <ArrowRight size={15} />
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

export function MoneyWorkspace({
  money,
  organizationName,
  view = "balance",
}: {
  readonly money: OrganizationMoneyWorkspace;
  readonly organizationName: string;
  readonly view?: MoneyView;
}) {
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [query, setQuery] = useState("");
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [cardInfoOpen, setCardInfoOpen] = useState(false);
  const [selectedDisputeId, setSelectedDisputeId] = useState<string>();
  const [payoutInterval, setPayoutInterval] = useState(
    money.settings.payoutInterval === "daily"
      ? ("weekly" as const)
      : money.settings.payoutInterval,
  );
  const [statementDescriptor, setStatementDescriptor] = useState(
    descriptorDraft(money.settings.statementDescriptor ?? organizationName),
  );
  const [payoutDescriptor, setPayoutDescriptor] = useState(
    descriptorDraft(
      money.settings.payoutStatementDescriptor ?? `DUNA ${organizationName}`,
    ),
  );
  const [refundMode, setRefundMode] = useState<"refundable" | "non-refundable">(
    "refundable",
  );
  const [settingsState, settingsAction, settingsPending] = useActionState(
    updateMoneySettingsAction,
    initialState,
  );
  const [policyState, policyAction, policyPending] = useActionState(
    createRefundPolicyAction,
    initialState,
  );
  const [payoutState, payoutAction, payoutPending] = useActionState(
    createManualPayoutAction,
    initialState,
  );
  const filteredTransactions = useMemo(
    () =>
      money.transactions.filter((transaction) => {
        const matchesQuery =
          `${transaction.description} ${transaction.customerName} ${transaction.status}`
            .toLowerCase()
            .includes(query.trim().toLowerCase());
        const matchesFilter =
          filter === "all" ||
          (filter === "available" &&
            ["available", "payout-pending", "paid-out"].includes(
              transaction.status,
            )) ||
          (filter === "held" &&
            ["held", "pending-clearance"].includes(transaction.status)) ||
          (filter === "fees" &&
            transaction.processingFeeMinor + transaction.organizationFeeMinor >
              0) ||
          (filter === "refunds" && transaction.refundedMinor > 0);
        return matchesQuery && matchesFilter;
      }),
    [filter, money.transactions, query],
  );
  const selectedDispute = money.disputes.find(
    (dispute) => dispute.id === selectedDisputeId,
  );

  return (
    <div className="money-workspace">
      {view === "balance" && (
        <>
          <MoneyHero money={money} onPayout={() => setPayoutOpen(true)} />

          <section className="money-movement-grid">
            <button
              className="money-movement-card"
              disabled={
                !money.connect.payoutsEnabled ||
                money.balance.availableMinor <= 0
              }
              onClick={() => setPayoutOpen(true)}
              type="button"
            >
              <span>
                <Landmark size={20} />
              </span>
              <small>Withdraw</small>
              <strong>Transfer to your bank</strong>
              <p>Send eligible funds to your verified payout account.</p>
              <b>
                Request transfer <ArrowRight size={14} />
              </b>
            </button>
            <button
              className="money-movement-card money-movement-card--soon"
              onClick={() => setCardInfoOpen(true)}
              type="button"
            >
              <span>
                <CreditCard size={20} />
              </span>
              <small>Spend · Coming soon</small>
              <strong>Duna virtual card</strong>
              <p>
                Future spending from balances held by Duna—not your Stripe
                Connect balance.
              </p>
              <b>
                See what’s planned <ArrowRight size={14} />
              </b>
            </button>
            <a
              className="money-movement-card"
              href={money.connect.settingsUrl ?? "/payments/setup"}
              rel={money.connect.settingsUrl ? "noreferrer" : undefined}
              target={money.connect.settingsUrl ? "_blank" : undefined}
            >
              <span>
                <ShieldCheck size={20} />
              </span>
              <small>Stripe Connect</small>
              <strong>Manage your money account</strong>
              <p>
                Review verification, bank details, balances, and Stripe support.
              </p>
              <b>
                Open Stripe <ArrowUpRight size={14} />
              </b>
            </a>
          </section>

          <section className="money-snapshot-grid">
            <article>
              <small>Total Duna balance</small>
              <Numeric>
                {formatMoney(money.balance.totalMinor, money.currency)}
              </Numeric>
              <span>Available + protected + clearing</span>
            </article>
            <article>
              <small>Stripe pending</small>
              <Numeric>
                {formatMoney(
                  money.connect.stripePendingMinor ?? 0,
                  money.currency,
                )}
              </Numeric>
              <span>Card payments still clearing at Stripe</span>
            </article>
            <article>
              <small>Refund protected</small>
              <Numeric>
                {formatMoney(money.balance.heldMinor, money.currency)}
              </Numeric>
              <span>Releases after cancellation cutoffs</span>
            </article>
            <article>
              <small>Stripe payouts · 30 days</small>
              <Numeric>
                {formatMoney(
                  money.connect.earnings30d.payoutsMinor,
                  money.currency,
                )}
              </Numeric>
              <span>Sent from Stripe to the connected bank</span>
            </article>
          </section>

          <div className="money-ledger-layout">
            <section className="hq-card hq-card--inset money-activity-card">
              <header className="hq-card-heading">
                <div>
                  <span className="hq-eyebrow">Transaction ledger</span>
                  <h2>Every payment, fully traceable.</h2>
                  <p>
                    Gross amount, taxes, refunds, processing cost, Duna fee, and
                    payout availability stay together.
                  </p>
                </div>
                <button
                  className="hq-button hq-button--secondary"
                  onClick={() => exportTransactions(money)}
                  type="button"
                >
                  <Download size={15} /> Export CSV
                </button>
              </header>
              <div className="money-ledger-tools">
                <nav aria-label="Transaction filters">
                  {(
                    ["all", "available", "held", "fees", "refunds"] as const
                  ).map((value) => (
                    <button
                      className={filter === value ? "active" : ""}
                      key={value}
                      onClick={() => setFilter(value)}
                      type="button"
                    >
                      {value}
                    </button>
                  ))}
                </nav>
                <label>
                  <Search size={15} />
                  <input
                    aria-label="Search transactions"
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search activity"
                    value={query}
                  />
                </label>
              </div>
              <div className="money-activity-table">
                <header>
                  <span>Transaction</span>
                  <span>Gross</span>
                  <span>Fees + tax</span>
                  <span>Net</span>
                  <span>Availability</span>
                  <span>Status</span>
                </header>
                {filteredTransactions.map((transaction) => (
                  <article key={transaction.id}>
                    <span className="money-transaction-name">
                      <i>
                        <ReceiptText size={16} />
                      </i>
                      <span>
                        <strong>{transaction.description}</strong>
                        <small>
                          {transaction.customerName} ·{" "}
                          {dateTime(transaction.occurredAt)}
                        </small>
                      </span>
                    </span>
                    <Numeric>
                      {formatMoney(
                        transaction.grossMinor,
                        transaction.currency,
                      )}
                    </Numeric>
                    <span className="money-fee-stack">
                      <strong>
                        -
                        {formatMoney(
                          transaction.processingFeeMinor +
                            transaction.organizationFeeMinor +
                            transaction.taxMinor,
                          transaction.currency,
                        )}
                      </strong>
                      <small>
                        Processing{" "}
                        {formatMoney(
                          transaction.processingFeeMinor,
                          transaction.currency,
                        )}{" "}
                        · Duna{" "}
                        {formatMoney(
                          transaction.organizationFeeMinor,
                          transaction.currency,
                        )}{" "}
                        · Tax{" "}
                        {formatMoney(
                          transaction.taxMinor,
                          transaction.currency,
                        )}
                      </small>
                    </span>
                    <Numeric>
                      {formatMoney(
                        Math.max(
                          0,
                          transaction.netMinor - transaction.refundedMinor,
                        ),
                        transaction.currency,
                      )}
                    </Numeric>
                    <span>
                      <strong>{transaction.policyName}</strong>
                      <small>
                        {transaction.availableAt
                          ? dateTime(transaction.availableAt)
                          : "After settlement"}
                      </small>
                    </span>
                    <Badge
                      tone={
                        transaction.status === "available" ||
                        transaction.status === "paid-out"
                          ? "positive"
                          : transaction.status === "disputed"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {transaction.status.replaceAll("-", " ")}
                    </Badge>
                  </article>
                ))}
                {!filteredTransactions.length && (
                  <div className="hq-empty">
                    <strong>No matching transactions.</strong>
                    <span>
                      Completed Stripe payments appear here with their fees and
                      release policy.
                    </span>
                  </div>
                )}
              </div>
            </section>

            <aside className="money-side-stack">
              <section className="hq-card hq-card--inset money-payout-plan">
                <header>
                  <div>
                    <span className="hq-eyebrow">Payout plan</span>
                    <h2>Keep the rhythm you prefer.</h2>
                  </div>
                  <RefreshCw size={20} />
                </header>
                <p>
                  Eligible money follows this Duna schedule. Stripe stays on
                  manual rail payouts so refund holds remain protected.
                </p>
                <strong>{money.settings.payoutInterval}</strong>
                <span>{payoutRhythm(money)}</span>
                <div>
                  <small>Destination</small>
                  {money.connect.bankAccounts.map((account) => (
                    <article key={account.id}>
                      <Landmark size={17} />
                      <span>
                        <strong>
                          {account.name} •••• {account.last4}
                        </strong>
                        <small>
                          {account.status} ·{" "}
                          {account.currency ?? "payout currency"}
                        </small>
                      </span>
                      {account.defaultForCurrency && <Check size={15} />}
                    </article>
                  ))}
                  {!money.connect.bankAccounts.length && (
                    <article>
                      <CircleAlert size={17} />
                      <span>
                        <strong>No payout account</strong>
                        <small>Connect one securely with Stripe</small>
                      </span>
                    </article>
                  )}
                </div>
                <button
                  className="hq-button hq-button--primary"
                  disabled={
                    !money.connect.payoutsEnabled ||
                    money.balance.availableMinor <= 0
                  }
                  onClick={() => setPayoutOpen(true)}
                  type="button"
                >
                  <Landmark size={15} /> Request a payout
                </button>
              </section>
              <section className="hq-card hq-card--inset money-connect-health">
                <header>
                  <div>
                    <span className="hq-eyebrow">Stripe Connect</span>
                    <h2>
                      {money.connect.payoutsEnabled
                        ? "Account ready"
                        : "Needs attention"}
                    </h2>
                  </div>
                  <Badge
                    tone={money.connect.payoutsEnabled ? "positive" : "warning"}
                  >
                    {money.connect.liveData ? "Live" : "Preview"}
                  </Badge>
                </header>
                <div>
                  <span>
                    <CreditCard size={15} /> Card charges
                  </span>
                  <strong>
                    {money.connect.chargesEnabled ? "Enabled" : "Action needed"}
                  </strong>
                </div>
                <div>
                  <span>
                    <Banknote size={15} /> Bank payouts
                  </span>
                  <strong>
                    {money.connect.payoutsEnabled ? "Enabled" : "Action needed"}
                  </strong>
                </div>
                <div>
                  <span>
                    <ShieldCheck size={15} /> Verification
                  </span>
                  <strong>
                    {money.connect.requirementsDue.length
                      ? `${money.connect.requirementsDue.length} due`
                      : "Current"}
                  </strong>
                </div>
                {(money.connect.stripeReservedMinor ?? 0) > 0 && (
                  <p>
                    {formatMoney(
                      money.connect.stripeReservedMinor ?? 0,
                      money.currency,
                    )}{" "}
                    is reserved by Stripe and excluded from available funds.
                  </p>
                )}
              </section>
            </aside>
          </div>

          <div className="money-secondary-grid money-secondary-grid--single">
            <section className="hq-card hq-card--inset money-list-card">
              <header className="hq-card-heading">
                <div>
                  <span className="hq-eyebrow">Stripe activity</span>
                  <h2>Processor balance history</h2>
                </div>
                <ArrowUpRight size={21} />
              </header>
              {money.connect.activity.slice(0, 8).map((item) => (
                <article key={item.id}>
                  <span>
                    <strong>{item.description}</strong>
                    <small>
                      {item.reportingCategory.replaceAll("_", " ")} ·{" "}
                      {dateTime(item.occurredAt)}
                      {item.feeMinor
                        ? ` · fee ${formatMoney(item.feeMinor, money.currency)}`
                        : ""}
                    </small>
                  </span>
                  <span
                    className={
                      item.netMinor < 0 ? "money-negative" : "money-positive"
                    }
                  >
                    {item.netMinor < 0 ? "−" : "+"}
                    {formatMoney(Math.abs(item.netMinor), money.currency)}
                  </span>
                </article>
              ))}
              {!money.connect.activity.length && (
                <div className="hq-empty">
                  <strong>No Stripe balance activity yet.</strong>
                  <span>
                    Transfers, fees, refunds, and payouts will appear here
                    directly from Connect.
                  </span>
                </div>
              )}
            </section>
          </div>
        </>
      )}

      {view === "payout-settings" && (
        <section className="hq-card hq-card--inset money-settings-card money-settings-page">
          <header className="hq-card-heading">
            <div>
              <span className="hq-eyebrow">Payout + card settings</span>
              <h2>Make money movement feel like your business.</h2>
              <p>
                Choose your Duna payout cadence and the descriptions customers
                and banks recognize.
              </p>
            </div>
            <WalletCards size={24} />
          </header>
          <form action={settingsAction}>
            {money.connect.stripePayoutInterval &&
              money.connect.stripePayoutInterval !== "manual" && (
                <div className="money-rail-warning">
                  <CircleAlert size={19} />
                  <span>
                    <strong>
                      Stripe is currently paying out{" "}
                      {money.connect.stripePayoutInterval}.
                    </strong>
                    <small>
                      Saving this plan switches the Stripe rail to manual so
                      Duna can wait for refund windows and follow the schedule
                      you choose here.
                    </small>
                  </span>
                </div>
              )}
            <fieldset className="money-payout-choices">
              <legend>When should eligible money move?</legend>
              {[
                {
                  value: "weekly" as const,
                  title: "Weekly payouts",
                  detail: "Choose one weekday",
                },
                {
                  value: "monthly" as const,
                  title: "Monthly payouts",
                  detail: "Choose a day from 1–28",
                },
                {
                  value: "manual" as const,
                  title: "Only when I request it",
                  detail: "Maximum control",
                },
              ].map((option) => (
                <label
                  className={payoutInterval === option.value ? "active" : ""}
                  key={option.value}
                >
                  <input
                    checked={payoutInterval === option.value}
                    name="payoutInterval"
                    onChange={() => setPayoutInterval(option.value)}
                    type="radio"
                    value={option.value}
                  />
                  <span>
                    <strong>{option.title}</strong>
                    <small>{option.detail}</small>
                  </span>
                  <Check size={17} />
                </label>
              ))}
            </fieldset>
            <div className="money-payout-details">
              <label hidden={payoutInterval !== "weekly"}>
                <span>What day of the week?</span>
                <select
                  defaultValue={money.settings.weeklyPayoutDay}
                  name="weeklyPayoutDay"
                >
                  <option value="monday">Monday</option>
                  <option value="tuesday">Tuesday</option>
                  <option value="wednesday">Wednesday</option>
                  <option value="thursday">Thursday</option>
                  <option value="friday">Friday</option>
                </select>
              </label>
              <label hidden={payoutInterval !== "monthly"}>
                <span>What day of the month?</span>
                <input
                  defaultValue={money.settings.monthlyPayoutDay}
                  max="28"
                  min="1"
                  name="monthlyPayoutDay"
                  type="number"
                />
              </label>
              <label>
                <span>Minimum payout amount</span>
                <div className="money-input">
                  <small>$</small>
                  <input
                    defaultValue={(
                      money.settings.minimumPayoutMinor / 100
                    ).toFixed(2)}
                    min="0"
                    name="minimumPayout"
                    step="0.01"
                    type="number"
                  />
                </div>
                <small>
                  We wait until eligible funds reach this amount. Use $0 to send
                  every eligible payout.
                </small>
              </label>
            </div>

            <section className="money-descriptor-studio">
              <div className="money-descriptor-fields">
                <span className="hq-eyebrow">How your business appears</span>
                <h3>Make every line recognizable.</h3>
                <p>
                  These short labels reduce confusion for customers and help
                  your team recognize deposits.
                </p>
                <label>
                  <span>Descriptor customers see</span>
                  <input
                    maxLength={22}
                    minLength={5}
                    name="statementDescriptor"
                    onChange={(event) =>
                      setStatementDescriptor(
                        descriptorDraft(event.target.value),
                      )
                    }
                    placeholder="BEACH ELITE"
                    value={statementDescriptor}
                  />
                  <small>
                    Appears beside a card charge on the customer’s statement.
                  </small>
                </label>
                <label>
                  <span>Bank descriptor for payouts</span>
                  <input
                    maxLength={22}
                    minLength={5}
                    name="payoutStatementDescriptor"
                    onChange={(event) =>
                      setPayoutDescriptor(descriptorDraft(event.target.value))
                    }
                    placeholder="DUNA BEACH ELITE"
                    value={payoutDescriptor}
                  />
                  <small>
                    Appears on your bank account when Stripe deposits money.
                  </small>
                </label>
              </div>
              <div className="money-descriptor-preview" aria-live="polite">
                <div className="money-descriptor-preview__customer">
                  <span>Customer’s card statement</span>
                  <article>
                    <CreditCard size={20} />
                    <span>
                      <strong>{statementDescriptor || "YOUR BUSINESS"}</strong>
                      <small>Card purchase</small>
                    </span>
                    <b>−$40.00</b>
                  </article>
                </div>
                <ArrowRight size={20} />
                <div className="money-descriptor-preview__bank">
                  <span>Your bank account</span>
                  <article>
                    <Landmark size={20} />
                    <span>
                      <strong>{payoutDescriptor || "DUNA PAYOUT"}</strong>
                      <small>Stripe payout</small>
                    </span>
                    <b>+$36.45</b>
                  </article>
                </div>
                <small>
                  A customer charge and your later bank payout are two different
                  statement lines.
                </small>
              </div>
            </section>
            <Notice state={settingsState} />
            <footer>
              <small>
                Descriptor edits are synchronized to this organization’s
                connected Stripe account.
              </small>
              <button
                className="hq-button hq-button--primary"
                disabled={settingsPending}
                type="submit"
              >
                {settingsPending ? "Saving…" : "Save Money settings"}
              </button>
            </footer>
          </form>
        </section>
      )}

      {view === "refund-policies" && (
        <section className="hq-card hq-card--inset refund-policy-card refund-policy-page">
          <header className="hq-card-heading">
            <div>
              <span className="hq-eyebrow">Refund policies</span>
              <h2>Protect players and payout timing with one rule.</h2>
              <p>
                Refundable funds stay held until the cutoff. Non-refundable
                funds become eligible after Stripe clears them.
              </p>
            </div>
            <ShieldCheck size={24} />
          </header>
          <div className="refund-policy-layout">
            <div className="refund-policy-list">
              {money.refundPolicies.map((policy) => (
                <article key={policy.id}>
                  <span
                    className={
                      policy.mode === "non-refundable" ? "nonrefundable" : ""
                    }
                  >
                    {policy.mode === "non-refundable" ? (
                      <LockKeyhole size={17} />
                    ) : (
                      <CalendarClock size={17} />
                    )}
                  </span>
                  <div>
                    <strong>{policy.name}</strong>
                    <small>
                      {policyWindow(policy.refundBeforeMinutes)} · version{" "}
                      {policy.version}
                    </small>
                    <p>{policy.terms || "No additional terms."}</p>
                  </div>
                  {policy.isDefault && <Badge tone="positive">Default</Badge>}
                </article>
              ))}
            </div>
            <form action={policyAction} className="refund-policy-form">
              <span className="hq-eyebrow">New policy</span>
              <h3>Create the rule in a few choices.</h3>
              <label>
                <span>What should your team call it?</span>
                <input name="name" placeholder="Flexible · 48 hours" required />
              </label>
              <fieldset className="refund-policy-choices">
                <legend>Can customers receive a refund?</legend>
                <label className={refundMode === "refundable" ? "active" : ""}>
                  <input
                    checked={refundMode === "refundable"}
                    name="mode"
                    onChange={() => setRefundMode("refundable")}
                    type="radio"
                    value="refundable"
                  />
                  <CalendarClock size={18} />
                  <span>
                    <strong>Yes, before a cutoff</strong>
                    <small>Duna protects the funds until that deadline.</small>
                  </span>
                </label>
                <label
                  className={refundMode === "non-refundable" ? "active" : ""}
                >
                  <input
                    checked={refundMode === "non-refundable"}
                    name="mode"
                    onChange={() => setRefundMode("non-refundable")}
                    type="radio"
                    value="non-refundable"
                  />
                  <LockKeyhole size={18} />
                  <span>
                    <strong>No, this purchase is final</strong>
                    <small>Funds still wait for Stripe to clear.</small>
                  </span>
                </label>
              </fieldset>
              <div hidden={refundMode !== "refundable"}>
                <label>
                  <span>How long before start?</span>
                  <input
                    defaultValue="24"
                    min="0"
                    name="cutoffValue"
                    type="number"
                  />
                </label>
                <label>
                  <span>Unit</span>
                  <select defaultValue="hours" name="cutoffUnit">
                    <option value="hours">Hours</option>
                    <option value="days">Days</option>
                  </select>
                </label>
              </div>
              <label>
                <span>Player-facing terms</span>
                <textarea
                  name="terms"
                  placeholder="Cancel before the cutoff for an automatic refund to the original payment method."
                  rows={4}
                />
              </label>
              <label className="money-check">
                <input name="makeDefault" type="checkbox" />
                <span>
                  Make this the one default policy. The current default will
                  remain available, but will no longer be labeled Default.
                </span>
              </label>
              <Notice state={policyState} />
              <button
                className="hq-button hq-button--secondary"
                disabled={policyPending}
                type="submit"
              >
                {policyPending ? "Saving…" : "Save refund policy"}
              </button>
            </form>
          </div>
        </section>
      )}

      {view === "disputes" && (
        <section className="hq-card hq-card--inset money-disputes-page">
          <header className="money-section-intro">
            <div>
              <span className="hq-eyebrow">Disputes</span>
              <h2>Respond before money is decided.</h2>
              <p>
                These cases come directly from the connected Stripe account.
                Open one to review the amount, reason, deadline, and the safest
                next step in Stripe.
              </p>
            </div>
            <span className="money-dispute-count">
              <Scale size={18} /> {money.disputes.length} open or recent
            </span>
          </header>
          <div className="money-dispute-list">
            {money.disputes.map((dispute) => (
              <button
                key={dispute.id}
                onClick={() => setSelectedDisputeId(dispute.id)}
                type="button"
              >
                <span className="money-dispute-list__icon">
                  <Scale size={19} />
                </span>
                <span>
                  <small>{dispute.kind.replaceAll("_", " ")}</small>
                  <strong>
                    {formatMoney(dispute.amountMinor, dispute.currency)}
                  </strong>
                  <em>
                    Opened {dateTime(dispute.createdAt)}
                    {dispute.dueAt
                      ? ` · Evidence due ${dateTime(dispute.dueAt)}`
                      : ""}
                  </em>
                </span>
                <Badge
                  tone={
                    ["won", "lost", "resolved"].includes(dispute.status)
                      ? "neutral"
                      : "warning"
                  }
                >
                  {dispute.status.replaceAll("_", " ")}
                </Badge>
                <ArrowRight size={17} />
              </button>
            ))}
            {!money.disputes.length && (
              <div className="hq-empty money-dispute-empty">
                <ShieldCheck size={28} />
                <strong>No disputes need attention.</strong>
                <span>
                  New Stripe cases will appear here with their evidence
                  deadline.
                </span>
              </div>
            )}
          </div>
        </section>
      )}

      {selectedDispute && (
        <div
          className="money-modal-backdrop money-dispute-backdrop"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target)
              setSelectedDisputeId(undefined);
          }}
          role="presentation"
        >
          <aside
            aria-labelledby="dispute-sheet-title"
            aria-modal="true"
            className="money-dispute-sheet"
            role="dialog"
          >
            <header>
              <div>
                <span className="hq-eyebrow">Stripe dispute</span>
                <h2 id="dispute-sheet-title">
                  {formatMoney(
                    selectedDispute.amountMinor,
                    selectedDispute.currency,
                  )}
                </h2>
                <p>{selectedDispute.kind.replaceAll("_", " ")}</p>
              </div>
              <button
                aria-label="Close dispute details"
                onClick={() => setSelectedDisputeId(undefined)}
                type="button"
              >
                <X size={20} />
              </button>
            </header>
            <div className="money-dispute-sheet__status">
              <span>
                <small>Status</small>
                <strong>{selectedDispute.status.replaceAll("_", " ")}</strong>
              </span>
              <span>
                <small>Opened</small>
                <strong>{dateTime(selectedDispute.createdAt)}</strong>
              </span>
              <span>
                <small>Evidence deadline</small>
                <strong>
                  {selectedDispute.dueAt
                    ? dateTime(selectedDispute.dueAt)
                    : "No deadline provided"}
                </strong>
              </span>
            </div>
            <section>
              <ShieldCheck size={20} />
              <div>
                <strong>Finish the response securely in Stripe.</strong>
                <p>
                  Stripe holds the evidence form and card-network requirements.
                  Duna shows the deadline here, but does not copy sensitive
                  evidence or submit a response on your behalf.
                </p>
              </div>
            </section>
            <ol>
              <li>Open the connected Stripe account.</li>
              <li>
                Choose this dispute and review Stripe’s requested evidence.
              </li>
              <li>
                Submit before the deadline and return here to track status.
              </li>
            </ol>
            <footer>
              <button
                className="hq-button hq-button--secondary"
                onClick={() => setSelectedDisputeId(undefined)}
                type="button"
              >
                Close
              </button>
              <a
                className="hq-button hq-button--primary"
                href={money.connect.settingsUrl ?? "/payments/setup"}
                rel={money.connect.settingsUrl ? "noreferrer" : undefined}
                target={money.connect.settingsUrl ? "_blank" : undefined}
              >
                Open dispute tools in Stripe <ArrowUpRight size={15} />
              </a>
            </footer>
          </aside>
        </div>
      )}

      {payoutOpen && (
        <PayoutModal
          money={money}
          onClose={() => setPayoutOpen(false)}
          payoutAction={payoutAction}
          payoutPending={payoutPending}
          payoutState={payoutState}
        />
      )}
      {cardInfoOpen && (
        <div className="money-modal-backdrop" role="presentation">
          <section
            aria-labelledby="card-title"
            aria-modal="true"
            className="money-modal money-modal--card"
            role="dialog"
          >
            <header>
              <div>
                <span className="hq-eyebrow">Coming soon</span>
                <h2 id="card-title">A Duna balance you can spend.</h2>
              </div>
              <button
                aria-label="Close virtual card information"
                onClick={() => setCardInfoOpen(false)}
                type="button"
              >
                <X size={20} />
              </button>
            </header>
            <div className="money-card-preview">
              <Sparkles size={22} />
              <span>DUNA</span>
              <strong>•••• •••• •••• 2028</strong>
              <small>{organizationName.toUpperCase()}</small>
            </div>
            <p>
              This future virtual card will use only balances actually held by
              Duna. It will never draw from, move, or imply access to money
              sitting in the organization’s Stripe Connect balance.
            </p>
            <div className="money-coming-soon-note">
              <ShieldCheck size={18} />
              <span>
                <strong>No Stripe Issuing connection is active.</strong>
                <small>
                  This is a product preview, not an application or usable card.
                </small>
              </span>
            </div>
            <footer>
              <button
                className="hq-button hq-button--primary"
                onClick={() => setCardInfoOpen(false)}
                type="button"
              >
                Got it
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
