# Duna Messaging Platform

## Product boundary

Duna Messaging is a relationship and service-communication system. It is not a
marketing channel.

- Organizations can message active members and people connected through Duna
  events, divisions, leagues, lessons, rentals, registrations, or staff roles.
- A recipient block wins over every relationship. Blocking an organization also
  removes the member from its current conversations.
- Members can start direct or group conversations only with mutual follows.
- A verified professional can broadcast to followers. Followers cannot message
  the professional unless the follow is mutual.
- A conversation containing a minor cannot start without a verified guardian.
  The guardian is a participant in the same conversation, and every message is
  held until Duna SafeSport screening completes. Current minor status and
  guardian coverage are checked again at send and publication time, so an age
  status change cannot bypass screening. If the last active guardian leaves,
  the linked minor leaves too and pending messages remain held.
- Duna Support is initiated by the member. Duna AI has read-only, member-scoped
  tools and hands off any mutation, dispute, refund, identity, or safety issue.

These are server-side rules. A client-supplied organization, recipient, or
context identifier never grants messaging access.

## Surfaces

- Duna Player Web: inbox, conversation view, mutual-follow composer, Pro follower
  broadcast, blocking, rich actions, and Duna Support.
- Duna HQ: organization inbox and audience composer for the organization,
  events, divisions, leagues, lessons, rentals, and selected related people.
- Duna Player app: responsive inbox/thread UI, mutual-follow and follower
  composer, Duna Support, rich cards, blocking, safety state, and a SQLite
  offline outbox.
- Duna Pro app: organization inbox/thread UI, field composer for every supported
  organization audience, rich cards, and a SQLite offline outbox.
- Duna Super Admin: human Duna Support queue and SafeSport moderation queue.

## Data and delivery model

`0065_duna_messaging_platform.sql` creates the conversation, participant,
message, reaction, attachment, relationship, block, action-receipt, moderation,
and agent-run records. It also backfills durable relationship evidence from
existing memberships, registrations, lessons/leagues, rentals, and follows.

Messages have a client-generated UUID and a conversation-local sequence. The
server increments the sequence and inserts the message and audit event in one
database transaction. Repeated client UUIDs return the existing message.

Native apps write outbound messages to app-scoped SQLite before calling the
API. Failed or interrupted sends remain queued, retry when the app becomes
active, and use the same UUID on every attempt.

`0066_soft_jean_grey.sql` adds account-scoped Expo Push devices and idempotent
per-message delivery records. Published messages enqueue recipient-authorized
push work; youth messages do not enqueue until SafeSport clears them. The
worker batches by Player/Pro project, stores Expo tickets, checks receipts, and
disables tokens reported as `DeviceNotRegistered`. Notification taps deep-link
to the exact conversation. Apps register silently only after prior permission;
otherwise Messages shows an explicit opt-in. Signing out unregisters the
current token before the account session is cleared.

`0067_brown_professor_monster.sql` adds the reaction `updated_at` cursor needed
for roster, reaction, and watermark state deltas. It is the only schema change
made by the owned-delivery cutover.

`0068_lying_doorman.sql` adds private multipart attachment-upload reservations,
records an explicit image, video, or document kind on each message attachment,
and permits attachment-only messages. The sender can attach up to six files and
1 GB total to one message. Individual limits are 50 MB for images, 1 GB for
video, and 250 MB for documents. Upload reservations expire after two hours,
per-person in-flight quotas prevent storage abuse, and atomic state transitions
prevent a cancellation from deleting an attachment that a message already
claimed.

Attachment objects remain private in Cloudflare R2. Authorized conversation
members receive short-lived, on-demand download URLs. Images may preview inline;
video and documents stay compact until tapped. Any attachment in a youth
conversation remains unavailable until a Super Admin safety reviewer clears it,
and verified guardians remain participants in the same conversation.

Every client uses `DeliveryEngine`. Its cursor implementation reads Neon through
authenticated, keyset-paginated inbox, message, and state endpoints. Historical
participants keep access only to messages created at or before their departure.
Non-participants receive 403 responses. Read and delivered watermarks are
debounced by clients and advanced with `GREATEST` on the server.

Upstash Redis carries only wake-up hints over a signed-in SSE route. Hints never
contain message content and never establish correctness. Player Web, HQ, Player,
and Pro run the same gap-fill on connection, foreground, reconnect, and a 15
second foreground interval. Disabling the SSE route therefore changes latency,
not data convergence. See [ADR-003](./adr/ADR-003-owned-messaging-delivery.md).

## Duna AI and SafeSport

Duna AI uses `@openai/agents`. SDK tracing is disabled for messaging, and Duna
stores only tool names and cryptographic context/response digests in agent-run
records. The support agent can read the signed-in member's:

- registrations and events across organizations;
- orders and payment states;
- court rentals;
- organization relationships and related organization details.

It has no write tools. The OpenAI Agents SDK uses a direct `OPENAI_API_KEY` when
present, then Vercel AI Gateway via `AI_GATEWAY_API_KEY` or the deployment's
short-lived `VERCEL_OIDC_TOKEN`. If none is available, the support thread
remains available and routes to a human response.

Youth messages fail closed. They are invisible to other participants while in
`screening`; safe messages publish, ambiguous messages remain held for human
review, and clear prohibited content remains blocked. Automated screening never
applies a user penalty. A safe minor support request continues to Duna Support
after screening; retries are idempotent. Duna applies the provider privacy gate
to every minor because the applicable digital-consent age varies by
jurisdiction: no under-18 content is sent to the AI provider unless the
environment explicitly confirms zero-data-retention eligibility and every minor
record contains verified parental consent.

## Required environment

```text
DATABASE_URL
NEON_READ_ONLY_REPLICA
OPENAI_API_KEY
AI_GATEWAY_API_KEY
DUNA_AI_MODEL
DUNA_SAFETY_MODEL
OPENAI_ZERO_DATA_RETENTION_CONFIRMED
MESSAGING_SSE_ENABLED
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
CLOUDFLARE_ACCOUNT_ID
R2_BUCKET_NAME
CF_ACCESS_KEY_ID
CE_SECRET_ACCESS_KEY
EXPO_ACCESS_TOKEN
EXPO_PLAYER_ACCESS_TOKEN
EXPO_PRO_ACCESS_TOKEN
```

Only primary `DATABASE_URL` is required for correct persistent text messaging.
`NEON_READ_ONLY_REPLICA` may serve unrelated latency-tolerant product reads,
but messaging membership, authorization, sequence, cursor, send confirmation,
and foreground gap-fill remain on the primary because replica lag cannot define
delivery correctness. Private attachments additionally require the four
Cloudflare R2 values above and a private bucket. Missing OpenAI configuration
creates a human review/handoff
path. Missing Upstash configuration or `MESSAGING_SSE_ENABLED=false` keeps
cursor polling active but removes sub-second wake-ups. Cursor sync is the only
shipped delivery branch. The Expo access tokens are optional unless enhanced
Expo Push security is enabled; use the per-project values when Player and Pro
have independent tokens, with `EXPO_ACCESS_TOKEN` as a single-project fallback.

## Release sequence

1. Apply migrations `0065_duna_messaging_platform.sql`,
   `0066_soft_jean_grey.sql`, `0067_brown_professor_monster.sql`, and
   `0068_lying_doorman.sql` to the target Neon branch.
2. Verify the relationship backfill counts and review the new constraints.
3. Configure the server-only OpenAI variables and confirm the applicable data
   controls before enabling automated youth screening.
4. Configure the server-only Upstash REST URL/token, publish a test wake-up, and
   verify cursor convergence once with SSE disabled and once with SSE enabled.
5. Configure the private R2 credentials in both Duna Web and HQ, then verify an
   image, video, document, cancellation, and expired-upload cleanup path.
6. Confirm no Electric dependency, route, environment variable, publication, or
   inactive replication slot remains. Drop a positively identified inactive
   Electric slot and publication only after the application cutover.
7. Deploy API, Player Web, HQ, and Super Admin from the same commit.
8. Confirm APNs/FCM credentials for both Expo projects and, if enabled, store
   the Expo access token only in the server environment.
9. Make fresh Player and Pro native builds. `expo-sqlite`, `expo-device`,
   `expo-notifications`, and Player's `expo-file-system` attachment path require
   native validation; an over-the-air JavaScript update is not sufficient for
   existing installs.
10. Test adult, teen, under-13, guardian, blocked-organization, mutual-follow,
    follower-broadcast, offline retry, action receipt, AI handoff, and moderation
    paths with authenticated non-demo accounts.

Do not call the feature live until the migration, provider controls, exact-commit
web deployments, signed native builds, and authenticated end-to-end checks are
all independently verified.
