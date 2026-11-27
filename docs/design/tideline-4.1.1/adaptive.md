# Adaptive layout: width classes, iPhone Duo and iPad

Sources: Player canvas board `A-Adaptive-Rules` (Proposed 4.1.1, "the hand-off
for Pro" too) and the `DUO-*`, `IPAD-*`, `IOS-*` boards; the mobile plan
([`docs/plan/mobile.md`](../../plan/mobile.md) §2–3); the iOS 27 research brief
([`docs/plan/ios27-research.md`](../../plan/ios27-research.md), dated 27 Nov
2026), whose sources and "could not verify" list are kept below; and the
owner's requirements of 27 November 2026.

## Owner requirements (27 November 2026)

- Upgrade everything needed, including Expo, to the **latest stable release**
  (Expo SDK 58 / React Native 0.88 at the time of writing; re-check before
  starting). **Minimum iOS 26** (Liquid Glass always available; iOS 27
  features behind availability checks).
- Ship a **new TestFlight build** of both apps and **prepare the App Store
  submission** (iPhone, iPad and iPhone Duo screenshots, privacy labels, review
  notes, demo account). Only the owner releases to the App Store.
- **iPhone Duo open and half-open must be fully thought out**: every Player
  and Pro area has a designed open layout and a deliberate half-open
  behaviour, not a stretched phone screen.
- **Live Activity and Dynamic Island should be amazing** (boards
  `IOS-LiveActivity`, `IOS-Widgets`): live match score, next booking, coach
  day; Solar only for a live state.
- **Apple's on-device model for video, where it is valuable** (for example
  rally detection, highlight titling, clip summaries). The research found no
  official React Native or Expo binding for Foundation Models, so this needs a
  small native Swift Expo module (same pattern as
  `packages/expo-background-upload`), exposing `isAvailable`, degrading
  silently where Apple Intelligence is unavailable, and never sending video
  off-device for this purpose without the person's consent.
- Rulings: native apps use the **system tab bar** (iOS 27 turns it into the
  Duo's vertical bar and the iPad sidebar); Tideline's `TabBar` is for web.
  **No function exists on only one size; surfaces may.**

## Width classes

Lay out by the size the window actually has, never by device, idiom or
orientation (Apple lists `UIScreen.main.bounds`, `UIDevice.current.orientation`,
`userInterfaceIdiom == .phone` and "regular means iPad" as patterns to fix).

| Class    | Rule (R2 reconciliation, see note)              | Where it occurs (board `A-Adaptive-Rules`)                                                 |
| -------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Compact  | width < 560 pt                                  | iPhone (402 pt), Duo outer display (466 × 678), iPad slide-over and narrow split (~400 pt) |
| Regular  | everything that is neither compact nor expanded | Duo inner display (951 × 669 open, 669 × 951 half-open), iPad split at half width          |
| Expanded | width ≥ 740 and height ≥ 720                    | iPad full screen (834 × 1210 / 1210 × 834 on 11-inch; mini 756 × 1158)                     |

Note: the mobile plan proposed compact < 600, medium 600–839, expanded ≥ 840
by width alone; the board places the 951 pt-wide Duo inner display in
**regular** and the 756 pt-wide iPad mini and 834 pt-wide iPad portrait in
**expanded**, which a width threshold cannot do. The thresholds above
(compact < 560; expanded ≥ 740 wide and ≥ 720 tall) reproduce every placement
on the board, including the 669 pt-tall open Duo and the ~600–680 pt iPad half
split as regular; "medium" in the plan is "regular" here. The resolver's matrix
tests (mobile plan F2) must cover each device in the table. Duo point sizes are from the board; Apple has not
published them (see "Could not verify"), so read them from the live window, do
not hard-code them.

| Aspect     | Compact                                                                        | Regular                                                                                                                                                           | Expanded                                                                                        |
| ---------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Panes      | One; detail pushes over the list                                               | Two: list + detail or primary + secondary; on the Duo the fold is the seam, no control straddles it                                                               | Two or three: sidebar + list + detail, optional inspector (conditions, summary, notes)          |
| Navigation | System tab bar: Find · Play · + · Improve · Connect (Player); coach tabs (Pro) | Same system tab bar; on the Duo inner display iOS 27 moves it to a vertical bar on the leading edge (every item needs a symbol); on iPad split it stays a tab bar | System sidebar-adaptable tabs: the four verbs and New, then Wallet, Calendar, your club         |
| Type       | One Jost title per screen (28 pt), body 16, meta 13; 44 pt targets             | Same; the title sits in the primary pane only                                                                                                                     | Same plus pointer states; rows may tighten to 40 pt with a pointer, never below 44 pt for touch |
| Sheets     | Bottom sheets (search, +, filters, pay)                                        | Search, filters and details open in the secondary pane; pay stays a sheet                                                                                         | Search and filters are a side panel; details in the detail column; pay is a centred sheet       |

## iPhone Duo

- **Closed** (outer display): compact layout, full function.
- **Open** (inner display): regular layout with two panes split at the fold
  (`reservedRegions(kind: .division)` while folded); edge to edge with the
  iOS 27.1 SDK; tab bar becomes the vertical bar.
- **Half-open** (fold horizontal, propped): the **top region** is for content
  watched at a distance (score, video, drill), the **bottom region** is for
  touch (point buttons, timeline, controls). No continuously scrolling content
  runs across the fold. The hinge angle drives effects only, never layout.
  Boards: `DUO-Half-Live`, `DUO-Half-Score`, `DUO-Half-Film`, `DUO-Half-Lesson`.
- **Camera accessory**: while recording on the inner display, the outer display
  may show the score (`DUO-Accessory`; scene accessory, native).
- **Continuity**: opening, closing or resizing keeps the person's place and
  selection; nothing reloads to a home screen. Compact → regular: the pushed
  detail becomes the second pane; regular → compact: the second pane becomes
  the pushed detail with Back.
- **Safe areas** are asymmetric: respect the camera region and, only while
  folded, the fold's reserved region; `safeAreaInsets` alone is insufficient.
- **One window**: React Native supports one scene; the app adapts inside one
  window on iPad and the Duo (multiple windows are declared unsupported).
- Posture comes from a native module (`packages/expo-device-posture`, mobile
  plan F3) or `expo-hinge`, reporting `isAvailable` and falling back to window
  size.

## iPad

- Full screen: expanded (three columns where the board shows them:
  `IPAD-Home`, `IPAD-Find`, `IPAD-Book`, `IPAD-Improve`, `IPAD-Concierge`).
- Split at half width: regular; narrow split and slide-over: compact
  (`IPAD-Split`).
- Pointer and keyboard (`IPAD-Pointer`): hover states, shortcuts via a native
  module (mobile plan K1).
- Capability, not device, decides hardware features: Tap to Pay, Live
  Activities and HealthKit show a designed "not available on this device"
  state where unsupported.
- Health: HealthKit integration is US only (Owner, 2026-11-27); see the dated
  note in `AGENTS.md`. Do not build or remove health gating until
  `docs/HEALTH_PRIVACY.md` is updated.

## Verification matrix (every native screen package)

iPhone 17 Pro portrait plus Dynamic Type 200%; iPhone Duo closed, half-open
(130°) and open; iPad Pro 13" full, half and one-third width; iPad mini
portrait; light, dark, glare and live; reduced motion. Screenshots go under
`output/mobile/<wp>/` and in the PR (CI cannot run simulators).

## Research sources (from the iOS 27 brief)

- iPhone Duo announcement: https://apple.com/newsroom/2026/09/apple-unveils-iphone-duo/
- Duo forum summary (hinge states, size classes, vertical bars, `UIRequiresFullScreen`): https://developer.apple.com/forums/thread/847644
- Preparing for iPhone Duo (SDK behaviour table, patterns to fix, screenshots): https://developer.apple.com/iphone-duo/prepare/
- Duo Tech Talks (reserved regions, `ArrangementView`, half-open guidance): https://developer.apple.com/videos/play/tech-talks/111463/ and https://developer.apple.com/videos/play/tech-talks/111464/
- Duo HIG (not readable to the researcher): https://developer.apple.com/design/human-interface-guidelines/designing-for-iphone-duo
- Duo technology overview (not readable): https://developer.apple.com/documentation/technologyoverviews/preparing-your-app-for-iphone-duo
- iOS 27 what's new: https://developer.apple.com/wwdc26/guides/ios/ · session 292: https://developer.apple.com/videos/play/wwdc2026/292/
- Foundation Models, no official React Native binding: https://developer.apple.com/forums/thread/833676
- iPadOS 27: https://developer.apple.com/ipados/whats-new/ · press (secondary): https://9to5mac.com/2026/06/08/apple-unveils-ipados-27-with-speed-and-productivity-improvements-more
- watchOS 27: https://developer.apple.com/watchos/whats-new/
- Expo SDK 57: https://expo.dev/changelog/sdk-57 · SDK 58: https://expo.dev/changelog/sdk-58 · upgrade guide: https://expo.dev/blog/how-to-upgrade-to-sdk-58
- React Native 0.88 (scene lifecycle, single scene): https://reactnative.dev/blog/2026/10/19/react-native-0.88
- Expo native tabs: https://docs.expo.dev/router/advanced/native-tabs/ · `expo-hinge`: https://docs.expo.dev/versions/latest/sdk/hinge/ · `expo-widgets`: https://docs.expo.dev/versions/latest/sdk/widgets/
- App Store SDK requirements: https://developer.apple.com/news/upcoming-requirements/ and https://developer.apple.com/news/?id=k1mtkt1k · Duo submissions (secondary): https://www.macrumors.com/2026/10/05/apple-opens-iphone-duo-app-submissions/

## Could not verify (kept intact from the brief)

- Duo screen sizes in points.
- Content of the Duo HIG page, the Duo Technology Overview and the iOS 27 and watchOS release notes (returned empty).
- Live Activities, Wallet, Tap to Pay, passkeys, privacy, background tasks, StoreKit and sports/live-score changes in iOS 27.
- Primary detail on iPadOS 27 windowing, menu bar and inspectors.
- watchOS 27 Live Activities, workout session changes and gestures.
- State continuity between outer and inner displays.
- The Expo guide "Staying on SDK 57 with Xcode 27".
- `UIRequiresFullScreen` and supported-orientation behaviour (forum answers conflict).
- Any Expo or React Native wrapper for `reservedRegions`.
- The Expo SDK 58 versus RN 0.88 release-date discrepancy.
