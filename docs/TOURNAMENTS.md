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
5. Result correction propagation, referee/work obligations, realtime
   invalidation, and the Duna Pro Tournament Control Room.

Until those items are complete, Duna must not label a provisional pool order as
an automatic qualification decision.
