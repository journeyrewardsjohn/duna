# Volleyball World beach live data

This integration uses the same public feeds as the Volleyball World beach match
center. They are observed application contracts, not a separately published or
versioned public API. Parsers must remain defensive and Duna must retain the
last valid snapshot when an upstream request fails.

## Discovery

1. Discover official competitions by year and month:
   `GET https://en.volleyballworld.com/api/v1/globalschedule/competitions/{year}/{month}`
2. Match dates, event name, destination, category, and gender.
3. Confirm the 12ndr tournament code against `allTeams[].tournamentCode` in the
   official tournament schedule before storing a binding.
4. Store the official competition URL plus the men or women tournament number.

The Hamburg 2026 example binds `MHAM2026` to tournament `9229` and `WHAM2026`
to tournament `9230`.

## Schedule and identities

The full tournament schedule is available at:

`GET https://en.volleyballworld.com/api/v1/beach-tournament/{startsOn}/{endsOn}/{tournamentNumbers}`

It supplies official match IDs, team IDs, countries, flags, phase, round,
court, local and UTC time, scores, and available broadcast links. Volleyball
World reuses the visible `matchNoInTournament` between qualification and main
draw, so Duna's 12ndr external identity must include the phase:

`{tcode}:{main-draw|qualification}:{matchNoInTournament}`

The immutable Volleyball World `matchNo` is stored on that Duna match after the
schedule has been reconciled by phase, date, round, court, and participants.

The official schedule is also the recovery source when a slower 12ndr result
row is absent. Duna reconstructs the phase-scoped match, reuses a roster only
when both player names agree, rejects a conflicting known federation, and
prefers an exact official team ID. Existing canonical player links are
preserved. If a hydrated roster is not yet available, the match is staged with
deterministic provisional player IDs; a later detail sync replaces those IDs
with the source roster. This closes gaps without inventing a canonical player
or conflating qualification and main-draw matches that share a visible number.

## Live REST snapshots

- One match:
  `GET https://en-live.volleyballworld.com/api/v1/live/beach/matches/{matchNo}`
- Tournament list:
  `GET https://en-live.volleyballworld.com/api/v1/live/beach/matches/bytournaments/{tournamentNumbers}`

Observed cache guidance is 30 seconds. Duna stores status, current set and
points, set wins, every set score, lineup availability, team IDs, and stream
URL. The public Duna live route is explicitly `no-store`: it reconciles the
latest authoritative REST snapshot into the imported match, final scores,
winner, match statistics, and event-level live state before responding.

## Point-by-point WebSocket

The official match center obtains an anonymous token with:

`POST https://auth-api.volleyballworld.com/api/gameday/anonymous-token`

It connects to:

`wss://ws.gameday-prod.wvbl.mangodev.co.uk?token={jwt}`

and subscribes to the beach-event wildcard used by the official match center:

```json
{
  "action": "subscribe",
  "topics": ["/gameday/beach_volleyball/event/*"]
}
```

Beach events use an external ID shaped as `beach_event_{matchNo}`, so Duna
discards every wildcard message except the currently viewed official match.
Participant scores represent set wins and set-score tags use
`urn:gd:tag:event:score:set:{number}`. The browser sends a `list` heartbeat every
20 seconds. A missing heartbeat response after the six-second grace window
closes the socket; a match-specific update gap of 45 seconds downgrades the UI
to authoritative REST polling every 15 seconds. Reconnects use capped
exponential backoff with five attempts. Even while the socket is healthy, a
30-second REST reconciliation remains active. A socket final immediately
triggers one final REST reconciliation so official set scores, winner, and
statistics—not the transient event alone—become the persisted result.

## Match statistics

The official page exposes server-rendered fragments beneath the match URL:

- `/_libraries/live/_beach-match-statistics-by-team`
- `/_libraries/live/_beach-match-statistics-by-player`

Team values include attack, block, serve, opponent error, total, and digs.
Player scoring values include points, attack points/errors/attempts, hitting
efficiency, aces, blocks, reception, and digs. The two fragments are fetched
sequentially through the shared source limiter. Live stats may refresh; a
completed match is captured once and then retained.

For completed Elite events in the current year, an hourly, paced lane fills at
most eight missing match-stat snapshots across at most two tournaments. It does
not process Challenger, Futures, AVP, or another season. Tournament aggregates
are computed from official completed-match evidence only: weighted hitting
efficiency, aces/set, blocks/set, digs/set, field averages, standout deltas, and
the descriptive correlation between digs/set and opponent hitting efficiency.
Any narrative analysis is generated through Vercel AI Gateway with a
provider-qualified OpenAI model and a strict evidence-only JSON schema.

## Operations

- Vercel Cron refreshes official live snapshots every minute. Keeping the
  scheduler with the production function avoids making live scoring dependent
  on an external CI runner.
- A separate hourly cron incrementally backfills current-year Elite statistics.
- The slower 12ndr detail import runs every two hours.
- An open match page uses the filtered wildcard WebSocket while healthy, polls
  Duna every 30 seconds as an integrity check, and falls back to 15-second REST
  polling when socket health degrades.
- Firecrawl is not used for score transport. It remains useful only for
  rendered-page discovery or metadata when no structured official feed exists.
- Duna editorial broadcast choices remain first; official VBTV or YouTube links
  fill only an unconfigured match channel.

Parser coverage lives in:

- `packages/api/src/sand-data/volleyball-world-live.test.ts`
- `apps/web/lib/volleyball-world-gameday.test.ts`
