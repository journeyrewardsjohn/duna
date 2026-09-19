# Duna sand product direction

The September 19 user references supersede the prior white utility-home and
floating glass-dock requirements for Player, Pro, HQ, and the Player portal.
The existing product, privacy, tenancy, type, accessibility, and release contracts
remain in force.

- Warm sand canvas, off-white surfaces, charcoal type, fine neutral separators.
- Photo-led, manually swipeable Player home hero. The rounded content sheet
  scrolls over the image; reduced motion keeps ordinary scrolling and paging.
- Small line icons with visible labels and large touch targets. The center Duna
  D opens the existing AI flow. All existing tools remain reachable.
- My Clubs is a discovery filter. It does not grant membership or change
  operator authority. Personal commitments remain visible across clubs.
- Spacious photographic discovery rails, compact activity rows, and real recent
  destinations. Never invent visitation, a membership, available capacity, or
  performance advice.
- Quiet amorphous 3D sand particles during actual loading, with no minimum delay,
  stopped offscreen and a static reduced-motion state.
- HQ keeps readable operational density, working calendars and controls, with
  simplified neutral chrome and fewer competing emphasis levels.

First review: native Home, My Clubs, navigation, loader; Player portal Home;
HQ shell and overview. Calendar, booking, video, secondary screens, Pro, and all
release proofs remain required before the platform rollout is complete.

Release evidence must distinguish local fixtures, connected runtime, canonical
production routes, native store delivery, and physical camera/Watch behavior.

## Functional boundaries for the rollout

- Player discovery: Home and My Clubs lead to existing event, court, coach,
  training, and match destinations. Club selection filters recommendations;
  existing booking, pricing, capacity, eligibility, and payment checks remain
  authoritative when a player acts.
- Personal activity: upcoming bookings and hosted sessions remain visible even
  when discovery is filtered to another club. Calendar, booking detail,
  cancellation, check-in, wallet, messages, and player profiles retain their
  existing routes and handlers.
- Duna AI: the center D and Home search open the existing assistant. Its
  permissions and action confirmation behavior remain in place.
- Operator HQ: organization selection and role permissions remain separate
  from Player club preferences. Schedule, events, venue inventory, people,
  staff, training, products, payments, and administrative controls retain
  their existing authority and data flows.
- Video acceptance: verify authorized capture, camera liveness, scoring,
  interruption/reconnection, stop/finalization, saved recording, playback,
  seeking, loading/retry states, and privacy. A loading animation or successful
  bundle export does not establish that those behaviors work on a device.
- Pro and release: audit its individual screens and workflows independently;
  deliver and verify each native platform as well as the canonical web/HQ
  deployments. The inventory is a checklist, not a claim that all screens
  have already been redesigned.

## First checkpoint — September 19

Implemented the connected native Player Home and its navigation, Player portal
Home, My Clubs discovery filters, HQ shell/overview, and initial loading states.
The local review hub renders the actual native Home/navigation through a browser
renderer with sample data, and the real web/HQ development apps with repository
fixtures. It is a visual review, not physical-device or production evidence.

Validation:

- Formatting, knowledge consistency, design/readable-type checks, lint,
  typechecks, unit suites, mobile runtime checks, and web/HQ builds passed.
- All 111 browser tests passed across desktop, tablet, and mobile. Home actions,
  the club filter, personal activities, AI access, and HQ control paths were
  exercised. Added an overflow assertion after fixing narrow HQ metric cards.
- Constrained the Home grid's intrinsic column widths after a long discovery
  rail expanded the mobile page and displaced the club sheet's click targets.
  Browser checks now assert containment before and during club selection.
- The public navigation test now waits for DOM readiness and then the actual
  controls instead of the full load event, which stalled on repeated navigation
  even with the page rendered.
- Player iOS and Android Expo bundles exported after the final native changes.
- Native Home, navigation, scrolling sheet, club sheet, and loader were visually
  reviewed in the browser renderer. Physical gestures, camera, playback, Watch,
  and store-delivered builds are not verified by that renderer.

The Mac currently rejects Xcode commands because its Xcode license is unaccepted.
Account-owner license acceptance is required before native Xcode/device proof.
No production deployment or mobile store release is claimed at this checkpoint.

The screen inventory in `sand-screen-inventory.csv` tracks remaining work.
Calendar/booking flows, video watching and recording, Pro, secondary screens,
connected data validation, device QA, and production/store rollout remain open.

## Calendar and video checkpoint — September 19

- The shared light native palette, booking date picker, and Player calendar now
  use the warm canvas and quiet circular date selection. Day, week, month, and
  three-month views and device-calendar integration retain their existing flows.
- The Player portal adds day/week agenda views and a month heading above the date
  rail. Booking dates use each venue's timezone instead of a fixed Los Angeles
  timezone. Three unit cases cover timezone boundaries and week boundaries.
  The full calendar traps keyboard focus and restores it on close.
- Pro now uses the sand light palette, compact labeled navigation with the Duna D,
  safe-area spacing, and the particle loader. Its individual screens and dark/live
  mode still require the remaining visual and connected workflow review.
- The web gallery has a neutral photo-based recording selector and a dark viewing
  surface. Loading, failed playback, and retry are explicit; retry refreshes the
  authorized playback response. Superseded selection requests are cancelled.
- Native playback subscriptions now follow the player instance, while reading
  current callbacks from a ref. Previously a callback change during live score
  refresh ran effect cleanup and paused the player. The extracted actual Expo
  component passed a browser-renderer regression covering repeated parent
  callback changes, progress, pause, seek, and resume. Reintroducing the old
  dependency list in the review harness reproduced the pause. This is software
  lifecycle evidence, not physical device playback proof.
- The actual web gallery passed playback, selection, missing-source failure,
  retry, and containment checks at 390, 1024, and 1440px with a local sample clip
  and local playback responses. Private provider playback remains to be tested.
- Full verification exposed a mobile pickup form whose fieldset expanded to the
  date rail's intrinsic width. Both the form column and fieldset now allow
  shrinking, and the hosting test asserts containment at that step.

The first checkpoint's CI and web/HQ Vercel previews passed. This checkpoint is
still a draft change: no production or native store release has occurred. Camera
recording, native gestures, interruption recovery, Watch, provider-backed
playback, the remaining screen inventory, and all final release proofs remain
open. The review hub includes the working schedule, native calendar, and video.

Checkpoint validation: the full `pnpm verify` release gate passed, including all
111 browser checks. After the final native day-view simplification, Player lint,
typecheck, and fresh iOS/Android exports passed. Pro iOS/Android exports also
passed. Native calendar modes, HQ calendar, Player schedule, and the web gallery
were visually reviewed with local data. The browser video regression and its
failure reproduction live in the local review artifacts, outside the CI suite.
