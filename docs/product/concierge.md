# Duna Concierge (B7)

Coaches and staff always talk to Duna; Duna carries the message to the people
connected to the thing it is about, each on the one channel they chose, and
replies come back to the same thread. Concierge extends Duna Messaging
([`docs/MESSAGING_PLATFORM.md`](../MESSAGING_PLATFORM.md)): every rule there
still holds.

Code: `packages/api/src/services/concierge/`, routers
`packages/api/src/routers/concierge.ts` (`operator.concierge.*`,
`player.concierge.*`), contract `packages/api/src/contracts/concierge.ts`,
fixtures `@duna/core/demo/concierge`, tables
`packages/db/src/schema/concierge.ts` (migration 0123).

## Threads

A thread belongs to a thing. It IS a `messaging_conversations` row: every
existing conversation already is a thread (read directly, nothing copied, no
data migrated). Kind comes from the conversation:

| Thing                                       | Conversation                   | Thread kind  |
| ------------------------------------------- | ------------------------------ | ------------ |
| Lesson, clinic, bookable session occurrence | `context_type = lesson`        | `lesson`     |
| Match                                       | `match`                        | `match`      |
| Tournament / event, division                | `event`, `division`            | `tournament` |
| League (program)                            | `league`                       | `league`     |
| The club, a court booking, a direct thread  | `organization`, `rental`, none | `club`       |
| A person and Duna                           | `type = support`               | `duna`       |

- **Audience, resolved on the server, now.** A club thread for a thing reaches
  whoever is connected to it at the moment of sending: booked players (for a
  bookable session, the active catalog bookings; for a session the club
  cancelled, the people that cancellation affected), registrations for
  events, divisions and leagues, the club's members and staff for a club
  thread. The verified guardians of every junior are in the same thread.
  Blocks always win. A caller can never add people.
- **Membership follows the roster.** Each club send re-syncs the thread (the
  existing messaging rule): someone who cancels leaves and receives nothing
  more (a queued outside delivery to them is skipped); someone who joins sees
  the thread **from when they joined** in Concierge reads.
- **Read state and mute.** Per person (`markRead`, `setThreadMute`); a club's
  staff share the club's read state, as in the HQ inbox. Muting keeps the
  thread in Duna and stops outside channels.
- **Lists.** `threads` gives All / Unread / Families counts, kind filter,
  search, and for staff the queue (`mine`, `unassigned`, via
  `assignThread`). Keyset-paginated, at most 100, a fixed number of queries.

## The Send review

1. A coach writes, or Ask Duna drafts (`draftedBy: "duna"`, shown on the
   review), or another screen hands over (`drafts.createFromHandoff`).
   Nothing is sent.
2. `draftSend` returns the review: the thread, the text, every recipient with
   the ONE channel they will be reached on, everyone who cannot be reached
   and why, the guardian note when a junior is in it, and a `contentHash`.
   `editDraft` and `setRecipientChannel` (only to a channel the rules would
   deliver on) give a new hash. A review expires after 15 minutes.
3. The person presses Send: `confirmSend({ proposalId, contentHash,
idempotencyKey })`. The roster and every channel are recomputed; if the
   hash no longer matches (someone joined, cancelled, connected, opted out,
   or the text changed) the send is refused (`CONFLICT`) and the review is
   refreshed. A repeat confirm returns the sent card and never sends twice.
4. The message is posted to the thread as the club, attributed to the person
   (`onBehalfOfOrganization`), through the existing messaging send (safety
   screening for juniors, push, audit). Outside channels are queued.
5. `deliveries` shows each person's channel and state to the sender and to
   staff with `messages:read`; never to other recipients.

AI never sends: only `confirmSend`, by a signed-in person with
`messages:write`, sends, and only for the hash they reviewed.

## Channel choice (one per person)

`chooseChannel` in `channel-choice.ts`, in order:

| Rule                                                            | Result                                                                                                                                   |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| No Duna account anyone can sign in to                           | cannot reach: `no-channel`                                                                                                               |
| The person blocked the club                                     | `blocked`                                                                                                                                |
| A junior                                                        | `duna` (in-app only); the verified guardian is a recipient of their own (`guardianOf`); a junior with no verified guardian: `no-channel` |
| Muted the club or the thread                                    | `duna`                                                                                                                                   |
| Preferred channel for this kind is `duna` (the default)         | `duna`                                                                                                                                   |
| Preferred outside channel opted out (STOP)                      | `no-consent`                                                                                                                             |
| Preferred outside channel not connected and verified            | `duna` (never assumed)                                                                                                                   |
| Channel switched off (`concierge.channel.*`)                    | `channel-not-enabled`                                                                                                                    |
| Provider has no production values                               | `provider-not-configured`                                                                                                                |
| Inside the person's quiet hours (their time zone), conversation | `quiet-hours` (not sent, not delayed: a delayed send would act without a new confirmation)                                               |
| Otherwise                                                       | that channel                                                                                                                             |

Two kinds of message: `conversation` (the preferred channel; quiet hours
apply) and `operational` (cancellations, time changes: the person's
operational channel if set, else the preferred one; not held by quiet hours).

## Channels: live vs "not configured"

| Channel              | Today                                                                                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Duna (in-app + push) | Live: the thread, Expo push through the existing workflow.                                                                                                                                       |
| Email                | Code complete (Resend). Sends when `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are both set; production lacks `RESEND_FROM_EMAIL`, so it reports "not configured". Replies need the inbound domain. |
| iMessage             | Code complete (the Sendblue API shape of the existing pilot). "Not configured" until the owner provisions a Duna line.                                                                           |
| WhatsApp             | Code complete (Sent.dm, the provider already used for SMS templates, `whatsapp` channel, approved templates). "Not configured" until the owner approves a sender and templates.                  |

Every outside adapter sits behind one interface and answers the typed
`not-configured` result, with no HTTP call, while its values are absent.
Every call runs in `withProviderCall`. One delivery record per recipient
with its frozen channel and destination (the verified endpoint at confirm
time). Retries use the workflow backoff on the same channel and only when
the provider cannot have accepted it (Resend and Sent.dm honour idempotency
keys; Sendblue does not, so an unknown Sendblue outcome is `failed
outcome-unknown`, never retried). Before every attempt the worker checks the
message cleared screening, the person is still in the thread and the
endpoint is still connected.

## Inbound

- Webhooks: `POST /api/concierge/whatsapp` (Sent.dm), `POST
/api/concierge/email` (Resend), Sendblue on the existing
  `/api/sendblue/webhook` (a number with no pilot binding falls through to
  Concierge) and `/api/concierge/sendblue/status?delivery=<id>`. Signatures
  are verified before anything is read; each event is stored once
  (`webhook_events`), a replay is acknowledged and never re-posted.
- Routing: email replies carry a signed per-delivery token in the reply-to
  address and must come from the address it went to. Phone replies go to the
  one thread that person was messaged on that channel in the last 14 days;
  more than one candidate is never guessed.
- Posted as that person through the existing messaging send (membership,
  blocks, guardians and screening re-checked). The channel shows on the
  message.
- Quarantine: unknown senders, ambiguous threads, sender mismatches, lost
  access and media are held. Replies attributable to a club appear in
  `operator.concierge.quarantine`; the rest wait for Duna support.
- STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT, OPT OUT, REVOKE revoke that
  destination on that channel at once (`revoked_reason = opt-out`, audited);
  the next review shows `no-consent`.

## Channel preferences

Default: `duna` for everything; nothing assumes consent. A person connects
an email address or number (`connectChannel`), receives a six-digit code
through that channel (hash stored, 10 minutes, 5 attempts, 5 codes an hour),
verifies (`verifyChannel`), then may prefer it (`setPreference`, per kind)
and set quiet hours in their time zone. `revokeChannel` returns them to
in-app. `setClubMute` silences one club on outside channels. Juniors never
connect outside channels; their guardian is contacted.

## Permissions and privacy

- Operator: `messages:read` (threads, review, deliveries, quarantine),
  `messages:propose` (draft, edit, channel switch, cancel, assign, hand-offs),
  `messages:write` (confirm; rate-limited per club and per sender).
- Another club's ids answer `NOT_FOUND`. A person sees only threads they are
  an active participant of, and their juniors' as verified guardian.
- Message bodies never reach logs; audit rows carry ids and counts.
- Destinations are returned masked. Personal-data export includes channels,
  preferences, mutes and deliveries; account deletion removes destinations,
  preferences and mutes (`docs/legal/README.md`).
- Attachments stay in the Duna thread through the existing media service;
  outside channels carry text and a link to the thread.

## Hand-offs

`operator.concierge.drafts.createFromHandoff({ source, contextType,
contextId, label?, suggestedText?, draftedBy?, kind? })` finds or opens the
thread and, with text, prepares a Send review. `contextType: "direct"` with a
person id opens a club ↔ person thread. Wired today:

- `operator.participation.cancelSession` with a `note` → a review for the
  people the cancellation affected (`conciergeDraft` in the result).
- `operator.participation.resolveCancelRequest`: decline → a thread with the
  coach who asked (and a review of the note); approve with a note → the
  session thread's review. `coachNotified` stays false until a person sends.
- B4 training programs (`notifyAthletes`) calls the same entry point when it
  lands (not on main when B7 was written).

## What needs the owner

See `docs/plan/production-readiness.md` §1.20–1.24 and §1.31: a Duna
Sendblue line, a WhatsApp sender with approved templates
(`duna_concierge_message`, `duna_verification_code`), the email from-address
and inbound reply domain, webhook secrets, opt-in wording, quiet-hours
policy, and HELP auto-reply wording (not sent automatically today).
