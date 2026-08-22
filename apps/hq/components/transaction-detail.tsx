import { Badge } from "@duna/ui";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  ExternalLink,
  Globe2,
  MonitorSmartphone,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
  UserRound,
  UsersRound,
} from "lucide-react";
import Link from "next/link";

interface TransactionDetailValue {
  readonly id: string;
  readonly occurredAt: string;
  readonly status: string;
  readonly buyerName: string;
  readonly description: string;
  readonly source: string;
  readonly currency: string;
  readonly grossMinor: number;
  readonly processingFeeMinor?: number;
  readonly organizationFeeMinor?: number;
  readonly taxMinor?: number;
  readonly discountMinor?: number;
  readonly refundMinor?: number;
  readonly disputedMinor?: number;
  readonly netMinor?: number;
  readonly amountStatus: "complete" | "partial";
  readonly orderId?: string;
  readonly people: readonly {
    readonly personId: string;
    readonly name: string;
    readonly email?: string;
    readonly role: string;
    readonly profileHref: string;
  }[];
  readonly items: readonly {
    readonly id: string;
    readonly kind: string;
    readonly description: string;
    readonly quantity: number;
    readonly unitAmountMinor: number;
    readonly totalAmountMinor: number;
    readonly href?: string;
  }[];
  readonly processor: {
    readonly connectedAccountId?: string;
    readonly paymentId?: string;
    readonly paymentStatus?: string;
    readonly paymentMethod?: string;
    readonly stripePaymentIntentId?: string;
    readonly stripeChargeId?: string;
    readonly stripeTransferId?: string;
    readonly stripeBalanceTransactionId?: string;
    readonly stripeCheckoutSessionId?: string;
    readonly livemode: boolean;
    readonly dashboardUrl?: string;
    readonly accountUrl?: string;
  };
  readonly evidence: {
    readonly ipAddress?: string;
    readonly userAgent?: string;
    readonly surface?: string;
    readonly capturedAt: string;
  };
  readonly timeline: readonly {
    readonly at: string;
    readonly kind:
      "order" | "policy" | "payment" | "refund" | "collection" | "payout";
    readonly status: string;
    readonly label: string;
    readonly detail: string;
  }[];
}

function money(value: number | undefined, currency: string) {
  if (value === undefined) return "Not available";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(value / 100);
}

function tone(status: string) {
  return /failed|declined|overdue|disputed|cancelled/i.test(status)
    ? "danger"
    : /pending|processing|scheduled/i.test(status)
      ? "warning"
      : /paid|succeeded|complete|available|recovered|accepted/i.test(status)
        ? "positive"
        : "neutral";
}

function label(value: string) {
  return value
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function fullDate(value: string) {
  return new Date(value).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });
}

function compactDate(value: string) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function device(userAgent?: string) {
  if (!userAgent) return undefined;
  const platform = /iPhone/i.test(userAgent)
    ? "iPhone"
    : /iPad/i.test(userAgent)
      ? "iPad"
      : /Android/i.test(userAgent)
        ? "Android device"
        : /Macintosh|Mac OS X/i.test(userAgent)
          ? "Mac"
          : /Windows/i.test(userAgent)
            ? "Windows device"
            : "Web device";
  const browser = /CriOS|Chrome/i.test(userAgent)
    ? "Chrome"
    : /FxiOS|Firefox/i.test(userAgent)
      ? "Firefox"
      : /EdgiOS|Edg/i.test(userAgent)
        ? "Edge"
        : /Safari/i.test(userAgent)
          ? "Safari"
          : /Mobile/i.test(userAgent)
            ? "Mobile browser"
            : "Browser";
  return `${platform} · ${browser}`;
}

function TimelineIcon({
  kind,
}: {
  readonly kind: TransactionDetailValue["timeline"][number]["kind"];
}) {
  if (kind === "payment") return <CircleDollarSign size={18} />;
  if (kind === "refund") return <RotateCcw size={18} />;
  if (kind === "policy") return <ShieldCheck size={18} />;
  if (kind === "collection") return <CheckCircle2 size={18} />;
  if (kind === "payout") return <ArrowRight size={18} />;
  return <ReceiptText size={18} />;
}

function Identifier({ children }: { readonly children?: string }) {
  if (!children)
    return <span className="transaction-unavailable">Not recorded</span>;
  return <code title={children}>{children}</code>;
}

export function TransactionDetail({
  transaction,
}: {
  readonly transaction: TransactionDetailValue;
}) {
  const deviceLabel = device(transaction.evidence.userAgent);
  const amountRows = [
    ["Gross", transaction.grossMinor],
    ["Discount", transaction.discountMinor],
    ["Tax", transaction.taxMinor],
    ["Processing fee", transaction.processingFeeMinor],
    ["Organization fee", transaction.organizationFeeMinor],
    ["Refunded", transaction.refundMinor],
    ["Disputed", transaction.disputedMinor],
  ] as const;

  return (
    <article className="transaction-detail">
      <Link className="transaction-back" href="/payments/transactions">
        <ArrowLeft size={16} /> Back to all transactions
      </Link>

      <header className="transaction-hero">
        <div className="transaction-hero__identity">
          <div>
            <Badge tone={tone(transaction.status)}>
              {label(transaction.status)}
            </Badge>
            <span>{label(transaction.source)}</span>
          </div>
          <h2>{transaction.description}</h2>
          <p>
            {transaction.buyerName} ·{" "}
            <time dateTime={transaction.occurredAt}>
              {fullDate(transaction.occurredAt)}
            </time>
          </p>
        </div>
        <div className="transaction-hero__amount">
          <span>Gross payment</span>
          <strong>{money(transaction.grossMinor, transaction.currency)}</strong>
          <small>
            {transaction.netMinor === undefined
              ? "Net pending"
              : `${money(transaction.netMinor, transaction.currency)} net`}
          </small>
        </div>
      </header>

      <div className="transaction-detail__layout">
        <div className="transaction-detail__main">
          <section className="transaction-card transaction-purchase-card">
            <header>
              <div>
                <span className="transaction-card__icon">
                  <ReceiptText size={18} />
                </span>
                <div>
                  <span className="hq-eyebrow">Purchased</span>
                  <h3>{transaction.items.length === 1 ? "Item" : "Items"}</h3>
                </div>
              </div>
            </header>
            {transaction.items.length ? (
              <div className="transaction-items">
                {transaction.items.map((item) => {
                  const content = (
                    <>
                      <span>
                        <strong>{item.description}</strong>
                        <small>
                          {label(item.kind)} · Qty {item.quantity}
                        </small>
                      </span>
                      <span>
                        <strong>
                          {money(item.totalAmountMinor, transaction.currency)}
                        </strong>
                        {item.href && <ArrowRight size={17} />}
                      </span>
                    </>
                  );
                  return item.href ? (
                    <Link href={item.href} key={item.id}>
                      {content}
                    </Link>
                  ) : (
                    <div key={item.id}>{content}</div>
                  );
                })}
              </div>
            ) : (
              <p className="transaction-unavailable">
                No linked item was retained for this record.
              </p>
            )}
          </section>

          <section className="transaction-card transaction-timeline-card">
            <header>
              <div>
                <span className="transaction-card__icon">
                  <Clock3 size={18} />
                </span>
                <div>
                  <span className="hq-eyebrow">History</span>
                  <h3>Transaction timeline</h3>
                </div>
              </div>
              <span>
                {transaction.timeline.length}{" "}
                {transaction.timeline.length === 1 ? "event" : "events"}
              </span>
            </header>
            <ol className="transaction-timeline">
              {transaction.timeline.map((entry, index) => (
                <li
                  data-tone={tone(entry.status)}
                  key={`${entry.at}-${entry.label}-${index}`}
                >
                  <span className="transaction-timeline__rail">
                    <span>
                      <TimelineIcon kind={entry.kind} />
                    </span>
                  </span>
                  <div>
                    <span>
                      <strong>{entry.label}</strong>
                      <time dateTime={entry.at}>{compactDate(entry.at)}</time>
                    </span>
                    <p>{entry.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="transaction-detail__aside">
          <section className="transaction-card transaction-people-card">
            <header>
              <div>
                <span className="transaction-card__icon">
                  <UsersRound size={18} />
                </span>
                <div>
                  <span className="hq-eyebrow">People</span>
                  <h3>Profiles</h3>
                </div>
              </div>
            </header>
            <div>
              {transaction.people.map((person) => (
                <Link href={person.profileHref} key={person.personId}>
                  <span className="transaction-avatar">
                    <UserRound size={17} />
                  </span>
                  <span>
                    <strong>{person.name}</strong>
                    <small>
                      {person.role}
                      {person.email ? ` · ${person.email}` : ""}
                    </small>
                  </span>
                  <ArrowRight size={16} />
                </Link>
              ))}
            </div>
          </section>

          <section className="transaction-card transaction-stripe-card">
            <header>
              <div>
                <span className="transaction-card__icon transaction-card__icon--stripe">
                  <CircleDollarSign size={18} />
                </span>
                <div>
                  <span className="hq-eyebrow">Processor evidence</span>
                  <h3>Stripe</h3>
                </div>
              </div>
              <Badge
                tone={tone(
                  transaction.processor.paymentStatus ?? transaction.status,
                )}
              >
                {label(
                  transaction.processor.paymentStatus ?? transaction.status,
                )}
              </Badge>
            </header>
            <dl className="transaction-facts">
              <div>
                <dt>Payment intent</dt>
                <dd>
                  <Identifier>
                    {transaction.processor.stripePaymentIntentId}
                  </Identifier>
                </dd>
              </div>
              <div>
                <dt>Charge</dt>
                <dd>
                  <Identifier>
                    {transaction.processor.stripeChargeId}
                  </Identifier>
                </dd>
              </div>
              <div>
                <dt>Transfer</dt>
                <dd>
                  <Identifier>
                    {transaction.processor.stripeTransferId}
                  </Identifier>
                </dd>
              </div>
              <div>
                <dt>Connected account</dt>
                <dd>
                  <Identifier>
                    {transaction.processor.connectedAccountId}
                  </Identifier>
                </dd>
              </div>
              <div>
                <dt>Mode</dt>
                <dd>{transaction.processor.livemode ? "Live" : "Test"}</dd>
              </div>
            </dl>
            {(transaction.processor.dashboardUrl ||
              transaction.processor.accountUrl) && (
              <div className="transaction-stripe-actions">
                {transaction.processor.dashboardUrl && (
                  <a
                    href={transaction.processor.dashboardUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Open payment in Stripe <ExternalLink size={15} />
                  </a>
                )}
                {transaction.processor.accountUrl && (
                  <a
                    href={transaction.processor.accountUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Connected account activity <ExternalLink size={15} />
                  </a>
                )}
              </div>
            )}
          </section>

          <section className="transaction-card transaction-context-card">
            <header>
              <div>
                <span className="transaction-card__icon">
                  <MonitorSmartphone size={18} />
                </span>
                <div>
                  <span className="hq-eyebrow">Checkout evidence</span>
                  <h3>Context</h3>
                </div>
              </div>
            </header>
            <dl className="transaction-context-list">
              <div>
                <span>
                  <Globe2 size={17} />
                </span>
                <dt>IP address</dt>
                <dd>
                  {transaction.evidence.ipAddress ??
                    "Not captured for this checkout"}
                </dd>
              </div>
              <div>
                <span>
                  <MonitorSmartphone size={17} />
                </span>
                <dt>Device</dt>
                <dd>{deviceLabel ?? "Not captured for this checkout"}</dd>
              </div>
              <div>
                <span>
                  <Clock3 size={17} />
                </span>
                <dt>Recorded</dt>
                <dd>{fullDate(transaction.evidence.capturedAt)}</dd>
              </div>
            </dl>
            {transaction.evidence.surface && (
              <p>Checkout surface · {label(transaction.evidence.surface)}</p>
            )}
          </section>

          <section className="transaction-card transaction-amount-card">
            <header>
              <div>
                <span className="transaction-card__icon">
                  <CircleDollarSign size={18} />
                </span>
                <div>
                  <span className="hq-eyebrow">Accounting</span>
                  <h3>Amount breakdown</h3>
                </div>
              </div>
            </header>
            <dl>
              {amountRows.map(([name, value]) => (
                <div key={name}>
                  <dt>{name}</dt>
                  <dd>{money(value, transaction.currency)}</dd>
                </div>
              ))}
              <div className="transaction-amount-card__net">
                <dt>Net</dt>
                <dd>{money(transaction.netMinor, transaction.currency)}</dd>
              </div>
            </dl>
            {transaction.amountStatus === "partial" && (
              <p>
                Unavailable values stay blank until Stripe or Duna has
                authoritative evidence.
              </p>
            )}
          </section>

          <details className="transaction-technical">
            <summary>Technical references</summary>
            <dl>
              <div>
                <dt>Transaction</dt>
                <dd>
                  <Identifier>{transaction.id}</Identifier>
                </dd>
              </div>
              <div>
                <dt>Order</dt>
                <dd>
                  <Identifier>{transaction.orderId}</Identifier>
                </dd>
              </div>
              <div>
                <dt>Checkout session</dt>
                <dd>
                  <Identifier>
                    {transaction.processor.stripeCheckoutSessionId}
                  </Identifier>
                </dd>
              </div>
              <div>
                <dt>Balance transaction</dt>
                <dd>
                  <Identifier>
                    {transaction.processor.stripeBalanceTransactionId}
                  </Identifier>
                </dd>
              </div>
            </dl>
          </details>
        </aside>
      </div>
    </article>
  );
}
