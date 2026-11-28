/**
 * Invitations a player sends from their own phone or computer (WEB-INVITE;
 * owner, 28 Nov: "the invites should be sent from the user themselves and
 * just open on their device in their messaging app or WhatsApp"). Pure;
 * tested in `invite-links.test.ts`.
 *
 * Duna texts and emails no one for these invitations. The court checkout is
 * told `inviteDelivery: "self"`, the server creates each invitation and its
 * claim link, and this file builds the Messages, WhatsApp and share links
 * that open on the person's device with the words and link filled in. They
 * press Send there, so Duna can only say a message was opened, never sent.
 */

export function bookingInviteUrl(origin: string, inviteToken: string): string {
  return `${origin.replace(/\/$/, "")}/app/booking-invite/${encodeURIComponent(inviteToken)}`;
}

/**
 * "John invited you to a court at The Strand, Sat Nov 28 11:30 AM. Join on
 * Duna: <link>". The time is left out when it is not known. Pure.
 */
export function inviteMessage(input: {
  readonly organizerName: string;
  /** "a court", "a match". */
  readonly what: string;
  readonly place: string;
  readonly when?: string;
  readonly url: string;
}): string {
  const first = input.organizerName.trim().split(/\s+/)[0] || "A friend";
  const when = input.when ? `, ${input.when}` : "";
  return `${first} invited you to ${input.what} at ${input.place}${when}. Join on Duna: ${input.url}`;
}

/** The words for a session or pickup link the person shares. Pure. */
export function sessionInviteMessage(title: string, url: string): string {
  return `Join me: ${title}. Open it on Duna: ${url}`;
}

/** A phone number as the address part of a link: "+" and digits only. Pure. */
export function dialable(phone: string): string | undefined {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return undefined;
  return `${trimmed.startsWith("+") ? "+" : ""}${digits}`;
}

/**
 * The device's own Messages composer with the words filled in. With a
 * number it is addressed (iOS `sms:<number>&body=`, others
 * `sms:<number>?body=`); without one the person picks the recipient. Pure.
 */
export function smsUrl(
  body: string,
  options: { readonly phone?: string; readonly platform?: string } = {},
): string {
  const text = encodeURIComponent(body);
  const number = options.phone ? dialable(options.phone) : undefined;
  if (!number) return `sms:?&body=${text}`;
  return options.platform === "ios"
    ? `sms:${number}&body=${text}`
    : `sms:${number}?body=${text}`;
}

/**
 * WhatsApp with the same words. Addressed only for a number with a country
 * code; otherwise the person picks the chat. Falls back to WhatsApp on the
 * web when the app is not installed. Pure.
 */
export function whatsappUrl(body: string, phone?: string): string {
  const number = phone ? dialable(phone) : undefined;
  const text = encodeURIComponent(body);
  return number?.startsWith("+")
    ? `https://wa.me/${number.slice(1)}?text=${text}`
    : `https://wa.me/?text=${text}`;
}

/** The platform word `smsUrl` needs, from a user-agent string. Pure. */
export function platformOf(userAgent: string): "ios" | "other" {
  return /iPhone|iPad|iPod|Macintosh.*Mobile/i.test(userAgent)
    ? "ios"
    : "other";
}

/** A phone number or an email read back out of an invitation's display name. Pure. */
export function contactFromName(name: string): { readonly phone?: string } {
  const value = name.trim();
  return /^\+[1-9]\d{7,14}$/.test(value) ? { phone: value } : {};
}

/**
 * What Duna can honestly say about one invitation. The server's word wins:
 * a seat that is no longer "invited" is joined or closed. While it is still
 * "invited", the words say whether the person has opened a message yet.
 */
export type InviteServerStatus =
  | "organizer"
  | "invited"
  | "accepted"
  | "payment-pending"
  | "paid"
  | "declined"
  | "cancelled";

export type InviteOpened = "messages" | "whatsapp" | "shared" | "copied";

export function inviteStateWords(
  status: InviteServerStatus,
  opened?: InviteOpened,
): { readonly label: string; readonly tone: "neutral" | "info" | "positive" } {
  if (
    status === "accepted" ||
    status === "payment-pending" ||
    status === "paid"
  )
    return { label: "Joined", tone: "positive" };
  if (status === "declined") return { label: "Declined", tone: "neutral" };
  if (status === "cancelled") return { label: "Cancelled", tone: "neutral" };
  switch (opened) {
    case "messages":
      return { label: "Opened in Messages", tone: "info" };
    case "whatsapp":
      return { label: "Opened in WhatsApp", tone: "info" };
    case "shared":
      return { label: "Shared", tone: "info" };
    case "copied":
      return { label: "Link copied", tone: "info" };
    default:
      return { label: "Link ready", tone: "neutral" };
  }
}
