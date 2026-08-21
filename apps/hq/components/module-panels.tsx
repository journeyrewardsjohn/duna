import type {
  OrganizationMoneyWorkspace,
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
  CalendarDays,
  CircleAlert,
  CreditCard,
  ExternalLink,
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
import { ScheduleCalendar } from "./schedule-calendar";
import { EventHistoryWorkspace } from "./event-history-workspace";
import { PeopleWorkspace } from "./people-workspace";
import { TeamWorkspace } from "./team-workspace";
import { SessionDraftManager } from "./session-draft-manager";
import { TicketApprovalQueue } from "./ticket-approval-queue";
import { MoneyWorkspace } from "./money-workspace";
import { VenueMatchOperations } from "./venue-match-operations";
import { DunaAiWorkspace } from "./duna-ai-workspace";

const moduleCopy: Record<
  Exclude<OperatorModule, "overview" | "messages">,
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
    eyebrow: "Community + relationships",
    title: "People",
    description:
      "Members, players, parents, purchases, credits, and participation signals scoped to this organization.",
  },
  team: {
    eyebrow: "Coaches + operators",
    title: "Team",
    description:
      "Roles, availability, sessions, compensation setup, personal goals, and organization-controlled worker classifications.",
  },
  training: {
    eyebrow: "Coaching + athlete development",
    title: "Training",
    description:
      "Programs, practice plans, drills, workload, and the athlete handoff in one connected coaching workspace.",
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
  "promo-codes": {
    eyebrow: "Offers + conversion",
    title: "Promo codes",
    description:
      "Targeted discounts with explicit eligibility, limits, Stripe synchronization, and live redemption performance.",
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

export type ProductCatalogScope = "service" | "plan" | "good";

export function ProductCatalogPanel({
  workspace,
  scope,
}: {
  readonly workspace: OperatorWorkspace;
  readonly scope?: ProductCatalogScope;
}) {
  const groups = [
    {
      type: "service" as const,
      label: "Services",
      detail: "Private lessons, group lessons, and coaching programs.",
      icon: CalendarDays,
    },
    {
      type: "plan" as const,
      label: "Plans",
      detail: "Memberships, organization-specific credit packs, and bundles.",
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
  const scopeLabel = groups.find((group) => group.type === scope)?.label;
  const catalog = scope
    ? workspace.catalog.filter((item) => item.type === scope)
    : workspace.catalog;
  const productPerformance = workspace.productPerformance.filter(
    (performance) =>
      catalog.some((item) => item.id === performance.catalogItemId),
  );
  const inventory = scope
    ? workspace.inventory.filter((item) =>
        catalog.some((catalogItem) => catalogItem.id === item.catalogItemId),
      )
    : workspace.inventory;
  const totalPurchases = productPerformance.reduce(
    (total, item) => total + item.paidPurchases,
    0,
  );
  const grossBookedMinor = productPerformance.reduce(
    (total, item) => total + item.grossBookedMinor,
    0,
  );
  const uniqueCustomers = new Set(
    productPerformance
      .filter((item) => item.uniqueCustomers > 0)
      .map((item) => item.catalogItemId),
  ).size;
  const goodsPerformance = productPerformance.filter(
    (performance) =>
      catalog.find((item) => item.id === performance.catalogItemId)?.type ===
      "good",
  );
  const goodsNetSalesMinor = goodsPerformance.reduce(
    (total, item) => total + item.netSalesMinor,
    0,
  );
  const goodsCogsMinor = goodsPerformance.reduce(
    (total, item) => total + item.cogsMinor,
    0,
  );
  const goodsGrossProfitMinor = goodsNetSalesMinor - goodsCogsMinor;
  const inventoryCostOnHandMinor = inventory.reduce(
    (total, receipt) =>
      total + (receipt.unitCostMinor ?? 0) * receipt.quantityOnHand,
    0,
  );
  const inventoryReceivedCostMinor = inventory.reduce(
    (total, receipt) =>
      total +
      (receipt.totalCostMinor ??
        (receipt.unitCostMinor ?? 0) * receipt.quantityReceived),
    0,
  );
  const topOffers = productPerformance
    .filter((item) => item.paidPurchases > 0)
    .toSorted((left, right) => right.grossBookedMinor - left.grossBookedMinor)
    .slice(0, 4);
  return (
    <div className="product-catalog">
      <section className="hq-card product-performance-overview">
        <header className="hq-card-heading">
          <div>
            <span className="hq-eyebrow">Connected product performance</span>
            <h2>
              {scopeLabel ? `${scopeLabel} in view.` : "Everything in view."}
            </h2>
            <p>
              Paid purchases and booked value come from connected Duna orders.
              Duna does not invent conversion rates when impression data is not
              available.
            </p>
          </div>
          <Badge>{catalog.length} offers</Badge>
        </header>
        <div className="product-performance-metrics">
          <article>
            <small>Gross booked</small>
            <Numeric>
              {formatMoney(grossBookedMinor, workspace.organization.currency)}
            </Numeric>
            <span>Before connected refunds</span>
          </article>
          <article>
            <small>Paid purchases</small>
            <Numeric>{totalPurchases}</Numeric>
            <span>Across all catalog types</span>
          </article>
          <article>
            <small>Offers with customers</small>
            <Numeric>{uniqueCustomers}</Numeric>
            <span>
              {catalog.filter((item) => item.status === "active").length}{" "}
              currently live
            </span>
          </article>
          <article>
            <small>Goods gross profit</small>
            <Numeric>
              {formatMoney(
                goodsGrossProfitMinor,
                workspace.organization.currency,
              )}
            </Numeric>
            <span>
              {formatMoney(goodsCogsMinor, workspace.organization.currency)}{" "}
              connected COGS
            </span>
          </article>
          <article>
            <small>Inventory cost on hand</small>
            <Numeric>
              {formatMoney(
                inventoryCostOnHandMinor,
                workspace.organization.currency,
              )}
            </Numeric>
            <span>
              {formatMoney(
                inventoryReceivedCostMinor,
                workspace.organization.currency,
              )}{" "}
              received historically
            </span>
          </article>
        </div>
        {topOffers.length > 0 ? (
          <div className="product-performance-bars">
            {topOffers.map((performance) => {
              const item = catalog.find(
                (candidate) => candidate.id === performance.catalogItemId,
              );
              const maximum = topOffers[0]?.grossBookedMinor || 1;
              return (
                <article key={performance.catalogItemId}>
                  <span>
                    <strong>{item?.title ?? "Catalog offer"}</strong>
                    <small>
                      {performance.paidPurchases} purchase
                      {performance.paidPurchases === 1 ? "" : "s"} ·{" "}
                      {performance.uniqueCustomers} customer
                      {performance.uniqueCustomers === 1 ? "" : "s"}
                      {item?.type === "good" &&
                      performance.grossMarginBps !== undefined
                        ? ` · ${(performance.grossMarginBps / 100).toFixed(1)}% margin`
                        : ""}
                    </small>
                  </span>
                  <i
                    aria-label={`${Math.round(
                      (performance.grossBookedMinor / maximum) * 100,
                    )}% of the leading booked value`}
                    style={
                      {
                        "--product-performance-width": `${Math.max(
                          4,
                          Math.round(
                            (performance.grossBookedMinor / maximum) * 100,
                          ),
                        )}%`,
                      } as CSSProperties
                    }
                  />
                  <Numeric>
                    {formatMoney(
                      performance.grossBookedMinor,
                      workspace.organization.currency,
                    )}
                  </Numeric>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="hq-empty">
            <strong>Performance begins with the first paid order.</strong>
            <span>
              Create a draft, publish it when payments are ready, and Duna will
              report only connected activity.
            </span>
          </div>
        )}
      </section>
      {!scope && (
        <section className="product-kind-grid">
          {groups.map((group) => {
            const items = catalog.filter((item) => item.type === group.type);
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
                <Link href={`/products/create?type=${group.type}`}>
                  Create a{" "}
                  {group.type === "good" ? "Good" : group.label.slice(0, -1)}{" "}
                  <ArrowRight size={15} />
                </Link>
              </article>
            );
          })}
        </section>
      )}
      {!scope && (
        <section className="hq-card product-event-builder-callout">
          <span className="catalog-type-mark catalog-type-mark--event">
            <Trophy aria-hidden size={18} />
          </span>
          <div>
            <strong>Events have their own builder.</strong>
            <p>
              Leagues, tournaments, clinics, camps, pickup, and open play belong
              in the event workflow with schedules, divisions, tickets, and
              policies.
            </p>
          </div>
          <Link href="/events/create">
            Open event builder <ArrowRight aria-hidden size={15} />
          </Link>
        </section>
      )}
      {scope && (
        <section className="hq-card product-customer-activity">
          <header className="hq-card-heading">
            <div>
              <span className="hq-eyebrow">Customers by offer</span>
              <h2>Who is buying each product?</h2>
              <p>
                Connected purchases only. Open an offer to manage its pricing,
                fulfillment, and settings.
              </p>
            </div>
          </header>
          <div>
            {catalog.map((item) => {
              const performance = productPerformance.find(
                (candidate) => candidate.catalogItemId === item.id,
              );
              const customers = workspace.productCustomers.filter(
                (customer) => customer.catalogItemId === item.id,
              );
              return (
                <article key={item.id}>
                  <header>
                    <Link href={`/products/${item.id}`}>
                      <span>
                        <strong>{item.title}</strong>
                        <small>
                          {performance?.paidPurchases ?? 0} purchase
                          {(performance?.paidPurchases ?? 0) === 1 ? "" : "s"}
                        </small>
                      </span>
                      <ArrowRight aria-hidden size={16} />
                    </Link>
                    <span>
                      <strong>{performance?.uniqueCustomers ?? 0}</strong>
                      <small>customers</small>
                    </span>
                  </header>
                  {customers.length > 0 && (
                    <div className="product-customer-activity__people">
                      {customers.slice(0, 6).map((customer) => (
                        <Link
                          href={`/members/${customer.personId}`}
                          key={customer.personId}
                        >
                          {customer.displayName}
                        </Link>
                      ))}
                      {customers.length > 6 && (
                        <span>+{customers.length - 6} more</span>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
            {catalog.length === 0 && (
              <div className="hq-empty">
                <strong>
                  Customers will appear after the first offer is live.
                </strong>
                <span>
                  Create an offer, set the right audience, then publish it.
                </span>
              </div>
            )}
          </div>
        </section>
      )}
      <section className="hq-card catalog-inventory-card">
        <header className="hq-card-heading">
          <div>
            <span className="hq-eyebrow">Catalog</span>
            <h2>
              {catalog.length} {scopeLabel?.toLowerCase() ?? "products"}
            </h2>
            <p>
              One source for storefront pricing, member pricing, credits,
              fulfillment, and inventory.
            </p>
          </div>
          <Badge>
            {catalog.filter((item) => item.status === "active").length} live
          </Badge>
        </header>
        <div className="catalog-table">
          {catalog.map((item) => (
            <Link
              aria-label={`Edit ${item.title}`}
              className="catalog-table__row"
              href={`/products/${item.id}`}
              key={item.id}
            >
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
              <ArrowRight aria-hidden size={16} />
            </Link>
          ))}
          {catalog.length === 0 && (
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
      {inventory.length > 0 && (
        <section className="hq-card inventory-snapshot-card">
          <header className="hq-card-heading">
            <div>
              <span className="hq-eyebrow">Equipment + goods</span>
              <h2>Inventory snapshot</h2>
            </div>
            <Badge>{inventory.length} stock records</Badge>
          </header>
          <div className="inventory-snapshot-grid">
            {inventory.slice(0, 8).map((stock) => (
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
                <small>
                  available from {stock.quantityReceived} received
                  {stock.unitCostMinor !== undefined
                    ? ` at ${formatMoney(
                        stock.unitCostMinor,
                        stock.currency ?? workspace.organization.currency,
                      )} each`
                    : ""}
                </small>
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
          Start with the real-world place, then manage its courts, pricing, and
          availability in focused workspaces.
        </p>
        <Link
          className="hq-button hq-button--primary module-feature-card__action"
          href="/locations/create#venue-details"
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
            href={`/locations/${venue.id}`}
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

function PaymentsPanel({
  dashboard,
  money,
}: {
  readonly dashboard: OperatorDashboard;
  readonly money: OrganizationMoneyWorkspace;
}) {
  return (
    <MoneyWorkspace
      money={money}
      organizationName={dashboard.organization.name}
    />
  );
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
        <Link className="module-card-action" href="/settings/theme">
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
  module,
  dashboard,
  eventKinds,
  focusedDraftId,
  matches,
  pageCopy,
  productScope,
  workspace,
  moneyWorkspace,
  ticketApprovals,
}: {
  readonly module: OperatorModule;
  readonly dashboard: OperatorDashboard;
  readonly eventKinds?: readonly OperatorWorkspace["sessions"][number]["kind"][];
  readonly focusedDraftId?: string;
  readonly matches: readonly OperatorScorableMatch[];
  readonly pageCopy?: ModulePageCopy;
  readonly productScope?: ProductCatalogScope;
  readonly workspace: OperatorWorkspace;
  readonly moneyWorkspace?: OrganizationMoneyWorkspace;
  readonly ticketApprovals: readonly TicketApprovalSummary[];
}) {
  if (module === "overview" || module === "messages") return null;
  const copy = pageCopy ?? moduleCopy[module];
  const icon =
    module === "calendar"
      ? CalendarDays
      : module === "locations"
        ? MapPinned
        : module === "members"
          ? UsersRound
          : module === "team"
            ? UsersRound
            : module === "products"
              ? ShoppingBag
              : module === "payments"
                ? CreditCard
                : module === "marketing"
                  ? MessageSquareText
                  : module === "ai"
                    ? Bot
                    : Trophy;
  const Icon = icon;
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
          : module === "products"
            ? { href: "/products/create", label: "Create product" }
            : module === "locations"
              ? { href: "/locations/create", label: "Add venue" }
              : module === "members"
                ? { href: "/members/invite", label: "Invite person" }
                : module === "team"
                  ? { href: "/team/invite", label: "Invite team member" }
                  : module === "marketing"
                    ? { href: "/marketing/create", label: "Create campaign" }
                    : module === "payments"
                      ? { href: "/payments/setup", label: "Configure money" }
                      : module === "calendar"
                        ? { href: "/events/create", label: "Add to calendar" }
                        : undefined;

  return (
    <main
      className={`hq-page module-page${module === "leagues" ? " module-page--leagues" : ""}`}
    >
      <header className="hq-page-heading">
        <div>
          <span className="hq-eyebrow">{copy.eyebrow}</span>
          <h1>{copy.title}</h1>
          <p>{copy.description}</p>
        </div>
        {createAction && (
          <Link
            className="hq-button hq-button--primary"
            href={createAction.href}
          >
            <Plus size={17} /> {createAction.label}
          </Link>
        )}
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
        <>
          <VenueMatchOperations
            matches={matches}
            timezone={dashboard.organization.timezone}
          />
          <ScheduleCalendar workspace={workspace} />
        </>
      ) : module === "locations" ? (
        <VenuePortfolioPanel workspace={workspace} />
      ) : module === "members" ? (
        <PeopleWorkspace workspace={workspace} />
      ) : module === "team" ? (
        <TeamPanel workspace={workspace} />
      ) : module === "products" ? (
        <ProductCatalogPanel scope={productScope} workspace={workspace} />
      ) : module === "events" ? (
        <>
          <SessionDraftManager
            focusedDraftId={focusedDraftId}
            kinds={
              eventKinds ?? ["tournament", "clinic", "open-play", "pickup"]
            }
            workspace={workspace}
          />
          <EventHistoryWorkspace
            kinds={
              eventKinds ?? [
                "tournament",
                "clinic",
                "open-play",
                "pickup",
                "private-lesson",
                "court-rental",
              ]
            }
            workspace={workspace}
          />
          <EventInventory dashboard={dashboard} kinds={eventKinds} />
        </>
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
      ) : module === "payments" ? (
        moneyWorkspace ? (
          <PaymentsPanel dashboard={dashboard} money={moneyWorkspace} />
        ) : null
      ) : module === "marketing" ? (
        <MessagesPanel workspace={workspace} />
      ) : module === "reports" ? (
        <ReportsPanel dashboard={dashboard} />
      ) : module === "ai" ? (
        <AiPanel dashboard={dashboard} />
      ) : (
        <SettingsPanel dashboard={dashboard} workspace={workspace} />
      )}
    </main>
  );
}
