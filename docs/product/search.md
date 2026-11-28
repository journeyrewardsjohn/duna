# Search: where, when, what

Work package B10, 28 November 2026. The server search behind the Player app's Find screen and the
site's search: `public.search.query`, `player.search.query`, `public.search.suggest` and
`public.search.session` (procedures and examples in [`docs/API.md`](../API.md)).

## What search covers

- **Clubs, venues, coaches, events and pickups, the Pro Tour**: everything on the public discovery
  map (`public.discoveryMap`), built by the same loaders, so the device and the server see the same
  things. Unlisted and cancelled events are left out.
- **Bookable sessions**: scheduled occurrences of a club's lessons, clinics, group training and open
  play in the next 120 days, from active offerings at real clubs. Each carries its group state
  (participation) from the core display model.
- **Members-only sessions** only for signed-in people who belong to that club (`player.search`).
  Private (invite-only) sessions are never listed; their page opens only for the club's staff and
  people holding a place. Drafts, archived offerings and system workspaces are never found.

## Where, When, What

- **Where**: anywhere, near a point (radius up to 500 km), the visible map area, or one Duna venue or
  club (`venue:<id>`, `club:<id>`). Near a point the circle widens in the device search's steps
  until there are five results, and the first page's circle is kept for the pages after it.
- **When**: calendar dates in the venue's own time (or the searcher's zone when given), at most a
  year; plus mornings (05:00–11:59), afternoons (12:00–16:59) and evenings (17:00–04:59), venue time.
  Comparing local dates is exact across daylight-saving changes.
- **What**: clubs, venues, events, leagues, lessons (lessons, clinics, group training), open play
  (open play and pickups), coaches; tags narrow further.
- Things that already ended are left out unless they are live.

## How results are ordered

One order, shared with the device search (`packages/api/src/discovery-ranking.ts`):

1. text relevance, when text was typed (whole title, title prefix, a title word, every word anywhere);
2. live first;
3. nearest first, when there is a point (the map area's centre for "search this area");
4. soonest first (undated things last);
5. title, then id, so the order is total and a cursor can resume it.

Parity with the device search is a test (`services/search/parity.test.ts`): over seeded fixtures,
for every Where × When × What combination the device offers, the server's pages joined in order are
exactly `runDiscoverySearch`'s list, with the same radius.

## Paging, caching, limits

- Pages use a keyset cursor (the last result's place in the order). Results added or removed between
  pages never cause a repeat, and a result that stayed is never skipped.
- Public candidates are reused for a minute per server instance; group state and anything signed-in
  is read for the visible page every time, in a fixed number of queries.
- Each address has a budget (query 60 a minute, suggest 120, session 30) on the database-backed
  limiter; logs record counts, kinds and text length, never the text.

## Not searched yet (deliberately)

- Public courts (facility listings) and training programs: the kinds exist in the contract; their
  sources are not indexed yet.
- Court availability ("3 courts free at 5 PM"): venues show `unknown` until the court-time read is
  batched per page.
- Players and people: never in place search.
- Sessions more than 120 days ahead, and more than 5,000 sessions per load (the soonest are kept).
- Typed place names are not geocoded on the server: the Where picker geocodes and sends a point.
- Bounds across the date line.
