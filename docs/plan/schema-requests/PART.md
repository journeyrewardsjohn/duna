# Schema request: PART (group sessions, minimums and group-size pricing)

From PART-0, 28 November 2026. Design: [`../participation.md`](../participation.md). For the schema steward. This is a **follow-up migration after 0116** (the `web-hq-backend.md` W3-0 batch). Everything here is **additive**: new tables, new nullable columns, one new check value list on a new table. Nothing is dropped or narrowed; the 289 columns on `catalog_session_occurrences` stay and are dual-written until a later wave retires them.

Code facts were read from `origin/main` at `6d9e1c3e`. Existing pieces this builds on: migration `0114_participation_rules_headcount_pricing.sql` (`catalog_participation_settlements`, the five participation columns on `catalog_session_occurrences`, `returned_credits` / `returned_value_minor` on `organization_credit_applications`).

Shared value lists used below:

- `subject_type`: `'catalog-session-occurrence' | 'session' | 'division' | 'pickup-session'` (an event session and a league season are both rows in `sessions`).
- Rule JSON (`ParticipationRules` v2, validated in `packages/core/src/participation.ts`, never trusted from the database without `readParticipationRules`):

```ts
{
  version: 2,
  unit: "player" | "team",
  minParticipants: number,            // ≥ 1, ≤ capacity
  minimumPolicy: "cancel" | "run",
  lockMinutesBeforeStart?: number,    // 0..10_080; absent = club default, then refund window, then 1_440
  waitlist: boolean,
  tiers: { minParticipants: number; maxParticipants?: number;
           creditsPerPlayer?: number; amountMinorPerPlayer?: number }[],  // non-increasing per player
  splitCostMinor?: number,            // "split the court"; mutually exclusive with tiers
  effectiveFrom: string               // ISO instant, as 289 does today
}
```

Version 1 rows (289: `cutoffMinutesBeforeStart`, `settlementBasis`, `creditTiers`) stay readable; the reader maps them.

## 1. `organization_participation_defaults` (new table)

The club default every offering inherits (design §2.3, §7.1 Club setup › Booking rules).

| Column                     | Type                                       | Notes                                                        |
| -------------------------- | ------------------------------------------ | ------------------------------------------------------------ |
| `organization_id`          | uuid PK, FK organizations (cascade)        | one row per organisation                                     |
| `rules`                    | jsonb not null                             | Rule JSON v2 without `tiers` (ladders are per offering)      |
| `applies_to`               | varchar(24)[] not null default `{service}` | subject kinds that inherit: `service`, `open-play`, `pickup` |
| `updated_by_person_id`     | uuid FK people                             |                                                              |
| `created_at`, `updated_at` | timestamptz                                |                                                              |

Read by: `operator.participation.defaults` (get), `resolveParticipationRules`. Written by: `operator.participation.setDefaults`. Demo fixture: `packages/core/src/demo/participation.ts` → `{ minParticipants: 3, minimumPolicy: "cancel", lockMinutesBeforeStart: 1440, waitlist: true }` labelled as a proposed default.

## 2. `participation_decisions` (new table)

One row per session that has a group rule: the snapshot taken at first booking, the lock, operator overrides and the outcome. The engine's single state record for every subject type (design §2.3, §4).

| Column                     | Type                                     | Notes                                                                                   |
| -------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------- |
| `id`                       | uuid PK                                  |                                                                                         |
| `organization_id`          | uuid not null FK organizations (cascade) |                                                                                         |
| `subject_type`             | varchar(32) not null                     | check in the list above                                                                 |
| `subject_id`               | uuid not null                            | no FK (polymorphic); the service validates                                              |
| `rule_snapshot`            | jsonb not null                           | Rule JSON v2 as of the first booking                                                    |
| `snapshot_at`              | timestamptz not null                     |                                                                                         |
| `lock_at`                  | timestamptz not null                     | computed lock (start minus minutes, or the opened-late midpoint)                        |
| `lock_override_at`         | timestamptz                              | "Extend the lock"; must be > `lock_at` and < start (service check)                      |
| `forced_outcome`           | varchar(24)                              | `'run'` ("Run anyway") or null                                                          |
| `outcome`                  | varchar(32)                              | `'minimum-met' \| 'run-under-minimum' \| 'cancel-under-minimum' \| 'cancelled-by-club'` |
| `cancel_reason`            | varchar(24)                              | `'minimum-not-met' \| 'coach' \| 'weather' \| 'venue' \| 'merged' \| 'other'`           |
| `merged_into_subject_id`   | uuid                                     | set when `cancel_reason = 'merged'`                                                     |
| `decided_at`               | timestamptz                              |                                                                                         |
| `decided_group_size`       | integer                                  | ≥ 0                                                                                     |
| `decided_by_person_id`     | uuid FK people                           | null when the schedule decided                                                          |
| `settled_at`               | timestamptz                              |                                                                                         |
| `settled_group_size`       | integer                                  |                                                                                         |
| `created_at`, `updated_at` | timestamptz                              |                                                                                         |

Constraints: unique (`subject_type`, `subject_id`); check outcome / decided columns all null or all set (as 0114 does for occurrences); check `settled_at` only when outcome is `minimum-met` or `run-under-minimum`; check `cancel_reason` set iff outcome is a cancellation. Indexes: (`organization_id`, `lock_at`) where `outcome is null` (the cron and the at-risk query); (`organization_id`, `subject_type`, `outcome`).

Backfill: one row per `catalog_session_occurrences` row that has `participation_outcome` set or an active booking under an item with `configuration ? 'participation'`, copying the 289 columns; `rule_snapshot` from the item's current configuration (best available; the design notes this).

Read by: the engine, `operator.participation.atRisk`, `operator.catalogSessionOccurrences`, `player.participation.quote`, storefront. Written by: the engine, `extendLock`, `runAnyway`, `cancelSession`, `mergeSessions`.

## 3. `participation` jsonb on the other subject tables (new nullable columns)

| Table             | Column                     | Backfill (design §2.3, decision 7)                                                                                                                                                                        |
| ----------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sessions`        | `participation` jsonb null | from `minimum_capacity` when > 1: `{ minParticipants, minimumPolicy: "run" }`; from `event_blueprints.registration_settings.smartRules.autoCancelLowAttendance` likewise with `"run"`                     |
| `divisions`       | `participation` jsonb null | from `minimum_teams`: `{ unit: "team", minParticipants: minimum_teams, minimumPolicy: "run" }`                                                                                                            |
| `pickup_sessions` | `participation` jsonb null | from `smart_rules`: `{ minParticipants: minimumAttendance, minimumPolicy: "run", lockMinutesBeforeStart: minimumNoticeMinutes, waitlist: waitlistEnabled }` only where `autoCancelLowAttendance` was true |

`catalog_items.configuration.participation` stays where it is (no column).

Also add `participation_review_state` varchar(16) null (`'pending' | 'kept' | 'changed'`) on `sessions` and `pickup_sessions` so HQ can list "Rules to review" for backfilled rows.

## 4. `participation_waitlist_entries` (new table)

`waitlist_entries` references `sessions` only (`session_id` not null), so catalog occurrences and pickups need their own; pickup keeps its current waitlist until PART-9 moves it.

| Column                                         | Type                                     | Notes                                                              |
| ---------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------ |
| `id`                                           | uuid PK                                  |                                                                    |
| `organization_id`                              | uuid not null FK                         |                                                                    |
| `subject_type`, `subject_id`                   | as above                                 |                                                                    |
| `person_id`                                    | uuid not null FK people                  | the participant                                                    |
| `requested_by_person_id`                       | uuid not null FK people                  | guardian when booking for a junior                                 |
| `quantity`                                     | integer not null default 1               | > 0                                                                |
| `position`                                     | integer not null                         | > 0                                                                |
| `status`                                       | varchar(16) not null default `'waiting'` | `'waiting' \| 'offered' \| 'accepted' \| 'expired' \| 'cancelled'` |
| `offered_at`, `hold_expires_at`, `accepted_at` | timestamptz                              |                                                                    |
| `created_at`, `updated_at`                     | timestamptz                              |                                                                    |

Unique (`subject_type`, `subject_id`, `person_id`) where status in (`waiting`, `offered`); unique (`subject_type`, `subject_id`, `position`). Index (`status`, `hold_expires_at`) for expiry.

## 5. `participation_invites` (new table)

Share links that bring a friend into a specific session (design §7.2 invite landing).

| Column                         | Type                        | Notes                                  |
| ------------------------------ | --------------------------- | -------------------------------------- |
| `id`                           | uuid PK                     |                                        |
| `organization_id`              | uuid not null FK            |                                        |
| `subject_type`, `subject_id`   | as above                    |                                        |
| `created_by_person_id`         | uuid not null FK people     | never a junior account (service check) |
| `code`                         | varchar(24) not null unique | random, URL-safe                       |
| `expires_at`                   | timestamptz not null        | the session start                      |
| `revoked_at`                   | timestamptz                 |                                        |
| `opened_count`, `booked_count` | integer not null default 0  | counts only, no visitor data           |
| `created_at`                   | timestamptz                 |                                        |

## 6. `participation_attendance` (new table)

Attendance separate from settlement, writable by the assigned coach (design §6, §7.4). Today attendance lives in `catalog_fulfillments.details.attendance` and is written only by the `payments:write` settle procedure.

| Column                       | Type                                                 | Notes                                                                           |
| ---------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------- |
| `booking_id`                 | uuid PK                                              | `catalog_fulfillments.id` (PART-9 adds other booking kinds with `booking_type`) |
| `booking_type`               | varchar(24) not null default `'catalog-fulfillment'` |                                                                                 |
| `organization_id`            | uuid not null FK                                     |                                                                                 |
| `subject_type`, `subject_id` | as above                                             |                                                                                 |
| `status`                     | varchar(12) not null                                 | `'attended' \| 'absent'`                                                        |
| `marked_by_person_id`        | uuid not null FK people                              |                                                                                 |
| `marked_at`                  | timestamptz not null                                 | server time                                                                     |
| `device_marked_at`           | timestamptz                                          | offline marks                                                                   |
| `idempotency_key`            | uuid not null unique                                 |                                                                                 |

The settle path keeps writing `details.attendance` for compatibility until readers move.

## 7. `participation_adjustments` (new table)

Money movements after the lock other than the lock settlement itself (which stays in `catalog_participation_settlements`, unique per fulfilment): late-cancel price, refund when a late canceller's place is filled, card difference refunds (PART-10).

| Column                   | Type                                             | Notes                                                                      |
| ------------------------ | ------------------------------------------------ | -------------------------------------------------------------------------- |
| `id`                     | uuid PK                                          |                                                                            |
| `organization_id`        | uuid not null FK                                 |                                                                            |
| `catalog_fulfillment_id` | uuid not null FK catalog_fulfillments (restrict) |                                                                            |
| `order_id`               | uuid not null FK orders                          |                                                                            |
| `kind`                   | varchar(32) not null                             | `'late-cancel-final-price' \| 'place-refilled' \| 'card-group-difference'` |
| `credits`                | integer not null default 0                       | ≥ 0, returned to the wallet                                                |
| `amount_minor`           | bigint not null default 0                        | ≥ 0, refunded to the card                                                  |
| `credit_journal_id`      | uuid FK ledger_journals                          | required when `credits > 0`                                                |
| `refund_record_id`       | uuid FK refund_records                           | required when anything moved                                               |
| `created_at`             | timestamptz                                      |                                                                            |

Unique (`catalog_fulfillment_id`, `kind`).

**`refund_records.disposition`**: the check allows `original-payment`, `organization-credit`, `organization-credit-restoration` (`schema.ts:9158-9160`). Card differences use `original-payment` (amount > 0) and credit returns use `organization-credit-restoration`, so **no change** is needed. If the steward prefers a distinct value for reporting, add `'participation-difference'` to the list (widening only).

## 8. `participation_notices` (new table: the outbox)

One automatic notice per person, kind and session (design §9).

| Column                       | Type                                    | Notes                                                                                                                                                                                                                                                 |
| ---------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                         | uuid PK                                 |                                                                                                                                                                                                                                                       |
| `organization_id`            | uuid not null FK                        |                                                                                                                                                                                                                                                       |
| `subject_type`, `subject_id` | as above                                |                                                                                                                                                                                                                                                       |
| `recipient_person_id`        | uuid not null FK people                 | guardian for a junior's booking                                                                                                                                                                                                                       |
| `booking_id`                 | uuid                                    | null for staff digests                                                                                                                                                                                                                                |
| `kind`                       | varchar(32) not null                    | `'booked-needs-players' \| 'needs-players-reminder' \| 'confirmed' \| 'cancelled-low' \| 'cancelled-club' \| 'lock-extended' \| 'moved' \| 'waitlist-offer' \| 'place-refilled' \| 'staff-at-risk-digest' \| 'staff-cancelled' \| 'refund-attention'` |
| `channel`                    | varchar(16)                             | `'in-app' \| 'push' \| 'email' \| 'imessage' \| 'whatsapp'` chosen at send time                                                                                                                                                                       |
| `status`                     | varchar(12) not null default `'queued'` | `'queued' \| 'sent' \| 'failed' \| 'skipped'`                                                                                                                                                                                                         |
| `scheduled_for`              | timestamptz not null                    | quiet hours move it later                                                                                                                                                                                                                             |
| `sent_at`                    | timestamptz                             |                                                                                                                                                                                                                                                       |
| `error_code`                 | varchar(48)                             | never message text                                                                                                                                                                                                                                    |
| `created_at`                 | timestamptz                             |                                                                                                                                                                                                                                                       |

Unique (`subject_type`, `subject_id`, `recipient_person_id`, `kind`, `booking_id`) with `NULLS NOT DISTINCT`. Index (`status`, `scheduled_for`). No message body is stored; copy is rendered from `participationCopy` at send time.

## 9. Duplicate bookings (decision 5)

Request a partial unique index on `catalog_fulfillments (catalog_session_occurrence_id, person_id) WHERE status IN ('held','pending','ready','fulfilled') AND catalog_session_occurrence_id IS NOT NULL`. **The steward must first count existing duplicates on production**; if any exist, land the service check only (PART-3) and add the index after they are resolved. Group bookings are one fulfilment with `details.quantity`, so they are unaffected.

## 10. Procedures (in `packages/api/src/routers/participation.ts`, schemas in `contracts/participation.ts`)

All operator procedures use `runIdempotentMutation` with `idempotencyKey: uuid` and `confirmed: true` where money or messages move. Every one has a demo-mode branch returning fixtures from `@duna/core/demo/participation`.

| Procedure                                     | Scope                                                 | Input                                                                                                                                                                          | Output                                                                                                                                                                                                                    |
| --------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `operator.participation.defaults`             | `sessions:read`                                       | —                                                                                                                                                                              | `{ rules: RulesV2 \| null, appliesTo: string[], inheritedBy: number }`                                                                                                                                                    |
| `operator.participation.setDefaults`          | `sessions:write`                                      | `{ rules: RulesV2, appliesTo, idempotencyKey }`                                                                                                                                | `{ rules, issues: string[], warnings: string[] }`                                                                                                                                                                         |
| `operator.participation.previewRuleChange`    | `sessions:read`                                       | `{ subjectType, subjectId \| catalogItemId, rules: RulesV2 }`                                                                                                                  | `{ issues, warnings (cliffs), changeClass: "loosens" \| "tightens" \| "neutral", unbookedSessions: number, bookedSessions: { id, startsAt, booked }[] }`                                                                  |
| `operator.participation.applyRuleToBooked`    | `sessions:write`                                      | `{ catalogItemId, occurrenceIds: uuid[], confirmed: true, idempotencyKey }` (only allowed when `changeClass = "loosens"`)                                                      | `{ updated: number }`                                                                                                                                                                                                     |
| `operator.participation.atRisk`               | `sessions:read`                                       | `{ from?: datetime, to?: datetime }` (default the next 7 days)                                                                                                                 | `{ sessions: { subjectType, subjectId, title, startsAt, timezone, coachNames, booked, min, capacity, lockAt, displayState, atStakeMinor, atStakeCredits }[], totals }` (`atStake*` require `payments:read`, else omitted) |
| `operator.participation.extendLock`           | `sessions:write`                                      | `{ subjectType, subjectId, lockAt: datetime, confirmed: true, idempotencyKey }`                                                                                                | `{ lockAt, noticesQueued: number }`                                                                                                                                                                                       |
| `operator.participation.runAnyway`            | `sessions:write`                                      | `{ subjectType, subjectId, confirmed: true, idempotencyKey }`                                                                                                                  | `{ displayState }`                                                                                                                                                                                                        |
| `operator.participation.cancelSession`        | `payments:write`                                      | `{ subjectType, subjectId, reason: "coach" \| "weather" \| "venue" \| "other", note?: string (≤ 500, shown to players only via SendReview), confirmed: true, idempotencyKey }` | `{ cancellations: { bookingId, refundStatus: "credits-restored" \| "refund-submitted" \| "released" \| "review-required" }[] }`                                                                                           |
| `operator.participation.requestCancel`        | `sessions:read` + assigned coach                      | `{ subjectType, subjectId, reason, idempotencyKey }`                                                                                                                           | `{ requestId }` (appears in Today / Pro for directors)                                                                                                                                                                    |
| `operator.participation.mergeSessions`        | `payments:write`                                      | `{ fromOccurrenceId, intoOccurrenceId, confirmed: true, idempotencyKey }` (same offering, into has capacity, never raises a price)                                             | `{ moved: number, priceChanges: { bookingId, creditsReturned }[] }`                                                                                                                                                       |
| `operator.participation.recordAttendance`     | `sessions:write`, or `sessions:read` + assigned coach | `{ subjectType, subjectId, marks: { bookingId, status: "attended" \| "absent", deviceMarkedAt?: datetime }[] (≤ 500), idempotencyKey }`                                        | `{ recorded: number, ignored: { bookingId, reason }[] }`                                                                                                                                                                  |
| `operator.refundOrganizationOrder` (change)   | `payments:write`                                      | allow `amountMinor: 0` when the order was paid only with organisation credits                                                                                                  | unchanged                                                                                                                                                                                                                 |
| `player.participation.quote`                  | protected                                             | `{ catalogItemId, catalogSessionOccurrenceId, participantPersonId?, quantity, paymentMethod }`                                                                                 | `{ displayState, copy: { needs?, needsLine?, priceNow?, freeCancel }, ladder: { label, perPlayer, current }[], reserve, alreadyBooked: boolean, lockAt, timezone }`                                                       |
| `player.participation.joinWaitlist`           | protected                                             | `{ subjectType, subjectId, participantPersonId?, quantity, idempotencyKey }`                                                                                                   | `{ position }`                                                                                                                                                                                                            |
| `player.participation.leaveWaitlist`          | protected                                             | `{ entryId, idempotencyKey }`                                                                                                                                                  | `{ status }`                                                                                                                                                                                                              |
| `player.participation.createInvite`           | protected (not a junior account)                      | `{ subjectType, subjectId }`                                                                                                                                                   | `{ url, code, expiresAt }`                                                                                                                                                                                                |
| `public.participation.invite`                 | public                                                | `{ code }`                                                                                                                                                                     | `{ title, club, startsAt, timezone, displayState, needs?, bookHref }` (no names)                                                                                                                                          |
| `player.cancelCatalogSessionBooking` (change) | protected                                             | unchanged input                                                                                                                                                                | adds `chargedCredits` (the final price under decision 4) to the result                                                                                                                                                    |
| `player.startCatalogCheckout` (change)        | protected                                             | unchanged                                                                                                                                                                      | new error code `ALREADY_BOOKED`                                                                                                                                                                                           |

Changes to existing outputs (additive fields):

- `OccurrenceParticipationState` (`catalog-participation-rules.ts:165`): add `displayState`, `lockAt` (alias of `decisionAt`), `waitlistCount`, `freeCancelUntil`.
- `PlayerCatalogSessionBooking` (`catalog-session-bookings.ts:553`): add `lateCancelCharge?: number`, `waitlistPosition?: number`.
- `OperatorCatalogSessionOccurrence` (`catalog-participation.ts:1173`): add `displayState`, `atStakeMinor?`, `atStakeCredits?`, `waitlist: { position, displayName }[]`, booking `attendance` from the new table.

## 11. Demo fixtures (`packages/core/src/demo/participation.ts`)

Three sessions matching the design's worked examples: a semi-private lesson in `needs-players` (1 of 2), a twelve-place clinic in `minimum-reached` with the 4–7 / 8–12 ladder and 9 booked, a pickup in `cancelled-low` (3 of 4); one club default; one waitlist entry; one at-risk summary. All credit numbers labelled illustrative; no real people.
