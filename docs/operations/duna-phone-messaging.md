# Duna phone messaging pilot

The existing Duna messaging store, conversation permissions, guardian coverage and native delivery remain authoritative. No historical messages are copied or resent. Journey transport concepts inform this adapter; no Journey tenant, member or hospitality assumptions enter Duna authorization.

## Runtime configuration

Apply migrations through 0112 before enabling phone channels. Web and HQ need the primary database and these server-only variables:

- `SENDBLUE_PHONE_NUMBERS`: comma-separated E.164 Duna-owned endpoints. The first is offered for new links.
- `SENDBLUE_WEBHOOK_SECRET`: at least 32 random characters, configured as the provider signing secret. Sendblue sends `sb-signing-secret`.
- `SENDBLUE_API_KEY`, `SENDBLUE_API_SECRET`: required for outgoing service replies.
- Existing `CRON_SECRET`: protects HQ workflow recovery, which also drains pending phone replies and reads pending provider statuses.

Register an inbound receive webhook at `https://duna.coach/api/sendblue/webhook`, scoped to the Duna phone number. Configure the signing secret for status callbacks as well (global signing secret is supported by Sendblue). Each outgoing message supplies `https://duna.coach/api/sendblue/status?id=<receipt-id>` as its status callback. Do not replace unrelated account webhook subscriptions.

No endpoint has been provisioned or messaged by this implementation work. Provider activation and real delivery validation remain separate release evidence. On November 4, the owner explicitly deferred both until a separate Duna Sendblue account is created. Do not configure Journey account credentials or purchase a line as part of this release.

## Identity and routing

An authenticated adult selects an existing authorized club conversation at `/app/messages/connect`. Duna issues a 96-bit code for ten minutes, storing only its SHA-256 digest. Texting the exact command from the owner's phone atomically consumes it and binds that phone plus Duna endpoint to the selected person, club and conversation. The command is redacted in webhook storage. No profile-phone equality inference is used.

One phone/endpoint has one active conversation. A new explicit linking command changes that destination. Generic prose never changes a binding. Every incoming message revalidates current conversation permissions and uses the canonical Duna sender. Revoked guardians, blocks, disabled posting and inactive/minor identities do not bypass this check.

An unlinked message is held outside all club inboxes. Group, media and reaction messages are retained for review; they are not silently converted to one-to-one delivery. Duna groups continue functioning through the existing app/web path. STOP-family commands revoke the observed sender's binding. Account disconnect also invalidates unused codes.

## Explicit outgoing service replies

HQ displays a phone choice only for an eligible adult one-to-one conversation with a verified active binding. Duna-only remains the default. A staff member explicitly selecting the phone destination creates one canonical message and one unique outbox receipt. Every phone message is labeled with its club name.

The outbox freezes the person, phone, Duna endpoint, conversation and source message. Before dispatch, current staff membership, recipient status, binding and conversation safety are rechecked. Family/minor and multi-recipient groups stay in Duna. No automatic AI reply or marketing sender is introduced.

`queued` is recoverable; exactly one dispatcher claims it. `dispatching` is never re-sent. Provider timeouts and interrupted sends become `unknown`. A matching signed callback or read-only provider status lookup can reconcile them. Unknown jobs without a provider handle require provider review; never turn them back to queued blindly. `sent` means accepted by the provider, not delivered. Delivered is terminal; stale sent callbacks cannot regress it.

## Qualification

Test a real consented adult endpoint: issue/replay/expire code; wrong endpoint; revoked club permission; STOP; explicit one-to-one reply; provider rejection; interrupted/unknown outcome; duplicate webhook; callbacks out of order; direct message with minor/group excluded. Verify the source message appears once in HQ and Player, the outbox destination is unchanged, and actual delivery receipts agree. Native group delivery is preserved by retaining the existing service and still needs its normal device checks.

Provider references verified November 4, 2026: https://docs.sendblue.com/security/ ; https://docs.sendblue.com/api/resources/messages/methods/send ; https://docs.sendblue.com/api/resources/messages/methods/get_status .
