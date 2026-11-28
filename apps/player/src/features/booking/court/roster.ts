/**
 * The roster of a court booking (M-P3, owner feedback image 38: "didn't show
 * myself already in the match"). Pure; tested in `roster.test.ts`.
 *
 * - The booker is ALWAYS in the roster, first, with their avatar.
 * - The rest are guests: Duna players (by person id) or people outside Duna
 *   (a name with a mobile number or an email). Nobody is added twice.
 * - The court's capacity draws the seats: filled seats, then inviting empty
 *   ones. A roster can grow past the drawn seats up to `MAX_GUESTS` (the
 *   limit the checkout has always taken).
 * - A contact picked from the phone becomes a guest with ONLY a name and one
 *   number or email; nothing else from the address book leaves the phone.
 */
import type { PersonSummary } from "@duna/core";
import type { BookingParticipant } from "../../courts/court-types";

export const MAX_GUESTS = 11;
export const DEFAULT_SEATS = 4;

export interface Booker {
  readonly personId?: string;
  readonly name: string;
  readonly photoUrl?: string;
}

export type RosterSeat =
  | {
      readonly kind: "booker";
      readonly key: string;
      readonly name: string;
      readonly photoUrl?: string;
    }
  | {
      readonly kind: "guest";
      readonly key: string;
      readonly name: string;
      readonly photoUrl?: string;
      readonly onDuna: boolean;
      /** How the invitation travels: "duna" (in the app), "text" or "email". */
      readonly channel: "duna" | "text" | "email";
      readonly participant: BookingParticipant;
    }
  | { readonly kind: "open"; readonly key: string };

/** The one identity of a guest, for de-duplication. Pure. */
export function guestKey(participant: BookingParticipant): string | undefined {
  const value =
    participant.personId ?? participant.email ?? participant.phoneE164;
  return value?.toLowerCase();
}

export function guestName(participant: BookingParticipant): string {
  return (
    participant.person?.displayName ??
    participant.name ??
    participant.email ??
    participant.phoneE164 ??
    "Player"
  );
}

export type AddGuestResult =
  | { readonly ok: true; readonly guests: readonly BookingParticipant[] }
  | {
      readonly ok: false;
      readonly reason: "no-contact" | "duplicate" | "booker" | "full";
      readonly message: string;
    };

/** Add one guest, refusing the booker, duplicates and a full roster. Pure. */
export function addGuest(
  guests: readonly BookingParticipant[],
  participant: BookingParticipant,
  booker: Booker,
): AddGuestResult {
  const key = guestKey(participant);
  if (!key)
    return {
      ok: false,
      reason: "no-contact",
      message:
        "Add a mobile number or an email so they can get the invitation.",
    };
  if (booker.personId && participant.personId === booker.personId)
    return {
      ok: false,
      reason: "booker",
      message: "You're already in, as the person booking.",
    };
  if (guests.some((guest) => guestKey(guest) === key))
    return {
      ok: false,
      reason: "duplicate",
      message: `${guestName(participant)} is already on this booking.`,
    };
  if (guests.length >= MAX_GUESTS)
    return {
      ok: false,
      reason: "full",
      message: `A booking takes up to ${MAX_GUESTS + 1} players.`,
    };
  return { ok: true, guests: [...guests, participant] };
}

export function removeGuest(
  guests: readonly BookingParticipant[],
  key: string,
): readonly BookingParticipant[] {
  return guests.filter((guest) => guestKey(guest) !== key);
}

/**
 * The Duna players chosen in the players sheet replace the earlier Duna
 * choices; people outside Duna stay. Pure.
 */
export function withDunaPlayers(
  guests: readonly BookingParticipant[],
  players: readonly PersonSummary[],
  booker: Booker,
): readonly BookingParticipant[] {
  const outside = guests.filter((guest) => !guest.personId);
  const duna = players
    .filter((person) => person.id !== booker.personId)
    .map((person): BookingParticipant => ({
      personId: person.id,
      name: person.displayName,
      person,
    }));
  return [...duna, ...outside].slice(0, MAX_GUESTS);
}

/** The seats to draw: the booker first, the guests, then open seats. Pure. */
export function rosterSeats(input: {
  readonly booker: Booker;
  readonly guests: readonly BookingParticipant[];
  /** The court's capacity (players it is set up for). */
  readonly capacity?: number;
}): readonly RosterSeat[] {
  const seats: RosterSeat[] = [
    {
      kind: "booker",
      key: `booker-${input.booker.personId ?? "me"}`,
      name: input.booker.name,
      ...(input.booker.photoUrl ? { photoUrl: input.booker.photoUrl } : {}),
    },
  ];
  for (const participant of input.guests) {
    const key = guestKey(participant) ?? guestName(participant);
    const photoUrl = participant.person?.avatarUrl;
    seats.push({
      kind: "guest",
      key,
      name: guestName(participant),
      ...(photoUrl ? { photoUrl } : {}),
      onDuna: Boolean(participant.personId),
      channel: participant.personId
        ? "duna"
        : participant.phoneE164
          ? "text"
          : "email",
      participant,
    });
  }
  const total = Math.max(input.capacity ?? DEFAULT_SEATS, seats.length);
  for (let index = seats.length; index < total; index += 1)
    seats.push({ kind: "open", key: `open-${index}` });
  return seats;
}

/** A mobile number as E.164 (US numbers without a country code get +1). Pure. */
export function phoneE164(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const digits = value.replace(/\D/g, "");
  if (value.trim().startsWith("+") && digits.length >= 8 && digits.length <= 15)
    return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return undefined;
}

export function normalEmail(value: string | undefined): string | undefined {
  const email = value?.trim().toLowerCase();
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : undefined;
}

/** What a picked contact offers: its name and each usable number and email. */
export interface PickedContact {
  readonly name: string;
  readonly phones: readonly {
    readonly label?: string;
    readonly number?: string;
  }[];
  readonly emails: readonly {
    readonly label?: string;
    readonly address?: string;
  }[];
}

export interface ContactRoute {
  readonly kind: "text" | "email";
  readonly value: string;
  readonly label: string;
}

/** The ways to reach a picked contact: mobile numbers first, then emails. Pure. */
export function contactRoutes(contact: PickedContact): readonly ContactRoute[] {
  const routes: ContactRoute[] = [];
  const seen = new Set<string>();
  const phones = [...contact.phones].sort(
    (left, right) =>
      Number(/mobile|iphone|cell/i.test(right.label ?? "")) -
      Number(/mobile|iphone|cell/i.test(left.label ?? "")),
  );
  for (const phone of phones) {
    const value = phoneE164(phone.number);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    routes.push({ kind: "text", value, label: phone.label ?? "phone" });
  }
  for (const email of contact.emails) {
    const value = normalEmail(email.address);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    routes.push({ kind: "email", value, label: email.label ?? "email" });
  }
  return routes;
}

/**
 * The guest a contact becomes once a way to reach them is chosen: the name
 * and that one number or email, nothing else. Pure.
 */
export function contactToGuest(
  name: string,
  route: ContactRoute,
): BookingParticipant {
  const trimmed = name.trim();
  return {
    ...(trimmed ? { name: trimmed.slice(0, 120) } : {}),
    ...(route.kind === "text"
      ? { phoneE164: route.value }
      : { email: route.value }),
  };
}

/** A typed name and "mobile or email" as a guest, or why not. Pure. */
export function manualGuest(
  name: string,
  target: string,
): { readonly guest: BookingParticipant } | { readonly error: string } {
  const value = target.trim();
  const email = value.includes("@") ? normalEmail(value) : undefined;
  const phone = email ? undefined : phoneE164(value);
  if (!email && !phone)
    return {
      error: value.includes("@")
        ? "That email doesn't look complete."
        : "Enter a mobile number (with its country code outside the US) or an email.",
    };
  return {
    guest: contactToGuest(
      name,
      email
        ? { kind: "email", value: email, label: "email" }
        : { kind: "text", value: phone!, label: "mobile" },
    ),
  };
}

/** The participants the checkout and quote take (no person objects). Pure. */
export function checkoutParticipants(
  guests: readonly BookingParticipant[],
): readonly {
  readonly personId?: string;
  readonly name?: string;
  readonly email?: string;
  readonly phoneE164?: string;
}[] {
  return guests.map((guest) => ({
    ...(guest.personId ? { personId: guest.personId } : {}),
    ...(guest.name ? { name: guest.name } : {}),
    ...(guest.email ? { email: guest.email } : {}),
    ...(guest.phoneE164 ? { phoneE164: guest.phoneE164 } : {}),
  }));
}

/** The money lines the pay step shows, straight from the backend's quote. */
export interface PayLines {
  readonly totalMinor: number;
  readonly payNowMinor: number;
  /** What each invited player pays when splitting (the backend's share). */
  readonly eachGuestMinor?: number;
  readonly shareCount: number;
  readonly feeMinor: number;
}

/**
 * The quote's numbers for the chosen way to pay. Never divides money on the
 * phone: the backend decides every share (and where an odd cent goes). Pure.
 */
export function payLines(
  quote: {
    readonly totalMinor: number;
    readonly payNowMinor: number;
    readonly participantShareMinor: number;
    readonly shareCount: number;
    readonly feeTotalMinor: number;
  },
  mode: "full" | "split",
): PayLines {
  return {
    totalMinor: quote.totalMinor,
    payNowMinor: quote.payNowMinor,
    ...(mode === "split"
      ? { eachGuestMinor: quote.participantShareMinor }
      : {}),
    shareCount: mode === "split" ? quote.shareCount : 1,
    feeMinor: quote.feeTotalMinor,
  };
}

/** A Sand Rating as the roster shows it: "4.21", or a dash while provisional. Pure. */
export function sandRatingText(
  rating: { readonly display: number; readonly confidence: string } | undefined,
): string {
  if (
    !rating ||
    rating.confidence === "Provisional" ||
    !Number.isFinite(rating.display)
  )
    return "–";
  return rating.display.toFixed(2);
}

/** Suggestions in the order the owner asked for: frequent partners first. Pure. */
export function suggestionOrder<
  T extends { readonly relationship: string; readonly sharedTeams: number },
>(results: readonly T[]): readonly T[] {
  const rank = (relationship: string) =>
    relationship === "recent-partner"
      ? 0
      : relationship === "connection"
        ? 1
        : relationship === "nearby"
          ? 2
          : 3;
  return [...results].sort(
    (left, right) =>
      rank(left.relationship) - rank(right.relationship) ||
      right.sharedTeams - left.sharedTeams,
  );
}
