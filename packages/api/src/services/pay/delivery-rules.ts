/**
 * Which delivery rule a sold line follows (payout-policy §4 table). Pure.
 */
import type { PayPolicySettings } from "./policy-settings";
import type { PayDeliveryRule } from "./release-rules";

export interface SoldLine {
  /** `order_items.kind`: booking, ticket, registration, catalog-<type>, ... */
  readonly itemKind: string;
  readonly catalogType?: "event" | "service" | "good" | "plan";
  readonly catalogSubtype?: string;
  /** `payments.method`. */
  readonly paymentMethod?: string;
  /** Scheduled delivery window, when the line has one. */
  readonly deliveryStartsAt?: Date;
  readonly deliveryEndsAt?: Date;
  /** Number of scheduled sessions the line covers (programs, leagues). */
  readonly sessionCount: number;
}

const IN_PERSON_METHODS = new Set(["card-present", "stripe-terminal"]);
const DAY_MS = 24 * 60 * 60 * 1000;

export function productKindFor(line: SoldLine): string {
  if (line.catalogType && line.catalogSubtype) {
    return `${line.catalogType}/${line.catalogSubtype}`;
  }
  switch (line.itemKind) {
    case "booking":
      return "service/court-rental";
    case "ticket":
    case "registration":
      return "event/entry";
    case "catalog-plan":
      return "plan/membership";
    default:
      return line.itemKind.slice(0, 64) || "other";
  }
}

function spanDays(line: SoldLine): number | undefined {
  if (!line.deliveryStartsAt || !line.deliveryEndsAt) return undefined;
  return (
    (line.deliveryEndsAt.getTime() - line.deliveryStartsAt.getTime()) / DAY_MS
  );
}

function eventRule(line: SoldLine, policy: PayPolicySettings): PayDeliveryRule {
  const days = spanDays(line);
  if (days !== undefined && days > policy.eventMaxDays) {
    return line.sessionCount > 1 ? "pro-rata-sessions" : "pro-rata-weekly";
  }
  return days !== undefined && days >= 1 ? "event-last-day" : "scheduled-end";
}

export function deliveryRuleFor(
  line: SoldLine,
  policy: PayPolicySettings,
): PayDeliveryRule {
  if (line.paymentMethod && IN_PERSON_METHODS.has(line.paymentMethod)) {
    return "instant";
  }
  if (line.catalogType === "plan") {
    if (line.catalogSubtype === "membership") return "membership-period";
    return "credit-pack-reserve";
  }
  if (line.catalogType === "good") {
    if (line.catalogSubtype === "digital-content") return "instant";
    if (line.catalogSubtype === "rental" && line.deliveryEndsAt) {
      return "scheduled-end";
    }
    return "goods-fulfilment";
  }
  if (line.catalogType === "event") {
    if (line.catalogSubtype === "league") {
      return line.sessionCount > 1 ? "pro-rata-sessions" : "pro-rata-weekly";
    }
    return eventRule(line, policy);
  }
  if (line.catalogType === "service") {
    if (line.catalogSubtype === "program") {
      if (line.sessionCount > 1) return "pro-rata-sessions";
      return line.deliveryStartsAt && line.deliveryEndsAt
        ? "pro-rata-weekly"
        : "scheduled-end";
    }
    return "scheduled-end";
  }
  switch (line.itemKind) {
    case "booking":
      return "scheduled-end";
    case "ticket":
    case "registration":
      return eventRule(line, policy);
    case "catalog-plan":
      return "membership-period";
    default:
      // Unknown lines wait for an explicit delivery fact: safest default.
      return "scheduled-end";
  }
}
