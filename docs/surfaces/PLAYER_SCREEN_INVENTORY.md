# Duna Player screen and journey inventory

This is the source-backed product map for redesigning the Duna Player app and
its companion Watch experience. It describes what a player can reach today,
what each surface is trying to solve, the states the current implementation
supports, and the handoffs between native Player, Duna Web, Apple system UI,
and Watch.

The inventory reflects the current `apps/player` implementation. It is not a
promise that every desirable state has a finished design. Items described as a
gap or handoff should remain visible during redesign rather than being assumed
away.

## How to use this document

For each redesign:

1. Preserve the user problem, authoritative data, and consequential-action
   boundaries named here.
2. Design every listed state, including loading, empty, offline, denied,
   pending, and recovery states—not only the populated happy path.
3. Preserve the named entry and exit routes unless the navigation model is
   intentionally changed everywhere that depends on it.
4. Keep server-owned outcomes server-owned. The client may present tournament
   standings, payment completion, eligibility, admission, and rating state; it
   must not infer them independently.
5. When a journey opens Duna Web or an Apple system surface today, label the
   redesign accordingly. Do not draw a native screen and accidentally imply it
   already exists.

### Surface vocabulary

| Term                   | Meaning in this inventory                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary screen         | A full app state selected by the Player app's internal screen state.                                                                        |
| Persistent dock action | One of the five controls visible at the bottom of normal Player screens.                                                                    |
| Modal                  | A blocking native page sheet or full-screen presentation above the current screen.                                                          |
| Sheet                  | A temporary action or choice surface that preserves the screen beneath it.                                                                  |
| Inline surface         | A substantial journey rendered inside another screen, such as Tournament Desk.                                                              |
| System surface         | WorkOS browser authentication, Stripe PaymentSheet, Apple permissions, Apple Wallet, Maps, Calendar, Share, or another OS-owned experience. |
| Web handoff            | A secure Duna Web route opened in the in-app browser because the capability is not fully native.                                            |

## Current navigation model

The visible dock and the internal screen state are not the same thing. The
dock has five actions; the app has fourteen logical primary screen states plus
modals and external handoffs.

### Persistent bottom dock

| Position | Current action | Selected treatment                                                                       | Destination today         | Important behavior                                                                           |
| -------- | -------------- | ---------------------------------------------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------- |
| 1        | Home icon      | Selected icon receives the glass selection treatment; no label                           | Home                      | Returns to the personal dashboard.                                                           |
| 2        | Calendar icon  | Selected on Plans                                                                        | Plans                     | Opens bookings, training, hosted matches, and calendar.                                      |
| 3        | Duna mark      | Center identity button, intentionally smaller than a conventional floating action button | Duna AI inside Messaging  | Opens the assistant space in the full-screen messaging shell.                                |
| 4        | Plus icon      | Momentary action; it is not a selected destination                                       | Quick Actions sheet       | Opens shortcuts for scoring, discovery, hosting, court booking, events, coaching, and video. |
| 5        | Message icon   | Selected on Messaging; unread badge when needed                                          | Messages inside Messaging | Opens the human-conversation space.                                                          |

The dock is hidden while the full-screen Messaging/Duna AI shell is open. A
dedicated close control exits that shell and returns to Home. Modals use their
own Back or Close treatment and return to the screen beneath them.

### Internal primary screens

| Internal state  | How it is reached today                                                                                      | Normal return                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| Home            | Cold start after account continuation; Home dock action; close Messaging                                     | Remains Home                                                      |
| Discover        | Home “Find your next game”; discovery-oriented quick actions; Plans “See all” hosted matches; live deep link | Home dock or another selected journey                             |
| Score upload    | Quick Actions; live event “Keep score”; Watch draft inbox                                                    | Performance after successful submission                           |
| Play launcher   | Legacy internal launcher; currently not a persistent dock destination                                        | Home through the dock                                             |
| Find coach      | Quick Actions or Duna AI coaching handoff                                                                    | Back currently returns to the internal Play launcher              |
| Plans           | Calendar dock; Home schedule action; booking deep link                                                       | Home dock                                                         |
| Training        | Plans training card                                                                                          | Back to Plans                                                     |
| Video           | Home/Quick Actions “Record game”; Profile Videos; event Record video; upload deep link; transfer banner      | Remains a full primary screen until another destination is chosen |
| Profile (“You”) | Home profile affordance                                                                                      | Home dock                                                         |
| Wallet          | Profile Wallet tile                                                                                          | Back to Profile                                                   |
| Predictions     | Profile Predictions tile; Wallet portfolio links                                                             | Back to Wallet                                                    |
| Health          | Profile Health tile; Performance health action                                                               | Back to Profile                                                   |
| Performance     | Home recent matches; Profile Performance tile; score-upload success                                          | Returns to Home or Profile according to its entry point           |
| Messaging       | Duna mark, message dock action, Home Messages, message deep link, notification                               | Dedicated close returns to Home                                   |

### Supported deep links

| Link shape                         | Destination                       | Recovery/notes                                                                                         |
| ---------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `duna://auth/callback`             | WorkOS mobile-auth callback       | Completes PKCE browser authentication; this is handled by the identity provider rather than `App.tsx`. |
| `duna://messages`                  | Message inbox                     | Opens the Messages mode.                                                                               |
| `duna://messages/{conversationId}` | Specific conversation             | Opens the named thread when available.                                                                 |
| `duna://messages/support`          | Duna AI/support conversation      | Opens the assistant mode.                                                                              |
| `duna://booking/{bookingId}`       | Plans plus Booking Management     | Keeps the booking modal above Plans.                                                                   |
| `duna://live/upload/...`           | Video                             | Used for video/upload context.                                                                         |
| `duna://live/upcoming/...`         | Home                              | Used for upcoming live activity context.                                                               |
| Other `duna://live/...`            | Discover                          | Used for live discovery context.                                                                       |
| `duna://waiver/complete?...`       | Secure Duna Web waiver completion | Opens the authenticated web completion route in an in-app browser.                                     |

## Global entry, identity, and runtime states

### 1. Cold-open film

- **Problem:** give every normal app launch a deliberate branded transition
  while the rest of the runtime becomes ready.
- **Current function:** an embedded full-screen film overlays the runtime for
  about 10.1 seconds; reduced-motion users receive the static poster.
- **States:** video playback, reduced-motion poster, completion.
- **Entry:** every mounted app launch in the current source.
- **Exit:** reveals whichever identity/runtime surface has prepared beneath
  it.
- **Redesign note:** the current implementation does not inspect an active
  session before showing the film. If active-session bypass is required, it is
  a functional change, not only a visual change.

### 2. Signed-out welcome

- **Problem:** explain Duna simply and separate new-account creation from
  returning login.
- **Current function:** auto-playing, muted, looping background video with a
  dark readability wash; Duna branding; Create your free account; Log in to
  Duna; reminder to reuse an existing member email or phone.
- **States:** background poster before first frame, playing video,
  reduced-motion poster, authentication error.
- **Entry:** launch with no WorkOS session; Use a Different Account from the
  returning-account screen.
- **Exits:** WorkOS sign-up or sign-in system browser.

### 3. WorkOS sign-in and sign-up

- **Problem:** authenticate securely without embedding provider secrets in the
  app.
- **Current function:** browser-based authorization-code flow with PKCE and
  secure token storage; organization selection remains part of WorkOS context.
- **States:** sign-in, sign-up, callback, cancelled browser, provider error,
  multiple-organization selection/switching.
- **Entry:** either welcome action.
- **Exit:** returning-account continuation after identity is available.

### 4. Returning account

- **Problem:** make an existing identity recognizable before loading the
  personalized app.
- **Current function:** profile image or initials, player name, Continue, Use a
  Different Account.
- **States:** image, initials fallback, account preparation spinner, account
  load error.
- **Entry:** authenticated launch before the player requests continuation.
- **Exits:** Continue loads Home; Use a Different Account signs out, clears the
  native cache and messaging registration, and returns to signed-out welcome.

### 5. Account sync and runtime recovery

- **Problem:** load one coherent player snapshot without making every screen
  own identity and global data fetching.
- **Current function:** loads dashboard, wallet, settings, predictions,
  training, people, venues, coaches, organization relationships, and discovery
  data; persists the last usable snapshot locally; refreshes when connectivity
  returns.
- **States:** loading, cached snapshot, live snapshot, offline with last sync,
  timeout, retryable sync failure, identity configuration missing, preview
  data mode.
- **Entry:** Continue and foreground/reconnect refresh.
- **Exit:** Home when a usable snapshot exists; centered Try Again state when
  it does not.

## Home and global utility

### 6. Home

- **Problem:** answer “What should I do next?” without forcing the player to
  understand the whole product map.
- **Current function:** greeting and market context; Find your next game;
  Record game, Book court, and Messages shortcuts; next booking; recent match
  outcomes; Sand Rating and home club; Duna insight.
- **States:** populated next booking, no upcoming booking, populated recent
  matches, no recorded matches, positive/negative rating delta, preview data,
  cached/offline runtime data.
- **Entry:** first app destination, Home dock, close Messaging, most global
  reset paths.
- **Connections:**
  - Find your next game → Discover/search.
  - Record game → Video.
  - Book court → Discover with court-booking intent.
  - Messages → Messaging.
  - Next booking → Booking Management.
  - See schedule → Plans.
  - Recent match row or View performance → Performance.
  - Profile/rating identity → Profile.
  - Duna insight → Duna AI.

### 7. Quick Actions sheet

- **Problem:** expose high-intent tasks without adding more persistent tabs.
- **Current function:** shortcuts for Upload score, Find a match, Create a
  match, Book a court, Join an event, Find a coach, Record a game, and Watch
  the pros.
- **States:** closed/open and pressed action.
- **Entry:** dock plus icon.
- **Exit:** dismiss to the current screen or route to Score, Discover, Pickup
  Host, Find Coach, Video, or Pro Tour. Book a court currently enters Discover
  with court-booking intent rather than opening Venue Finder directly.

### 7a. Legacy Play launcher

- **Problem:** collect the major “go play” jobs in one action-oriented screen.
- **Current function:** launcher cards for scoring, finding/hosting matches,
  court booking, joining events, finding coaches, recording, and pro coverage.
- **States:** static launcher and pressed action.
- **Entry today:** no dock or Home action opens it directly. It is currently
  reached when Back is pressed from Find Coach.
- **Exit:** the same destination handlers used by Home and Quick Actions.
- **Redesign note:** this overlaps the Quick Actions sheet and should be
  formalized as a real destination or removed with its Back path repaired.

### 8. Preview banner

- **Problem:** make demo data limitations unmistakable.
- **Current function:** states that sign-in and payment capabilities are
  disabled.
- **States:** shown on most non-Home/non-Messaging screens in preview mode;
  hidden in live mode.
- **Entry/exit:** passive global context, not a destination.

### 9. Video transfer banner

- **Problem:** let a long import/upload/processing job continue while the
  player uses other screens.
- **Current function:** title, detail, progress, stage, and a tap target back to
  Video.
- **States:** importing, uploading, processing, complete; timed dismissal for
  processing/complete.
- **Entry:** video import or capture handoff.
- **Exit:** tap opens Video; otherwise auto-dismisses in terminal stages.

### 10. Watch score inbox

- **Problem:** recover a score draft created on Watch even if the phone was
  unavailable during play.
- **Current function:** listens for pending Watch score drafts and offers a
  review handoff.
- **States:** no draft, pending draft, received while active.
- **Entry:** global background listener while the signed-in app is open.
- **Exit:** Score Upload prefilled with Watch sets and capture time.

## Discovery, search, map, list, and people

### 11. Discover feed

- **Problem:** provide one place to find local play and professional volleyball
  without forcing a player to know whether the result is an event, venue,
  organization, coach, match, or tour object.
- **Current function:** intent-aware discovery feed, filter chips, map preview,
  search, nearby/current results, organizations, venues, events, coaches,
  matches, and Pro Tour coverage.
- **Filter states:** For you, Today, Events, Tournaments, Training, Open play,
  Free.
- **Result states:** current/future, live, free/paid, distance-aware, no
  results, location unavailable, and preview/live data.
- **Entry:** Home search, Quick Actions, Plans hosted-match link, live deep
  link.
- **Connections by entity:**
  - Organization → Organization Experience.
  - Venue → Venue Booking.
  - Event/session → Native Event Details, then Registration/Booking.
  - Coach → Coach Profile.
  - Match or Pro Tour result → Pro Tour.
  - Result without a native contract → corresponding Duna Web route.

### 12. Guided discovery search

- **Problem:** turn a vague request such as “find something Saturday near me”
  into explicit reusable criteria.
- **Current function:** a full-screen four-step flow: summary, Where, When,
  What; live result count; clear/reset.
- **States:**
  - Main summary.
  - Where: current location, typed place suggestions, recommended places,
    minimum query length, loading, no matches, denied permission, place lookup
    error.
  - When: preset ranges or custom calendar.
  - What: one or more play categories.
  - Zero, one, or many result count.
- **Entry:** Discover search control or Edit search from an empty map result.
- **Exit:** results open the Discovery Map in split view; close returns to
  Discover.

### 13. Discovery map preview

- **Problem:** communicate geographic context without making the full map the
  default experience.
- **Current function:** embedded map/cluster preview, number of places, Open
  map, and common filters.
- **States:** Mapbox available, token/map unavailable fallback, no mapped
  coordinates.
- **Entry:** Discover feed.
- **Exit:** full Discovery Map.

### 14. Discovery map / split / list

- **Problem:** let the player fluidly move between spatial orientation and
  scannable result details.
- **Current function:** one modal with three sheet positions: Map, Split, and
  List; draggable sheet; clustered pins; selected result; horizontal filters;
  Search this area; current-location recentering; driving estimates; embedded
  result media; Create a Match affordance for match discovery.
- **States:** map, split, list, filter active, map moved, selected item,
  driving-matrix loading/failure, Mapbox fallback, location denied, result
  video playing, no results in current bounds.
- **Entry:** Discover map preview, intent action, or completed guided search.
- **Connections:** result selection routes to organization, venue, event,
  coach, match, or Pro Tour; Edit search returns to Guided Discovery Search;
  Create a Match opens Pickup Host.

### 15. Find Coach

- **Problem:** connect players to relevant local or virtual coaching rather
  than presenting an unstructured people directory.
- **Current function:** near/virtual mode, name search, gender filter,
  experience filter, organization filter, location-aware coach cards.
- **States:** nearby, virtual, filters, searching, no matches, location not
  available, selected coach.
- **Entry:** Quick Actions or Duna AI suggestion/handoff.
- **Exit:** Coach Profile; Back currently goes to the internal Play launcher.

### 16. Coach Profile

- **Problem:** establish trust and make the next coaching action obvious.
- **Current function:** identity, home market, rating/role context, biography,
  upcoming sessions and lessons.
- **States:** selected coach, no sessions, session available.
- **Entry:** Discover, Find Coach, Organization Experience.
- **Exit:** event/session details natively when present in the dashboard;
  otherwise Duna Web event page.

### 17. Player Profile sheet and player picker

- **Problem:** inspect another player safely and choose teammates/partners
  consistently across registration, hosting, and booking.
- **Current function:** player summary, rating/stats/social actions; searchable
  picker with selected state and selection limits.
- **States:** public/private-limited profile, youth-safe visibility, selected,
  disabled/excluded, empty search.
- **Entry:** teammate rows, social rails, registration roster, Pickup Host,
  Venue Booking.
- **Exit:** returns the selected people to the owning flow.

## Organizations, catalog, goods, services, sessions, and memberships

### 18. Organization Experience

- **Problem:** give every club or organization a coherent player storefront
  without losing the parent Duna navigation and checkout rules.
- **Current function:** organization brand, venues, upcoming events, coaches,
  catalog, membership offer, and product detail/checkout inside a page sheet.
- **States:** loading, error, storefront home, item detail, variant selection,
  price/audience selection, member eligibility checking, included benefit,
  members-only offer, waiver completion, checkout busy, purchase complete.
- **Entry:** Discover organization result or Profile organization relationship.
- **Connections:** venue → Venue Booking; event → Native Event Details or web;
  coach → Coach Profile; catalog item → Product Detail/Checkout; post-purchase
  requirements → Waiver.

### 19. Catalog product detail and checkout

- **Problem:** use one understandable purchase surface across unlike offers
  while preserving eligibility, schedule, consent, and payment differences.
- **Current function:** media, outcome/highlights, variants, prices, promo code,
  payment method, installment/upfront options, membership terms, occurrence
  choice for scheduled services, recording consent for online delivery, and
  purchase confirmation.
- **Object families supported by the catalog contract:**
  - Events: tournament, league, clinic, open play, pickup.
  - Services: private lesson, group lesson, program, court rental, assessment,
    other.
  - Goods: apparel, equipment, rental, swag, consumable, digital content,
    other.
  - Plans: membership, credit pack, bundle.
- **Payment states:** card via native Stripe PaymentSheet, club credit, cash
  reservation, hosted web fallback where returned, free/included membership
  benefit, upfront, installments, monthly/annual recurring offer.
- **Eligibility states:** public, members-only, membership required, active
  member, membership activation pending, add membership plus product, no
  published membership to satisfy the requirement.
- **Scheduled service states:** one-off or recurring occurrence available,
  occurrence selected, no upcoming occurrence.
- **Order states:** processing, complete, failed, cancelled, refunded, timeout
  with eventual appearance.
- **Entry:** select a catalog card in Organization Experience.
- **Exit:** refresh storefront/account data; show confirmation; prompt for any
  post-purchase waiver.

### 20. Membership purchase and management

- **Problem:** let a player understand both the offer being joined and the
  memberships already connected to the account.
- **Current function:** catalog membership purchase supports monthly/annual or
  configured pricing, terms acceptance, native payment, and activation
  polling. Existing relationships appear in Profile and Wallet.
- **States:** offer available, terms not accepted, payment in progress, active,
  activation pending, no membership, organization membership status, recurring
  billing schedule, past due.
- **Entry:** Organization Experience membership action or automatic “Add
  membership” requirement during a members-only product purchase.
- **Exits:** Wallet/Profile relationship; Subscriptions + Billing management;
  eligible catalog purchase.

### 21. Subscriptions + Billing

- **Problem:** centralize recurring Duna, club, organization, and coach billing
  relationships.
- **Current function:** native subscription-management modal from Profile.
- **States:** loading, active items, cancellation/management notices, error.
- **Entry:** Profile Settings.
- **Exit:** Profile; some provider management may use secure web/system billing
  surfaces.

### 21a. Player + organization identity switcher

- **Problem:** let one person keep a single player identity while choosing the
  club or coaching business whose staff context is active.
- **Current function:** active organization and role summary, WorkOS
  organization list, switch action, optional self-enrollment as coach or
  director, Duna Pro handoff, and HQ management handoff.
- **States:** one/multiple organizations, current organization, switching,
  player-only, active staff role, eligible to self-enroll, adding role,
  enrollment complete, error.
- **Entry:** organization identity cards on Home, Discover, and Performance.
- **Exit:** refreshed Player context; `duna-pro://organization/{slug}` for Pro;
  Duna HQ web fallback for management.

## Venues, court rental, and hosted matches

### 22. Venue Finder

- **Problem:** choose the correct place before asking a player to understand
  inventory and time slots.
- **Current function:** searchable/location-aware venue choice with date and
  duration intent.
- **States:** query, location request/denied, result list, no result.
- **Entry today:** no reachable control currently sets the mounted Venue Finder
  modal to open. Book a court routes through Discover instead.
- **Intended exit:** Venue Booking with venue/date/duration seed.
- **Redesign note:** either reconnect this chooser as the Book a court entry or
  remove it and make Discover’s venue-selection contract explicit.

### 23. Venue Booking

- **Problem:** complete a court reservation, optionally split it among players,
  and optionally convert the reservation into a hosted match.
- **Current function:** venue inventory, calendar/date range, duration,
  available slots, private vs host intent, full vs split payment, participant
  selection/invites, policy review/acceptance, quote, native payment, and
  confirmation.
- **States:** inventory loading/error, date selected, calendar open, no
  availability, time selected, quote loading, participant picker, policy
  unread/unaccepted, payment busy/cancelled, share paid, awaiting participant
  shares, confirmation, split-payment incomplete.
- **Entry:** Discover venue; Organization venue; Book court quick action;
  Pickup Host when a court must be reserved.
- **Connections:**
  - Private reservation → Booking Management/Plans.
  - Host intent → Pickup Host prefilled with court booking.
  - Created hosted match → native event/registration if known, otherwise Duna
    Web event route.

### 24. Pickup / Create a Match

- **Problem:** let a player publish clear, eligible local play without an
  operator creating a formal event.
- **Current function:** title, time, venue, capacity, level/rating context,
  visibility, waitlist, approval behavior, partner/player selection, price and
  court connection.
- **States:** no court, connected court reservation, public/unlisted, free or
  paid, partner selected, validation error, creating, success.
- **Entry:** Home/Quick Actions, Plans Create a Match, Discovery Map, Venue
  Booking host handoff.
- **Exit:** success banner on Plans or event/booking management; reserve court
  opens Venue Finder/Booking.

## Events, sessions, registration, and booking lifecycle

### 25. Native Event Details

- **Problem:** show one consistent event/session summary and make the correct
  next action depend on lifecycle and existing booking state.
- **Current function:** type/organization, schedule, venue/court, joined and
  remaining players, price, tags, and lifecycle-dependent actions.
- **Lifecycle states:**
  - Upcoming → Open your booking, View registration, or View event options.
  - Live → Keep score and Record video.
  - Completed → private event reflection and save/retry state.
  - Cancelled → cancellation notice with registration/live actions removed.
- **Kinds:** tournament, league, clinic, open play, pickup, private lesson,
  court rental.
- **Entry:** Discover feed/map/list, Plans event, Organization Experience,
  coach session.
- **Connections:** Registration Checkout, Booking Management, Score Upload,
  Video, private event note.

### 26. Registration and ticket checkout

- **Problem:** complete the correct purchase for the correct person/team while
  preventing ineligible, incomplete, or unacknowledged registrations.
- **Current function:** entry vs fan ticket, division, ticket type/quantity,
  self vs team payment, teammate search/invite, pickup partner, household
  participant, age/gender eligibility, required policy review, price, native
  payment, admission pass confirmation.
- **Pre-checkout states:** entry/ticket, division unavailable, participant
  eligible/ineligible, dependent unverified, roster incomplete, required policy
  unread/unaccepted, free/paid, individual/team price.
- **Completion states:** confirmed, pending approval, payment received while
  fulfillment finishes, waitlisted, already registered, payment cancelled,
  retryable failure.
- **Entry:** Native Event Details or event card registration action.
- **Connections:**
  - Existing non-tournament booking → Booking Management instead of duplicate
    checkout.
  - Existing tournament registration → Tournament Day/Desk.
  - Successful registration/ticket → Booking Confirmation and tournament pass
    when eligible.
  - Remaining waiver → secure waiver completion.

### 27. Booking confirmation

- **Problem:** give durable proof of what just happened and make the booking
  shareable.
- **Current function:** outcome label/title/body, schedule, location, players,
  details link, share action, Done.
- **States:** confirmed, pending, pending approval, waitlisted, already
  registered; optional admission/Apple Wallet confirmation.
- **Entry:** Registration Checkout, Pickup Checkout, Venue Booking.
- **Exit:** close to prior screen; booking appears in Plans after refresh.

### 28. Booking Management

- **Problem:** manage a confirmed or actionable commitment without returning to
  checkout.
- **Current function:** schedule/location/map, attribution, roster, team entry,
  invitations, participant payment state, finish unpaid court checkout, finish
  pickup checkout, host edit, attendance reporting, cancel/decline, copy/share
  details.
- **States:** confirmed, needs action, invited, editing roster, editing pickup,
  paid/unpaid participant, split payment pending, cancelled, cancel confirm,
  attendance attended/no-show, map fallback, busy/error/success notice.
- **Entry:** Home Next Up, Plans booking row/calendar, Native Event Details,
  booking deep link.
- **Exit:** returns to Home/Plans/event beneath it and refreshes runtime data.

### 29. Calendar

- **Problem:** see commitments by date rather than scanning a flat list.
- **Current function:** month navigation, selected day, booking list, booking
  selection; optional device-calendar sync handled by the background calendar
  layer.
- **States:** month/day selected, date with bookings, empty date, calendar
  permission/sync preference states.
- **Entry:** Plans “See calendar.”
- **Exit:** Booking Management or Plans.

### 29a. Device calendar settings

- **Problem:** make calendar export/sync an explicit player choice rather than
  silently writing bookings to a device calendar.
- **Current function:** device-calendar permission, target-calendar choice,
  sync preference, and automatic reconciliation by the global calendar sync
  layer.
- **States:** permission not requested/granted/denied, calendar selected, sync
  enabled/disabled, no bookings, sync warning/error.
- **Entry:** calendar settings card in the player performance/profile journey.
- **Exit:** returns to the owning screen; later booking refreshes are handled
  by the background calendar sync agent.

### 30. Session arrival

- **Problem:** share only the location needed to coordinate arrival for an
  imminent session.
- **Current function:** time-windowed private location sharing, publish/update,
  stop sharing, and coach-facing arrival signal.
- **States:** too early, available window, permission denied, leave now,
  running late, arrived, stopped, window closed, offline/error.
- **Entry today:** the component is nested inside the Live Activities opt-in
  prompt, but that prompt is not mounted by the current Player app. There is no
  reachable Player control today.
- **Intended entry:** inline in an eligible upcoming booking/session.
- **Exit:** remains within the owning booking; location can be stopped at any
  time.

### 31. Live Activities prompt

- **Problem:** offer Lock Screen/Dynamic Island follow-up at the moment it is
  useful without silently enabling it.
- **Current function:** explains and starts a supported Live Activity.
- **States:** unsupported platform, available, active, denied/error.
- **Entry today:** the reusable prompt exists but is not mounted by `App.tsx`.
  Pro Event follow can start a Live Activity directly through its own action.
- **Intended entry:** eligible booking/live follow journey before the player
  has opted in.
- **Exit:** owning screen; system Live Activity continues outside the app.

## Plans and training

### 32. Plans

- **Problem:** combine the player's calendar, assigned work, and nearby hosted
  play into one forward-looking place.
- **Current function:** Create a Match, assigned training card, upcoming
  bookings with statuses, full calendar, hosted matches nearby, and hosting
  explanation/action.
- **States:** next practice present/absent, booking confirmed/needs action,
  hosted-match list/empty, newly hosted success banner, preview/live.
- **Entry:** persistent Calendar dock; Home schedule; booking deep link.
- **Connections:** Training, Booking Management, Calendar, Native Event
  Details, Discover hosted-match filter, Pickup Host.

### 33. Training Program / Practice

- **Problem:** translate a coach-authored program into the next concrete
  practice and a private feedback loop.
- **Current function:** program phase/progress, current practice intent, blocks,
  planned load, duration/touches, upcoming program events, private post-session
  RPE and optional feedback.
- **States:** no assigned program, program/practice ready, upcoming events,
  response due, check-in open, RPE selected, saving, submitted, error.
- **Entry:** Plans training card.
- **Exit:** Back to Plans; submitted response becomes coach-visible within the
  authorized program relationship.

## Tournament and league journeys

### 34. Tournament Day / Tournament Desk

- **Problem:** let a registered player understand the live competition day
  from the same server-owned bracket used by HQ, Pro, and public views.
- **Current function:** division selection, draw version/live status, player’s
  next match, pool tables, individual KOB standings, round tabs, match cards,
  court assignment, live/final score state; refreshes every 30 seconds.
- **Entry:** attempt to open registration for a tournament that already has an
  existing booking.
- **Tournament states presented:**
  - Bracket published but not launched → `DRAW V{n}`.
  - Explicitly launched → Live.
  - Match awaiting teams/qualifiers.
  - Match scheduled/up next with court.
  - Match live with score.
  - Match final.
  - Pool progress and provisional standings.
  - KOB live/final individual points.
  - Multi-division and multi-round selection.
  - Fresh live state, cached state with refresh paused, offline/unavailable
    without a snapshot.
- **Exit:** close to the underlying event/discovery screen.
- **Authority note:** Player does not advance teams or infer qualifiers. Pool
  ties remain director-confirmed until the server workflow is expanded. See
  [Tournament architecture](../TOURNAMENTS.md).

### 35. Tournament admission passes

- **Problem:** give each player registration and fan ticket a distinct,
  auditable gate credential.
- **Current function:** upcoming pass list, player vs fan kind, expandable QR,
  holder/label, status, Apple Wallet handoff where supported.
- **States:** loading, no passes, usable, checked in/scanned, wallet available,
  wallet unavailable, preparing, wallet open failure with Duna QR fallback.
- **Entry:** successful registration/ticket confirmation and the Tournament
  Passes section currently rendered in Performance.
- **Exit:** Apple Wallet or back to the owning confirmation/screen.

### 36. Tournament lifecycle not directly shown in Player

These states exist in the shared tournament system but are intentionally not
separate player screens today:

| Server/operator state                   | Player treatment today                                                                               |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Draft/private event                     | Not discoverable to the player.                                                                      |
| Registration configured but unpublished | Not discoverable.                                                                                    |
| Published and registration open         | Event details plus Registration Checkout.                                                            |
| Capacity full with waitlist             | Registration completes into Waitlisted.                                                              |
| Registration requires approval          | Paid/free request completes as Pending approval; pass waits for issuance.                            |
| Draw generated but not launched         | Tournament Desk displays versioned draw, not Live.                                                   |
| Competition launched                    | Tournament Desk displays Live and refreshes.                                                         |
| Pools/KOB/rounds in progress            | Server snapshot drives standings, next match, and cards.                                             |
| Completed                               | Final match/standing state; event itself becomes Completed.                                          |
| Cancelled                               | Native Event Details removes registration/live actions.                                              |
| Superseded draw                         | Player receives the latest explicit bracket version; prior versions remain immutable server history. |

### 36a. Match host requests and roster

- **Problem:** let a pickup host handle demand after publishing without
  reopening event creation or using an operator tool.
- **Current function:** pending join requests, accept/decline, invite players,
  current roster, capacity-aware actions, and refreshed booking state.
- **States:** no requests, pending requests, accepted/declined, open/full
  roster, busy/error, creator vs non-creator permissions.
- **Entry:** primary “Invite players & requests” action on the hosted-match
  confirmation; inline section in Booking Management for the match creator.
- **Exit:** returns to confirmation/Booking Management and refreshes Plans and
  discovery state.

### 36b. Policy review and waiver completion

- **Problem:** prove that required rules and releases were actually presented
  and acknowledged by the correct person without burying them inside payment.
- **Current function:** full policy review, read-state tracking, explicit
  acceptance, post-purchase waiver requirement lookup, scroll-to-end and key
  section acknowledgement, typed legal name where required, and secure sharing
  for a remaining parent/guardian/player signer.
- **States:** unread/read, optional/required, accepted/not accepted, waiver
  complete/incomplete, signature required, additional signer required,
  saving/error, secure web completion.
- **Entry:** Registration Checkout, Venue Booking policy review, Organization
  catalog post-purchase waiver prompt, waiver deep link.
- **Exit:** owning checkout/booking when complete; shared Duna Web link for the
  remaining signer.

## Score, performance, rating, and predictions

### 37. Score Upload

- **Problem:** record an unsanctioned or externally scored match with enough
  structure for verification and rating processing.
- **Current function:** staged flow for match type, team size/players, when,
  location, sets, agreement, and review; provisional player creation when a
  participant is not yet on Duna; Watch-prefilled draft support.
- **Steps/states:** Match, Players, When, Location, Score, Review, submitting,
  submitted; competitive/friendly; 1v1/2v2; location missing; invalid set;
  participant incomplete; agreement missing; error.
- **Entry:** Quick Actions, live event, Watch score inbox.
- **Exit:** successful submission → Performance; participant picker/profile
  and provisional-player modal are nested.

### 38. Performance

- **Problem:** turn match history into an understandable view of outcomes,
  rating movement, and current level.
- **Current function:** Sand Rating, match result history, range filters,
  win/loss and rating-delta presentation, player intelligence, profile artwork,
  and links to Wallet, Predictions, and Health.
- **States:** 12 matches, 30 matches, all; results/empty; win/loss; positive,
  negative, or unchanged rating delta; profile intelligence loading/error.
- **Entry:** Home Recent matches/View performance, Profile Performance,
  Score Upload completion.
- **Exit:** contextual Back to Home/Profile; Health, Wallet, Predictions,
  profile editing/artwork.

### 39. Prediction discovery and market sheet

- **Problem:** make free-play match forecasting legible without resembling a
  cash wagering product.
- **Current function:** open/live/determined discovery cards, yes/no prices,
  crowd history, credit amount, review, immutable order confirmation.
- **States:** market open, locked, settled/determined, insufficient/invalid
  credits, review, sending, filled/open order, error.
- **Entry:** prediction rails in Pro coverage and Prediction Portfolio; some
  market links currently open Duna Web.
- **Exit:** market detail/portfolio.

### 40. Prediction Portfolio

- **Problem:** show exactly where free credits moved and how each call resolved.
- **Current function:** available credits, monthly grant, open value/net,
  settled net, discovery rail, open positions, wins/losses/voids, open orders,
  immutable credit ledger.
- **States:** no positions, open, locked, won, lost, void, no determined
  positions, no activity, positive/negative net.
- **Entry:** Profile Predictions; Wallet prediction summary.
- **Exit:** Back to Wallet; market detail links.
- **Boundary:** credits cannot be bought, transferred, redeemed, or exchanged
  for cash or prizes. See [Prediction credits](../PREDICTION_CREDITS.md).

## Profile, wallet, health, and settings

### 41. Profile hub

- **Problem:** gather identity, game data, money, privacy, and organization
  relationships without turning the global dock into a settings menu.
- **Current function:** identity/rating header; six tiles—Profile, Wallet,
  Predictions, Health, Performance, Videos; organization relationships;
  settings; sign out.
- **States:** image/initials, onboarding complete/incomplete, organization
  list/empty, preview-disabled settings, live sign-out.
- **Entry:** Home profile affordance.
- **Connections:** Profile Details/Editor/Artwork, Wallet, Predictions, Health,
  Performance, Video, Organization Experience, Subscriptions, Notifications,
  Data Use, Duna Web Privacy/Language/Account settings.

### 42. Profile details, editor, and artwork

- **Problem:** separate public identity data from creative presentation and
  make incomplete identity repairable.
- **Current function:** view details, edit profile fields, upload player media,
  choose/generate profile artwork.
- **States:** view, incomplete, edit, validation, upload busy/error, artwork
  preview/save.
- **Entry:** Profile identity or Profile tile; Performance artwork action.
- **Exit:** returns to Profile/Performance and refreshes player identity.

### 43. Wallet

- **Problem:** distinguish membership credentials, real Stripe-managed money,
  club credits, automatic schedules, and activity in one auditable place.
- **Current function:** Duna membership QR and Apple Wallet action; authoritative
  available/pending balance; Add money/Withdraw web controls; membership tier;
  club/coach relationships and credits; installment schedules; wallet activity.
- **States:** no membership/member card, Wallet pass available/unavailable,
  available/pending balance, no organization relationships, active/past-due
  payment schedule, installment scheduled/paid/failed, positive/negative
  ledger entry, preview-disabled money actions.
- **Entry:** Profile Wallet tile; Performance Wallet action.
- **Exit:** native Back to Profile; Add money, Withdraw, and full activity open
  secure Duna Web wallet; Predictions is a separate free-credit ledger.

### 44. Health

- **Problem:** connect private recovery context to matches and training without
  presenting Duna as a medical product or silently broadening data access.
- **Current function:** Apple Health category selection and permission handoff;
  encrypted historical/incremental sync; readiness; factors and recommendation;
  timeline, trends, sleep/strain intelligence; private check-in; scoped 90-day
  sharing; revoke/disconnect/delete imports.
- **States:**
  - Not connected.
  - Category selection with none/one/many selected.
  - Apple permission, reading, protecting, processing, complete import phases.
  - Connected with data; connected but waiting for data.
  - Sync active/already running; history queued; no new records.
  - Readiness building baseline/low confidence/full signal.
  - Timeline/trend populated or empty.
  - Check-in editing/saving/complete.
  - Share categories/scopes selected, saving, grant active.
  - Sync paused/error with Try Again.
  - Disconnect confirmation and deletion.
- **Entry:** Profile Health; Performance Health action.
- **Exit:** Back to Profile; Apple Health permission sheet; system Settings for
  Apple permissions.
- **Boundary:** Duna reads only approved categories, never writes Health data,
  and does not diagnose. See [Health privacy](../HEALTH_PRIVACY.md).

### 45. Notifications

- **Problem:** separate required account delivery from optional updates.
- **Current function:** scope-specific notification preferences and save state.
- **States:** loading, selection, saving, success, error, device push denied.
- **Entry:** Profile Settings; Messaging can separately prompt to enable message
  alerts.
- **Exit:** Profile or OS notification settings.

### 46. Video Data Use

- **Problem:** make cellular/Wi-Fi upload and live-video behavior explicit.
- **Current function:** local/network preferences for video upload and live
  use.
- **States:** loading stored preferences, enabled/disabled combinations,
  foreground-only fallback, save state.
- **Entry:** Profile Settings.
- **Exit:** Profile; preferences affect Video capture/import behavior.

### 47. Privacy + Safety, Language + Units, Account + Security

- **Problem:** expose lower-frequency account settings without duplicating the
  canonical web settings implementation.
- **Current function:** each row opens a named anchor on Duna Web settings.
- **States:** preview disabled, web loading/auth/error.
- **Entry:** Profile Settings.
- **Exit:** in-app browser back to Profile.

## Video, recording, library, and Duna Vision

### 48. Video Library / Studio home

- **Problem:** unify recording, import, upload progress, library, playback, and
  analysis rather than treating video as a single camera action.
- **Current function:** video list/cards, metrics, capture/import entry,
  offline drafts, transfer recovery, selected video playback, Vision reports.
- **States:** loading, error, no videos, populated library, offline drafts,
  upload/import/processing/complete, selected video.
- **Entry:** Profile Videos, Home/Quick Actions Record game, event Record video,
  upload deep link, transfer banner.
- **Connections:** Recording Setup, Import Details, Camera Guide/Capture, Video
  Player, Vision Analysis, Create a Match.

### 49. Recording setup

- **Problem:** establish match/session context and privacy before opening a
  camera that is difficult to configure courtside.
- **Current function:** Step 1 of 2; scheduled association; capture type;
  recording name; orientation; court; visibility; audio; details sheet;
  remembered defaults; optional Vision learning consent.
- **States:** scheduled activity connected/not connected, Practice/Event/Match,
  each choice sheet, landscape/other orientation, full/other court, private or
  public recording, audio on/off, details expanded, consent on/off.
- **Entry:** Record game in Video.
- **Exit:** Camera Guide/Capture.

### 50. Video import details

- **Problem:** give an imported file enough context and court geometry for
  reliable upload and optional analysis.
- **Current function:** file-ready summary, title, association, privacy,
  orientation, audio/data preferences, imported frame sampling, Vision court
  calibration, consent, upload.
- **States:** file selected, frame sampling, auto-detect available/unavailable,
  manual court edit, foreground-only upload, offline retained draft, upload
  progress/error.
- **Entry:** import from Video Library/system picker.
- **Exit:** background transfer banner and Video Library.

### 51. Camera guide and capture

- **Problem:** help one phone capture a usable court while still allowing a
  recording when Vision guidance is unavailable.
- **Current function:** camera/microphone permissions, landscape lock,
  auto/manual court geometry, preview quality, live vs record mode, timer,
  scoreboard, favorite moment, Watch sync, remote control, share live link,
  hide preview for battery, interruption-safe finalization.
- **States:** permissions pending/denied, orientation warning, court detected,
  partial/out-of-frame, calibration edit, ready, recording, live streaming,
  remote connected/disconnected, preview hidden, Vision remote unavailable,
  network disallowed/offline, fallback to local recording, capture error,
  interrupted/finalized.
- **Entry:** Recording Setup.
- **Exit:** Stop/End → Stream/Recording Complete; Cancel → Video.

### 52. Recording complete / review

- **Problem:** confirm durable capture and let the player decide visibility and
  sharing while processing continues.
- **Current function:** processing notice, recording visibility, profile
  publication, music removal, share watch link, transfer to library.
- **States:** reviewing, processing, upload queued, error, share available.
- **Entry:** completed capture/live stream.
- **Exit:** Video Library; transfer can continue globally.

### 53. Video Player

- **Problem:** watch the asset with the context Duna captured around it.
- **Current function:** playback, timeline/time, live score overlay, private
  health overlay when available, venue/title, Vision report entry.
- **States:** loading URI, playback, paused/seeking, error, score overlay
  present/absent, health context present/absent.
- **Entry:** select a Video Library card.
- **Exit:** Done to library; Vision Analysis.

### 54. Duna Vision Analysis

- **Problem:** turn reviewed evidence into useful match insight without
  pretending the model saw events that are not supported by captured evidence.
- **Current function:** analysis request, processing, evidence metrics, landing
  heatmap, saved moments, courtside review, report and performance review.
- **States:** no report, start analysis, starting, processing, report ready,
  evidence-only review unavailable, error/notice.
- **Entry:** selected video/report card.
- **Exit:** Video Player/Library.
- **Boundary:** learning consent is separate, default-off, revocable, and does
  not make the full private video training data. See
  [Video platform](../VIDEO_PLATFORM.md) and
  [Vision analysis](../DUNA_VISION_ANALYSIS.md).

## Duna AI and Messages

### 55. Full-screen messaging shell

- **Problem:** provide a familiar chat product while keeping assistant and
  human conversations in one place without conflating them.
- **Current function:** top segmented toggle between Duna AI and Messages;
  dedicated close to Home; responsive single-pane phone and two-pane wide
  layouts.
- **States:** Duna AI selected, Messages selected, thread selected, no thread,
  loading, refreshing, error, keyboard open, unread count.
- **Entry:** center Duna button, Messages dock, Home Messages, deep link,
  notification.
- **Exit:** close returns to Home; toggle preserves access to the other chat
  space.

### 56. Duna AI conversation

- **Problem:** let a player ask for help using their existing Duna context and
  connect to the right coach, organization, booking, registration, payment, or
  support workflow.
- **Current function:** support-type conversation, ChatGPT-like thread,
  contextual response widgets, prompt suggestions, queued/offline message
  delivery, recent AI chats behind a Duna-AI-only hamburger menu.
- **Prompt examples:** Find a match for me, Find a coach, What’s my schedule?
- **States:** first-use empty/support greeting, recent-chat drawer, thread,
  sending, queued, failed/retry, assistant response/widget, held message.
- **Entry:** center Duna mark or support deep link.
- **Connections:** the agent may explain and link into discovery, coaching,
  organizations, schedule, registration, payment, or human support; any
  consequential action still uses the owning authorized workflow.

### 57. Message inbox

- **Problem:** gather direct, group, event, division, league, support, and Pro
  broadcast conversations with clear unread state.
- **Current function:** search, conversation list, contextual groups, unread
  counts, notification opt-in, refresh and cursor sync.
- **States:** loading, populated, empty, no search matches, unread, refreshing,
  delivery error with drafts safe, notifications on/off/denied.
- **Entry:** Messages mode in the full-screen shell.
- **Exit:** select Thread, Compose, toggle Duna AI, or close Home.

### 58. Message thread and composer

- **Problem:** make communication reliable under mobile connectivity and safe
  across organization/youth contexts.
- **Current function:** message history, attachments, typed composer, send,
  read cursor, native SQLite outbox, failed retry, context and policy labels.
- **States:** loading thread, sent/delivered/read, sending, queued offline,
  failed, held for review, attachments selected/uploading, youth-safe thread,
  empty selection on wide layout.
- **Entry:** inbox row, message deep link, newly composed conversation.
- **Exit:** back to inbox or close shell.

### 59. New message / group / follower broadcast

- **Problem:** start only conversations the current player is authorized to
  create.
- **Current function:** recipient search, suggested connections, Duna groups,
  multi-recipient selection, group title, Pro follower broadcast when allowed,
  policy note.
- **States:** individual, group, follower broadcast, no recipients, search
  empty, loading candidates, creating, error.
- **Entry:** Compose in Message inbox.
- **Exit:** created Thread or cancel to inbox.

## Professional volleyball and Watch

### 60. Pro Tour hub

- **Problem:** let players follow the professional game inside the same app
  where they play.
- **Current function:** search, live events, next-up/other events, event cards,
  worldwide coverage.
- **States:** live events present/absent, upcoming/completed status, search
  results/empty, loading/error.
- **Entry:** Watch the pros Quick Action and Pro results in Discover.
- **Exit:** Pro Event Detail or close to Discover.

### 61. Pro Event Detail

- **Problem:** make a professional event understandable as a live product, not
  just an outbound broadcast link.
- **Current function:** sections chosen from available data: Overview, Live,
  Matches, Draw, Teams/Standings, Watch; event follow; match follow/Live
  Activity; location/map; tickets; sibling divisions; prediction markets.
- **States:** summary loading/error/retry, live/upcoming/completed, followed/not
  followed, live matches/none, match scheduled/live/completed, draw/pools,
  teams/standings empty, broadcasts available/empty, copied address, Live
  Activity error.
- **Entry:** Pro Tour hub, Discover match/pro result.
- **Connections:** system Maps, ticket/broadcast web URLs, Live Activity,
  Prediction Market.

### 62. Apple Watch scorer

- **Problem:** score and mark video moments courtside without handling the
  phone.
- **Current function:** synced teams/match format; point scoring; sets won;
  server-safe draft handoff; undo; serving side; side-change cues; favorite
  moment; flag last rally; camera preview; match controls; send completed set or
  match for phone review.
- **States:** no phone context/default teams, connected match, Vision active,
  local recording/live capture, preview waiting/acceptable/partial, set in
  progress/complete, match complete, side change due, queued connectivity,
  draft sent/pending.
- **Entry:** paired Watch app; iPhone syncs match or Vision context.
- **Exit:** draft/event queues sync to the iPhone; Score Upload or Vision
  timeline performs authoritative review/mutation.

### 63. Watch camera preview, last-rally review, and match controls

- **Problem:** expose secondary Watch tasks without crowding the scoring face.
- **Current function:** separate Watch sheets for iPhone camera quality,
  last-rally cue/review marker, score/set/reset controls.
- **States:** preview unavailable/waiting/partial/acceptable, no rally yet,
  review marked, can/cannot end set, can/cannot submit.
- **Entry:** buttons on the Watch scorer.
- **Exit:** back to scorer.

## Cross-object commerce map

| Object              | Browse/detail entry                                    | Selection and eligibility                                                                                                    | Payment/confirmation                                               | Post-purchase home                                                                                    |
| ------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Good                | Organization catalog → product detail                  | Variant, price audience, quantity currently one, optional membership requirement                                             | Card/credit/cash where configured; goods exclude installment plans | Organization refresh; Wallet activity where monetary                                                  |
| Service             | Organization catalog → product detail or coach/session | Variant, member eligibility, fixed occurrence for one-off/recurring schedule, recording consent for eligible online delivery | Card/credit/cash; upfront or eligible installment schedule         | Account/organization relationship; scheduled occurrence should surface through bookings/training data |
| Membership          | Organization offer or required-product upsell          | Monthly/annual/configured price, membership terms                                                                            | Native card/hosted fallback; activation polling                    | Profile Organizations, Wallet membership/credits, Subscriptions + Billing                             |
| Credit pack/bundle  | Organization catalog                                   | Variant and eligibility                                                                                                      | Card/credit/cash as configured                                     | Organization credit balance and Wallet relationship                                                   |
| Event/session entry | Event Details → Registration                           | Participant, division, roster, eligibility, policies                                                                         | Free, native PaymentSheet, waitlist, pending approval              | Booking in Plans; pass when issued; Tournament Desk if active tournament                              |
| Fan ticket          | Event Details → Registration                           | Ticket type and quantity                                                                                                     | Native PaymentSheet or configured free flow                        | Fan admission QR/pass                                                                                 |
| Court rental        | Venue → Venue Booking                                  | Date, duration, court slot, participants, private/host intent, policy                                                        | Full or split native payment                                       | Booking Management/Plans; optional hosted match                                                       |
| Pickup/open play    | Discover/Event Details                                 | Partner/players, capacity, approval, waitlist                                                                                | Free or native event payment                                       | Booking Management; hosted event; attendance reporting                                                |
| Prediction position | Prediction market                                      | Yes/no side and free-credit amount                                                                                           | Immutable free-credit order; never cash                            | Prediction Portfolio and credit ledger                                                                |

## State checklist for every redesigned screen

Every applicable screen should specify these states in the design file and
acceptance criteria:

- Initial load and skeleton/progress treatment.
- Populated default.
- Empty with a useful next action.
- Search/filter with zero results.
- Cached/offline with last-known data and reconnect behavior.
- Retryable server/provider error.
- Permission not requested, denied, limited, and system-settings recovery.
- Preview/demo limitations.
- Disabled action and why it is disabled.
- Busy/idempotent submission; prevent double mutation.
- User-cancelled system sheet/browser/payment.
- Success with a durable receipt or next destination.
- Pending/processing/eventual consistency.
- Partially complete multi-person action: unpaid teammate, guardian signature,
  organizer approval, participant invite, or split payment.
- Cancelled/refunded/void terminal state where the domain supports it.
- Dynamic Type, reduced motion, bright-glare contrast, and one-handed touch
  targets.
- Modal Back/Close behavior, gesture dismissal behavior, and exact return
  destination.

## Current navigation and coverage gaps to preserve or resolve explicitly

1. **Discover and Profile are no longer persistent dock items.** They are
   reached through Home and intent actions. A redesign must make those entry
   affordances obvious or deliberately change the dock contract.
2. **The internal Play launcher remains in source but is not a dock
   destination.** Find Coach Back currently lands there. This should be either
   formalized or removed as part of a navigation refactor.
3. **Messaging hides the global dock.** The dedicated close-to-Home action is
   therefore essential; a hamburger in Duna AI only controls recent AI chats,
   not global navigation.
4. **Some event, product, wallet, settings, waiver, ticket, and broadcast
   destinations remain web/system handoffs.** Redesigns must not imply native
   ownership without implementation.
5. **Home recent match rows open aggregate Performance, not a native individual
   match-detail screen.** A new match-detail design would be a new route and
   data contract.
6. **Tournament Desk is reached through an existing tournament booking rather
   than a dedicated tournament tab.** The access path needs to stay discoverable
   during active events.
7. **Cold-open film currently overlays every launch.** Active-session bypass is
   not represented in the current app routing.
8. **Wallet money and prediction credits are separate systems.** Their visual
   language may relate, but the redesign must not imply credits are purchasable
   or redeemable money.
9. **Light/dark choice is currently removed from the main Player runtime.** The
   app uses the light theme; match/live surfaces may still use contextual dark
   treatments. Do not reintroduce a global appearance toggle without a product
   decision and full state coverage.
10. **Satoshi is the Player type system.** New native Player screens should use
    the shared Satoshi text/input wrappers and numeric tiers rather than raw,
    screen-local font choices.
11. **Venue Finder, Session Arrival, and the reusable Live Activities prompt
    are implemented but currently have no mounted navigation entry.** A
    redesign should reconnect or retire them; it should not assume they are
    already reachable.

## Source ownership index

| Area                                                                                                                 | Current source of truth                                                                                   |
| -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| App screen state, Home, Discover, Plans, venue/court, registration, Wallet, Predictions, Performance, Pro Tour, dock | `apps/player/App.tsx`                                                                                     |
| Launch, sign-in/up, returning account, cached/offline runtime                                                        | `apps/player/runtime.tsx`                                                                                 |
| Event lifecycle detail                                                                                               | `apps/player/event-details.tsx`                                                                           |
| Booking management                                                                                                   | `apps/player/booking-management.tsx`                                                                      |
| Booking confirmation/share                                                                                           | `apps/player/booking-share.tsx`                                                                           |
| Search flow                                                                                                          | `apps/player/discovery-search-flow.tsx`                                                                   |
| Map/split/list                                                                                                       | `apps/player/discovery-map.tsx`                                                                           |
| Organization catalog and checkout                                                                                    | `apps/player/organization-experience.tsx`                                                                 |
| Calendar                                                                                                             | `apps/player/player-calendar.tsx`                                                                         |
| Session arrival                                                                                                      | `apps/player/session-arrival-card.tsx`                                                                    |
| Training                                                                                                             | `apps/player/training-screen.tsx`                                                                         |
| Tournament read model                                                                                                | `apps/player/local-tournament.tsx` and [Tournament architecture](../TOURNAMENTS.md)                       |
| Admission passes                                                                                                     | `apps/player/tournament-passes.tsx`                                                                       |
| Score upload                                                                                                         | `apps/player/score-upload.tsx`                                                                            |
| Profile/settings                                                                                                     | `apps/player/profile-hub.tsx`, `apps/player/profile-studio.tsx`, `apps/player/player-social.tsx`          |
| Health                                                                                                               | `apps/player/health-screen.tsx` and [Health privacy](../HEALTH_PRIVACY.md)                                |
| Video/Vision                                                                                                         | `apps/player/video-studio.tsx` and [Video platform](../VIDEO_PLATFORM.md)                                 |
| Messaging/Duna AI                                                                                                    | `apps/player/messaging-screen.tsx` and [Messaging platform](../MESSAGING_PLATFORM.md)                     |
| Watch                                                                                                                | `apps/player/targets/DunaWatch`, `apps/player/watch-scoring.ts`, `apps/player/modules/duna-watch-scoring` |
| Mobile payment presentation                                                                                          | `apps/player/native-payments.ts`                                                                          |
| Shared visual tokens/type                                                                                            | `packages/ui`, `apps/player/satoshi-text.tsx`, `apps/player/duna-icon.tsx`                                |

When this inventory and the app disagree, inspect the named source, update the
implementation or this document in the same change, and record whether the
difference is shipped behavior, an intended redesign, or an unimplemented gap.
