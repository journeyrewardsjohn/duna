export interface TicketTypePolicy {
  readonly hidden: boolean;
  readonly passwordProtected: boolean;
  readonly approvalRequired: boolean;
  readonly inPersonOnly: boolean;
  readonly manualSoldOut: boolean;
  readonly transferability: "allowed" | "restricted" | "disabled";
  readonly minimumPerOrder: number;
  readonly maximumPerOrder: number;
  readonly salesStartsAt?: string;
  readonly salesEndsAt?: string;
  readonly validityStartsAt?: string;
  readonly validityEndsAt?: string;
}

export type TicketPolicyViolation =
  | "hidden-and-password-protected"
  | "invalid-order-limits"
  | "invalid-sales-window"
  | "invalid-validity-window";

function orderedWindow(
  start: string | undefined,
  end: string | undefined,
): boolean {
  if (!start || !end) return true;
  const startTime = Date.parse(start);
  const endTime = Date.parse(end);
  return (
    Number.isFinite(startTime) &&
    Number.isFinite(endTime) &&
    endTime > startTime
  );
}

export function validateTicketTypePolicy(
  policy: TicketTypePolicy,
): readonly TicketPolicyViolation[] {
  const violations: TicketPolicyViolation[] = [];
  if (policy.hidden && policy.passwordProtected) {
    violations.push("hidden-and-password-protected");
  }
  if (
    !Number.isInteger(policy.minimumPerOrder) ||
    !Number.isInteger(policy.maximumPerOrder) ||
    policy.minimumPerOrder < 1 ||
    policy.maximumPerOrder < policy.minimumPerOrder
  ) {
    violations.push("invalid-order-limits");
  }
  if (!orderedWindow(policy.salesStartsAt, policy.salesEndsAt)) {
    violations.push("invalid-sales-window");
  }
  if (!orderedWindow(policy.validityStartsAt, policy.validityEndsAt)) {
    violations.push("invalid-validity-window");
  }
  return violations;
}

export type TeamClaimStatus =
  "pending" | "claimed" | "expired" | "partner-finder" | "refunded";

export interface TeamClaimState {
  readonly registrationId: string;
  readonly payingPersonId: string;
  readonly partnerPersonId?: string;
  readonly token: string;
  readonly expiresAt: string;
  readonly rosterLockedAt?: string;
  readonly status: TeamClaimStatus;
}

export interface TeamClaimDecision {
  readonly accepted: boolean;
  readonly status: TeamClaimStatus;
  readonly partnerPersonId?: string;
  readonly rosterLockedAt?: string;
  readonly reason?:
    | "claim-not-pending"
    | "claim-token-invalid"
    | "claim-expired"
    | "paying-player-cannot-claim-partner-slot"
    | "partner-ineligible";
  readonly eligibilityReasons: readonly string[];
  readonly auditRequired: boolean;
}

export function claimTeamPartner(input: {
  readonly state: TeamClaimState;
  readonly token: string;
  readonly partnerPersonId: string;
  readonly now: string;
  readonly eligibility: {
    readonly allowed: boolean;
    readonly reasons: readonly string[];
  };
  readonly directorOverride?: {
    readonly actorPersonId: string;
    readonly reason: string;
  };
}): TeamClaimDecision {
  if (input.state.status !== "pending") {
    return {
      accepted: false,
      status: input.state.status,
      reason: "claim-not-pending",
      eligibilityReasons: [],
      auditRequired: false,
    };
  }
  if (input.token !== input.state.token) {
    return {
      accepted: false,
      status: "pending",
      reason: "claim-token-invalid",
      eligibilityReasons: [],
      auditRequired: false,
    };
  }
  if (Date.parse(input.now) >= Date.parse(input.state.expiresAt)) {
    return {
      accepted: false,
      status: "expired",
      reason: "claim-expired",
      eligibilityReasons: [],
      auditRequired: true,
    };
  }
  if (input.partnerPersonId === input.state.payingPersonId) {
    return {
      accepted: false,
      status: "pending",
      reason: "paying-player-cannot-claim-partner-slot",
      eligibilityReasons: [],
      auditRequired: false,
    };
  }
  if (
    !input.eligibility.allowed &&
    (!input.directorOverride?.actorPersonId ||
      input.directorOverride.reason.trim().length < 3)
  ) {
    return {
      accepted: false,
      status: "pending",
      reason: "partner-ineligible",
      eligibilityReasons: input.eligibility.reasons,
      auditRequired: false,
    };
  }

  return {
    accepted: true,
    status: "claimed",
    partnerPersonId: input.partnerPersonId,
    rosterLockedAt: input.now,
    eligibilityReasons: input.eligibility.reasons,
    auditRequired: true,
  };
}

export function expireTeamClaim(input: {
  readonly state: TeamClaimState;
  readonly now: string;
  readonly fallback: "partner-finder" | "refund";
}): TeamClaimState {
  if (
    input.state.status !== "pending" ||
    Date.parse(input.now) < Date.parse(input.state.expiresAt)
  ) {
    return input.state;
  }
  return {
    ...input.state,
    status: input.fallback === "partner-finder" ? "partner-finder" : "refunded",
  };
}

export type ScannableTicketStatus =
  "held" | "issued" | "transferred" | "scanned" | "void" | "refunded";

export interface TicketScanDecision {
  readonly accepted: boolean;
  readonly duplicate: boolean;
  readonly nextStatus: ScannableTicketStatus;
  readonly reason?: "not-issued" | "already-scanned" | "void" | "refunded";
  readonly event: {
    readonly ticketToken: string;
    readonly scannedAt: string;
    readonly deviceId: string;
    readonly offline: boolean;
  };
}

export function scanTicket(input: {
  readonly ticketToken: string;
  readonly status: ScannableTicketStatus;
  readonly previouslyScannedTokens: ReadonlySet<string>;
  readonly scannedAt: string;
  readonly deviceId: string;
  readonly offline: boolean;
}): TicketScanDecision {
  const event = {
    ticketToken: input.ticketToken,
    scannedAt: input.scannedAt,
    deviceId: input.deviceId,
    offline: input.offline,
  };
  if (
    input.status === "scanned" ||
    input.previouslyScannedTokens.has(input.ticketToken)
  ) {
    return {
      accepted: false,
      duplicate: true,
      nextStatus: "scanned",
      reason: "already-scanned",
      event,
    };
  }
  if (input.status === "void" || input.status === "refunded") {
    return {
      accepted: false,
      duplicate: false,
      nextStatus: input.status,
      reason: input.status,
      event,
    };
  }
  if (input.status !== "issued" && input.status !== "transferred") {
    return {
      accepted: false,
      duplicate: false,
      nextStatus: input.status,
      reason: "not-issued",
      event,
    };
  }
  return {
    accepted: true,
    duplicate: false,
    nextStatus: "scanned",
    event,
  };
}

export interface WaitlistEntry {
  readonly id: string;
  readonly position: number;
  readonly status: "waiting" | "offered" | "accepted" | "expired";
}

export function promoteWaitlist(input: {
  readonly entries: readonly WaitlistEntry[];
  readonly spots: number;
  readonly now: string;
  readonly holdMinutes: number;
}): readonly (WaitlistEntry & { readonly holdExpiresAt?: string })[] {
  const offeredIds = new Set(
    input.entries
      .filter((entry) => entry.status === "waiting")
      .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
      .slice(0, Math.max(0, input.spots))
      .map((entry) => entry.id),
  );
  const holdExpiresAt = new Date(
    Date.parse(input.now) + input.holdMinutes * 60_000,
  ).toISOString();
  return input.entries.map((entry) =>
    offeredIds.has(entry.id)
      ? { ...entry, status: "offered" as const, holdExpiresAt }
      : entry,
  );
}
