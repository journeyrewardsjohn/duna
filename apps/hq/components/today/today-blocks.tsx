import { formatMoney, formatVenueTime } from "@duna/core";
import { hqHref } from "@duna/core/hq-routes";
import { Icon } from "@duna/ui/icons";
import {
  AvatarStack,
  Button,
  Chip,
  EmptyFirstUse,
  NotConfigured,
  Progress,
} from "@duna/ui/tideline";
import Link from "next/link";
import { hasScope } from "../shell/hq-session";
import type { ShellSession } from "../shell/session-types";
import { TodayAsk } from "./today-ask";
import {
  loadDashboard,
  loadMembers,
  loadScorableMatches,
  loadSetup,
} from "./today-data";
import {
  askSuggestions,
  attentionItems,
  glanceMetrics,
  isFirstDay,
  kindLabel,
  scheduleStatus,
} from "./today-model";
import { BlockDenied, BlockError } from "./today-states";

const playerWebOrigin = (
  process.env.NEXT_PUBLIC_WEB_URL ?? "https://duna.coach"
).replace(/\/$/, "");

/** Ask Duna's line and the next steps the day's data supports. */
export async function AskBlock() {
  const [dashboard, setup] = await Promise.all([loadDashboard(), loadSetup()]);
  return (
    <TodayAsk
      suggestions={askSuggestions({
        dashboard: dashboard.state === "ok" ? dashboard.data : undefined,
        setup: setup.state === "ok" ? setup.data : undefined,
      })}
    />
  );
}

/** Money and bookings at a glance: the dashboard's own numbers. */
export async function GlanceBlock({
  session,
}: {
  readonly session: ShellSession;
}) {
  const [dashboard, members] = await Promise.all([
    loadDashboard(),
    loadMembers(),
  ]);
  const organization = session.organization?.name ?? "your club";
  if (dashboard.state === "denied") {
    return (
      <section aria-label="At a glance" className="today-glance-state">
        <BlockDenied area="the club's numbers" organization={organization} />
      </section>
    );
  }
  if (dashboard.state === "error") {
    return (
      <section aria-label="At a glance" className="today-glance-state">
        <BlockError reference={dashboard.reference} what="today's numbers" />
      </section>
    );
  }
  const memberCount = members.state === "ok" ? members.data.length : 0;
  const metrics = glanceMetrics(dashboard.data.metrics);
  if (
    isFirstDay({ dashboard: dashboard.data, memberCount }) ||
    metrics.length === 0
  ) {
    return (
      <section aria-label="At a glance" className="today-glance-empty">
        <Icon name="signal-line" size="control" />
        <p>
          <strong>Your numbers start with your first booking.</strong>{" "}
          <span className="td-meta">
            Revenue, check-ins and how full your courts are show up here.
          </span>
        </p>
      </section>
    );
  }
  return (
    <section aria-label="At a glance" className="today-glance">
      {metrics.map((metric) => (
        <div className="today-kpi" key={metric.label}>
          <span className="today-kpi__label">{metric.label}</span>
          <span className="today-kpi__value td-num">{metric.value}</span>
          {metric.change ? (
            <span
              className="today-kpi__change"
              data-trend={metric.trend ?? undefined}
            >
              {metric.change}
            </span>
          ) : null}
        </div>
      ))}
    </section>
  );
}

/** Today's schedule, from the sessions the club published. */
export async function ScheduleBlock({
  session,
}: {
  readonly session: ShellSession;
}) {
  const dashboard = await loadDashboard();
  const organization = session.organization?.name ?? "your club";
  if (dashboard.state === "denied") {
    return <BlockDenied area="the schedule" organization={organization} />;
  }
  if (dashboard.state === "error") {
    return <BlockError reference={dashboard.reference} what="the schedule" />;
  }
  const { schedule } = dashboard.data;
  if (schedule.length === 0) {
    return (
      <EmptyFirstUse
        action={
          <Button href={hqHref("eventCreate")} variant="primary">
            Create your first session
          </Button>
        }
        description="Clinics, open play, lessons and court bookings for today appear here, with who is coming."
        icon="schedule"
        title="Nothing on the schedule today"
      />
    );
  }
  return (
    <ol className="today-schedule">
      {schedule.map((item) => {
        const status = scheduleStatus(item);
        const publicView = item.destination === "public";
        const href = publicView
          ? `${playerWebOrigin}/events/${item.slug}`
          : hqHref("event", { sessionId: item.id });
        const joined = Math.min(item.participantCount, item.capacity);
        return (
          <li className="today-row" data-state={item.state} key={item.id}>
            <time className="today-row__time td-num" dateTime={item.startsAt}>
              {item.time}
            </time>
            <div className="today-row__what">
              <a
                className="today-row__title"
                href={href}
                rel={publicView ? "noreferrer" : undefined}
                target={publicView ? "_blank" : undefined}
              >
                {item.title}
                {publicView ? (
                  <span className="td-sr"> (opens the player page)</span>
                ) : null}
              </a>
              <span className="today-row__meta">
                {[item.court, kindLabel(item.kind)].filter(Boolean).join(" · ")}
              </span>
            </div>
            <div className="today-row__people">
              {item.attendees.length > 0 ? (
                <AvatarStack
                  label={`${item.participantCount} joined`}
                  max={3}
                  people={item.attendees.map((attendee) => ({
                    name: attendee.displayName,
                    src: attendee.avatarUrl,
                  }))}
                  size="xs"
                />
              ) : null}
            </div>
            <div className="today-row__fill">
              {item.capacity > 0 ? (
                <Progress
                  aria-label={`${joined} of ${item.capacity} joined`}
                  max={item.capacity}
                  value={joined}
                />
              ) : null}
              <span className="today-row__count td-num">
                {item.capacity > 0
                  ? `${item.participantCount}/${item.capacity}`
                  : `${item.participantCount} joined`}
              </span>
            </div>
            <div className="today-row__status">
              {status?.tone === "note" ? (
                <Chip className="today-row__note" kind="taxonomy">
                  <Icon name="users" size="chip" />
                  {status.label}
                </Chip>
              ) : status ? (
                <Chip tone={status.tone}>{status.label}</Chip>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

const attentionIcons = {
  pay: "pay",
  schedule: "schedule",
  score: "score",
  users: "users",
  alert: "alert",
  info: "info",
} as const;

/** What needs the owner: payments, scores, sessions filling, alerts. */
export async function AttentionBlock({
  session,
}: {
  readonly session: ShellSession;
}) {
  const [dashboard, matches] = await Promise.all([
    loadDashboard(),
    loadScorableMatches(),
  ]);
  const organization = session.organization?.name ?? "your club";
  if (dashboard.state === "denied") {
    return <BlockDenied area="club alerts" organization={organization} />;
  }
  if (dashboard.state === "error") {
    return <BlockError reference={dashboard.reference} what="what needs you" />;
  }
  const items = attentionItems({
    dashboard: dashboard.data,
    matches: matches.state === "ok" ? matches.data : [],
  });
  if (items.length === 0) {
    return (
      <p className="today-calm">
        <Icon name="success" size="control" />
        <span>
          <strong>Nothing needs you right now.</strong>{" "}
          <span className="td-meta">
            Failed payments, requests and sessions filling up show here.
          </span>
        </span>
      </p>
    );
  }
  return (
    <ul className="today-attention">
      {items.map((item) => (
        <li className="today-attention__item" key={item.id}>
          <span aria-hidden="true" className="today-attention__icon">
            <Icon name={attentionIcons[item.icon]} size="control" />
          </span>
          <span className="today-attention__text">
            <strong>{item.title}</strong>
            <span className="td-meta">{item.detail}</span>
          </span>
          <Button href={item.href} size="sm" variant="secondary">
            {item.action}
          </Button>
        </li>
      ))}
    </ul>
  );
}

/** Setup progress for a new club; a quiet line once everything is done. */
export async function SetupBlock({
  session,
}: {
  readonly session: ShellSession;
}) {
  const setup = await loadSetup();
  const organization = session.organization?.name ?? "your club";
  if (setup.state === "denied") {
    return <BlockDenied area="club setup" organization={organization} />;
  }
  if (setup.state === "error") {
    return <BlockError reference={setup.reference} what="setup progress" />;
  }
  const readiness = setup.data;
  if (readiness.complete) {
    return (
      <p className="today-calm">
        <Icon name="success" size="control" />
        <span>
          <strong>Setup is complete.</strong>{" "}
          <Link className="today-link" href={hqHref("setup")}>
            Review club setup
          </Link>
        </span>
      </p>
    );
  }
  const next = readiness.nextStep;
  return (
    <div className="today-setup">
      <Progress
        label={`${readiness.completedCount} of ${readiness.totalCount} steps done`}
        max={readiness.totalCount}
        value={readiness.completedCount}
      />
      {next ? (
        <div className="today-setup__next">
          <span className="td-meta">Next</span>
          <strong>{next.label}</strong>
          <span className="td-meta">{next.detail}</span>
        </div>
      ) : null}
      <ol className="today-setup__steps" aria-label="Setup steps">
        {readiness.steps.map((step) => (
          <li data-complete={step.complete || undefined} key={step.id}>
            <Icon name={step.complete ? "check" : "minus"} size="inline" />
            <span className="td-sr">
              {step.complete ? "Done: " : "Not done: "}
            </span>
            {step.label}
          </li>
        ))}
      </ol>
      <div className="today-setup__actions">
        {next ? (
          <Button href={next.href} size="sm" variant="primary">
            {next.actionLabel}
          </Button>
        ) : null}
        <Button href={hqHref("setup")} size="sm" variant="ghost">
          All of club setup
        </Button>
      </div>
    </div>
  );
}

/** Duna Pay's state: on, or the honest "not set up yet" with the way forward. */
export async function MoneyBlock({
  session,
}: {
  readonly session: ShellSession;
}) {
  const dashboard = await loadDashboard();
  const status =
    dashboard.state === "ok"
      ? dashboard.data.organization.stripeStatus
      : session.organization?.stripeStatus;
  const canSetUp = hasScope(session, "payments:write");
  if (status === "connected") {
    return (
      <div className="today-money">
        <p className="today-calm">
          <Icon name="pay" size="control" />
          <span>
            <strong>Duna Pay is taking payments.</strong>{" "}
            <span className="td-meta">
              Payouts, refunds and disputes are in Money.
            </span>
          </span>
        </p>
        <Button href={hqHref("money")} size="sm" variant="secondary">
          Open Money
        </Button>
      </div>
    );
  }
  return (
    <NotConfigured
      canSetUp={canSetUp}
      compact
      feature="Online payments"
      needs="Duna Pay"
      owner={`an owner of ${session.organization?.name ?? "your club"}`}
      setup={
        <Button href={hqHref("moneySetup")} size="sm" variant="primary">
          {status === "restricted" ? "Review Duna Pay" : "Set up Duna Pay"}
        </Button>
      }
    />
  );
}

/** The next events the club has published. */
export async function ComingUpBlock() {
  const dashboard = await loadDashboard();
  if (dashboard.state !== "ok") return null;
  const events = dashboard.data.events.slice(0, 4);
  if (events.length === 0) {
    return (
      <EmptyFirstUse
        action={
          <Button href={hqHref("eventCreate")} size="sm" variant="secondary">
            Create an event
          </Button>
        }
        description="Tournaments, leagues and clinics you publish are listed here with spots left."
        icon="trophy"
        title="No upcoming events"
      />
    );
  }
  return (
    <ul className="today-events">
      {events.map((event) => (
        <li className="today-events__item" key={event.id}>
          <span className="today-events__text">
            <Link
              className="today-row__title"
              href={hqHref("event", { sessionId: event.id })}
            >
              {event.title}
            </Link>
            <span className="td-meta">
              {formatVenueTime(event.startsAt, event.timezone, "en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
              {event.venueName ? ` · ${event.venueName}` : ""}
            </span>
          </span>
          <span className="today-events__facts">
            <span className="td-num">
              {event.spotsRemaining}{" "}
              {event.spotsRemaining === 1 ? "spot" : "spots"} left
            </span>
            <span className="td-meta td-num">
              {event.price.amountMinor
                ? formatMoney(event.price.amountMinor, event.price.currency)
                : "Free"}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
