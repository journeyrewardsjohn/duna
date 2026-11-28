/**
 * Offerings as objects (ia-hq.md: objects instead of wizards, settings as
 * sentences, club defaults inherited, Draft → Live → Archived). Pure: the
 * kinds and templates, the words a row shows (price, schedule, group rule,
 * state, what is missing), the publish checklist, and the mapping from a
 * saved offering back to the full save input, so a section that changes one
 * thing never resets another.
 */
import type { OperatorWorkspace, PayPublishGate } from "@duna/api";
import {
  formatMoney,
  productMediaForKind,
  readParticipationRuleV2,
  resolveParticipationRules,
  type ResolvedParticipationRule,
} from "@duna/core";
import { hqHref } from "@duna/core/hq-routes";

export type OfferingItem = OperatorWorkspace["catalog"][number];
export type OfferingType = "service" | "plan" | "good";
export type OfferingStatus = OfferingItem["status"];

/** The list's kind filters; the old `/offerings/types/*` pages map onto them. */
export const OFFERING_KINDS = [
  {
    id: "services",
    type: "service",
    label: "Lessons and groups",
    noun: "lesson or group",
    description: "Private lessons, small groups, clinics and programs.",
    icon: "lesson",
  },
  {
    id: "plans",
    type: "plan",
    label: "Memberships and packs",
    noun: "membership or pack",
    description: "Memberships, credit packs and bundles.",
    icon: "member-card",
  },
  {
    id: "goods",
    type: "good",
    label: "Products",
    noun: "product",
    description: "Apparel, equipment and anything else you sell or lend.",
    icon: "pass",
  },
] as const;

export type OfferingKindId = (typeof OFFERING_KINDS)[number]["id"];

export function kindForType(type: string) {
  return OFFERING_KINDS.find((kind) => kind.type === type);
}

export function kindFromParam(value: string | undefined) {
  if (!value) return undefined;
  // `?type=service` (old links) and `?kind=services` both work.
  return OFFERING_KINDS.find(
    (kind) => kind.id === value || kind.type === value,
  );
}

/** What each subtype is called (from the old builder, unchanged). */
export const SUBTYPE_LABELS: Readonly<Record<string, string>> = {
  "private-lesson": "Private lesson",
  "group-lesson": "Group lesson",
  program: "Program",
  assessment: "Assessment",
  membership: "Membership",
  "credit-pack": "Credit pack",
  bundle: "Bundle",
  swag: "Swag",
  apparel: "Apparel",
  equipment: "Equipment",
  consumable: "Consumable",
  other: "Other",
};

export function subtypeLabel(subtype: string): string {
  return SUBTYPE_LABELS[subtype] ?? subtype.replaceAll("-", " ");
}

export const STATUS_LABELS: Readonly<Record<OfferingStatus, string>> = {
  draft: "Draft",
  active: "Live",
  archived: "Archived",
};

export function statusTone(status: OfferingStatus) {
  return status === "active"
    ? "positive"
    : status === "archived"
      ? "neutral"
      : "info";
}

// ---------------------------------------------------------------------------
// Templates: "New offering" starts from a kind and a template
// ---------------------------------------------------------------------------

export interface OfferingTemplate {
  readonly id: string;
  readonly type: OfferingType;
  readonly subtype: string;
  readonly label: string;
  /** One line on the card: what it sets up. */
  readonly summary: string;
  /** The name it suggests (the owner changes it). */
  readonly title: string;
  readonly capacity?: number;
  readonly durationMinutes?: number;
  /** A participation preset (Group size). */
  readonly preset?: "private" | "semi-private" | "small-group" | "clinic";
  /** Sessions on set dates (needed for a group rule) or from coach availability. */
  readonly schedule?: "flexible" | "recurring";
  readonly recurring?: "month" | "year";
  readonly creditsGranted?: number;
  readonly allowCredits?: boolean;
  /** Prices are the owner's: templates never suggest one. */
  readonly priceLabel: string;
}

export const OFFERING_TEMPLATES: readonly OfferingTemplate[] = [
  {
    id: "private-lesson",
    type: "service",
    subtype: "private-lesson",
    label: "Private lesson",
    summary: "One player, booked from your coaches' availability.",
    title: "Private lesson",
    capacity: 1,
    durationMinutes: 60,
    preset: "private",
    schedule: "flexible",
    allowCredits: true,
    priceLabel: "Price per lesson",
  },
  {
    id: "semi-private",
    type: "service",
    subtype: "group-lesson",
    label: "Semi-private",
    summary: "Two players on set dates; runs when both are booked.",
    title: "Semi-private lesson",
    capacity: 2,
    durationMinutes: 60,
    preset: "semi-private",
    schedule: "recurring",
    allowCredits: true,
    priceLabel: "Price per player",
  },
  {
    id: "small-group",
    type: "service",
    subtype: "group-lesson",
    label: "Small group",
    summary: "Three to six players each week, with a waitlist.",
    title: "Small group training",
    capacity: 6,
    durationMinutes: 90,
    preset: "small-group",
    schedule: "recurring",
    allowCredits: true,
    priceLabel: "Price per player",
  },
  {
    id: "clinic",
    type: "service",
    subtype: "group-lesson",
    label: "Clinic",
    summary: "Four to twelve players; price can drop as the group grows.",
    title: "Weekly clinic",
    capacity: 12,
    durationMinutes: 90,
    preset: "clinic",
    schedule: "recurring",
    allowCredits: true,
    priceLabel: "Price per player",
  },
  {
    id: "program",
    type: "service",
    subtype: "program",
    label: "Program",
    summary: "A run of weekly sessions sold as one.",
    title: "Junior program",
    capacity: 8,
    durationMinutes: 90,
    schedule: "recurring",
    priceLabel: "Price for the whole program",
  },
  {
    id: "assessment",
    type: "service",
    subtype: "assessment",
    label: "Assessment",
    summary: "A one-to-one session to place a new player.",
    title: "Player assessment",
    capacity: 1,
    durationMinutes: 60,
    preset: "private",
    schedule: "flexible",
    priceLabel: "Price per assessment",
  },
  {
    id: "membership",
    type: "plan",
    subtype: "membership",
    label: "Monthly membership",
    summary: "Billed every month until the member cancels.",
    title: "Club membership",
    recurring: "month",
    priceLabel: "Price per month",
  },
  {
    id: "credit-pack",
    type: "plan",
    subtype: "credit-pack",
    label: "Credit pack",
    summary: "Credits players spend on lessons and groups.",
    title: "Ten-credit pack",
    creditsGranted: 10,
    priceLabel: "Price for the pack",
  },
  {
    id: "bundle",
    type: "plan",
    subtype: "bundle",
    label: "Bundle",
    summary: "Two or more of your offerings sold together.",
    title: "Training bundle",
    priceLabel: "Price for the bundle",
  },
  {
    id: "apparel",
    type: "good",
    subtype: "apparel",
    label: "Apparel",
    summary: "Shirts and hoodies, with sizes as options.",
    title: "Club shirt",
    priceLabel: "Price",
  },
  {
    id: "equipment",
    type: "good",
    subtype: "equipment",
    label: "Equipment",
    summary: "Balls, nets and gear you sell or lend.",
    title: "Game ball",
    priceLabel: "Price",
  },
  {
    id: "swag",
    type: "good",
    subtype: "swag",
    label: "Swag",
    summary: "Stickers, bottles and small things.",
    title: "Club water bottle",
    priceLabel: "Price",
  },
];

export function templatesFor(type: OfferingType) {
  return OFFERING_TEMPLATES.filter((template) => template.type === type);
}

export function templateFor(id: string | undefined) {
  return OFFERING_TEMPLATES.find((template) => template.id === id);
}

/** The old `?type=service&subtype=program` links pick the matching template. */
export function templateFromLegacy(
  type: string | undefined,
  subtype: string | undefined,
): OfferingTemplate | undefined {
  if (!type) return undefined;
  return (
    OFFERING_TEMPLATES.find(
      (template) => template.type === type && template.subtype === subtype,
    ) ?? OFFERING_TEMPLATES.find((template) => template.type === type)
  );
}

/** The Duna library photo a template starts with (goods need one to save). */
export function templateCover(template: OfferingTemplate) {
  const media = productMediaForKind(template.subtype)[0];
  return media
    ? {
        kind: "image" as const,
        url: `https://duna.coach${media.path}`,
        alt: media.alt,
      }
    : undefined;
}

/** Duna library photos are also served by HQ itself: show that copy. */
export function mediaDisplayUrl(url: string): string {
  const library = "https://duna.coach/media/product-library/";
  return url.startsWith(library) ? url.slice("https://duna.coach".length) : url;
}

/** The first weekday on or after `from` (0 Sunday … 6 Saturday), as YYYY-MM-DD. */
function nextWeekday(from: Date, weekday: number): string {
  const date = new Date(from);
  date.setUTCDate(
    date.getUTCDate() + ((weekday - date.getUTCDay() + 7) % 7 || 7),
  );
  return date.toISOString().slice(0, 10);
}

/**
 * The configuration a template starts with. Group templates get weekly
 * sessions for eight weeks (a group rule needs set dates); the owner moves
 * them in Schedule and sessions.
 */
export function templateConfiguration(
  template: OfferingTemplate,
  context: {
    readonly now: Date;
    readonly timeZone: string;
    readonly venueId?: string;
  },
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    source: "hq-offerings",
    flowVersion: 4,
    templateId: template.id,
  };
  if (template.type === "service") {
    const capacity = template.capacity ?? 1;
    const durationMinutes = template.durationMinutes ?? 60;
    const recurring = template.schedule === "recurring";
    const startsOn = nextWeekday(context.now, 4);
    const ends = new Date(`${startsOn}T00:00:00Z`);
    ends.setUTCDate(ends.getUTCDate() + 7 * 7);
    const sessionSchedule = recurring
      ? {
          mode: "recurring",
          timezone: context.timeZone,
          startsOn,
          endsOn: ends.toISOString().slice(0, 10),
          weekdays: [4],
          startTime: "18:00",
          weekly: [{ weekday: 4, startsAt: "18:00" }],
          blackoutDates: [],
        }
      : { mode: "flexible", timezone: context.timeZone };
    return {
      ...base,
      capacity,
      durationMinutes,
      sessionSchedule,
      deliveryMode: "venue",
      ...(context.venueId ? { venueId: context.venueId } : {}),
      coachAssignmentMode: "all",
      requiredCoachCount: 1,
      customerCoachSelection: true,
      service: {
        durationMinutes,
        capacity,
        bookingLeadHours: 12,
        bookingBufferMinutes: 15,
        schedulingStyle: "coach-availability",
        sessionSchedule,
      },
      ...(template.subtype === "program"
        ? {
            program: {
              pricingBasis: "whole-program",
              includesAllSessions: true,
              sessionDurationMinutes: durationMinutes,
              includedCatalogItemIds: [],
            },
          }
        : {}),
    };
  }
  if (template.type === "plan") {
    if (template.subtype === "credit-pack") {
      return { ...base, creditsGranted: template.creditsGranted ?? 10 };
    }
    if (template.subtype === "bundle") {
      return {
        ...base,
        bundle: { status: "early-access", includedCatalogItemIds: [] },
      };
    }
    return {
      ...base,
      membership: {
        billingMode: "monthly",
        includedCreditsPerCycle: 0,
        bookingLimitPerCycle: 0,
        includedCatalogItemIds: [],
        waiverDocumentIds: [],
        benefits: [],
      },
    };
  }
  return {
    ...base,
    saleEnabled: true,
    inventoryTracked: true,
    inventoryCostingMethod: "fifo",
    variantCount: 1,
  };
}

// ---------------------------------------------------------------------------
// Reading an offering
// ---------------------------------------------------------------------------

type Price = OfferingItem["variants"][number]["prices"][number];

function activePrices(item: OfferingItem): Price[] {
  return item.variants.flatMap((variant) =>
    variant.status === "active"
      ? variant.prices.filter(
          (price) => price.active && price.audience === "everyone",
        )
      : [],
  );
}

/** The everyday money price (card first, then cash), not the annual one. */
export function moneyPrice(item: OfferingItem): Price | undefined {
  const prices = activePrices(item).filter(
    (price) =>
      (price.paymentKind === "card" || price.paymentKind === "cash") &&
      price.recurringInterval !== "year",
  );
  return (
    prices.find((price) => price.paymentKind === "card") ??
    prices.find((price) => price.paymentKind === "cash")
  );
}

/** A membership's annual prepay price, when it has one. */
export function annualPrice(item: OfferingItem): Price | undefined {
  if (item.type !== "plan" || item.subtype !== "membership") return undefined;
  return activePrices(item).find(
    (price) =>
      (price.paymentKind === "card" || price.paymentKind === "cash") &&
      price.recurringInterval === "year",
  );
}

export function creditPrice(item: OfferingItem): number | undefined {
  return activePrices(item).find((price) => price.paymentKind === "credit")
    ?.creditAmount;
}

function config(item: OfferingItem): Record<string, unknown> {
  return item.configuration;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function whole(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value)
    ? value
    : undefined;
}

/** How many players a session holds (services). */
export function offeringCapacity(item: OfferingItem): number {
  const c = config(item);
  return whole(c.capacity) ?? whole(record(c.service)?.capacity) ?? 1;
}

export function offeringDuration(item: OfferingItem): number | undefined {
  const c = config(item);
  return whole(c.durationMinutes) ?? whole(record(c.service)?.durationMinutes);
}

export function sessionSchedule(item: OfferingItem): Record<string, unknown> {
  const c = config(item);
  return (
    record(c.sessionSchedule) ??
    record(record(c.service)?.sessionSchedule) ??
    {}
  );
}

export type ScheduleMode = "flexible" | "one-off" | "recurring";

export function scheduleMode(item: OfferingItem): ScheduleMode {
  const mode = sessionSchedule(item).mode;
  return mode === "one-off" || mode === "recurring" ? mode : "flexible";
}

/** "$60.00 a session", "3 credits", "$120.00 a month". Never invented: no price, no words. */
export function priceSummary(item: OfferingItem, currency: string): string {
  const money = moneyPrice(item);
  const credits = creditPrice(item);
  const parts: string[] = [];
  if (money?.amountMinor !== undefined) {
    const amount = formatMoney(money.amountMinor, money.currency ?? currency);
    const per =
      money.recurringInterval === "month"
        ? " a month"
        : money.recurringInterval === "week"
          ? " a week"
          : money.recurringInterval === "year"
            ? " a year"
            : item.type === "service" && item.subtype !== "program"
              ? " a session"
              : "";
    parts.push(`${amount}${per}`);
  }
  if (credits !== undefined) {
    parts.push(`${credits} credit${credits === 1 ? "" : "s"}`);
  }
  if (item.type === "plan" && item.subtype === "credit-pack") {
    const granted = whole(config(item).creditsGranted);
    if (granted) parts.push(`gives ${granted} credits`);
  }
  if (parts.length === 0) return "No price yet";
  return parts.join(" · ");
}

const weekdayNames = [
  "Sundays",
  "Mondays",
  "Tuesdays",
  "Wednesdays",
  "Thursdays",
  "Fridays",
  "Saturdays",
];

function timeLabel(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value))
    return undefined;
  const [hour, minute] = value.split(":").map(Number) as [number, number];
  const suffix = hour >= 12 ? "PM" : "AM";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function dateLabel(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return undefined;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

/** "Thursdays 6:00 PM · Dec 3 to Jan 21", "Booked from coach availability", "Monthly". */
export function scheduleSummary(item: OfferingItem): string {
  if (item.type === "plan") {
    const money = moneyPrice(item);
    if (item.subtype === "membership") {
      return money?.recurringInterval === "year"
        ? "Billed yearly"
        : "Billed monthly";
    }
    const validity = whole(config(item).validityDays);
    return validity ? `Valid ${validity} days` : "No expiry";
  }
  if (item.type === "good") {
    const available = item.inventoryOnHand - item.inventoryReserved;
    return config(item).inventoryTracked === false
      ? "Not tracked"
      : `${Math.max(0, available)} in stock`;
  }
  const schedule = sessionSchedule(item);
  const mode = scheduleMode(item);
  if (mode === "recurring") {
    const days = Array.isArray(schedule.weekdays)
      ? (schedule.weekdays as unknown[])
          .filter((day): day is number => typeof day === "number")
          .map((day) => weekdayNames[day])
          .filter(Boolean)
      : [];
    const time = timeLabel(schedule.startTime);
    const from = dateLabel(schedule.startsOn);
    const to = dateLabel(schedule.endsOn);
    return (
      [
        [days.join(" and "), time].filter(Boolean).join(" "),
        from && to ? `${from} to ${to}` : undefined,
      ]
        .filter(Boolean)
        .join(" · ") || "Weekly sessions"
    );
  }
  if (mode === "one-off") {
    const dates = Array.isArray(schedule.oneOffSessions)
      ? schedule.oneOffSessions.length
      : Array.isArray(schedule.oneOff)
        ? schedule.oneOff.length
        : 0;
    return dates === 1 ? "1 date" : `${dates} dates`;
  }
  return config(item).schedulingStyle === "request-to-book" ||
    record(config(item).service)?.schedulingStyle === "request-to-book"
    ? "Booked on request"
    : "Booked from coach availability";
}

// ---------------------------------------------------------------------------
// Group rule
// ---------------------------------------------------------------------------

export interface ClubDefaults {
  readonly rules: unknown;
  readonly appliesTo: readonly string[];
}

export interface OfferingRule {
  readonly rule?: ResolvedParticipationRule;
  readonly source: "own" | "club-default" | "none";
}

/** The rule a session of this offering runs with (own, the club default, or none). */
export function offeringRule(
  item: OfferingItem,
  defaults: ClubDefaults | undefined,
): OfferingRule {
  if (item.type !== "service") return { source: "none" };
  return resolveParticipationRules({
    own: config(item).participation ?? undefined,
    clubDefault: defaults?.rules ?? undefined,
    clubDefaultAppliesTo: defaults?.appliesTo,
    kind: item.type,
    capacity: offeringCapacity(item),
  });
}

/** "3 to 6 players" / "Up to 8 players" / "1 player": the group in one phrase. */
export function ruleSummary(
  item: OfferingItem,
  resolved: OfferingRule,
): string | undefined {
  if (item.type !== "service") return undefined;
  const capacity = offeringCapacity(item);
  const players = (n: number) => `${n} player${n === 1 ? "" : "s"}`;
  const rule = resolved.rule;
  if (!rule || rule.minParticipants <= 1) {
    return capacity === 1 ? players(1) : `Up to ${players(capacity)}`;
  }
  const range =
    rule.minParticipants === capacity
      ? `${players(capacity)} needed`
      : `${rule.minParticipants} to ${players(capacity)}`;
  return rule.tiers.length > 0 ? `${range} · price by group size` : range;
}

/** True when the offering's own rule overrides the club default. */
export function hasOwnRule(item: OfferingItem): boolean {
  return readParticipationRuleV2(config(item).participation) !== undefined;
}

// ---------------------------------------------------------------------------
// Publish checklist: prerequisites solved in place
// ---------------------------------------------------------------------------

export interface ChecklistItem {
  readonly id: string;
  readonly label: string;
  /** The same thing as something to do, for a sentence: "set a price". */
  readonly todo: string;
  readonly done: boolean;
  /** Blocking items stop Publish; the rest are advice. */
  readonly blocking: boolean;
  /** Where to fix it. */
  readonly href?: string;
  readonly fixLabel?: string;
  readonly detail?: string;
}

export function publishChecklist(
  item: OfferingItem,
  context: {
    readonly gate?: PayPublishGate | "not-configured" | "unknown";
    readonly coachCount: number;
    readonly hasActiveMembership: boolean;
    readonly rule: OfferingRule;
  },
): readonly ChecklistItem[] {
  const id = item.id;
  const list: ChecklistItem[] = [];
  const prices = activePrices(item);
  const saleOff = item.type === "good" && config(item).saleEnabled === false;
  list.push({
    id: "name",
    label: "A name players recognise",
    todo: "name it",
    done: item.title.trim().length >= 2,
    blocking: true,
    href: hqHref("offering", { itemId: id }),
    fixLabel: "Name it",
  });
  list.push({
    id: "price",
    label: saleOff
      ? "Sales turned on, with a price"
      : "A price players can pay",
    todo: saleOff ? "turn on sales and set a price" : "set a price",
    done: !saleOff && prices.length > 0,
    blocking: true,
    href: hqHref("offeringPrice", { itemId: id }),
    fixLabel: "Set the price",
  });
  if (item.allowCard) {
    const gate = context.gate;
    const ready =
      gate !== undefined && typeof gate === "object" ? gate.ready : false;
    const next =
      typeof gate === "object"
        ? gate.steps.find((step) => step.state === "to-do")
        : undefined;
    list.push({
      id: "payments",
      label: "Duna Pay ready to take card payments",
      todo: "finish Duna Pay setup to take card payments",
      done: ready,
      blocking: true,
      href: next?.href ?? hqHref("moneyDunaPay"),
      fixLabel: next ? next.label : "Open Duna Pay setup",
      detail: ready
        ? undefined
        : gate === "not-configured"
          ? "Card payments aren't set up in this environment yet."
          : "Players can't pay by card until Duna Pay is set up. You can turn cards off in Price and publish now.",
    });
  }
  if (item.type === "good") {
    list.push({
      id: "photo",
      label: "A photo of the product",
      todo: "add a photo",
      done: item.media.some((media) => media.kind === "image"),
      blocking: true,
      href: hqHref("offering", { itemId: id }),
      fixLabel: "Add a photo",
    });
  } else {
    list.push({
      id: "photo",
      label: "A cover photo",
      todo: "add a cover photo",
      done: item.media.some((media) => media.kind === "image"),
      blocking: false,
      href: hqHref("offering", { itemId: id }),
      fixLabel: "Add a photo",
    });
  }
  if (item.type === "service") {
    const rule = context.rule.rule;
    const needsDates =
      rule !== undefined &&
      (rule.minParticipants > 1 || rule.tiers.length > 0) &&
      scheduleMode(item) === "flexible";
    if (needsDates) {
      list.push({
        id: "dates",
        label: "Set session dates (a group rule needs them)",
        todo: "set session dates for its group rule",
        done: false,
        blocking: true,
        href: hqHref("offeringSchedule", { itemId: id }),
        fixLabel: "Set dates",
      });
    }
    list.push({
      id: "coach",
      label: "A coach who can run it",
      todo: "invite a coach",
      done: context.coachCount > 0,
      blocking: false,
      href: hqHref("teamInvite"),
      fixLabel: "Invite a coach",
      detail:
        context.coachCount > 0
          ? undefined
          : "No coach is on your team yet, so players can't pick a time.",
    });
  }
  if (
    (item.membershipRequired || item.visibility === "members") &&
    !(item.type === "plan" && item.subtype === "membership")
  ) {
    list.push({
      id: "membership",
      label: "A live membership for members-only booking",
      todo: "make a membership live for members-only booking",
      done: context.hasActiveMembership,
      blocking: true,
      href: hqHref("offeringCreate") + "?kind=plans&template=membership",
      fixLabel: "Create a membership",
    });
  }
  return list;
}

/** "Before it goes live: set a price and finish Duna Pay setup to take card payments." */
export function missingSentence(
  list: readonly ChecklistItem[],
): string | undefined {
  const todos = list
    .filter((entry) => entry.blocking && !entry.done)
    .map((entry) => entry.todo);
  if (todos.length === 0) return undefined;
  const joined = new Intl.ListFormat("en", { type: "conjunction" }).format(
    todos,
  );
  return `Before it goes live: ${joined}.`;
}

export function missingSummary(list: readonly ChecklistItem[]): string[] {
  return list
    .filter((entry) => entry.blocking && !entry.done)
    .map((entry) => entry.label);
}

// ---------------------------------------------------------------------------
// Saving: the full input from a saved offering, so nothing is reset
// ---------------------------------------------------------------------------

export interface OfferingSaveInput {
  readonly type: "service" | "plan" | "good" | "event";
  readonly subtype: string;
  readonly title: string;
  readonly shortSummary?: string;
  readonly description?: string;
  readonly visibility: "public" | "members" | "private";
  readonly taxable: boolean;
  readonly stripeTaxCode?: string;
  readonly allowCard: boolean;
  readonly allowCash: boolean;
  readonly allowCredits: boolean;
  readonly membershipRequired: boolean;
  readonly priceMinor?: number;
  readonly annualPriceMinor?: number;
  readonly creditCost?: number;
  readonly recurringInterval?: "week" | "month" | "year";
  readonly recurringIntervalCount?: number;
  readonly options: readonly {
    readonly name: string;
    readonly values: readonly string[];
  }[];
  readonly media: readonly {
    readonly kind: "image" | "video";
    readonly url: string;
    readonly posterUrl?: string;
    readonly alt?: string;
    readonly variantIndex?: number;
  }[];
  readonly configuration: Record<string, unknown>;
}

/** "shirt_size" → "Shirt size": option names come back as their codes. */
function optionName(code: string): string {
  const words = code.replaceAll("_", " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The options, in the order the variants were built (first option outermost). */
export function optionsFromVariants(item: OfferingItem) {
  const variants = item.variants.filter(
    (variant) => variant.status === "active",
  );
  const codes: string[] = [];
  for (const variant of variants) {
    for (const code of Object.keys(variant.optionCoordinates)) {
      if (!codes.includes(code)) codes.push(code);
    }
  }
  return codes.map((code) => ({
    code,
    name: optionName(code),
    values: [
      ...new Set(
        variants
          .map((variant) => variant.optionCoordinates[code])
          .filter((value): value is string => Boolean(value)),
      ),
    ],
  }));
}

/** The variant order the server builds for these options (catalog-service `variantMatrix`). */
export function variantMatrix(
  options: readonly {
    readonly code: string;
    readonly values: readonly string[];
  }[],
): Record<string, string>[] {
  let matrix: Record<string, string>[] = [{}];
  for (const option of options) {
    matrix = matrix.flatMap((coordinates) =>
      option.values.map((value) => ({ ...coordinates, [option.code]: value })),
    );
  }
  return matrix;
}

/**
 * Media as the save input wants them. Media for every variant carry no
 * `variantIndex` (the old builder sent -1 for those, which the server
 * rejects, so editing any offering with an "all variants" photo failed);
 * a variant's own photo keeps pointing at the same variant by its options,
 * not its position.
 */
export function mediaInput(item: OfferingItem): OfferingSaveInput["media"] {
  const options = optionsFromVariants(item);
  const matrix = variantMatrix(options);
  return item.media.map((media) => {
    const variant = media.catalogVariantId
      ? item.variants.find(
          (candidate) => candidate.id === media.catalogVariantId,
        )
      : undefined;
    const index = variant
      ? matrix.findIndex((coordinates) =>
          options.every(
            (option) =>
              coordinates[option.code] ===
              variant.optionCoordinates[option.code],
          ),
        )
      : -1;
    return {
      kind: media.kind,
      url: media.url,
      ...(media.posterUrl ? { posterUrl: media.posterUrl } : {}),
      ...(media.alt ? { alt: media.alt } : {}),
      ...(index >= 0 ? { variantIndex: index } : {}),
    };
  });
}

/** Everything a saved offering holds, as the input that saves it unchanged. */
export function saveInputFromItem(item: OfferingItem): OfferingSaveInput {
  if (item.type === "event") {
    throw new Error("Events are edited in Events.");
  }
  const money = moneyPrice(item);
  const annual = annualPrice(item);
  const credits = creditPrice(item);
  return {
    type: item.type,
    subtype: item.subtype,
    title: item.title,
    ...(item.shortSummary ? { shortSummary: item.shortSummary } : {}),
    ...(item.description ? { description: item.description } : {}),
    visibility: item.visibility,
    taxable: item.taxable,
    ...(item.stripeTaxCode ? { stripeTaxCode: item.stripeTaxCode } : {}),
    allowCard: item.allowCard,
    allowCash: item.allowCash,
    allowCredits: item.allowCredits,
    membershipRequired: item.membershipRequired,
    ...(money?.amountMinor !== undefined
      ? { priceMinor: money.amountMinor }
      : {}),
    ...(annual?.amountMinor !== undefined
      ? { annualPriceMinor: annual.amountMinor }
      : {}),
    ...(credits !== undefined ? { creditCost: credits } : {}),
    ...(money?.recurringInterval
      ? {
          recurringInterval: money.recurringInterval,
          recurringIntervalCount: money.recurringIntervalCount ?? 1,
        }
      : {}),
    options: optionsFromVariants(item).map(({ name, values }) => ({
      name,
      values,
    })),
    media: mediaInput(item),
    configuration: { ...item.configuration },
  };
}

/** Who may change what, from the person's permission scopes. */
export interface OfferingAccess {
  /** Prices, money at stake, rules, publish and refunds (owner). */
  readonly money: boolean;
  /** Change offerings and save rules (owner and director). */
  readonly write: boolean;
  /** Extend, run anyway, apply a rule to booked sessions. */
  readonly sessions: boolean;
}
