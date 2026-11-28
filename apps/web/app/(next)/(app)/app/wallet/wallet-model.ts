/**
 * The Player web wallet's view model (WALLET-1, docs/design/wallet.md):
 * today's per-club summaries, the Duna member credential, club bookings,
 * money and prediction credits, turned into cards and a sheet per card.
 * Pure and serialisable, so the server page builds it and the client view
 * renders it.
 */
import { formatMoney } from "@duna/core";
import {
  assignWalletArt,
  clubSummaryCard,
  formatCardDate,
  orderWalletCards,
  type ClubWalletSummary,
  type MembershipPassData,
  type WalletCard,
} from "@duna/ui/tideline";

/** One source the page reads: its data, or why it is missing. */
export type Loaded<T> =
  | { readonly state: "ok"; readonly data: T }
  | { readonly state: "not-configured" }
  | { readonly state: "error"; readonly reference: string };

export interface ClubSummary extends ClubWalletSummary {
  readonly organizationSlug: string;
  readonly membershipId?: string;
  readonly membershipPriceMinor?: number;
  readonly membershipCurrency?: string;
  readonly membershipManageable?: boolean;
  readonly membershipPolicy?: {
    readonly cancellationTiming: "period-end" | "immediate";
    readonly refundBehavior: "none" | "prorated" | "full-within-window";
    readonly refundWindowDays?: number;
  };
}

/** A guardian's view of a junior's club credits (`player.familyWallets`). */
export interface FamilyRow {
  readonly dependentPersonId: string;
  readonly dependentName: string;
  readonly organizationId: string;
  readonly organizationName: string;
  readonly organizationSlug: string;
  readonly dependentCredits: number;
}

export interface MemberCredential {
  readonly memberId: string;
  readonly credentialPayload: string;
}

export interface ClubBooking {
  readonly bookingId: string;
  readonly title: string;
  readonly status: string;
  readonly startsAt: string;
  readonly timezone: string;
  readonly organization: { readonly id: string };
  readonly participant: { readonly personId: string };
  readonly venue?: { readonly name: string };
}

export interface MoneyWallet {
  readonly availableMinor: number;
  readonly pendingMinor: number;
  readonly currency: string;
  readonly entries: readonly {
    readonly id: string;
    readonly description: string;
    readonly occurredAt: string;
    readonly status: string;
    readonly amount: {
      readonly amountMinor: number;
      readonly currency: string;
    };
  }[];
}

export interface PredictionSummary {
  readonly availableCredits: number;
}

export interface SheetRow {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
}

export interface MembershipManage {
  readonly membershipId: string;
  readonly ending: boolean;
  readonly cancellationTiming: "period-end" | "immediate";
  readonly refundBehavior: "none" | "prorated" | "full-within-window";
  readonly refundWindowDays?: number;
  /** "Nov 30, 2027": when access ends if cancelled at period end. */
  readonly periodEnd?: string;
}

export interface ClubSheet {
  readonly clubName: string;
  readonly clubHref: string;
  /** "Annual member · $460.00 a year · Renews Nov 30, 2027". */
  readonly planLine: string;
  readonly banner?: {
    readonly tone: "paused" | "pending" | "expired" | "ending" | "held";
    readonly text: string;
    readonly action?: { readonly label: string; readonly href: string };
  };
  readonly credits?: {
    readonly count: number;
    readonly expiry?: string;
  };
  readonly upcoming: readonly SheetRow[];
  readonly recent: readonly SheetRow[];
  readonly manage?: MembershipManage;
}

export interface WalletModel {
  /** "Your wallet" or "Remy's wallet". */
  readonly title: string;
  readonly actingFor: string | null;
  readonly cards: readonly WalletCard[];
  readonly sheets: Readonly<Record<string, ClubSheet>>;
  /** The card asked for in the address (`?card=`), if it is one of these. */
  readonly initial?: string;
  readonly cardsError?: string;
  readonly passError?: string;
  readonly money: Loaded<{
    readonly available: string;
    readonly pending: string;
    readonly entries: readonly (SheetRow & { readonly amount: string })[];
  }> | null;
  readonly predictions: Loaded<{ readonly credits: string }> | null;
}

export interface WalletModelInput {
  readonly person: { readonly id: string; readonly displayName: string };
  readonly actingFor: {
    readonly personId: string;
    readonly displayName: string;
    readonly firstName: string;
  } | null;
  readonly junior: boolean;
  readonly clubs: Loaded<readonly ClubSummary[]>;
  readonly family: Loaded<readonly FamilyRow[]> | null;
  readonly credential: Loaded<MemberCredential>;
  readonly upcoming: Loaded<readonly ClubBooking[]>;
  readonly past: Loaded<readonly ClubBooking[]>;
  readonly money: Loaded<MoneyWallet> | null;
  readonly predictions: Loaded<PredictionSummary> | null;
  readonly timeZone: string;
  readonly card?: string;
  /** Overrides the pass (demo mode's sample, labelled). */
  readonly passOverride?: MembershipPassData;
}

const date = (iso: string, timeZone: string, year = false) =>
  formatCardDate(iso, { year, timeZone });

function when(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

function planLine(summary: ClubSummary, timeZone: string): string {
  if (!summary.membershipName) return "Credits at this club";
  const parts: string[] = [summary.membershipName];
  if (summary.membershipPriceMinor !== undefined && summary.membershipCurrency)
    parts.push(
      `${formatMoney(summary.membershipPriceMinor, summary.membershipCurrency)}${
        summary.membershipInterval === "year"
          ? " a year"
          : summary.membershipInterval === "month"
            ? " a month"
            : ""
      }`,
    );
  const end =
    summary.membershipCancellationEffectiveAt ??
    summary.membershipCurrentPeriodEndsAt;
  if (
    summary.membershipTrialEndsAt &&
    /trial/i.test(summary.membershipStatus ?? "")
  )
    parts.push(
      `Trial ends ${date(summary.membershipTrialEndsAt, timeZone, true)}`,
    );
  else if (end)
    parts.push(
      `${summary.membershipCancelAtPeriodEnd || summary.membershipCancellationEffectiveAt ? "Ends" : "Renews"} ${date(end, timeZone, true)}`,
    );
  return parts.join(" · ");
}

function rowsAt(
  bookings: Loaded<readonly ClubBooking[]>,
  organizationId: string,
  personId: string,
  timeZone: string,
  limit: number,
): SheetRow[] {
  if (bookings.state !== "ok") return [];
  return bookings.data
    .filter(
      (booking) =>
        booking.organization.id === organizationId &&
        booking.participant.personId === personId &&
        booking.status !== "cancelled" &&
        booking.status !== "refunded",
    )
    .slice(0, limit)
    .map((booking) => ({
      id: booking.bookingId,
      title: booking.title,
      detail: [
        when(booking.startsAt, booking.timezone || timeZone),
        booking.venue?.name,
        booking.status === "attended" ? "Checked in" : null,
      ]
        .filter(Boolean)
        .join(" · "),
    }));
}

function clubSheet(
  summary: ClubSummary,
  status: WalletCard["status"],
  input: WalletModelInput,
  personId: string,
): ClubSheet {
  const tz = input.timeZone;
  const clubHref = `/clubs/${summary.organizationSlug}`;
  const end =
    summary.membershipCancellationEffectiveAt ??
    summary.membershipCurrentPeriodEndsAt;
  const banner: ClubSheet["banner"] =
    status === "paused"
      ? {
          tone: "paused",
          text: "Your membership is paused. Sessions you already booked still check in.",
        }
      : status === "pending"
        ? {
            tone: "pending",
            text: `${summary.organizationName} is reviewing your membership. Your pass appears when they approve it.`,
          }
        : status === "expired"
          ? {
              tone: "expired",
              text: end
                ? `Ended ${date(end, tz, true)}. Renew to book member courts and get your pass back.`
                : "This membership has ended. Renew to book member courts and get your pass back.",
              action: { label: "Renew membership", href: clubHref },
            }
          : summary.membershipCancelAtPeriodEnd && end
            ? {
                tone: "ending",
                text: `Your membership ends ${date(end, tz, true)} and will not renew.`,
              }
            : undefined;
  const manage: MembershipManage | undefined =
    summary.membershipId &&
    summary.membershipManageable &&
    summary.membershipPolicy &&
    status !== "expired"
      ? {
          membershipId: summary.membershipId,
          ending: summary.membershipCancelAtPeriodEnd === true,
          cancellationTiming: summary.membershipPolicy.cancellationTiming,
          refundBehavior: summary.membershipPolicy.refundBehavior,
          ...(summary.membershipPolicy.refundWindowDays
            ? { refundWindowDays: summary.membershipPolicy.refundWindowDays }
            : {}),
          ...(end ? { periodEnd: date(end, tz, true) } : {}),
        }
      : undefined;
  return {
    clubName: summary.organizationName,
    clubHref,
    planLine: planLine(summary, tz),
    ...(banner ? { banner } : {}),
    ...(summary.credits > 0 || summary.nextExpirationAt
      ? {
          credits: {
            count: summary.credits,
            ...(summary.nextExpirationAt && summary.nextExpiringCredits
              ? {
                  expiry: `${summary.nextExpiringCredits} expire ${date(summary.nextExpirationAt, tz, true)}`,
                }
              : {}),
          },
        }
      : {}),
    upcoming: rowsAt(input.upcoming, summary.organizationId, personId, tz, 4),
    recent: rowsAt(input.past, summary.organizationId, personId, tz, 5),
    ...(manage ? { manage } : {}),
  };
}

function credentialPass(
  credential: Loaded<MemberCredential>,
): MembershipPassData | null {
  if (credential.state !== "ok") return null;
  return {
    code: credential.data.credentialPayload,
    rotation: "static",
    label: "Duna member credential",
    reference: `Duna ID ${credential.data.memberId}`,
  };
}

/** Builds the wallet for the person, or for the junior they are acting for. */
export function buildWalletModel(input: WalletModelInput): WalletModel {
  const acting = input.actingFor;
  const cards: WalletCard[] = [];
  const sheets: Record<string, ClubSheet> = {};
  let cardsError: string | undefined;

  if (acting) {
    // A guardian sees the junior's club credits (Needs API: the junior's
    // memberships and pass, readable by their guardian).
    const family = input.family;
    if (family?.state === "error") cardsError = family.reference;
    const rows =
      family?.state === "ok"
        ? family.data.filter(
            (row) =>
              row.dependentPersonId === acting.personId &&
              row.dependentCredits > 0,
          )
        : [];
    const art = assignWalletArt(
      rows.map((row) => ({ id: row.organizationId })),
    );
    rows.forEach((row, index) => {
      cards.push({
        id: row.organizationId,
        club: { name: row.organizationName },
        art: art[index]!,
        member: acting.displayName,
        heldBy: input.person.displayName,
        kind: "junior",
        plan: "Junior credits",
        chip: "Junior",
        status: "active",
        number: null,
        fact: {
          kind: "credits",
          text: `${row.dependentCredits} credit${row.dependentCredits === 1 ? "" : "s"}`,
        },
        pass: null,
      });
      sheets[row.organizationId] = {
        clubName: row.organizationName,
        clubHref: `/clubs/${row.organizationSlug}`,
        planLine: `${acting.firstName}'s credits at this club`,
        banner: {
          tone: "held",
          text: `${acting.firstName}'s card. You hold it as their guardian; it moves to their own app when they have one.`,
        },
        credits: { count: row.dependentCredits },
        upcoming: rowsAt(
          input.upcoming,
          row.organizationId,
          acting.personId,
          input.timeZone,
          4,
        ),
        recent: rowsAt(
          input.past,
          row.organizationId,
          acting.personId,
          input.timeZone,
          5,
        ),
      };
    });
  } else {
    if (input.clubs.state === "error") cardsError = input.clubs.reference;
    const summaries = input.clubs.state === "ok" ? input.clubs.data : [];
    const pass = input.passOverride ?? credentialPass(input.credential);
    const art = assignWalletArt(
      summaries.map((s) => ({ id: s.organizationId })),
    );
    summaries.forEach((summary, index) => {
      const base = clubSummaryCard(summary, { timeZone: input.timeZone });
      cards.push({
        ...base,
        club: { name: summary.organizationName },
        art: art[index]!,
        member: input.person.displayName,
        number: null,
        pass,
      });
      sheets[summary.organizationId] = clubSheet(
        summary,
        base.status,
        input,
        input.person.id,
      );
    });
  }

  const ordered = orderWalletCards(cards);
  const money =
    input.money === null
      ? null
      : input.money.state === "ok"
        ? {
            state: "ok" as const,
            data: {
              available: formatMoney(
                input.money.data.availableMinor,
                input.money.data.currency,
              ),
              pending: formatMoney(
                input.money.data.pendingMinor,
                input.money.data.currency,
              ),
              entries: input.money.data.entries.slice(0, 6).map((entry) => ({
                id: entry.id,
                title: entry.description,
                detail: `${date(entry.occurredAt, input.timeZone, true)} · ${entry.status}`,
                amount: `${entry.amount.amountMinor > 0 ? "+" : ""}${formatMoney(
                  entry.amount.amountMinor,
                  entry.amount.currency,
                )}`,
              })),
            },
          }
        : input.money;
  const predictions =
    input.predictions === null || input.junior || acting
      ? null
      : input.predictions.state === "ok"
        ? {
            state: "ok" as const,
            data: {
              credits: Math.floor(
                input.predictions.data.availableCredits,
              ).toLocaleString("en-US"),
            },
          }
        : input.predictions;
  return {
    title: acting ? `${acting.firstName}'s wallet` : "Wallet",
    actingFor: acting?.firstName ?? null,
    cards: ordered,
    sheets,
    ...(input.card && ordered.some((card) => card.id === input.card)
      ? { initial: input.card }
      : {}),
    ...(cardsError ? { cardsError } : {}),
    ...(!acting && input.credential.state === "error"
      ? { passError: input.credential.reference }
      : {}),
    money: acting ? null : money,
    predictions,
  };
}
