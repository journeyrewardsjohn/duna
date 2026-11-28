# Adaptive layout for the native apps (M-F2 / M-F3)

How Duna (Player) and Duna Pro lay out on iPhone, the iPhone Duo and iPad.
Design rules: [`docs/design/tideline-4.1.1/adaptive.md`](../design/tideline-4.1.1/adaptive.md).
Building and simulators: [`BUILDING.md`](BUILDING.md).

Lay out by the size the window or pane actually has. Never by device, idiom,
orientation or `Dimensions.get`.

## Packages

| Import                       | What                                                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `@duna/expo-device-posture`  | Local Expo module (Swift + TypeScript): posture, the fold's reserved region, camera occlusion, the window safe area |
| `@duna/ui/native/layout`     | `resolveLayout`, `useLayout`, `usePane`, `AdaptiveScaffold`, `FoldScaffold`, `AdaptiveSheet`, `NavigationChrome`    |
| `@duna/ui/native/layout/lab` | The development-only Layout lab (preview builds only)                                                               |

`@duna/ui/native/layout` imports React Native and never DOM code; web never
imports it. Neither app's root `@duna/ui` import pulls it in.

## Posture module (`packages/expo-device-posture`)

```ts
import {
  DevicePostureProvider, // mount once at the shell root (both apps do)
  useDevicePosture, // -> PostureSnapshot
  isDevicePostureAvailable,
} from "@duna/expo-device-posture";

interface PostureSnapshot {
  isAvailable: boolean; // reserved regions readable (iOS 27.1+, this binary)
  posture: "closed" | "half-open" | "open" | "not-foldable" | "unknown";
  hingeAngle: number | null; // angle when the posture last changed; effects read expo-hinge
  fold: { axis: "vertical" | "horizontal"; rect; margins; active } | null; // window coordinates
  occlusions: ReservedRegion[]; // active occlusion regions (camera, status column)
  safeArea: Edges | null; // the window's own, asymmetric safe area
  window: { width; height } | null;
}
```

- **Native side.** A transparent, non-interactive `DunaDevicePosture` view fills
  the window under `DevicePostureProvider`. It re-reads on `layoutSubviews`,
  `safeAreaInsetsDidChange`, `didMoveToWindow`, size-class trait changes
  (`registerForTraitChanges`) and hinge updates, and sends `onRegionsChange`
  only when the payload changes. It reads its own window, never shared screen
  or application state.
- **Apple APIs used, names confirmed in the Xcode 27.2 iOS 27.2 SDK:**
  `UIView.reservedRegions(kind:options:)`, `UIView.ReservedRegion`
  (`frame`, `margins`, `isActive`, `kind`, `id`), kinds `.division` and
  `.occlusion`, option `.includeInactive` — `UIKit.framework/Headers/UIViewReservedRegion.h`,
  the `UIView (ReservedRegion)` category in `UIView.h`, and
  `UIKit.swiftmodule/arm64-apple-ios-simulator.swiftinterface` (all iOS 27.1+).
  `UIHingeInteraction` / `UIHinge.Status` (`closed`, `partiallyOpen`,
  `fullyOpen`, `unknown`) — `UIHingeInteraction.h`, `UIHinge.h`; used only as a
  re-query trigger. SwiftUI has the same model (`reservedRegions(kind:options:layoutDirectionBehavior:)`,
  `onHingeChange`) in `SwiftUICore.swiftinterface`; the research brief's
  spellings were right.
- **Posture** comes from `expo-hinge`'s status (closed → `closed`,
  partiallyOpen → `half-open`, fullyOpen → `open`, no hinge → `not-foldable`).
  The angle is `expo-hinge`'s; this module does not re-implement it. The
  provider follows the status only, so the shell does not re-render on every
  angle tick.
- **Fallback.** No module (older binary, Android, web) or iOS < 27.1: nothing
  is derived — `isAvailable: false`, no fold, no occlusions, posture from
  `expo-hinge` alone or `unknown`. No aspect-ratio guesses. `requireNativeView`
  is called only when the module is linked, so an over-the-air bundle on an
  older binary degrades instead of crashing.
- Tests: `packages/expo-device-posture/src/posture.test.ts` (parsing,
  mapping, fold choice, fallbacks).

## Layout API (`@duna/ui/native/layout`)

- `resolveLayout({ width, height, fontScale, posture, foldRect, foldActive?, safeArea?, occlusions? })`
  → `{ widthClass, heightClass, paneCount: 1|2|3, mode: "stack"|"split"|"tabletop", fold, panes[{ id, frame, insets }] }`.
  Pure; matrix-tested in `resolve-layout.test.ts`.
  - Width: compact < 560; expanded ≥ 740 wide **and** ≥ 720 tall; regular
    otherwise (reproduces every board placement). Height: compact < 480.
  - Panes: compact 1; regular 2; expanded 2, or 3 (inspector) from 1000 pt.
    A pane is at least 300 pt × the font scale (clamped to 2), so the largest
    text sizes drop panes (Duo open flat → 1, iPad 13" landscape → 2).
  - An **active vertical fold** always splits into two panes at the band
    (never across it, even at the largest text size); flat open splits at the
    fold's centre. An **active horizontal fold** (half-open, propped) is
    `tabletop`: `top` (watch) and `bottom` (touch). Closed ignores the fold.
  - Insets: each pane gets the window safe area only on the edges it touches,
    raised where an occlusion overlaps it.
- `useLayout()` — the window's resolved layout plus posture, from
  `useWindowDimensions` and the posture module.
- `useRegionLayout()` — the same for a measured region (`measureInWindow`):
  the scaffolds use it, so a scaffold beside a sidebar or below a header gets
  its own pane count, fold and clipped safe area.
- `usePane()` — the pane a component is in: measured size, insets, `stacked`.
  Size screens from this, never the window.
- `AdaptiveScaffold({ primary, detail, emptyDetail?, inspector?, onDismissDetail, theme? })`
  — stack when compact (detail pushed over the list with Back), split
  otherwise. Every pane keeps its place in the React tree in every
  arrangement (hidden panes use `display: "none"`), so **the detail is never
  remounted** when the Duo opens or closes or an iPad window resizes: scroll
  position and form state survive (`scaffolds.test.tsx` proves it with mount
  counts and typed state across compact → regular → compact).
- `FoldScaffold({ primary, secondary, tabletop?: "auto"|"off", onTabletopChange?, doneLabel? })`
  — open: two panes split at the fold; half-open (horizontal fold): a
  full-screen mode, watched content on top, touch below, an explicit **Done**
  (leaves the mode until the posture changes again); closed / compact:
  primary over secondary. `onTabletopChange(true)` is the host's cue to hide
  the tab bar (`NavigationChrome hidden`). Both regions keep their tree
  positions, so a video or score keeps running across postures.
- `AdaptiveSheet({ visible, onClose, kind?: "panel"|"dialog" })` — compact:
  bottom sheet; regular: `panel` fills the secondary pane of the nearest
  `AdaptiveScaffold`, `dialog` stays a modal sheet ("pay stays a sheet");
  expanded: `panel` is a trailing side panel, `dialog` a centred sheet. Built
  on React Native's `Modal` (transparent) like the apps' existing sheets.
  Replaces `<Modal presentationStyle="pageSheet">` in feature code.
- `NavigationChrome({ tabs, selected, onSelect, centerAction?, hidden?, sidebarAdaptable?, tintColor? })`
  — the system tab bar (see the spike below). Each tab's content gets its own
  `SafeAreaProvider`: inside a tab, wrap a screen in `SafeAreaView` (all
  edges) so it clears the bar, vertical bar or sidebar; scaffolds then lay out
  the remaining region.
- Styling: only structural values, from `theme` (`ground`, `separator`,
  `scrim`, `sheet`, `control`; neutral defaults in `theme.ts`). The native
  design-system layer passes its own theme; no API change needed.

## Tab-bar spike (M-F3): system tabs via react-native-screens

Ran in the Pro Layout lab (preview build, Xcode 27.2) on the iPhone Duo
(iOS 27.2, closed) and the iPad Pro 13-inch (iOS 27.2, portrait), plus the
iPhone 17 Pro (iOS 26.5). Screenshots in the PR.

| Candidate                                                                   | Ran?                               | Duo closed                                                                                                     | iPad                                                                            | RN screen + state                                                                        | Centre +                                                                  | Badges           | Hide bar                                  | Verdict                                                                                                                                                                                            |
| --------------------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **react-native-screens 4.30.1 `Tabs.Host` (UITabBarController)**            | yes                                | System moved it to a **vertical bar on the trailing edge**; `prominentScreenKey` gave "+" its own round button | Floating top bar with the sidebar toggle (`tabBarControllerMode: "tabSidebar"`) | yes; tab content keeps state; correct tab insets (iPad t96)                              | `preventNativeSelection` + `onTabSelectionPrevented`; prominent on iOS 27 | yes              | `tabBarHidden` (animated)                 | **Chosen**                                                                                                                                                                                         |
| Expo Router native tabs (`expo-router/native-tabs` 58.0.33)                 | read, not run                      | —                                                                                                              | —                                                                               | —                                                                                        | `prominent`                                                               | yes              | `hidden`                                  | Same engine: its iOS view renders `react-native-screens` `Tabs.Host` with the same props. Adopting it means replacing both apps' entry with file-based routing; no capability gained for the shell |
| SwiftUI `TabView` via `@expo/ui` 58.0.30 (`sidebarAdaptable`, `RNHostView`) | yes                                | Vertical trailing bar (system-placed); "+" is an ordinary tab                                                  | Top bar with sidebar toggle                                                     | Hosted RN content measured **0 pt tall** in a pane; tab insets not propagated (iPad t32) | no prominent role; select-then-revert hack                                | `badge` modifier | **none** (no toolbar visibility modifier) | Not production-ready for a shell                                                                                                                                                                   |
| `react-native-bottom-tabs` 1.5.1 (Callstack)                                | yes                                | Vertical trailing bar; `role: "prominent"` + `preventsDefault` worked                                          | Top bar with sidebar toggle                                                     | yes, but tab insets not propagated (iPad t32: content under the bar)                     | yes                                                                       | yes              | `tabBarHidden`                            | Works; second-best; one more native dependency with a smaller maintainer base                                                                                                                      |
| JS-drawn bar imitating placements (today's custom docks)                    | yes (the shipped Pro/Player docks) | Drawn at the bottom over a trailing system status column; never becomes the vertical bar                       | Never becomes a sidebar                                                         | yes                                                                                      | yes                                                                       | yes              | yes                                       | Fallback only                                                                                                                                                                                      |

Choice: `NavigationChrome` on react-native-screens `Tabs` (pinned 4.30.1,
Expo SDK 58's version, published 28 Oct 2026). Cost: a native dependency
(both apps rebuilt; JS-only updates to a binary without it would fail, which
the 2.0.0 runtime already prevents); selection follows react-native-screens'
provenance model (handled inside `NavigationChrome`); iPad shows the centre
action as a plain "New" item in the top bar (no prominent styling there);
Android icons are not wired (SF Symbols only). Deep links stay in each
shell's reducer and drive `selected`. Over-the-air updates keep working for JS
changes. The spike's alternative implementations and the
`react-native-bottom-tabs` dependency were removed after the run.

## Measured (Xcode 27.2 simulators)

| Window                      | Size (pt)   | Window safe area  | Reserved regions                                                                                      | Tab content insets                                       |
| --------------------------- | ----------- | ----------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| iPhone Duo, closed (outer)  | 466 × 678   | t0 l0 **b34 r84** | occlusion `382,0 84×174` (status + camera column), occlusion `399.7,29.3 37×37` (camera); no division | t0 l0 b34 r84 (vertical bar sits in the trailing column) |
| iPad Pro 13" (M5), portrait | 1032 × 1376 | t32 l0 b20 r0     | occlusion `0,0 1032×32` (status bar)                                                                  | t96 (top tab bar)                                        |
| iPhone 17 Pro, iOS 26.5     | 402 × 874   | t62 l0 b34 r0     | API unavailable (iOS 26): `isAvailable: false`, posture `unknown`                                     | b83                                                      |

Still placeholders (not measured; see "Not tested"): the Duo inner window in
open and half-open, the fold band (the boards' 25 pt at x/y 463), and the
safe areas there. The resolver tests use those placeholders.

**Shell defect fixed.** On the closed Duo the status bar is a column on the
**trailing** edge (safe area right 84, top 0), not a top strip. Both shells
used `SafeAreaView edges={["top"]}`, so content ran under it. The shells now
use `["top", "left", "right"]` (and `bottom` where they already did).

## Layout lab (preview builds only)

Open it with a long press on the preview banner, `duna://dev/layout-lab` /
`duna-pro://dev/layout-lab` (preview mode only), or — for simulators driven
without touch — start Metro with:

```sh
env -u EXPO_PUBLIC_WORKOS_CLIENT_ID EXPO_PUBLIC_DUNA_PREVIEW=true \
  EXPO_PUBLIC_DUNA_LAYOUT_LAB=1 EXPO_PUBLIC_DUNA_LAYOUT_LAB_SCRIPTED=1 \
  npx expo start --port <port>
```

(`EXPO_PUBLIC_DUNA_LAYOUT_LAB_TAB=<key>` picks the first tab.) Tabs: readout
(live `resolveLayout` output, panes, fold and occlusions drawn to scale; each
change is logged to Metro as `[layout-lab] …`), list → detail
(`AdaptiveScaffold`; the detail shows its mount number and the note; scripted
mode selects Court 3 and types a note), half-open (`FoldScaffold`, hides the
tab bar while in tabletop mode), sheets (`AdaptiveSheet` panel and dialog);
the centre "+" opens the dialog sheet.

Verify posture changes with the simulator tool (`set_posture closed /
half_open / open`, then `screenshot`), and watch the Metro log: the detail's
`mount #1` must not change across closed → open → half-open → closed.

## Rules for screens (enforced once a screen is migrated)

`scripts/design-contracts/adaptive-screens.ts` adds a non-legacy check to the
Player and Pro contracts. It applies only to `apps/<app>/src/features/**`
paths listed in that contract's `migrated`: no `Dimensions.get`, no direct
`<Modal presentationStyle="pageSheet">`, no fixed `width` / `minWidth` /
`maxWidth` of 300 pt or more, and the folder must import
`@duna/ui/native/layout`. Add your folder to `migrated` when your screen moves
onto the scaffolds.

## Legacy patterns

Removed at the shell: top-only safe-area edges (both shells). The shells and
shared mobile code had no `Dimensions.get`, idiom or orientation reads.
Left for screen packages: 50 `SafeAreaView` uses in 31 feature files with
top/bottom-only edges; 40 `presentationStyle="pageSheet"` modals;
`player-calendar.tsx` (`Math.max(insets.top, 54)`), `messaging-screen.tsx`
fixed bottom minimums; the absolute docks and the `bottom: 94` transfer
banner (go away with `NavigationChrome`, M-P0 / M-R0);
`video-studio.tsx` `ScreenOrientation.lockAsync` and
`DunaVideoCaptureModule.swift` `UIScreen.main.brightness` /
`interfaceOrientation` (video stream's files, untouched).

## Platform versus design rules

- The design says "bottom tab bar when compact". On the closed Duo (compact,
  466 pt) iOS 27.2 places the system tab bar as a **vertical bar on the
  trailing edge**, in the column shared with the status bar and camera. The
  system decides; Duna follows it.
- The boards assume a top status bar on the outer display; it is a trailing
  column (safe area right 84 pt, top 0).
- iPad's iOS 27 tab bar is a floating top bar (sidebar on demand); the
  prominent centre action shows as a plain item there.
- React Native has one scene: no camera-accessory scene on the outer display,
  no second window.

## Not tested, and why

The simulator tool's access requests for the iPhone Duo and the iPad went
unanswered, and `xcrun simctl` cannot change posture or rotate, so these were
not run: Duo open and half-open, the closed → open → half-open → closed round
trip, iPad landscape and split windows, iPhone landscape. The continuity
claim rests on the unit test and on the lab's scripted run in the closed
posture (`mount #1` kept). A stale system "Open in “Duna Pro”?" alert from an
`openurl` call sits on the Duo simulator until someone taps it.
