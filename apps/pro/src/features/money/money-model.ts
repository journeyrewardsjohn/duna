/**
 * Club money in words (M-R4, owner's point 11): the summary at the top of
 * Money (ready to pay out, what frees up and when, the 30-day net and its
 * trend), each sale's line, and the Duna Pay state. Wording follows HQ's
 * Money area (`apps/hq/components/money/money-model.ts`): the payment
 * processor is never named here (agent rules: only where Duna Pay explains
 * identity verification). Pure and unit-tested.
 */
import { formatMoney, formatMoneyDate } from "../../shared/money-format";

export interface MoneyInput {
  readonly currency: string;
  readonly balance: {
    readonly availableMinor: number;
    readonly heldMinor: number;
    readonly pendingMinor: number;
    readonly inTransitMinor: number;
    readonly nextReleaseAt?: string;
    readonly nextReleaseMinor: number;
  };
  readonly earnings: {
    readonly netMinor: number;
    readonly points: readonly {
      readonly date: string;
      readonly netMinor: number;
    }[];
  };
  readonly connect: {
    readonly connected: boolean;
    readonly chargesEnabled: boolean;
    readonly payoutsEnabled: boolean;
    readonly bankName?: string;
    readonly bankLast4?: string;
    readonly requirementsDue: readonly unknown[];
    readonly liveData?: boolean;
  };
  readonly settings: {
    readonly payoutInterval: string;
    readonly weeklyPayoutDay?: string;
  };
}

export type DunaPayState = "ready" | "action-needed" | "not-set-up";

export interface MoneySummary {
  readonly available: string;
  /** Under the big figure: when it pays out, or why it can't. */
  readonly availableNote: string;
  /** "$27.25 frees up Thu, Dec 4", or null when nothing is waiting. */
  readonly freesUp: string | null;
  readonly net30: string;
  readonly onTheWay: string;
  readonly held: string;
  readonly clearing: string;
  readonly state: DunaPayState;
  readonly stateSentence: string;
  readonly canPayOut: boolean;
  readonly bank: string;
}

const DAY_WORDS: Readonly<Record<string, string>> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

function payoutRhythm(settings: MoneyInput["settings"]): string {
  switch (settings.payoutInterval) {
    case "daily":
      return "Pays out to your bank every day";
    case "weekly":
      return `Pays out every ${DAY_WORDS[settings.weeklyPayoutDay ?? ""] ?? "week"}`;
    case "monthly":
      return "Pays out once a month";
    default:
      return "Pays out when you transfer it";
  }
}

export function dunaPayState(connect: MoneyInput["connect"]): DunaPayState {
  if (!connect.connected) return "not-set-up";
  if (
    !connect.chargesEnabled ||
    !connect.payoutsEnabled ||
    connect.requirementsDue.length > 0
  )
    return "action-needed";
  return "ready";
}

const STATE_SENTENCES: Readonly<Record<DunaPayState, string>> = {
  ready: "Duna Pay is ready. Players can pay you and payouts are on.",
  "action-needed":
    "Duna Pay needs something from you to keep payments and payouts running.",
  "not-set-up": "Duna Pay isn't set up yet, so players can't pay you online.",
};

export function moneySummary(
  input: MoneyInput,
  timeZone?: string,
): MoneySummary {
  const money = (minor: number) => formatMoney(minor, input.currency);
  const state = dunaPayState(input.connect);
  const canPayOut =
    state !== "not-set-up" &&
    input.connect.payoutsEnabled &&
    input.balance.availableMinor > 0;
  const date =
    input.balance.nextReleaseAt && input.balance.nextReleaseMinor > 0
      ? formatMoneyDate(input.balance.nextReleaseAt, timeZone)
      : "";
  return {
    available: money(input.balance.availableMinor),
    availableNote:
      state === "not-set-up"
        ? "Set up Duna Pay to be paid out"
        : !input.connect.payoutsEnabled
          ? "Payouts are paused until Duna Pay has what it needs"
          : input.balance.availableMinor > 0
            ? payoutRhythm(input.settings)
            : "Nothing is ready to pay out yet",
    freesUp: date
      ? `${money(input.balance.nextReleaseMinor)} frees up ${date}`
      : null,
    net30: money(input.earnings.netMinor),
    onTheWay: money(input.balance.inTransitMinor),
    held: money(input.balance.heldMinor),
    clearing: money(input.balance.pendingMinor),
    state,
    stateSentence: STATE_SENTENCES[state],
    canPayOut,
    bank: input.connect.bankLast4
      ? `${input.connect.bankName ?? "Your bank"} ending ${input.connect.bankLast4}`
      : "your payout bank",
  };
}

export interface Trend {
  /** 0..1 in both axes, left to right, 1 = the highest day. */
  readonly points: readonly { readonly x: number; readonly y: number }[];
  /** Everything the line says, in words (VoiceOver and the summary). */
  readonly summary: string;
  readonly empty: boolean;
}

/** The net per day, drawn simply: a line with a baseline, and its words. */
export function netTrend(
  points: MoneyInput["earnings"]["points"],
  currency: string,
): Trend {
  if (points.length < 2 || points.every((point) => point.netMinor === 0)) {
    return {
      points: [],
      summary: "No sales in this period yet.",
      empty: true,
    };
  }
  const max = Math.max(...points.map((point) => point.netMinor));
  const peak = points.find((point) => point.netMinor === max)!;
  const total = points.reduce((sum, point) => sum + point.netMinor, 0);
  const peakDay = formatMoneyDate(`${peak.date}T12:00:00.000Z`, "UTC");
  return {
    points: points.map((point, index) => ({
      x: index / (points.length - 1),
      y: max === 0 ? 0 : point.netMinor / max,
    })),
    summary: `${formatMoney(total, currency)} net over ${points.length} days; best day ${peakDay}, ${formatMoney(max, currency)}.`,
    empty: false,
  };
}

/** An SVG path for the trend in a `width` × `height` box (2 pt inset). */
export function trendPath(trend: Trend, width: number, height: number): string {
  const inset = 2;
  return trend.points
    .map((point, index) => {
      const x = inset + point.x * (width - inset * 2);
      const y = inset + (1 - point.y) * (height - inset * 2);
      return `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

export type SaleStatus =
  | "pending-clearance"
  | "held"
  | "available"
  | "payout-pending"
  | "paid-out"
  | "partially-refunded"
  | "refunded"
  | "disputed";

/** HQ's words for a sale's state (Money → Sales). */
export const SALE_WORDS: Readonly<
  Record<
    SaleStatus,
    {
      readonly label: string;
      readonly tone: "neutral" | "info" | "positive" | "warning" | "attention";
    }
  >
> = {
  "pending-clearance": { label: "Clearing", tone: "neutral" },
  held: { label: "Held", tone: "warning" },
  available: { label: "Ready", tone: "positive" },
  "payout-pending": { label: "Paying out", tone: "info" },
  "paid-out": { label: "Paid out", tone: "positive" },
  "partially-refunded": { label: "Part refunded", tone: "info" },
  refunded: { label: "Refunded", tone: "neutral" },
  disputed: { label: "Disputed", tone: "attention" },
};

/* -------------------------------------------------------------- contrast */

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const clean = hex.replace("#", "").slice(0, 6);
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two `#rrggbb` colours. */
export function contrastRatio(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
