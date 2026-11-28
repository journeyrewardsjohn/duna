import type {
  OperatorDashboard,
  OperatorScorableMatch,
  OperatorWorkspace,
  TicketApprovalSummary,
} from "@duna/api";
import { defaultEventMedia, formatMoney, formatVenueTime } from "@duna/core";
import { Badge, Numeric } from "@duna/ui";
import {
  ArrowRight,
  Bot,
  Building2,
  CircleAlert,
  CreditCard,
  ExternalLink,
  ShoppingBag,
  MapPinned,
  Plus,
  ShieldCheck,
  Waves,
} from "lucide-react";
import { hqRoutes } from "@duna/core/hq-routes";
import Link from "next/link";
import type { CSSProperties } from "react";
import {
  eventNavigationItems,
  type EventNavigationSlug,
  type OperatorPanel,
} from "./navigation";
import { EventsTable } from "./events-table";
import { EventHistoryWorkspace } from "./event-history-workspace";
import { PeopleWorkspace } from "./people-workspace";
import { TeamWorkspace } from "./team-workspace";
import { SessionDraftManager } from "./session-draft-manager";
import { TicketApprovalQueue } from "./ticket-approval-queue";
import { DunaAiWorkspace } from "./duna-ai-workspace";

const moduleCopy: Record<
  Exclude<OperatorPanel, "today" | "inbox" | "offerings">,
  {
    readonly eyebrow: string;
    readonly title: string;
    readonly description: string;
  }
> = {
  website: {
    eyebrow: "Your club online",
    title: "Website",
    description: "Build and manage your club website with Duna AI.",
  },
  setup: {
    eyebrow: "Organization readiness",
    title: "Get started",
    description:
      "The essential steps that connect your business, people, places, brand, payments, and first offering.",
  },
  schedule: {
    eyebrow: "Sessions + facilities",
    title: "Schedule",
    description: "Sessions, court bookings and coach availability.",
  },
  places: {
    eyebrow: "Facility operations",
    title: "Venues",
    description:
      "Capacity, court utilization, bookable time, cancellation rules, and player-facing venue stories.",
  },
  people: {
    eyebrow: "Community + relationships",
    title: "People",
    description: "Players, parents, memberships and purchase history.",
  },
  team: {
    eyebrow: "Coaches + operators",
    title: "Team",
    description: "Staff roles, schedules and compensation.",
  },
  training: {
    eyebrow: "Coaching + athlete development",
    title: "Training",
    description:
      "Programs, practice plans, drills, workload, and the athlete handoff in one connected coaching workspace.",
  },
  events: {
    eyebrow: "Competition + community",
    title: "Events",
    description: "Manage events, registration and drafts.",
  },
  leagues: {
    eyebrow: "Structured play",
    title: "Leagues",
    description: "League sessions, standings and scoring.",
  },
  money: {
    eyebrow: "Earnings + payouts",
    title: "Money",
    description:
      "Earnings, refund holds, bank payouts, transaction fees, disputes, and Stripe Connect health for this organization.",
  },
  marketing: {
    eyebrow: "Audience + lifecycle communication",
    title: "Marketing",
    description:
      "Campaigns and simple Segment, Trigger, Action flows with consent and guardian-safe routing.",
  },
  reports: {
    eyebrow: "Operating truth",
    title: "Reports",
    description:
      "Connected inventory, member, facility, payment, and activation signals.",
  },
  ask: {
    eyebrow: "Governed assistance",
    title: "Duna AI",
    description:
      "Context-aware answers with permission checks, governed proposals, and fresh approval for consequential actions.",
  },
  settings: {
    eyebrow: "Tenant configuration",
    title: "Settings",
    description:
      "Organization identity, plan, timezone, payments, and capability readiness.",
  },
};

export type ModulePageCopy = {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
};

function venueWeatherSymbol(icon: string | undefined): string {
  if (icon === "clear" || icon === "mostly-clear") return "☀";
  if (icon === "partly-cloudy") return "🌤";
  if (icon === "rain" || icon === "drizzle") return "🌦";
  if (icon === "storm") return "⛈";
  if (icon === "snow") return "❄";
  if (icon === "fog") return "≋";
  return "☁";
}

function venueWeatherTemperature(celsius: number | undefined): string {
  return celsius === undefined ? "" : `${Math.round((celsius * 9) / 5 + 32)}°`;
}

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
  const publicWebUrl =
    process.env.NEXT_PUBLIC_DUNA_WEB_URL?.replace(/\/$/, "") ??
    process.env.NEXT_PUBLIC_WEB_URL?.replace(/\/$/, "") ??
    "https://duna.coach";
  return (
    <section className="hq-card connected-table event-live-inventory">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Live on Duna</span>
          <h2>
            {kinds
              ? `${events.length} connected`
              : `${events.length} live listing${events.length === 1 ? "" : "s"}`}
          </h2>
          <p>Open the exact player page or scan registration at a glance.</p>
        </div>
        <Badge>{dashboard.organization.timezone}</Badge>
      </header>
      <div className="event-live-list">
        {events.map((event) => {
          const cover =
            event.media?.find((item) => item.kind === "image")?.url ??
            event.imageUrl ??
            `${publicWebUrl}${defaultEventMedia(event.kind, event.title).path}`;
          return (
            <article key={event.id}>
              <div
                aria-hidden
                className="event-live-list__cover"
                style={{ backgroundImage: `url("${cover}")` }}
              >
                <Badge tone={event.live ? "live" : "positive"}>
                  {event.live ? "Live now" : "Published"}
                </Badge>
              </div>
              <div className="event-live-list__story">
                <span>{event.kind.replaceAll("-", " ")}</span>
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
              </div>
              <dl>
                <div>
                  <dt>Available</dt>
                  <dd>
                    <Numeric>{event.spotsRemaining}</Numeric> spots
                  </dd>
                </div>
                <div>
                  <dt>Entry</dt>
                  <dd>
                    <Numeric>
                      {event.price.amountMinor
                        ? formatMoney(
                            event.price.amountMinor,
                            event.price.currency,
                          )
                        : "Free"}
                    </Numeric>
                  </dd>
                </div>
              </dl>
              <a
                className="hq-button hq-button--secondary event-live-list__action"
                href={`${publicWebUrl}/events/${event.slug}`}
                rel="noreferrer"
                target="_blank"
              >
                View player page <ExternalLink aria-hidden size={15} />
              </a>
            </article>
          );
        })}
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

function VenuePortfolioPanel({
  workspace,
}: {
  readonly workspace: OperatorWorkspace;
}) {
  if (workspace.venues.length === 0) {
    return (
      <section className="hq-card module-feature-card">
        <MapPinned size={25} />
        <span className="hq-eyebrow">Facility portfolio</span>
        <h2>Add the first venue.</h2>
        <p>
          Start with the real-world place, then manage its courts, pricing, and
          availability in focused workspaces.
        </p>
        <Link
          className="hq-button hq-button--primary module-feature-card__action"
          href="/setup/places/create#venue-details"
        >
          Set up your first venue <ArrowRight aria-hidden size={16} />
        </Link>
      </section>
    );
  }
  return (
    <div className="venue-portfolio-grid">
      {workspace.venues.map((venue) => (
        <article
          className="hq-card venue-portfolio-card"
          key={venue.id}
          style={
            venue.heroImageTreatmentUrl || venue.heroImageUrl
              ? ({
                  "--venue-portfolio-image": `url("${venue.heroImageTreatmentUrl ?? venue.heroImageUrl}")`,
                } as CSSProperties & Record<"--venue-portfolio-image", string>)
              : undefined
          }
        >
          <header>
            <span>
              <Badge tone={venue.status === "active" ? "live" : "warning"}>
                {venue.status}
              </Badge>
              <small>
                {venue.locality ?? "City missing"} · {venue.timezone}
              </small>
            </span>
            {venue.weather ? (
              <span className="venue-weather-now">
                <strong>
                  {venueWeatherSymbol(venue.weather.hourly[0]?.icon)}
                  {venueWeatherTemperature(
                    venue.weather.hourly[0]?.temperatureC ??
                      venue.weather.days[0]?.temperatureHighC,
                  )}
                </strong>
                <small>
                  {venue.weather.hourly[0]?.condition ??
                    venue.weather.days[0]?.condition}
                </small>
              </span>
            ) : (
              <MapPinned aria-hidden size={22} />
            )}
          </header>
          <div>
            <span className="hq-eyebrow">
              {venue.locationKind === "public-location"
                ? "Public location"
                : "Private venue"}
            </span>
            <h2>{venue.name}</h2>
            <p>
              {venue.description ??
                "Add a short player-facing venue story from the controls below."}
            </p>
          </div>
          <dl>
            <div>
              <dt>Utilization</dt>
              <dd>
                <Numeric>{venue.utilization.percent.toFixed(1)}%</Numeric>
              </dd>
            </div>
            <div>
              <dt>Courts</dt>
              <dd>
                <Numeric>{venue.courts.length}</Numeric>
              </dd>
            </div>
            <div>
              <dt>Capacity</dt>
              <dd>
                <Numeric>
                  {venue.capacity ||
                    venue.courts.reduce(
                      (total, court) => total + court.capacity,
                      0,
                    )}
                </Numeric>
              </dd>
            </div>
            <div>
              <dt>Bookings · 30d</dt>
              <dd>
                <Numeric>{venue.utilization.bookingCount30d}</Numeric>
              </dd>
            </div>
          </dl>
          <div className="venue-court-utilization">
            {venue.courts.map((court) => {
              const ratePlan = workspace.ratePlans.find(
                (rate) => rate.id === court.ratePlanId,
              );
              return (
                <article key={court.id}>
                  <span>
                    <Waves aria-hidden size={15} />
                    <strong>{court.name}</strong>
                    <small>
                      {court.durationOptionsMinutes.join(" / ")} min ·{" "}
                      {ratePlan
                        ? `${formatMoney(
                            ratePlan.nonMemberAmountMinor ??
                              ratePlan.baseAmountMinor,
                            ratePlan.currency,
                          )} / ${ratePlan.rateUnitMinutes} min`
                        : "Rate needed before paid booking"}
                    </small>
                    <small>
                      {court.lit
                        ? "Lit after dark"
                        : "Daylight-only after sunset"}{" "}
                      · {court.schedule.length} weekly windows ·{" "}
                      {court.overrides.length} date blocks
                    </small>
                  </span>
                  <span>
                    <strong>{court.utilization.percent.toFixed(1)}%</strong>
                    <i>
                      <b
                        style={{
                          width: `${Math.max(2, court.utilization.percent)}%`,
                        }}
                      />
                    </i>
                  </span>
                </article>
              );
            })}
          </div>
          <Link
            className="venue-portfolio-card__manage"
            href={`/setup/places/${venue.id}`}
          >
            Open venue workspace <ArrowRight aria-hidden size={15} />
          </Link>
          {venue.weather && (
            <small className="venue-weather-updated">
              Sunrise{" "}
              {venue.weather.days[0]?.sunriseAt
                ? formatVenueTime(
                    venue.weather.days[0].sunriseAt,
                    venue.timezone,
                  )
                : "—"}{" "}
              · sunset{" "}
              {venue.weather.days[0]?.sunsetAt
                ? formatVenueTime(
                    venue.weather.days[0].sunsetAt,
                    venue.timezone,
                  )
                : "—"}{" "}
              · updated{" "}
              {formatVenueTime(venue.weather.updatedAt, venue.timezone)}
            </small>
          )}
        </article>
      ))}
    </div>
  );
}

function TeamPanel({ workspace }: { readonly workspace: OperatorWorkspace }) {
  return <TeamWorkspace workspace={workspace} />;
}

function MessagesPanel({
  workspace,
}: {
  readonly workspace: OperatorWorkspace;
}) {
  const totals = workspace.marketingCampaigns.reduce(
    (summary, campaign) => ({
      recipients: summary.recipients + campaign.stats.recipients,
      delivered: summary.delivered + campaign.stats.delivered,
      opened: summary.opened + campaign.stats.opened,
      failed: summary.failed + campaign.stats.failed,
    }),
    { recipients: 0, delivered: 0, opened: 0, failed: 0 },
  );
  return (
    <div className="people-workspace">
      <section className="people-summary-strip">
        {[
          { label: "Flows", count: workspace.marketingFlows.length },
          { label: "Campaigns", count: workspace.marketingCampaigns.length },
          { label: "Delivered", count: totals.delivered },
          {
            label: "Open rate",
            count: totals.delivered
              ? Math.round((totals.opened / totals.delivered) * 100)
              : 0,
            suffix: "%",
          },
        ].map((item) => (
          <article className="hq-card" key={item.label}>
            <span className="hq-eyebrow">{item.label}</span>
            <Numeric>
              {item.count}
              {item.suffix}
            </Numeric>
            <small>connected delivery data</small>
          </article>
        ))}
      </section>
      <section className="hq-card connected-table">
        <header className="hq-card-heading">
          <div>
            <span className="hq-eyebrow">Segment → Trigger → Action</span>
            <h2>Simple member journeys</h2>
            <p>
              Every flow remains organization-scoped, consent-aware, and
              guardian-safe. Activating a draft is always a separate review.
            </p>
          </div>
          <div className="provider-badges">
            <Badge
              tone={workspace.deliveryProviders.email ? "live" : "warning"}
            >
              Email {workspace.deliveryProviders.email ? "ready" : "draft only"}
            </Badge>
            <Badge tone={workspace.deliveryProviders.sms ? "live" : "warning"}>
              SMS {workspace.deliveryProviders.sms ? "ready" : "draft only"}
            </Badge>
            <Badge tone={workspace.deliveryProviders.push ? "live" : "warning"}>
              Push {workspace.deliveryProviders.push ? "ready" : "draft only"}
            </Badge>
          </div>
        </header>
        <div className="marketing-flow-list">
          {workspace.marketingFlows.map((flow) => (
            <article key={flow.id}>
              <header>
                <span>
                  <strong>{flow.name}</strong>
                  <small>{flow.description ?? "No internal description"}</small>
                </span>
                <Badge tone={flow.status === "active" ? "positive" : "neutral"}>
                  {flow.status}
                </Badge>
              </header>
              <div>
                <span>
                  <small>Segment</small>
                  <strong>
                    {String(flow.segment.kind ?? "custom").replaceAll("-", " ")}
                  </strong>
                </span>
                <b aria-hidden>→</b>
                <span>
                  <small>Trigger</small>
                  <strong>
                    {String(flow.trigger.kind ?? "manual").replaceAll("-", " ")}
                  </strong>
                </span>
                <b aria-hidden>→</b>
                <span>
                  <small>Action</small>
                  <strong>
                    {String(flow.action.channel ?? "message").replaceAll(
                      "-",
                      " ",
                    )}
                  </strong>
                </span>
              </div>
            </article>
          ))}
          {workspace.marketingFlows.length === 0 && (
            <div className="hq-empty">
              <strong>Create your first member journey.</strong>
              <span>
                Start with an audience, choose one trigger, and write one useful
                message.
              </span>
              <Link
                className="hq-button hq-button--primary"
                href="/marketing/create"
              >
                Create the first flow
              </Link>
            </div>
          )}
        </div>
      </section>
    </div>
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
    <div className="duna-ai-panel">
      <DunaAiWorkspace />
      <section className="hq-card module-feature-card duna-ai-panel__signals">
        <Bot size={26} />
        <span className="hq-eyebrow">Connected operating signals</span>
        <h2>{dashboard.organization.name} right now</h2>
        <ul className="module-signal-list">
          <li>
            {dashboard.events.length} published events are visible in this
            organization.
          </li>
          <li>
            {atRisk.length === 0
              ? "No published inventory is inside the near-capacity threshold."
              : `${atRisk.length} published events are near capacity.`}
          </li>
          <li>
            Payment account state is {dashboard.organization.stripeStatus}; Duna
            AI does not infer unavailable processor economics.
          </li>
        </ul>
        <Badge>Permission-aware</Badge>
      </section>
    </div>
  );
}

function SettingsPanel({
  dashboard,
  workspace,
}: {
  readonly dashboard: OperatorDashboard;
  readonly workspace: OperatorWorkspace;
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
      <section
        className="hq-card module-feature-card theme-kit-preview"
        style={
          {
            "--theme-primary": workspace.theme.palette.primary,
            "--theme-accent": workspace.theme.palette.accent,
            "--theme-sand": workspace.theme.palette.sand,
            "--theme-ink": workspace.theme.palette.ink,
            "--theme-canvas": workspace.theme.palette.canvas,
          } as CSSProperties
        }
      >
        <ShoppingBag size={24} />
        <span className="hq-eyebrow">Theme Kit</span>
        <h2>{workspace.theme.tagline ?? organization.name}</h2>
        <p>
          {workspace.theme.profileSummary ??
            "Add a player-facing tagline, hero image or video, and a compact color system."}
        </p>
        <div className="theme-swatches">
          {Object.entries(workspace.theme.palette).flatMap(([name, value]) =>
            typeof value === "string" ? (
              <span key={name} style={{ background: value }} title={name} />
            ) : (
              []
            ),
          )}
        </div>
        <Badge tone={workspace.theme.publishedAt ? "live" : "warning"}>
          {workspace.theme.publishedAt ? "published" : "draft"}
        </Badge>
        <div className="theme-kit-summary-meta">
          <span>
            <strong>{workspace.brandKnowledge.activeSourceCount}</strong>
            approved AI{" "}
            {workspace.brandKnowledge.activeSourceCount === 1
              ? "source"
              : "sources"}
          </span>
          <span>
            <strong>
              {
                [
                  workspace.theme.logoLightUrl,
                  workspace.theme.logoDarkUrl,
                  workspace.theme.heroMediaUrl,
                ].filter(Boolean).length
              }
              /3
            </strong>
            adaptive assets
          </span>
        </div>
        <Link className="module-card-action" href="/setup/identity">
          Manage Theme Kit + AI knowledge <ArrowRight size={15} />
        </Link>
      </section>
      <section className="hq-card module-feature-card">
        <CreditCard size={24} />
        <span className="hq-eyebrow">Tax location</span>
        <h2>
          {workspace.organization.locality
            ? `${workspace.organization.locality}, ${workspace.organization.administrativeArea}`
            : "Business address incomplete"}
        </h2>
        <p>
          Duna marketplace tax is{" "}
          {workspace.organization.stripeTaxEnabled ? "required" : "pending"}.
          The organization and venue addresses provide seller, ship-from, and
          event location context.
        </p>
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
  activeType,
  module,
  dashboard,
  eventKinds,
  focusedDraftId,
  pageCopy,
  workspace,
  ticketApprovals,
}: {
  /** The type link shown as current in the Events list. */
  readonly activeType?: EventNavigationSlug;
  readonly module: OperatorPanel;
  readonly dashboard: OperatorDashboard;
  readonly eventKinds?: readonly OperatorWorkspace["sessions"][number]["kind"][];
  readonly focusedDraftId?: string;
  /** Unused since Schedule moved to the new shell; Today lists scorable matches. */
  readonly matches?: readonly OperatorScorableMatch[];
  readonly pageCopy?: ModulePageCopy;
  readonly workspace: OperatorWorkspace;
  readonly ticketApprovals: readonly TicketApprovalSummary[];
}) {
  // Offerings has its own screens in app/(next) (H-OFFER).
  if (module === "today" || module === "inbox" || module === "offerings")
    return null;
  const copy = pageCopy ?? moduleCopy[module];
  const createAction =
    module === "events" && eventKinds?.[0]
      ? {
          href: `/events/create?type=${eventKinds[0]}`,
          label: `Create ${eventKinds[0].replaceAll("-", " ")}`,
        }
      : module === "events"
        ? { href: "/events/create?type=tournament", label: "Create event" }
        : module === "leagues"
          ? { href: "/events/create?type=league", label: "Create league" }
          : module === "places"
            ? { href: hqRoutes.placeCreate, label: "Add venue" }
            : module === "people"
              ? { href: hqRoutes.memberInvite, label: "Invite person" }
              : module === "team"
                ? { href: hqRoutes.teamInvite, label: "Invite team member" }
                : module === "marketing"
                  ? {
                      href: hqRoutes.marketingCreate,
                      label: "Create campaign",
                    }
                  : module === "money"
                    ? { href: hqRoutes.moneySetup, label: "Configure money" }
                    : undefined;
  // Until H9 turns them into in-page filters, the old sidebar children are a
  // row of type links inside the Events list.
  const typeLinks =
    module === "events" || module === "leagues"
      ? eventNavigationItems
      : undefined;

  return (
    <main
      className={`hq-page module-page${module === "leagues" ? " module-page--leagues" : ""}`}
    >
      <header className="hq-page-heading">
        <div>
          <h1>{copy.title}</h1>
          <p>{copy.description}</p>
        </div>
        {createAction && (
          <div className="hq-page-heading__actions">
            {module === "events" && (
              <Link className="hq-button" href={hqRoutes.schedule}>
                Schedule
              </Link>
            )}
            <Link
              className="hq-button hq-button--primary"
              href={createAction.href}
            >
              <Plus size={17} /> {createAction.label}
            </Link>
          </div>
        )}
      </header>

      {typeLinks && (
        <nav aria-label="Event types" className="hq-page-heading__actions">
          {typeLinks.map((item) => (
            <Link
              aria-current={activeType === item.slug ? "page" : undefined}
              className={`hq-button${activeType === item.slug ? " hq-button--primary" : ""}`}
              href={item.href}
              key={item.slug}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      )}

      {(module === "events" || module === "leagues" || module === "money") && (
        <TicketApprovalQueue approvals={ticketApprovals} />
      )}

      {module === "places" ? (
        <VenuePortfolioPanel workspace={workspace} />
      ) : module === "people" ? (
        <PeopleWorkspace workspace={workspace} />
      ) : module === "team" ? (
        <TeamPanel workspace={workspace} />
      ) : module === "events" ? (
        <EventsTable
          dashboard={dashboard}
          workspace={workspace}
          kinds={eventKinds}
          focusedDraftId={focusedDraftId}
          publicWebUrl={
            process.env.NEXT_PUBLIC_DUNA_WEB_URL?.replace(/\/$/, "") ??
            process.env.NEXT_PUBLIC_WEB_URL?.replace(/\/$/, "") ??
            "https://duna.coach"
          }
        />
      ) : module === "leagues" ? (
        <>
          <SessionDraftManager
            focusedDraftId={focusedDraftId}
            kinds={["league"]}
            workspace={workspace}
          />
          <EventHistoryWorkspace kinds={["league"]} workspace={workspace} />
          <EventInventory dashboard={dashboard} kinds={["league"]} />
        </>
      ) : module === "money" ? null : module === "marketing" ? (
        <MessagesPanel workspace={workspace} />
      ) : module === "reports" ? (
        <ReportsPanel dashboard={dashboard} />
      ) : module === "ask" ? (
        <AiPanel dashboard={dashboard} />
      ) : (
        <SettingsPanel dashboard={dashboard} workspace={workspace} />
      )}
    </main>
  );
}
