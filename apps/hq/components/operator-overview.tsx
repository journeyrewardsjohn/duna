import type { OperatorDashboard, OperatorScorableMatch } from "@duna/api";
import { formatMoney, formatVenueTime, type PersonSummary } from "@duna/core";
import { Badge, Numeric } from "@duna/ui";
import {
  ArrowRight,
  CalendarDays,
  CalendarPlus,
  Check,
  ChevronRight,
  CircleAlert,
  CreditCard,
  History,
  MoreHorizontal,
  Sparkles,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { quickActions } from "./navigation";
import { VenueMatchOperations } from "./venue-match-operations";

const metricIcons = [TrendingUp, UsersRound, Check, CreditCard] as const;

function quickActionDestination(label: string): string {
  if (label === "Add person") return "/members";
  if (label === "Send update") return "/messages";
  if (label === "Reconcile") return "/payments";
  if (label === "Run check-in") return "/events";
  if (label === "Create event") return "/events";
  return "/calendar";
}

export function OperatorOverview({
  dashboard,
  matches,
  members,
}: {
  readonly dashboard: OperatorDashboard;
  readonly matches: readonly OperatorScorableMatch[];
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
  const leadMetric = dashboard.metrics[0];
  const topAlert = dashboard.alerts[0];

  return (
    <main className="hq-page hq-overview-page">
      <header className="hq-page-heading hq-overview-heading">
        <div>
          <span className="hq-eyebrow">{today}</span>
          <h1>Good morning.</h1>
          <p>Here’s what is happening across {dashboard.organization.name}.</p>
        </div>
        <div>
          <Link className="hq-button hq-button--secondary" href="/calendar">
            <CalendarPlus aria-hidden size={17} /> Calendar
          </Link>
          <Link className="hq-button hq-button--primary" href="/events">
            Create <ChevronRight aria-hidden size={17} />
          </Link>
        </div>
      </header>

      <div className="hq-overview-layout">
        <div className="hq-overview-main">
          <section className="hq-analytics-board">
            <header>
              <div>
                <span className="hq-eyebrow">Operating overview</span>
                <h2>Analytics</h2>
              </div>
              <div className="hq-analytics-board__filters">
                <span>This week</span>
                <span>All venues</span>
              </div>
            </header>

            {leadMetric ? (
              <article className="hq-lead-metric">
                <span>{leadMetric.label}</span>
                <div>
                  <Numeric>{leadMetric.value}</Numeric>
                  {leadMetric.change && (
                    <Badge
                      tone={
                        leadMetric.trend === "down" ? "warning" : "positive"
                      }
                    >
                      {leadMetric.change}
                    </Badge>
                  )}
                </div>
                <small>Connected data for the current organization</small>
              </article>
            ) : (
              <article className="hq-lead-metric">
                <span>Connected data</span>
                <div>
                  <Numeric>—</Numeric>
                </div>
                <small>No operating metrics are available yet.</small>
              </article>
            )}

            <div className="hq-analytics-metrics">
              {dashboard.metrics.slice(1).map((metric, index) => {
                const Icon = metricIcons[(index + 1) % metricIcons.length]!;
                return (
                  <article key={metric.label}>
                    <span>
                      {metric.label}
                      <Icon aria-hidden size={16} />
                    </span>
                    <Numeric>{metric.value}</Numeric>
                    <small>{metric.change ?? "Connected now"}</small>
                    {metric.label === "Members" && members.length > 0 && (
                      <div className="metric-avatars">
                        {members.slice(0, 4).map((person) => (
                          <span key={person.id}>{person.initials}</span>
                        ))}
                        {members.length > 4 && (
                          <small>+{members.length - 4}</small>
                        )}
                      </div>
                    )}
                    {metric.label === "Payments" && (
                      <Badge
                        tone={
                          dashboard.organization.stripeStatus === "connected"
                            ? "positive"
                            : "warning"
                        }
                      >
                        {dashboard.organization.stripeStatus}
                      </Badge>
                    )}
                  </article>
                );
              })}
            </div>
          </section>

          <section className="hq-card hq-schedule-board">
            <header className="hq-card-heading">
              <div>
                <span className="hq-eyebrow">Live operations</span>
                <h2>Today’s schedule</h2>
              </div>
              <Link href="/calendar">
                Full calendar <ArrowRight aria-hidden size={15} />
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
                    <MoreHorizontal aria-hidden size={18} />
                  </button>
                </article>
              ))}
              {dashboard.schedule.length === 0 && (
                <article className="hq-empty">
                  <strong>No published sessions today.</strong>
                  <span>Create a program or event to populate operations.</span>
                </article>
              )}
            </div>
          </section>

          <VenueMatchOperations
            matches={matches}
            timezone={dashboard.organization.timezone}
          />

          <section className="hq-card hq-events-board">
            <header className="hq-card-heading">
              <div>
                <span className="hq-eyebrow">Published inventory</span>
                <h2>Next events</h2>
              </div>
              <Link href="/events">
                All events <ArrowRight aria-hidden size={15} />
              </Link>
            </header>
            <div className="hq-connected-list">
              {dashboard.events.slice(0, 5).map((event) => (
                <Link href="/events" key={event.id}>
                  <span>
                    <strong>{event.title}</strong>
                    <small>
                      {formatVenueTime(
                        event.startsAt,
                        event.timezone,
                        "en-US",
                        {
                          weekday: "short",
                          hour: "numeric",
                          minute: "2-digit",
                        },
                      )}{" "}
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
          </section>

          <section className="hq-quick-actions">
            <div>
              <span className="hq-eyebrow">Quick actions</span>
              <h2>Keep moving.</h2>
            </div>
            <div>
              {quickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <Link
                    href={quickActionDestination(action.label)}
                    key={action.label}
                  >
                    <Icon aria-hidden size={18} />
                    <span>{action.label}</span>
                  </Link>
                );
              })}
            </div>
          </section>
        </div>

        <aside className="hq-ai-analyst">
          <header>
            <span>
              <Sparkles aria-hidden size={18} />
              Duna AI
            </span>
            <Link aria-label="Open Duna AI history" href="/ai">
              <History aria-hidden size={18} />
            </Link>
          </header>

          <div className="hq-ai-analyst__intro">
            <span>Today’s operating signals</span>
            <h2>
              {topAlert
                ? topAlert.title
                : nearlyFull[0]
                  ? `${nearlyFull[0].title} is filling up.`
                  : "Everything connected looks steady."}
            </h2>
            <p>
              Recommendations use only your connected schedule, event, member,
              and payment status.
            </p>
          </div>

          <div className="hq-ai-analyst__signals">
            {topAlert && (
              <article className="hq-ai-signal hq-ai-signal--attention">
                <span>
                  <CircleAlert aria-hidden size={18} />
                </span>
                <div>
                  <Badge tone="warning">Needs attention</Badge>
                  <h3>{topAlert.title}</h3>
                  <p>{topAlert.detail}</p>
                  <Link href="/ai">
                    {topAlert.action} <ArrowRight aria-hidden size={14} />
                  </Link>
                </div>
              </article>
            )}

            {nearlyFull[0] && (
              <article className="hq-ai-signal hq-ai-signal--growth">
                <span>
                  <UsersRound aria-hidden size={18} />
                </span>
                <div>
                  <Badge tone="positive">Demand signal</Badge>
                  <h3>{nearlyFull[0].title}</h3>
                  <p>
                    {nearlyFull[0].spotsRemaining} spots remain. Consider a
                    waitlist or an additional session before it fills.
                  </p>
                  <Link href="/events">
                    Open event <ArrowRight aria-hidden size={14} />
                  </Link>
                </div>
              </article>
            )}

            <article className="hq-ai-signal">
              <span>
                <CreditCard aria-hidden size={18} />
              </span>
              <div>
                <Badge
                  tone={
                    dashboard.organization.stripeStatus === "connected"
                      ? "positive"
                      : "warning"
                  }
                >
                  Money
                </Badge>
                <h3>Payments are {dashboard.organization.stripeStatus}.</h3>
                <p>
                  {dashboard.organization.stripeStatus === "connected"
                    ? "Payment processing is connected for this organization."
                    : "Complete payment setup before publishing paid inventory."}
                </p>
                <Link href="/payments">
                  Open money <ArrowRight aria-hidden size={14} />
                </Link>
              </div>
            </article>

            {!topAlert && !nearlyFull[0] && (
              <article className="hq-ai-signal hq-ai-signal--clear">
                <span>
                  <Check aria-hidden size={18} />
                </span>
                <div>
                  <Badge tone="positive">Clear</Badge>
                  <h3>No urgent operating alerts.</h3>
                  <p>Duna will surface new connected signals here.</p>
                </div>
              </article>
            )}
          </div>

          <footer>
            <span>
              <CalendarDays aria-hidden size={16} />
              {dashboard.schedule.length} schedule items ·{" "}
              {dashboard.events.length} events
            </span>
            <Link href="/ai">
              Ask Duna <ArrowRight aria-hidden size={15} />
            </Link>
          </footer>
        </aside>
      </div>
    </main>
  );
}
