# Persona journeys

Dated 27 November 2026 (work package Q0). What a club owner, a coach, a parent,
a player, a facility owner and a new visitor come to Duna to do, written as
end-to-end journeys. Each step names the surface it runs on, the work packages
in [`web-hq-backend.md`](web-hq-backend.md) and [`mobile.md`](mobile.md) that
deliver it (mobile ids carry the `M-` prefix), and its status on `main`.

Every web step is a test in `tests/e2e/personas/<persona>.spec.ts` with the same
id. The quality bar each step must meet is
[`definition-of-done.md`](definition-of-done.md).

**Status.** **Main**: the step's test passes in demo mode on `main` today
(where only the entry point works, the step says so and the next step is
planned). **Planned**: a `test.fixme` names the package that makes it pass.
**Gap**: no package delivers it; the orchestrator assigns one. **Native**: a
Player or Pro app step, verified by the simulator matrix (no device harness
yet).

**Surfaces.** HQ (`apps/hq`), Web (public site and Player web, `apps/web`),
Player (the Player app), Pro (the Pro app), Watch.

## Coverage today

Run `pnpm test:personas:coverage` for the current table (add `--gaps` for the
unassigned steps, `--owner <id>` for one package's steps). At Q0:

| Persona                          | Passing on main | fixme (planned) | of which gaps | Total   |
| -------------------------------- | --------------- | --------------- | ------------- | ------- |
| Club owner / director            | 14              | 27              | 0             | 41      |
| Coach                            | 6               | 13              | 0             | 19      |
| Parent or guardian with a junior | 4               | 11              | 6             | 15      |
| Adult player                     | 10              | 12              | 0             | 22      |
| Facility owner                   | 2               | 7               | 1             | 9       |
| New visitor (no account)         | 10              | 2               | 0             | 12      |
| **All**                          | **46**          | **72**          | **7**         | **118** |

Native steps are listed below and are not counted in the table.

## Club owner / director (CO)

Runs a club: sets it up, takes money, publishes what the club offers, builds
the team, talks to members. Lives in HQ on a laptop and in Pro on the phone.

### CO-1 Sign up and open the club's workspace

| Step   | The person does → expected result                                                                              | Surface | Packages | Status  |
| ------ | -------------------------------------------------------------------------------------------------------------- | ------- | -------- | ------- |
| CO-1.1 | From "Run your club", reaches sign-up → "Create my Duna account" and "Sign in" are offered                     | Web     | P2       | Main    |
| CO-1.2 | Creates the account and names the organisation → lands in HQ's first run with the organisation in the switcher | Web, HQ | S1       | Planned |
| CO-1.3 | Opens HQ's first run → "Start your Duna workspace."                                                            | HQ      | S2, H11  | Main    |

### CO-2 Set up the club from its website

| Step   | The person does → expected result                                                                             | Surface | Packages | Status  |
| ------ | ------------------------------------------------------------------------------------------------------------- | ------- | -------- | ------- |
| CO-2.1 | Enters the club's website → Duna reads it (Rally loader) and proposes name, hours, places, offerings, socials | HQ      | B1, H11  | Planned |
| CO-2.2 | Reviews each proposal with Keep, Edit or Skip → nothing applies until confirmed; Edit opens the same SpecForm | HQ      | H11      | Planned |
| CO-2.3 | Opens Club setup → a readiness list, one decision at a time, with "Set up payments"                           | HQ      | H11      | Main    |

### CO-3 Connect payments (Duna Pay)

| Step   | The person does → expected result                                                                          | Surface | Packages | Status  |
| ------ | ---------------------------------------------------------------------------------------------------------- | ------- | -------- | ------- |
| CO-3.1 | Opens Duna Pay setup from Money → "Configure money once." with a secure link button                        | HQ      | H10      | Main    |
| CO-3.2 | Completes verification in the embedded onboarding → one of six statuses; "not configured yet" without keys | HQ      | B2, H10  | Planned |
| CO-3.3 | Chooses the payout schedule and refund policy → saved inline with a toast; `[club policy]` until written   | HQ      | H10      | Planned |
| CO-3.n | Same on the phone: payments status and payouts                                                             | Pro     | M-R4     | Native  |

### CO-4 Add places and courts

| Step   | The person does → expected result                                                  | Surface | Packages | Status  |
| ------ | ---------------------------------------------------------------------------------- | ------- | -------- | ------- |
| CO-4.1 | Starts adding a venue by describing it or by hand → both paths offered             | HQ      | H11      | Main    |
| CO-4.2 | Saves the venue and adds courts → the venue's Courts tab lists them                | HQ      | H11      | Planned |
| CO-4.3 | Sets opening hours, layout and court orientation → orientation feeds wind on court | HQ      | H11, B11 | Planned |

### CO-5 Publish a lesson and a program

| Step   | The person does → expected result                                                              | Surface | Packages | Status  |
| ------ | ---------------------------------------------------------------------------------------------- | ------- | -------- | ------- |
| CO-5.1 | Creates a private lesson offering with price (minor units + currency) and capacity             | HQ      | H9       | Planned |
| CO-5.2 | Publishes it → tier 1 confirm; blocked with the reason while Duna Pay is not ready             | HQ      | H10, S4  | Planned |
| CO-5.3 | Creates a training program from a sentence → proposal with weekdays, times, coaches, blackouts | HQ      | B4, H6   | Planned |
| CO-5.4 | Publishes the program with its linked offering                                                 | HQ      | H6       | Planned |
| CO-5.5 | Sees the lesson and the program on the public club page                                        | Web     | P4       | Planned |
| CO-5.n | Creates an offering or session from the phone                                                  | Pro     | M-R4     | Native  |

### CO-6 Invite a coach

| Step   | The person does → expected result                                                            | Surface | Packages | Status  |
| ------ | -------------------------------------------------------------------------------------------- | ------- | -------- | ------- |
| CO-6.1 | Starts an invitation: name, role, worker classification, delivery (private link by default)  | HQ      | H5       | Main    |
| CO-6.2 | Creates the link, or sends by email or text after a tier 1 confirm → per-person delivery row | HQ      | H5, B7   | Planned |
| CO-6.3 | The coach accepts → shows as active in Team                                                  | HQ      | H5       | Planned |

### CO-7 See a booking arrive

| Step   | The person does → expected result                                                          | Surface | Packages   | Status  |
| ------ | ------------------------------------------------------------------------------------------ | ------- | ---------- | ------- |
| CO-7.1 | Opens Today → today's sessions with "n of m joined"                                        | HQ      | H1         | Main    |
| CO-7.2 | Opens Schedule → day by court and by coach                                                 | HQ      | H2         | Main    |
| CO-7.3 | A new booking arrives as a notification and lands in Today without a reload (Rally insert) | HQ      | S1, H1     | Planned |
| CO-7.n | The booking appears on the Pro Today and as a Live Activity for the next session           | Pro     | M-R1, M-K2 | Native  |

### CO-8 Message the roster

| Step   | The person does → expected result                                              | Surface | Packages | Status  |
| ------ | ------------------------------------------------------------------------------ | ------- | -------- | ------- |
| CO-8.1 | Opens Inbox → the club's threads with search                                   | HQ      | H3       | Main    |
| CO-8.2 | Writes to a session's roster from the Send card, channels per person           | HQ      | H3, B7   | Planned |
| CO-8.3 | Confirms "Send to N people" (tier 1) → single-flight send, per-person delivery | HQ      | H3       | Planned |
| CO-8.n | Same from the phone, with the AI review gate kept                              | Pro     | M-R3     | Native  |

### CO-9 Refund a booking

| Step   | The person does → expected result                                                                                 | Surface | Packages | Status  |
| ------ | ----------------------------------------------------------------------------------------------------------------- | ------- | -------- | ------- |
| CO-9.1 | Finds the payment in Money › Transactions → searchable, sortable table                                            | HQ      | H10      | Main    |
| CO-9.2 | Opens the transaction → its detail page                                                                           | HQ      | H10      | Main    |
| CO-9.3 | Refunds with a tier 2 confirm restating amount, person and consequence → idempotent refund, toast, refunded state | HQ      | H10, B2  | Planned |
| CO-9.4 | The person is told, and the refund shows in their wallet                                                          | Web     | B7, P6   | Planned |
| CO-9.n | Refunds from the phone with the same tier 2 confirm                                                               | Pro     | M-R4     | Native  |

### CO-10 See a payout

| Step    | The person does → expected result                        | Surface | Packages | Status  |
| ------- | -------------------------------------------------------- | ------- | -------- | ------- |
| CO-10.1 | Opens Money → balance, payout rhythm, "Request a payout" | HQ      | H10      | Main    |
| CO-10.2 | Opens a payout → arrival date and the payments in it     | HQ      | H10, B2  | Planned |

### CO-11 Ask Duna to do it

| Step    | The person does → expected result                                        | Surface | Packages | Status  |
| ------- | ------------------------------------------------------------------------ | ------- | -------- | ------- |
| CO-11.1 | Today offers "What would you like Duna to do?"                           | HQ      | H1       | Main    |
| CO-11.2 | Opens Ask Duna as a docked panel from the top bar or ⌘J                  | HQ      | S1       | Planned |
| CO-11.3 | Ask Duna fills the same form a person uses; applies only after a confirm | HQ      | S4       | Planned |

### CO-12 Grow: reports, marketing and the website

| Step    | The person does → expected result                                           | Surface | Packages | Status  |
| ------- | --------------------------------------------------------------------------- | ------- | -------- | ------- |
| CO-12.1 | Opens Reports                                                               | HQ      | H13      | Main    |
| CO-12.2 | Sends a campaign to an audience after a tier 1 confirm restating the count  | HQ      | H13      | Planned |
| CO-12.3 | Changes the website, previews it and publishes after a confirm; Undo exists | HQ      | B8a, H12 | Planned |

### CO-13 Identity chrome and access

| Step    | The person does → expected result                                                   | Surface | Packages | Status  |
| ------- | ----------------------------------------------------------------------------------- | ------- | -------- | ------- |
| CO-13.1 | Switches organisation; creates a new one from the switcher                          | HQ      | S1       | Planned |
| CO-13.2 | A coach or player who opens an owner page sees "You need access", not an error page | HQ      | S1       | Planned |

### CO-14 Pay the team

| Step    | The person does → expected result                         | Surface | Packages | Status  |
| ------- | --------------------------------------------------------- | ------- | -------- | ------- |
| CO-14.1 | Runs a pay period for coaches and exports it (idempotent) | HQ      | B3b, H5  | Planned |

## Coach (CH)

Teaches sessions, runs practices, scores matches, writes to players and
parents, gets paid. Mostly on the phone (Pro, Watch); plans in HQ.

| Step   | The person does → expected result                                                          | Surface    | Packages   | Status  |
| ------ | ------------------------------------------------------------------------------------------ | ---------- | ---------- | ------- |
| CH-1.1 | Sets weekly availability with effective dates → autosaved draft; conflicts named           | HQ         | B3a, H5    | Planned |
| CH-1.2 | Adds time off and a blackout → sees what it uncovers and suggested substitutes             | HQ         | B3a, H5    | Planned |
| CH-1.n | Sets availability and blackouts on the phone                                               | Pro        | M-R5       | Native  |
| CH-2.1 | Opens Today → the day's sessions                                                           | HQ         | H1         | Main    |
| CH-2.2 | Opens Schedule by coach                                                                    | HQ         | H2         | Main    |
| CH-2.n | Opens Pro Today: agenda by court and by coach, one-line conditions, light icon by the time | Pro        | M-R1       | Native  |
| CH-3.1 | Opens the session from Today → its operations page                                         | HQ         | H2         | Main    |
| CH-3.2 | Checks players in → tier 0 with Undo; the roster count Rallies                             | HQ         | H2         | Planned |
| CH-3.n | Checks in courtside on the phone, offline-tolerant                                         | Pro        | M-R2       | Native  |
| CH-4.1 | Scores a match point by point from the session → NetScore, one state per match status      | HQ         | H2, C1     | Planned |
| CH-4.2 | Finishes the match and publishes the result after a confirm                                | HQ         | H9         | Planned |
| CH-4.n | Scores on the phone (live zone) or on the Watch (swipe up / down, left to undo; unchanged) | Pro, Watch | M-R2, M-P7 | Native  |
| CH-5.1 | Writes an after-practice note for the program                                              | HQ         | H6         | Planned |
| CH-5.2 | Messages a player or a parent about a session                                              | HQ         | H3         | Planned |
| CH-5.n | Writes notes and messages from the phone (voice notes kept)                                | Pro        | M-R3       | Native  |
| CH-6.1 | Sees sessions, pay period and expected pay                                                 | HQ         | H5, B3b    | Planned |
| CH-6.2 | Receives contractor payouts to their own connected account                                 | HQ         | B3c        | Planned |
| CH-6.3 | Opens Money without permission → "You need access", not an error page                      | HQ         | H10        | Planned |
| CH-6.n | Gets paid on the phone: Tap to Pay for a lesson (hidden where unsupported), see pay        | Pro        | M-R4       | Native  |
| CH-7.1 | Opens the practice plan builder                                                            | HQ         | H7         | Main    |
| CH-7.2 | Starts a drill from a description                                                          | HQ         | H8         | Main    |
| CH-7.3 | Builds a plan with totals, diagrams, coach mode; prints it with diagrams                   | HQ         | H7, B6b    | Planned |
| CH-7.4 | Creates a drill with AI placing the players; edits and versions it                         | HQ         | B6d, H8    | Planned |
| CH-7.n | Runs coach mode and the 2D drill player on the phone or iPad                               | Pro        | M-R6       | Native  |
| CH-8.1 | Opens Training on their programs                                                           | HQ         | H6         | Main    |
| CH-8.2 | Opens a program's Roster and Schedule tabs (deep-linkable)                                 | HQ         | H6, S3     | Planned |

## Parent or guardian with a junior (PA)

Books and pays for a junior, hears from the coach, decides what is shared, and
cancels when plans change. Mostly in the Player app, sometimes on the web.

| Step   | The person does → expected result                                                                                  | Surface     | Packages | Status  |
| ------ | ------------------------------------------------------------------------------------------------------------------ | ----------- | -------- | ------- |
| PA-1.1 | Opens Settings › Household → "Add dependent" offered                                                               | Web         | none     | Main    |
| PA-1.2 | Adds a junior's private profile with consent recorded → "Pending review", toast                                    | Web         | none     | **Gap** |
| PA-1.3 | Invites a second guardian who accepts by link (`/join/guardian/[token]` exists)                                    | Web         | none     | **Gap** |
| PA-1.n | Manages the family in the app (profile and organisation screens)                                                   | Player      | M-P6     | Native  |
| PA-2.1 | Opens a session's checkout                                                                                         | Web         | P5       | Main    |
| PA-2.2 | Chooses the junior as the participant                                                                              | Web         | none     | **Gap** |
| PA-2.3 | Pays once (single-flight, idempotency key) → the junior's session appears in Next up                               | Web         | P5, B2   | Planned |
| PA-2.n | Books lessons and events for the junior in the app                                                                 | Player      | M-P3b    | Native  |
| PA-3.1 | Opens messages                                                                                                     | Web         | P7       | Main    |
| PA-3.2 | Receives a coach's message tied to the junior's session; replies                                                   | Web         | P7, B7   | Planned |
| PA-3.3 | Chooses how to be reached per club (app, email, text)                                                              | Web         | P7       | Planned |
| PA-3.n | The same in the app's Concierge                                                                                    | Player      | M-P5a    | Native  |
| PA-4.1 | Approves or declines sharing the junior's health data with the coach (owner decision pending, `HEALTH_PRIVACY.md`) | Web, Player | none     | **Gap** |
| PA-5.1 | Cancels the junior's booking within the club's policy after a tier 1 confirm stating the refund                    | Web         | none     | **Gap** |
| PA-5.2 | Sees the refund with its amount and where it went                                                                  | Web         | P6       | Planned |
| PA-6.1 | Signs the club's waiver for the junior before the first session (`/waivers/complete` exists)                       | Web         | none     | **Gap** |
| PA-7.1 | Opens Home → Next up first                                                                                         | Web         | P1       | Main    |
| PA-7.2 | Next up includes the junior's sessions, labelled with the junior's name                                            | Web         | P1       | Planned |
| PA-7.n | The family's next session as a widget and Live Activity                                                            | Player      | M-K2     | Native  |

## Adult player (PL)

Finds a game, books a court with friends, plays and records the result,
watches the rating move, watches film, manages membership and wallet.

| Step   | The person does → expected result                                                                | Surface       | Packages    | Status  |
| ------ | ------------------------------------------------------------------------------------------------ | ------------- | ----------- | ------- |
| PL-1.1 | Opens Home → direct actions and Next up first, no layout jump                                    | Web           | P1          | Main    |
| PL-1.2 | Searches by where, when and what (sheets open and close)                                         | Web           | P3, C6      | Main    |
| PL-1.3 | Filters results to courts                                                                        | Web           | P3          | Main    |
| PL-1.4 | Sees results on the map: pins by zoom, satellite at the last three zooms                         | Web           | P3, C3      | Planned |
| PL-1.n | Finds play in the app: search sheet, list and map                                                | Player        | M-P2        | Native  |
| PL-2.1 | Opens a venue and picks day, time and duration (today: "Online rental details are coming soon.") | Web           | P5          | Planned |
| PL-2.2 | Adds friends to the booking                                                                      | Web           | P5          | Planned |
| PL-2.3 | Splits the payment → tier 2 confirm restating each share; idempotency key per intent             | Web           | P5, B2      | Planned |
| PL-2.4 | The confirmed booking Rises in and appears in Next up                                            | Web           | P5          | Planned |
| PL-2.n | Books a court in the app (day strip, slots, durations, light, weather), Apple Pay                | Player        | M-P3a       | Native  |
| PL-3.1 | Hosts a pickup and publishes it → "… is live."                                                   | Web           | P5          | Main    |
| PL-3.2 | Joins an event through checkout → secure payment hand-off explained                              | Web           | P5          | Main    |
| PL-4.1 | Starts recording a finished result (scores per set)                                              | Web           | P8          | Main    |
| PL-4.2 | Records the match once everyone agreed → single-flight; per-set scores; green "Won" check        | Web           | P8          | Planned |
| PL-4.3 | Sees the rating change per match in history                                                      | Web           | P8          | Main    |
| PL-4.4 | Sees the rating ring with the new rating and progress to the next half point                     | Web           | P8, C1      | Planned |
| PL-4.n | Scores live on the phone or the Watch; rating and results in the app                             | Player, Watch | M-P4a, M-P7 | Native  |
| PL-5.1 | Opens the film library (today: "This page couldn't load")                                        | Web           | P9          | Planned |
| PL-5.2 | Shares a clip with a coach after a confirm                                                       | Web           | P9          | Planned |
| PL-5.n | Films, reviews with heart-rate overlay where data exists, shares; on-device clip titles          | Player        | M-P4b       | Native  |
| PL-6.1 | Opens the wallet → money, club credits, activity                                                 | Web           | P6          | Main    |
| PL-6.2 | Sees Premium with an honest checkout state                                                       | Web           | P6          | Main    |
| PL-6.3 | Keeps club membership cards in the wallet; renews or cancels (tier 1, states when access ends)   | Web           | P6          | Planned |
| PL-6.n | Membership cards and Apple Wallet in the app                                                     | Player        | M-P5b       | Native  |
| PL-7.1 | Opens messages                                                                                   | Web           | P7          | Main    |
| PL-7.2 | Uses Concierge threads tied to a booking, match or club                                          | Web           | P7, B7      | Planned |
| PL-8.1 | Sees health context around their game, only where data exists                                    | Web           | P9          | Planned |
| PL-8.n | Health in the app, read-only, hidden where HealthKit is unavailable                              | Player        | M-P4c       | Native  |

## Facility owner (FO)

Owns public or shared courts: lists them, decides who may play and when,
approves requests, stops play for weather.

| Step   | The person does → expected result                                                      | Surface | Packages | Status  |
| ------ | -------------------------------------------------------------------------------------- | ------- | -------- | ------- |
| FO-1.1 | Opens Venues → a workspace per venue                                                   | HQ      | H14      | Main    |
| FO-1.2 | Lists public courts as a facility with photos and hours                                | HQ      | B9, H14  | Planned |
| FO-2.1 | Sets access rules: approved players only, by hours or days                             | HQ      | B9, H14  | Planned |
| FO-2.2 | Links the facility's waiver to access                                                  | HQ      | H14      | Planned |
| FO-2.3 | Approves (tier 0, Undo) or declines (tier 1, player told) access requests              | HQ      | H14, B7  | Planned |
| FO-3.1 | Stops play on a court for weather → tier 2 confirm restating courts, time, people told | HQ      | H2, B9   | Planned |
| FO-3.2 | Sees conditions (wind on court, light) beside the court schedule                       | HQ      | H2, B11  | Planned |
| FO-3.n | Stops play from the phone at the court                                                 | Pro     | none     | **Gap** |
| FO-4.1 | A player finds the facility and requests access on the web                             | Web     | none     | **Gap** |
| FO-4.2 | Opens Today as the facility's operator                                                 | HQ      | H1       | Main    |

## New visitor with no account (VI)

Arrives from search or a link, looks around, decides to book or to run a
club, and signs up without losing their place.

| Step   | The person does → expected result                                                            | Surface | Packages   | Status  |
| ------ | -------------------------------------------------------------------------------------------- | ------- | ---------- | ------- |
| VI-1.1 | Opens the home page → leads with clubs; audience selector; no layout jump or sideways scroll | Web     | P2         | Main    |
| VI-1.2 | Chooses For Players → the player landing page with "Find a game"                             | Web     | P2         | Main    |
| VI-2.1 | Discovers play without signing in                                                            | Web     | P3         | Main    |
| VI-2.2 | Opens a public event page                                                                    | Web     | P2         | Main    |
| VI-2.3 | Opens a club's public page                                                                   | Web     | P4         | Main    |
| VI-2.4 | Reads the rankings                                                                           | Web     | P2         | Main    |
| VI-3.1 | Opens a public checkout → what happens next is explained                                     | Web     | P5         | Main    |
| VI-3.2 | Booking asks them to sign in and returns them to the same place                              | Web     | P1         | Planned |
| VI-4.1 | Opens sign-up → a secure account hand-off                                                    | Web     | P2         | Main    |
| VI-4.2 | After sign-up, onboarding asks who the account is for (me, my junior, my club)               | Web     | P1         | Planned |
| VI-4.n | Installs the app; first open (Crest sequence) and sign-in                                    | Player  | M-C6, M-P0 | Native  |
| VI-5.1 | A club organiser starts an event without an account                                          | Web     | P2         | Main    |
| VI-5.2 | A machine reads the Markdown companion of a public page (`/index.md`)                        | Web     | P2         | Main    |

## Gaps for the orchestrator

Steps no package in either plan delivers:

1. **Household on the web** (PA-1.2, PA-1.3): add a junior, invite a second
   guardian. The code exists (`HouseholdSettings`, `player.addDependent`,
   `/join/guardian/[token]`), but no package rebuilds or tests it.
2. **Booking for a junior** (PA-2.2): choosing a dependent as the participant
   in checkout. P5 rebuilds booking but does not name dependents.
3. **Health sharing consent for a junior** (PA-4.1): waits on the owner's
   `docs/HEALTH_PRIVACY.md` decision; then it needs a web and app owner.
4. **Player-side cancellation with refund** (PA-5.1, and the same for adult
   players): cancel within the club's policy. B2 owns refund policy, H10 the
   operator refund; nobody owns the player's cancel.
5. **Waivers for a junior** (PA-6.1): `/waivers/complete` exists; no package.
6. **Facility access from the player side** (FO-4.1): B9 adds
   `player.facility`; no web UI package requests access.
7. **Stop play from Pro** (FO-3.n): not in the Pro plan.

## Defects the checks found on `main`

Found in demo mode by the persona suite and its probe of every HQ and web route
for each persona. Each is recorded with its owner in
`tests/e2e/personas/support/known-issues.ts` or as the evidence in a `fixme`.

| Page                                  | Evidence                                                                                                       | Owner  |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------ |
| Every HQ page                         | `GET /api/ask-duna/conversations` answers 401 to the demo actor; the console logs an error on every page       | S1     |
| HQ `/messages`, web `/app/messages`   | `GET /api/messaging/updates` answers 503 in demo mode instead of an honest "live updates not configured" state | H3, P7 |
| Web `/discover/map`                   | `GET /api/mapbox/token` answers 503 without a token, instead of a normal "not configured yet" response         | C3     |
| HQ `/promo-codes`                     | "This page couldn't load": a Server Components error for every persona                                         | H13    |
| Web `/app/video`                      | "This page couldn't load": a Server Components error (React error 419 for the player)                          | P9     |
| HQ `/payments/*` as a coach           | "This page couldn't load" instead of a permission-denied state                                                 | H10    |
| Every HQ page as a player or guardian | "This page couldn't load" instead of "You need access" (a member who is not staff)                             | S1     |
| HQ `/training/practice-plans/create`  | Block search field has no accessible name                                                                      | H7     |
| HQ `/audiences`                       | Search field has no accessible name                                                                            | H13    |
| HQ `/ask`, `/account`                 | No main landmark                                                                                               | S1     |

Not counted as app defects: third-party CDN fonts (the legacy Satoshi and DM
Mono loads) failing to load in a sandboxed browser; F3 removes those loads.

## How the persona harness works

- **Run it.** `pnpm build`, then `CI=1 pnpm test:e2e --project=personas`
  (production servers, as CI runs it). Locally without `CI` it starts dev
  servers. It runs in the same `pnpm test:e2e` as the viewport suites, as its
  own Playwright project (`personas`, desktop 1440 × 900); the viewport
  projects ignore it. At Q0 it takes about 20 seconds with 4 workers once the
  servers are up (50 passing tests, 72 fixme).
- **Personas in demo mode.** Demo mode signs every request in as one actor
  (Mara Lewis, player + manager). The servers Playwright starts set
  `DUNA_DEMO_PERSONAS=enabled`; a test's `persona` option sets the
  `duna-demo-persona` cookie, and `packages/api/src/demo-persona.ts` gives the
  demo actor that persona's roles (`visitor` has no actor). It is honoured only
  without identity-provider credentials, in demo mode, with that variable, and
  never when `VERCEL_ENV=production`. The person and organisation stay the demo
  ones; parent journeys have no junior fixture yet.
- **Moves** (`support/moves.ts`): `openHqArea` and `openPlayerArea` navigate
  by the new information architecture (HQ areas map to today's routes through
  `packages/core/src/hq-routes.ts`; S2 updates one table), `openObjectTab`,
  `fillForm` by accessible names, `pressAndConfirm` for tiers none / confirm /
  strong (and "never two modals deep"), `expectToast`, `expectNoLayoutShift`
  (cumulative layout shift under 0.1), `expectNoHorizontalOverflow`.
- **Automatic checks** (`support/quality.ts`, `support/fixtures.ts`): every
  journey fails on an uncaught page error, an unhandled promise rejection, a
  console error, an app response with a 5xx status, a failed app request, or
  a duplicate mutation (the same method, path and body twice within 1.5 s).
  The page each passing step ends on is scanned for accessibility.
  `harness.spec.ts` proves each check catches what it should.
- **Accessibility scan.** Built from Playwright's accessibility tree (no new
  dependency): every button, link, field, tab, option, menu item and image has
  a name; the document has a language and a title; one main landmark. The full
  WCAG audit (contrast, ARIA rules) is a `fixme` in `harness.spec.ts`:
  recommended tool `@axe-core/playwright`, added by the lockfile owner.
- **Keeping it honest.** `fixme-owners.spec.ts` fails when a `test.fixme`
  names no package, names one that is not in the plans, or a step id is reused.
  A package that lands a feature removes its `fixme`, makes it pass, and never
  adds to `known-issues.ts` to get there.
