import type { PublicCatalogItem } from "@duna/api";
import {
  formatMoney,
  participationDisplay,
  participationToken,
  renderParticipationCopy,
  renderParticipationDisplay,
  type ParticipationDecisionOutcome,
  type ParticipationTone,
  type ResolvedParticipationRule,
} from "@duna/core";
import { priceConsumerOrder, type OrderItemKind } from "@duna/pricing";

/**
 * What a club sells, read for its public pages. Pure: prices go through
 * `@duna/pricing` (the same consumer fee composition checkout charges, so a
 * price is shown all-in), group-session words through `@duna/core`'s one
 * participation display (`participationDisplay` + the shared copy). Nothing
 * here invents a price, a fee or a state: when the data does not say, the
 * model says nothing.
 */

export type Offering = PublicCatalogItem;
export type Occurrence = Offering["upcomingOccurrences"][number];

/** The three doors on a club page (and the shop). */
export type Door = "play" | "train" | "join" | "shop";

const PLAY_WORDS = ["open-play", "open play", "pickup", "drop-in", "court"];

export function offeringDoor(
  item: Pick<Offering, "type" | "subtype" | "title">,
): Door {
  if (item.type === "plan") return "join";
  if (item.type === "good") return "shop";
  const text = `${item.subtype} ${item.title}`.toLowerCase();
  if (item.type === "event") return "play";
  return PLAY_WORDS.some((word) => text.includes(word)) ? "play" : "train";
}

/** The order item kind checkout prices the offering as (catalog-checkout.ts). */
export function orderItemKind(
  item: Pick<Offering, "type" | "subtype">,
): OrderItemKind {
  if (item.type === "event") return "registration";
  if (item.type === "service") return "booking";
  if (item.type === "good") return "merchandise";
  return item.subtype === "membership" ? "membership" : "package";
}

/** "Open play", "Private lesson": the club's subtype in words. */
export function subtypeWords(subtype: string): string {
  const words = subtype.replaceAll(/[-_]+/g, " ").trim();
  return words ? words[0]!.toUpperCase() + words.slice(1) : "Offering";
}

export interface AllInPrice {
  /** The club's price for one. */
  readonly baseMinor: number;
  /** What the buyer pays by card, Duna's service fee included. */
  readonly allInMinor: number;
  readonly feeMinor: number;
  readonly currency: string;
  readonly recurring?: "week" | "month" | "year";
  /** "$16.50" */
  readonly label: string;
}

/** The all-in card price for one unit of `amountMinor`. */
export function allInPrice(input: {
  readonly amountMinor: number;
  readonly currency: string;
  readonly kind: OrderItemKind;
  readonly recurring?: "week" | "month" | "year";
}): AllInPrice {
  const currency = input.currency.toUpperCase();
  const priced =
    input.amountMinor > 0
      ? priceConsumerOrder({
          items: [
            {
              id: "quote",
              kind: input.kind,
              description: "quote",
              quantity: 1,
              unitAmountMinor: input.amountMinor,
            },
          ],
          currency: currency as Parameters<
            typeof priceConsumerOrder
          >[0]["currency"],
          isDunaPlus: false,
        })
      : undefined;
  const allInMinor = priced?.totalMinor ?? 0;
  return {
    baseMinor: input.amountMinor,
    allInMinor,
    feeMinor: allInMinor - input.amountMinor,
    currency,
    ...(input.recurring ? { recurring: input.recurring } : {}),
    label: allInMinor === 0 ? "Free" : formatMoney(allInMinor, currency),
  };
}

const PER = { week: "a week", month: "a month", year: "a year" } as const;

/** "$45 a month", "$16.50", "Free". */
export function priceWords(price: AllInPrice): string {
  return price.recurring
    ? `${price.label} ${PER[price.recurring]}`
    : price.label;
}

export interface OfferingPrice {
  /** The lowest public card price, all-in. */
  readonly card?: AllInPrice;
  /** More than one card price (variants or plans): "From". */
  readonly from: boolean;
  readonly credits?: number;
  readonly cash: boolean;
  /** No price a visitor can pay online. */
  readonly notOnSale: boolean;
}

type Price = Offering["variants"][number]["prices"][number];

function publicPrice(price: Price): boolean {
  return price.audience === "everyone" || price.audience === "non-member";
}

/** The price a visitor sees for an offering (member prices are not shown as theirs). */
export function offeringPrice(
  item: Offering,
  variantId?: string,
): OfferingPrice {
  const variants = variantId
    ? item.variants.filter((variant) => variant.id === variantId)
    : item.variants;
  const prices = variants.flatMap((variant) => variant.prices);
  const cards = prices.filter(
    (price) =>
      price.paymentKind === "card" &&
      price.amountMinor !== undefined &&
      price.currency &&
      publicPrice(price),
  );
  const lowest = cards.toSorted(
    (left, right) => (left.amountMinor ?? 0) - (right.amountMinor ?? 0),
  )[0];
  const credit = prices
    .filter((price) => price.paymentKind === "credit" && price.creditAmount)
    .toSorted(
      (left, right) => (left.creditAmount ?? 0) - (right.creditAmount ?? 0),
    )[0];
  const card =
    lowest && item.allowCard
      ? allInPrice({
          amountMinor: lowest.amountMinor!,
          currency: lowest.currency!,
          kind: orderItemKind(item),
          ...(lowest.recurringInterval
            ? { recurring: lowest.recurringInterval }
            : {}),
        })
      : undefined;
  const distinct = new Set(cards.map((price) => price.amountMinor));
  return {
    ...(card ? { card } : {}),
    from: distinct.size > 1,
    ...(credit?.creditAmount && item.allowCredits
      ? { credits: credit.creditAmount }
      : {}),
    cash: item.allowCash,
    notOnSale: !card && !(credit && item.allowCredits) && !item.allowCash,
  };
}

/** "$16.50 all-in · or 2 credits", "From $45 a month", "Not on sale online". */
export function offeringPriceLine(price: OfferingPrice): string {
  const parts: string[] = [];
  if (price.card) {
    parts.push(`${price.from ? "From " : ""}${priceWords(price.card)}`);
  }
  if (price.credits) {
    parts.push(
      `${parts.length ? "or " : ""}${price.credits} credit${price.credits === 1 ? "" : "s"}`,
    );
  }
  if (parts.length === 0 && price.cash) parts.push("Pay at the club");
  return parts.join(" · ") || "Not on sale online";
}

/** One sentence on what "all-in" includes, only when there is a fee to explain. */
export function allInNote(price: AllInPrice | undefined): string | undefined {
  if (!price || price.feeMinor <= 0) return undefined;
  return `All-in: ${formatMoney(price.baseMinor, price.currency)} to the club plus Duna's ${formatMoney(price.feeMinor, price.currency)} service fee. Sales tax, where it applies, is added at checkout.`;
}

// ---------- Group sessions (participation.md §7: the shared words) ----------

const OUTCOME_FOR_STATUS: Readonly<
  Record<string, ParticipationDecisionOutcome | undefined>
> = {
  confirmed: "minimum-met",
  "running-under-minimum": "run-under-minimum",
  "cancelled-under-minimum": "cancel-under-minimum",
};

/** The group rule an offering publishes, resolved for one session. */
export function ruleForOffering(
  item: Pick<Offering, "participation">,
  capacity: number,
): ResolvedParticipationRule | undefined {
  const summary = item.participation;
  if (!summary) return undefined;
  return {
    version: 2,
    unit: "player",
    minParticipants: summary.minParticipants,
    maxParticipants: summary.maxParticipants,
    minimumPolicy: summary.minimumPolicy === "cancel" ? "cancel" : "run",
    lockMinutesBeforeStart: summary.cutoffMinutesBeforeStart,
    // The public summary does not say; checkout's quote does.
    waitlist: false,
    tiers: summary.creditTiers.map((tier) => ({
      minParticipants: tier.minParticipants,
      maxParticipants: tier.maxParticipants,
      creditsPerPlayer: tier.creditsPerPlayer,
    })),
    capacity,
  };
}

export interface SessionState {
  readonly state: string;
  readonly tone: ParticipationTone;
  readonly hasGroupRule: boolean;
  /** "Needs 2 more", "3 spots left", "Full". */
  readonly status: string;
  /** "Cancelled if under 4 at …", "2 waiting". */
  readonly line?: string;
  /** "3 credits now · 2 at 8 players". */
  readonly price?: string;
  readonly ladder: readonly string[];
  readonly cancellation?: string;
  readonly a11y: string;
  readonly spotsLeft: number;
  readonly waiting: number;
}

/** A session's state in the shared words, from the storefront's numbers. */
export function sessionState(input: {
  readonly item: Pick<Offering, "participation" | "title">;
  readonly occurrence: Occurrence;
  readonly clubName: string;
  readonly now: Date;
}): SessionState | undefined {
  const state = input.occurrence.participation;
  const capacity = state?.capacity ?? input.occurrence.capacity;
  if (!capacity) return undefined;
  const rule = ruleForOffering(input.item, capacity);
  const lock = state?.lockAt ?? state?.decisionAt;
  const display = participationDisplay({
    rule,
    title: input.item.title,
    capacity,
    booked: state?.bookedCount ?? input.occurrence.bookedCount ?? 0,
    held: state?.heldCount,
    waiting: state?.waitlistCount,
    outcome: state ? (OUTCOME_FOR_STATUS[state.status] ?? null) : null,
    decidedGroupSize: state?.settledHeadcount ?? null,
    lockAt: lock ? new Date(lock) : undefined,
    startsAt: new Date(input.occurrence.startsAt),
    endsAt: new Date(input.occurrence.endsAt),
    now: input.now,
    timeZone: input.occurrence.timezone,
    clubName: input.clubName,
    payment: { method: "credit" },
    freeCancelUntil: state?.freeCancelUntil
      ? new Date(state.freeCancelUntil)
      : undefined,
  });
  const copy = renderParticipationDisplay(display);
  return {
    state: display.state,
    tone: display.tone,
    hasGroupRule: display.hasGroupRule,
    status: copy.status,
    ...(copy.line ? { line: copy.line } : {}),
    ...(copy.price ? { price: copy.price } : {}),
    ladder: copy.ladder,
    ...(copy.cancellation ? { cancellation: copy.cancellation } : {}),
    a11y: copy.a11y,
    spotsLeft: display.numbers.spotsLeft,
    waiting: display.numbers.waiting,
  };
}

/** "3 spots left" / "Full", in the shared words, for a capacity without a rule. */
export function spotsWords(spotsLeft: number): string {
  return renderParticipationCopy(
    spotsLeft > 0
      ? participationToken("status.spots", { n: spotsLeft })
      : participationToken("status.full"),
  );
}

/**
 * What happens if the group is too small, in one sentence, from the rule the
 * club published. Undefined when the offering has no minimum.
 */
export function minimumSentence(
  item: Pick<Offering, "participation">,
): string | undefined {
  const rule = item.participation;
  if (!rule || rule.minParticipants <= 1) return undefined;
  const hours = Math.round(rule.cutoffMinutesBeforeStart / 60);
  const when =
    hours >= 1
      ? `${hours} hour${hours === 1 ? "" : "s"} before it starts`
      : "when it starts";
  return rule.minimumPolicy === "cancel"
    ? `Runs with ${rule.minParticipants} or more players. If fewer have booked ${when}, the club cancels it and you get everything back.`
    : `Needs ${rule.minParticipants} players to run as planned; the club runs it either way, decided ${when}.`;
}

/** "Free cancellation until 12 hours before it starts." from the published rule. */
export function cancellationSentence(
  item: Pick<Offering, "participation">,
): string | undefined {
  const rule = item.participation;
  if (!rule) return undefined;
  const hours = Math.round(rule.cutoffMinutesBeforeStart / 60);
  if (hours < 1) return undefined;
  return `Cancel free until ${hours} hour${hours === 1 ? "" : "s"} before it starts.`;
}

// ---------- Sessions and availability ----------

/** Sessions still ahead, soonest first. */
export function upcoming(item: Offering, now: Date): readonly Occurrence[] {
  return item.upcomingOccurrences
    .filter((occurrence) => Date.parse(occurrence.endsAt) > now.getTime())
    .toSorted(
      (left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt),
    );
}

export type Availability =
  | { readonly kind: "available" }
  | { readonly kind: "members-only" }
  | { readonly kind: "sold-out" }
  | { readonly kind: "full" }
  | { readonly kind: "not-on-sale" };

/** Whether a visitor can buy it now, in one word. */
export function offeringAvailability(item: Offering, now: Date): Availability {
  const price = offeringPrice(item);
  if (price.notOnSale) return { kind: "not-on-sale" };
  if (item.membershipRequired || item.visibility === "members") {
    return { kind: "members-only" };
  }
  if (item.type === "good") {
    const tracked = item.variants.filter(
      (variant) => typeof variant.availableQuantity === "number",
    );
    if (
      tracked.length > 0 &&
      tracked.length === item.variants.length &&
      tracked.every((variant) => variant.availableQuantity === 0)
    ) {
      return { kind: "sold-out" };
    }
  }
  const sessions = upcoming(item, now);
  if (
    sessions.length > 0 &&
    sessions.every((occurrence) => occurrence.spotsRemaining === 0)
  ) {
    return { kind: "full" };
  }
  return { kind: "available" };
}

export const AVAILABILITY_WORDS: Readonly<
  Record<Availability["kind"], string | undefined>
> = {
  available: undefined,
  "members-only": "Members only",
  "sold-out": "Sold out",
  full: "Full",
  "not-on-sale": "Not on sale online",
};

/** The photos of an offering: a variant's own first, then the item's. */
export function offeringImages(
  item: Offering,
  variantId?: string,
): readonly { readonly url: string; readonly alt: string }[] {
  const images = item.media.filter((media) => media.kind === "image");
  const own = variantId
    ? images.filter((media) => media.catalogVariantId === variantId)
    : [];
  const shared = images.filter((media) => !media.catalogVariantId);
  const chosen = own.length ? own : shared.length ? shared : images;
  return chosen.map((media) => ({
    url: media.url,
    alt: media.alt ?? item.title,
  }));
}

/** Membership benefits the club wrote, or credits a pack grants. */
export function offeringIncludes(item: Offering): readonly string[] {
  const configuration = item.configuration;
  const membership =
    configuration.membership &&
    typeof configuration.membership === "object" &&
    !Array.isArray(configuration.membership)
      ? (configuration.membership as Record<string, unknown>)
      : undefined;
  const benefits = Array.isArray(membership?.benefits)
    ? membership.benefits.filter(
        (benefit): benefit is string =>
          typeof benefit === "string" && Boolean(benefit.trim()),
      )
    : [];
  const highlights = Array.isArray(configuration.highlights)
    ? configuration.highlights.filter(
        (highlight): highlight is string =>
          typeof highlight === "string" && Boolean(highlight.trim()),
      )
    : [];
  const credits = Number(configuration.creditsGranted ?? 0);
  const perCycle = Number(membership?.includedCreditsPerCycle ?? 0);
  return [
    ...benefits,
    ...highlights,
    ...(Number.isSafeInteger(credits) && credits > 0
      ? [`${credits} credits to use on bookings at this club`]
      : []),
    ...(Number.isSafeInteger(perCycle) && perCycle > 0
      ? [`${perCycle} credits every billing period`]
      : []),
  ];
}

/** A string the club configured, or undefined. */
export function configured(item: Offering, key: string): string | undefined {
  const value = item.configuration[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function serviceFacts(item: Offering): {
  readonly minutes?: number;
  readonly capacity?: number;
  readonly online: boolean;
} {
  const service = item.configuration.service;
  const record =
    service && typeof service === "object" && !Array.isArray(service)
      ? (service as Record<string, unknown>)
      : {};
  const minutes = Number(record.durationMinutes ?? 0);
  const capacity = Number(record.capacity ?? 0);
  return {
    ...(minutes > 0 ? { minutes } : {}),
    ...(capacity > 0 ? { capacity } : {}),
    online: item.configuration.deliveryMode === "online",
  };
}
