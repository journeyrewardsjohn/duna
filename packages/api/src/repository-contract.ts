import type {
  AuditEvent,
  BookingSummary,
  EventSummary,
  MatchSummary,
  Metric,
  OrganizationSummary,
  PersonSummary,
  VenueSummary,
  WalletEntry,
} from "@duna/core";
import type { OrderPricing, PricedOrderItem } from "@duna/pricing";

export type Awaitable<T> = T | Promise<T>;

export interface PlayerDashboard {
  readonly player: PersonSummary;
  readonly metrics: readonly Metric[];
  readonly bookings: readonly BookingSummary[];
  readonly events: readonly EventSummary[];
  readonly feed: readonly {
    readonly id: string;
    readonly eyebrow: string;
    readonly title: string;
    readonly body: string;
    readonly meta: string;
    readonly accent: string;
  }[];
  readonly recentMatches: readonly MatchSummary[];
  readonly walletBalanceMinor: number;
  readonly currency: "USD";
}

export interface PlayerWallet {
  readonly balanceMinor: number;
  readonly availableMinor: number;
  readonly pendingMinor: number;
  readonly currency: "USD";
  readonly entries: readonly WalletEntry[];
  readonly taxFormStatus: "not-required" | "pending" | "ready";
}

export interface PickupInput {
  readonly title: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly venueName: string;
  readonly capacity: number;
  readonly ratingMinimum?: number;
  readonly ratingMaximum?: number;
}

export interface PickupMutationInput extends PickupInput {
  readonly hostPersonId: string;
  readonly organizationId?: string;
  readonly requestId: string;
  readonly ipAddress?: string;
}

export interface OperatorScheduleItem {
  readonly time: string;
  readonly court: string;
  readonly title: string;
  readonly detail: string;
  readonly state: string;
}

export interface OperatorAlert {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly action: string;
  readonly tone: string;
}

export interface OperatorDashboard {
  readonly organization: OrganizationSummary;
  readonly metrics: readonly Metric[];
  readonly schedule: readonly OperatorScheduleItem[];
  readonly events: readonly EventSummary[];
  readonly alerts: readonly OperatorAlert[];
}

export interface AdminQueue {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly age: string;
  readonly sla: string;
  readonly priority: string;
}

export interface SystemHealth {
  readonly service: string;
  readonly status: string;
  readonly detail: string;
}

export interface AdminOverview {
  readonly metrics: readonly Metric[];
  readonly queues: readonly AdminQueue[];
  readonly audit: readonly AuditEvent[];
  readonly system: readonly SystemHealth[];
}

export interface DunaRepository {
  readonly public: {
    events(): Awaitable<readonly EventSummary[]>;
    eventBySlug(slug: string): Awaitable<EventSummary | undefined>;
    venues(): Awaitable<readonly VenueSummary[]>;
    playerByHandle(handle: string): Awaitable<PersonSummary | undefined>;
  };
  readonly player: {
    dashboard(personId: string): Awaitable<PlayerDashboard>;
    matchHistory(personId: string): Awaitable<readonly MatchSummary[]>;
    wallet(personId: string): Awaitable<PlayerWallet>;
    quote(input: {
      readonly items: readonly PricedOrderItem[];
      readonly isDunaPlus: boolean;
    }): Awaitable<OrderPricing>;
    createPickup(input: PickupMutationInput): Awaitable<EventSummary>;
  };
  readonly operator: {
    dashboard(organizationId: string): Awaitable<OperatorDashboard>;
    schedule(
      organizationId: string,
    ): Awaitable<readonly OperatorScheduleItem[]>;
    organization(organizationId: string): Awaitable<OrganizationSummary>;
    members(organizationId: string): Awaitable<readonly PersonSummary[]>;
    events(organizationId: string): Awaitable<readonly EventSummary[]>;
  };
  readonly admin: {
    overview(): Awaitable<AdminOverview>;
    organizations(): Awaitable<readonly OrganizationSummary[]>;
    queues(): Awaitable<readonly AdminQueue[]>;
    audit(): Awaitable<readonly AuditEvent[]>;
  };
}
