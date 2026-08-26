import type { OperatorDashboard, OperatorScorableMatch } from "@duna/api";
import { formatMoney, formatVenueTime, type PersonSummary } from "@duna/core";
import { Badge, Numeric } from "@duna/ui";
import {
  ArrowRight,
  CalendarPlus,
  Check,
  ChevronRight,
  CreditCard,
  ExternalLink,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { quickActions } from "./navigation";
import { OrganizationAiInsights } from "./organization-ai-insights";
import { VenueMatchOperations } from "./venue-match-operations";

const metricIcons = [TrendingUp, UsersRound, Check, CreditCard] as const;
const playerWebOrigin = (
  process.env.NEXT_PUBLIC_WEB_URL ?? "https://duna.coach"
).replace(/\/$/, "");

function scheduleKindLabel(kind: string): string {
  return kind
    .split("-")
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function scheduleStatusLabel(
  state: OperatorDashboard["schedule"][number]["state"],
  spotsRemaining: number,
): string | undefined {
  if (state === "live") return "Live now";
  if (state === "full") return "Full";
  if (state === "almost-full") {
    return `${spotsRemaining} spot${spotsRemaining === 1 ? "" : "s"} left`;
  }
  if (state === "cancelled") return "Cancelled";
  return undefined;
}

function scheduleAvailability(
  state: OperatorDashboard["schedule"][number]["state"],
  spotsRemaining: number,
): string {
  if (state === "cancelled") return "Registration closed";
  if (state === "full") return "At capacity";
  return `${spotsRemaining} spot${spotsRemaining === 1 ? "" : "s"} open`;
}

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
  const supportingMetrics = dashboard.metrics
    .slice(1)
    .filter(
      (metric) =>
        metric.label !== "Payments" ||
        dashboard.organization.stripeStatus !== "connected",
    );

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
              {supportingMetrics.map((metric, index) => {
                const Icon = metricIcons[(index + 1) % metricIcons.length]!;
                const paymentSetup = metric.label === "Payments";
                const cardContent = (
                  <>
                    <span>
                      {metric.label}
                      <Icon aria-hidden size={16} />
                    </span>
                    {paymentSetup ? (
                      <strong className="hq-analytics-metric__status">
                        {metric.value}
                      </strong>
                    ) : (
                      <Numeric>{metric.value}</Numeric>
                    )}
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
                    {paymentSetup && (
                      <span className="hq-analytics-metric__action">
                        Open secure setup <ArrowRight aria-hidden size={15} />
                      </span>
                    )}
                  </>
                );

                if (paymentSetup) {
                  return (
                    <Link
                      className="hq-analytics-metric hq-analytics-metric--link"
                      data-tone={metric.tone}
                      href="/payments/setup"
                      key={metric.label}
                    >
                      {cardContent}
                    </Link>
                  );
                }

                return (
                  <article
                    className="hq-analytics-metric"
                    data-tone={metric.tone}
                    key={metric.label}
                  >
                    {cardContent}
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
            <div className="hq-schedule-list">
              {dashboard.schedule.map((item) => {
                const publicDestination = item.destination === "public";
                const statusLabel = scheduleStatusLabel(
                  item.state,
                  item.spotsRemaining,
                );
                const visibleAttendees = item.attendees.slice(0, 4);
                const additionalAttendees = Math.max(
                  0,
                  item.participantCount - visibleAttendees.length,
                );

                return (
                  <Link
                    aria-label={`${item.title} · ${publicDestination ? "open player view" : "open session operations"}`}
                    className="hq-schedule-row"
                    href={
                      publicDestination
                        ? `${playerWebOrigin}/events/${item.slug}`
                        : `/events/${item.id}`
                    }
                    key={item.id}
                    rel={publicDestination ? "noreferrer" : undefined}
                    target={publicDestination ? "_blank" : undefined}
                  >
                    <time dateTime={item.startsAt}>
                      <Numeric>{item.time}</Numeric>
                    </time>
                    <span className="hq-schedule-row__session">
                      <i aria-hidden data-state={item.state} />
                      <span>
                        <strong>{item.title}</strong>
                        <small>
                          {item.court} · {scheduleKindLabel(item.kind)}
                        </small>
                      </span>
                    </span>
                    <span className="hq-schedule-row__roster">
                      <span
                        aria-label={`${item.participantCount} players joined${item.attendees.length ? `: ${item.attendees.map((attendee) => attendee.displayName).join(", ")}` : ""}`}
                        className="hq-schedule-row__avatars"
                        role="img"
                      >
                        {visibleAttendees.map((attendee) => (
                          <span key={attendee.id} title={attendee.displayName}>
                            {attendee.avatarUrl ? (
                              <img alt="" src={attendee.avatarUrl} />
                            ) : (
                              attendee.initials
                            )}
                          </span>
                        ))}
                        {additionalAttendees > 0 && (
                          <span aria-hidden>+{additionalAttendees}</span>
                        )}
                      </span>
                      <span>
                        <strong>
                          {item.participantCount} of {item.capacity} joined
                        </strong>
                        <small>
                          {scheduleAvailability(
                            item.state,
                            item.spotsRemaining,
                          )}
                        </small>
                      </span>
                    </span>
                    <span className="hq-schedule-row__action">
                      {statusLabel && (
                        <em data-state={item.state}>{statusLabel}</em>
                      )}
                      <span>
                        {publicDestination ? "Player view" : "Open session"}
                      </span>
                      {publicDestination ? (
                        <ExternalLink aria-hidden size={16} />
                      ) : (
                        <ArrowRight aria-hidden size={16} />
                      )}
                    </span>
                  </Link>
                );
              })}
              {dashboard.schedule.length === 0 && (
                <article className="hq-empty">
                  <strong>No published sessions today.</strong>
                  <span>Create a program or event to populate operations.</span>
                </article>
              )}
            </div>
          </section>

          <VenueMatchOperations
            hideWhenEmpty
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

        <OrganizationAiInsights
          eventCount={dashboard.events.length}
          initial={{
            headline: topAlert
              ? topAlert.title
              : nearlyFull[0]
                ? `${nearlyFull[0].title} is filling up.`
                : "Everything connected looks steady.",
            summary:
              "Connected schedule, event, member, and payment context is ready for Duna AI analysis.",
            signals: topAlert
              ? [
                  {
                    kind: "attention",
                    label: "Needs attention",
                    title: topAlert.title,
                    detail: topAlert.detail,
                    href:
                      topAlert.id === "stripe"
                        ? "/payments/setup"
                        : "/calendar",
                  },
                ]
              : nearlyFull[0]
                ? [
                    {
                      kind: "demand",
                      label: "Demand signal",
                      title: nearlyFull[0].title,
                      detail: `${nearlyFull[0].spotsRemaining} spots remain. Review capacity, waitlist, or another session while interest is active.`,
                      href: "/events",
                    },
                  ]
                : [
                    {
                      kind: "steady",
                      label: "All clear",
                      title: "No urgent operating alert.",
                      detail:
                        "Duna will keep checking connected organization context for meaningful changes.",
                      href: "/reports",
                    },
                  ],
          }}
          scheduleCount={dashboard.schedule.length}
        />
      </div>
    </main>
  );
}
