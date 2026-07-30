import type { OperatorDashboard } from "@duna/api";
import { formatMoney, formatVenueTime, type PersonSummary } from "@duna/core";
import { Badge, Numeric } from "@duna/ui";
import {
  ArrowRight,
  CalendarPlus,
  Check,
  ChevronRight,
  CircleAlert,
  CreditCard,
  MoreHorizontal,
  Sparkles,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { quickActions } from "./navigation";

const metricIcons = [TrendingUp, UsersRound, Check, CreditCard] as const;

export function OperatorOverview({
  dashboard,
  members,
}: {
  readonly dashboard: OperatorDashboard;
  readonly members: readonly PersonSummary[];
}) {
  const today = new Intl.DateTimeFormat("en-US", {
    dateStyle: "full",
    timeZone: dashboard.organization.timezone,
  }).format(new Date());
  const nearlyFull = dashboard.events
    .filter(
      (event) => event.spotsRemaining <= Math.max(2, event.capacity * 0.1),
    )
    .slice(0, 3);

  return (
    <main className="hq-page">
      <header className="hq-page-heading">
        <div>
          <span className="hq-eyebrow">{today}</span>
          <h1>{dashboard.organization.name}.</h1>
          <p>
            A connected operating view across people, sessions, courts, and
            payments.
          </p>
        </div>
        <div>
          <Link className="hq-button hq-button--secondary" href="/calendar">
            <CalendarPlus aria-hidden size={17} /> Open calendar
          </Link>
          <Link className="hq-button hq-button--primary" href="/programs">
            Create <ChevronRight aria-hidden size={17} />
          </Link>
        </div>
      </header>

      <section className="metric-grid">
        {dashboard.metrics.map((metric, index) => {
          const Icon = metricIcons[index % metricIcons.length]!;
          return (
            <article key={metric.label}>
              <span>
                <small>{metric.label}</small>
                <Icon aria-hidden size={17} />
              </span>
              <Numeric>{metric.value}</Numeric>
              <p>
                <strong>{metric.change ?? "Connected now"}</strong>
              </p>
              {metric.label === "Members" && members.length > 0 ? (
                <div className="metric-avatars">
                  {members.slice(0, 4).map((person) => (
                    <span key={person.id}>{person.initials}</span>
                  ))}
                  {members.length > 4 && <small>+{members.length - 4}</small>}
                </div>
              ) : metric.label === "Stripe" ? (
                <Badge
                  tone={
                    dashboard.organization.stripeStatus === "connected"
                      ? "positive"
                      : "warning"
                  }
                >
                  {dashboard.organization.stripeStatus}
                </Badge>
              ) : null}
            </article>
          );
        })}
      </section>

      <section className="overview-grid">
        <article className="hq-card today-card">
          <header className="hq-card-heading">
            <div>
              <span className="hq-eyebrow">Live operations</span>
              <h2>Published schedule</h2>
            </div>
            <Link href="/calendar">
              Full calendar <ArrowRight size={15} />
            </Link>
          </header>
          <div className="today-list">
            {dashboard.schedule.map((item) => (
              <article key={`${item.time}-${item.title}`}>
                <time>
                  <Numeric>{item.time}</Numeric>
                </time>
                <i className={item.state === "live" ? "live" : undefined} />
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.court}</span>
                </div>
                <div>
                  <small>Capacity</small>
                  <span>{item.detail}</span>
                </div>
                <Badge tone={item.state === "live" ? "live" : "neutral"}>
                  {item.state}
                </Badge>
                <button aria-label={`More options for ${item.title}`}>
                  <MoreHorizontal size={18} />
                </button>
              </article>
            ))}
            {dashboard.schedule.length === 0 && (
              <article className="hq-empty">
                <strong>No published sessions.</strong>
                <span>Create a program or event to populate operations.</span>
              </article>
            )}
          </div>
        </article>

        <aside className="hq-card attention-card">
          <header className="hq-card-heading">
            <div>
              <span className="hq-eyebrow">Action queue</span>
              <h2>Needs attention</h2>
            </div>
            <Badge tone={dashboard.alerts.length > 0 ? "warning" : "positive"}>
              {dashboard.alerts.length}
            </Badge>
          </header>
          <div>
            {dashboard.alerts.map((item) => (
              <article key={item.id}>
                <span>
                  <CircleAlert aria-hidden size={18} />
                </span>
                <div>
                  <strong>{item.title}</strong>
                  <small>{item.detail}</small>
                </div>
                <Link href="/payments">{item.action}</Link>
              </article>
            ))}
            {dashboard.alerts.length === 0 && (
              <article>
                <span>
                  <Check aria-hidden size={18} />
                </span>
                <div>
                  <strong>No connected alerts.</strong>
                  <small>Current operational checks are clear.</small>
                </div>
              </article>
            )}
          </div>
          <Link href="/reports">
            Open reporting <ArrowRight size={15} />
          </Link>
        </aside>
      </section>

      <section className="lower-overview-grid">
        <article className="hq-card revenue-card">
          <header className="hq-card-heading">
            <div>
              <span className="hq-eyebrow">Published inventory</span>
              <h2>Next events</h2>
            </div>
            <Link href="/events">
              All events <ArrowRight size={15} />
            </Link>
          </header>
          <div className="hq-connected-list">
            {dashboard.events.slice(0, 5).map((event) => (
              <Link href="/events" key={event.id}>
                <span>
                  <strong>{event.title}</strong>
                  <small>
                    {formatVenueTime(event.startsAt, event.timezone, "en-US", {
                      weekday: "short",
                      hour: "numeric",
                      minute: "2-digit",
                    })}{" "}
                    · {event.venueName}
                  </small>
                </span>
                <span>
                  <Numeric>{event.spotsRemaining}</Numeric>
                  <small>
                    {event.price.amountMinor
                      ? formatMoney(
                          event.price.amountMinor,
                          event.price.currency,
                        )
                      : "Free"}
                  </small>
                </span>
              </Link>
            ))}
            {dashboard.events.length === 0 && (
              <p>No connected event inventory is published.</p>
            )}
          </div>
        </article>

        <article className="hq-card ai-brief-card">
          <header>
            <span>
              <Sparkles aria-hidden size={17} />
            </span>
            <Badge>Grounded signals</Badge>
          </header>
          <h2>What the connected data says.</h2>
          <ol>
            <li>
              <Numeric>01</Numeric>
              <p>
                {dashboard.events.length} published{" "}
                {dashboard.events.length === 1 ? "event is" : "events are"} in
                the current operating view.
              </p>
            </li>
            <li>
              <Numeric>02</Numeric>
              <p>
                {nearlyFull.length > 0
                  ? `${nearlyFull.map((event) => event.title).join(", ")} ${nearlyFull.length === 1 ? "is" : "are"} near capacity.`
                  : "No published event is currently within the near-capacity threshold."}
              </p>
            </li>
            <li>
              <Numeric>03</Numeric>
              <p>
                Stripe status is {dashboard.organization.stripeStatus}. No
                processor economics are inferred when the feed is unavailable.
              </p>
            </li>
          </ol>
          <Link href="/ai">
            Explore Duna AI controls <ArrowRight size={15} />
          </Link>
        </article>
      </section>

      <section className="quick-action-strip">
        <div>
          <span className="hq-eyebrow">Quick actions</span>
          <h2>Keep moving.</h2>
        </div>
        <div>
          {quickActions.map((action) => {
            const Icon = action.icon;
            const destination =
              action.label === "Add person"
                ? "/members"
                : action.label === "Send update"
                  ? "/messages"
                  : action.label === "Reconcile"
                    ? "/payments"
                    : action.label === "Run check-in"
                      ? "/events"
                      : action.label === "Create event"
                        ? "/events"
                        : "/calendar";
            return (
              <Link href={destination} key={action.label}>
                <Icon aria-hidden size={18} />
                <span>{action.label}</span>
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}
