/**
 * Pure parts of invitations by text message (INVITE-SMS): phone number
 * normalisation, the destination hash, the inviter's short name, the
 * venue-time phrase and the exact message text. No I/O, no environment.
 *
 * The message text is the provider template `INVITE_SMS_TEMPLATE_TEXT`
 * rendered with three variables. The owner registers EXACTLY this text as a
 * transactional template with the provider; the preview renders it locally,
 * so what the sender reviews is what the recipient gets.
 */
import { createHash } from "node:crypto";

/** The template the owner registers with the provider (variables in `{{ }}`). */
export const INVITE_SMS_TEMPLATE_TEXT =
  "Duna: {{inviter}} invited you to {{details}}. Join here: {{link}} Reply STOP to opt out.";

export const INVITE_SMS_MAX_RECIPIENTS = 8;

export interface InviteSmsVariables {
  readonly inviter: string;
  readonly details: string;
  readonly link: string;
}

export function renderInviteSms(variables: InviteSmsVariables): string {
  return INVITE_SMS_TEMPLATE_TEXT.replace("{{inviter}}", variables.inviter)
    .replace("{{details}}", variables.details)
    .replace("{{link}}", variables.link);
}

export type PhoneNormalisation =
  { readonly ok: true; readonly e164: string } | { readonly ok: false };

/**
 * Normalise a number typed or picked from the contacts sheet to E.164.
 * Accepts `+` international numbers (8 to 15 digits, no leading zero country
 * code), and North American numbers written without `+1` (10 digits, or 11
 * starting with 1). North American numbers must have a valid area code and
 * exchange (2–9 first digit, not N11) and are never 555-01XX fiction
 * numbers. Anything else is invalid; nothing is guessed for other countries.
 */
export function normalisePhone(raw: string): PhoneNormalisation {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > 32) return { ok: false };
  if (!/^[+\d\s().-]+$/.test(trimmed)) return { ok: false };
  const plus = trimmed.startsWith("+");
  if (trimmed.indexOf("+", 1) !== -1) return { ok: false };
  const digits = trimmed.replace(/\D/g, "");
  let e164: string;
  if (plus) {
    e164 = `+${digits}`;
  } else if (digits.length === 10) {
    e164 = `+1${digits}`;
  } else if (digits.length === 11 && digits.startsWith("1")) {
    e164 = `+${digits}`;
  } else {
    return { ok: false };
  }
  if (!/^\+[1-9]\d{7,14}$/.test(e164)) return { ok: false };
  if (e164.startsWith("+1")) {
    const national = e164.slice(2);
    if (national.length !== 10) return { ok: false };
    const area = national.slice(0, 3);
    const exchange = national.slice(3, 6);
    if (!/^[2-9]\d{2}$/.test(area) || !/^[2-9]\d{2}$/.test(exchange)) {
      return { ok: false };
    }
    if (/^[2-9]11$/.test(area) || /^[2-9]11$/.test(exchange)) {
      return { ok: false };
    }
    if (exchange === "555" && national.slice(6, 8) === "01") {
      return { ok: false };
    }
  }
  return { ok: true, e164 };
}

/**
 * Pseudonymous key for a number (suppression list, limits, status). SHA-256
 * with a fixed domain prefix so the same number always maps to the same key
 * across deployments; it is NOT anonymous (the number space is small).
 */
export function destinationHash(e164: string): string {
  return createHash("sha256")
    .update(`duna.invite-sms.destination.v1:${e164}`)
    .digest("hex");
}

export function lastFour(e164: string): string {
  return e164.slice(-4);
}

/** "Alex Rivera" → "Alex R."; one word stays as it is. */
export function inviterShortName(person: {
  readonly givenName?: string | null;
  readonly familyName?: string | null;
  readonly displayName: string;
}): string {
  const given = clean(person.givenName ?? "", 24);
  const family = clean(person.familyName ?? "", 24);
  if (given) {
    const initial = family ? [...family][0]?.toUpperCase() : undefined;
    return initial ? `${given} ${initial}.` : given;
  }
  const parts = clean(person.displayName, 48).split(" ").filter(Boolean);
  if (parts.length === 0) return "A Duna player";
  const first = parts[0]!.slice(0, 24);
  const last = parts.length > 1 ? parts[parts.length - 1]! : "";
  const initial = last ? [...last][0]?.toUpperCase() : undefined;
  return initial ? `${first} ${initial}.` : first;
}

/**
 * Text that came from people (titles, venue labels) is flattened to one
 * short line with no links, so an invitation can never carry a stranger's
 * URL or a paragraph of marketing.
 */
export function clean(value: string, max: number): string {
  const flattened = value
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/www\.\S+/gi, "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[<>{}]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if ([...flattened].length <= max) return flattened;
  return `${[...flattened]
    .slice(0, max - 1)
    .join("")
    .trimEnd()}…`;
}

/** "Sat, Dec 6 at 9:00 AM PST" in the venue's own time zone. */
export function venueTimePhrase(startsAt: Date, timeZone: string): string {
  const zone = safeZone(timeZone);
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(startsAt);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(startsAt);
  return `${day} at ${time}`;
}

function safeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(0);
    return timeZone;
  } catch {
    return "UTC";
  }
}

export type InviteSmsKind =
  "match" | "court-booking" | "session" | "pickup" | "club";

/** The "what and when" phrase for each kind; people's text is cleaned. */
export function inviteDetails(input: {
  readonly kind: InviteSmsKind;
  readonly title?: string;
  readonly place?: string;
  readonly startsAt?: Date;
  readonly timeZone?: string;
}): string {
  const place = input.place ? clean(input.place, 40) : "";
  const at = place ? ` at ${place}` : "";
  const when =
    input.startsAt && input.timeZone
      ? ` on ${venueTimePhrase(input.startsAt, input.timeZone)}`
      : "";
  switch (input.kind) {
    case "court-booking":
      return `a court booking${at}${when}`;
    case "pickup":
      return `a pickup game${at}${when}`;
    case "session": {
      const title = input.title ? clean(input.title, 40) : "a session";
      return `${title}${at}${when}`;
    }
    case "match":
      return `confirm a match they recorded${at}${when}`;
    case "club":
      return `join ${place || "their club"} on Duna`;
  }
}
