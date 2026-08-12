export type Currency = "USD" | "CAD" | "AUD" | "BRL" | "EUR";

export interface Money {
  readonly amountMinor: number;
  readonly currency: Currency;
}

export type Discipline =
  "beach-2s" | "beach-4s" | "beach-6s" | "grass" | "indoor";

export type RatingConfidence =
  "Provisional" | "Developing" | "Reliable" | "Locked";

export type PersonRole =
  | "player"
  | "guardian"
  | "coach"
  | "owner"
  | "manager"
  | "front-desk"
  | "scorekeeper"
  | "accountant"
  | "admin"
  | "super-admin";

export interface SandRating {
  readonly display: number;
  readonly mu: number;
  readonly phi: number;
  readonly sigma: number;
  readonly confidence: RatingConfidence;
  readonly discipline: Discipline;
  readonly delta?: number;
  readonly percentile?: number;
}

export interface PersonSummary {
  readonly id: string;
  readonly displayName: string;
  readonly handle: string;
  readonly publicPath?: string;
  readonly initials: string;
  readonly homeMarket: string;
  readonly rating: SandRating;
  readonly roles: readonly PersonRole[];
  readonly isMinor?: boolean;
  readonly guardianIds?: readonly string[];
  readonly avatarUrl?: string;
  readonly profileClaimStatus?:
    "claimed" | "unclaimed" | "claim-pending" | "merged";
  readonly isProfessional?: boolean;
}

export interface OrganizationSummary {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly legalName: string;
  readonly plan: "coach" | "small-club" | "club" | "multi-venue";
  readonly memberCount: number;
  readonly staffCount: number;
  readonly venueCount: number;
  readonly timezone: string;
  readonly stripeStatus: "connected" | "pending" | "restricted";
  readonly effectivePlan?: "coach" | "small-club" | "club" | "multi-venue";
  readonly operatorCommissionBps?: number;
  readonly commissionSource?: "plan-default" | "admin-override";
  readonly stripeFeeMetadataStatus?:
    "not-connected" | "pending" | "synced" | "failed";
}

export interface VenueSummary {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly city: string;
  readonly region: string;
  readonly timezone: string;
  readonly courtCount: number;
  readonly openNow: boolean;
  readonly latitude: number;
  readonly longitude: number;
  readonly imageUrl?: string;
  readonly tags: readonly string[];
}

export type EventKind =
  | "tournament"
  | "league"
  | "clinic"
  | "open-play"
  | "private-lesson"
  | "court-rental"
  | "pickup";

export type EventTeamFormat =
  "solo" | "doubles" | "three-person" | "four-person" | "six-person";

export type EventSurface = "sand" | "grass" | "water" | "indoor-sand";

export type EventGender = "mens" | "womens" | "coed" | "open";

export type TournamentFormat =
  | "kob-qob"
  | "single-elimination"
  | "double-elimination-true"
  | "double-elimination-crossover";

export type EventSeedingMethod =
  | "first-come"
  | "sand-rating-score"
  | "sand-rating-best-8"
  | "sand-rating-ttm"
  | "manual";

export interface EventMedia {
  readonly id: string;
  readonly kind: "image" | "video";
  readonly url: string;
  readonly alt?: string;
  readonly posterUrl?: string;
}

export interface EventLocation {
  readonly mode: "venue" | "address" | "online";
  readonly venueName: string;
  readonly address?: string;
  readonly googlePlaceId?: string;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly confidence?: "confirmed" | "approximate";
  readonly onlineUrl?: string;
  readonly courtNames?: readonly string[];
}

export interface EventAttendeeSummary {
  readonly id: string;
  readonly displayName: string;
  readonly handle: string;
  readonly publicPath?: string;
  readonly initials: string;
  readonly avatarUrl?: string;
  readonly homeMarket?: string;
  readonly ratingDisplay?: number;
}

export interface EventRegistrationTeamSummary {
  readonly id: string;
  readonly divisionId: string;
  readonly divisionName: string;
  readonly name: string;
  readonly seed?: number;
  readonly status: "confirmed" | "waitlisted";
  readonly registeredAt: string;
  readonly averageRating?: number;
  readonly players: readonly {
    readonly displayName: string;
    readonly initials: string;
    readonly avatarUrl?: string;
    readonly publicPath?: string;
    readonly ratingDisplay?: number;
  }[];
}

export interface EventHostSummary {
  readonly id: string;
  readonly displayName: string;
  readonly handle: string;
  readonly initials: string;
  readonly avatarUrl?: string;
}

export interface EventFeature {
  readonly id: string;
  readonly kind: "guest" | "activity" | "sponsor";
  readonly title: string;
  readonly description?: string;
  readonly personId?: string;
  readonly personHandle?: string;
  readonly personPublicPath?: string;
  readonly personInitials?: string;
  readonly personName?: string;
  readonly personHomeMarket?: string;
  readonly personRating?: number;
  readonly imageUrl?: string;
}

export interface EventPolicy {
  readonly id: string;
  readonly kind: "policy" | "waiver";
  readonly title: string;
  readonly markdown: string;
  readonly required: boolean;
  readonly requireFullScroll: boolean;
}

export interface LeagueRecurrence {
  readonly interval: "weekly" | "biweekly";
  readonly days: readonly {
    readonly day:
      | "monday"
      | "tuesday"
      | "wednesday"
      | "thursday"
      | "friday"
      | "saturday"
      | "sunday";
    readonly startsAt: string;
    readonly endsAt: string;
  }[];
  readonly substitutesAllowed: boolean;
  readonly substituteApprovalRequired: boolean;
  readonly teamAssignment: "signup" | "rating-balanced" | "manual";
}

export interface EventPoolPlay {
  readonly enabled: boolean;
  readonly teamsPerPool: number;
  readonly format: "full" | "olympic-crossover";
  readonly teamsAdvancing: number;
}

export interface EventDivisionSummary {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly discipline: Discipline;
  readonly ratingBasis: string;
  readonly price: Money;
  /** Full-roster entry price. Kept separate from price so both buying paths can be shown. */
  readonly teamPrice: Money;
  /** One player's share when teammates pay separately. */
  readonly playerPrice: Money;
  readonly spotsRemaining: number;
  readonly capacity: number;
  readonly minimumTeams?: number;
  readonly maximumTeams?: number;
  readonly teamFormat?: EventTeamFormat;
  readonly teamSize?: number;
  readonly surface?: EventSurface;
  readonly gender?: EventGender;
  readonly priceBasis?: "per-person" | "per-team";
  readonly ratingMinimum?: number;
  readonly ratingMaximum?: number;
  readonly ageMinimum?: number;
  readonly ageMaximum?: number;
  readonly tournamentFormat?: TournamentFormat;
  readonly poolPlay?: EventPoolPlay;
  readonly seeding?: EventSeedingMethod;
}

export interface EventTicketSummary {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly price: Money;
  readonly quantity?: number;
  readonly remaining?: number;
  readonly waitlistEnabled: boolean;
  readonly approvalRequired: boolean;
  readonly availableOnline: boolean;
  readonly availableInPerson: boolean;
}

export type WeatherIcon =
  | "clear"
  | "mostly-clear"
  | "partly-cloudy"
  | "cloudy"
  | "fog"
  | "drizzle"
  | "rain"
  | "snow"
  | "storm"
  | "wind"
  | "unknown";

export interface WeatherForecastPoint {
  readonly startsAt: string;
  readonly temperatureC?: number;
  readonly apparentTemperatureC?: number;
  readonly precipitationProbability?: number;
  readonly precipitationIntensity?: number;
  readonly windSpeedKph?: number;
  readonly windGustKph?: number;
  readonly humidity?: number;
  readonly weatherCode?: number;
  readonly condition: string;
  readonly icon: WeatherIcon;
}

export interface WeatherForecastDay {
  readonly date: string;
  readonly temperatureHighC?: number;
  readonly temperatureLowC?: number;
  readonly precipitationProbability?: number;
  readonly windGustKph?: number;
  readonly weatherCode?: number;
  readonly condition: string;
  readonly icon: WeatherIcon;
  readonly sunriseAt?: string;
  readonly sunsetAt?: string;
  readonly daylightSource: "tomorrow.io" | "calculated";
}

export interface WeatherForecast {
  readonly provider: "Tomorrow.io";
  readonly source: "tomorrow.io" | "calculated-daylight";
  readonly latitude: number;
  readonly longitude: number;
  readonly timezone: string;
  readonly fetchedAt: string;
  readonly updatedAt: string;
  readonly expiresAt: string;
  readonly hourly: readonly WeatherForecastPoint[];
  readonly days: readonly WeatherForecastDay[];
}

export interface EventSummary {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly kind: EventKind;
  readonly organizationId?: string;
  readonly organizationSlug?: string;
  readonly organizationName: string;
  readonly venueName: string;
  readonly shortSummary?: string;
  readonly description?: string;
  readonly format?: string;
  readonly recordMatches?: boolean;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly timezone: string;
  readonly price: Money;
  readonly spotsRemaining: number;
  readonly capacity: number;
  readonly ratingRange?: readonly [number, number];
  readonly divisions?: readonly EventDivisionSummary[];
  readonly tickets?: readonly EventTicketSummary[];
  readonly media?: readonly EventMedia[];
  readonly location?: EventLocation;
  readonly features?: readonly EventFeature[];
  readonly policies?: readonly EventPolicy[];
  readonly recurrence?: LeagueRecurrence;
  readonly attendees?: readonly EventAttendeeSummary[];
  readonly registrationTeams?: readonly EventRegistrationTeamSummary[];
  readonly host?: EventHostSummary;
  readonly approvalRequired?: boolean;
  readonly visibility?: "public" | "unlisted";
  readonly lifecycleStatus?: "active" | "cancelled" | "completed";
  readonly live?: boolean;
  readonly imageUrl?: string;
  readonly weather?: WeatherForecast;
  readonly tags: readonly string[];
}

export interface MatchSummary {
  readonly id: string;
  readonly status?:
    "pending-verification" | "verified" | "disputed" | "complete";
  readonly confirmationRequired?: boolean;
  readonly playedAt: string;
  readonly venueName: string;
  readonly eventName?: string;
  readonly eventSlug?: string;
  readonly roundLabel?: string;
  readonly sourceUrl?: string;
  readonly formatSummary?: string;
  readonly teamA: readonly PersonSummary[];
  readonly teamB: readonly PersonSummary[];
  readonly score: readonly (readonly [number, number])[];
  readonly winner: "A" | "B";
  readonly ratingDelta: number;
  readonly ratingBefore?: number;
  readonly ratingAfter?: number;
  readonly ratingExplanation?: {
    readonly expectedWinProbability?: number;
    readonly actualResult?: number;
    readonly pointShare?: number;
    readonly marginMultiplier?: number;
    readonly responsibilityWeight?: number;
    readonly verificationWeight?: number;
    readonly displayDelta?: number;
  };
  readonly location?: {
    readonly label: string;
    readonly googlePlaceId?: string;
    readonly name?: string;
    readonly address?: string;
    readonly latitude?: number;
    readonly longitude?: number;
  };
  readonly prediction?: {
    readonly teamA: number;
    readonly teamB: number;
    readonly favorite: "A" | "B" | "even";
    readonly outcome: "predicted" | "upset" | "even";
    readonly basis: "Sand Rating";
  };
  readonly origin?: "imported" | "self-reported" | "live-scored";
  readonly ratingEligibility?: "eligible" | "held";
  readonly matchType?: "competitive" | "friendly";
  readonly teamSize?: number;
  readonly recordingMode?: "completed" | "live";
  readonly ratingImpact?: "sand-rating" | "history-only";
  readonly dispute?: {
    readonly status: "pending" | "upheld" | "rejected" | "withdrawn";
    readonly reasonCode: string;
  };
  readonly canRemove?: boolean;
  readonly verification:
    | "live-scored"
    | "desk"
    | "both-confirmed"
    | "auto-accepted"
    | "self-reported"
    | "group-confirmed";
}

export interface BookingSummary {
  readonly id: string;
  readonly source?: "registration" | "pickup" | "court";
  readonly sessionId?: string;
  readonly sessionSlug?: string;
  readonly title: string;
  readonly kind: EventKind;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly venueName: string;
  readonly venueId?: string;
  readonly venueTimezone?: string;
  readonly organization?: {
    readonly id: string;
    readonly name: string;
    readonly slug: string;
  };
  readonly location?: {
    readonly label: string;
    readonly address?: string;
    readonly googlePlaceId?: string;
    readonly latitude?: number;
    readonly longitude?: number;
  };
  readonly court?: {
    readonly id: string;
    readonly name: string;
  };
  readonly details?: {
    readonly label: string;
    readonly path: string;
  };
  readonly status: "confirmed" | "waitlisted" | "needs-action";
  readonly amount: Money;
  readonly participantNames: readonly string[];
  readonly paymentStatus?: "free" | "paid" | "payment-required" | "refunded";
  readonly canEdit?: boolean;
  readonly canCancel?: boolean;
  readonly cancellationDeadline?: string;
  readonly addedBy?: {
    readonly personId: string;
    readonly displayName: string;
  };
  readonly paidBy?: {
    readonly personId: string;
    readonly displayName: string;
  };
  readonly pairedSpotCount?: number;
  readonly pickup?: {
    readonly capacity: number;
    readonly confirmedCount: number;
    readonly spotsRemaining: number;
    readonly waitlistEnabled: boolean;
    readonly approvalRequired: boolean;
    readonly visibility: "public" | "unlisted";
    readonly note?: string;
    readonly pricePerPerson: Money;
    readonly canAddPlayers: boolean;
    readonly isCreator: boolean;
    readonly invitationStatus?: "invited";
  };
  readonly team?: {
    readonly divisionId: string;
    readonly claimToken: string;
    readonly expectedTeamSize: number;
    readonly paymentMode: "self" | "team";
    readonly status:
      "assembling" | "ready" | "confirmed" | "cancelled" | "expired";
    readonly roster: readonly {
      readonly personId?: string;
      readonly inviteTarget?: string;
      readonly displayName: string;
      readonly status: "captain" | "selected" | "invited" | "claimed";
      readonly paid: boolean;
      readonly editable: boolean;
    }[];
  };
}

export interface WalletEntry {
  readonly id: string;
  readonly kind:
    | "load"
    | "booking"
    | "refund"
    | "prize"
    | "coach-earning"
    | "withdrawal"
    | "affiliate"
    | "adjustment"
    | "chargeback";
  readonly description: string;
  readonly amount: Money;
  readonly occurredAt: string;
  readonly status: "pending" | "available" | "complete" | "held";
  readonly taxCharacter: "none" | "prize" | "contractor" | "affiliate";
}

export interface Metric {
  readonly label: string;
  readonly value: string;
  readonly change?: string;
  readonly trend?: "up" | "down" | "flat";
  readonly tone?: "default" | "positive" | "warning" | "danger";
}

export interface NavItem {
  readonly label: string;
  readonly href: string;
  readonly badge?: string;
}

export interface AuditEvent {
  readonly id: string;
  readonly occurredAt: string;
  readonly actorName: string;
  readonly action: string;
  readonly entity: string;
  readonly reason: string;
  readonly severity: "info" | "attention" | "critical";
}
