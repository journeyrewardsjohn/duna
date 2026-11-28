# Duna internal API guide

This guide is the engineering contract for Duna's player data, professional
coverage, rating evidence, and repair workflows. The TypeScript router remains
the source of truth; this document explains which surface to use and the
invariants an automation must preserve.

## Surfaces

| Surface     | Transport                           | Audience                        | Authentication                                           |
| ----------- | ----------------------------------- | ------------------------------- | -------------------------------------------------------- |
| Public API  | tRPC over `/api/trpc`               | Duna web, public integrations   | None for `public.*` procedures                           |
| Product API | tRPC over `/api/trpc`               | Signed-in players and operators | WorkOS session or access token                           |
| Admin API   | tRPC over `/api/trpc`               | Duna HQ                         | WorkOS actor with the required role/scope                |
| Agent API   | MCP Streamable HTTP over `/api/mcp` | Duna AI and partner agents      | Public reads; WorkOS bearer token for player/admin tools |

Do not expose database credentials or call Neon from an external agent. Use the
typed router or MCP so authorization, audit records, identity checks, and
rating replays remain in force.

## Public player and competition procedures

| Procedure                  | Input                                 | Purpose                                                                        |
| -------------------------- | ------------------------------------- | ------------------------------------------------------------------------------ |
| `public.searchPlayers`     | `query`, `limit`                      | Public, adult, active player search only                                       |
| `public.playerProfile`     | `handle`                              | Public identity and current Sand Rating                                        |
| `public.playerPerformance` | `handle`                              | Chronological rating history, match evidence, partners, sources, world ranking |
| `public.worldRankings`     | none                                  | Top 200 official and Duna rankings for men and women                           |
| `public.ratingLab`         | none                                  | Latest completed walk-forward backtest and model diagnostics                   |
| `public.events`            | optional `kind`, `rating`             | Discover public events                                                         |
| `public.eventBySlug`       | `slug`                                | One public event and registration context                                      |
| `public.venues`            | none                                  | Public venue directory                                                         |
| `public.coaches`           | optional `organizationSlug`           | Public coach directory                                                         |
| `public.coach`             | `handle`, optional `organizationSlug` | One public coach profile                                                       |
| `public.proCoverage`       | none                                  | Professional event, match, and ranking snapshot                                |
| `public.proEvent`          | `slug`                                | Canonical professional event page data                                         |
| `public.proMatch`          | `eventSlug`, `matchId`                | Canonical professional match data                                              |

Public queries never return private profiles or minors. A missing mapping is
returned as an unlinked public source name, never guessed.

## Rating evaluation and backfill

`admin.evaluateRating` runs the current `walk-forward-1.0` evaluation. It:

1. selects rating-eligible doubles matches with complete score evidence;
2. orders them by when the match occurred, with match ID as the stable tie-break;
3. emits every model probability before applying that match result;
4. updates each model and the adaptive ensemble only after scoring the forecast;
5. calculates accuracy with a 95% Wilson interval, Brier score, log loss,
   expected calibration error, AUC, calibration buckets, and cumulative curves;
6. persists one `rating_backtest_runs` row and the pre-match record for every
   match in `rating_backtest_predictions`; and
7. writes an audit event before publishing the completed run.

The compared models are the 50% baseline, team-average Elo, weak-link Elo,
Duna's win-only ablation, Duna's score-aware model, and an online
loss-weighted ensemble. “Champion” means the lowest Brier score for that run,
with log loss as the tie-breaker. It does not automatically activate a new live
rating configuration.

`admin.approveReadyImportedMatches` is a separate evidence operation for
mapped, Duna-owned import history. It rebuilds the canonical rating projection.
Backtest publication never approves source evidence, and evidence approval does
not silently promote a model.

## Identity and claim workflows

### External identity mapping

`admin.linkSandPlayer` links one `external_player_profiles` record to one Duna
person. The caller must supply the exact external profile ID, canonical person
ID, and a review reason. It updates affected staged matches and creates an audit
record.

An agent must not link on name similarity alone. Strong evidence is an exact
partner source ID, a cross-source ID, or multiple official pages that agree on
name and competition history. Ambiguous records remain in the mapping queue.

### Public profile claims

`player.requestProfileClaim` requires the signed-in identity's legal name and
birth date. A known source birth date must match exactly. If a professional
source has no birth date, the claim can only enter manual review; it cannot be
approved automatically. All claims enter `sand.profile-claim-review` and none
merge automatically. Professional claims also attach official partner/tour
profile URLs and the latest connected world ranking to the review packet.

`admin.reviewProfileClaim` can approve or reject the packet. Professional
approval requires the reviewer to attest that an official page matches the
signed-in identity. Approval consolidates the unclaimed profile into the
signed-in identity. If both identities contain rating history, Duna rebuilds
the projection chronologically rather than combining incompatible sequences.

### Match accuracy reports

`player.flagMatchHistory` is participant-only. It immediately marks the match
disputed, holds it out of rating eligibility, creates an admin review, and
replays the projection without the disputed evidence.

`admin.reviewMatchHistoryDispute` either upholds or rejects the report and
replays the projection with the reviewed state. Both actions are audited.

## Session participation, family booking, and schedules

Group rules (PART, [`docs/product/participation.md`](product/participation.md)).
Scheduled catalog services (`type: "service"` with one-off or recurring
`sessionSchedule`) run under a group rule: their own
`configuration.participation`, or the club default
(`organization_participation_defaults`) when they have none. The capacity
stays in `configuration.capacity`. The rule is version 2 (read any stored rule
with `readParticipationRuleV2` from `@duna/core`; the 289 keys are still read):

| Field                    | Meaning                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `version`                | `2`                                                                                                                |
| `unit`                   | `player` or `team`                                                                                                 |
| `minParticipants`        | Smallest group that runs (1 means no minimum)                                                                      |
| `minimumPolicy`          | `cancel` (cancel and return everything) or `run` when the minimum is not met (default `run`)                       |
| `lockMinutesBeforeStart` | When the group is decided; also the free-cancellation deadline. Absent: club default, refund window, 1440          |
| `waitlist`               | Whether a full session queues people                                                                               |
| `tiers`                  | Optional `{ minParticipants, maxParticipants, creditsPerPlayer?, amountMinorPerPlayer? }`, never rising per player |

Saving validates with `validateParticipationRuleV2`: plain-language reasons
(minimum above capacity, decision after the start, gaps, overlaps, a rising
price) block; revenue cliffs come back as warnings. Attendance pricing is
refused on new saves. The save also writes the 289 keys
(`cutoffMinutesBeforeStart`, `creditTiers`, `settlementBasis`) for the current
HQ form until PART-6 replaces it.

The rule a session uses is the **snapshot** in `participation_decisions`, taken
at its first booking; editing the offering changes only unbooked sessions.

| Procedure                                  | Scope                                                 | Purpose                                                                                                               |
| ------------------------------------------ | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `operator.participation.defaults`          | `sessions:read`                                       | The club default, what it applies to, how many offerings inherit it                                                   |
| `operator.participation.setDefaults`       | `sessions:write`                                      | Save the club default (idempotency key); returns `issues` (nothing saved) or the rule                                 |
| `operator.participation.previewRuleChange` | `sessions:read`                                       | Issues, cliff warnings, `loosens` / `tightens` / `neutral`, unbooked count, booked sessions affected                  |
| `operator.participation.applyRuleToBooked` | `sessions:write`                                      | Apply the offering's saved rule to booked sessions, loosening only (`confirmed: true`)                                |
| `operator.participation.atRisk`            | `sessions:read` (+ `payments:read` for money)         | Sessions in the next 7 days that need players and have bookings, with money at stake                                  |
| `operator.participation.extendLock`        | `sessions:write`                                      | Move the decision (and free cancellation) later; booked players are told (`confirmed: true`)                          |
| `operator.participation.runAnyway`         | `sessions:write`                                      | Pre-decide: the session runs whatever the group size (`confirmed: true`)                                              |
| `operator.participation.cancelSession`     | `payments:write`                                      | Cancel with full refunds; `confirmed: true` from the strong tier; `note` is never stored (Send review)                |
| `operator.participation.requestCancel`     | `sessions:read`, assigned coach                       | A coach asks a director to cancel                                                                                     |
| `operator.participation.cancelRequests`    | `sessions:read`                                       | Open requests to cancel                                                                                               |
| `operator.participation.recordAttendance`  | `sessions:read` + assigned coach, or `sessions:write` | Mark attended / absent; offline `deviceMarkedAt`; later mark wins; never changes a price                              |
| `player.participation.quote`               | signed in                                             | The display model for a session: tokens, numbers, rendered English, ladder, reserve, most chargeable, `alreadyBooked` |
| `public.organizationStorefront`            | public                                                | Each service adds `participation`; each occurrence adds headcount and `participation` state                           |
| `player.startCatalogCheckout`              | signed in                                             | Optional `participantPersonId` and `creditSource`; `CONFLICT` with code `ALREADY_BOOKED` for a second booking         |
| `player.bookCatalogSessions`               | signed in                                             | Book up to 20 session occurrences with credits; atomic by default, per-session results                                |
| `player.catalogSessionBookings`            | signed in                                             | The schedule; `participation` adds `displayState`, `lockAt`, `freeCancelUntil`; `lateCancelCharge`                    |
| `player.cancelCatalogSessionBooking`       | signed in                                             | Free before the decision; after it, needs acknowledgement and returns `chargedCredits` (the final price)              |
| `operator.catalogSessionOccurrences`       | `sessions:read`                                       | Rosters with the snapshot rule, `displayState`, attendance; `atStake*` with `payments:read`                           |
| `operator.settleCatalogSessionOccurrence`  | `payments:write`                                      | Decide early, or settle a 289 attendance-priced session                                                               |

Every operator mutation takes an `idempotencyKey`; a retry with the same key
replays the first answer. Every procedure returns fixtures from
`@duna/core/demo/participation` in demo mode.

Invariants an integration must preserve:

- One engine decides: `evaluateCatalogSessionParticipation` (booking,
  cancellation, the schedule, operators). Do not settle or refund elsewhere.
  `/api/cron/catalog-participation` runs `processDueParticipation` every 5
  minutes; each step claims its work with a conditional update, so overlapping
  runs are safe.
- A credit booking reserves the highest price; at the decision each booking
  settles to the final group's price and the difference returns once. Nobody
  is charged more than they reserved.
- After the decision, headcount never cancels a session; a session that has
  started is never cancelled automatically.
- The decision is mirrored onto `catalog_session_occurrences`
  (`participation_outcome`, `participation_decided_at`, `status`): Duna Pay's
  delivery reads those columns. A club cancellation sets `status = cancelled`.
- One active booking per participant per session (partial unique index); a
  group booking is one booking with a quantity.
- Only an adult with a verified, reviewed guardianship that carries spending
  approval may book for a dependent. The booking belongs to the dependent; the
  order belongs to whoever's wallet paid. A dependent can see but not cancel it.

## Duna Pay (`operator.pay`, owner B2)

Shapes are frozen in `packages/api/src/contracts/pay.ts`; the model is in
[`docs/money/duna-pay.md`](money/duna-pay.md). Reads need `payments:read`;
writes need `payments:write` (owner). In demo mode every procedure returns
its fixture from `@duna/core/demo/pay`.

| Procedure                                        | Status              | Notes                                                                                                                                        |
| ------------------------------------------------ | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `obligations`                                    | live                | Newest first, cursor `<createdAt>                                                                                                            | <id>`, filter by `status`and`deliveryRule` |
| `obligation`                                     | live                | Tranches, delivery facts, refunds, hold ids; `NOT_FOUND` outside the caller's club                                                           |
| `holds`                                          | live                | Every hold on the club, newest first                                                                                                         |
| `disputes`, `dispute`                            | live                | Platform-side dispute cases for the caller's club, newest first                                                                              |
| `submitDisputeEvidence`                          | live (owner)        | Idempotent by key; "not configured yet" without processor keys                                                                               |
| `reserves`, `recoveries`, `requestReserveReview` | live                | Review request is owner-only and needs an active reserve                                                                                     |
| `account`, `updateBusiness`, `publishGate`       | live                | Six derived statuses; the gate is `assertPaymentsReady`                                                                                      |
| `startOnboarding`                                | live (owner)        | Hosted link or embedded session; `not-configured` without keys                                                                               |
| `payoutSettings`, `updatePayoutSettings`         | live                | Reuses `organization_money_settings`; daily by default                                                                                       |
| `player.fees.quote`                              | live                | All-in price before commitment; records `pay_fee_quotes`                                                                                     |
| other procedures                                 | not implemented yet | `refundPolicies`, `upsertRefundPolicy`, `taxSettings`, `updateTaxSettings`, `balance`, `moneyHome`, `operator.fees.platformSummary`, Premium |

Payouts are created only by the hourly `/api/cron/money-payouts` job and the
existing owner-confirmed manual payout, and only from releasable tranches
(settled, delivered, not held).

## Team availability (`operator.teamAvailability`, owner B3a)

Shapes are frozen in `packages/api/src/contracts/team-availability.ts`; the
product rules are in [`docs/product/team.md`](product/team.md). Every
procedure is live and returns its fixture from
`@duna/core/demo/team-availability` in demo mode. "Is this coach free" is
`availabilityFor` in `@duna/scheduling` (pure); session booking
(`session-delivery.ts`), coverage and the grid all call it.

| Procedure                                                                                 | Scope                                                                                             | Notes                                                                                                                                                              |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `staff`                                                                                   | `members:read`                                                                                    | Schedules (newest first), blackouts, time off, each with derived `sessionsNeedingCover`; copies legacy availability on first view                                  |
| `upsertSchedule`, `transitionSchedule`, `addBlackout`, `removeBlackout`, `requestTimeOff` | `members:read` + the member themselves, or `members:write`                                        | Overnight windows are stored as two rows and returned whole; activating a schedule ends an open-ended predecessor the day before                                   |
| `decideTimeOff`                                                                           | approve/decline: `members:write`, not your own (owner may); cancel: the member or `members:write` | Approval opens coverage requests for the affected sessions                                                                                                         |
| `coverageGrid`                                                                            | `members:read`                                                                                    | Club time zone; a coach teaching a session counts as available for it                                                                                              |
| `coverageRequests`                                                                        | `members:read`                                                                                    | Filter by status and time                                                                                                                                          |
| `coverageAction`                                                                          | `members:write`                                                                                   | `suggest` re-ranks; `ask` records the ask (Concierge sends); `assign` re-checks the substitute, reassigns the session and writes an audit row; `decline`; `cancel` |

Errors: `FORBIDDEN` (not yours and not a manager), `NOT_FOUND` (outside the
caller's club), `CONFLICT` (state machine or the substitute is no longer
free), `BAD_REQUEST` (invalid time zone or window).

## Safety invariants

- Only complete doubles teams with four distinct people enter the backtest.
- Forecasts are immutable pre-match artifacts; do not overwrite them with a
  post-match rating.
- World ranking points and Sand Rating are separate signals.
- AI may propose challenger models; it cannot activate parameters or merge
  identities without the existing super-admin gates.
- Booking/discovery reads may return action URLs. Purchasing, registering,
  accepting policies, or moving money still requires the normal user checkout.
- Provider provenance, source URLs, evidence weights, and dispute state must
  survive every repair.

## Versioning

Database changes are forward-only migrations. Rating algorithm changes require
an immutable `rating_configurations` version and a fresh backtest. MCP protocol
changes must remain backward compatible with the advertised stable protocol or
publish a new endpoint/version.
