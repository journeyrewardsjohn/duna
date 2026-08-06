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

## Live REST snapshots

- One match:
  `GET https://en-live.volleyballworld.com/api/v1/live/beach/matches/{matchNo}`
- Tournament list:
  `GET https://en-live.volleyballworld.com/api/v1/live/beach/matches/bytournaments/{tournamentNumbers}`

Observed cache guidance is 30 seconds. Duna stores status, current set and
points, set wins, every set score, lineup availability, team IDs, and stream
URL. The public Duna live route is CDN cached and preserves the last known good
snapshot if Volleyball World is unavailable.

## Point-by-point WebSocket

The official match center obtains an anonymous token with:

`POST https://auth-api.volleyballworld.com/api/gameday/anonymous-token`

It connects to:

`wss://ws.gameday-prod.wvbl.mangodev.co.uk?token={jwt}`

and subscribes to the single-match topic:

```json
{
  "action": "subscribe",
  "topics": ["/gameday/beach_volleyball/event/{matchNo}"]
}
```

Beach events use an external ID shaped as `beach_event_{matchNo}`. Participant
scores represent set wins and set-score tags use
`urn:gd:tag:event:score:set:{number}`. The browser sends a `list` heartbeat every
20 seconds, reconnects at most twice, and always keeps the 30-second Duna REST
poll as a fallback. It never subscribes to the official wildcard topic.

## Match statistics

The official page exposes server-rendered fragments beneath the match URL:

- `/_libraries/live/_beach-match-statistics-by-team`
- `/_libraries/live/_beach-match-statistics-by-player`

Team values include attack, block, serve, opponent error, total, and digs.
Player scoring values include total, attacks, blocks, serves, errors, and
efficiency. The two fragments are fetched sequentially through the shared
source limiter. Live stats may refresh; a completed match is captured once and
then retained. When no court is live, each sync backfills at most two completed
matches so a newly linked tournament cannot starve or time out the live scorer.

## Operations

- GitHub Actions refreshes official live snapshots every five minutes.
- The slower 12ndr detail import runs every two hours.
- An open match page polls Duna every 30 seconds and uses the match-specific
  WebSocket while the match is live.
- Firecrawl is not used for score transport. It remains useful only for
  rendered-page discovery or metadata when no structured official feed exists.
- Duna editorial broadcast choices remain first; official VBTV or YouTube links
  fill only an unconfigured match channel.

Parser coverage lives in:

- `packages/api/src/sand-data/volleyball-world-live.test.ts`
- `apps/web/lib/volleyball-world-gameday.test.ts`
