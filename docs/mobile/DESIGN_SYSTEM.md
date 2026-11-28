# The Duna Design System on React Native

`@duna/ui/native` is the React Native foundation of the Duna Design System
(Tideline 4.1.1): tokens, theme, type, fonts, icons, motion, loaders, the
first-open sequence and the state parts. Work packages M-F0 and M-F1. The
contract is [`docs/design/tideline-4.1.1/README.md`](../design/tideline-4.1.1/README.md);
where this file and the contract differ, the contract wins.

It never imports DOM code and web never imports it
(`packages/ui/src/native/native-boundary.test.ts` fails both ways). Layout
primitives are in [`ADAPTIVE.md`](ADAPTIVE.md); the themed versions are
exported here.

## Imports

| Path                          | What it is                                                                                                                                                                                            |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@duna/ui/native`             | Everything below                                                                                                                                                                                      |
| `@duna/ui/native/tokens`      | `nativeTokens`, `nativeColors(theme, zone)` and the types (generated; no React)                                                                                                                       |
| `@duna/ui/native/theme`       | `ThemeProvider`, `useTheme`, `useColors`, `ZoneProvider`, `LiveZone`, `ThemeOverride`, `themeStorage`, `resolveTheme`; themed `AdaptiveScaffold`, `FoldScaffold`, `AdaptiveSheet`, `NavigationChrome` |
| `@duna/ui/native/type`        | `Title`, `Text`, `Numerals`, `TitleRegion`, `fontFace`, Dynamic Type caps                                                                                                                             |
| `@duna/ui/native/icons`       | `Icon` and the name maps from the apps' current icons (`playerIconGlyphs`, `proLucideGlyphs`)                                                                                                         |
| `@duna/ui/native/motion`      | `Rise`, `Rally`, `Cross`, `useReducedMotion`, `MotionPreference`, `useScoreChange`, `ScoreNumerals`, `HapticsProvider`, `useHaptics`                                                                  |
| `@duna/ui/native/loaders`     | `RallyLoader`, `CrossingLoader`, `SetBySetLoader`, `PullToRefreshIndicator`, `TideSweep`, `Skeleton`, `ButtonLoader`, `ServeLoader`, `Spinner`, `LiveCrest`, `LaunchSequence`                         |
| `@duna/ui/native/states`      | `LoadingState`, `EmptyState`, `ErrorState`, `OfflineState`, `NotConfiguredState`, `PermissionDeniedState`, `AppErrorBoundary`, `StateAction`                                                          |
| `@duna/ui/native/brand`       | `DunaMark`, `DunaWordmark` (geometry shared with the web marks)                                                                                                                                       |
| `@duna/ui/native/foundations` | The development-only Foundations gallery                                                                                                                                                              |

## Tokens

`pnpm tideline:tokens` writes `packages/ui/src/native/tokens/tokens.native.ts`
from the same source as the web files; `pnpm tideline:tokens --check` fails
when it is stale, and `tokens.native.test.ts` checks it and snapshots the
values. Never edit it. Shape:

- `color.{light,dark,live}[role]` and `zone.hq[theme][role]`: resolved
  `#rrggbb` / `#rrggbbaa` (OKLCH converted). `nativeColors(theme, zone)`:
  the live zone wins over the theme; HQ repaints on top.
- `brand` (night-court, salt, dune, hardwood, solar), `ramp` (primitives).
- `space`, `radius`, `size`, `layer`: numbers, prefix dropped (`space["4"]`).
- `icon`: `size.{chip,inline,control,nav}` 14 / 16 / 20 / 24, `stroke` 1.75,
  square caps, mitred joins.
- `type[style]`: `{ family, fontSize, lineHeight, fontWeight, letterSpacing }`
  in points (em tracking resolved); `brandType` (Jost 500, -0.015em, 22 min);
  `fontWeights` per family.
- `motion.duration` (ms), `motion.easing` (cubic-bezier control points),
  `motion.reduced` (the reduced-motion durations).
- `shadow[theme][name]`: React Native `boxShadow` layer objects.

## Theme

Mount `ThemeProvider` once at the app root (both apps do, in
`src/app/AppRoot.tsx`). It resolves Light, Dark or Match device against the
device scheme, follows the device live under Match device, and persists the
choice through `themeStorage(AsyncStorage)` under the key the apps already use
(`"duna-theme"`: `light` / `dark` / `system`). It renders nothing until the
saved choice is read, so the first frame is already right (the native splash
stays up meanwhile). `useTheme()` gives `{ preference, setPreference, scheme,
theme, zone, colors, tokens, statusBar }`.

Zones: wrap a live screen in `<LiveZone>` (scoring, a live match,
recording); it wins over the preference. `ZoneProvider zone="hq"` for operator
surfaces. A dark preference is never a zone.

Use the themed scaffolds from `@duna/ui/native`, not the raw ones: they pass
the Tideline ground, line, scrim, surface and text, give the tab bar the
action tint, and open a title region per pane and tab.

## Type

- `Title`: the one Jost Medium 500 title per screen. Takes a string, renders
  at 28 pt by default, never below 22 pt. In development it warns when the
  text has a digit or when a second `Title` mounts in the same `TitleRegion`
  (the provider opens the root region; themed panes and tabs open their own).
- `Text variant=… tone=…`: Geist on the type scale, coloured by role. `family="mono"`
  for codes and small uppercase labels; `tabular` for figures that line up.
- `Numerals`: tabular figures, Geist Mono by default (scores, data);
  `family="ui"` for Geist 600 prices and times in rows.
- Dynamic Type: everything scales with the system text size. Roles of 18 pt
  and under follow it to the largest accessibility size (about 3.1x);
  headings stop at 2.5x, titles at 2x, display and live-score figures at 1.5x
  (`fontScaleCap`). Nothing renders below 12 pt.

## Fonts

Decision: **embed** the faces with the `expo-font` config plugin (both
`app.json` files list them), not runtime `useFonts`. Embedding means no
first-frame wait or flash, the faces are available to widget and Live
Activity extensions later, and nothing new is downloaded at run time. The
cost is a native rebuild when the set changes; the apps are on a new 2.0.0
runtime anyway, so no over-the-air update can reach a binary without them.

Files in `packages/ui/assets/fonts/`, named by PostScript name so the same
`fontFamily` string works on iOS and Android:

| Face                                     | Source                                                            | Licence                                        |
| ---------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------- |
| Geist Regular, Medium, SemiBold, Bold    | `vercel/geist-font` release v1.9.2, `Geist/ttf/`                  | SIL OFL 1.1, `docs/licenses/Geist-OFL-1.1.txt` |
| Geist Mono Regular, Medium, SemiBold     | same release, `GeistMono/ttf/`                                    | same                                           |
| Jost Medium (from `Jost-500-Medium.ttf`) | `indestructible-type/Jost` release 3.5 (`Jost.zip`, `fonts/ttf/`) | SIL OFL 1.1, `docs/licenses/Jost-OFL-1.1.txt`  |

No npm package was added for them. SHA-256 of the vendored files:

- `Geist-Bold.ttf`: `1c24df313b8ddc9550e060cfe5321c6374997f2892880af303b5ded45fed2582`
- `Geist-Medium.ttf`: `e9099e006d4934cae4a8c7d14a1ca2ea724ee2f69f9bdd5b2ffe715baf5524fc`
- `Geist-Regular.ttf`: `2c460a7a71063e53491f343d44b382267bc0cf496e31db64865f962af3152e68`
- `Geist-SemiBold.ttf`: `01923aa148e5202ae70a2e11b2ab4dc41b80bcc374aedccc913d47bb2f591c06`
- `GeistMono-Medium.ttf`: `34c0828460d47e697655bc9d730027a4b8baf6e6c9aa46f5f32b653b4797cf36`
- `GeistMono-Regular.ttf`: `686914333e77a620c85b35481064788deb33fc25f69901bdbf296c1bbc26a7fe`
- `GeistMono-SemiBold.ttf`: `70b2e3e4218e8bfeed9bf01049411316457936f965e49291863c16f0dafc59a6`
- `Jost-Medium.ttf`: `70a969b31bb2089340e442d4520f1b418eb389b881418451d22824a389648a31`

## Icons

The path data lives once, in `packages/ui/src/icons/glyphs.ts` (pure data);
`icons/glyph-index.ts` (pure: sizes, stroke, names, lookup) is shared by the
web `Icon` and the native `Icon`, so they cannot drift
(`icons.native.test.tsx` checks the names are identical and every glyph
renders with the brand stroke at all four sizes). `<Icon name size tone label>`:
decorative unless `label` is given.

`playerIconGlyphs` (Player `DunaIcon` names) and `proLucideGlyphs` (Pro's
`lucide-react-native` imports) map today's icons to glyphs, `null` where the
shared set has no glyph yet. Screen packages migrate call sites; this
foundation does not.

## Motion

Built on React Native's own `Animated` on the native driver (no Reanimated).

- `Rise` (600 ms, the ease-out curve): `mode="grow"` scales out of a line
  (`from` bottom / top / left / right), `mode="lift"` travels a short way off
  it and fades in. `trigger` replays it; `appear={false}` starts at rest.
- `Rally`: the same Rise per child, 120 ms apart, on first appearance only.
- `Cross` (320 ms): change `crossKey` and the content travels in.
- Reduced motion (system setting, or `MotionPreference` in galleries): every
  verb is the end state with a 200 ms fade, no stagger.
- `useScoreChange(state, { names })` takes a `NetScoreState` from
  `@duna/tideline-core`, runs `scoreAnnouncement`, announces the parts to
  screen readers, gives one light haptic when a point is scored (never for a
  correction) and returns the parts. `ScoreNumerals` Rallies the changed
  digits from the net line.
- `HapticsProvider adapter={…}` (each app passes its `expo-haptics` calls,
  `src/app/haptics-adapter.ts`); `useHaptics().confirmed(tier)`: tier 0
  selection, tier 1 medium impact, tier 2 success notification;
  `refused()` error; `pointScored()` light impact.

## Motion never gates content

Content visibility and touchability never depend on an `Animated` completion
callback or on a value reaching its end state. The native driver can silently
never finish (seen on an iOS 26.5 iPad simulator, where the whole app stayed
behind the launch cover), so an app must be usable without the callback.

- Use `runWithWatchdog(animation, { timeline, settle, onFinish })` from
  `@duna/ui/native` (`motion/watchdog.ts`) for any animation that starts
  content at opacity 0 or translated, or whose completion does something
  (unmount, enable touches, dismiss). If the callback has not fired within
  `timeline` (delay plus duration) plus one second, it stops the animation,
  calls `settle()` (`settleValues([[value, end]])` sets the end state) and
  runs `onFinish`, once. A late callback is ignored. It returns the cancel
  function for the effect cleanup.
- `Rise`, `Rally`, `Cross`, `SearchBar`, `LaunchSequence`, the set-by-set and
  pull-to-refresh loaders use it. New motion parts must too.
- Guard: `motion/motion-never-gates.test.ts` fails if any file in the native
  kit or the two apps passes a completion callback to `.start(` directly. It
  cannot tell a decorative animation from a gating one, so it checks the
  callback form only; a bare `.start()` on a value that starts hidden is a
  review item.

## Loaders and first open

The eight loaders from the brand book grow from the line: `RallyLoader`
(default), `CrossingLoader`, `SetBySetLoader`, `PullToRefreshIndicator`,
`TideSweep`, `Skeleton` (sand shimmer), `ButtonLoader` (in the button) and
`ServeLoader`; plus `Spinner` and `LiveCrest` (the only Solar component). Each
loops only while motion is allowed and rests under reduced motion.

`LaunchSequence` is the first open: Night Court, the line stands up (0.3 s),
the crests rise inner to outer (0.7 s), the wordmark draws on (1.4 s), then
the layer turns from its left edge like a page (3.5 s, 1.4 s, -108°,
perspective 1500). Tap to skip. Pass `ready` when Home's readiness is known:
the page then waits for it and may turn once the crests have landed. Reduced
motion: the finished lockup, then a 200 ms cross-fade. Both apps mount it at
the root on cold start; it replaces Pro's 10-second launch film.

## States

`LoadingState` (nothing for 250 ms, then at least 400 ms of a Rally loader or
a skeleton), `EmptyState` (title, one line, one action), `ErrorState` (Try
again and the reference behind Details), `OfflineState` (how fresh, what is
queued), `NotConfiguredState`, `PermissionDeniedState`. `AppErrorBoundary`
wraps `@duna/observability`'s boundary: it reports `ui.boundary.caught` once
and shows `ErrorState` with the reference. Each app root wraps everything in
one (`player.root`, `pro.root`) and calls `installReactNativeErrorHandler()`.
No HTTP transport is registered yet (it needs the signed-in person's token;
see `docs/OBSERVABILITY.md`).

## Legacy mapping

Until screens migrate, the old names point at Tideline roles (values come from
the generated tokens): `packages/ui/src/tokens.ts` (`resolveDunaTokens`,
`environmentalColors`), `packages/ui/src/mobile.ts` (`dunaAppColors`,
`resolveDunaMobileTokens`, which now uses the Salt ground) and each app's
`src/shared/palette.ts`. The retired flare orange maps to the warm signal
(`sun-ink` on light, Dune on dark), to Solar only in the legacy live zone, and
to Hardwood in the environmental palette. The legacy text components in
`satoshi-text.tsx` render the Geist face for the requested weight.

## Foundations gallery

Development only, preview builds (like the Layout lab). Open
`duna://dev/foundations` or `duna-pro://dev/foundations` with optional
`section=palette|type|icons|motion|loaders|states`, `theme=light|dark|live`,
`motion=reduced`, or start Metro with `EXPO_PUBLIC_DUNA_FOUNDATIONS=section=icons&theme=dark`.

Simulators without touch: the system asks "Open in …?" for
`simctl openurl`, so development builds also read a launch link from user
defaults:

```sh
xcrun simctl spawn "$DEVICE" defaults write com.duna.player DunaDevOpenUrl "duna://dev/foundations?section=type&theme=dark"
xcrun simctl terminate "$DEVICE" com.duna.player; xcrun simctl launch "$DEVICE" com.duna.player
xcrun simctl spawn "$DEVICE" defaults delete com.duna.player DunaDevOpenUrl   # when done
```

Largest text size: `xcrun simctl ui "$DEVICE" content_size accessibility-extra-extra-extra-large`
(`large` restores the default).

## What React Native cannot do as the brand book says

- The wordmark "draws on" with `strokeDashoffset`, which `Animated` can only
  drive on the JavaScript thread (the crests and the page turn use the native
  driver). It is a one-off 1.1 s draw; a busy JS thread can stutter it.
- `Rise` scales content when `mode="grow"`; text should use `mode="lift"`
  (a short travel off the line), since scaling glyphs from zero distorts them.
- The system tab bar's selected tint is the only colour the native tab bar
  takes; labels and the bar ground are the system's.
