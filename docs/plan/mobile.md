# Mobile plan: Tideline 4.1.1 for Player and Pro, with iPhone Duo and iPad layouts

The mobile work can't start on screens yet. Three things in the repo block it: the house rules require Satoshi, the Player shell is only now being split, and neither app has any way to lay itself out differently on a larger window.

All paths below are in `hq-product-media-variant-fix-20261125` unless marked `split:` (the `player-split-20261125` worktree) or `tideline:` (the `tideline-ui-sdk-20261125` worktree). I only read files; I built and ran nothing.

## 1. Ground truth

|                                      | Player (`apps/player`)                                                                                                                                                                                                                                                                                                                                                                                                                      | Pro (`apps/pro`)                                                                                                                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity                             | "Duna" 1.4.0, `com.duna.player`, team 4AMCKQA9GL, EAS `duna-player`, App Store Connect app 6796792115                                                                                                                                                                                                                                                                                                                                       | "Duna Pro" 1.3.0, `com.duna.pro`, EAS `duna-pro`, App Store Connect app 6796792651                                                                                                  |
| Navigation                           | No navigation library. `useState<Tab>` holds 15 tab values (`App.tsx:463`) plus about 40 `<Modal presentationStyle="pageSheet">` screens. Deep links are a hand-written parser (`split:src/app/deep-links.ts`).                                                                                                                                                                                                                             | Same pattern. `type Tab = "today" \| "calendar" \| "people" \| "more"` (`App.tsx:206`) plus modals.                                                                                 |
| Largest files                        | `App.tsx` 24,850 lines on main (807 KB); `video-studio.tsx` 10,731; `health-screen.tsx` 3,982; `messaging-screen.tsx` 3,586; `organization-experience.tsx` 2,779; `booking-management.tsx` 2,480. After PR 287 the shared style sheet `split:src/legacy/styles.ts` is 7,567 lines.                                                                                                                                                          | `App.tsx` 8,098 lines. Its style sheet starts at line 5154 (about 2,900 lines); CalendarScreen alone is about 1,640 lines. Then `messaging-screen.tsx` 1,868; `get-paid.tsx` 1,770. |
| Styles and tokens                    | `@duna/ui/mobile` (`packages/ui/src/mobile.ts`: 5-point grid, `dunaAppColors`, `resolveDunaMobileTokens`) plus the local `src/shared/palette.ts`. 73 raw hex values in App.tsx and 206 in video-studio.                                                                                                                                                                                                                                     | The same `@duna/ui/mobile` plus local colours; 32 raw hex values in App.tsx.                                                                                                        |
| Fonts                                | Satoshi, Fellix and Archivo files in `assets/fonts`, loaded at run time by `useFonts` in `satoshi-text.tsx`. Because they load in JavaScript, a font change can ship over the air.                                                                                                                                                                                                                                                          | Same arrangement.                                                                                                                                                                   |
| Icons                                | Custom SVG set in `duna-icon.tsx` (react-native-svg).                                                                                                                                                                                                                                                                                                                                                                                       | `lucide-react-native` 1.28.                                                                                                                                                         |
| State and data                       | `runtime.tsx` (`PlayerRuntimeProvider`): typed tRPC through `mobile-api.ts`, WorkOS sign-in through `@duna/mobile-auth`, SQLite outbox through `@duna/messaging-client`.                                                                                                                                                                                                                                                                    | `runtime.tsx` (`ProRuntimeProvider`): organisation-scoped `operator.*` calls.                                                                                                       |
| Native modules (written in the repo) | `modules/duna-health-kit` (375 lines Swift), `duna-watch-scoring` (385), `duna-video-capture` (3,540, HaishinKit)                                                                                                                                                                                                                                                                                                                           | none in the app; both apps use `@duna/expo-background-upload`                                                                                                                       |
| Config plugins                       | `with-watch-platforms`, `with-ios-release-compatibility` (Podfile patches, quoting for paths with spaces), `@bacons/apple-targets`, `@rnmapbox/maps`, expo-widgets, the Stripe plugin (Apple Pay), location, calendar, contacts, audio, image picker, video                                                                                                                                                                                 | `with-ios-path-compatibility`, LiveKit, WebRTC, Stripe Terminal (`tapToPayCheck`), camera, expo-build-properties (iOS 16.4), expo-widgets                                           |
| Map                                  | `discovery-map.tsx`: `mapbox://styles/mapbox/standard`, clustered ShapeSource that stops clustering after zoom 14, public token in `eas.json`                                                                                                                                                                                                                                                                                               | none                                                                                                                                                                                |
| Health                               | Read-only HealthKit with background delivery entitlement. `verify-mobile-runtime.ts` checks the entitlement and the read-only purpose strings. I found no adult-only gate in `health-screen.tsx`; check that the server enforces it.                                                                                                                                                                                                        | none                                                                                                                                                                                |
| Payments                             | Apple Pay through `native-payments.ts`                                                                                                                                                                                                                                                                                                                                                                                                      | Tap to Pay in `get-paid.tsx:565` (iPhone-only hardware)                                                                                                                             |
| Push and Live Activities             | `expo-notifications`; `DunaLiveActivity.tsx` built with `@expo/ui` SwiftUI; `widgets: []` (empty)                                                                                                                                                                                                                                                                                                                                           | Same; `DunaProLiveActivity.tsx`                                                                                                                                                     |
| Watch                                | `targets/DunaWatch` (SwiftUI, 1,273 lines, watchOS 10, `.watch` bundle suffix, accent `#2F6FB1`). `ContentView.swift` hard-codes `dunaOrange` and SF Rounded `.black`. Swipe handling is in `swipeGesture` (`ContentView.swift:328`). Scores sync over WatchConnectivity (`updateApplicationContext`, `sendMessage` falling back to `transferUserInfo`). The Watch app ships inside the Player binary, so it can never change over the air. | none                                                                                                                                                                                |
| Tests                                | Vitest on pure logic only (21 files, 90 tests on the split branch). No component, end-to-end or device tests.                                                                                                                                                                                                                                                                                                                               | Vitest, very few tests                                                                                                                                                              |

**Fragile points**

- `scripts/verify-design-system.ts` fails any font file that is not Satoshi, Fellix or Archivo. It requires the Satoshi files to exist and checks exact source strings for the Player dock, Home order and messaging exit.
- `AGENTS.md` says Satoshi is the only product typeface and limits mobile to 48/56 pt touch targets and Light, Dark and Match-device themes.
- The `ios/` folders are generated and git-ignored, so every native change goes through a config plugin.
- Worktree paths contain spaces; the path-quoting plugins exist because of this.
- `pnpm-workspace.yaml` sets a minimum release age, so any newly published dependency needs an exclusion entry.
- Weather is shown as emoji glyphs (`split:src/shared/weather.ts`); the new icon set retires them.
- Pro's Duna AI has its own permission and confirmation gates; the redesign must keep them.

**The Player split (PRs 286 and 287).** PR 286 (`da03d57`) adds the guardrails: contracts located by component instead of file path, lint by glob, and a line budget on the entry file. PR 287 is stacked on 286. It is mechanical:

- `App.tsx` goes from 24,850 lines to 27; `DunaApp.tsx` is 941 lines.
- It creates 62 feature modules under `src/features/*` and deletes 302 unused style keys.
- The entry-file budget test is set to 40 lines.
- Both PRs pass `release-gate` and `mobile-bundles`. The author states it was never run on a device.

**Both must merge before any redesign work.** Every Player package below edits `src/features/*` or `src/app/*`, which do not exist on main. Before publishing anything over the air, smoke-test a development build of PR 287 on the simulator. Close the stale, conflicting PR 270 ("sand design") so agents don't revive it. PR 289 touches no mobile files.

**Tideline worktree.** It is on **Tideline 3.1** tokens (`tokens.json`: tide blue, Geist, no Night Court, Salt or Jost). Its components are web-only (`@ui-sdk/react`, DOM). Usable pure logic: `booking-state.ts`, `date-utils.ts`, `add-players-logic.ts`, `interaction-core.ts`, and the `token-build.ts` generator. The 4.1.1 `tokens.json` has to replace 3.1 before either platform consumes it.

## 2. Adaptivity today

- **Deployment target.** Pro is pinned to iOS 16.4. Player is not pinned (Expo default; React Native's floor is 15.1). Watch is watchOS 10. Both apps use the New Architecture: it is mandatory on React Native 0.86 and Expo SDK 57.
- **`supportsTablet: true` in both apps.** Neither sets `UIRequiresFullScreen`, so both run in iPad windows of any size.
- **Orientation.** `orientation: "default"`. Player allows portrait and both landscapes on iPhone, and all four orientations on iPad. `video-studio.tsx:4017` locks orientation; that lock is ignored in resizable iPad windows.
- **Phone-width assumptions.**
  - There is no iPad detection anywhere: no `isPad` and no device-type checks.
  - `useWindowDimensions` is used in 5 places in Player App.tsx and 2 in Pro, only for small tweaks.
  - Fixed caps (`maxWidth: 300/420/430/440/560`) are spread through App.tsx styles.
  - The video transfer banner is absolutely positioned at `bottom: 94` to clear the tab bar (`split:src/legacy/styles.ts`).
  - The tab bars are custom absolute docks.
  - The 40 `pageSheet` modals become centred form sheets on iPad, which is the "stretched phone" look.
- **Safe areas.** `react-native-safe-area-context` is used throughout (51 references in the two App.tsx files). It is correct for notches; it does not model a hinge.
- **Window changes.** Nothing handles size classes, split view, Stage Manager or posture.

**Proposed layout primitives** (new: `packages/ui/src/native/layout/`, exported as `@duna/ui/native/layout`)

| File                   | Contents                                                                                                                                                                                                                                  |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resolve-layout.ts`    | A pure function: `{width, height, fontScale, posture?, hingeRect?}` goes to `{widthClass: compact <600 \| medium 600–839 \| expanded ≥840, heightClass, panes: 1\|2\|3, fold: null\|{axis, rect}}`. Unit-tested over a matrix of devices. |
| `use-layout.ts`        | `useWindowDimensions` plus the posture provider. A context for the measured content size inside a pane, because a pane is narrower than the window.                                                                                       |
| `AdaptiveScaffold.tsx` | A primary list plus optional detail plus optional inspector. It collapses to a stack when compact.                                                                                                                                        |
| `FoldScaffold.tsx`     | Half-open posture puts content above the hinge and controls below it. Open posture uses two panes split at the hinge rect, never across it. Closed posture uses the compact layout.                                                       |
| `AdaptiveSheet.tsx`    | A bottom sheet when compact; an inspector pane or popover when regular. This replaces direct `<Modal pageSheet>` use in feature code.                                                                                                     |
| `NavigationChrome.tsx` | Phone: the four-verb tab bar with the centre + action. Regular width: a sidebar rail. Both read one route model.                                                                                                                          |

In each app, `src/app/router.ts` becomes a pure reducer (`{section, stack[], detail?, sheet?}`) with typed routes. Deep links map into routes. `DunaApp` renders `NavigationChrome` and `AdaptiveScaffold` from that state.

My recommendation is to keep this router in JavaScript rather than adopt React Navigation or Expo Router. It works with the existing modal architecture, needs no new native navigation dependency (so it stays over-the-air compatible), and the pane logic has to live in JavaScript anyway.

**What JavaScript alone can do and what needs native code**

| Capability                                      | React Native / Expo only                                    | Needs native code                                                                                                                                                                                                                     |
| ----------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Width classes, split view, Stage Manager resize | yes (`useWindowDimensions`)                                 |                                                                                                                                                                                                                                       |
| Duo posture, hinge angle and hinge rectangle    |                                                             | New Expo module `packages/expo-device-posture` (Swift, same pattern as `packages/expo-background-upload`). It wraps whatever API the researcher confirms, falls back to a heuristic based on aspect ratio, and exposes `isAvailable`. |
| Sidebar that adapts from the tab bar            | JavaScript rail (recommended)                               | A native sidebar would need a SwiftUI `TabView` via `@expo/ui`. The custom centre + makes that a poor fit.                                                                                                                            |
| Pointer hover                                   | Check `Pressable onHoverIn/onHoverOut` on iPadOS in a spike | If the spike fails, a small native view                                                                                                                                                                                               |
| Keyboard shortcuts                              |                                                             | Native (`UIKeyCommand` module or SwiftUI `.keyboardShortcut` hosted through `@expo/ui`)                                                                                                                                               |
| Drag and drop (film to a thread)                |                                                             | Native (`UIDragInteraction`). I recommend deferring it.                                                                                                                                                                               |
| Multiple windows (scenes)                       |                                                             | Native `AppDelegate` and scene work. Declare unsupported for this release.                                                                                                                                                            |
| Live Activities                                 | Existing `expo-widgets`/`@expo/ui`                          | New binary when the target changes; iPhone only                                                                                                                                                                                       |
| Widgets and App Intents                         |                                                             | New Swift targets via `@bacons/apple-targets`/`expo-widgets`; support for App Intents needs confirming                                                                                                                                |
| Liquid Glass                                    | `@expo/ui` `glassEffect` (`liquid-glass-surface.ios.tsx`)   |                                                                                                                                                                                                                                       |

## 3. Native design-system layer

**Where it lives**

| Piece             | Location                                                                                         | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tokens source     | The 4.1.1 `packages/ui/src/tideline/tokens.json` from the Tideline branch, owned by the web lead | `token-build.ts` gains a builder that emits `tokens.native.ts` (hex and number values, three themes, zones). The mobile packages only read the generated file.                                                                                                                                                                                                                                                                                           |
| Native foundation | New `packages/ui/src/native/` behind the subpath export `@duna/ui/native`                        | Theme provider (editorial, athletic and live zones; light, dark and glare), `TitleText`, `Text`/`Mono`, icons, motion (Rise, Rally, Cross; no bounce; reduced motion), eight loaders, the first-open sequence                                                                                                                                                                                                                                            |
| Shared pure logic | New package `packages/tideline-core`: no React, no DOM, no clock                                 | Score state per match status, rating-ring arcs, day-strip counts, duration choices from the club's enabled set (60/90/120/180), light marks (golden hour, lights, dark: sun calculation from latitude, longitude and date), conditions-line text, map pin tier by zoom, Concierge context types, the drill scene model (taken out of `apps/hq/components/training-court-animation.tsx` and the `TrainingDrill` contract). Web and native both import it. |
| Fonts             | `packages/ui/assets/fonts/` (Jost-Medium, Geist, Geist Mono) plus `useTidelineFonts()`           | Loaded in JavaScript as now. Record the licence files in `docs/licenses/`.                                                                                                                                                                                                                                                                                                                                                                               |
| Components        | `packages/ui/src/native/components/<family>/`                                                    | Families: NetScore, ScoreCard, RatingRing, ClubMark, Crest, DayStrip, TimeSlots, DurationChoices, LightMark, WeatherMark, ConditionsLine, MembershipCard, Concierge parts (ThreadRow, ContextChip, Bubble, Composer, SendCard), search parts, MapPin. Built on `react-native-svg`, which is already installed.                                                                                                                                           |
| Mapbox layers     | `apps/player/src/features/find/map/`                                                             | `@rnmapbox` stays out of `packages/ui`. Keep the Standard style and add a `RasterSource` of `mapbox.satellite` with a minimum zoom of max zoom minus 3, rather than swapping styles. Pins use `SymbolLayer` plus `Images` (club marks), not `MarkerView`.                                                                                                                                                                                                |

`TitleText` enforces the type rules in code. It takes `children: string`, defaults to Jost Medium 500 at 22 pt minimum, and in development throws if the text contains a digit or appears more than once per screen.

**Separate per platform:** all rendering (DOM versus native views), CSS, `@ui-sdk/*`, gestures and haptics. Do not import `@duna/ui` (the root index re-exports DOM `web.tsx`) or `@duna/ui/tideline` into native code. Add a lint restriction for this.

## 4. Release reality

- **Builds.** EAS Build only; `ios/` is generated. Profiles: development, preview, preview-simulator, testflight (store distribution, auto-increment), production. `appVersionSource: remote`; credentials are held by EAS. The `testflight` submit profile has the App Store Connect app ID. The `production` submit profile is `{}`, so no production App Store submission has ever been set up. Git history shows TestFlight builds were made earlier (#167, #168, #246, #265).
- **Over-the-air updates.** `runtimeVersion.policy: appVersion`, update URLs are configured, channels match the profile names, and every update must name its EAS environment explicitly.
- **Watch.** Built and signed inside the Player binary. Every Watch change needs a new Player build and a paired-device test.
- **CI** (`.github/workflows/verify.yml`, Ubuntu): `verify:mobile-runtime` and the two `expo export` runs, plus `pnpm verify` (lint, typecheck, Vitest, design-system verifier). There is no iOS compile, no prebuild, no simulator run and no signing.

**What "push to production" can honestly mean:**

1. Merged to `main` with CI green.
2. Set both apps to version **2.0.0** (Player is on 1.4.0, Pro on 1.3.0). Because of the `appVersion` policy, the new JavaScript cannot reach old binaries.
3. EAS `testflight` builds for both apps, submitted to TestFlight with build IDs and commit hashes recorded.
4. Internal TestFlight testing.
5. App Store release, which only the owner can do.

An over-the-air update alone is not enough for this work. New icons, splash and Crest, the posture module, the Watch restyle and the deployment-target change are all native.

**Steps that need the owner's Apple account or approval:**

1. Approve the changed house rules: Jost/Geist replace Satoshi in `AGENTS.md` and the font guide.
2. Choose the minimum iOS version. I recommend 26 so Liquid Glass is always available, with iOS 27 features behind availability checks.
3. Confirm EAS has a build image with Xcode and the iOS 27 SDK. If not, local archives signed by the owner.
4. Regenerate provisioning profiles when capabilities change (Apple ID two-factor through `eas credentials`).
5. Tap to Pay distribution entitlement (still pending).
6. Pass Type ID and certificates if membership cards are added to Apple Wallet.
7. External TestFlight groups and beta review.
8. Fill the production submit profile (`ascAppId`) and do the App Store submission: iPhone **and iPad** screenshots (required because `supportsTablet` is true), privacy labels including HealthKit, review notes and a demo account.
9. Release decision and phased rollout.

## 5. Work packages

Hot spots, one owner per wave:

| Hot spot                                                        | Owner                                                                                    |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `split:apps/player/src/app/DunaApp.tsx` and `router.ts`         | P0, then each later wave's integrator                                                    |
| `apps/pro/src/app/*`                                            | R0                                                                                       |
| `packages/ui/package.json` exports and `src/native/index.ts`    | F1 (component families add their own barrel files; F1 merges them)                       |
| `app.json`, `eas.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` | N1 only                                                                                  |
| `scripts/verify-design-system.ts`, `AGENTS.md`, `docs/design/*` | G1, then each wave's integrator appends contracts                                        |
| `tokens.json`, `token-build.ts`                                 | Web lead (F0 coordinates with them)                                                      |
| `split:src/legacy/styles.ts`                                    | Nobody edits it. New screens use their own style sheets; X1 deletes what becomes unused. |

**Wave 0: gates, run in sequence**

| WP                    | Goal                                                                                                                                                                                                                                                      | Files owned                                                                                | Depends on     | Tests                                                | Model |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------- | ---------------------------------------------------- | ----- |
| G0 Merge split        | Simulator smoke test of PR 287 (iPhone), then merge 286, then 287; close PR 270                                                                                                                                                                           | PR branches                                                                                | –              | Existing CI; screenshots of Home, Discover, Messages | Cheap |
| G1 House-rules change | `AGENTS.md`, the font guide, new `docs/design/tideline-4-native.md`. In the verifier: allow Jost/Geist, stop requiring Satoshi, retire the dock, Home-order and Satoshi-only string checks, add Tideline checks (Solar only in the live zone, no orange). | `AGENTS.md`, `docs/design/*`, `scripts/verify-design-system.ts`, `verify-readable-type.ts` | Owner approval | `pnpm verify:design-system`                          | Top   |

**Wave 1: foundations, in parallel**

| WP                | Goal                                                                                                                                             | Files owned                                                                                                                 | Must not touch   | Depends on              | Tests                                             | Simulator check                                                       | Risk   | Model |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ---------------- | ----------------------- | ------------------------------------------------- | --------------------------------------------------------------------- | ------ | ----- |
| F0 Native tokens  | `tokens.native.ts` generator and generated output                                                                                                | `tideline/token-build.ts` (native builder only), `src/native/tokens.ts`                                                     | apps             | 4.1.1 tokens.json       | Snapshot of generated output                      | –                                                                     | Medium | Cheap |
| F1 Foundation     | Theme, type, fonts, icons (24 grid, 1.75 stroke), motion, 8 loaders                                                                              | `packages/ui/src/native/{theme,type,icons,motion,loaders}/`, `index.ts`, `packages/ui/package.json` exports, `assets/fonts` | apps             | F0, G1                  | Vitest on theme resolution and title rules        | Gallery on iPhone                                                     | Medium | Top   |
| F2 Layout         | Resolver, hooks, scaffolds, AdaptiveSheet                                                                                                        | `packages/ui/src/native/layout/`                                                                                            | apps             | F1                      | Device matrix for the resolver                    | Gallery on iPhone, Duo (closed, half open, open), iPad full and split | High   | Top   |
| F3 Posture module | `packages/expo-device-posture` (Swift and TypeScript)                                                                                            | the new package                                                                                                             | apps' `app.json` | iOS 27 API brief        | TypeScript fallback tests                         | Duo in all postures via `set_posture`                                 | High   | Top   |
| F4 Shared logic   | `packages/tideline-core`                                                                                                                         | the new package                                                                                                             | `packages/ui`    | –                       | Full Vitest coverage, including sun-time fixtures | –                                                                     | Low    | Cheap |
| F5 Pro split      | Mechanical split of Pro's App.tsx in the same style as PR 287, plus a line budget                                                                | `apps/pro/**`                                                                                                               | `packages/*`     | –                       | Line-budget test; typecheck; export               | Smoke test of the four tabs on iPhone                                 | Medium | Cheap |
| N1 Native config  | Version 2.0.0, deployment target via expo-build-properties (both apps), Crest icons and splash, orientation, posture-module dependency, lockfile | `apps/*/app.json`, `eas.json`, `assets/icon*`, splash, `package.json`, `pnpm-lock.yaml`                                     | source code      | F3, owner's iOS minimum | `verify:mobile-runtime`                           | preview-simulator build launches on all devices                       | High   | Top   |

**Wave 2: component families, in parallel, each in its own folder**

| WP  | Components                                                                                      | Depends on               | Model |
| --- | ----------------------------------------------------------------------------------------------- | ------------------------ | ----- |
| C1  | NetScore, ScoreCard (one state per match status, using the F4 score-state function), RatingRing | F1, F4                   | Top   |
| C2  | DayStrip with counts, TimeSlots, DurationChoices, LightMark, WeatherMark, ConditionsLine        | F1, F4                   | Cheap |
| C3  | Crest, ClubMark, MembershipCard, Avatar                                                         | F1                       | Cheap |
| C4  | Concierge: ThreadRow, ContextChip, Bubble, Composer, SendCard (recipients and channels)         | F1, F2                   | Top   |
| C5  | Where/When/What search sheet parts, result row, MapPin tiers                                    | F1, F4                   | Cheap |
| C6  | Phone tab bar with centre +, sidebar rail, headers, list rows, buttons, first-open sequence     | F1, F2                   | Top   |
| C7  | Developer gallery screens in both apps, shown only in preview builds                            | all of C1–C6 (read only) | Cheap |

Tests for every family: Vitest on prop logic, plus gallery screenshots on iPhone, Duo open and iPad.

**Wave 3: Player screens.** Each WP owns `split:src/features/<area>/` and must not touch other feature folders, `legacy/styles.ts` or `DunaApp.tsx` (P0 excepted). Target size is 300 to 1,500 changed lines each.

| WP                           | Goal                                                                                                                                           | Depends on | Notable risk                                                      | Model                 |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------- | --------------------- |
| P0 Shell and router          | Find / Play / Improve / Connect plus centre +, route reducer, old deep links redirected, NavigationChrome, AdaptiveScaffold                    | C6, F2     | Deep-link regressions; tests on the reducer and the deep-link map | Top                   |
| P1 Home                      | Next up and conditions; keeps the rule that Next up comes from future bookings only                                                            | P0, C2     | –                                                                 | Cheap                 |
| P2 Find                      | Search sheet, list and map; satellite at the last three zooms; pins by zoom                                                                    | P0, C5     | Mapbox performance                                                | Top                   |
| P3a Book a court             | Rewrite `courts/VenueBookingModal.tsx`: day strip, slots, durations, light, weather                                                            | P0, C2     | Hold and checkout semantics unchanged                             | Top                   |
| P3b Lessons, matches, events | Rewrite of `events/`, `pickup/`                                                                                                                | P0, C1     | –                                                                 | Cheap                 |
| P4a Rating and results       | Rating ring and score cards                                                                                                                    | P0, C1     | –                                                                 | Cheap                 |
| P4b Film library             | Library, heart-rate overlay, share to coach or club. First extract the library and overlay into `features/film/`; leave capture code alone.    | P0         | `video-studio.tsx` (10.7k lines); health consent                  | Top                   |
| P4c Health                   | Adults only (client gate plus a server check), read only; hidden when HealthKit is unavailable                                                 | P0         | Privacy                                                           | Top                   |
| P5a Concierge                | Threads tied to a lesson, match, tournament, league or club                                                                                    | P0, C4     | Messaging-cursor correctness                                      | Top                   |
| P5b Wallet                   | Club membership cards                                                                                                                          | P0, C3     | Apple Wallet gate                                                 | Cheap                 |
| P6 Remaining                 | Profile, organisation, calendar, Pro Tour restyle                                                                                              | P0         | –                                                                 | Cheap                 |
| P7 Watch restyle             | Colours, fonts and assets only in `ContentView.swift` and `Assets.xcassets`. `swipeGesture` and `WatchScoringStore.swift` stay byte-identical. | N1         | Interaction regression                                            | Cheap with Top review |

**Wave 4: Pro screens** (can run alongside Wave 3 once F5 is done)

| WP                              | Goal                                                                                                                                                                                             | Depends on | Model |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ----- |
| R0 Pro shell                    | Coach tabs, router, sidebar                                                                                                                                                                      | F5, C6     | Top   |
| R1 Today and Schedule           | Agenda, by court, by coach; one-line conditions; light icon beside the time                                                                                                                      | R0, C2     | Top   |
| R2 Session, Courtside, Check-in | Live zone, offline scoring unchanged                                                                                                                                                             | R0, C1     | Top   |
| R3 People and Inbox             | Concierge Send card; AI review gate kept                                                                                                                                                         | R0, C4     | Top   |
| R4 Create, Get paid, Money      | Tap to Pay hidden on iPad and wherever the reader is unsupported                                                                                                                                 | R0         | Top   |
| R5 Availability and programmes  | Availability, blackouts, programmes and practices. Training procedures already exist (`router.ts:8868`, `training:read`); a coach's own availability may need API work from the backend planner. | R0         | Cheap |
| R6 Coach mode and drills        | Coach mode, drill library, 2D drill player (react-native-svg on the F4 scene model). The 3D player is deferred because it needs a GL native dependency.                                          | R0, F4     | Top   |

**Wave 5: native and adaptive polish.** K1 keyboard shortcuts and pointer hover; K2 widgets for next-up and the Pro day (`expo-widgets`); K3 App Intents (only if the spike confirms support); X1 delete legacy style keys and retired assets; X2 release (sections 4 and 6).

**Simulator matrix for every screen WP:**

- iPhone 17 Pro in portrait, plus Dynamic Type at 200%
- iPhone Duo closed, half open (at 130°) and open
- iPad Pro 13" full screen, plus half and one-third width windows
- iPad mini portrait
- Light, dark, glare and live zones; reduced motion

Save screenshots under `output/mobile/<wp>/`. CI cannot run simulators, so this evidence is part of the PR.

## 6. Ten likely failures and their guardrails

1. **The house rules fight the design.** Agents revert to Satoshi or CI goes red. _Guardrail:_ G1 lands first; the verifier checks for Tideline instead.
2. **Merge collisions** in DunaApp, `legacy/styles.ts` or Pro's App.tsx. _Guardrail:_ the owner table above, feature-folder ownership, `legacy/styles.ts` frozen, entry line budgets in both apps.
3. **Stretched phone screens on iPad.** _Guardrail:_ a verifier rule that bans `Dimensions.get`, `<Modal pageSheet>` and widths of 300 or more inside `features/`. Screens must use the scaffolds. The resolver has matrix tests. Screenshots are required in each PR.
4. **The Duo API, the iOS 27 SDK or the EAS build image isn't ready.** _Guardrail:_ the posture module reports `isAvailable` and falls back to window size; F3 does a de-risking spike; a local signed archive is the fallback.
5. **Over-the-air mismatch:** new JavaScript reaches a binary without the posture module. _Guardrail:_ version 2.0.0 means a new runtime; use `requireOptionalNativeModule`; never publish over the air before the 2.0.0 binaries are on TestFlight.
6. **The Watch interaction regresses.** _Guardrail:_ a CI diff check that `swipeGesture` and `WatchScoringStore.swift` are unchanged; a paired Watch simulator test of up, down, left and right swipes and reconnect.
7. **Health privacy breach** through the heart-rate overlay shared to coaches, or health shown to minors. _Guardrail:_ enforce the grants in `HEALTH_PRIVACY.md` on the server, add a client adult gate, keep the `verify-mobile-runtime` checks, add tests for sharing scopes.
8. **Hardware-specific features shown where they can't work:** Tap to Pay, Live Activities or HealthKit on iPad or the Duo. _Guardrail:_ capability checks only, never device-name checks; the "unavailable" states are designed.
9. **Map performance and visuals:** too many club-mark markers, or flicker from style swaps. _Guardrail:_ SymbolLayer and Images, the satellite raster layer described above, a pin cap per zoom tier, a device test.
10. **Misreporting the release.** "Production" claimed when it's only a TestFlight build, or App Store review rejects for missing iPad screenshots or HealthKit/Live Activity justification. _Guardrail:_ follow the handoff checklist in `START_HERE.md` (build IDs, source commits) and the owner checklist in section 4. Never claim an App Store release.

Also watch for:

- Dynamic Type at 200% breaking the fixed tab bar and the `bottom: 94` banner. Use measured insets.
- Reduced motion. Every motion primitive takes a static variant.

### Critical files for implementation

- /Users/journeysuttonm5max/Duna Project Worktrees/player-split-20261125/apps/player/src/app/DunaApp.tsx
- /Users/journeysuttonm5max/Duna Project Worktrees/hq-product-media-variant-fix-20261125/apps/pro/App.tsx
- /Users/journeysuttonm5max/Duna Project Worktrees/hq-product-media-variant-fix-20261125/packages/ui/src/mobile.ts (to be superseded by `packages/ui/src/native/`)
- /Users/journeysuttonm5max/Duna Project Worktrees/hq-product-media-variant-fix-20261125/scripts/verify-design-system.ts
- /Users/journeysuttonm5max/Duna Project Worktrees/hq-product-media-variant-fix-20261125/apps/player/app.json and apps/pro/app.json, together with /Users/journeysuttonm5max/Duna Project Worktrees/tideline-ui-sdk-20261125/packages/ui/src/tideline/token-build.ts
