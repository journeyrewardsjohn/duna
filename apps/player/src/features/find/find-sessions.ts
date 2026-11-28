/**
 * Group sessions Find can show and book (M-P1, PART-11): one occurrence of a
 * club's lesson, clinic, group training or open play, with its group rule.
 * Pure. Tested in `find-sessions.test.ts`.
 *
 * The participation words always come from `@duna/core`'s one display
 * function (`participationDisplay` + `renderParticipationDisplay`), the same
 * function `player.participation.quote` runs on the server. When the person
 * is signed in the detail screen replaces this with the server's quote (it
 * knows their own booking, their waitlist place and their payment method).
 */
import type { DunaApiClient } from "../../../mobile-api";
import {
  formatMoney,
  participationDisplay,
  renderParticipationDisplay,
  type ParticipationDecisionOutcome,
  type ResolvedParticipationRule,
} from "@duna/core";
import type { ParticipationViewInput } from "@duna/ui/native/participation";
import type { FindResult } from "./find-search";

export type Storefront = Awaited<
  ReturnType<DunaApiClient["public"]["organizationStorefront"]["query"]>
>;
export type StorefrontItem = Storefront["catalog"][number];
export type StorefrontOccurrence =
  StorefrontItem["upcomingOccurrences"][number];
export type ParticipationQuote = Awaited<
  ReturnType<DunaApiClient["player"]["participation"]["quote"]["query"]>
>;

export type SessionKind = "lesson" | "clinic" | "group" | "open-play";

export interface FindSessionPrice {
  readonly priceId: string;
  readonly kind: "card" | "credit" | "cash";
  readonly audience: "everyone" | "member" | "non-member";
  readonly amountMinor?: number;
  readonly currency?: string;
  readonly credits?: number;
}

export interface FindSession {
  /** The occurrence id (`catalogSessionOccurrenceId`). */
  readonly id: string;
  readonly catalogItemId: string;
  readonly catalogVariantId: string | null;
  readonly title: string;
  readonly kind: SessionKind;
  readonly club: {
    readonly id: string;
    readonly slug: string;
    readonly name: string;
    readonly color?: string;
  };
  readonly startsAt: string;
  readonly endsAt: string;
  readonly timeZone: string;
  readonly coachNames: readonly string[];
  readonly place?: {
    readonly name: string;
    readonly latitude?: number;
    readonly longitude?: number;
  };
  readonly summary?: string;
  readonly level?: string;
  readonly prices: readonly FindSessionPrice[];
  readonly membershipRequired: boolean;
  readonly participation?: ParticipationViewInput;
  /** Preview builds only: fixture sessions cannot be booked. */
  readonly demo?: boolean;
}

export function sessionKind(item: {
  readonly subtype: string;
  readonly title: string;
}): SessionKind {
  const text = `${item.subtype} ${item.title}`.toLowerCase();
  if (text.includes("open")) return "open-play";
  if (text.includes("clinic")) return "clinic";
  if (text.includes("group")) return "group";
  return "lesson";
}

const OUTCOME_FOR_STATUS: Readonly<
  Record<string, ParticipationDecisionOutcome | undefined>
> = {
  confirmed: "minimum-met",
  "running-under-minimum": "run-under-minimum",
  "cancelled-under-minimum": "cancel-under-minimum",
};

/** The group rule an item publishes, resolved for one occurrence. */
export function ruleForItem(
  item: Pick<StorefrontItem, "participation">,
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
    // The public summary does not say; the server's quote does.
    waitlist: false,
    tiers: summary.creditTiers.map((tier) => ({
      minParticipants: tier.minParticipants,
      maxParticipants: tier.maxParticipants,
      creditsPerPlayer: tier.creditsPerPlayer,
    })),
    capacity,
  };
}

/** The display model for an occurrence, from the storefront's numbers. */
export function occurrenceParticipation(input: {
  readonly item: Pick<StorefrontItem, "participation" | "title">;
  readonly occurrence: StorefrontOccurrence;
  readonly clubName: string;
  readonly now: Date;
  readonly viewerTimeZone?: string;
}): ParticipationViewInput | undefined {
  const state = input.occurrence.participation;
  const capacity = state?.capacity ?? input.occurrence.capacity ?? undefined;
  if (!capacity) return undefined;
  const rule = ruleForItem(input.item, capacity);
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
    viewerTimeZone: input.viewerTimeZone,
    clubName: input.clubName,
    payment: { method: "credit" },
    freeCancelUntil: state?.freeCancelUntil
      ? new Date(state.freeCancelUntil)
      : undefined,
  });
  return {
    displayState: display.state,
    display,
    copy: renderParticipationDisplay(display),
  };
}

function itemPrices(item: StorefrontItem): readonly FindSessionPrice[] {
  const variant = item.variants[0];
  if (!variant) return [];
  return variant.prices.map((price) => ({
    priceId: price.id,
    kind: price.paymentKind,
    audience: price.audience,
    ...(price.amountMinor !== undefined
      ? { amountMinor: price.amountMinor }
      : {}),
    ...(price.currency ? { currency: price.currency } : {}),
    ...(price.creditAmount !== undefined
      ? { credits: price.creditAmount }
      : {}),
  }));
}

function stringField(
  configuration: Readonly<Record<string, unknown>> | undefined,
  key: string,
): string | undefined {
  const value = configuration?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Bookable session occurrences in a club's storefront (services with dates). */
export function sessionsFromStorefront(
  storefront: Storefront,
  now: Date,
  viewerTimeZone?: string,
): readonly FindSession[] {
  const venue = storefront.venues[0];
  const place =
    venue && venue.latitude !== undefined && venue.longitude !== undefined
      ? {
          name: venue.name,
          latitude: venue.latitude,
          longitude: venue.longitude,
        }
      : storefront.contact.latitude !== undefined &&
          storefront.contact.longitude !== undefined
        ? {
            name: storefront.name,
            latitude: storefront.contact.latitude,
            longitude: storefront.contact.longitude,
          }
        : venue
          ? { name: venue.name }
          : undefined;
  const sessions: FindSession[] = [];
  for (const item of storefront.catalog) {
    if (item.type !== "service") continue;
    const configuration =
      item.configuration && typeof item.configuration === "object"
        ? (item.configuration as Readonly<Record<string, unknown>>)
        : undefined;
    for (const occurrence of item.upcomingOccurrences) {
      if (Date.parse(occurrence.endsAt) < now.getTime()) continue;
      sessions.push({
        id: occurrence.key,
        catalogItemId: item.id,
        catalogVariantId: item.variants[0]?.id ?? null,
        title: item.title,
        kind: sessionKind(item),
        club: {
          id: storefront.organizationId,
          slug: storefront.slug,
          name: storefront.name,
          color: storefront.theme.palette.primary,
        },
        startsAt: occurrence.startsAt,
        endsAt: occurrence.endsAt,
        timeZone: occurrence.timezone,
        coachNames: occurrence.availableCoaches.map(
          (coach) => coach.displayName,
        ),
        ...(place ? { place } : {}),
        ...(item.shortSummary ? { summary: item.shortSummary } : {}),
        ...((stringField(configuration, "skillLevel") ??
        stringField(configuration, "level"))
          ? {
              level:
                stringField(configuration, "skillLevel") ??
                stringField(configuration, "level"),
            }
          : {}),
        prices: itemPrices(item),
        membershipRequired:
          item.membershipRequired || item.visibility === "members",
        ...(() => {
          const participation = occurrenceParticipation({
            item,
            occurrence,
            clubName: storefront.name,
            now,
            viewerTimeZone,
          });
          return participation ? { participation } : {};
        })(),
      });
    }
  }
  return sessions;
}

/** A price to show in a row: credits first (the ladder is credits), then card. */
export function sessionPriceLabel(session: FindSession): string | null {
  const ladder = session.participation?.display.price;
  if (ladder) {
    return `${ladder.maxCharge} credit${ladder.maxCharge === 1 ? "" : "s"}`;
  }
  const credit = session.prices.find((price) => price.kind === "credit");
  if (credit?.credits !== undefined) {
    return `${credit.credits} credit${credit.credits === 1 ? "" : "s"}`;
  }
  const card = session.prices.find(
    (price) => price.kind === "card" && price.amountMinor !== undefined,
  );
  if (card?.amountMinor !== undefined && card.currency) {
    return card.amountMinor === 0
      ? "Free"
      : formatMoney(card.amountMinor, card.currency);
  }
  return null;
}

/** What Find reads from a quote (the server's, or a preview fixture). */
export type QuoteLike = Pick<
  ParticipationQuote,
  "subjectId" | "title" | "startsAt" | "timezone" | "displayState" | "copy"
> & {
  readonly display: ParticipationViewInput["display"] & {
    readonly price?: { readonly reservePerPlayer: number };
  };
};

/** A quote from the server, as the participation view input. */
export function quoteParticipation(quote: QuoteLike): ParticipationViewInput {
  return {
    displayState: quote.displayState,
    display: quote.display,
    copy: quote.copy,
  };
}

/**
 * Preview builds (no sign-in): the participation fixtures, one per display
 * state, as sessions at the demo club. They cannot be booked.
 */
export function previewSessions(input: {
  readonly quotes: readonly QuoteLike[];
  readonly club: {
    readonly id: string;
    readonly slug: string;
    readonly name: string;
  };
  readonly place?: FindSession["place"];
}): readonly FindSession[] {
  return input.quotes.map((quote) => ({
    id: quote.subjectId,
    catalogItemId: quote.subjectId,
    catalogVariantId: null,
    title: quote.title,
    kind: sessionKind({ subtype: "", title: quote.title }),
    club: input.club,
    startsAt: quote.startsAt,
    endsAt: new Date(Date.parse(quote.startsAt) + 90 * 60_000).toISOString(),
    timeZone: quote.timezone,
    coachNames: [],
    ...(input.place ? { place: input.place } : {}),
    prices: quote.display.price
      ? [
          {
            priceId: `${quote.subjectId}-credit`,
            kind: "credit" as const,
            audience: "everyone" as const,
            credits: quote.display.price.reservePerPlayer,
          },
        ]
      : [],
    membershipRequired: false,
    participation: quoteParticipation(quote),
    demo: true,
  }));
}

/** A session as a Find result: when · where · level, the participation line under it. */
export function sessionResult(
  session: FindSession,
  options: { readonly yours?: boolean; readonly locale?: string } = {},
): FindResult {
  const when = new Intl.DateTimeFormat(options.locale ?? "en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: session.timeZone,
  }).format(new Date(session.startsAt));
  const facts = [when, session.place?.name ?? session.club.name];
  if (session.level) facts.push(session.level);
  const live =
    Date.parse(session.startsAt) <= Date.now() &&
    Date.parse(session.endsAt) > Date.now();
  return {
    id: `session:${session.id}`,
    source: "session",
    group: "training",
    title: session.title,
    meta: facts.join(" · "),
    price: sessionPriceLabel(session),
    level: session.level ?? null,
    pin: "lesson",
    ...(session.place?.latitude !== undefined
      ? { latitude: session.place.latitude }
      : {}),
    ...(session.place?.longitude !== undefined
      ? { longitude: session.place.longitude }
      : {}),
    live,
    yours: Boolean(options.yours),
    startsAt: session.startsAt,
    session,
  };
}
