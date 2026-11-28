/**
 * Invitation links and words for the share sheet (M-P3). Pure; tested in
 * `roster.test.ts`.
 *
 * Today Duna texts a person outside Duna from the checkout itself (the
 * court checkout sends each invited mobile number its link through the
 * configured text provider). There is no separate "send this invitation by
 * text" procedure in the router yet (`player.invites.sendSms` is a backend
 * package in flight), so the confirmed screen also offers the person the
 * system share sheet with each invitation link: they can send it themselves
 * in Messages, WhatsApp or anything else. Nothing is sent without their tap.
 */
export function bookingInviteUrl(origin: string, inviteToken: string): string {
  return `${origin.replace(/\/$/, "")}/app/booking-invite/${encodeURIComponent(inviteToken)}`;
}

export function matchUrl(origin: string, matchSlug: string): string {
  return `${origin.replace(/\/$/, "")}/events/${encodeURIComponent(matchSlug)}`;
}

/** The message a person sends with their own phone. Pure. */
export function inviteMessage(input: {
  readonly inviteeName?: string;
  readonly organizerName: string;
  readonly venueName: string;
  readonly whenText: string;
  readonly url: string;
  /** "$12.50" when the invitee pays a share. */
  readonly shareText?: string;
}): string {
  const hello = input.inviteeName
    ? `${input.inviteeName.split(/\s+/)[0]}, you're`
    : "You're";
  const share = input.shareText ? ` Your share is ${input.shareText}.` : "";
  return `${hello} invited to play at ${input.venueName}, ${input.whenText}, with ${input.organizerName}.${share} Join on Duna: ${input.url}`;
}
