# Duna MCP server

Duna exposes a Model Context Protocol server for beach-volleyball discovery,
players, rankings, booking entry points, and audited data repair.

## Connection

- Production endpoint: `https://duna.coach/api/mcp`
- Transport: Streamable HTTP
- MCP protocol: `2025-06-18`
- Requests: JSON-RPC 2.0 over `POST`
- Server-to-client SSE: not enabled; `GET` returns `405`
- Authentication: public tools need none. Player/admin tools use a WorkOS
  access token as `Authorization: Bearer <token>`.

The server validates browser `Origin`, caps request bodies, returns
`MCP-Protocol-Version`, and does not create server-side sessions.

### Initialize

```http
POST /api/mcp
Content-Type: application/json

{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"duna-agent","version":"1.0.0"}}}
```

Send `notifications/initialized`, then use `tools/list` and `tools/call`.

### Tool call

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "search_players",
    "arguments": { "query": "Kelly", "limit": 10 }
  }
}
```

Successful calls return both text content and `structuredContent`. Domain or
validation failures are tool results with `isError: true`; malformed JSON-RPC
requests use JSON-RPC errors.

## Public tools

| Tool                     | Result                                                       |
| ------------------------ | ------------------------------------------------------------ |
| `search_events`          | Filtered public events and canonical registration URLs       |
| `get_event`              | One public event with schedule and eligibility context       |
| `search_players`         | Public player identities and Sand Rating context             |
| `get_player`             | Public profile, match/rating history, sources, and claim URL |
| `get_world_rankings`     | Official or Duna top 200, by men/women                       |
| `get_rating_methodology` | Latest audited model comparison and curves                   |
| `find_coaches`           | Public coach options                                         |
| `get_coach`              | One coach profile                                            |
| `find_booking_options`   | Events, lessons, venues, and action URLs                     |

Discovery tools never book, purchase, register, accept a waiver, or move money.
They return canonical Duna actions so the user can review price, eligibility,
policies, and checkout.

## Authenticated player tool

`report_match_issue` is available to an authenticated participant. It opens an
accuracy review and holds the match out of ratings. The underlying API rejects
reports from non-participants. Agents should supply and reuse an
`idempotencyKey` UUID when retrying the same report.

## Super-admin repair tools

| Tool                      | Safety boundary                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------ |
| `list_data_issues`        | Read-only queues for mappings, matches, disputes, and claims                         |
| `inspect_player_identity` | Read-only canonical/source candidate inspection                                      |
| `resolve_player_identity` | Requires ≥0.98 confidence, at least one evidence URL, exact IDs, and an audit reason |
| `review_profile_claim`    | Professional approval requires official-profile attestation                          |
| `review_match_issue`      | Audited decision followed by rating replay                                           |
| `run_rating_backtest`     | Persists a new audited walk-forward run; does not promote a model                    |

The server derives admin authority from the WorkOS actor attached to the bearer
token. A client cannot unlock admin tools by declaring a role in tool arguments.

## Recommended Duna AI repair loop

1. Call `list_data_issues` and choose one bounded issue.
2. Use `inspect_player_identity` plus public player/source pages.
3. Compare stable source IDs, official URLs, partners, dates, and match history.
4. If evidence is ambiguous, stop and leave the issue queued.
5. If the identity is exact, call `resolve_player_identity` with the source URLs
   and a concise evidence reason.
6. Re-read the issue and public player page to verify the result.
7. If the correction changes approved evidence, run or request the appropriate
   rating replay/backtest; never hand-edit rating rows.

## Deployment configuration

No MCP-specific secret is required. WorkOS bearer verification uses the same
production identity configuration as the typed API. Optional
`DUNA_MCP_ALLOWED_ORIGINS` is a comma-separated allowlist for additional browser
origins. `NEXT_PUBLIC_WEB_URL` or `NEXT_PUBLIC_DUNA_WEB_URL` controls canonical
action URLs.

The MCP endpoint depends on the same Neon migration state as Duna Web. Apply
database migrations before deploying code that reads new rating backtest
tables.
