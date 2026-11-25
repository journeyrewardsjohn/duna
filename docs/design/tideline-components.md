# Tideline components

Tideline is Duna's design system. `@duna/ui/tideline` is its component library
for the web: the look comes from Tideline tokens, and the behaviour (keyboard,
focus, dismissal, popups, ARIA) comes from Vercel's UI SDK.

This first version is additive. No existing screen, export or global stylesheet
uses it yet; later refactors adopt it screen by screen.

**Rule: new web UI uses `@duna/ui/tideline`.** Do not add a hand-written
button, dialog, menu, date picker or search box to an app. If a component is
missing, add it here.

`AGENTS.md` still describes the previous look (Satoshi, the HQ grey palette).
Tideline supersedes it for these components only.

## Use it

```tsx
import "@duna/ui/tideline/tideline.css"; // tokens are imported by this file
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

## How it sits on UI SDK

`@ui-sdk/core` and `@ui-sdk/react` are pinned at exactly `0.1.0-beta.17` in
`packages/ui/package.json`. It is a beta: only files in
`packages/ui/src/tideline/` import it, one small file per component family, so
a breaking change is fixed in one place. Apps never import `@ui-sdk/*`.

The UI SDK docs ship in the package
(`packages/ui/node_modules/@ui-sdk/react/docs/llms.txt`), and its agent skill
is vendored at `.agents/skills/ui-sdk`.

| Tideline component                                                                                                                                   | File                                                       | UI SDK primitive or behaviour                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `Button`, `IconButton`                                                                                                                               | `button.tsx`                                               | Button (pending state, `aria-busy`, disabled links through `render`)                   |
| `Switch`, `Checkbox`, `RadioGroup` + `RadioOption`                                                                                                   | `toggles.tsx`                                              | Switch, Checkbox, Radio                                                                |
| `Segmented`                                                                                                                                          | `segmented.tsx`                                            | Segmented Control (roving focus, sliding indicator)                                    |
| `Tabs`, `TabList`, `Tab`, `TabPanel`                                                                                                                 | `tabs.tsx`                                                 | Tabs                                                                                   |
| `Field`, `Input`, `Textarea`, `NumberInput`                                                                                                          | `field.tsx`                                                | Field, Input (+ InputGroup, InputClear), Textarea, Number Input                        |
| `Select`, `Combobox`                                                                                                                                 | `select.tsx`                                               | Select, Combobox (popup, selection, typeahead, filtering)                              |
| `Dialog*`, `Sheet*`                                                                                                                                  | `dialog.tsx`                                               | Dialog (`presentation="auto"`: a sheet on small touch screens), Drawer                 |
| `Popover*`, `Tooltip`, `Menu*`                                                                                                                       | `popover.tsx`                                              | Popover, Tooltip, Menu                                                                 |
| `Toaster`, `toast`                                                                                                                                   | `toast.tsx`                                                | Toast                                                                                  |
| `Calendar`, `DatePicker`, `DateRangePicker`, `TimePicker`                                                                                            | `calendar.tsx`                                             | Calendar, Date Picker (single and range), Time Input                                   |
| `DayStrip`, `TimeSlotGrid`                                                                                                                           | `day-strip.tsx`                                            | Radio (single selection, arrow keys). UI SDK has no day-strip or slot-grid primitive   |
| `Avatar`, `AvatarStack`, `AvatarLevel`                                                                                                               | `avatar.tsx`                                               | Avatar (image with fallback). Stack and level are presentational                       |
| `PlayerSlot`                                                                                                                                         | `avatar.tsx`                                               | Button, for an open slot with `onAdd`; otherwise presentational                        |
| `AddPlayers`                                                                                                                                         | `add-players.tsx`                                          | Toggle (Add / Added, `aria-pressed`), Button; search through `useAsyncSearch`          |
| `SearchField`                                                                                                                                        | `search-field.tsx`                                         | Input, InputGroup, InputClear                                                          |
| `CommandPalette`                                                                                                                                     | `command-palette.tsx`                                      | Dialog (modal, `mod+k` shortcut, focus return) + Command (fuzzy search, arrows, Enter) |
| `FilterChip`                                                                                                                                         | `surfaces.tsx`                                             | Toggle                                                                                 |
| `Progress`                                                                                                                                           | `progress.tsx`                                             | Progress                                                                               |
| `Card`, `Chip`, `Badge`, `Notice`, `EmptyState`, `Surface`, `Kbd`, `Stepper`, `Spinner`, `Sunrise`, `HorizonSweep`, `Skeleton`, `PageLoader`, `Icon` | `surfaces.tsx`, `progress.tsx`, `loaders.tsx`, `icons.tsx` | None: plain markup, no client JavaScript                                               |
| `TopProgress`, `LoadingBoundary`                                                                                                                     | `feedback.tsx`                                             | None: `useDelayedLoading`                                                              |

Hand-rolled because the beta has no primitive: `Stepper` (an ordered list with
`aria-current="step"`), `DayStrip` and `TimeSlotGrid` (composed from Radio),
`AvatarStack`, `AvatarLevel`, `PlayerSlot`, `Skeleton`, the loaders, the three
interaction hooks, and focus recovery after removing a player in `AddPlayers`.

Server and client: presentational files have no `"use client"` and add no
JavaScript. Files that use state, effects or render functions are client
modules: `button.tsx`, `select.tsx`, `calendar.tsx`, `toast.tsx`,
`search-field.tsx`, `add-players.tsx`, `command-palette.tsx`, `feedback.tsx`,
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

Motion tokens: 80ms press, 120ms hover and toggles, 180ms popovers and tabs,
260ms sheets and dialogs, one ease-out curve, press scale 0.98. Under
`prefers-reduced-motion` movement stops and state changes fall back to
opacity; every loop has a resting state.

## Tokens

`packages/ui/src/tideline/tokens.json` is the source. Two files are generated
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

The file currently holds a **Tideline 3 preview**: the published 2.1 tokens
with the Tideline 3 foundation decisions applied in code (Geist and Geist Mono,
near-monochrome neutrals, 6 / 8 / 12 / 16 radii, 32 / 36 / 40 controls with
44 / 48 / 52 on touch, the motion values above). When the Tideline 3
`tokens.json` is published, drop it in and reconcile. The stylesheet depends
on these names beyond 2.1's: `surface-subtle`, `selection`, `on-selection`,
`size-control*`, `size-control-touch*`, `size-row`, `size-icon-sm`,
`duration-loading-delay`, `duration-loading-min`, `duration-search-debounce`,
and the type styles `heading`, `phone-nav` and `code` with the `mono` family.

`border-control` stays a 3:1 grey so input, checkbox and switch edges meet
WCAG 1.4.11; hairlines (`line`, `line-strong`) are for cards, buttons and
dividers.

## Layers and the legacy bridge

`tideline.css` lives in `@layer tideline`, and every rule is nested under
`.td`. Any unlayered rule beats any layered one, and HQ and Web have unlayered
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
request" switch). Unless `TIDELINE_GALLERY=1` it calls `notFound()`, so production serves the
not-found page there and none of the gallery. (HQ's root `loading.tsx` starts
the response before the page runs, so the status code is 200 with the
not-found body; a guard for `/tideline` in `apps/hq/proxy.ts` would make it a
true 404.) In demo mode the HQ proxy lets it through.

```bash
TIDELINE_GALLERY=1 pnpm dev:hq
# http://localhost:3001/tideline            light
# http://localhost:3001/tideline?theme=dark
# http://localhost:3001/tideline?theme=live
```

## Tests

- `pnpm --filter @duna/ui test` runs the Vitest suites in
  `packages/ui/src/tideline/`: token generation and contrast
  (`tokens.test.ts`), date math and AddPlayers selection rules
  (`logic.test.ts`), the interaction cores (`interaction-core.test.ts`), and
  the hooks (`hooks.test.ts`). `packages/ui` has no DOM test environment, so
  the hook tests run on a small stand-in for React's hook runtime; the real
  thing is covered in the browser.
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
- `tideline.css` still carries the 2.1 rules with a Tideline 3 block after
  them that wins. Fold the two together when the Tideline 3 tokens land.

## React Native

UI SDK has adapters for React, Vue, Svelte, Solid and Web Components, and none
for React Native. Duna Player and Duna Pro will share the tokens (`tokens.ts`)
and the component names, props and states, and implement behaviour natively
(Pressable, Modal or a bottom sheet, FlatList, Reanimated). The framework-free
cores (`interaction-core.ts`, `debouncer.ts`, `date-utils.ts`,
`add-players-logic.ts`) have no DOM in them and can be reused as they are. That
work is out of scope here.
