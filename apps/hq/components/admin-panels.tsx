import type {
  AdminOverview as AdminOverviewData,
  FeatureFlagCollection,
  GuardianReviewItem,
} from "@duna/api";
import type { OrganizationSummary } from "@duna/core";
import { Badge, Numeric } from "@duna/ui";
import {
  Activity,
  ArrowRight,
  Building2,
  Check,
  CircleAlert,
  Flag,
  HeartPulse,
  RefreshCw,
  ScrollText,
  ShieldCheck,
  UsersRound,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import type { AdminModule } from "./navigation";
import { FeatureFlagControls } from "./feature-flag-controls";
import { GuardianReviewCard } from "./guardian-review-card";

const adminMetricIcons = [
  WalletCards,
  Building2,
  UsersRound,
  ShieldCheck,
] as const;

const copy: Record<
  Exclude<AdminModule, "overview">,
  {
    readonly eyebrow: string;
    readonly title: string;
    readonly description: string;
  }
> = {
  organizations: {
    eyebrow: "Tenants + capabilities",
    title: "Organizations",
    description:
      "Connected operators, plans, people, venues, and payment readiness.",
  },
  trust: {
    eyebrow: "Human-first safeguards",
    title: "Trust + safety",
    description:
      "Open reports, minor protections, case age, and response SLAs.",
  },
  ratings: {
    eyebrow: "Deterministic integrity",
    title: "Ratings",
    description:
      "Rated-player coverage and immutable rating-related audit activity.",
  },
  payments: {
    eyebrow: "Platform financial operations",
    title: "Payments",
    description:
      "Connected GMV, Stripe webhook readiness, and payment audit events.",
  },
  audit: {
    eyebrow: "Append-only governance",
    title: "Audit log",
    description:
      "Actor, action, entity, reason, severity, and exact occurrence time.",
  },
  flags: {
    eyebrow: "Controlled delivery",
    title: "Feature flags",
    description:
      "Global, market, and organization rollout controls with immutable change history.",
  },
  health: {
    eyebrow: "Operational reliability",
    title: "System health",
    description:
      "Current configuration and connectivity checks without invented uptime.",
  },
};

function toneForStatus(status: string): "positive" | "warning" | "neutral" {
  return ["healthy", "configured", "connected"].includes(status)
    ? "positive"
    : status === "attention" || status === "pending"
      ? "warning"
      : "neutral";
}

export function AdminOverview({
  overview,
  organizations,
}: {
  readonly overview: AdminOverviewData;
  readonly organizations: readonly OrganizationSummary[];
}) {
  const attentionServices = overview.system.filter(
    (service) => !["healthy", "configured"].includes(service.status),
  );
  return (
    <main className="hq-page admin-page">
      <header className="hq-page-heading">
        <div>
          <span className="hq-eyebrow">Duna network control plane</span>
          <h1>Govern the connected network.</h1>
          <p>
            One governed platform across clubs, coaches, facilities, players,
            and families.
          </p>
        </div>
        <div>
          <Badge tone={attentionServices.length === 0 ? "positive" : "warning"}>
            {attentionServices.length === 0 ? (
              <Check size={12} />
            ) : (
              <CircleAlert size={12} />
            )}
            {attentionServices.length === 0
              ? "Connected checks clear"
              : `${attentionServices.length} activation items`}
          </Badge>
          <Link className="hq-button hq-button--secondary" href="/admin">
            <RefreshCw size={16} /> Refresh
          </Link>
        </div>
      </header>

      <section className="metric-grid admin-metrics">
        {overview.metrics.map((metric, index) => {
          const Icon = adminMetricIcons[index % adminMetricIcons.length]!;
          return (
            <article key={metric.label}>
              <span>
                <small>{metric.label}</small>
                <Icon size={17} />
              </span>
              <Numeric>{metric.value}</Numeric>
              <p>
                <strong>{metric.change ?? "Connected value"}</strong>
              </p>
            </article>
          );
        })}
      </section>

      <section className="admin-overview-grid">
        <OrganizationsList organizations={organizations} />
        <QueueList overview={overview} />
      </section>

      <section className="admin-lower-grid">
        <SystemList overview={overview} />
        <AuditList overview={overview} limit={8} />
      </section>
    </main>
  );
}

function OrganizationsList({
  organizations,
}: {
  readonly organizations: readonly OrganizationSummary[];
}) {
  return (
    <section className="hq-card admin-queue">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Tenants</span>
          <h2>Connected organizations</h2>
        </div>
        <Badge>{organizations.length}</Badge>
      </header>
      {organizations.map((organization) => (
        <article key={organization.id}>
          <span>
            <Building2 size={17} />
          </span>
          <div>
            <strong>{organization.name}</strong>
            <small>
              {organization.plan} · {organization.memberCount} people ·{" "}
              {organization.venueCount} venues
            </small>
          </div>
          <Badge tone={toneForStatus(organization.stripeStatus)}>
            {organization.stripeStatus}
          </Badge>
        </article>
      ))}
      {organizations.length === 0 && <p>No organizations connected.</p>}
    </section>
  );
}

function QueueList({ overview }: { readonly overview: AdminOverviewData }) {
  return (
    <section className="hq-card admin-queue">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Governance queue</span>
          <h2>Needs review</h2>
        </div>
        <Badge tone={overview.queues.length > 0 ? "warning" : "positive"}>
          {overview.queues.length}
        </Badge>
      </header>
      {overview.queues.map((item) => (
        <article key={item.id}>
          <span>
            <ShieldCheck size={17} />
          </span>
          <div>
            <strong>{item.title}</strong>
            <small>
              {item.detail} · {item.age} · {item.sla}
            </small>
          </div>
          <Badge tone={item.priority === "urgent" ? "danger" : "warning"}>
            {item.priority}
          </Badge>
        </article>
      ))}
      {overview.queues.length === 0 && (
        <article>
          <span>
            <Check size={17} />
          </span>
          <div>
            <strong>No open governance cases.</strong>
            <small>The connected queue is clear.</small>
          </div>
        </article>
      )}
    </section>
  );
}

function GuardianReviewList({
  reviews,
}: {
  readonly reviews: readonly GuardianReviewItem[];
}) {
  return (
    <section className="hq-card guardian-review-list">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Minor account protection</span>
          <h2>Guardian verification</h2>
        </div>
        <Badge tone={reviews.length > 0 ? "warning" : "positive"}>
          {reviews.length}
        </Badge>
      </header>
      <p className="guardian-review-disclosure">
        Verify only after reviewing identity and relationship evidence. This
        decision unlocks guardian-gated registration, payment, consent, and
        communication controls; it does not replace the guardian&apos;s own
        legal attestation.
      </p>
      <div className="guardian-review-stack">
        {reviews.map((review) => (
          <GuardianReviewCard
            key={`${review.guardianId}:${review.minorId}`}
            review={review}
          />
        ))}
        {reviews.length === 0 && (
          <div className="hq-empty">
            <strong>No guardian relationships await review.</strong>
            <span>
              Verified and rejected decisions remain in the audit log.
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

function SystemList({ overview }: { readonly overview: AdminOverviewData }) {
  return (
    <section className="hq-card service-health">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Core services</span>
          <h2>Configuration health</h2>
        </div>
        <Link href="/admin/health">
          Full status <ArrowRight size={15} />
        </Link>
      </header>
      {overview.system.map((service) => (
        <div key={service.service}>
          <span>
            <i />
            <strong>{service.service}</strong>
          </span>
          <span>{service.detail}</span>
          <Badge tone={toneForStatus(service.status)}>{service.status}</Badge>
        </div>
      ))}
    </section>
  );
}

function AuditList({
  overview,
  limit,
}: {
  readonly overview: AdminOverviewData;
  readonly limit?: number;
}) {
  const events = limit ? overview.audit.slice(0, limit) : overview.audit;
  return (
    <section className="hq-card audit-stream">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Immutable record</span>
          <h2>Audit events</h2>
        </div>
        <Badge>{events.length}</Badge>
      </header>
      {events.map((event) => (
        <article key={event.id}>
          <span>
            {event.actorName
              .split(/\s+/)
              .map((part) => part[0])
              .join("")
              .slice(0, 3)}
          </span>
          <div>
            <strong>{event.action}</strong>
            <small>
              {event.entity} · {event.reason}
            </small>
          </div>
          <time>
            {new Intl.DateTimeFormat("en-US", {
              dateStyle: "short",
              timeStyle: "short",
            }).format(new Date(event.occurredAt))}
          </time>
        </article>
      ))}
      {events.length === 0 && <p>No audit events recorded.</p>}
    </section>
  );
}

export function AdminPanel({
  module,
  overview,
  organizations,
  guardianReviews,
  featureFlags,
}: {
  readonly module: AdminModule;
  readonly overview: AdminOverviewData;
  readonly organizations: readonly OrganizationSummary[];
  readonly guardianReviews: readonly GuardianReviewItem[];
  readonly featureFlags: FeatureFlagCollection;
}) {
  if (module === "overview") return null;
  const content = copy[module];
  const Icon =
    module === "organizations"
      ? Building2
      : module === "trust"
        ? ShieldCheck
        : module === "ratings"
          ? Activity
          : module === "payments"
            ? WalletCards
            : module === "audit"
              ? ScrollText
              : module === "flags"
                ? Flag
                : HeartPulse;
  const ratedPlayers = overview.metrics.find(
    (metric) => metric.label === "Rated players",
  );
  const platformGmv = overview.metrics.find(
    (metric) => metric.label === "Platform GMV",
  );
  const filteredAudit =
    module === "ratings"
      ? overview.audit.filter((event) => event.action.includes("rating"))
      : module === "payments"
        ? overview.audit.filter(
            (event) =>
              event.action.includes("payment") ||
              event.action.includes("refund") ||
              event.action.includes("payout"),
          )
        : overview.audit;

  return (
    <main className="hq-page module-page admin-page">
      <header className="hq-page-heading">
        <div>
          <span className="hq-eyebrow">{content.eyebrow}</span>
          <h1>{content.title}</h1>
          <p>{content.description}</p>
        </div>
        <Link className="hq-button hq-button--secondary" href="/admin">
          Network overview <ArrowRight size={16} />
        </Link>
      </header>

      <section className="module-context-strip">
        <Icon size={19} />
        <span>
          <strong>Connected control-plane data</strong>
          <small>Current persisted state · no forecast substitution</small>
        </span>
        <Badge>{module}</Badge>
      </section>

      {module === "organizations" ? (
        <OrganizationsList organizations={organizations} />
      ) : module === "trust" ? (
        <div className="module-grid">
          <GuardianReviewList reviews={guardianReviews} />
          <QueueList overview={overview} />
        </div>
      ) : module === "ratings" ? (
        <div className="module-grid module-grid--two">
          <section className="hq-card module-feature-card">
            <Activity size={24} />
            <span className="hq-eyebrow">Coverage</span>
            <Numeric>{ratedPlayers?.value ?? "0"}</Numeric>
            <p>Players with connected rating state.</p>
          </section>
          <AuditList overview={{ ...overview, audit: filteredAudit }} />
        </div>
      ) : module === "payments" ? (
        <div className="module-grid module-grid--two">
          <section className="hq-card module-feature-card">
            <WalletCards size={24} />
            <span className="hq-eyebrow">Paid connected orders</span>
            <Numeric>{platformGmv?.value ?? "$0"}</Numeric>
            <p>Processor balances, fees, and payout timing are not inferred.</p>
          </section>
          <AuditList overview={{ ...overview, audit: filteredAudit }} />
        </div>
      ) : module === "audit" ? (
        <AuditList overview={overview} />
      ) : module === "health" ? (
        <SystemList overview={overview} />
      ) : module === "flags" ? (
        <FeatureFlagControls
          collection={featureFlags}
          organizations={organizations}
        />
      ) : (
        <SystemList overview={overview} />
      )}
    </main>
  );
}
