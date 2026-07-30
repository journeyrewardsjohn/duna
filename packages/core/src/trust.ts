export type TrustReportKind =
  | "minor-safety"
  | "harassment"
  | "content"
  | "rating-integrity"
  | "payment"
  | "wallet-fraud"
  | "account-takeover";

export interface TrustTriageDecision {
  readonly priority: "urgent" | "high" | "normal";
  readonly dueAt: string;
  readonly payoutHoldRequired: boolean;
  readonly humanReviewRequired: true;
}

export function triageTrustReport(input: {
  readonly kind: TrustReportKind;
  readonly createdAt: string;
  readonly subjectIsMinor: boolean;
}): TrustTriageDecision {
  const urgent =
    input.subjectIsMinor ||
    input.kind === "minor-safety" ||
    input.kind === "account-takeover";
  const high =
    !urgent &&
    (input.kind === "payment" ||
      input.kind === "wallet-fraud" ||
      input.kind === "harassment");
  const dueAt = new Date(
    Date.parse(input.createdAt) + (urgent ? 1 : high ? 2 : 4) * 60 * 60_000,
  ).toISOString();
  return {
    priority: urgent ? "urgent" : high ? "high" : "normal",
    dueAt,
    payoutHoldRequired:
      input.kind === "wallet-fraud" || input.kind === "account-takeover",
    humanReviewRequired: true,
  };
}

export interface WalletRiskEvent {
  readonly id: string;
  readonly kind: "load" | "spend" | "withdrawal" | "login";
  readonly amountMinor: number;
  readonly occurredAt: string;
  readonly paymentFingerprint?: string;
  readonly ipAddress?: string;
  readonly succeeded: boolean;
}

export interface WalletRiskDecision {
  readonly risk: "clear" | "review" | "hold";
  readonly reasons: readonly (
    | "rapid-load-velocity"
    | "card-testing"
    | "load-spend-withdraw"
    | "new-ip-before-withdrawal"
  )[];
  readonly spendingBlocked: boolean;
  readonly payoutHeld: boolean;
}

export function evaluateWalletRisk(input: {
  readonly events: readonly WalletRiskEvent[];
  readonly evaluatedAt: string;
  readonly loadCountLimit10Minutes?: number;
  readonly failedCardLimit10Minutes?: number;
}): WalletRiskDecision {
  const now = Date.parse(input.evaluatedAt);
  const tenMinutesAgo = now - 10 * 60_000;
  const dayAgo = now - 24 * 60 * 60_000;
  const recent = input.events.filter(
    (event) => Date.parse(event.occurredAt) >= tenMinutesAgo,
  );
  const lastDay = input.events.filter(
    (event) => Date.parse(event.occurredAt) >= dayAgo,
  );
  const reasons: WalletRiskDecision["reasons"][number][] = [];
  const loads = recent.filter(
    (event) => event.kind === "load" && event.succeeded,
  );
  const failedCards = recent.filter(
    (event) => event.kind === "load" && !event.succeeded,
  );
  if (loads.length >= (input.loadCountLimit10Minutes ?? 4)) {
    reasons.push("rapid-load-velocity");
  }
  if (failedCards.length >= (input.failedCardLimit10Minutes ?? 5)) {
    reasons.push("card-testing");
  }

  const load = lastDay.find(
    (event) => event.kind === "load" && event.succeeded,
  );
  const spend = lastDay.find(
    (event) => event.kind === "spend" && event.succeeded,
  );
  const withdrawal = lastDay.find(
    (event) => event.kind === "withdrawal" && event.succeeded,
  );
  if (
    load &&
    spend &&
    withdrawal &&
    Date.parse(load.occurredAt) < Date.parse(spend.occurredAt) &&
    Date.parse(spend.occurredAt) < Date.parse(withdrawal.occurredAt)
  ) {
    reasons.push("load-spend-withdraw");
  }

  const loginIps = new Set(
    lastDay
      .filter((event) => event.kind === "login" && event.ipAddress)
      .map((event) => event.ipAddress),
  );
  if (withdrawal?.ipAddress && !loginIps.has(withdrawal.ipAddress)) {
    reasons.push("new-ip-before-withdrawal");
  }

  const hold =
    reasons.includes("card-testing") ||
    reasons.includes("load-spend-withdraw") ||
    reasons.includes("new-ip-before-withdrawal");
  return {
    risk: hold ? "hold" : reasons.length > 0 ? "review" : "clear",
    reasons,
    spendingBlocked: hold,
    payoutHeld: hold,
  };
}

export function authorizePiiAccess(input: {
  readonly roles: readonly string[];
  readonly scopes: readonly string[];
  readonly reason: string;
}): {
  readonly allowed: boolean;
  readonly auditRequired: boolean;
  readonly reason?:
    "admin-role-required" | "pii-scope-required" | "reason-required";
} {
  if (!input.roles.includes("admin") && !input.roles.includes("super-admin")) {
    return {
      allowed: false,
      auditRequired: false,
      reason: "admin-role-required",
    };
  }
  if (!input.scopes.includes("*") && !input.scopes.includes("pii:read")) {
    return {
      allowed: false,
      auditRequired: false,
      reason: "pii-scope-required",
    };
  }
  if (input.reason.trim().length < 8) {
    return {
      allowed: false,
      auditRequired: false,
      reason: "reason-required",
    };
  }
  return { allowed: true, auditRequired: true };
}

export function evaluateCoachMarketplaceGate(input: {
  readonly backgroundCheckStatus:
    "not-started" | "pending" | "clear" | "review" | "expired";
  readonly minorFacing: boolean;
  readonly marketplaceOriginatedClient: boolean;
  readonly relationshipStartedAt?: string;
  readonly evaluatedAt: string;
}): {
  readonly canPublish: boolean;
  readonly takeRateEligible: boolean;
  readonly reasons: readonly (
    "background-check-required" | "relationship-start-required"
  )[];
} {
  const reasons: (
    "background-check-required" | "relationship-start-required"
  )[] = [];
  if (input.minorFacing && input.backgroundCheckStatus !== "clear") {
    reasons.push("background-check-required");
  }
  if (input.marketplaceOriginatedClient && !input.relationshipStartedAt) {
    reasons.push("relationship-start-required");
  }
  const withinTwelveMonths =
    input.relationshipStartedAt !== undefined &&
    Date.parse(input.evaluatedAt) - Date.parse(input.relationshipStartedAt) <
      365 * 24 * 60 * 60_000;
  return {
    canPublish: !reasons.includes("background-check-required"),
    takeRateEligible:
      input.marketplaceOriginatedClient &&
      withinTwelveMonths &&
      !reasons.includes("relationship-start-required"),
    reasons,
  };
}

export function validateReviewIntegrity(input: {
  readonly reviewerPersonId: string;
  readonly coachPersonId: string;
  readonly completedBookingPersonIds: readonly string[];
}): {
  readonly allowed: boolean;
  readonly reason?: "self-review" | "verified-booking-required";
} {
  if (input.reviewerPersonId === input.coachPersonId) {
    return { allowed: false, reason: "self-review" };
  }
  if (!input.completedBookingPersonIds.includes(input.reviewerPersonId)) {
    return { allowed: false, reason: "verified-booking-required" };
  }
  return { allowed: true };
}
