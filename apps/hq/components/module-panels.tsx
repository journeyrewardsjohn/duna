import type {
  OperatorDashboard,
  OperatorWorkspace,
  TicketApprovalSummary,
} from "@duna/api";
import { formatMoney, formatVenueTime } from "@duna/core";
import { Badge, Numeric } from "@duna/ui";
import {
  ArrowRight,
  Bot,
  Building2,
  CalendarDays,
  CircleAlert,
  CreditCard,
  Boxes,
  PackageCheck,
  ShoppingBag,
  MapPinned,
  MessageSquareText,
  Plus,
  ShieldCheck,
  Trophy,
  UsersRound,
  Waves,
} from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";
import type { OperatorModule } from "./navigation";
import { OperatorControls } from "./operator-controls";
import { ScheduleCalendar } from "./schedule-calendar";
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
  locations: {
    eyebrow: "Facility operations",
    title: "Venues",
    description:
      "Capacity, court utilization, bookable time, cancellation rules, and player-facing venue stories.",
  },
  members: {
    eyebrow: "People + permissions",
    title: "People",
    description:
      "Connected staff and member identities scoped to this organization.",
  },
  products: {
    eyebrow: "What your organization offers",
    title: "Products",
    description:
      "Events, services, plans, goods, and equipment in one simple catalog.",
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
      "Connected paid-order totals and payment-account readiness without inferred economics.",
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

function ProductCatalogPanel({
  workspace,
}: {
  readonly workspace: OperatorWorkspace;
}) {
  const groups = [
    {
      type: "event" as const,
      label: "Events",
      detail: "Leagues, tournaments, clinics, camps, and open play.",
      icon: Trophy,
    },
    {
      type: "service" as const,
      label: "Services",
      detail: "Private lessons, group lessons, and coaching programs.",
      icon: CalendarDays,
    },
    {
      type: "plan" as const,
      label: "Plans",
      detail: "Memberships and organization-specific credit packs.",
      icon: CreditCard,
    },
    {
      type: "good" as const,
      label: "Goods + equipment",
      detail: "Sell, rent, or reserve inventory for coaches and operations.",
      icon: ShoppingBag,
    },
  ];
  const priceLabel = (item: OperatorWorkspace["catalog"][number]) => {
    const prices = item.variants.flatMap((variant) => variant.prices);
    const money = prices.find(
      (price) =>
        price.paymentKind === "card" && price.amountMinor !== undefined,
    );
    const credits = prices.find(
      (price) =>
        price.paymentKind === "credit" && price.creditAmount !== undefined,
    );
    return [
      money?.amountMinor !== undefined
        ? formatMoney(
            money.amountMinor,
            money.currency ?? workspace.organization.currency,
          )
        : undefined,
      credits?.creditAmount ? `${credits.creditAmount} credits` : undefined,
    ]
      .filter(Boolean)
      .join(" or ");
  };
  return (
    <div className="product-catalog">
      <section className="product-kind-grid">
        {groups.map((group) => {
          const items = workspace.catalog.filter(
            (item) => item.type === group.type,
          );
          const Icon = group.icon;
          return (
            <article className="hq-card product-kind-card" key={group.type}>
              <header>
                <span className="product-kind-card__icon">
                  <Icon aria-hidden size={20} />
                </span>
                <Badge>{items.length}</Badge>
              </header>
              <h2>{group.label}</h2>
              <p>{group.detail}</p>
              <Link href={`#create-${group.type}`}>
                Add {group.label.toLowerCase()} <ArrowRight size={15} />
              </Link>
            </article>
          );
        })}
      </section>
      <section className="hq-card catalog-inventory-card">
        <header className="hq-card-heading">
          <div>
            <span className="hq-eyebrow">Catalog</span>
            <h2>{workspace.catalog.length} products</h2>
            <p>
              One source for storefront pricing, member pricing, credits,
              fulfillment, and inventory.
            </p>
          </div>
          <Badge>
            {
              workspace.catalog.filter((item) => item.status === "active")
                .length
            }{" "}
            live
          </Badge>
        </header>
        <div className="catalog-table">
          {workspace.catalog.map((item) => (
            <article key={item.id}>
              <span
                className={`catalog-type-mark catalog-type-mark--${item.type}`}
              >
                {item.type === "good" ? (
                  <Boxes size={17} />
                ) : item.type === "plan" ? (
                  <CreditCard size={17} />
                ) : item.type === "event" ? (
                  <Trophy size={17} />
                ) : (
                  <PackageCheck size={17} />
                )}
              </span>
              <span>
                <strong>{item.title}</strong>
                <small>
                  {item.subtype.replaceAll("-", " ")} · {item.visibility}
                </small>
              </span>
              <span>
                <strong>{priceLabel(item) || "Pricing not set"}</strong>
                <small>
                  {item.allowCash ? "cash · " : ""}
                  {item.allowCard ? "card · " : ""}
                  {item.allowCredits ? "credits" : ""}
                </small>
              </span>
              <span>
                <strong>
                  {item.type === "good"
                    ? `${item.inventoryOnHand - item.inventoryReserved} available`
                    : `${item.variants.length} option${item.variants.length === 1 ? "" : "s"}`}
                </strong>
                <small>
                  {item.membershipRequired
                    ? "membership required"
                    : "open terms"}
                </small>
              </span>
              <Badge tone={item.status === "active" ? "live" : "neutral"}>
                {item.status}
              </Badge>
            </article>
          ))}
          {workspace.catalog.length === 0 && (
            <div className="hq-empty">
              <strong>No products yet.</strong>
              <span>
                Start with a lesson, clinic, membership, credit pack, or piece
                of gear.
              </span>
            </div>
          )}
        </div>
      </section>
      {workspace.inventory.length > 0 && (
        <section className="hq-card inventory-snapshot-card">
          <header className="hq-card-heading">
            <div>
              <span className="hq-eyebrow">Equipment + goods</span>
              <h2>Inventory snapshot</h2>
            </div>
            <Badge>{workspace.inventory.length} stock records</Badge>
          </header>
          <div className="inventory-snapshot-grid">
            {workspace.inventory.slice(0, 8).map((stock) => (
              <article key={stock.id}>
                <span>
                  <strong>{stock.itemTitle}</strong>
                  <small>
                    {stock.variantTitle} · {stock.locationName}
                  </small>
                </span>
                <Badge>{stock.purpose}</Badge>
                <Numeric>
                  {stock.quantityOnHand - stock.quantityReserved}
                </Numeric>
                <small>available</small>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
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
          Venue identity, courts, pricing, availability, and player booking all
          begin in one guided setup below.
        </p>
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
              ? {
                  backgroundImage: `linear-gradient(110deg, rgba(7, 24, 37, .92), rgba(7, 24, 37, .35)), url(${venue.heroImageTreatmentUrl ?? venue.heroImageUrl})`,
                }
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
            <MapPinned aria-hidden size={22} />
          </header>
          <div>
            <span className="hq-eyebrow">Venue operating view</span>
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
            {venue.courts.map((court) => (
              <article key={court.id}>
                <span>
                  <Waves aria-hidden size={15} />
                  <strong>{court.name}</strong>
                  <small>
                    {court.durationOptionsMinutes.join(" / ")} min ·{" "}
                    {court.bookingPolicy}
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
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}

function MembersPanel({
  workspace,
}: {
  readonly workspace: OperatorWorkspace;
}) {
  const roleCounts = workspace.people.reduce<Record<string, number>>(
    (counts, person) => {
      for (const role of person.roles) {
        counts[role] = (counts[role] ?? 0) + 1;
      }
      return counts;
    },
    {},
  );
  return (
    <div className="people-workspace">
      <section className="people-summary-strip">
        {[
          { label: "Players", count: roleCounts.player ?? 0 },
          { label: "Coaches", count: roleCounts.coach ?? 0 },
          {
            label: "Admins",
            count:
              (roleCounts.owner ?? 0) +
              (roleCounts.manager ?? 0) +
              (roleCounts["front-desk"] ?? 0) +
              (roleCounts.accountant ?? 0),
          },
          { label: "Guardians", count: roleCounts.guardian ?? 0 },
        ].map((group) => (
          <article className="hq-card" key={group.label}>
            <span className="hq-eyebrow">{group.label}</span>
            <Numeric>{group.count}</Numeric>
            <small>connected to this organization</small>
          </article>
        ))}
      </section>
      <section className="hq-card connected-table">
        <header className="hq-card-heading">
          <div>
            <span className="hq-eyebrow">Organization relationships</span>
            <h2>{workspace.people.length} people</h2>
            <p>
              Purchases, membership, credits, and upcoming activity are scoped
              to this organization.
            </p>
          </div>
          <Badge>
            {workspace.people.filter((person) => person.isMinor).length} minors
          </Badge>
        </header>
        <div className="people-relationship-table">
          {workspace.people.map((person) => (
            <article key={person.personId}>
              <span className="avatar">
                {person.avatarUrl ? (
                  <img alt="" src={person.avatarUrl} />
                ) : (
                  person.displayName
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((part) => part[0])
                    .join("")
                    .toUpperCase()
                )}
              </span>
              <span>
                <strong>{person.displayName}</strong>
                <small>
                  {person.email ?? person.phoneE164 ?? "No contact method"}
                </small>
              </span>
              <span className="people-role-list">
                {person.roles.map((role) => (
                  <Badge key={role}>{role}</Badge>
                ))}
              </span>
              <span>
                <strong>{person.membershipName ?? "No membership"}</strong>
                <small>{person.membershipStatus ?? "not enrolled"}</small>
              </span>
              <span>
                <Numeric>{person.creditBalance}</Numeric>
                <small>organization credits</small>
              </span>
              <span>
                <strong>
                  {formatMoney(
                    person.lifetimeSpendMinor,
                    workspace.organization.currency,
                  )}
                </strong>
                <small>{person.purchaseCount} purchases</small>
              </span>
              <span>
                <Numeric>{person.upcomingCount}</Numeric>
                <small>upcoming</small>
              </span>
            </article>
          ))}
          {workspace.people.length === 0 && (
            <div className="hq-empty">
              <strong>No organization relationships yet.</strong>
              <span>Invite a player, coach, or administrator below.</span>
            </div>
          )}
        </div>
      </section>
      <section className="hq-card connected-table">
        <header className="hq-card-heading">
          <div>
            <span className="hq-eyebrow">Purchase history</span>
            <h2>Recent organization purchases</h2>
            <p>
              The People workspace keeps purchases, membership, credits, and
              service activity together.
            </p>
          </div>
        </header>
        <div className="people-purchase-list">
          {workspace.people
            .flatMap((person) =>
              person.recentPurchases.map((purchase) => ({
                ...purchase,
                personName: person.displayName,
              })),
            )
            .toSorted((left, right) =>
              right.purchasedAt.localeCompare(left.purchasedAt),
            )
            .slice(0, 20)
            .map((purchase) => (
              <article key={purchase.orderId}>
                <span>
                  <strong>{purchase.description}</strong>
                  <small>
                    {purchase.personName} ·{" "}
                    {new Intl.DateTimeFormat("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    }).format(new Date(purchase.purchasedAt))}
                  </small>
                </span>
                <Badge
                  tone={purchase.status === "paid" ? "positive" : "neutral"}
                >
                  {purchase.status.replaceAll("-", " ")}
                </Badge>
                <Numeric>
                  {formatMoney(purchase.amountMinor, purchase.currency)}
                </Numeric>
              </article>
            ))}
          {!workspace.people.some(
            (person) => person.recentPurchases.length > 0,
          ) && (
            <div className="hq-empty">
              <strong>No paid organization purchases yet.</strong>
              <span>Completed catalog orders will appear here.</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function PaymentsPanel({
  dashboard,
  workspace,
}: {
  readonly dashboard: OperatorDashboard;
  readonly workspace: OperatorWorkspace;
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
        <span className="hq-eyebrow">Balanced subledger</span>
        <h2>{workspace.ledger.postedJournalCount} posted journals</h2>
        <p>
          {workspace.ledger.creditLiability} outstanding organization credits ·{" "}
          {workspace.ledger.reconciliationStatus.replaceAll("-", " ")}
        </p>
      </section>
      <section className="hq-card module-feature-card">
        <ShieldCheck size={24} />
        <span className="hq-eyebrow">Payment account</span>
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
          Payment account state is {dashboard.organization.stripeStatus}; no
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
          {Object.entries(workspace.theme.palette).map(([name, value]) => (
            <span key={name} style={{ background: value }} title={name} />
          ))}
        </div>
        <Badge tone={workspace.theme.publishedAt ? "live" : "warning"}>
          {workspace.theme.publishedAt ? "published" : "draft"}
        </Badge>
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
          Automatic tax is{" "}
          {workspace.organization.stripeTaxEnabled ? "enabled" : "off"} ·{" "}
          {workspace.organization.taxRegistrationStatus.replaceAll("-", " ")}.
          Venue addresses are used for in-person taxable transactions.
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
  module,
  dashboard,
  workspace,
  ticketApprovals,
}: {
  readonly module: OperatorModule;
  readonly dashboard: OperatorDashboard;
  readonly workspace: OperatorWorkspace;
  readonly ticketApprovals: readonly TicketApprovalSummary[];
}) {
  if (module === "overview") return null;
  const copy = moduleCopy[module];
  const icon =
    module === "calendar"
      ? CalendarDays
      : module === "locations"
        ? MapPinned
        : module === "members"
          ? UsersRound
          : module === "products"
            ? ShoppingBag
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
        <ScheduleCalendar workspace={workspace} />
      ) : module === "locations" ? (
        <VenuePortfolioPanel workspace={workspace} />
      ) : module === "members" ? (
        <MembersPanel workspace={workspace} />
      ) : module === "products" ? (
        <ProductCatalogPanel workspace={workspace} />
      ) : module === "events" ? (
        <EventInventory dashboard={dashboard} />
      ) : module === "leagues" ? (
        <EventInventory dashboard={dashboard} kinds={["league"]} />
      ) : module === "payments" ? (
        <PaymentsPanel dashboard={dashboard} workspace={workspace} />
      ) : module === "messages" ? (
        <MessagesPanel />
      ) : module === "reports" ? (
        <ReportsPanel dashboard={dashboard} />
      ) : module === "ai" ? (
        <AiPanel dashboard={dashboard} />
      ) : (
        <SettingsPanel dashboard={dashboard} workspace={workspace} />
      )}

      <section className="operator-control-surface" id="operator-create">
        <OperatorControls module={module} workspace={workspace} />
      </section>
    </main>
  );
}
