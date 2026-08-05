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

`admin.approveReadySandRatingMatches` is a separate evidence operation. It
approves mapped partner history and rebuilds the canonical rating projection.
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
