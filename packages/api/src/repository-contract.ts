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
import type {
  CurrencyCode,
  OrderPricing,
  PricedOrderItem,
} from "@duna/pricing";

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

export interface PlayerSettings {
  readonly profile: {
    readonly person: PersonSummary;
    readonly email?: string;
    readonly phoneE164?: string;
    readonly visibility: "public" | "members" | "private";
    readonly locale: string;
    readonly measurementSystem: "imperial" | "metric";
    readonly ageBand: "unknown" | "under-13" | "teen" | "adult";
    readonly ageVerified: boolean;
    readonly birthDate?: string;
    readonly parentalConsentRecorded: boolean;
  };
  readonly household: readonly {
    readonly person: PersonSummary;
    readonly relationship: string;
    readonly role: "guardian" | "dependent";
    readonly verified: boolean;
    readonly emergencyContact: boolean;
    readonly canApproveSpending: boolean;
  }[];
  readonly membership?: {
    readonly id: string;
    readonly status: string;
    readonly tierName: string;
    readonly interval: "month" | "year";
    readonly priceMinor: number;
    readonly currency: CurrencyCode;
    readonly benefits: readonly string[];
    readonly currentPeriodEndsAt?: string;
    readonly pausedUntil?: string;
    readonly pauseMonthsUsed: number;
    readonly cancelAtPeriodEnd: boolean;
  };
  readonly dunaPlusPlans: readonly {
    readonly interval: "month" | "year";
    readonly priceMinor: number;
    readonly currency: CurrencyCode;
    readonly configured: boolean;
  }[];
  readonly consents: readonly {
    readonly scope:
      "transactional" | "marketing-email" | "marketing-sms" | "marketing-push";
    readonly granted: boolean;
    readonly recordedAt: string;
  }[];
  readonly privacyRequests: readonly {
    readonly id: string;
    readonly kind: "account-deletion";
    readonly status:
      "queued" | "identity-review" | "legal-hold" | "completed" | "cancelled";
    readonly requestedAt: string;
  }[];
}

export interface PickupInput {
  readonly title: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly venueName: string;
  readonly capacity: number;
  readonly format: "2s" | "4s" | "6s" | "king-queen";
  readonly note?: string;
  readonly visibility: "public" | "unlisted";
  readonly costMinor: number;
  readonly currency: "USD";
  readonly recordMatches: boolean;
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
    players(limit: number): Awaitable<readonly PersonSummary[]>;
    playerByHandle(handle: string): Awaitable<PersonSummary | undefined>;
    organizationBySlug(
      slug: string,
    ): Awaitable<OrganizationSummary | undefined>;
  };
  readonly player: {
    dashboard(personId: string): Awaitable<PlayerDashboard>;
    matchHistory(personId: string): Awaitable<readonly MatchSummary[]>;
    wallet(personId: string): Awaitable<PlayerWallet>;
    settings(personId: string): Awaitable<PlayerSettings>;
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
