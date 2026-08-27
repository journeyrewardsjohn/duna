import type {
  AdminOrganizationDetail,
  AdminOverview as AdminOverviewData,
  AdminPredictionOverview,
  SuperAdminPeopleOverview,
  SuperAdminPersonProfile,
  AdminVisionOverview,
  AdminVideoOverview,
  FeatureFlagCollection,
  DemoDataControl,
  GuardianReviewItem,
  PlayerIntelligenceAdmin,
  PlayerIntelligenceDetail,
  SandDataOverview,
} from "@duna/api";
import type { OrganizationSummary, PersonSummary } from "@duna/core";
import { Badge, Numeric } from "@duna/ui";
import {
  Activity,
  ArrowRight,
  BrainCircuit,
  Building2,
  CalendarDays,
  Check,
  ChevronLeft,
  CircleAlert,
  Coins,
  ExternalLink,
  Flag,
  HeartPulse,
  MapPinned,
  ReceiptText,
  Radio,
  RefreshCw,
  ScrollText,
  ShieldCheck,
  Sparkles,
  TicketCheck,
  Trophy,
  UsersRound,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import type { AdminModule } from "./navigation";
import { FeatureFlagControls } from "./feature-flag-controls";
import { GuardianReviewCard } from "./guardian-review-card";
import { OrganizationCommissionControls } from "./organization-commission-controls";
import { OrganizationPlanControls } from "./organization-plan-controls";
import { OrganizationVideoAllowanceControls } from "./organization-video-allowance-controls";
import { OrganizationAccessControls } from "./organization-access-controls";
import {
  PlayerMappingPanel,
  RatingsLabPanel,
  SandDataPanel,
  type SandDataTool,
} from "./sand-admin-controls";
import {
  ProfessionalTourAdminPanel,
  type ProfessionalTourTool,
} from "./pro-tour-admin-controls";
import { VideoAdminControls } from "./video-admin-controls";
import { VisionModelAdmin } from "./vision-model-admin";
import { PlayerIntelligenceAdminPanel } from "./player-intelligence-admin";
import { PredictionAdminControls } from "./prediction-admin-controls";
import { SuperAdminPeoplePanel } from "./super-admin-people-panel";

const adminMetricIcons = [
  WalletCards,
  Building2,
  UsersRound,
  ShieldCheck,
  CalendarDays,
  TicketCheck,
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
  people: {
    eyebrow: "One trusted account record",
    title: "People",
    description:
      "Every Duna account, their organization access, events, purchases, and governed platform authority.",
  },
  trust: {
    eyebrow: "Human-first safeguards",
    title: "Trust + safety",
    description:
      "Open reports, minor protections, case age, and response SLAs.",
  },
  support: {
    eyebrow: "Contextual member help",
    title: "Duna Support",
    description:
      "AI-grounded support conversations, human handoffs, and audited replies.",
  },
  "messaging-safety": {
    eyebrow: "Guardian-visible protection",
    title: "Message safety",
    description:
      "Held minor messages, SafeSport screening context, and human review decisions.",
  },
  ratings: {
    eyebrow: "Deterministic integrity",
    title: "Ratings",
    description:
      "Rated-player coverage and immutable rating-related audit activity.",
  },
  "sand-data": {
    eyebrow: "Source evidence + scraper health",
    title: "Sand data",
    description:
      "VolleyballLife, BVBInfo, FIVB, and world-ranking evidence in one staged pipeline.",
  },
  "pro-tour": {
    eyebrow: "Professional competition operations",
    title: "Pro tour",
    description:
      "Manage synced FIVB and AVP events, broadcast destinations, seasonal teams, substitutions, and player identity mappings.",
  },
  "player-intelligence": {
    eyebrow: "Evidence-backed athlete storytelling",
    title: "Player profiles",
    description:
      "Research, review, enrich, and publish the world's leading beach-volleyball player profiles without silently overwriting editorial truth.",
  },
  "player-mapping": {
    eyebrow: "Canonical identity resolution",
    title: "Player mapping",
    description:
      "Resolve source profiles to one Duna identity before matches become rating evidence.",
  },
  "ratings-lab": {
    eyebrow: "Replayable model evaluation",
    title: "Ratings lab",
    description:
      "Measure prediction accuracy and calibration, then version rating parameters safely.",
  },
  predictions: {
    eyebrow: "Free-play market integrity",
    title: "Predictions",
    description:
      "Track credits-only markets, public handles, order state, versioned rules, and verified settlement.",
  },
  payments: {
    eyebrow: "Platform financial operations",
    title: "Payments",
    description: "Connected GMV, webhook readiness, and payment audit events.",
  },
  video: {
    eyebrow: "Live, uploaded, and governed",
    title: "Video + Premium",
    description:
      "Mux live streams, R2 uploads, player usage, complimentary entitlements, and global allowances.",
  },
  vision: {
    eyebrow: "Verified model operations",
    title: "Vision Model Lab",
    description:
      "Train on consented match evidence, benchmark exact model bundles, and govern shadow or production promotion on Modal L4.",
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
        <Link
          className="admin-organization-row"
          href={`/admin/organizations/${organization.id}`}
          key={organization.id}
        >
          <span>
            <Building2 size={17} />
          </span>
          <div>
            <strong>{organization.name}</strong>
            <small>
              {organization.plan} · {organization.memberCount} people ·{" "}
              {organization.venueCount} venues ·{" "}
              {(organization.operatorCommissionBps ?? 0) / 100}% org fee
            </small>
          </div>
          <Badge tone={toneForStatus(organization.stripeStatus)}>
            {organization.stripeStatus}
          </Badge>
          <ArrowRight aria-hidden size={16} />
        </Link>
      ))}
      {organizations.length === 0 && <p>No organizations connected.</p>}
    </section>
  );
}

export function AdminOrganizationDetailView({
  detail,
}: {
  readonly detail: AdminOrganizationDetail;
}) {
  const { organization } = detail;
  const consumerOrigin =
    process.env.NEXT_PUBLIC_DUNA_WEB_URL?.replace(/\/$/, "") ??
    process.env.NEXT_PUBLIC_WEB_URL?.replace(/\/$/, "") ??
    "https://duna.coach";
  const upcomingEvents = detail.events
    .filter(
      (event) =>
        new Date(event.endsAt).getTime() >= Date.now() &&
        event.lifecycleStatus !== "cancelled",
    )
    .slice(0, 8);
  const staff = detail.people.filter((person) =>
    person.roles.some((role) =>
      ["owner", "manager", "coach", "front-desk", "accountant"].includes(role),
    ),
  );
  const formatMoney = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: detail.commerce.currency,
    maximumFractionDigits: 0,
  });

  return (
    <main className="hq-page admin-page admin-organization-detail">
      <Link className="admin-back-link" href="/admin/organizations">
        <ChevronLeft aria-hidden size={16} />
        All organizations
      </Link>

      <header className="admin-organization-hero">
        <div className="admin-organization-hero__mark">
          {organization.name
            .split(/\s+/)
            .map((part) => part[0])
            .join("")
            .slice(0, 2)}
        </div>
        <div>
          <span className="hq-eyebrow">Tenant command center</span>
          <h1>{organization.name}</h1>
          <p>
            {organization.legalName} · {organization.timezone}
          </p>
          <div>
            <Badge>{organization.plan}</Badge>
            <Badge tone={toneForStatus(organization.stripeStatus)}>
              Payments {organization.stripeStatus}
            </Badge>
          </div>
        </div>
        <a
          className="hq-button hq-button--secondary"
          href={`${consumerOrigin}/clubs/${organization.slug}`}
          rel="noreferrer"
          target="_blank"
        >
          Open public page <ExternalLink aria-hidden size={15} />
        </a>
      </header>

      <section className="admin-org-metric-grid">
        {detail.metrics.map((metric, index) => {
          const Icon = adminMetricIcons[index % adminMetricIcons.length]!;
          return (
            <article key={metric.label}>
              <span>
                <small>{metric.label}</small>
                <Icon aria-hidden size={18} />
              </span>
              <Numeric>{metric.value}</Numeric>
              <p>{metric.change ?? "Connected value"}</p>
            </article>
          );
        })}
      </section>

      <section className="admin-org-command-grid">
        <section className="hq-card admin-org-panel admin-org-readiness">
          <header className="hq-card-heading">
            <div>
              <span className="hq-eyebrow">Operational readiness</span>
              <h2>Account controls</h2>
            </div>
            <ShieldCheck aria-hidden size={20} />
          </header>
          <div>
            <article>
              <span>
                <WalletCards aria-hidden size={17} />
                <strong>Money movement</strong>
              </span>
              <Badge tone={toneForStatus(organization.stripeStatus)}>
                {organization.stripeStatus}
              </Badge>
            </article>
            <article>
              <span>
                <UsersRound aria-hidden size={17} />
                <strong>Staff coverage</strong>
              </span>
              <Badge tone={staff.length > 0 ? "positive" : "warning"}>
                {staff.length} team members
              </Badge>
            </article>
            <article>
              <span>
                <MapPinned aria-hidden size={17} />
                <strong>Bookable footprint</strong>
              </span>
              <Badge tone={detail.venues.length > 0 ? "positive" : "warning"}>
                {detail.venues.length} venues
              </Badge>
            </article>
          </div>
        </section>

        <section className="hq-card admin-org-panel admin-org-commerce">
          <header className="hq-card-heading">
            <div>
              <span className="hq-eyebrow">Connected commerce</span>
              <h2>Order health</h2>
            </div>
            <ReceiptText aria-hidden size={20} />
          </header>
          <strong>
            {formatMoney.format(detail.commerce.grossVolumeMinor / 100)}
          </strong>
          <span>Gross paid volume</span>
          <dl>
            <div>
              <dt>Paid</dt>
              <dd>{detail.commerce.paidOrders}</dd>
            </div>
            <div>
              <dt>Pending</dt>
              <dd>{detail.commerce.pendingOrders}</dd>
            </div>
            <div>
              <dt>Refunded</dt>
              <dd>{detail.commerce.refundedOrders}</dd>
            </div>
          </dl>
        </section>
      </section>

      <OrganizationPlanControls
        billing={detail.billing}
        canManage={detail.canManageCommission}
      />

      <OrganizationCommissionControls
        billing={detail.billing}
        canManage={detail.canManageCommission}
      />

      <OrganizationVideoAllowanceControls detail={detail} />

      <OrganizationAccessControls
        canManage={detail.canManageCommission}
        organizationId={organization.id}
      />

      <section className="admin-org-data-grid">
        <section className="hq-card admin-org-panel">
          <header className="hq-card-heading">
            <div>
              <span className="hq-eyebrow">People</span>
              <h2>Members + operators</h2>
            </div>
            <Badge>{detail.people.length}</Badge>
          </header>
          <div className="admin-entity-list">
            {detail.people.slice(0, 12).map((person) => (
              <article key={person.id}>
                <span className="admin-person-avatar">
                  {person.avatarUrl ? (
                    <img alt="" src={person.avatarUrl} />
                  ) : (
                    person.initials
                  )}
                </span>
                <div>
                  <strong>{person.displayName}</strong>
                  <small>
                    @{person.handle} · {person.roles.join(", ")}
                  </small>
                </div>
                <span className="admin-rating-value">
                  {person.rating.display.toFixed(2)}
                </span>
              </article>
            ))}
            {detail.people.length === 0 && (
              <p className="hq-empty">No active organization members.</p>
            )}
          </div>
        </section>

        <section className="hq-card admin-org-panel">
          <header className="hq-card-heading">
            <div>
              <span className="hq-eyebrow">Facilities</span>
              <h2>Venues + courts</h2>
            </div>
            <Badge>{detail.venues.length}</Badge>
          </header>
          <div className="admin-entity-list">
            {detail.venues.map((venue) => (
              <article key={venue.id}>
                <span className="admin-entity-icon">
                  <MapPinned aria-hidden size={17} />
                </span>
                <div>
                  <strong>{venue.name}</strong>
                  <small>
                    {venue.city}, {venue.region} · {venue.timezone}
                  </small>
                </div>
                <Badge tone={venue.openNow ? "positive" : "neutral"}>
                  {venue.courtCount} courts
                </Badge>
              </article>
            ))}
            {detail.venues.length === 0 && (
              <p className="hq-empty">No connected venues.</p>
            )}
          </div>
        </section>
      </section>

      <section className="hq-card admin-org-panel admin-org-activity">
        <header className="hq-card-heading">
          <div>
            <span className="hq-eyebrow">Upcoming activity</span>
            <h2>Events + sessions</h2>
          </div>
          <Badge>{upcomingEvents.length}</Badge>
        </header>
        <div className="admin-event-list">
          {upcomingEvents.map((event) => (
            <a
              href={`${consumerOrigin}/events/${event.slug}`}
              key={event.id}
              rel="noreferrer"
              target="_blank"
            >
              <time dateTime={event.startsAt}>
                {new Intl.DateTimeFormat("en-US", {
                  month: "short",
                  day: "numeric",
                }).format(new Date(event.startsAt))}
              </time>
              <div>
                <strong>{event.title}</strong>
                <small>
                  {event.venueName} · {event.spotsRemaining} spots remaining
                </small>
              </div>
              <Badge tone={event.live ? "positive" : "neutral"}>
                {event.live ? "live" : event.kind}
              </Badge>
              <ExternalLink aria-hidden size={15} />
            </a>
          ))}
          {upcomingEvents.length === 0 && (
            <p className="hq-empty">No upcoming connected activity.</p>
          )}
        </div>
      </section>

      <section className="hq-card admin-org-panel">
        <header className="hq-card-heading">
          <div>
            <span className="hq-eyebrow">Organization audit</span>
            <h2>Recent control-plane activity</h2>
          </div>
          <Badge>{detail.audit.length}</Badge>
        </header>
        <div className="admin-audit-table">
          {detail.audit.slice(0, 12).map((event) => (
            <article key={event.id}>
              <span
                className={`admin-audit-dot admin-audit-dot--${event.severity}`}
              />
              <div>
                <strong>{event.action}</strong>
                <small>
                  {event.actorName} · {event.entity}
                </small>
              </div>
              <p>{event.reason}</p>
              <time dateTime={event.occurredAt}>
                {new Intl.DateTimeFormat("en-US", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(event.occurredAt))}
              </time>
            </article>
          ))}
          {detail.audit.length === 0 && (
            <p className="hq-empty">No organization-scoped audit events.</p>
          )}
        </div>
      </section>
    </main>
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
  demoData,
  video,
  vision,
  people,
  personProfile,
  sandData,
  playerDirectory,
  playerSearchQuery,
  proEventId,
  proTourTool,
  sandDataTool,
  playerIntelligence,
  playerIntelligenceDetail,
  playerIntelligenceGender,
  playerIntelligenceStatus,
  predictions,
}: {
  readonly module: AdminModule;
  readonly overview: AdminOverviewData;
  readonly organizations: readonly OrganizationSummary[];
  readonly guardianReviews: readonly GuardianReviewItem[];
  readonly featureFlags: FeatureFlagCollection;
  readonly demoData: DemoDataControl;
  readonly video?: AdminVideoOverview;
  readonly vision?: AdminVisionOverview;
  readonly people?: SuperAdminPeopleOverview;
  readonly personProfile?: SuperAdminPersonProfile | null;
  readonly sandData?: SandDataOverview;
  readonly playerDirectory: readonly PersonSummary[];
  readonly playerSearchQuery?: string;
  readonly proEventId?: string;
  readonly proTourTool?: ProfessionalTourTool;
  readonly sandDataTool?: SandDataTool;
  readonly playerIntelligence?: PlayerIntelligenceAdmin;
  readonly playerIntelligenceDetail?: PlayerIntelligenceDetail;
  readonly playerIntelligenceGender?: "men" | "women";
  readonly playerIntelligenceStatus?:
    "all" | "not-started" | "review" | "published" | "failed";
  readonly predictions?: AdminPredictionOverview;
}) {
  if (module === "overview") return null;
  const content = copy[module];
  const Icon =
    module === "organizations"
      ? Building2
      : module === "people"
        ? UsersRound
        : module === "trust"
          ? ShieldCheck
          : module === "ratings"
            ? Activity
            : module === "pro-tour"
              ? Trophy
              : module === "player-intelligence"
                ? Sparkles
                : module === "sand-data" ||
                    module === "player-mapping" ||
                    module === "ratings-lab"
                  ? Activity
                  : module === "predictions"
                    ? Coins
                    : module === "payments"
                      ? WalletCards
                      : module === "video"
                        ? Radio
                        : module === "vision"
                          ? BrainCircuit
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
      ) : module === "people" && people ? (
        <SuperAdminPeoplePanel
          overview={people}
          personProfile={personProfile}
          query={playerSearchQuery}
        />
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
      ) : module === "sand-data" && sandData ? (
        <SandDataPanel data={sandData} tool={sandDataTool} />
      ) : module === "pro-tour" && sandData ? (
        <ProfessionalTourAdminPanel
          data={sandData}
          initialEventId={proEventId}
          players={playerDirectory}
          tool={proTourTool}
        />
      ) : module === "player-intelligence" && playerIntelligence ? (
        <PlayerIntelligenceAdminPanel
          data={playerIntelligence}
          detail={playerIntelligenceDetail}
          gender={playerIntelligenceGender}
          query={playerSearchQuery}
          status={playerIntelligenceStatus}
        />
      ) : module === "player-mapping" && sandData ? (
        <PlayerMappingPanel
          data={sandData}
          players={playerDirectory}
          query={playerSearchQuery}
        />
      ) : module === "ratings-lab" && sandData ? (
        <RatingsLabPanel data={sandData} />
      ) : module === "predictions" && predictions ? (
        <PredictionAdminControls overview={predictions} />
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
      ) : module === "video" && video ? (
        <VideoAdminControls overview={video} />
      ) : module === "vision" && vision ? (
        <VisionModelAdmin overview={vision} />
      ) : module === "audit" ? (
        <AuditList overview={overview} />
      ) : module === "health" ? (
        <SystemList overview={overview} />
      ) : module === "flags" ? (
        <FeatureFlagControls
          collection={featureFlags}
          demoData={demoData}
          organizations={organizations}
        />
      ) : (
        <SystemList overview={overview} />
      )}
    </main>
  );
}
