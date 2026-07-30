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
  readonly initials: string;
  readonly homeMarket: string;
  readonly rating: SandRating;
  readonly roles: readonly PersonRole[];
  readonly isMinor?: boolean;
  readonly guardianIds?: readonly string[];
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

export interface EventSummary {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly kind: EventKind;
  readonly organizationName: string;
  readonly venueName: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly timezone: string;
  readonly price: Money;
  readonly spotsRemaining: number;
  readonly capacity: number;
  readonly ratingRange?: readonly [number, number];
  readonly live?: boolean;
  readonly imageUrl?: string;
  readonly tags: readonly string[];
}

export interface MatchSummary {
  readonly id: string;
  readonly playedAt: string;
  readonly venueName: string;
  readonly teamA: readonly PersonSummary[];
  readonly teamB: readonly PersonSummary[];
  readonly score: readonly (readonly [number, number])[];
  readonly winner: "A" | "B";
  readonly ratingDelta: number;
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
  readonly title: string;
  readonly kind: EventKind;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly venueName: string;
  readonly status: "confirmed" | "waitlisted" | "needs-action";
  readonly amount: Money;
  readonly participantNames: readonly string[];
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
