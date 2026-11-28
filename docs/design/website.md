# Duna public website: redesign specification (SITE-0)

Status: design for owner approval, 28 November 2026. Engineers build after approval, one pull request per
package in section 15. Prototype (private artifact, demo data):
https://claude.ai/artifact/3cQ67tRUAvnFTeYPkQrv3w

This file is the design contract for the public site at duna.coach. It sits under the Tideline 4.1.1
contract (`docs/design/tideline-4.1.1/README.md`, `brand-book.md`, `components.md`, `canvases.md`) and
`docs/design/interaction-kit.md`, and it replaces the public-site guidance in
`docs/design/duna-public-audiences-20261102.md` and `docs/design/duna-public-website-20261004.md` where
they disagree (fonts: Jost and Geist, not Satoshi; the homepage is no longer clubs-first, see 2.1).

Truth rules that bind every section: no invented customers, quotes, logos, counts or prices. Generated
people illustrate the sport only; they are never named, quoted or presented as members. Every price on the
site comes from `packages/core` at build time, never typed into copy. Product copy never names
infrastructure vendors.

---

## 1. Study notes

### 1.1 sensiq.co (structure and craft only)

- Inset "page shell": every section is a rounded card 16 px inside the viewport. Hero is a sunlit hand
  photograph filling the right two-thirds, with two small translucent stat cards floating over it (HRV,
  REM). The product is a designed concept on a person, not a device screenshot.
- Type: one display face at 64.8 px, weight 500, tracking about -0.02em, three short lines; an uppercase
  eyebrow ("Without subscription") repeated on every section.
- A 2,520 px pinned section rotates the product object with scroll while the headline swaps through three
  statements; a small card counts a number up ("Heart rate 79 bpm", a percentage ticking 0 to 67). Motion
  is scroll-scrubbed and calm; nothing loops on its own.
- Testimonials sit beside more floating data cards. One CTA style, dark pill, repeated ("Start exploring",
  "Shop now").
- Phone: the first screen is the photograph with the headline still invisible; scrolling shows blank
  panels while scroll-linked content waits. Lesson for Duna: the first screen must be complete at rest and
  no content may wait for a scroll position.

### 1.2 ploy.ai (structure and craft only)

- Full-bleed video hero (autoplay, muted, poster) under a 144 px condensed uppercase headline. Two CTAs
  ("Start Free", "Get Demo") in the hero and permanently in the header; "Pricing" is a top-level link.
- Logo marquee, then three-up "Monitor / Act / Surface", then colour-banded sections (lavender, yellow)
  that change the page ground as you scroll; odometer numbers tick; a pinned "overnight timeline" cycles
  events with timestamps. A floating "Ask" chat button follows the page.
- Pricing: monthly/annual toggle, three cards plus enterprise, "Most popular" tag, an included / not
  included matrix, "Need more? Talk to sales".
- Phone: pricing's first screen is blank until the headline animates in. Same lesson.

What we take: product extracted as live concepts over photography (sensiq); a persistent, honest
two-action header and pricing in the top level (ploy); short count-ups tied to meaning; one pinned story.
What we leave: blank-until-animated first screens, scroll-scrubbed objects that hide content, logo walls
and testimonials we cannot back, colour bands outside our palette.

### 1.3 The live site (screenshots: scratchpad `site/study-named/`)

| Page             | What works                                                | What is weak                                                                                   |
| ---------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `/` (clubs)      | Clear audience toggle; honest "Start for $0"              | The product card is an empty "Product preview" ghost; no people; homepage speaks only to clubs |
| `/players`       | Plain promise                                             | Same empty preview; players must find the search on another page                               |
| `/run-your-club` | Real plan table; "Assistance proposes. Operators decide." | Mock consoles with invented totals ($38.4K); long; dense                                       |
| `/pro`           | Strong idea (one live view of the tour)                   | Old system; washed photo; not Jost/Geist                                                       |
| `/discover`      | A real Where · When · What bar; Places works with typos   | Places only: Duna's own clubs and courts are not listed in the Where picker; dark slab hero    |
| `/clubs/[slug]`  | Clean hero                                                | Shows "0 players · 0 coaches" (misleading empty data)                                          |
| `/events/[slug]` | Good registration rail                                    | Fine; needs the new header and type                                                            |
| `/rankings`      | Real data                                                 | Ghost headline unreadable                                                                      |
| `/sign-in`       | Photo with real effort                                    | Serif-weight display face; not the brand                                                       |

Must survive: every URL in 1.4, the Where · When · What search and its Places backing, the Sand Rating
method page, the Pro Tour pages and team pages, JSON-LD on public templates, Markdown companions (`.md`),
`/agents`, `llms.txt`, and the honest "Start for $0" framing.

### 1.4 Existing public routes (from `apps/web/app`, no route groups today)

`/`, `/players`, `/players/[handle]`, `/run-your-club`, `/run-your-club/features`,
`/run-your-club/features/[...slug]`, `/run-your-club/training`, `/run-your-club/training-os`, `/pro`,
`/pro/teams/[teamNo]`, `/pro/onboarding-complete`, `/avp`, `/discover`, `/discover/results`,
`/discover/map`, `/rankings`, `/methodology`, `/about`, `/safety`, `/apps/apple-watch`, `/create`,
`/clubs/[slug]`, `/clubs/[slug]/products/[productSlug]`, `/checkout/[slug]`, `/coaches/[handle]`,
`/events/[slug]`, `/events/[slug]/match/[matchSlug]/[matchId]`, `/matches/[matchId]`, `/live/[matchId]`,
`/venues/[venueId]`, `/watch/[videoId]`, `/vision/remote/[token]`, `/waivers/complete`,
`/join/{guardian,match,organization,team}/[token]`, `/sign-in`, `/sign-up` (and `/start`),
`/auth/callback`, `/legal`, `/legal/[document]`, `/agents`, `/llms.txt`, `sitemap.ts`, `robots.ts`,
`manifest.ts`, `opengraph-image.png`, `/api/og/pro`, `/api/mcp`. Redirects live in `apps/web/proxy.ts`
(`/app/discover*` to `/discover*`; `*.md` rewritten to `/api/public-markdown`).

### 1.5 What the code really has (so we sell what is real)

- Score submission ("the honeypot"): does not exist publicly. Score entry is signed-in only: `/app/score`
  (`components/match-recorder.tsx`) calling `player.recordCompletedMatch` (protected, rate limited 20 /
  10 per minute, idempotent; sets, teams, provisional participants, `location` with `googlePlaceId`,
  `allPlayersAgreedToRecord: true`). Matches save as `pending-verification`; ratings apply only when a
  player on each side confirms (`player.confirmMatch`), nobody disputes, the match is competitive 2v2, and
  every player has a claimed profile (`match-service.ts` `applyVerifiedRatings`). A submitted location is
  stored in the match and used for weather; it never creates a venue. No captcha or bot check exists. No
  public venue submission; venues are created only by operators.
- Google Places: `apps/web/app/api/places/{autocomplete,details,map}` (server key `GOOGLE_PLACES_API_KEY`,
  503 "not configured" without it, public, no rate limit). Used by `PlaceSearch`, the match recorder,
  pickup forms and discovery. `SearchBar`, `WherePicker`, `WhenPicker`, `WhatPicker`, `SearchSheet` are
  specified in `components.md` but not built; `public.search.query/suggest` are stubs (contract B10 in
  `docs/plan/w3-contracts.md`).
- Prices in code (`packages/core/src/organization-plans.ts`, `membership-plans.ts`,
  `packages/pricing`, `packages/api/src/website-billing.ts`): clubs Free $0 + 5% organisation fee, Club
  $199 a month or $1,990 a year + 2.5%, Scale $499 a month or $4,990 a year + 0%; video included 10/2,
  100/10, 500/40 upload/live hours; club website $200 a month; players Free (7.5% service fee), Premium
  $9.99 a month or $99 a year, Premium+ $29.99 or $299; processing estimates card 3% + $0.35, bank 1%
  capped at $6. Legal documents are `1.0-draft` with "[Owner: confirm]" on the 7.5% rate and processing.
- Real today: live scoring, Sand Rating engine (`packages/rating`), wallet member cards and passes,
  video and `/watch`, health sync, programs / practice plans / drills (legacy procedures), Duna Pay
  (Stripe Connect v2), Ask Duna, the one-edit club website, pickup games. Stubs or design-only today:
  Concierge (seam), drill scenes, the new website workspace, "needs 2 more" participation UI, coach-day
  conditions backend, the two-ring `RatingRing`, search seam.

---

## 2. Decisions

### 2.1 Story and information architecture

One site, one story: **the same game seen from both sides of the net.** A player finds a game, keeps score
and gets a Sand Rating; the game they found is a session a club ran, filled and got paid for. Every
product moment appears once for the player and is reused, turned around, for the club. There is no wall:
the homepage opens with the player's action (search) because players are the larger audience and the
action is one step; the club's action sits beside it as a quiet link and in the header.

Audience choice: a two-state switch in the header, "I play" / "I run a club". It changes only the header
call to action ("Find a game" or "Start your club") and the phone thumb bar; choosing "I run a club" on
the homepage scrolls to the clubs chapter. It persists per visitor (local storage, then account
preference after sign-in). It never hides content.

`/pro` stays the **Pro Tour**: the live route, its team pages and its search equity are the tour. Coaches
get `/coaches` (the index above the existing `/coaches/[handle]` profiles), which is where Duna Pro, the
coach app, is sold. Owner decision needed (section 16): if the owner wants `/pro` to mean the coach app,
the tour moves to `/tour` with 301s.

| Page                                                                                        | Job                                                                | Primary action                      |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------- |
| `/`                                                                                         | Both audiences in seconds; search first; the two-sided story       | Search; Start your club             |
| `/discover` (results)                                                                       | Answer Where · When · What                                         | Join / book                         |
| `/add-score`                                                                                | The honeypot: a score and a place without an account               | See my rating, then Save to my name |
| `/run-your-club`                                                                            | Everything Duna runs for a club, true proof, pricing summary       | Start your club free; Talk to us    |
| `/coaches`                                                                                  | Duna Pro: the day, the plan, the scorer, getting paid              | Start coaching on Duna              |
| `/pricing`                                                                                  | Clubs and players plans, fees explained, calculator                | Start free / Choose plan            |
| `/pro`                                                                                      | Pro Tour coverage in the new system                                | Today's matches                     |
| `/sand-rating`                                                                              | What the rating is, the two rings, method (absorbs `/methodology`) | Add a score                         |
| `/apps`                                                                                     | Duna and Duna Pro, Watch                                           | App Store                           |
| `/clubs/[slug]`, `/events/[slug]`, `/venues/[id]`, `/coaches/[handle]`, `/players/[handle]` | Public detail pages in the new shell                               | Book / Register / Follow            |

### 2.2 Redirect map (301 unless noted)

| From                                      | To                                                                                                                    |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `/players`                                | `/` (player content is the homepage)                                                                                  |
| `/run-your-club/features`                 | `/run-your-club#features`                                                                                             |
| `/run-your-club/features/[...slug]`       | unchanged for now: the per-feature pages stay in `(legacy)` (SITE-2 kept them; decide per slug when they are rebuilt) |
| `/run-your-club/training`, `/training-os` | `/coaches#plan`                                                                                                       |
| `/methodology`                            | `/sand-rating#method`                                                                                                 |
| `/discover/results`                       | `/discover` (same query string)                                                                                       |
| `/discover/map`                           | `/discover?view=map`                                                                                                  |
| `/apps/apple-watch`                       | `/apps#watch`                                                                                                         |
| `/run-your-club#plans`                    | links updated to `/pricing` (fragment cannot redirect)                                                                |
| `/players/[handle]`                       | unchanged (profiles)                                                                                                  |
| `/app/discover*`                          | `/discover*` (existing)                                                                                               |

Everything else keeps its URL. Each redirect gets a Markdown companion redirect too.

As built (SITE-2, 28 November 2026): `apps/web/proxy.ts` answers `/methodology`, `/run-your-club/features`,
`/run-your-club/training`, `/run-your-club/training-os` and `/apps/apple-watch` (and each `.md`) with a 301,
the fragment included. The Pro Tour keeps `/pro`, `/pro?tour=…&date=…`, `/pro/teams/[teamNo]` and
`/pro/onboarding-complete` at the same addresses in the new shell. `/run-your-club#plans` links now point
at `/pricing`.

### 2.3 The first screen

Left column: eyebrow "Beach and indoor volleyball", the one Jost title "Meet you at the net.", one line of
lead, then the search card (Where, When, What as three stacked rows on every width, so the labels are
always visible), its live count ("14 games and sessions match"), and Search. Under it two text links:
"Played somewhere? Add your score" and "Run a club or coach? Start free". Right column: the hero
photograph with the Sand Rating concept card floating at bottom right. On phones the photo moves under the
search so the first screen is title, promise and search; the thumb bar appears after 420 px of scroll.

WherePicker behaviour (desktop popover, phone full-screen sheet):

1. Empty input shows: Near me (asks for location once; on refusal, says so and keeps the field), Anywhere,
   up to three Recent places, three Popular on Duna places.
2. Typing (debounced 120 ms, minimum 2 characters) shows two groups: **On Duna** (clubs and public courts
   with their club mark, kind and area, from `public.search.suggest`) first, then **Places** (cities,
   neighbourhoods, beaches, gyms from Places autocomplete, restricted to geocode + establishment types,
   biased to the visitor's region, session token per open picker to keep cost down). Duna matches are
   fuzzy (trigram plus edit distance up to 1 for words of 4 to 6 letters, 2 above), so "manhatan" finds
   Pier Courts and Manhattan Beach. Places brings its own spelling tolerance.
3. Choosing a Duna club or court searches that venue; choosing a place searches a radius around it
   (city 25 km, neighbourhood 8 km, a beach or gym 2 km).
4. Zero results in both groups: "We couldn't find "[text]". Played somewhere we don't know yet? Add the
   court and your score." with one button that opens `/add-score` with the text prefilled.
5. Keyboard: combobox pattern (arrow keys, Enter, Escape), `aria-activedescendant`, results announced.
6. Not configured (no Places key): Duna results still show, with a single line "Place search is off right
   now. Clubs and courts on Duna still show." Errors show a reference id.

WhenPicker: chips Today, Tonight (after 4 PM local), This weekend, This week, Any time, plus a seven-day
DayStrip. WhatPicker: multi-select chips Open games, Clinics and training, Leagues, Tournaments, Court
time, Coaches; surface Beach, Indoor, Any.

### 2.4 Product as concept, not screenshot

Each concept is a real component (DOM, real numbers, keyboard reachable where interactive) on a "glass"
card over photography. None is an image.

| Concept                    | Shown on                        | Motion (plays once, when 45% visible)                                                                    | Live or loop |
| -------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------ |
| Sand Rating ring           | Hero, story step 3              | Arc Rises from zero 900 ms on ease-rise, number counts 3.12 to 3.20 with it, chip lands 120 ms after     | Live DOM     |
| Scorekeeper                | Story step 2, coaches, Pro Tour | Four rallies tick at 1.4 s each; buttons work; stops at set point; "Live" chip only on Pro Tour          | Live DOM     |
| Open game, "needs 2 more"  | Story step 1, clubs tile        | Two faces Rise into empty slots (Rally 120 ms), status "Needs 1 more" then "Confirmed", bar fills        | Live DOM     |
| Club view of the same game | Clubs page                      | Same as above plus "Collected $24 to $48"                                                                | Live DOM     |
| Membership card to pass    | Home clubs chapter              | Card turns over 900 ms to the class pass (rotateY), click or Enter flips back                            | Live DOM     |
| Practice plan and drill    | Home, coaches                   | Players Cross to positions 320 ms (Rally 120 ms), ball paths draw 600 ms, block 2 highlighted            | Live DOM     |
| Coach's day + conditions   | Coaches hero                    | Static; values from the conditions line                                                                  | Live DOM     |
| Ask Duna proposal          | Home, clubs                     | Static; Approve / Not now work and confirm in place                                                      | Live DOM     |
| Club site edited by chat   | Clubs hero                      | A request types at 38 ms per character, the site headline Rises to the new text, Duna replies "Publish?" | Live DOM     |
| Film with heart rate       | Story step 4                    | Heart-rate line draws 900 ms over rally markers                                                          | Live DOM     |
| Hero breathing loop        | Hero photo                      | 5 s muted loop, crossfaded at the seam, starts after `load`; Pause control                               | Video loop   |
| Attack clip                | Story step 2 background         | 5 s muted slow motion, only while step 2 is active                                                       | Video loop   |

### 2.5 The honeypot as a first-class flow (`/add-score`)

Four steps with a progress bar (Where, Score, Players, Your rating). No account until the last step.

1. **Where.** The same WherePicker, in-flow. Not found: "Add "[text]" as a new court" opens name, surface
   (beach sand, indoor sand, indoor hardwood, grass) and number of nets. Line: "We check new courts before
   they're listed for everyone. You can still add your score now."
2. **Score.** Format (2v2 default, 3v3, 4v4, 6v6), date (today, no future), Competitive / Friendly, sets
   (default three rows, add up to five). Soft check, never a block: "One set doesn't look finished (sets
   go to 21, or 15 in a third set, won by 2). You can still save it if that's how you played."
3. **Players.** Your first name; partner; the other side (at least one name). Optional phone or email per
   opponent "for the confirm link". Required: "Everyone on court agreed to record this match."
4. **Your rating.** A provisional ring: dotted arc at 45%, one band segment, the estimate as "~3.05" with
   "± 0.40", status "First estimate · not counted yet", a summary (where, result, whether it counts), and
   "Save it to your name": email (or Apple / Google sign-in) creates the account, claims the match, and
   sends the confirm link to the other side.

Spec change for owner approval: `brand-book.md` §4 says a provisional ring shows an em dash. The honeypot
needs a visible first estimate to be worth finishing, so the provisional ring on `/add-score` only shows
"~" plus an estimate and its uncertainty, never a bare number. Everywhere else the em dash rule stands.

Anti-abuse without friction. Exists: idempotency keys, per-user rate limits on recording, both-sides
confirmation, dispute with a reason, ratings only for claimed profiles, `removeSelfReportedMatch` while
unrated. Needs API (section 14): an anonymous draft that lives 7 days, tied to a device id and a hashed
IP; per-IP and per-device rate limits on the draft endpoint and on `/api/places/*` (unlimited today); an
invisible bot challenge on the final "Save" only; confirm links that are single-use and expire; the
estimate never published or ranked until confirmed; duplicate-court detection by Places id and 150 m
radius; a moderation queue for new courts.

How submitted courts become listings: a new court becomes a `venue_suggestions` row (name, surface, nets,
Places id, lat/lng, submitter draft id, count of distinct submitters). Three distinct confirmed matches or
one staff approval promote it to a public court listing (an operator-less venue page with "Suggested by
players · last played [date]"). Clubs can claim a listing later.

### 2.6 Clubs (`/run-your-club`)

Hero: "Run the whole club from one place." with the club-site-by-chat concept over the indoor huddle
photo. Modules (eight, each with a real "Live today" or "In build" status taken from 1.5): Bookings,
Programs, Memberships, Duna Pay, Team, Website, Concierge, Ask Duna. Two concept tiles (club view of the
open game; Ask Duna proposal). "Open for bookings this week" in three real steps. Proof that is true: a
marked slot for a real club result supplied by the owner; until supplied, the slot is not rendered on the
live site. Pricing summary links to `/pricing`. "Talk to us" opens a contact sheet (name, club, email,
message; a person replies; Needs API: route to Concierge inbox).

### 2.7 Coaches (`/coaches`)

"Your coaching day, in your pocket." Coach photo slot (owner's high-resolution coach photos replace the
generated portrait) with today's sessions and the conditions line. Then the plan (drill on a court), the
scorer and getting paid (next payout, sessions this week). Duna Pro App Store badge.

### 2.8 Pricing (`/pricing`)

Structure works whatever the numbers become: an audience switch (Clubs and coaches / Players), a
Monthly / Yearly switch, three plan cards rendered from `packages/core` plan tables (name, price, period,
fee line, three inclusions, CTA), then "Where every dollar of a booking goes": a calculator (booking
price, club plan, player has Premium, card or bank) that shows player pays, service fee, club receives,
Duna fee, processing estimate, paid out. Then FAQ. A notice states the terms are in draft until the
owner approves them; it disappears when `ORGANIZATION_FEE_POLICY_VERSION` and the legal documents are
marked final. Who bears card processing on the service fee portion is an open question (section 16); the
prototype computes processing on what the player pays.

### 2.9 Art direction

- Photography: late or first light, side or back lit; 35 mm for scenes, 50 to 85 mm for people; shallow
  depth; real effort, sand on skin, sweat, finger tape; adults; beach and indoor in equal measure. Grade:
  warm sand highlights, blue-teal shadows close to Night Court, lifted blacks, low saturation, light
  grain. No logos, no text, no stock smiles, no children as the focus.
- Overlays: glass cards (Night Court at 74%, 18 px blur, 1 px Salt hairline at 16%, radius 18) in both
  themes, because they sit on photographs. Text on photos only inside glass or over a bottom scrim.
- The line: a 1 px hairline with a 3 x 11 px post at its start (the net and its pole) opens every section
  ("label, line, chip"), draws left to right as the section enters, and crosses the hero photo at the net
  height, never across a face.
- Grid: 12 columns, 1,360 px cap, 32 px gutters (16 px phones). Hero 5:7. Tiles 7:5 / 5:7.
- Type: Jost 500 display 64/68 (40/44 phones), section 44/50 (30/36 phones), never on numerals. Geist for
  everything else (24/32, 20/28, 18/26, 16/24, 15/23 body, 13/18 meta). Geist Mono 600 for scores,
  ratings, prices, times; uppercase mono labels 12/16 with 0.08em tracking. One Jost title per product
  screen (flows); marketing sections may each have a Jost headline.
- Light is the default ground (Salt); dark is a full theme (Night Court ground), and both are designed.
  Solar appears only on Live chips and the rating goal tick.
- Cursor and hover: default cursor; hover changes border or ground only; no scale, no glow. Sound: none.
- No decorative balls or ball-in-sand drawings anywhere.

### 2.10 Motion system

| Verb  | Use on the site                                     | Duration / easing                               |
| ----- | --------------------------------------------------- | ----------------------------------------------- |
| Rise  | Section headings, cards, the line drawing, ring arc | 600 ms, `cubic-bezier(.2,.8,.2,1)`; ring 900 ms |
| Rally | Groups (cards, faces, modules, hero items)          | 120 ms apart, at most 8 items                   |
| Cross | Page change (16 px), sheets, drill players          | 320 ms                                          |

Rules: scroll-linked never scroll-jacked (the only pinned element is the story's media column, which is
`position: sticky`; the page scrolls normally). Entrances play once. Nothing loops except the two muted
videos, which pause off-screen and have a Pause control. The first screen animates with CSS alone from
first paint; nothing on it waits for script or a scroll position. Concepts play when 45% visible.
Reduced motion: end states with a 200 ms fade, no video. First open: the brand sequence
(`FirstOpen`) runs only in the apps, never on the website. Page changes: View Transitions API cross-fade
plus 16 px Cross; fallback is a 200 ms fade.

### 2.11 Phone first

Every section stacks to one column. Search card, then photo. Concepts sit inside their photo (4:5) in
place of the desktop sticky column. Thumb bar (56 px button) after 420 px: "Find a game" or "Start your
club free" by audience; hidden in `/add-score`. Search is a full-screen sheet with Where, When and What
stacked and a sticky "Show N results". Tap targets 48 px minimum. Inputs 16 px.

### 2.12 SEO and sharing

- Titles: "Duna · Beach and indoor volleyball near you" (home), "Find a game in [place] · Duna",
  "Add a score and see your Sand Rating · Duna", "Run your volleyball club · Duna", "Duna Pro for coaches",
  "Pricing · Duna", "Pro Tour · Duna". Descriptions under 155 characters, plain.
- JSON-LD: `Organization` + `WebSite` with `SearchAction` (target `/discover?where={q}`) on home;
  `SportsActivityLocation` for clubs and public courts (`/clubs/[slug]`, `/venues/[id]`); `SportsEvent`
  for events and sessions with `offers` only when a price is public; `Product` / `Offer` for plans on
  `/pricing` only from plan tables; `BreadcrumbList` on detail pages; `FAQPage` for the pricing FAQ.
- Social cards: dynamic OG images (`/api/og/[template]`) in the brand: Night Court ground, the line, Jost
  title, one concept (rating ring for players, open game for clubs and events). Markdown companions for
  every new page; `/agents` and `llms.txt` list the new routes.

---

## 3. Page specs with copy

### 3.1 Home `/`

1. Header: Crest + wordmark; Find a game, Add a score, For clubs, For coaches, Pro Tour, Pricing; "I play
   / I run a club"; Sign in; primary CTA by audience.
2. Hero. Eyebrow "Beach and indoor volleyball". Title "Meet you at the net." Lead "Find a game tonight,
   keep score on your phone, and watch your Sand Rating grow. Clubs and coaches run their whole week on
   Duna." Search card. Links "Played somewhere? Add your score", "Run a club or coach? Start free". Photo
   with Sand Rating card: "After tonight", chip "Confirmed by both sides", ring 3.20 ▲ +0.08, stats
   Matches 23, Won 14, Next half 3.50 (live site: the visitor's own numbers when signed in; signed-out,
   the card shows a labelled example).
3. Rail. Label "Near [place] this week", heading "There's a game near you.", "See all N", six session
   cards (when, title, club mark and name, faces, "Needs N more", level, price).
4. Story. Label "For players", heading "From finding a game to knowing your level." Steps:
   "Where, when, what. Then you're in." / "Keep score with one hand." / "Get your Sand Rating." / "Watch
   it back with your heart rate." (body copy as in the prototype).
5. Honeypot band. "No account needed" / "Played somewhere we don't know yet?" / "Add the court and your
   score. You'll see where your Sand Rating starts, and you can save it to your name when you're ready."
   Three steps; button "Add a score".
6. Clubs chapter. Label "For clubs and coaches", heading "The same game, from the other side of the
   net.", line "Every game a player finds is a session a club ran. Bookings, payments, plans and people sit
   in one place, and you approve every change." Four tiles (Memberships, Bookings, Programs and drills,
   Ask Duna). Buttons "See everything Duna runs", "Pricing".
7. Pricing teaser. "Free to start, on both sides of the net." Two cards from plan tables.
8. Apps. "Two apps. One game." Duna and Duna Pro.
9. Quote slot (rendered only when the owner supplies a real quote with permission).
10. Close. "Better by the next rally." Find a game / Start your club free.
11. Footer: Play, Run, Watch, Duna columns; "Every court. Every coast."

### 3.2 `/discover`

Title "Games near [place]"; the search bar inline (three columns on desktop); result rows (photo or club
mark, when, title, club, price, "Needs N more"); side notes "Not seeing your court?" (to `/add-score`) and
"How this search works". Map view toggle (existing map). Empty: "No games match in [place] [when]." with
"Search any time" and "Add a court and score".

As built (SITE-4, 28 November 2026): `/discover` and `/venues/[venueId]` in `app/(next)/(site)`, with
signed-in twins `/app/discover` and `/app/venues/[venueId]` in the Player shell, all on
`components/discover/**`. The address is the search (`components/discover/search-state.ts` documents
every parameter and still reads the old `/discover/results` and `/discover/map` query strings, which
308 to `/discover` unchanged, the map one with `view=map`). Results are server-rendered from
`public.discoveryMap`, grouped by day then time, with the price all-in, the group state from
`participationDisplay` and the light from the sun; the map (lazy, clustered, satellite close in,
"Search this area") sits beside the list on wide screens and under a three-detent sheet on phones.

### 3.3 `/add-score`, 3.4 `/run-your-club`, 3.5 `/coaches`, 3.6 `/pricing`, 3.7 `/pro`

Copy exactly as in the prototype views of the same names (all strings there are final candidates), with
sections as described in 2.5 to 2.8. `/pro` keeps today's live data and sections ("Volleyball World",
"Latest match updates") re-set in the new system with the scorekeeper concept showing a real live match
when one exists, otherwise the next scheduled match (never a fake live score).

---

## 4. Components

Reused from `@duna/ui/tideline`: Button, IconButton, Segmented, Tabs, Field, Input, NumberInput, Select,
Combobox, Dialog, Sheet, Popover, Tooltip, toast, DayStrip, Calendar, DatePicker, Avatar, AvatarStack,
PlayerSlot, Chip, FilterChip, Badge, Card, Surface, EmptyResults, ErrorState, NotConfigured,
OfflineBanner, Skeleton, Stepper, Progress, Rise, Rally, Cross, NumberChange, AnimatedList,
PageTransition, CrestMark, Wordmark, Conditions, ConditionsLine, SunArc, LightMark, MoneyInput,
ProposalCard, RallyLoader, MicroRally, `DunaMark`, `DunaLogo`.

Specified but not built (build them in the design system, not the site): SiteHeader, SiteFooter, PlanCard,
RatingRing (two-ring spec), NetScore, ClubMark, Photo, SectionHeading, StoreBadge, SmartBanner, SearchBar,
WherePicker, WhenPicker, WhatPicker, SearchSheet, ResultChips.

New marketing components (in `apps/web/components/site/`, design-system imports only):

| Component           | Props                                                          | Behaviour                                                                                                 |
| ------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `NetLine`           | `label`, `chip?`                                               | Label, hairline with post, optional chip; line Rises (scaleX) once in view                                |
| `PhotoStage`        | `image` (avif/webp set), `poster`, `video?`, `focal`, `credit` | Rounded frame; video only after `load`, not on save-data or reduced motion; Pause control; credit line    |
| `GlassCard`         | `children`, `placement`                                        | Glass style 2.9; positions bottom-right, centre or top                                                    |
| `ConceptRating`     | `from`, `to`, `progress`, `reliability`, `provisional?`        | Wraps RatingRing; counts on view                                                                          |
| `ConceptScore`      | `teams`, `score`, `live?`, `autoplay`                          | Wraps NetScore; tappable points; four-rally autoplay                                                      |
| `ConceptOpenGame`   | `session`, `view: player                                       | club`                                                                                                     | Faces fill, status text, bar; club view adds collected |
| `ConceptMemberPass` | `card`, `pass`                                                 | Flip on view; button semantics; Enter flips                                                               |
| `ConceptDrill`      | `scene` (drill scene model), `plan`                            | SVG court; Cross players; plan list                                                                       |
| `ConceptCoachDay`   | `sessions`, `conditions`                                       | ConditionsLine + list                                                                                     |
| `ConceptAskDuna`    | `proposal`                                                     | ProposalCard in glass; buttons confirm in place                                                           |
| `ConceptSiteEdit`   | `before`, `after`, `request`                                   | Typing request, headline swap                                                                             |
| `ConceptFilm`       | `markers`, `heartRate`                                         | Draws the line                                                                                            |
| `StoryScroller`     | `steps[]`                                                      | Sticky media column on desktop, inline media on phones; active step = heading nearest the viewport centre |
| `SessionRail`       | `sessions[]`                                                   | Horizontal snap list, keyboard scrollable                                                                 |
| `HoneypotBand`      | -                                                              | Section 3.1 item 5                                                                                        |
| `FeeCalculator`     | plan tables                                                    | Section 2.8                                                                                               |
| `AudienceSwitch`    | -                                                              | Header switch; persists; changes CTA only                                                                 |
| `ThumbBar`          | `audience`                                                     | Phone CTA after 420 px                                                                                    |
| `QuoteSlot`         | `quote?`                                                       | Renders nothing without a real, approved quote                                                            |

## 5. Assets and licences

Generated with Higgsfield, model `nano_banana_2_1` (2k), 2 credits each; clips with `seedance_2_5`
(omni_reference, 5 s, 720p, no audio), 35 credits each. Total spent: 94 credits (balance before: 2,417).
Owned by the account holder under the provider's terms; generated people are fictional and
non-identifiable; no logos or text. SITE-1 must add each row to
`apps/web/public/media/brand/imagery-log.json`.

| File (prototype `media/`) | Job id                               | Prompt intent (full prompts in the job records)                                                                  |
| ------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `hero-portrait`           | 85f8a76a-5130-4269-9122-33d3b77035c1 | Female beach player resting between rallies, rim light, sand on shoulder, subject left, net blurred right; 85 mm |
| `beach-attack`            | 6e7cac07-2409-4931-a465-da30ed5f5fca | Doubles attack over block at golden hour, regulation net, side-on; 35 mm                                         |
| `partners-lowfive`        | 6ca68ae4-fca6-49e6-8d3c-df47f319f50a | Two partners low-five after a point, sand on knees; 50 mm                                                        |
| `indoor-serve`            | 30012d6f-cce9-4f93-b344-1ac464d35950 | Jump serve in a community gym at night, hardwood glow                                                            |
| `indoor-setter`           | f881c747-2f09-43ad-baea-55b93365cec5 | Setter's hands releasing the ball, finger tape; 85 mm                                                            |
| `coach-morning`           | 7906d958-d80a-4d25-9246-72ecb22161d2 | Female coach demonstrating a platform to two adults, morning haze                                                |
| `coach-portrait`          | 39a4a29e-b427-4dfa-b3bd-df9361648690 | Male coach by a net pole with ball bag (placeholder for owner photo)                                             |
| `friends-walk`            | c621b5dd-6001-4c3e-a212-b7bfe6670c37 | Four friends walking to the nets at sunset                                                                       |
| `courts-first-light`      | 4da0872a-8e17-427a-8bc5-e31d2c507b66 | Empty beach courts at first light, no people                                                                     |
| `dig-spray`               | 98029778-9fca-4e38-8e85-bfceb273bfcc | Diving dig, sand arc frozen; 70 mm                                                                               |
| `indoor-huddle`           | 64e5ce36-75de-43fe-b0ac-5fb54259cd1a | Adult rec team huddle between sets, coach with clipboard                                                         |
| `watch-rest`              | 5d7283de-093c-4e50-b100-187c67448123 | Player on the sand checking a blank watch, face out of frame                                                     |
| `hero-loop.mp4`           | e435f10c-4c44-4fe8-b194-98ff4c78bd86 | Near-still breathing loop from `hero-portrait`                                                                   |
| `attack-loop.mp4`         | c39c9de5-386d-4e54-8943-9e5800a700d2 | Slow-motion attack from `beach-attack`                                                                           |

Common grade suffix used in every prompt: "warm sand highlights, deep blue-teal shadows, lifted blacks,
muted, film grain. No text, no logos, no watermark."

BeachElite assets (`/Users/journeysuttonm5max/Duna Project Worktrees/beachelite-org/public`): `coaches/*`
(real coaches John, Ola, Violeta, Taylor, Spencer, Adriano: profile and action photos), `media/hero-john*.jpg`,
`media/*-athlete.webp`, `media/*-coach.webp`, `media/film/*` (scroll-film frames of real people). They are
real, identifiable people and belong to BeachElite's site; the existing Higgsfield characters in the
account ("John Sutton", "Coach Violeta", "Coach Ola") are those same real people. Neither was used: the
brief bars real likenesses in generated work and Duna's site must not imply they are Duna members. They
are good candidates for the owner's coach photo slots once each person approves use on duna.coach.

Owner photo slots: coaches hero (`/coaches`), clubs hero, quote portrait, about page. Needed: 3 to 6
high-resolution coach photos (beach and indoor, one portrait each, signed releases).

## 6. Performance budgets (phone on 4G, Moto G-class)

- Largest Contentful Paint under 2.0 s (the hero title or the hero poster); hero poster at most 60 KB at
  800 w (the prototype's is 14 KB) and 150 KB at 1600 w, AVIF first, WebP fallback, `fetchpriority=high`.
- First view total transfer under 450 KB: HTML + CSS under 60 KB compressed, JS for the first view under
  90 KB compressed (search and the hero ring only; concepts lazy-load per section), two font files
  subset (Jost 500 Latin, Geist variable Latin) under 80 KB, poster.
- CLS under 0.05 (all media sized; fonts with size-adjusted fallbacks). INP under 200 ms.
- Video: never before `load`, never on save-data, 2G or reduced motion, never with sound (no audio
  track), H.264 CRF 30 at 720 p, under 500 KB per 5 s loop (prototype: 122 KB and 435 KB), paused when
  off-screen or the tab is hidden.
- Images below the fold `loading=lazy`, `decoding=async`, responsive `srcset` at 800 and 1600 w.
- Accessibility: WCAG 2.2 AA; full keyboard paths for search, flow and pricing; skip link; landmarks;
  every concept has a text equivalent; motion is skippable by scrolling (nothing blocks scroll).

## 7. Needs API

1. **Search (B10)**: implement `public.search.suggest({ text, near? })` returning clubs and public courts
   with mark, kind and area (fuzzy, as in 2.3) and `public.search.query({ where, when, what })` returning
   sessions with `needs`, `lockAt`, price and surface. Read replica eligible.
2. **Places**: rate limit `/api/places/*` per IP and per session (none today); session tokens; region
   bias from the request; cache autocomplete for 24 h by normalized text.
3. **Honeypot**: `public.scoreDraft.create` (no auth: place or new-court fields, sets, format, type,
   names, optional contacts, agreement, device id, idempotency key) returning a draft id and an estimate
   with uncertainty; `public.scoreDraft.estimate`; `player.claimScoreDraft` (signed in: converts the draft
   to a `recordCompletedMatch`, sends confirm links). Bot challenge on claim only. Drafts expire in 7 days;
   contacts are deleted after the link is sent.
4. **Venue suggestions**: `venue_suggestions` table, promotion rule (2.5), staff review queue in HQ,
   `public.venue.listing` for player-suggested courts.
5. **Pricing data**: a public read of plan tables (`public.plans`) so pricing never hardcodes numbers;
   fee policy version and "final" flag for the draft notice.
6. **Signed-out examples**: a small public "example session" feed per region for the rail when no real
   sessions exist; otherwise the rail shows the empty state with "Add a court and score".

## 8. Build packages (one pull request each)

| Id      | Scope                                                                                                                                                                                          |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SITE-1  | Site shell in `apps/web/app/(next)`: SiteHeader (AudienceSwitch), SiteFooter, ThumbBar, NetLine, PhotoStage, GlassCard, tokens for glass; imagery-log rows; fonts; View Transitions            |
| SITE-2  | Home `/`: hero, rail, StoryScroller, concepts (rating, score, open game, film), honeypot band, clubs chapter, teaser, apps; delete the old `audience-home` and its styles; `/players` redirect |
| SITE-3  | Search: SearchBar, WherePicker, WhenPicker, WhatPicker, SearchSheet in the design system; `/discover` results; B10 seam implementation; Places rate limits                                     |
| SITE-4  | Honeypot `/add-score` + scoreDraft API + venue suggestions + HQ review queue                                                                                                                   |
| SITE-5  | `/run-your-club` rebuild (modules, concepts member pass, drill, Ask Duna, site edit), feature-page redirects                                                                                   |
| SITE-6  | `/coaches` (Duna Pro) and `/apps`; owner photo slots                                                                                                                                           |
| SITE-7  | `/pricing` with plan tables read from core, FeeCalculator, FAQ; `/run-your-club#plans` links                                                                                                   |
| SITE-8  | Public detail pages in the new shell: club, event, venue, coach, player profile; remove misleading zero counts                                                                                 |
| SITE-9  | `/pro` Pro Tour and team pages in the new system; `/sand-rating` (absorbs `/methodology`)                                                                                                      |
| SITE-10 | SEO: titles, JSON-LD (2.12), dynamic OG templates, sitemap, Markdown companions, `/agents`, `llms.txt`, redirect map                                                                           |

## 9. Owner decisions needed

1. `/pro` stays the Pro Tour (this spec) or becomes the coach app.
2. Prices and fees: confirm the plan table, the 7.5% service fee, the $200 website add-on, and who bears
   card processing on the service fee.
3. The provisional estimate on `/add-score` (deviation from brand book §4).
4. Coach photos (3 to 6, with releases) and permission to use BeachElite coaches on duna.coach.
5. Real quotes and one real club result, with permission, for the two slots.
6. App Store links for Duna and Duna Pro.
