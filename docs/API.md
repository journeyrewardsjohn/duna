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

| Procedure                                           | Scope                                                 | Purpose                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `operator.participation.defaults`                   | `sessions:read`                                       | The club default, what it applies to, how many offerings inherit it                                                                                                                                                                                                                                                     |
| `operator.participation.setDefaults`                | `sessions:write`                                      | Save the club default (idempotency key); returns `issues` (nothing saved) or the rule                                                                                                                                                                                                                                   |
| `operator.participation.previewRuleChange`          | `sessions:read`                                       | Issues, cliff warnings, `loosens` / `tightens` / `neutral`, unbooked count, booked sessions affected                                                                                                                                                                                                                    |
| `operator.participation.applyRuleToBooked`          | `sessions:write`                                      | Apply the offering's saved rule to booked sessions, loosening only (`confirmed: true`)                                                                                                                                                                                                                                  |
| `operator.participation.atRisk`                     | `sessions:read` (+ `payments:read` for money)         | Sessions in the next 7 days that need players and have bookings, with money at stake                                                                                                                                                                                                                                    |
| `operator.participation.extendLock`                 | `sessions:write`                                      | Move the decision (and free cancellation) later; booked players are told (`confirmed: true`)                                                                                                                                                                                                                            |
| `operator.participation.runAnyway`                  | `sessions:write`                                      | Pre-decide: the session runs whatever the group size (`confirmed: true`)                                                                                                                                                                                                                                                |
| `operator.participation.cancelSession`              | `payments:write`                                      | Cancel with full refunds; `confirmed: true` from the strong tier; `note` is never stored (Send review)                                                                                                                                                                                                                  |
| `operator.participation.requestCancel`              | `sessions:read`, assigned coach                       | A coach asks a director to cancel                                                                                                                                                                                                                                                                                       |
| `operator.participation.cancelRequests`             | `sessions:read`                                       | Open requests to cancel                                                                                                                                                                                                                                                                                                 |
| `operator.participation.recordAttendance`           | `sessions:read` + assigned coach, or `sessions:write` | Mark attended / absent; offline `deviceMarkedAt`; later mark wins; never changes a price                                                                                                                                                                                                                                |
| `operator.participation.cancelPreview`              | `sessions:read` (+ `payments:read` for money)         | PART-B. What cancelling returns to whom, from the plan `cancelSession` runs; read-only; juniors by first name, guardian as notice audience                                                                                                                                                                              |
| `operator.participation.resolveCancelRequest`       | `sessions:write`; approve needs `payments:write`      | PART-B. Approve (same cancellation as `cancelSession`) or decline a coach's request; `confirmed: true`; `note` never stored; `coachNotified: false`                                                                                                                                                                     |
| `operator.participation.shareLink`                  | `sessions:read`                                       | PART-B. `{ url, code, expiresAt }` for one of the club's sessions; same links as player invites; rate-limited, audited                                                                                                                                                                                                  |
| `player.participation.quote`                        | signed in                                             | The display model for a session: tokens, numbers, rendered English, ladder, reserve, most chargeable, `alreadyBooked`                                                                                                                                                                                                   |
| `player.participation.joinWaitlist`                 | signed in                                             | Join a full session's waitlist (self or a managed child); position and status                                                                                                                                                                                                                                           |
| `player.participation.leaveWaitlist`                | signed in                                             | Leave the waitlist; a declined offer passes to the next person                                                                                                                                                                                                                                                          |
| `player.participation.createInvite`                 | adult                                                 | A share link (`/i/[code]`) for a session the caller holds a place in                                                                                                                                                                                                                                                    |
| `player.participation.setPickupRule`                | pickup host                                           | The group rule of a pickup the caller hosts                                                                                                                                                                                                                                                                             |
| `public.participation.invite`                       | public                                                | The invite landing: title, club, time, state, "needs", book link; no names                                                                                                                                                                                                                                              |
| `operator.participation.mergeSessions`              | `payments:write`                                      | Move a thin session's bookings into another of the same offering (never raises a price), then cancel it as merged                                                                                                                                                                                                       |
| `operator.participation.mergeDivisions`             | `sessions:write`                                      | Move a thin division's registrations into another division of the event                                                                                                                                                                                                                                                 |
| `operator.participation.setSubjectRule`             | `sessions:write`                                      | The group rule of an event session, a division or a club pickup                                                                                                                                                                                                                                                         |
| `operator.participation.rulesToReview` / `keepRule` | `sessions:read` / `sessions:write`                    | Legacy minimums mapped to "run": list and keep                                                                                                                                                                                                                                                                          |
| `public.organizationStorefront`                     | public                                                | Each service adds `participation`; each occurrence adds headcount and `participation` state                                                                                                                                                                                                                             |
| `player.startCatalogCheckout`                       | signed in                                             | Optional `participantPersonId` and `creditSource`; `CONFLICT` with code `ALREADY_BOOKED` for a second booking                                                                                                                                                                                                           |
| `player.bookCatalogSessions`                        | signed in                                             | Book up to 20 session occurrences with credits; atomic by default, per-session results                                                                                                                                                                                                                                  |
| `player.catalogSessionBookings`                     | signed in                                             | The schedule; `participation` adds `displayState`, `lockAt`, `freeCancelUntil`; `lateCancelCharge`                                                                                                                                                                                                                      |
| `player.cancelCatalogSessionBooking`                | signed in                                             | Free before the decision; after it, needs acknowledgement and returns `chargedCredits` (the final price)                                                                                                                                                                                                                |
| `operator.catalogSessionOccurrences`                | `sessions:read`                                       | Rosters with the snapshot rule, `displayState`, attendance; `atStake*` with `payments:read`. PART-B: `coach`, `court`, `venue` (null when none), per booking `isMinor` and `guardianDisplayName` (never an age or birth date); optional `occurrenceId` reads one session; fixed query count; demo fixtures in demo mode |
| `operator.settleCatalogSessionOccurrence`           | `payments:write`                                      | Decide early, or settle a 289 attendance-priced session                                                                                                                                                                                                                                                                 |

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

## Add a score without an account (`public.addScore`, `player.addScore`, `admin.addScore`, SITE-3)

Contracts: `packages/api/src/contracts/add-score.ts`; how it works: `docs/product/add-score.md`.

| Procedure                                                                | Who                                      | What                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public.addScore.save({ token?, step, data })`                           | Anyone                                   | Saves one step (`where`, `score`, `players`) of the anonymous draft. The first save returns `newToken`; the web app keeps it in the HTTP-only `duna-score-draft` cookie. Answers `saved`, `invalid` (field errors), `expired` or `claimed`. |
| `public.addScore.read({ token? })`                                       | Anyone                                   | `none`, `expired`, `claimed` (with the match) or `active` (the draft, its completed steps and soft warnings).                                                                                                                               |
| `public.addScore.preview({ token })`                                     | Anyone                                   | What the result would do: the rating engine on a copy, never written; `not-ready` lists missing steps.                                                                                                                                      |
| `public.addScore.discard({ token })`                                     | Anyone                                   | Deletes the draft now.                                                                                                                                                                                                                      |
| `player.addScore.claim({ token, teammates, opponents, idempotencyKey })` | Signed in, `matches:write`, not under 13 | One `pending-verification` match through `recordCompletedMatch`; idempotent; never claimable by a second person.                                                                                                                            |
| `admin.addScore.candidates({ status, limit })`                           | Admin                                    | Candidate venues players named; never public.                                                                                                                                                                                               |
| `admin.addScore.resolveCandidate(promote / merge / dismiss)`             | Admin                                    | Promote makes a draft venue; merge links an existing venue; dismiss needs a reason. Audited.                                                                                                                                                |

Anonymous calls have their own budgets inside the service (per hashed address and per draft) on top
of the public procedure limit; a refusal is `TOO_MANY_REQUESTS` with the seconds to wait.

The Places routes (`/api/places/autocomplete`, `/details`, `/map`) answer 429 with `Retry-After`
over a per-address budget, take `session=<token>` and pass it to the provider, and cache identical
requests for 10 minutes.

## Search: where, when, what (`public.search`, `player.search`, owner B10)

Contract: `packages/api/src/contracts/search.ts`; service: `packages/api/src/services/search/`;
what it covers and how results are ordered: [`docs/product/search.md`](product/search.md).

| Procedure                                        | Who       | What                                                                                                                                       |
| ------------------------------------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `public.search.query(searchQueryInput)`          | Anyone    | One page of public results (`items`, `nextCursor`, `totalEstimate`, `facets`, `resultBounds`).                                             |
| `player.search.query(searchQueryInput)`          | Signed in | The same, plus members-only sessions of the clubs the person belongs to (never cached).                                                    |
| `public.search.suggest({ text })`                | Anyone    | Typeahead: Duna clubs and venues with a map point (`places`) and the five best results.                                                    |
| `public.search.session({ id, viewerTimeZone? })` | Anyone    | One bookable session occurrence (detail screen, `duna://sessions/:id`); `NOT_FOUND` for anything the caller may not see (never FORBIDDEN). |

Input (all optional except `limit`, 1 to 100, default 25):

- `where.near { latitude, longitude, radiusKm ≤ 500 }`: within the radius, widening in the device
  search's steps (10, 30, 60 … miles) until five results; `distanceKm` on each result.
- `where.bounds { north, south, east, west }`: "search this area"; wins over `near` (which then only
  orders by distance). Bounds across the date line are refused.
- `where.place`: `venue:<uuid>` or `club:<uuid>` for one Duna venue or club; any other text matches
  the locality, the place name and the title.
- `when { from, to, timezone? }`: calendar dates, inclusive, at most 366 days. Without `timezone`
  each result's dates are read in its venue's own zone (a 7 PM Thursday session in Los Angeles is
  Thursday); with it, in that zone (the device's).
- `what.kinds`: `club`, `venue`, `event`, `league`, `lesson` (lessons, clinics, group training),
  `open-play` (open play and pickups), `coach`. `what.tags` narrows to results carrying every tag;
  `daypart:morning|afternoon|evening` (05–12, 12–17, 17–05 venue time) filters by start time.
- `text` (≤ 120 characters): ranks the whole title, then a title prefix, then a title word, then
  every word anywhere; never reaches SQL and is never logged (lengths only).
- `cursor`: the previous page's `nextCursor`. A cursor from a different query is `BAD_REQUEST`.

```ts
// Evening sessions near Manhattan Beach this weekend, venue time.
await api.public.search.query({
  limit: 20,
  where: { near: { latitude: 33.8847, longitude: -118.4109, radiusKm: 40 } },
  when: { from: "2026-12-05", to: "2026-12-06" },
  what: { kinds: ["lesson", "open-play"], tags: ["daypart:evening"] },
});
// → { items: [{ kind: "lesson", title: "Beginner clinic", startsAt, distanceKm: 1.2,
//      availability: { state: "few-left", summary: "<core participation status>" } }, …],
//    nextCursor: "eyJ2Ijox…", totalEstimate: 14, facets: { kinds: [...], tags: [...] },
//    resultBounds: { north, south, east, west } }

// The session detail screen.
await api.public.search.session({
  id: occurrenceId,
  viewerTimeZone: "America/New_York",
});
// → { title, club, venue, startsAt, endsAt, timezone, local: { date, startTime, endTime },
//    capacity, spotsLeft, prices, participation: { displayState, display, copy },
//    waitlist: { available, waiting }, status, path }
```

Availability: sessions carry the core participation status line in `availability.summary`
(`full`, `few-left` at 1–2 places, `open`, `not-bookable` when cancelled); events read their places
left; the Pro Tour is `not-bookable`; clubs, venues and coaches are `unknown`. A signed-in person's
own booking and waitlist place stay in `player.participation.quote`.

Limits per address (database-backed limiter, one-way hash of the address): query 60 (60 a minute),
suggest 120 (120 a minute), session 60 (30 a minute). A refusal is `TOO_MANY_REQUESTS` with the
seconds in the message and `cause.retryAfterSeconds` (the tRPC route can send it as `Retry-After`).

Additive fields elsewhere: `public.discoveryMap` items with a group rule carry
`participation: { displayState, copy: { status, line? } }`; `public.organizationStorefront`
`catalog[].participation.waitlist` says whether the rule keeps a waitlist.

## Duna Pay (`operator.pay`, owner B2)

Shapes are frozen in `packages/api/src/contracts/pay.ts`; the model is in
[`docs/money/duna-pay.md`](money/duna-pay.md). Reads need `payments:read`;
writes need `payments:write` (owner). In demo mode every procedure returns
its fixture from `@duna/core/demo/pay`.

| Procedure                                        | Status                 | Notes                                                                                                                                                                                                                            |
| ------------------------------------------------ | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `obligations`                                    | live                   | Newest first, cursor `<createdAt>                                                                                                                                                                                                | <id>`, filter by `status`and`deliveryRule` |
| `obligation`                                     | live                   | Tranches, delivery facts, refunds, hold ids; `NOT_FOUND` outside the caller's club                                                                                                                                               |
| `holds`                                          | live                   | Every hold on the club, newest first                                                                                                                                                                                             |
| `disputes`, `dispute`                            | live                   | Platform-side dispute cases for the caller's club, newest first                                                                                                                                                                  |
| `submitDisputeEvidence`                          | live (owner)           | Idempotent by key; "not configured yet" without processor keys                                                                                                                                                                   |
| `reserves`, `recoveries`, `requestReserveReview` | live                   | Review request is owner-only and needs an active reserve                                                                                                                                                                         |
| `account`, `updateBusiness`, `publishGate`       | live                   | Six derived statuses; the gate is `assertPaymentsReady`                                                                                                                                                                          |
| `startOnboarding`                                | live (owner)           | Hosted link or embedded session; `not-configured` without keys                                                                                                                                                                   |
| `payoutSettings`, `updatePayoutSettings`         | live                   | Reuses `organization_money_settings`; daily by default                                                                                                                                                                           |
| `player.fees.quote`                              | live                   | All-in price before commitment; records `pay_fee_quotes`                                                                                                                                                                         |
| `operator.fees.quote`                            | live (`payments:read`) | PART-B. `{ offeringId \| priceMinor, currency, method: card \| cash \| credits }` → what a player pays, what the club receives, each fee line; `status: "unavailable"` with a reason instead of an invented fee; records nothing |
| other procedures                                 | not implemented yet    | `refundPolicies`, `upsertRefundPolicy`, `taxSettings`, `updateTaxSettings`, `balance`, `moneyHome`, `operator.fees.platformSummary`, Premium                                                                                     |

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

## Club setup (`operator.setup`, owner B1)

Shapes are frozen in `packages/api/src/contracts/setup.ts`; how it works, the
limits and what is never done automatically are in
[`docs/product/club-setup.md`](product/club-setup.md). Reads need
`sessions:read`, writes `sessions:write`. In demo mode every procedure returns
its fixture from `@duna/core/demo/setup` (one failed run per failure reason).

| Procedure        | Status | Notes                                                                                                                                                                                                                                                                                       |
| ---------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profile`        | live   | The club's facts and their provenance; works with no website and no provider                                                                                                                                                                                                                |
| `updateProfile`  | live   | Partial update by hand; marks each field `person`, confirmed; `confirmFields` clears "From your website"; `BAD_REQUEST` for a non-public website or a closing time before opening                                                                                                           |
| `startRun`       | live   | `website` or `description`; `google-listing` is not configured yet. Without the reader / AI gateway: `PRECONDITION_FAILED` (not configured), no outbound call. Unsafe address: `BAD_REQUEST`; a read already running for another source: `CONFLICT`; more than 6 a day: `TOO_MANY_REQUESTS` |
| `run`            | live   | The run with its pages; polling it resumes a stalled read                                                                                                                                                                                                                                   |
| `latestRun`      | live   | The newest run or `null`                                                                                                                                                                                                                                                                    |
| `cancelRun`      | live   | `{ runId }` → `setupRunSchema`. Added by B1 on existing shapes; stops a queued or reading run and discards what it found; idempotent                                                                                                                                                        |
| `proposals`      | live   | Everything a run found; `payload` carries the value plus `confidence` (`stated` / `inferred`), `quotes` (page + short text) and, on a re-read, `before`                                                                                                                                     |
| `decideProposal` | live   | Keep / Edit / Skip; Keep and Edit pass the same rules (phone, email, links, hours, colours, prices in minor units); `CONFLICT` while reading or once applied                                                                                                                                |
| `decideGroup`    | live   | `{ runId, category, decision: kept \| skipped }` → `setupProposalsSchema`. Added by B1 on existing shapes; bulk Keep leaves conflicts and invalid values pending                                                                                                                            |
| `applyProposals` | live   | Writes kept and edited items, one transaction per group, each audited (`setup.proposal.applied`); replaying the idempotency key returns the first report                                                                                                                                    |
| `readiness`      | live   | Computed from the club's records: nine sections, `bookingsOpen` once places, hours, an offering and Duna Pay are ready                                                                                                                                                                      |

Service functions with no procedure yet: `processPendingSetupRuns` (advance
waiting or stalled reads, for a cron) and `purgeExpiredSetupRunData` (the
proposed 180-day retention), both in `packages/api/src/services/setup`.

## Team pay (`operator.teamPay`, owner B3b)

Shapes are frozen in `packages/api/src/contracts/team-pay.ts`; the product
rules are in [`docs/product/team.md`](product/team.md). Every procedure is
live and returns its fixture from `@duna/core/demo/team-pay` in demo mode.
The computation is the pure `computePayRun` in
`packages/api/src/services/team-pay/compute.ts`; Duna computes and exports
and pays nobody here.

| Procedure                          | Scope                                                                      | Notes                                                                                                                                            |
| ---------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `staffCompensation`                | `members:read` + the member themselves, `members:write` or `payments:read` | Current model, history, goal with `earned` from delivered sessions in the goal window                                                            |
| `setCompensation`, `setIncomeGoal` | `payments:write`                                                           | A new model closes the current one the day before; same-day replacement only if no run used it; rates in the club currency                       |
| `payPeriods`, `createPayPeriod`    | read `members:read`; create `payments:write`                               | End date from frequency; twice-monthly starts on the 1st or 16th; no overlaps (`CONFLICT`)                                                       |
| `payRuns`, `payRun`                | `members:read` + `members:write` or `payments:read`                        | Lines with sessions count, minutes, earnings, labelled adjustments, total; exports with who and when                                             |
| `computePayRun`                    | `payments:write`                                                           | Idempotent by key; new revision; cancels unapproved revisions; after an approved run it pays only sessions (and salary) not yet paid             |
| `adjustLine`, `cancelPayRun`       | `payments:write`                                                           | Only while `ready-for-approval`; `duna-pay` refused (W-2 never; contractors until B3c)                                                           |
| `approvePayRun`                    | `payments:write`                                                           | Idempotent; an approved run is immutable                                                                                                         |
| `exportPayRun`                     | `payments:write`                                                           | Generic CSV (columns in `export-file.ts`), private storage, 15-minute signed link; other layouts and missing storage answer "not configured yet" |

`operator.teamPayouts.*` (B3c) stays "not implemented yet" by design; see
[`docs/money/contractor-payouts.md`](money/contractor-payouts.md).

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
- `operator.memberProfile` never returns a health value (PRIV-1). It returns
  `healthAccess: { canView }`, computed for this viewer and this person by the
  Health service's own non-recording check (`healthSummaryVisibleTo` in
  `health-service.ts`, built on `resolveHealthAccess`; it writes no access
  record): an adult viewer with an effective grant to them by name, to them as
  the person's coach at this club, or to this club for the roles
  `organizationViewerRolesFor` names (owner, manager, coach for adults;
  coaches only for a junior, and only with guardian approval). A grant to
  another club or to a peer player never counts inside a club workspace.
  Values come only from `operator.memberHealthProfile`, which records
  "health.profile_viewed". Deprecated: the `health` key is still present (no
  `metrics`) exactly when `canView` is true, until HQ reads `healthAccess`.
  Ask Duna never receives that key.

## Versioning

Database changes are forward-only migrations. Rating algorithm changes require
an immutable `rating_configurations` version and a fresh backtest. MCP protocol
changes must remain backward compatible with the advertised stable protocol or
publish a new endpoint/version.
