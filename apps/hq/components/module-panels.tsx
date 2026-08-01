import type {
  OperatorDashboard,
  OperatorWorkspace,
  TicketApprovalSummary,
} from "@duna/api";
import { formatMoney, formatVenueTime, type PersonSummary } from "@duna/core";
import { Badge, Numeric } from "@duna/ui";
import {
  ArrowRight,
  Bot,
  Building2,
  CalendarDays,
  CircleAlert,
  CreditCard,
  MessageSquareText,
  Plus,
  ShieldCheck,
  Trophy,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import type { OperatorModule } from "./navigation";
import { OperatorControls } from "./operator-controls";
import { TicketApprovalQueue } from "./ticket-approval-queue";

const moduleCopy: Record<
  Exclude<OperatorModule, "overview">,
  {
    readonly eyebrow: string;
    readonly title: string;
    readonly description: string;
  }
> = {
  calendar: {
    eyebrow: "Sessions + facilities",
    title: "Calendar",
    description:
      "Published sessions, venue time, capacity, and live operating state.",
  },
  members: {
    eyebrow: "People + permissions",
    title: "People",
    description:
      "Connected staff and member identities scoped to this organization.",
  },
  programs: {
    eyebrow: "Training inventory",
    title: "Programs",
    description:
      "Clinics, leagues, private lessons, and recurring training inventory.",
  },
  events: {
    eyebrow: "Competition + community",
    title: "Events",
    description:
      "Published events, prices, locations, capacity, and player-facing pages.",
  },
  leagues: {
    eyebrow: "Structured play",
    title: "Leagues",
    description:
      "League sessions and the operational surfaces that support standings and scoring.",
  },
  payments: {
    eyebrow: "Orders + processor state",
    title: "Money",
    description:
      "Connected paid-order totals and Stripe account readiness without inferred economics.",
  },
  messages: {
    eyebrow: "Consent-aware communication",
    title: "Messages",
    description:
      "Transactional and optional marketing communication with guardian-safe routing.",
  },
  reports: {
    eyebrow: "Operating truth",
    title: "Reports",
    description:
      "Connected inventory, member, facility, payment, and activation signals.",
  },
  ai: {
    eyebrow: "Governed assistance",
    title: "Duna AI",
    description:
      "Read-only grounded signals today; every future write remains proposed and auditable.",
  },
  settings: {
    eyebrow: "Tenant configuration",
    title: "Settings",
    description:
      "Organization identity, plan, timezone, payments, and capability readiness.",
  },
};

function EventInventory({
  dashboard,
  kinds,
}: {
  readonly dashboard: OperatorDashboard;
  readonly kinds?: readonly string[];
}) {
  const events = kinds
    ? dashboard.events.filter((event) => kinds.includes(event.kind))
    : dashboard.events;
  return (
    <section className="hq-card connected-table">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Published inventory</span>
          <h2>{events.length} connected</h2>
        </div>
        <Badge>{dashboard.organization.timezone}</Badge>
      </header>
      <div className="hq-connected-list">
        {events.map((event) => (
          <article key={event.id}>
            <span>
              <strong>{event.title}</strong>
              <small>
                {formatVenueTime(event.startsAt, event.timezone, "en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}{" "}
                · {event.venueName}
              </small>
            </span>
            <Badge>{event.kind.replaceAll("-", " ")}</Badge>
            <span>
              <Numeric>{event.spotsRemaining}</Numeric>
              <small>spots</small>
            </span>
            <span>
              <Numeric>
                {event.price.amountMinor
                  ? formatMoney(event.price.amountMinor, event.price.currency)
                  : "Free"}
              </Numeric>
              <small>entry</small>
            </span>
          </article>
        ))}
        {events.length === 0 && (
          <div className="hq-empty">
            <strong>No matching published inventory.</strong>
            <span>Draft and creation workflows can add the first item.</span>
          </div>
        )}
      </div>
    </section>
  );
}

function CalendarPanel({
  dashboard,
}: {
  readonly dashboard: OperatorDashboard;
}) {
  return (
    <section className="hq-card connected-table">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Chronological view</span>
          <h2>Published schedule</h2>
        </div>
        <Badge>{dashboard.schedule.length}</Badge>
      </header>
      <div className="hq-connected-list">
        {dashboard.schedule.map((item) => (
          <article key={`${item.time}-${item.title}`}>
            <Numeric>{item.time}</Numeric>
            <span>
              <strong>{item.title}</strong>
              <small>{item.court}</small>
            </span>
            <span>
              <strong>{item.detail}</strong>
              <small>connected capacity</small>
            </span>
            <Badge tone={item.state === "live" ? "live" : "neutral"}>
              {item.state}
            </Badge>
          </article>
        ))}
        {dashboard.schedule.length === 0 && (
          <div className="hq-empty">
            <strong>No published sessions.</strong>
            <span>The schedule will populate from connected inventory.</span>
          </div>
        )}
      </div>
    </section>
  );
}

function MembersPanel({
  members,
}: {
  readonly members: readonly PersonSummary[];
}) {
  return (
    <section className="hq-card connected-table">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Organization scope</span>
          <h2>{members.length} connected people</h2>
        </div>
        <Badge>Permission-aware</Badge>
      </header>
      <div className="hq-people-grid">
        {members.map((person) => (
          <article key={person.id}>
            <span className="avatar">{person.initials}</span>
            <span>
              <strong>{person.displayName}</strong>
              <small>
                @{person.handle} · {person.homeMarket}
              </small>
            </span>
            <Numeric>{person.rating.display.toFixed(2)}</Numeric>
            <div>
              {person.roles.slice(0, 3).map((role) => (
                <Badge key={role}>{role}</Badge>
              ))}
            </div>
          </article>
        ))}
        {members.length === 0 && (
          <div className="hq-empty">
            <strong>No connected people.</strong>
            <span>Invitations and roster imports will appear here.</span>
          </div>
        )}
      </div>
    </section>
  );
}

function PaymentsPanel({
  dashboard,
}: {
  readonly dashboard: OperatorDashboard;
}) {
  const grossSales = dashboard.metrics.find(
    (metric) => metric.label === "Gross sales",
  );
  return (
    <div className="module-grid module-grid--two">
      <section className="hq-card module-feature-card">
        <CreditCard size={24} />
        <span className="hq-eyebrow">Connected ledger</span>
        <h2>{grossSales?.value ?? "Unavailable"}</h2>
        <p>{grossSales?.change ?? "No paid connected orders."}</p>
      </section>
      <section className="hq-card module-feature-card">
        <ShieldCheck size={24} />
        <span className="hq-eyebrow">Stripe account</span>
        <h2>{dashboard.organization.stripeStatus}</h2>
        <p>
          Payout timing, fees, and processor balances remain unavailable until
          the connected-account feed is active.
        </p>
      </section>
    </div>
  );
}

function MessagesPanel() {
  return (
    <section className="hq-card module-feature-card">
      <MessageSquareText size={24} />
      <span className="hq-eyebrow">Provider activation</span>
      <h2>No delivery provider connected.</h2>
      <p>
        Drafting, risk classification, consent records, and guardian-copy rules
        are available in the platform layer. Sending remains disabled until an
        approved email/SMS provider and sender identity are connected.
      </p>
      <Badge tone="warning">Delivery disabled</Badge>
    </section>
  );
}

function ReportsPanel({
  dashboard,
}: {
  readonly dashboard: OperatorDashboard;
}) {
  return (
    <div className="module-grid module-grid--two">
      {dashboard.metrics.map((metric) => (
        <article className="hq-card module-feature-card" key={metric.label}>
          <span className="hq-eyebrow">{metric.label}</span>
          <Numeric>{metric.value}</Numeric>
          <p>{metric.change ?? "Connected current value"}</p>
        </article>
      ))}
      {dashboard.alerts.map((alert) => (
        <article className="hq-card module-feature-card" key={alert.id}>
          <CircleAlert size={23} />
          <span className="hq-eyebrow">Activation item</span>
          <h2>{alert.title}</h2>
          <p>{alert.detail}</p>
          <Badge tone="warning">{alert.action}</Badge>
        </article>
      ))}
    </div>
  );
}

function AiPanel({ dashboard }: { readonly dashboard: OperatorDashboard }) {
  const atRisk = dashboard.events.filter(
    (event) => event.spotsRemaining <= Math.max(2, event.capacity * 0.1),
  );
  return (
    <section className="hq-card module-feature-card">
      <Bot size={26} />
      <span className="hq-eyebrow">Grounded read-only analysis</span>
      <h2>Connected operational signals</h2>
      <ul className="module-signal-list">
        <li>
          {dashboard.events.length} published events are visible to this
          organization.
        </li>
        <li>
          {atRisk.length === 0
            ? "No published inventory is inside the near-capacity threshold."
            : `${atRisk.length} published events are near capacity.`}
        </li>
        <li>
          Stripe account state is {dashboard.organization.stripeStatus}; no
          unavailable processor economics are inferred.
        </li>
      </ul>
      <p>
        Model-generated recommendations remain off until an approved gateway key
        and evaluation policy are connected.
      </p>
      <Badge>Read-only</Badge>
    </section>
  );
}

function SettingsPanel({
  dashboard,
}: {
  readonly dashboard: OperatorDashboard;
}) {
  const organization = dashboard.organization;
  return (
    <div className="module-grid module-grid--two">
      <section className="hq-card module-feature-card">
        <Building2 size={24} />
        <span className="hq-eyebrow">Organization</span>
        <h2>{organization.name}</h2>
        <p>{organization.legalName}</p>
        <dl className="module-definition-list">
          <div>
            <dt>Plan</dt>
            <dd>{organization.plan}</dd>
          </div>
          <div>
            <dt>Timezone</dt>
            <dd>{organization.timezone}</dd>
          </div>
          <div>
            <dt>Venues</dt>
            <dd>{organization.venueCount}</dd>
          </div>
        </dl>
      </section>
      <section className="hq-card module-feature-card">
        <ShieldCheck size={24} />
        <span className="hq-eyebrow">Capability readiness</span>
        <h2>Payments: {organization.stripeStatus}</h2>
        <p>
          Tenant differences stay configuration-driven inside the shared Duna
          operating shell.
        </p>
      </section>
    </div>
  );
}

export function ModulePanel({
  module,
  dashboard,
  members,
  workspace,
  ticketApprovals,
}: {
  readonly module: OperatorModule;
  readonly dashboard: OperatorDashboard;
  readonly members: readonly PersonSummary[];
  readonly workspace: OperatorWorkspace;
  readonly ticketApprovals: readonly TicketApprovalSummary[];
}) {
  if (module === "overview") return null;
  const copy = moduleCopy[module];
  const icon =
    module === "calendar"
      ? CalendarDays
      : module === "members"
        ? UsersRound
        : module === "payments"
          ? CreditCard
          : module === "messages"
            ? MessageSquareText
            : module === "ai"
              ? Bot
              : Trophy;
  const Icon = icon;
  const createHref =
    module === "events"
      ? "/events/create?type=tournament"
      : module === "leagues"
        ? "/events/create?type=league"
        : "#operator-create";

  return (
    <main className="hq-page module-page">
      <header className="hq-page-heading">
        <div>
          <span className="hq-eyebrow">{copy.eyebrow}</span>
          <h1>{copy.title}</h1>
          <p>{copy.description}</p>
        </div>
        <Link className="hq-button hq-button--primary" href={createHref}>
          <Plus size={17} /> Create
        </Link>
      </header>

      <section className="module-context-strip">
        <Icon size={19} />
        <span>
          <strong>{dashboard.organization.name}</strong>
          <small>
            {dashboard.organization.plan} · {dashboard.organization.timezone}
          </small>
        </span>
        <Link href="/">
          Overview <ArrowRight size={15} />
        </Link>
      </section>

      {(module === "events" ||
        module === "leagues" ||
        module === "payments") && (
        <TicketApprovalQueue approvals={ticketApprovals} />
      )}

      {module === "calendar" ? (
        <CalendarPanel dashboard={dashboard} />
      ) : module === "members" ? (
        <MembersPanel members={members} />
      ) : module === "programs" ? (
        <EventInventory
          dashboard={dashboard}
          kinds={["clinic", "private-lesson", "open-play"]}
        />
      ) : module === "events" ? (
        <EventInventory dashboard={dashboard} />
      ) : module === "leagues" ? (
        <EventInventory dashboard={dashboard} kinds={["league"]} />
      ) : module === "payments" ? (
        <PaymentsPanel dashboard={dashboard} />
      ) : module === "messages" ? (
        <MessagesPanel />
      ) : module === "reports" ? (
        <ReportsPanel dashboard={dashboard} />
      ) : module === "ai" ? (
        <AiPanel dashboard={dashboard} />
      ) : (
        <SettingsPanel dashboard={dashboard} />
      )}

      <section className="operator-control-surface" id="operator-create">
        <OperatorControls module={module} workspace={workspace} />
      </section>
    </main>
  );
}
