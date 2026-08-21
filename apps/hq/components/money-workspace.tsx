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
  const { path, area } = chartGeometry(money.earnings.points);
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
        <span>30-day net earnings</span>
        <strong>{formatMoney(money.earnings.netMinor, money.currency)}</strong>
        <small>
          {formatMoney(money.earnings.grossMinor, money.currency)} collected
          before fees and refunds
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
            {money.earnings.points[0]
              ? shortDate(money.earnings.points[0].date)
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
            <Landmark size={16} /> Stripe balance
          </span>
          <strong>
            {formatMoney(
              money.connect.stripeAvailableMinor ?? 0,
              money.currency,
            )}
          </strong>
          <small>Processor-available · Duna policy holds still apply</small>
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
}: {
  readonly money: OrganizationMoneyWorkspace;
  readonly organizationName: string;
}) {
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [query, setQuery] = useState("");
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [cardInfoOpen, setCardInfoOpen] = useState(false);
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

  return (
    <div className="money-workspace">
      <MoneyHero money={money} onPayout={() => setPayoutOpen(true)} />

      <section className="money-movement-grid">
        <button
          className="money-movement-card"
          disabled={
            !money.connect.payoutsEnabled || money.balance.availableMinor <= 0
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
            Future spending from balances held by Duna—not your Stripe Connect
            balance.
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
          <small>Refund protected</small>
          <Numeric>
            {formatMoney(money.balance.heldMinor, money.currency)}
          </Numeric>
          <span>Releases after cancellation cutoffs</span>
        </article>
        <article>
          <small>Clearing at Stripe</small>
          <Numeric>
            {formatMoney(money.balance.pendingMinor, money.currency)}
          </Numeric>
          <span>Waiting for processor settlement</span>
        </article>
        <article>
          <small>On the way</small>
          <Numeric>
            {formatMoney(money.balance.inTransitMinor, money.currency)}
          </Numeric>
          <span>Submitted to a payout bank</span>
        </article>
      </section>

      <div className="money-ledger-layout">
        <section className="hq-card money-activity-card">
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
              {(["all", "available", "held", "fees", "refunds"] as const).map(
                (value) => (
                  <button
                    className={filter === value ? "active" : ""}
                    key={value}
                    onClick={() => setFilter(value)}
                    type="button"
                  >
                    {value}
                  </button>
                ),
              )}
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
                  {formatMoney(transaction.grossMinor, transaction.currency)}
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
                    {formatMoney(transaction.taxMinor, transaction.currency)}
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
          <section className="hq-card money-payout-plan">
            <header>
              <div>
                <span className="hq-eyebrow">Payout plan</span>
                <h2>Keep the rhythm you prefer.</h2>
              </div>
              <RefreshCw size={20} />
            </header>
            <p>
              Eligible money follows this Duna schedule. Stripe stays on manual
              rail payouts so refund holds remain protected.
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
                      {account.status} · {account.currency ?? "payout currency"}
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
          <section className="hq-card money-connect-health">
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

      <div className="money-secondary-grid">
        <section className="hq-card money-list-card">
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
                Transfers, fees, refunds, and payouts will appear here directly
                from Connect.
              </span>
            </div>
          )}
        </section>
        <section className="hq-card money-list-card">
          <header className="hq-card-heading">
            <div>
              <span className="hq-eyebrow">Disputes</span>
              <h2>
                {money.disputes.length
                  ? `${money.disputes.length} need review`
                  : "No open disputes"}
              </h2>
            </div>
            <Scale size={21} />
          </header>
          {money.disputes.map((dispute) => (
            <article key={dispute.id}>
              <span>
                <strong>
                  {formatMoney(dispute.amountMinor, dispute.currency)} ·{" "}
                  {dispute.kind.replaceAll("_", " ")}
                </strong>
                <small>
                  {dispute.dueAt
                    ? `Evidence due ${dateTime(dispute.dueAt)}`
                    : dateTime(dispute.createdAt)}
                </small>
              </span>
              <Badge tone="warning">{dispute.status}</Badge>
            </article>
          ))}
          {!money.disputes.length && (
            <div className="hq-empty">
              <strong>All clear.</strong>
              <span>
                Stripe disputes appear here and immediately protect the related
                funds.
              </span>
            </div>
          )}
        </section>
      </div>

      <section className="hq-card money-settings-card">
        <header className="hq-card-heading">
          <div>
            <span className="hq-eyebrow">Payout + card settings</span>
            <h2>Make money movement feel like your business.</h2>
            <p>
              Choose your Duna payout cadence and the descriptions customers and
              banks recognize.
            </p>
          </div>
          <WalletCards size={24} />
        </header>
        <form action={settingsAction}>
          <div className="money-form-grid">
            <label>
              <span>Payout frequency</span>
              <select
                defaultValue={money.settings.payoutInterval}
                name="payoutInterval"
              >
                <option value="manual">Manual</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>
            <label>
              <span>Weekly payout day</span>
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
            <label>
              <span>Monthly payout day</span>
              <input
                defaultValue={money.settings.monthlyPayoutDay}
                max="28"
                min="1"
                name="monthlyPayoutDay"
                type="number"
              />
            </label>
            <label>
              <span>Minimum payout</span>
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
            </label>
            <label>
              <span>Card statement descriptor</span>
              <input
                defaultValue={money.settings.statementDescriptor}
                maxLength={22}
                minLength={5}
                name="statementDescriptor"
                placeholder="BEACH ELITE"
              />
            </label>
            <label>
              <span>Bank payout descriptor</span>
              <input
                defaultValue={money.settings.payoutStatementDescriptor}
                maxLength={22}
                minLength={5}
                name="payoutStatementDescriptor"
                placeholder="DUNA BEACH ELITE"
              />
            </label>
          </div>
          <Notice state={settingsState} />
          <footer>
            <small>
              Descriptor edits are synchronized to this organization’s connected
              Stripe account.
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

      <section className="hq-card refund-policy-card">
        <header className="hq-card-heading">
          <div>
            <span className="hq-eyebrow">Refund policies</span>
            <h2>Protect players and payout timing with one rule.</h2>
            <p>
              Refundable funds stay held until the cutoff. Non-refundable funds
              become eligible after Stripe clears them.
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
            <h3>Add a refund policy</h3>
            <label>
              <span>Name</span>
              <input name="name" placeholder="Flexible · 48 hours" required />
            </label>
            <label>
              <span>Refund type</span>
              <select defaultValue="refundable" name="mode">
                <option value="refundable">Refundable before cutoff</option>
                <option value="non-refundable">Non-refundable</option>
              </select>
            </label>
            <div>
              <label>
                <span>Cutoff</span>
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
              <input defaultChecked name="makeDefault" type="checkbox" />
              <span>Use when a purchase has no event-specific rule</span>
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
