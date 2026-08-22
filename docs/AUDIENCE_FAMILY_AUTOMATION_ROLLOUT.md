# Audience, family, and automation rollout

## What this foundation ships

Audiences are a tenant-scoped, versioned selection domain. `organization_participants`
is the candidate boundary; `audience_versions` are immutable definitions; explicit
include/exclude rows and snapshots preserve why a person was or was not selected.
Rules are a typed, allowlisted AST with a version and deterministic hash. Database
adapters fail closed when a fact cannot be resolved honestly. Financial facts require
`payments:read`; no audience is a send permission.

Messaging must still re-evaluate relationship, blocks, participants, guardians, and
SafeSport immediately before publication. Marketing flow and campaign drafts may
refer to an `audience_version_id`, but no delivery occurs from this migration or feature.
Duna AI may propose a saved audience or draft; it cannot send, charge, publish, or
change a version without an authorized human action.

The HQ foundation also ships a read-only Transactions list and detail timeline over
operator collections, ordinary organization orders, membership invoices, and payouts.
Collection-backed orders are de-duplicated. Fund schedules and successful refund
records provide the money projection; fields that a source cannot prove are shown as
unavailable rather than estimated. There are no transaction mutations.

Person type and verified organization-dependent count are the first connected audience
fact adapters. Registration, sessions, lifetime value, payment state, membership, and
activity rules are stored and evaluated fail-closed as partial until their scoped
adapters are added. HQ exposes that partial status and the unavailable fact keys.

## Deliberately deferred phases

- **Family:** project family views over existing authoritative `guardianships`; do
  not create a competing family identity. Credit redemption needs a single atomic
  ledger transaction, guardian spending authority, and idempotent family allocation.
- **Discounts:** create immutable rule versions, checkout quotes, and ordinal
  reservations for player 2/3/4 before automatic family discounts are enabled.
- **Scheduled messages:** add template, schedule, occurrence, delivery,
  suppression, quiet-hour, provider-event, and audit records. Enqueue only durable
  `workflow_jobs`; occurrences re-check audience, consent, guardian, block, and
  SafeSport gates at send time.
- **Payment recovery:** Stripe Billing remains authoritative for subscription
  retries. Duna can record recovery cases/events and human-approved notices, but
  must not charge, retry, or dispatch its own recovery sequence in this phase.
- **Transactions v2 completion:** add standalone dispute lifecycle rows and richer
  provider-event evidence without exposing provider payloads. Add database-backed
  tenant/aggregation integration tests before release.
- **Product syndication:** add the saved-audience picker to Messaging, invitations,
  promo-code eligibility, and Duna Pro only after each consumer rechecks its own
  authorization and safety gates.

## Rollout order and inactive gates

1. Apply migrations `0093` and `0094` to an isolated Neon branch with the API
   and HQ build that understands nullable marketing references, current-version
   lineage, and immutable audience-version guards.
2. Backfill nothing automatically; existing segment JSON remains authoritative for
   old drafts. Create new audience references only through the typed API.
3. Validate role/scope denial, tenant isolation, snapshots, and Messaging's existing
   recipient gates with authenticated test accounts.
4. Keep schedule dispatch, automatic discounts, credit transfers, payment retries,
   recovery dispatch, and AI actions inactive until their durable models and separate
   release checks exist.
