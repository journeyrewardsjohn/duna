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

## Pro startup and workspace checkpoint — September 19

- Removed Pro’s mandatory ten-second launch film. Both native app configurations
  now open with the Duna mark on sand; the particle loader follows actual work.
  The splash configuration requires new native binaries.
- Pro Today, Calendar, and More use lighter type, neutral actions, larger control
  targets, and small consistent line icons. The duplicate New calendar action
  was removed while Add session keeps the same handler. Today was reviewed in
  both light and dark appearance through the actual browser-rendered component.
- Discovery and match date rails now share the warm surfaces. Map loading uses
  the particle loader, and unavailable maps direct people to the results list.
  Cards retain real supplied images; missing images no longer get blue gradients.
- HQ finance, settings, offer creation, and the AI launcher use the neutral
  presentation. Tenant brand previews retain their configured identity.
- The Theme Kit heading incorrectly occupied the back button’s 44px grid column.
  Correcting its markup restored the content column. Three responsive checks
  cover the heading and setup-card text contrast.
- Admin support and message-safety pages now recognize the server’s FORBIDDEN
  code instead of matching one error sentence. Unauthorized users get the
  existing access-required screen; service failures still propagate. Two unit
  cases verify this distinction.
- A cold-start browser test caught a menu accepting a tap before hydration.
  Delaying JavaScript reproduced the lost first tap. The trigger now stays
  disabled until its handler is ready; a deterministic delayed-script test and
  the existing menu checks pass at all three viewport profiles.

The read-only route crawl captured 75 local Player/HQ routes at desktop and phone
widths. The screenshots are audit material, not proof of connected production
workflows or a claim that all screens are complete. Pro’s creation, collection,
notes, and balance screens still have independent color rules to migrate.
The local video and promo-code pages require a database. Privileged admin
content, physical camera/Watch behavior, and store/production rollout remain open.
Xcode reports its version, but its device and simulator commands still reject the
unaccepted license; version output does not establish native testing readiness.

Checkpoint validation: the complete `pnpm verify` gate passed with 117 browser
checks, including the delayed-hydration menu regression and responsive HQ setup
checks. Fresh Pro iOS and Android exports passed. The corrected HQ settings,
Theme Kit, money, and offer-builder views were reviewed at 390px and 1440px.
These checks do not establish native hardware or connected provider behavior.

## Pro forms and money checkpoint — September 19

- Create, Get Paid, and session notes now resolve their colors from the shared
  native editorial tokens and follow the selected appearance. Create uses small
  line icons and compact choices; forms retain the existing guided steps and
  publishing guards. Labels, body text, and touch targets are easier to read.
- Payment progress uses the sand loader while processing and distinct success,
  declined, and error icons. The Android reader sheet follows the selected
  theme. Collection, authorization, ledger, and provider calls are unchanged.
- Session notes keep the separate private save and explicit sharing steps. The
  active microphone animation respects reduced motion; the ready state uses a
  simple microphone icon. Transcript and summary inputs now have explicit labels.
- Money uses readable foregrounds on the warm card, a concise heading, and small
  line icons. Today’s Money link previously opened Get Paid; it now opens the
  balance workspace, while the existing Get Paid action still opens collection.
- Browser review found the large payment input expanding its scroll container
  to 588px at a 390px viewport. Explicit shrink constraints remove the sideways
  scroll; the payment-step review asserts containment before continuing.

Actual component reviews cover light and dark creation, payments through tender
selection, Money navigation, and note drafting and recipient selection. Local
sample responses drive these checks. They do not collect money, publish notes,
open a physical microphone, or establish connected-provider behavior.

Checkpoint validation: `pnpm verify` passed, including all 117 browser checks.
Fresh Pro iOS and Android exports passed. The browser-rendered native review also
confirmed that Today opens Money, both payment appearances remain contained at
390px, all four payment steps stay reachable, and note drafting preserves the
recipient-selection and separate-sharing behavior. No live payment or note was
submitted during these reviews.

## Player profile checkpoint — September 19

The profile hub and its detail, notification, subscription, and data-use sheets
now use the shared warm editorial tokens, compact neutral icons, lighter titles,
and readable descriptions. Subscription actions retain their existing billing,
renewal, cancellation, and preview guards. The profile video section separates
its description from the recording action and uses the sand loading state.

The full Player app now has a local browser-renderer review entry. Profile sheets
were reviewed with a clearly marked sample account and external actions disabled;
notification preferences remain inaccessible through the production preview path
as before. No consent, subscription, or billing record was changed. The Player
root currently fixes its presentation to light; this checkpoint does not claim
an app-wide appearance selector or dark-mode acceptance.

Checkpoint validation: the full `pnpm verify` gate passed with 117 browser checks,
and fresh Player iOS/Android exports passed. The profile and four account sheets
were visually reviewed through the browser renderer, with no runtime errors.

## Player capture entry and discovery checkpoint — September 19

The recording entry now uses warm surfaces and readable capture choices, while
the viewing stage and active capture retain their separate presentation. The
existing iPhone, authenticated-client, and live-plan gates remain in place.
Unavailable capture choices retain readable descriptions. Video loading uses the
sand particles, and a zero plan allowance reads “Not included.” Discovery, coach
search, section headings, and the quick-actions sheet use lighter, quieter type.

The browser-rendered Player audit opened all nine quick actions without runtime
errors. That is navigation and presentation evidence using sample data, not
camera, map-provider, device-picker, coach-availability, or private-video proof.
The canonical Player portal currently requests sign-in in the available browser;
a sign-in handoff is pending for connected account and recording review.

Checkpoint validation: `pnpm verify` passed with all 117 browser checks. Fresh
Player iOS/Android exports passed. The browser review confirmed that preview
accounts cannot start recording, livestreaming, or an upload, and that zero
allowance uses the explicit “Not included” label.

## Player appearance and secondary sheets checkpoint — September 19

Player now has a persisted Light, Dark, and Match device preference under Profile.
The saved choice resolves before the app content mounts. Home, compact navigation,
calendar, discovery, the root workflow palette, account sheets, profile editing,
and video presentation now use that choice. Event and match detail resolve the
selected appearance while retaining live-zone semantics. The Home status bar also
changes contrast when the content sheet covers the photograph.

Profile editing and artwork preparation use the quiet form style. Their existing
save, upload, rights-confirmation, and publishing controls are preserved. Video
entry, setup, usage, and profile cards use theme-aware surfaces; camera overlays
and the viewing stage retain their separate presentation. The review caught and
fixed disappearing profile initials, pale video empty states, a white-on-white
Tour introduction, and dark map-sheet headings. Muted sand text was darkened to
stay readable on the inset surfaces.

Actual browser-rendered Player checks cover preference switching, persistence on
reload, following device changes, calendar navigation, and recording navigation.
All nine quick actions opened in both appearances without runtime errors. Profile
editing and artwork sheets were visually reviewed in both appearances; no account
record, photo, or artwork request was submitted. Automated contrast scans are an
audit aid: underlying content hidden by native sheets and photographic overlays
require visual interpretation.

This is not app-wide acceptance yet. Training, Health, booking management, and
other independent secondary styles still need their remaining review. Native
Dynamic Type, glare, status-bar behavior, physical camera/Watch workflows, private
provider playback, and store delivery remain open. The unused HomeV3Screen export
is superseded by SandHomeScreen; its shared activity cards remain in use.

Checkpoint validation: the full `pnpm verify` gate passed with 117 browser checks.
The first local attempt used an inactive default server address; the passing run
used the review app ports. The final shared-token correction aligns photo dissolve
with the sand ground and passed all 22 UI unit tests, including new contrast and
dissolve invariants. Player iOS/Android exports passed; physical and store proof
remain separate requirements. Exact-commit CI is required before release.
