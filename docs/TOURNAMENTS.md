# Duna Tournaments

Tournament Operations is a shared Duna system, not a set of separate HQ, Pro,
and Player features. HQ authors the field and the structure; Pro operates the
day; Player and the public event page consume the same server-produced state.

## Current flow

```text
HQ event builder → registrations and seeding → versioned bracket + matches
                                         ↓
                         TournamentCompetitionSnapshot
                            ↙              ↓              ↘
                        HQ detail        Pro desk      Player + public
```

`packages/league-engine` owns deterministic topology and scoring rules.
`packages/scheduling` owns courts, dependencies, timing, rest, and conflicts.
The database stores versioned brackets and materialized matches. No UI derives
advancement, standings, or a player's next match independently.

## Guided tournament blueprints

HQ asks for the competition shape before division eligibility and capacity.
Each division persists its selected format and format-specific configuration so
the builder, registration checkout, generated draw, Tournament Control, and
Player/public projections all use one contract.

- `single-elimination`, `double-elimination`, and
  `crossover-double-elimination` use fixed team entries and may add pool play.
- `kob-individual` accepts one athlete per registration. The engine creates
  temporary pairings that prioritize unused partners, balance appearances and
  ratings, and minimize repeated opponents. Every four-athlete pool produces
  all six pairings before a repeat partnership is considered.
- `kob-team` accepts a fixed teammate and runs timed survival heats. The whole
  field shares one live point board; the configured number of lowest teams is
  cut when a heat is locked, and the remaining teams open in the next heat.

Individual KOB stages persist their match target, set count, pool size,
advancement count, and carry-points rule. Team KOB stages persist their heat
duration, starting field, advancement count, and carry-points rule. Directors
can add stages in the guided builder, but invalid transitions are rejected on
the server (including undersized rotation pools and advancement larger than the
available field).

KOB advancement is also server-owned. Completed individual matches are folded
into player point/win standings before the next partner rotation is generated.
Completed team heats are ranked by points then original seed before survivors
are copied into the next heat. Both operations update the active bracket and
append an audit event; publishing a replacement draw remains the explicit
version boundary.

## Competition snapshot

`public.tournamentCompetition({ slug })` and
`player.tournamentCompetition({ sessionId })` project the latest bracket for
every division. The projection contains pools, live results, rounds, courts,
and—on the authenticated Player route—the player’s next scheduled/live match.

This is deliberately a read model. HQ and Pro continue to use explicit,
audited commands to alter field, scoring, courts, and structure.

## Product rules

- Bracket versions are immutable once superseded. A new version is an explicit
  director action with a reason; it never silently rewrites history.
- The event is not live merely because a bracket exists. Launch is explicit.
- Mobile shows one stage at a time through horizontally scrollable round tabs;
  desktop can reveal the complete bracket tree. Essential information never
  relies on animation.
- Live score and completed-path treatment are meaningful state, with a
  reduced-motion fallback.
- Public views never infer private player identity. Team names are displayed
  from the generated field; profiles/avatars remain subject to visibility and
  youth safeguards.

## Gaps that remain before full tournament automation

1. Standings v2: match win ratio, set win ratio, point differential,
   head-to-head, common-opponent mini-tables, then a deterministic coin flip.
   Current live pool tables are operationally useful but a director must
   confirm unresolved ties.
2. Pool advancement: final standings must produce an immutable qualifier
   snapshot and downstream elimination structure automatically.
3. Correct crossover double elimination: two winners-side and two
   contenders-side teams must cross into semifinal elimination, then final.
4. Tournament rules: inherit match format through tournament, division,
   stage, round, and individual match—including exact-set formats.
5. Result correction propagation, referee/work obligations, and realtime
   invalidation.

The Pro Tournament Control Room now operates individual KOB round advancement
and team KOB heat scoring/locking. Future work should add named tie-break
policies and correction propagation before KOB results are used for sanctioned
ranking points.

Until those items are complete, Duna must not label a provisional pool order as
an automatic qualification decision.
