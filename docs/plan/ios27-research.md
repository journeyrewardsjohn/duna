# iOS 27 / iPhone Duo / iPadOS 27 brief for Duna (as of 27 Nov 2026)

Web search worked. Several Apple pages (HIG, Technology Overview, release notes) returned title-only to my fetcher, so for those I relied on Apple's own Developer Forums summary and Tech Talks. Coverage is uneven, and gaps are listed at the end.

## 1. iPhone Duo

**What it is (shipping).** Apple unveiled it in September 2026. It has a 7.6-inch inner display and a 5.4-inch outer display of the same aspect ratio. Pre-orders were 16 Oct and sales began 23 Oct 2026, at $1,999 US. It ships with iOS 27.1. https://apple.com/newsroom/2026/09/apple-unveils-iphone-duo/

- Postures per Apple: closed one-handed, fully open, propped up hands-free, and flipped so content switches display. Same URL.
- The device does not use a single "pose" value. Apple's forum summary says hinge state is closed, partially open or fully open, and "there's no single system-provided pose value." https://developer.apple.com/forums/thread/847644
- Which screen is active: the system decides. Scene accessories appear on the outer display when the system chooses. PiP moves outside only when the device is closed. New windows can only be created on the inner display. Same forum URL.
- **Point sizes: not published** in anything I could reach. Apple says not to hard-code sizes and to use `view.bounds` instead. https://developer.apple.com/iphone-duo/prepare/

**Layout model.**

- Apple's compatibility table: apps built with the iOS 26 SDK or earlier run but do not adapt (centred when open, left of the status bar and camera when closed). The iOS 27 SDK resizes to most of the inner display but still avoids the status bar on the right edge. The iOS 27.1 SDK or later goes edge to edge on both displays, with toolbars and tab bars moving to vertical bars. https://developer.apple.com/iphone-duo/prepare/
- Size classes: the outer display is compact horizontal in portrait, and the inner display is regular in both. Layout should not branch on idiom or orientation. https://developer.apple.com/forums/thread/847644
- `UIRequiresFullScreen`: Apple's forum summary says the device honours it, but also says to remove it and adopt size-class resizing. The forum thread also has conflicting answers on supported orientations, so treat that as unclear. Same URL.
- Patterns to fix, listed by Apple: `UIScreen.main.bounds`, `UIDevice.current.orientation`, `userInterfaceIdiom == .phone`, and `horizontalSizeClass == .regular` assumed to mean iPad. https://developer.apple.com/iphone-duo/prepare/

**Hinge and layout APIs.**

- `onHingeChange` (SwiftUI) and `UIHingeInteraction` (UIKit) are for effects, not layout. https://developer.apple.com/forums/thread/847644
- `reservedRegions(kind:)` with `.division` for the fold and `.occlusion` for the camera. Division is active only when folded. https://developer.apple.com/videos/play/tech-talks/111463/
- `ArrangementView` and `UIArrangementViewController` take a primary and a secondary view, in split or overlay style. Apple's transcript says system arrangements are usable in apps in iOS 27.1. Same Tech Talk URL.
- Vertical bars: `toolbarVerticalEdge`, `verticalBarEdge`, `toolbarVerticalBehavior`. Toolbar items need a symbol to appear in a vertical bar. https://developer.apple.com/forums/thread/847644
- Web: Viewport Segments and Device Posture are experimental, behind a Safari flag in 27.1. Same URL.

**Half-open ("tabletop") guidance.** Apple's Tech Talk says that when the device is propped on a table, the top region suits content viewed at a distance and the bottom suits interactive controls such as media controls. It also says not to move continuously scrolling content across the fold. https://developer.apple.com/videos/play/tech-talks/111463/ It does not endorse a bespoke layout per hold. https://developer.apple.com/forums/thread/847644

**Continuity, camera, safe areas.**

- Multiple scenes: this is the first iPhone to support multiple instances of an app's UI. Use `UIWindowSceneActivationAction`. https://developer.apple.com/videos/play/tech-talks/111464/
- Camera accessory: `CameraCaptureAccessory` via `.sceneAccessory` shows supplementary UI on the outer display, only when the app is full screen on the inner display with an active capture session. Same URL.
- `AVCaptureDeviceDirectionCoordinator` tracks the forward-facing camera as the device opens and closes, and touches under an uncovered camera region can be suppressed. https://developer.apple.com/forums/thread/847644
- Safe areas are asymmetric. Apple says `safeAreaInsets` alone is insufficient and to query `reservedRegions`. Same URL.
- Apple did not describe how state carries between the two screens in the pages I read (see "Could not verify").

**HIG and docs.** Designing for iPhone Duo (HIG): https://developer.apple.com/design/human-interface-guidelines/designing-for-iphone-duo. Technology overview: https://developer.apple.com/documentation/technologyoverviews/preparing-your-app-for-iphone-duo. Both returned no body text to me, so I did not read them. Hub page and six Tech Talks: https://developer.apple.com/iphone-duo/

**Simulators.** The Xcode 27.1 Device Hub simulates closed, open and partially folded poses. Resizable iPhone and iPhone Mirroring are only an approximation, and Apple still wants dedicated Duo testing for vertical bars and reserved regions. https://developer.apple.com/forums/thread/847644 and https://developer.apple.com/iphone-duo/prepare/

## 2. iOS 27 for apps like this

Apple's "what's new" page gives no per-feature minimum OS. The minimum is iOS 27 for everything below unless noted. https://developer.apple.com/wwdc26/guides/ios/

- **Design, tabs, navigation, search:** "refreshed materials, refined typography, and updated tab and navigation bars." Standard SwiftUI/UIKit bars pick this up when rebuilt. Not native-only. Session: https://developer.apple.com/videos/play/wwdc2026/292/
- **Widgets:** WidgetKit widgets can be customised through App Intents and dynamic styling (SwiftChronicle also lists a new `systemExtraLargePortrait` family, secondary source). Needs a native widget target. https://developer.apple.com/wwdc26/guides/ios/
- **App Intents:** entity schemas feed the Spotlight semantic index, intent schemas allow natural-language actions, a View Annotations API maps on-screen content to entities, and there is an App Intents Testing framework. Native Swift. Same URL.
- **Foundation Models:** Swift API to the on-device Apple Intelligence model. It adds multimodal prompts, third-party models via a Language Model protocol, and Private Cloud Compute (free for Small Business Program apps under 2 million first-time downloads). Native Swift. Same URL. Apple states no official React Native binding. https://developer.apple.com/forums/thread/833676
- **Core AI:** new framework to run your own models on-device. Native. https://developer.apple.com/documentation/CoreAI
- **HealthKit:** workout zones (heart rate and cycling power) and a menopausal-state API. https://developer.apple.com/documentation/healthkit/accessing-workout-zone-data/ Native module needed.
- **Camera:** Center Stage front camera support. https://developer.apple.com/videos/play/wwdc2026/341/
- **UIKit:** new layouts adapting for iPhone Mirroring. https://developer.apple.com/wwdc26/guides/ios/
- **Scene lifecycle:** apps built with the iOS 27 SDK must use UIScene or they fail to launch. https://reactnative.dev/blog/2026/10/19/react-native-0.88
- **MapKit:** only secondary coverage (new point-of-interest categories). https://miniswift.run/whats-new/mapkit/ Unverified from Apple.
- **Live Activities, Wallet, Tap to Pay, passkeys, privacy, background tasks, StoreKit, sports-specific:** I found no primary source (see end).

## 3. iPadOS 27

- Apple's "what's new" pages describe only refreshed materials and tab/navigation bars, UIKit layouts for iPhone Mirroring, and the same SwiftUI items. https://developer.apple.com/ipados/whats-new/
- Press-level coverage: an always-visible menu bar option, faster window gestures, resizable iPhone apps. https://9to5mac.com/2026/06/08/apple-unveils-ipados-27-with-speed-and-productivity-improvements-more (secondary)
- Apple's Duo Tech Talk says to use `UISplitViewController` or `NavigationSplitView` for multi-column layouts, collapsing to one stack when narrow, and to avoid idiom checks. https://developer.apple.com/forums/thread/847644
- Expo says native tabs gain `preferredPlacement="sidebar"` and a "prominent" tab, needing SDK 58 and Xcode 27. https://docs.expo.dev/router/advanced/native-tabs/
- Primary-source detail on iPadOS 27 windowing, menu bar and inspectors is **unverified** here.

## 4. watchOS 27

- Apple lists workout zones in HealthKit, a menopause API, Foundation Models on watch, and Vision on watch. https://developer.apple.com/watchos/whats-new/
- Widget updates over WatchConnectivity and Smart Stack changes appear only in a session summary I could not open. Session: https://developer.apple.com/videos/play/wwdc2026/8014/
- Live Activities on the Watch, workout session API changes and gestures: **unverified**.

## 5. React Native and Expo reality

- **SDK 57 (RN 0.86):** announced 30 Jun 2026. It does not default to the scene lifecycle. `expo@57.0.23` adds opt-in via `ios.enableSceneSupport` in `expo-build-properties`. https://expo.dev/changelog/sdk-57 The "Staying on SDK 57 with Xcode 27" guide was not retrievable.
- **SDK 58 (RN 0.88):** built for iOS 27, scenes by default, and apps built with the iOS 27 SDK become resizable automatically. https://expo.dev/changelog/sdk-58 Expo says SDK 58 is Duo-ready on release day. EAS `sdk-58` and `latest` images point to Xcode 27.1. https://expo.dev/blog/how-to-upgrade-to-sdk-58
- **RN 0.88:** adds a SceneDelegate entry point. Single scene only (`UIApplicationSupportsMultipleScenes` must stay false), so iPad multiple windows are not supported in React Native. `useWindowDimensions` updates on resize. https://reactnative.dev/blog/2026/10/19/react-native-0.88
- **Duo/foldable packages (SDK 58):** `expo-hinge` (iOS 27.1+, Android 11+; `useHinge`, `useAnimatedHinge`; hinge for effects, not layout) https://docs.expo.dev/versions/latest/sdk/hinge/. Expo UI `ArrangementView`, `NavigationSplitView`, `Toolbar`, `NavigationStack`. Native tabs and toolbars are stable in Expo Router. https://expo.dev/changelog/sdk-58
- **Native tabs:** `expo-router/native-tabs` on SDK 58. Limits: no nesting, limited FlatList scroll behaviours, no runtime tab changes, and the sidebar and prominent options need Xcode 27. https://docs.expo.dev/router/advanced/native-tabs/
- **Widgets and Live Activities:** `expo-widgets` (SDK 58 docs). Widgets run in an isolated runtime with only `@expo/ui` components, and need a dev build. https://docs.expo.dev/versions/latest/sdk/widgets/
- **App Intents:** `expo-app-intents` is alpha. https://expo.dev/changelog/sdk-58
- **Glass:** `expo-glass-effect` reports `isLiquidGlassAvailable` true with the iOS 27 SDK. Same URL.
- **On-device models:** no official Expo or React Native package. Community: `@react-native-ai/apple` (preview, iOS 26+). https://ai-sdk.dev/providers/community-providers/react-native-apple
- **Apple Watch app:** no React Native support was found, so assume native SwiftUI.
- Caveat: Expo shows SDK 58 published 15 Oct, but the RN 0.88 post is dated 19 Oct. I could not reconcile this.

## 6. App Store requirements

- Currently Xcode 26 / iOS 26 SDK (since 28 Apr 2026). https://developer.apple.com/news/upcoming-requirements/
- From **April 2027**, uploads must use the iOS 27 and iPadOS 27 SDK (and watchOS 27 SDK for the watch app). Exact day not stated. https://developer.apple.com/news/?id=k1mtkt1k
- Apple says use the Xcode 27 Release Candidate or later for submissions, not betas. Same URL.
- Duo submissions opened 5 Oct 2026. From April 2027, submissions need iPhone Duo screenshots. https://www.macrumors.com/2026/10/05/apple-opens-iphone-duo-app-submissions/ (secondary quoting Apple)
- A Duo badge needs Duo screenshots in App Store Connect. https://developer.apple.com/iphone-duo/prepare/
- No requirement was found to support Duo layouts or resizable windows. Resizing follows the SDK you build with.
- Age ratings: the new system applies from iOS 26, and new Time Allowances apply, with social-media capability declared in App Store Connect. https://developer.apple.com/news/?id=k1mtkt1k Privacy-manifest changes for 2026: none found.

## 7. What this means for Duna

Effort labels: RN = React Native today, Small = small native module, SwiftUI = SwiftUI screen.

1. Upgrade both apps to Expo SDK 58 / RN 0.88 and Xcode 27.1: required for scenes, resizing and Duo edge-to-edge. RN.
2. Coach courtside scoring, half-open: score on top, controls on the bottom, driven by `reservedRegions`/`expo-hinge`. Small (`reservedRegions` has no RN wrapper I found).
3. Player live-score screen: glanceable score on the outer display via scene accessory. Small, or SwiftUI.
4. Coach drill diagram player: `ArrangementView` with diagram primary and steps secondary. RN (`@expo/ui`).
5. Coach schedule on iPad: three-column `NavigationSplitView`. RN via Expo UI; unverified maturity.
6. Native tabs with sidebar on iPad and vertical bars on Duo, for both apps. RN.
7. Live Activity for live matches and Dynamic Island: `expo-widgets`. RN, with limits.
8. Film library with HealthKit heart-rate overlay and workout zones. Small native module.
9. Apple Watch scorekeeping: native SwiftUI watchOS app. SwiftUI.
10. App Intents ("score point", "book court") for Siri. Alpha `expo-app-intents`, or Small.

## Could not verify

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
