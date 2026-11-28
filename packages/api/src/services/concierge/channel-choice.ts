/**
 * Concierge channel choice (B7). Pure: facts about one recipient in, exactly
 * one channel or exactly one "cannot be reached" reason out. Never more than
 * one channel per person per send (docs/MESSAGING_PLATFORM.md).
 *
 * The rules, in order:
 *  1. No Duna account a person can sign in to                → no-channel
 *  2. The person blocked the club                            → blocked
 *  3. A junior                                               → duna (in-app only;
 *     the guardian is the one contacted, as their own recipient)
 *  4. Muted the club or this thread                          → duna
 *  5. Preferred channel for this kind of message is `duna`   → duna
 *  6. Preferred outside channel opted out (STOP)             → no-consent
 *  7. Preferred outside channel not connected and verified   → duna
 *     (a preference never implies consent)
 *  8. Channel switched off (kill switch)                     → channel-not-enabled
 *  9. Provider has no production values                      → provider-not-configured
 * 10. Inside the person's quiet hours, conversation message  → quiet-hours
 *     (operational notices such as a cancellation are not held)
 * 11. Otherwise                                              → that channel
 */
import type { ConciergeChannel } from "./types";

export type ConciergeUnreachableReason =
  | "no-channel"
  | "channel-not-enabled"
  | "provider-not-configured"
  | "no-consent"
  | "quiet-hours"
  | "blocked";

export type ChannelAvailability =
  "available" | "not-enabled" | "provider-not-configured";

export type ConciergeMessageKind = "conversation" | "operational";

export interface QuietHours {
  /** "21:00" or "21:00:00". */
  readonly start: string;
  readonly end: string;
  /** IANA time zone of the recipient, "America/Los_Angeles". */
  readonly timezone: string;
}

export interface RecipientChannelFacts {
  readonly isMinor: boolean;
  /** False for an imported or unclaimed profile nobody can sign in to. */
  readonly hasAccount: boolean;
  readonly blockedClub: boolean;
  readonly mutedClub: boolean;
  readonly mutedThread: boolean;
  readonly preferredChannel: ConciergeChannel;
  /** Null: operational notices use the preferred channel. */
  readonly operationalChannel: ConciergeChannel | null;
  readonly quietHours?: QuietHours;
  /** Outside channels with a connected (verified) endpoint. */
  readonly connectedChannels: ReadonlySet<ConciergeChannel>;
  /** Outside channels whose latest endpoint was revoked by an opt-out keyword. */
  readonly optedOutChannels: ReadonlySet<ConciergeChannel>;
}

export type ChannelChoice =
  | { readonly channel: ConciergeChannel; readonly reason?: undefined }
  | { readonly channel?: undefined; readonly reason: ConciergeUnreachableReason };

function minutesOf(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

/** Minutes since local midnight in `timezone`; UTC when the zone is unknown. */
export function localMinutes(now: Date, timezone: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const hour = Number(parts.find((part) => part.type === "hour")?.value);
    const minute = Number(parts.find((part) => part.type === "minute")?.value);
    if (Number.isFinite(hour) && Number.isFinite(minute))
      return hour * 60 + minute;
  } catch {
    // An unknown zone falls through to UTC.
  }
  return now.getUTCHours() * 60 + now.getUTCMinutes();
}

/** True when `now` falls inside the quiet window (which may cross midnight). */
export function isWithinQuietHours(now: Date, quietHours: QuietHours): boolean {
  const start = minutesOf(quietHours.start);
  const end = minutesOf(quietHours.end);
  if (start === end) return false;
  const local = localMinutes(now, quietHours.timezone);
  return start < end
    ? local >= start && local < end
    : local >= start || local < end;
}

export function isValidTimeZone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/** The one channel (or reason) for this recipient, for this kind of message. */
export function chooseChannel(input: {
  readonly facts: RecipientChannelFacts;
  readonly kind: ConciergeMessageKind;
  readonly availability: (channel: ConciergeChannel) => ChannelAvailability;
  readonly now: Date;
  /** A channel the sender picked on the review; checked by the same rules. */
  readonly requested?: ConciergeChannel;
}): ChannelChoice {
  const { facts } = input;
  if (!facts.hasAccount) return { reason: "no-channel" };
  if (facts.blockedClub) return { reason: "blocked" };
  if (facts.isMinor) return { channel: "duna" };
  if (facts.mutedClub || facts.mutedThread) return { channel: "duna" };
  const wanted =
    input.requested ??
    (input.kind === "operational"
      ? (facts.operationalChannel ?? facts.preferredChannel)
      : facts.preferredChannel);
  if (wanted === "duna") return { channel: "duna" };
  if (!facts.connectedChannels.has(wanted)) {
    return facts.optedOutChannels.has(wanted)
      ? { reason: "no-consent" }
      : { channel: "duna" };
  }
  const availability = input.availability(wanted);
  if (availability === "not-enabled") return { reason: "channel-not-enabled" };
  if (availability === "provider-not-configured")
    return { reason: "provider-not-configured" };
  if (
    input.kind === "conversation" &&
    facts.quietHours &&
    isWithinQuietHours(input.now, facts.quietHours)
  ) {
    return { reason: "quiet-hours" };
  }
  return { channel: wanted };
}

/**
 * Whether the sender may switch this recipient to `channel` on the review:
 * `duna` always (unless the person cannot be reached at all), an outside
 * channel only when the rules would deliver on it.
 */
export function canRequestChannel(input: {
  readonly facts: RecipientChannelFacts;
  readonly kind: ConciergeMessageKind;
  readonly availability: (channel: ConciergeChannel) => ChannelAvailability;
  readonly now: Date;
  readonly channel: ConciergeChannel;
}): boolean {
  const choice = chooseChannel({ ...input, requested: input.channel });
  return choice.channel === input.channel;
}
