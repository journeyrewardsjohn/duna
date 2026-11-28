/**
 * Invitations the booker sends from their own phone (M-P3; owner decision,
 * 28 Nov: "the invites should be sent from the user themselves and just open
 * on their device in their messaging app or WhatsApp"). Pure; tested in
 * `invite-links.test.ts`.
 *
 * Duna texts no one: the court checkout is told `inviteDelivery: "self"`,
 * creates each invitation and its claim link (so the roster shows the
 * pending seat), and the confirmed screen opens Messages, WhatsApp or the
 * share sheet with the words and link filled in. The person presses Send in
 * their own app, so Duna can only ever say a message was opened, never sent.
 */
export function bookingInviteUrl(origin: string, inviteToken: string): string {
  return `${origin.replace(/\/$/, "")}/app/booking-invite/${encodeURIComponent(inviteToken)}`;
}

export function matchUrl(origin: string, matchSlug: string): string {
  return `${origin.replace(/\/$/, "")}/events/${encodeURIComponent(matchSlug)}`;
}

/**
 * The invitation, short and from the person, no marketing:
 * "John invited you to a beach court at The Strand, Sat Nov 28 11:30 AM.
 * Join on Duna: <link>". Pure.
 */
export function inviteMessage(input: {
  readonly organizerName: string;
  /** "a beach court", "a match". */
  readonly what: string;
  readonly place: string;
  /** "Sat Nov 28 11:30 AM". */
  readonly when: string;
  readonly url: string;
}): string {
  const first = input.organizerName.trim().split(/\s+/)[0] || "A friend";
  return `${first} invited you to ${input.what} at ${input.place}, ${input.when}. Join on Duna: ${input.url}`;
}

/** A phone number as the address part of a link: "+" and digits only. Pure. */
export function dialable(phone: string): string | undefined {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return undefined;
  return `${trimmed.startsWith("+") ? "+" : ""}${digits}`;
}

/**
 * The phone's own Messages composer, addressed and filled in. iOS takes
 * `sms:<number>&body=`; Android `sms:<number>?body=`. Several numbers become
 * one group message only when the person chooses that (iOS:
 * `sms:/open?addresses=a,b&body=`). Undefined when no number is usable. Pure.
 */
export function smsUrl(
  phones: readonly string[],
  body: string,
  platform: "ios" | "android" | string,
): string | undefined {
  const numbers = phones.flatMap((phone) => {
    const value = dialable(phone);
    return value ? [value] : [];
  });
  if (numbers.length === 0) return undefined;
  const text = encodeURIComponent(body);
  if (platform === "ios") {
    return numbers.length === 1
      ? `sms:${numbers[0]}&body=${text}`
      : `sms:/open?addresses=${numbers.join(",")}&body=${text}`;
  }
  return `sms:${numbers.join(",")}?body=${text}`;
}

/**
 * WhatsApp to one number with the same words (`https://wa.me/<digits>`; it
 * falls back to WhatsApp on the web when the app is not installed). Only for
 * a number with a country code. Pure.
 */
export function whatsappUrl(phone: string, body: string): string | undefined {
  const value = dialable(phone);
  if (!value?.startsWith("+")) return undefined;
  return `https://wa.me/${value.slice(1)}?text=${encodeURIComponent(body)}`;
}

/** An email the person sends from their own mail app. Pure. */
export function mailtoUrl(
  email: string,
  subject: string,
  body: string,
): string {
  return `mailto:${encodeURIComponent(email.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** What Duna can honestly say about an invitation the person sends. */
export type InviteState =
  "ready" | "opened-messages" | "opened-whatsapp" | "opened-mail" | "shared";

export const INVITE_STATE_WORDS: Readonly<Record<InviteState, string>> = {
  ready: "Invitation ready to send",
  "opened-messages": "Opened in Messages",
  "opened-whatsapp": "Opened in WhatsApp",
  "opened-mail": "Opened in Mail",
  shared: "Shared",
};
