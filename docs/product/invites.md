# Invitations by text message (INVITE-SMS, 28 November 2026)

The owner's ask: "Invite someone" is a button that opens a bottom sheet;
the player picks people from their contacts and Duna texts each one an
invitation (SMS, or RCS where the phone and sender support it).

This document is the backend contract. The sheet itself is the Player app's
(`apps/player/src/features/booking/**`).

## What a person can invite to

A signed-in **adult** (`adultProcedure`; a junior account never sends) may
text an invitation to something they **host or are booked into**. Anyone
else's subject answers "not found". Every text carries a link the product
already has:

| `inviteKind`    | `subjectId`                      | Who may send                                          | The link in the text                                                                                                                                 |
| --------------- | -------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `court-booking` | `court_bookings.id`              | the booker, or an accepted / paying participant       | that number's booking invitation, `/app/booking-invite/<token>`. A number not yet on the booking becomes an `invited` participant (share 0) at send. |
| `session`       | `catalog_session_occurrences.id` | someone holding a place (same rule as `createInvite`) | the sender's share link `/i/<code>` (`player.participation.createInvite`)                                                                            |
| `pickup`        | `pickup_sessions.id`             | the host or a confirmed player                        | the pickup page `/events/pickup-<id>`. Public pickups only; a private pickup answers "share it with people on Duna".                                 |
| `match`         | `matches.id`                     | whoever recorded the match                            | that number's pending match invitation `/join/match/<token>`; a number without one is "not on this invitation"                                       |
| `club`          | `organizations.id`               | a person with pending club invitations they made      | that number's pending invitation `/join/organization/<token>`; a number without one is "not on this invitation"                                      |

Gaps to know: the `/i/<code>` landing page is not built yet on the web
(the share-link resolver exists: `public.participation.invite`); the
booking-invite, match and club pages exist.

## The message (exact copy)

One template, three variables, registered with the provider as a
**transactional** template (`INVITE_SMS_TEMPLATE_TEXT` in
`packages/api/src/services/invites/sms-text.ts`):

```text
Duna: {{inviter}} invited you to {{details}}. Join here: {{link}} Reply STOP to opt out.
```

- `inviter`: first name and last initial ("Alex R."); a one-word name stays as it is.
- `details`: what and when, in the venue's own time zone:
  - court booking: `a court booking at Sunset Beach Courts on Sun, Dec 6 at 9:00 AM PST`
  - session: `Intermediate clinic at Demo Beach Club on Mon, Dec 7 at 8:30 AM PST`
  - pickup: `a pickup game at North Lot on Sun, Dec 6 at 3:00 PM PST`
  - match: `confirm a match they recorded at Sunset Beach Courts on Fri, Nov 27 at 10:00 AM PST`
  - club: `join Demo Beach Club on Duna`
- `link`: the claim link above on `https://duna.coach`.

Titles and place names that people typed are flattened to one line, at most
40 characters, with any web address removed, so a text can never carry a
stranger's link or a paragraph of marketing. Nothing else is ever sent: no
promotion, no follow-up, one text per person per invitation.

## Who is never texted (the preview says why)

| Reason              | Meaning                                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `invalid-number`    | Not a readable phone number. International numbers need `+`; North American numbers may omit `+1`. The 555-01XX fiction range is refused.  |
| `opted-out`         | The number replied STOP, was disconnected by its carrier, or the provider reports it unsubscribed.                                         |
| `junior`            | A Duna account under 18 has this number, or the club invitation is for a minor. Juniors are invited through their guardian, never by text. |
| `rate-limited`      | The sender has sent 20 texts in the last 24 hours, or this number has had 3 invitation texts in the last 24 hours (from anyone).           |
| `already-invited`   | The sender already texted this number for this subject, or the number is twice in the list.                                                |
| `own-number`        | The sender's own number.                                                                                                                   |
| `not-on-invitation` | (match, club, or a number already removed from the booking) There is no invitation for this number to re-send.                             |

## Preview → confirm → send

1. `player.invites.smsPreview({ inviteKind, subjectId, recipients })`
   (mutation). `recipients` are only the contacts the person picked: up to
   eight `{ name, phoneE164 }`. Never upload an address book. Returns
   `previewHash`, `expiresAt` (15 minutes), `sendState` (`ready`,
   `not-configured`, `not-enabled`), `readyCount` and, per recipient in
   request order, `{ index, name, maskedNumber: "•••• 0142", state:
"ready" | "blocked", reason?, text? }`. `text` is exactly what that person
   will receive. The preview creates no invitation anyone else can see (a
   new booking invitee is created only at send); for a session it ensures
   the sender's share link exists, as `createInvite` does.
2. The person reviews the texts and confirms.
3. `player.invites.sendSms({ inviteKind, subjectId, recipients, previewHash,
confirmed: true, idempotencyKey })`. The same recipients as the preview.
   A changed list, booking, time, link or block, or a preview older than 15
   minutes or already sent, answers `CONFLICT` ("This invitation changed
   since you reviewed it…"): preview again. The same `idempotencyKey`
   returns the first answer without sending again. Answers `{ sentCount,
recipients: [{ id, name, maskedNumber, state, reason?, failureCode?,
sentAt?, deliveredAt? }] }`.
4. `player.invites.smsStatus({ inviteKind, subjectId })` (query): the
   sender's own texts for that subject, newest first, with
   `state`: `sending` (handed over, outcome not yet known), `sent`,
   `delivered`, `failed` (with `failureCode`, e.g. `carrier_rejected`,
   `unsubscribed`), `not-configured`, `skipped` (with `reason`).

Errors: `NOT_FOUND` (not yours, or does not exist), `BAD_REQUEST` (started,
cancelled, private pickup, invalid input), `CONFLICT` (stale preview,
idempotency key reused for something else), `PRECONDITION_FAILED` (junior
account; "This feature is not configured yet."; switched off),
`TOO_MANY_REQUESTS` (procedure budget). Every error has `data.requestId`.

### Demo mode

The preview works from fixtures (`@duna/core/demo/invites`: any subject id
resolves to that kind's demo subject; `+13104820123` is on the demo
suppression list). `sendState` is `not-configured` and the send answers
`PRECONDITION_FAILED` "This feature is not configured yet.". `smsStatus`
returns three fixture rows (delivered, sent, failed).

## Provider and webhooks

The provider is Prelude Notify v2, behind `InviteSmsProvider`
(`services/invites/sms-provider.ts`). Facts relied on (documentation read
28 November 2026):

- `POST https://api.prelude.dev/v2/notify`, `Authorization: Bearer <v2 API
key>`; required `to` (E.164) and `template_id`; `variables` must be exactly
  the template's; optional `from` (approved sender), `callback_url`,
  `correlation_id` (≤ 80, echoed in webhooks), `expires_at` (≤ 24 h, default
  15 min), `preferred_channel` (`sms`, `rcs`, `whatsapp`; falls back to SMS
  when the device or sender cannot do RCS).
  <https://docs.prelude.so/notify/v2/api-reference/send-a-message>,
  <https://docs.prelude.so/notify/v2/documentation/introduction>
- No idempotency key: a timeout or 5xx is recorded as `sending` and never
  retried automatically; our row id is the `correlation_id`, so the
  delivery webhook settles it.
- Templates are created as drafts and submitted for review; status `ready`
  per country; US/Canada need a registered sender.
  <https://docs.prelude.so/notify/v2/api-reference/management/templates/create-template>,
  <https://docs.prelude.so/notify/v2/documentation/us-canada-opt-in>
- Webhooks: envelope `{ id, type, payload, created_at }`; delivery events
  `transactional.message.created|submitted|pending_delivery|delivered|failed`
  (a `failed` with `next_retry_at` is not final; events can arrive out of
  order); signed with RSASSA-PSS SHA-256 over the raw body, header
  `X-Webhook-Signature: rsassa-pss-sha256=<base64url>`, verified with the
  dashboard's PEM public key; retried until we answer 200.
  <https://docs.prelude.so/notify/v2/documentation/webhook>
- STOP / START / HELP are handled by the provider and reported as
  `marketing.subscription.stop|start|help` to a subscription config's
  callback (set up by the provider's support team), plus
  `marketing.subscription.carrier_disconnect`. The provider's own
  subscription blocking applies to **marketing** only: transactional sends
  are not blocked by it, so Duna keeps its own suppression list.
  <https://docs.prelude.so/notify/v2/documentation/subscription-management>

`POST /api/invites/sms/webhook` (thin route in `apps/web`, logic in
`@duna/api/invite-sms-webhook`): verifies the signature before reading
(401 otherwise; 503 until the public key is set), records each event id
once in `webhook_events` (provider `prelude`, ids and states only, never a
number), and applies delivery forward-only (`delivered` is never
overwritten). STOP and carrier disconnect add the number's hash to
`sms_suppressions`; START removes only a STOP.

## Data kept

- `invite_sms_messages`: one row per previewed recipient: sender, subject,
  the name the sender typed, the SHA-256 of the number (fixed domain
  prefix; pseudonymous, not anonymous), its last four digits, the state and
  provider message id. Never the number, never the text.
- `sms_suppressions`: number hashes that must not be texted, with the source.
- The number itself stays only where the invitation already kept it
  (`court_booking_participants`, `match_participant_invitations`,
  `organization_invitations`) and in the send request.

Migration: `0126_invite_sms.sql` (additive: two tables).

## Concierge

Not registered as a Concierge channel. Concierge sends free text from a
thread; this provider's Notify API sends approved templates only, so a
Concierge SMS channel would need its own generic template, a channel value
in `concierge_channels`, consent capture and inbound handling: a separate
package (follow-up), not a small additive change.

## Client note (Player app invite sheet)

1. "Invite someone" opens the sheet. Pick contacts with the system contact
   picker (`expo-contacts` `presentContactPickerAsync` or equivalent): send
   only the picked people's `{ name, phoneE164 }`, at most 8. Never read or
   upload the whole address book.
2. On "Review", call `player.invites.smsPreview`. Show each person with
   `maskedNumber` and either the exact `text` (ready) or the `reason`
   (blocked) in plain words: invalid number, "said STOP to Duna texts",
   "under 18: invite their parent or guardian", "limit reached, try
   tomorrow", "already invited", "that's your number", "not on this
   invitation".
3. If `sendState` is `not-configured`, show the honest "Texting invitations
   isn't set up yet" state and offer the share link instead; if
   `not-enabled`, hide the send button. Name no provider.
4. Confirm button: "Send N texts" (N = `readyCount`, disabled at 0), the
   confirm tier from the interaction kit. Call `player.invites.sendSms` with
   the SAME recipients, `previewHash`, `confirmed: true` and one
   `idempotencyKey` per confirmation (reuse it on retry). On `CONFLICT`,
   re-run the preview and show the new texts. On `PRECONDITION_FAILED`
   show not configured; on `TOO_MANY_REQUESTS` show "try again shortly".
   Show `data.requestId` as the reference on unexpected errors.
5. After sending, poll `player.invites.smsStatus` (for example every 10 s
   while the sheet is open, stop when nothing is `sending`/`sent`): show
   sending, sent, delivered, failed (with a "try another number" hint) and
   skipped.
6. Offline: keep the picked list, disable Review, say "You're offline".
