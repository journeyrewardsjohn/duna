/**
 * The Player app's wallet model (WALLET-2, docs/design/wallet.md): today's
 * per-club summaries, a guardian's juniors' club credits, the Duna member
 * credential, club bookings, money, payment schedules, Duna Plus and
 * prediction credits, turned into cards and a sheet per card. The same
 * rules and words as the web wallet (`apps/web/app/(next)/(app)/app/wallet/
 * wallet-model.ts`), through the shared `@duna/tideline-core` helpers. Pure.
 */
import { formatMoney } from "@duna/core";
import {
  assignWalletArt,
  clubSummaryCard,
  formatCardDate,
  orderWalletCards,
  type ClubWalletSummary,
  type MembershipPassData,
  type MembershipStatus,
} from "@duna/tideline-core";
import type { NativeWalletCard } from "@duna/ui/native/identity";

/** One source the screen reads: its data, or why it is missing. */
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
  readonly relationshipStatus: "pending" | "verified" | "rejected";
}

export interface MemberCredential {
  readonly memberId: string;
  readonly credentialPayload: string;
  readonly walletStatus?: "available" | "configuration-required";
  readonly walletPassPath?: string;
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

export interface PaymentSchedule {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly currency: string;
  readonly paidMinor: number;
  readonly totalMinor: number;
  readonly installmentCount: number;
  readonly installments: readonly {
    readonly id: string;
    readonly dueAt: string;
    readonly status: string;
    readonly amountMinor: number;
  }[];
}

export interface SheetRow {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly amount?: string;
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
  readonly clubSlug: string;
  /** "Annual member · $460.00 a year · Renews Nov 30, 2027". */
  readonly planLine: string;
  readonly banner?: {
    readonly tone: "paused" | "pending" | "expired" | "ending" | "held";
    readonly text: string;
    readonly action?: "renew";
  };
  readonly credits?: { readonly count: number; readonly expiry?: string };
  readonly upcoming: readonly SheetRow[];
  readonly recent: readonly SheetRow[];
  readonly manage?: MembershipManage;
}

export interface WalletModel {
  readonly cards: readonly NativeWalletCard[];
  readonly sheets: Readonly<Record<string, ClubSheet>>;
  readonly initial?: string;
  readonly cardsError?: string;
  readonly passError?: string;
  /** The Duna member credential's Apple Wallet pass, when the server has one. */
  readonly appleWalletPath?: string;
  readonly money: Loaded<{
    readonly available: string;
    readonly pending: string;
    readonly entries: readonly SheetRow[];
    readonly schedules: readonly SheetRow[];
  }> | null;
  /** Duna Plus (the person's own Duna membership), when they have one. */
  readonly dunaPlus: string | null;
  readonly predictions: Loaded<{ readonly credits: string }> | null;
}

export interface WalletModelInput {
  readonly person: { readonly id: string; readonly displayName: string };
  readonly junior: boolean;
  readonly clubs: Loaded<readonly ClubSummary[]>;
  readonly family: Loaded<readonly FamilyRow[]> | null;
  readonly credential: Loaded<MemberCredential>;
  readonly upcoming: Loaded<readonly ClubBooking[]>;
  readonly past: Loaded<readonly ClubBooking[]>;
  readonly money: Loaded<MoneyWallet> | null;
  readonly schedules?: readonly PaymentSchedule[];
  readonly dunaPlus?: {
    readonly tierName: string;
    readonly status: string;
    readonly interval: string;
  } | null;
  readonly predictions: Loaded<{ readonly availableCredits: number }> | null;
  readonly timeZone: string;
  readonly card?: string;
  /** Overrides the pass (demo mode's sample, labelled). */
  readonly passOverride?: MembershipPassData;
  /** The credential read from this phone's secure store (offline). */
  readonly savedPass?: MembershipPassData | null;
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

export function planLine(summary: ClubSummary, timeZone: string): string {
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
  status: MembershipStatus,
  input: WalletModelInput,
): ClubSheet {
  const tz = input.timeZone;
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
              action: "renew",
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
    clubSlug: summary.organizationSlug,
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
    upcoming: rowsAt(
      input.upcoming,
      summary.organizationId,
      input.person.id,
      tz,
      4,
    ),
    recent: rowsAt(input.past, summary.organizationId, input.person.id, tz, 5),
    ...(manage ? { manage } : {}),
  };
}

/** The Duna-wide member credential as a card's back (static, labelled as such). */
export function credentialPass(
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

/** What the money card says about the policy for refunds (backend's rule). */
export function refundLine(manage: MembershipManage): string {
  return manage.refundBehavior === "prorated"
    ? "The unused part of this paid period is refunded to the card you paid with."
    : manage.refundBehavior === "full-within-window"
      ? `The latest payment is refunded only if it was made in the last ${manage.refundWindowDays ?? 7} days.`
      : "Payments already made are not refunded, except where the law requires.";
}

/** Builds the wallet: the person's club cards, then their juniors' cards. */
export function buildWalletModel(input: WalletModelInput): WalletModel {
  const cards: NativeWalletCard[] = [];
  const sheets: Record<string, ClubSheet> = {};
  let cardsError: string | undefined;
  if (input.clubs.state === "error") cardsError = input.clubs.reference;
  const summaries = input.clubs.state === "ok" ? input.clubs.data : [];
  const serverPass = credentialPass(input.credential);
  const pass = input.passOverride ?? serverPass ?? input.savedPass ?? null;
  const passSaved =
    !input.passOverride && !serverPass && Boolean(input.savedPass);
  // A guardian holds their juniors' cards (verified relationships only).
  const juniors =
    input.family?.state === "ok"
      ? input.family.data.filter(
          (row) =>
            row.relationshipStatus === "verified" && row.dependentCredits > 0,
        )
      : [];
  if (!cardsError && input.family?.state === "error")
    cardsError = input.family.reference;
  const art = assignWalletArt([
    ...summaries.map((summary) => ({ id: summary.organizationId })),
    ...juniors.map((row) => ({ id: row.organizationId })),
  ]);
  summaries.forEach((summary, index) => {
    const base = clubSummaryCard(summary, { timeZone: input.timeZone });
    cards.push({
      ...base,
      club: { name: summary.organizationName },
      art: art[index]!,
      member: input.person.displayName,
      number: null,
      pass,
      ...(passSaved ? { passSaved } : {}),
    });
    sheets[summary.organizationId] = clubSheet(summary, base.status, input);
  });
  juniors.forEach((row, index) => {
    const id = `${row.organizationId}:${row.dependentPersonId}`;
    const firstName = row.dependentName.split(" ")[0] ?? row.dependentName;
    cards.push({
      id,
      club: { name: row.organizationName },
      art: art[summaries.length + index]!,
      member: row.dependentName,
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
      // Needs API: a junior's own pass, readable by their guardian.
      pass: null,
    });
    sheets[id] = {
      clubName: row.organizationName,
      clubSlug: row.organizationSlug,
      planLine: `${firstName}'s credits at this club`,
      banner: {
        tone: "held",
        text: `${firstName}'s card. You hold it as their guardian; it moves to their own app when they have one.`,
      },
      credits: { count: row.dependentCredits },
      upcoming: rowsAt(
        input.upcoming,
        row.organizationId,
        row.dependentPersonId,
        input.timeZone,
        4,
      ),
      recent: rowsAt(
        input.past,
        row.organizationId,
        row.dependentPersonId,
        input.timeZone,
        5,
      ),
    };
  });

  const ordered = orderWalletCards(cards);
  const money: WalletModel["money"] =
    input.money === null
      ? null
      : input.money.state === "ok"
        ? {
            state: "ok",
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
              schedules: (input.schedules ?? []).map((schedule) => {
                const next = schedule.installments.find(
                  (item) => item.status !== "paid",
                );
                return {
                  id: schedule.id,
                  title: schedule.title,
                  detail: [
                    `${formatMoney(schedule.paidMinor, schedule.currency)} of ${formatMoney(schedule.totalMinor, schedule.currency)} paid`,
                    next
                      ? `next ${formatMoney(next.amountMinor, schedule.currency)} on ${date(next.dueAt, input.timeZone, true)}`
                      : null,
                    schedule.status === "past-due" ? "past due" : null,
                  ]
                    .filter(Boolean)
                    .join(" · "),
                };
              }),
            },
          }
        : input.money;
  const predictions: WalletModel["predictions"] =
    input.predictions === null || input.junior
      ? null
      : input.predictions.state === "ok"
        ? {
            state: "ok",
            data: {
              credits: Math.floor(
                input.predictions.data.availableCredits,
              ).toLocaleString("en-US"),
            },
          }
        : input.predictions;
  const appleWalletPath =
    input.credential.state === "ok" &&
    input.credential.data.walletStatus === "available"
      ? input.credential.data.walletPassPath
      : undefined;
  return {
    cards: ordered,
    sheets,
    ...(input.card && ordered.some((card) => card.id === input.card)
      ? { initial: input.card }
      : {}),
    ...(cardsError ? { cardsError } : {}),
    ...(input.credential.state === "error" && !input.savedPass
      ? { passError: input.credential.reference }
      : {}),
    ...(appleWalletPath ? { appleWalletPath } : {}),
    money,
    dunaPlus: input.dunaPlus
      ? `${input.dunaPlus.tierName} · ${input.dunaPlus.status} · ${input.dunaPlus.interval}`
      : null,
    predictions,
  };
}

/** A new card since the person last opened the wallet (the arrival moment). */
export function arrivedCard(
  cards: readonly NativeWalletCard[],
  known: readonly string[] | null,
): NativeWalletCard | null {
  // The first open sets the baseline: nothing "arrives" on it.
  if (known === null) return null;
  return (
    cards.find(
      (card) => !known.includes(card.id) && card.status !== "expired",
    ) ?? null
  );
}

/** "Welcome to Saltline": the arrival's words, honest for a pending card. */
export function arrivalWords(card: NativeWalletCard): {
  readonly title: string;
  readonly text: string;
} {
  if (card.status === "pending")
    return {
      title: `Welcome to ${card.club.name}`,
      text: `Your card is in your wallet. Your pass appears when ${card.club.name} approves your membership.`,
    };
  const kind =
    card.chip && card.chip !== "Pack" ? `${card.chip.toLowerCase()} ` : "";
  return {
    title: `Welcome to ${card.club.name}`,
    text: `Your ${kind}card is in your wallet. Your pass works from today.`,
  };
}
