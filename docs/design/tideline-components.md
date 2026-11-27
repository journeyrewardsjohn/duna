# Tideline components

Tideline is Duna's design system. `@duna/ui/tideline` is its component library
for the web: the look comes from Tideline tokens, and the behaviour (keyboard,
focus, dismissal, popups, ARIA) comes from Vercel's UI SDK.

**The design contract is
[`tideline-4.1.1/README.md`](tideline-4.1.1/README.md)** (rules R1–R22, the
4.1.1 tokens and the component list). This file only describes how the code
library is built and extended. Where the two differ, the contract wins.

This first version is additive. No existing screen, export or global stylesheet
uses it yet; later refactors adopt it screen by screen.

**Rule: new web UI uses `@duna/ui/tideline`.** Do not add a hand-written
button, dialog, menu, date picker or search box to an app. If a component is
missing, add it here.

**Current state:** the library still carries the published Tideline 3.1
tokens and the visual details that come with them (tide-blue actions, the
flare-orange live colour, Geist only with no Jost titles, the motion values
below).
Work package F2a replaces them with the 4.1.1 tokens, names and motion verbs
(Rise, Rally, Cross). Until then, treat any colour, type or motion value
quoted in this file as the 3.1 value, not the contract.

## Use it

```tsx
import "@duna/ui/tideline/styles.css"; // imports the tokens and every family
import { Button, Tideline, TidelineFonts } from "@duna/ui/tideline";

<Tideline ground>
  <TidelineFonts />
  <Button variant="primary">Save result</Button>
</Tideline>;
```

- Every component must render inside a `Tideline` scope (a `div.td`). Tokens
  and styles apply only inside it, so the rest of the page is untouched.
- `theme="dark"` is the person's preference. `zone="live"` means play in
  progress and wins over the theme. A nested scope states its own theme.
- Popups (dialogs, menus, selects, toasts) render in place in the browser's
  top layer, so they stay inside the scope. Render `Toaster` once per scope.
- In HQ and Web, also import `@duna/ui/tideline/legacy-bridge.css` (see
  "Layers and the legacy bridge").

Public import paths (`packages/ui/package.json` exports). HQ and Web both
list `@duna/ui` in `transpilePackages`, so either app can use them:

| Path                                  | What it is                                                     |
| ------------------------------------- | -------------------------------------------------------------- |
| `@duna/ui/tideline`                   | Every component, hook and helper (`tideline/index.ts`)         |
| `@duna/ui/tideline/styles.css`        | The one stylesheet: tokens plus every family, in cascade order |
| `@duna/ui/tideline/legacy-bridge.css` | The unlayered bridge for apps with unlayered global CSS        |
| `@duna/ui/tideline/tokens`            | Resolved token values (TypeScript, no DOM; for React Native)   |
| `@duna/ui/tideline/tokens.css`        | The `--td-*` custom properties alone                           |

The React Native entry (`@duna/ui/mobile`) and the package root (`@duna/ui`)
never import Tideline; `styles.test.ts` fails if they do.

## Folder convention

One folder per component family under `packages/ui/src/tideline/`:

```text
tideline/
  index.ts           one `export * from "./<family>";` line per family (merge=union)
  styles.css         layer order, tokens, one `@import` per family (merge=union)
  styles.test.ts     guards this convention and the stylesheet rules
  legacy-bridge.css  unlayered bridge (not a family)
  tokens/            tokens.json source, generated tokens.css / tokens.ts, build and tests
  <family>/
    index.ts         the family's public exports
    <component>.tsx  components (one or more files)
    <family>.css     the family's rules, in @layer tideline under .td
    *.test.ts        the family's tests
```

Families today, in cascade order: `base` (the `Tideline` scope, fonts,
`Icon`, resets, focus ring, type roles, density scales), `button`, `field`,
`toggles`, `segmented`, `tabs`, `popover`, `select`, `dialog`, `toast`,
`calendar` (with `date-utils.ts`), `time` (DayStrip, TimeSlotGrid),
`avatar`, `add-players`, `search`, `surfaces`, `progress` (with Stepper),
`loaders` (with TopProgress and LoadingBoundary), `command-palette`,
`booking`. `interactions` holds the hooks and has no stylesheet.

A family imports another family's file directly (`../button/button-style`),
never through the package barrel.

### Add a family

1. Create `packages/ui/src/tideline/<family>/` with the component files, an
   `index.ts` that exports them, `<family>.css` and tests. Start the
   stylesheet with `@layer tideline {` and nest every rule in `.td { … }`;
   use only `--td-*` tokens; put its `@media (prefers-reduced-motion: reduce)`
   block at the end of the same file.
2. Append `export * from "./<family>";` to `tideline/index.ts`.
3. Append `@import "./<family>/<family>.css";` to `tideline/styles.css`.
4. Add `apps/hq/app/tideline/sections/<family>.tsx` that default exports its
   gallery examples (`GalleryExample[]`, see `apps/hq/app/tideline/gallery.ts`),
   and append `export { default as <name> } from "./<family>";` to
   `sections/index.ts`. Reuse a group from `galleryGroups` or declare your
   own group object with an unused `order`; the page sorts groups and examples
   itself.
5. Run `pnpm --filter @duna/ui test`, `pnpm --filter @duna/hq test` and the
   gallery spec.

The three one-line lists merge with `merge=union` (`.gitattributes`), so
branches that each append a line rebase without conflicts. Keep those files
to their one-line entries: a union merge keeps both sides of any other edit.
`styles.test.ts` and `sections/sections.test.ts` fail when a folder is
missing from a list or listed twice.

### Rules for every family

- **Only `packages/ui/src/tideline/**` imports `@ui-sdk/*`.** Apps and other
  packages use the Tideline wrappers. `styles.test.ts` scans `apps/` and
  `packages/` and fails on any other import.
- **No `!important`.** Win with the layer and specificity instead. Two legacy
  uses remain until the apps' global CSS is layered (closed UI SDK content in
  `base.css`, the primary label lock in `button.css`); `styles.test.ts`
  allows exactly those and fails on any new one. The Tideline guard in
  `pnpm verify:design-system` enforces the same rule (plus no retired orange,
  Solar only on live states, no vendor names in copy); its legacy exemptions
  for these files are listed in `scripts/design-contracts/shared.ts` and go
  with F2a.
- **Keyboard first.** Every interactive part is reachable and operable from
  the keyboard, with the shared focus ring, focus return after overlays and
  roving focus in groups. Add the keyboard path to
  `tests/e2e/tideline-gallery.spec.ts`.
- **Reduced motion.** Under `prefers-reduced-motion` movement stops and state
  changes fall back to opacity; every loop has a resting state in the
  family's own stylesheet.
- **Light, dark and live.** A family works in the light theme, the dark
  preference (`theme="dark"`) and the live zone (`zone="live"`), using tokens
  only. Check all three in the gallery (`?theme=dark`, `?theme=live`).

## How it sits on UI SDK

`@ui-sdk/core` and `@ui-sdk/react` are pinned at exactly `0.1.0-beta.17` in
`packages/ui/package.json`. It is a beta: only files in
`packages/ui/src/tideline/` import it, a few files per component family, so
a breaking change is fixed in one place. Apps never import `@ui-sdk/*`.
Take a new beta only once it is at least 24 hours old (pnpm's
`minimumReleaseAge`), pinned exactly, with no `minimumReleaseAgeExclude`
entry.

The UI SDK docs ship in the package
(`packages/ui/node_modules/@ui-sdk/react/docs/llms.txt`), and its agent skill
is vendored at `.agents/skills/ui-sdk`.

| Tideline component                                                                                                                                   | File (under `tideline/`)                               | UI SDK primitive or behaviour                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `Button`, `IconButton`                                                                                                                               | `button/button.tsx`                                    | Button (pending state, `aria-busy`, disabled links through `render`)                   |
| `Switch`, `Checkbox`, `RadioGroup` + `RadioOption`                                                                                                   | `toggles/toggles.tsx`                                  | Switch, Checkbox, Radio                                                                |
| `Segmented`                                                                                                                                          | `segmented/segmented.tsx`                              | Segmented Control (roving focus, sliding indicator)                                    |
| `Tabs`, `TabList`, `Tab`, `TabPanel`                                                                                                                 | `tabs/tabs.tsx`                                        | Tabs                                                                                   |
| `Field`, `Input`, `Textarea`, `NumberInput`                                                                                                          | `field/field.tsx`                                      | Field, Input (+ InputGroup, InputClear), Textarea, Number Input                        |
| `Select`, `Combobox`                                                                                                                                 | `select/select.tsx`                                    | Select, Combobox (popup, selection, typeahead, filtering)                              |
| `Dialog*`, `Sheet*`                                                                                                                                  | `dialog/dialog.tsx`                                    | Dialog (`presentation="auto"`: a sheet on small touch screens), Drawer                 |
| `Popover*`, `Tooltip`, `Menu*`                                                                                                                       | `popover/popover.tsx`                                  | Popover, Tooltip, Menu                                                                 |
| `Toaster`, `toast`                                                                                                                                   | `toast/toast.tsx`                                      | Toast                                                                                  |
| `Calendar`, `DatePicker`, `DateRangePicker`, `TimePicker`                                                                                            | `calendar/calendar.tsx`                                | Calendar, Date Picker (single and range), Time Input                                   |
| `DayStrip`, `TimeSlotGrid`                                                                                                                           | `time/day-strip.tsx`                                   | Radio (single selection, arrow keys). UI SDK has no day-strip or slot-grid primitive   |
| `Avatar`, `AvatarStack`, `AvatarLevel`                                                                                                               | `avatar/avatar.tsx`                                    | Avatar (image with fallback). Stack and level are presentational                       |
| `PlayerSlot`                                                                                                                                         | `avatar/avatar.tsx`                                    | Button, for an open slot with `onAdd`; otherwise presentational                        |
| `AddPlayers`                                                                                                                                         | `add-players/add-players.tsx`                          | Toggle (Add / Added, `aria-pressed`), Button; search through `useAsyncSearch`          |
| `SearchField`                                                                                                                                        | `search/search-field.tsx`                              | Input, InputGroup, InputClear                                                          |
| `CommandPalette`                                                                                                                                     | `command-palette/command-palette.tsx`                  | Dialog (modal, `mod+k` shortcut, focus return) + Command (fuzzy search, arrows, Enter) |
| `FilterChip`                                                                                                                                         | `surfaces/surfaces.tsx`                                | Toggle                                                                                 |
| `Progress`                                                                                                                                           | `progress/progress.tsx`                                | Progress                                                                               |
| `Card`, `Chip`, `Badge`, `Notice`, `EmptyState`, `Surface`, `Kbd`, `Stepper`, `Spinner`, `Sunrise`, `HorizonSweep`, `Skeleton`, `PageLoader`, `Icon` | `surfaces/`, `progress/`, `loaders/`, `base/icons.tsx` | None: plain markup, no client JavaScript                                               |
| `TopProgress`, `LoadingBoundary`                                                                                                                     | `loaders/feedback.tsx`                                 | None: `useDelayedLoading`                                                              |

Hand-rolled because the beta has no primitive: `Stepper` (an ordered list with
`aria-current="step"`), `DayStrip` and `TimeSlotGrid` (composed from Radio),
`AvatarStack`, `AvatarLevel`, `PlayerSlot`, `Skeleton`, the loaders, the three
interaction hooks, and focus recovery after removing a player in `AddPlayers`.

Server and client: presentational files have no `"use client"` and add no
JavaScript. Files that use state, effects or render functions are client
modules: `button.tsx`, `select.tsx`, `calendar.tsx`, `toast.tsx`,
`search-field.tsx`, `add-players.tsx`, `command-palette.tsx`, `booking.tsx`, `feedback.tsx`,
`interactions.ts`, `debounce.ts`. Pure helpers (`buttonClassName`, date math,
selection rules, the interaction cores) live in files without the directive,
so server components can call them.

Refs: the library targets React 19, where `ref` is an ordinary prop. Every
wrapper spreads its props onto the UI SDK part, so `ref` reaches the DOM node
without `forwardRef`.

## Interaction quality

These are part of the library, not of each screen.

| Hook                                        | What it guarantees                                                                                                                                                                                                                               | Core (tested)          |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| `useDelayedLoading`                         | A loader shows nothing for work under 250ms, and stays at least 400ms once shown. Used by `Button`, `SearchField`, `TopProgress`, `LoadingBoundary`.                                                                                             | `createDelayedLoading` |
| `useAsyncSearch`                            | Filters already-loaded items at once; debounces the request 220ms; aborts the in-flight request (`AbortController`) when the query changes; ignores stale responses; never clears results while typing (old ones stay, `stale`); Enter runs now. | `createAsyncSearch`    |
| `useOptimisticAction`                       | Applies a change at once, rolls it back if the save fails (error Toast), and offers Undo in a Toast when it succeeds.                                                                                                                            | `runOptimisticAction`  |
| `useDebouncedValue`, `useDebouncedCallback` | Trailing-edge debounce; the waiting call is cancelled on unmount.                                                                                                                                                                                | `createDebouncer`      |

`withViewTransition(update)` runs a DOM update in a view transition where the
browser supports it and motion is welcome, and just runs it otherwise.

`Button` loading blocks a second press immediately, keeps its width and its
label, and puts the spinner where the icon was.

Motion tokens (3.1, until F2a applies contract rule R10): 80ms press, 120ms
hover and toggles, 180ms popovers and tabs, 260ms sheets and dialogs, one
ease-out curve, press scale 0.98. Under
`prefers-reduced-motion` movement stops and state changes fall back to
opacity; every loop has a resting state.

## Tokens

`packages/ui/src/tideline/tokens/tokens.json` is the source. Two files are generated
from it and must not be edited by hand:

- `tokens.css`: every token as a `--td-*` custom property, with light, dark
  and live values selected by `data-theme` / `data-zone` on the `.td` wrapper
  (never on `:root`).
- `tokens.ts`: resolved values (numbers for lengths and times) for React
  Native.

To take a design revision, replace `tokens.json` and run:

```bash
pnpm tideline:tokens          # rewrites tokens.css and tokens.ts
pnpm tideline:tokens --check  # fails if they are stale
```

`tokens.test.ts` fails when the generated files are stale, when a text pair
drops below WCAG AA in any theme, or when the stylesheet uses a raw colour.

`tokens.json` is the published Tideline 3 file, unchanged. Names the code
needs before design publishes them live in `tokens.additions.json` (today: one
12px `micro` type style, because the published `tab-label` is 11px, under the
12px floor). The build merges the additions in, and a token of the same name in
`tokens.json` always wins, so an addition stops mattering once design ships it.

The build skips any published type style below the 12px floor (today the
11px `tab-label`): it stays in `tokens.json` but is not generated into
`tokens.css` or `tokens.ts`, so no product code can use it.

Following the published system, text fields use the hairline `line-strong`
border; small indicators (checkbox, radio, switch) keep the 3:1
`border-control`.

The primary button label is `on-action`, white in every theme. `button.css`
locks it with `!important` inside the layer, which outranks every unlayered
rule a host page has, so no page style for links can turn it dark. This is
one of the two legacy `!important` uses; it goes once HQ and Web layer their
global CSS. A disabled primary keeps the white label on `action-disabled`.

## Density

`<Tideline density="comfortable">` is the consumer and conversion scale:
18px card radius, 28px panels, weight-700 headings (`comfort-*` type styles),
more padding, pill-shaped large buttons. `density="dense"` is the product
scale. Without the option each component uses the scale it was designed for:
the booking components are comfortable, the table toolbar and `TimeSlotGrid`
are dense. Both scales read tokens; `dense` shrinks the booking components.

## Booking

| Component                            | Built on                         | Notes                                                                                                   |
| ------------------------------------ | -------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `ChoiceCardGroup`, `PriceChoiceCard` | UI SDK Radio                     | Single choice as cards; selected is a 2px action ring                                                   |
| `CoachPicker`                        | UI SDK Radio, Avatar             | Optional "Any coach"; photos fall back to initials                                                      |
| `DayStrip`                           | UI SDK Radio                     | A day with nothing open is faded, focusable and announced, and its selection is cancelled               |
| `SlotList`                           | UI SDK Radio                     | Available, booked (disabled), selected, loading (skeleton cards). `TimeSlotGrid` is the dense variant   |
| `BookingSummary`                     | Button; a hand-rolled disclosure | Line items, add-on row, total, action with `disabledReason`, trust line; a fixed bottom bar below 900px |
| `booking-state.ts`                   | none (pure)                      | Reducer and selectors for format, coach, day, slot and add-ons; `formatMoney`, `formatTimeRange`        |

`/tideline/book-lesson` in the gallery is a working page on these, wired to
the interaction layer: slots load through `useDelayedLoading`, choosing a slot
is a `useOptimisticAction` that rolls back with a toast if the hold fails.

## Layers and the legacy bridge

Every family stylesheet lives in `@layer tideline`, and every rule is nested
under `.td`. `styles.css` declares the order `@layer ui-sdk, tideline;` before
anything else. Any unlayered rule beats any layered one, and HQ and Web have unlayered
global CSS that matches Tideline's elements (`button { font: inherit }`,
`a { color: inherit }`, heading sizes, input fills, a
`[class*="__label"]` eyebrow rule, `[data-zone="live"]`).

`legacy-bridge.css` is a small unlayered file that uses `revert-layer` to hand
those properties back to Tideline, only on elements Tideline owns (a `td-*`
class or a UI SDK `data-slot`) inside a `.td` scope. Import it in an app that
still has unlayered global CSS, and delete it when that CSS is gone or
layered. Inside a scope with the bridge, restyle a Tideline element through a
layer or with specificity above `.td.td`, not with a single class.

## Gallery

`apps/hq/app/tideline/page.tsx` shows every component and state, with an
Interactions lab (simulated latency of 0 / 150 / 600 / 2000ms and a "fail next
request" switch). It builds its sections from
`apps/hq/app/tideline/sections/<family>.tsx`: each file default exports its
examples with a group and an order, and the page groups and sorts them.

Unless HQ runs with `TIDELINE_GALLERY=1`, `apps/hq/proxy.ts` answers
`/tideline` and everything under it with a plain 404 (`x-robots-tag:
noindex`) before any page, layout or loading UI runs; the pages also call
`notFound()` and set `robots: noindex`. The flag is read per request
(`apps/hq/app/tideline/gallery-guard.ts`). The gallery is in no navigation,
sitemap or route list. With the flag, it follows the normal HQ sign-in rules
(open in demo mode).

```bash
TIDELINE_GALLERY=1 pnpm dev:hq
# http://localhost:3001/tideline            light
# http://localhost:3001/tideline?theme=dark
# http://localhost:3001/tideline?theme=live
# http://localhost:3001/tideline/book-lesson   the booking flow
```

## Tests

- `pnpm --filter @duna/ui test` runs the Vitest suites in
  `packages/ui/src/tideline/`: the folder convention and stylesheet rules
  (`styles.test.ts`), token generation and contrast
  (`tokens/tokens.test.ts`), date math (`calendar/date-utils.test.ts`),
  AddPlayers selection rules (`add-players/add-players-logic.test.ts`), the
  booking reducer (`booking/booking-state.test.ts`), the interaction cores
  (`interactions/interaction-core.test.ts`), and the hooks
  (`interactions/hooks.test.ts`). `packages/ui` has no DOM test environment, so
  the hook tests run on a small stand-in for React's hook runtime; the real
  thing is covered in the browser.
- `pnpm --filter @duna/hq test` covers the gallery guard
  (`app/tideline/gallery-guard.test.ts`) and the sections list
  (`app/tideline/sections/sections.test.ts`).
- The Playwright spec `tests/e2e/tideline-gallery.spec.ts` checks keyboard
  operation of Dialog, Select, Combobox, DatePicker, Switch and Tabs, plus
  search cancellation, loader thresholds, button loading, optimistic undo and
  rollback, and the command palette. It skips itself unless the flag is set:

  ```bash
  TIDELINE_GALLERY=1 pnpm exec playwright test tests/e2e/tideline-gallery.spec.ts --project=desktop
  ```

  Playwright passes the flag to the HQ server it starts. If an HQ server
  without the flag is already on the port, stop it or set `PLAYWRIGHT_HQ_PORT`.

## Not included yet

- No existing screen has been refactored.
- The 4.1.1 components in
  [`tideline-4.1.1/components.md`](tideline-4.1.1/components.md) that are not
  listed above (NetScore, RatingRing, ClubMark, Map, TimeRail and others),
  which later work packages add as families.
- From the 2.1 component list: MatchCard, ScoreTable, ScoreEntry, ResultCard,
  RatingCard, BottomActionBar, the labelled TabBar, SideNav, AppHeader,
  CourtSchedule, CalendarWeek, DayAgenda, Carousel, PriceDetails, SplitPay,
  ShareLink, PassCard, charts, Table, PageHeader, PlanCard, ChoiceCard, Glass,
  PullToRefresh and the recipes.
- A full DataTable. Only the toolbar pattern (search, filter chips, sort) is
  shown, in the gallery.
- Multiple selection in `Select` and `Combobox`, grouped options, date
  presets, calendar event dots, submenus and checkbox menu items. UI SDK
  supports them; the wrappers do not expose them yet.
- Contrast conditions (`data-contrast="bright" | "glare"`) and club theming.

## React Native

UI SDK has adapters for React, Vue, Svelte, Solid and Web Components, and none
for React Native. Duna Player and Duna Pro will share the tokens (`tokens.ts`)
and the component names, props and states, and implement behaviour natively
(Pressable, Modal or a bottom sheet, FlatList, Reanimated). The framework-free
cores (`interactions/interaction-core.ts`, `interactions/debouncer.ts`,
`calendar/date-utils.ts`, `add-players/add-players-logic.ts`) have no DOM in them and can be reused as they are. That
work is out of scope here.
