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
- Themes and zones are `data-` attributes on the `.td` wrapper (the
  `Tideline` props set them). See "Themes and zones" under Tokens.
  A nested scope states its own theme and zone; it never inherits them.
- Popups (dialogs, menus, selects, toasts) render in place in the browser's
  top layer, so they stay inside the scope. Render `Toaster` once per scope.
- A screen on the design system lives in its app's `(next)` route group,
  whose root layout imports only `@duna/ui/tideline/styles.css` (see
  "Layers" and [`hq-shell.md`](hq-shell.md)); it never shares a document
  with a legacy sheet.

Public import paths (`packages/ui/package.json` exports). HQ and Web both
list `@duna/ui` in `transpilePackages`, so either app can use them:

| Path                                  | What it is                                                     |
| ------------------------------------- | -------------------------------------------------------------- |
| `@duna/ui/tideline`                   | Every component, hook and helper (`tideline/index.ts`)         |
| `@duna/ui/tideline/styles.css`        | The one stylesheet: tokens plus every family, in cascade order |
| `@duna/ui/tideline/legacy-bridge.css` | The unlayered bridge for Web pages that still share legacy CSS |
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
The interaction kit adds `motion`, `confirm`, `states` and `form` (and extends `interactions`, `loaders`, `toast`): see [`interaction-kit.md`](interaction-kit.md).
`score` (NetScore, RatingRing) and `identity` (ClubMark, ClubLockup,
MembershipCard and its pass, the Wallet: see [`wallet.md`](wallet.md)) render
state computed in `@duna/tideline-core` (`netScoreState`, `netScoreSentence`,
`scoreAnnouncement`, the rating-ring geometry, `clubMarkModel`, and the
wallet model in `wallet.ts` / `qr.ts`), so native draws the same
thing; `avatar` also holds `WindowAvatar` (a place seen through the mark).

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
4. Add `apps/hq/app/(next)/tideline/sections/<family>.tsx` that default exports its
   gallery examples (`GalleryExample[]`, see `apps/hq/app/(next)/tideline/gallery.ts`),
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
- **No `!important`.** Win with the layer and specificity instead.
  `styles.test.ts` fails on any important declaration. The
  Tideline guard in `pnpm verify:design-system` enforces the same rule (plus
  no retired orange, Solar only on live states, no vendor names in copy)
  with no exemptions for the library.
- **Colour discipline.** Solar (`live`, `live-ink`, `live-wash`) only inside
  a live-state selector (the live chip, live notice, live badge, recording);
  offline, scarcity, dates and CTAs never wear it. Dune (`sun`, `energy`) is
  a non-text accent: warm text and small marks use `sun-ink` / `energy-ink`.
  Raw colours never appear in a family stylesheet.
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

| Tideline component                                                                                                                                   | File (under `tideline/`)                               | UI SDK primitive or behaviour                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `Button`, `IconButton`                                                                                                                               | `button/button.tsx`                                    | Button (pending state, `aria-busy`, disabled links through `render`)                      |
| `Switch`, `Checkbox`, `RadioGroup` + `RadioOption`                                                                                                   | `toggles/toggles.tsx`                                  | Switch, Checkbox, Radio                                                                   |
| `Segmented`                                                                                                                                          | `segmented/segmented.tsx`                              | Segmented Control (roving focus, sliding indicator)                                       |
| `Tabs`, `TabList`, `Tab`, `TabPanel`                                                                                                                 | `tabs/tabs.tsx`                                        | Tabs                                                                                      |
| `Field`, `Input`, `Textarea`, `NumberInput`                                                                                                          | `field/field.tsx`                                      | Field, Input (+ InputGroup, InputClear), Textarea, Number Input                           |
| `Select`, `Combobox`                                                                                                                                 | `select/select.tsx`                                    | Select, Combobox (popup, selection, typeahead, filtering)                                 |
| `Dialog*`, `Sheet*`                                                                                                                                  | `dialog/dialog.tsx`                                    | Dialog (`presentation="auto"`: a sheet on small touch screens), Drawer                    |
| `Popover*`, `Tooltip`, `Menu*`                                                                                                                       | `popover/popover.tsx`                                  | Popover, Tooltip, Menu                                                                    |
| `Toaster`, `toast`                                                                                                                                   | `toast/toast.tsx`                                      | Toast                                                                                     |
| `Calendar`, `DatePicker`, `DateRangePicker`, `TimePicker`                                                                                            | `calendar/calendar.tsx`                                | Calendar, Date Picker (single and range), Time Input                                      |
| `DayStrip`, `TimeSlotGrid`                                                                                                                           | `time/day-strip.tsx`                                   | Radio (single selection, arrow keys). UI SDK has no day-strip or slot-grid primitive      |
| `Avatar`, `AvatarStack`, `AvatarLevel`                                                                                                               | `avatar/avatar.tsx`                                    | Avatar (image with fallback). Stack and level are presentational                          |
| `ClubMark`, `ClubLockup`                                                                                                                             | `identity/club-mark.tsx`                               | Avatar (logo or tile with the monogram as fallback, so a broken image shows the monogram) |
| `MembershipCard`, `MembershipPass`, `CardFlip`, `CardArt`                                                                                            | `identity/membership-card.tsx`, `membership-pass.tsx`  | None: markup, canvas (one shared WebGL renderer) and SVG (`QrCode`)                       |
| `Wallet`, `WalletCarousel`, `WalletStack`, `WalletActions`                                                                                           | `identity/wallet*.tsx`                                 | Button (switch, actions, Back to stack); carousel `tablist`, stack `listbox`              |
| `CardArrival`, `CardArtPicker`                                                                                                                       | `identity/card-arrival.tsx`                            | None: CSS transitions; the picker is a `radiogroup`                                       |
| `NetScore`, `RatingRing`, `WindowAvatar`                                                                                                             | `score/`, `identity/`, `avatar/window-avatar.tsx`      | None: markup and SVG; NetScore's live announcer and NumberChange are client parts         |
| `PlayerSlot`                                                                                                                                         | `avatar/avatar.tsx`                                    | Button, for an open slot with `onAdd`; otherwise presentational                           |
| `AddPlayers`                                                                                                                                         | `add-players/add-players.tsx`                          | Toggle (Add / Added, `aria-pressed`), Button; search through `useAsyncSearch`             |
| `SearchField`                                                                                                                                        | `search/search-field.tsx`                              | Input, InputGroup, InputClear                                                             |
| `CommandPalette`                                                                                                                                     | `command-palette/command-palette.tsx`                  | Dialog (modal, `mod+k` shortcut, focus return) + Command (fuzzy search, arrows, Enter)    |
| `FilterChip`                                                                                                                                         | `surfaces/surfaces.tsx`                                | Toggle                                                                                    |
| `Progress`                                                                                                                                           | `progress/progress.tsx`                                | Progress                                                                                  |
| `Card`, `Chip`, `Badge`, `Notice`, `EmptyState`, `Surface`, `Kbd`, `Stepper`, `Spinner`, `Sunrise`, `HorizonSweep`, `Skeleton`, `PageLoader`, `Icon` | `surfaces/`, `progress/`, `loaders/`, `base/icons.tsx` | None: plain markup, no client JavaScript                                                  |
| `TopProgress`, `LoadingBoundary`                                                                                                                     | `loaders/feedback.tsx`                                 | None: `useDelayedLoading`                                                                 |

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

Motion follows contract R10: three verbs, each a named duration and easing.

| Verb  | Means                           | Tokens                                                                     |
| ----- | ------------------------------- | -------------------------------------------------------------------------- |
| Rise  | Something grows out of a line   | `--td-duration-rise` 600ms, `--td-ease-rise`                               |
| Rally | Things arrive one after another | `--td-duration-rally` 600ms, `--td-ease-rally`, `--td-stagger-rally` 120ms |
| Cross | Something travels over a line   | `--td-duration-cross` 320ms, `--td-ease-cross`                             |

Interface feedback keeps the small durations: 80ms press, 120ms hover and
toggles, 180ms popovers and tabs, 260ms sheets and dialogs, one ease-out
curve (`cubic-bezier(0.2, 0.8, 0.2, 1)`), press scale 0.98. Nothing bounces,
springs or overshoots (every curve stays inside 0..1; `tokens.test.ts`
checks), and nothing scales on hover. Entrances play once; only loaders and
the live indicator loop.

Reduced motion is in the token layer: under `prefers-reduced-motion: reduce`
`tokens.css` sets Rise, Rally and Cross to a 200ms fade
(`--td-duration-fade-reduced`), the Rally stagger to 0, and popovers and
sheets to 120ms; `base.css` sets `--td-motion: 0`, which multiplies every
transform to nothing. Every loop has a resting state in its family's own
stylesheet.

## Tokens

The source of truth is the contract's
[`tideline-4.1.1/tokens.json`](tideline-4.1.1/tokens.json). Three files are
generated from it and must not be edited by hand:

- `packages/ui/src/tideline/tokens/tokens.json`: the code token source, which
  the web and native builders read. It is the contract file with the
  canonical renames applied, the retired tokens removed, the contrast
  adjustments applied and the `$duna` zone and icon decisions promoted to
  ordinary tokens (`canonicalTidelineSource` in `token-build.ts`).
- `tokens.css`: every token as a `--td-*` custom property, with theme and
  zone values selected by `data-theme` / `data-zone` on the `.td` wrapper
  (never on `:root`), and the reduced-motion values.
- `tokens.ts`: resolved values (numbers for lengths and times) for React
  Native, with `tidelineColors(theme, zone)`.

To take a design revision, replace the contract file and run:

```bash
pnpm tideline:tokens          # rewrites tokens.json, tokens.css and tokens.ts
pnpm tideline:tokens --check  # fails if any is stale
```

### Names

Semantic roles keep their names, so components never change for a value:
`ground`, `surface*`, `line*`, `border-control`, `text*`, `action*`,
`on-action*`, `link`, `focus`, `selected*`, `sun*`, `energy*`, `attention*`,
`live*`, `positive*`, `warning*`, `danger*`, `info*`, `club-*`, `mesh-*`.

The contract's primitive ramps reuse brand words for other colours, so the
build renames them, keeping every value:

| Contract ramp | Code name    | What it is                                                       |
| ------------- | ------------ | ---------------------------------------------------------------- |
| `salt-*`      | `haze-*`     | Cool grey ramp (`haze-0` is white)                               |
| `night-*`     | `umber-*`    | Warm brown ramp; product dark neutrals are `graphite-*`          |
| `flare-*`     | `solar-*`    | Solar ramp (`solar-500` is #F2542D); live states only            |
| `sunburst-*`  | `hardwood-*` | Hardwood ramp (`hardwood-400` is #B5814F)                        |
| `sun-*`       | `dune-*`     | Dune ramp (`dune-400` is #D9C3A0); the `sun` role keeps its name |

The brand colours are `brand-night-court` (#0E1A22), `brand-salt`
(#F4F2EC), `brand-dune` (#D9C3A0), `brand-hardwood` (#B5814F) and
`brand-solar` (#F2542D). No token is named `salt` or `night-court` unless it
is the brand value. Components use roles, not primitives or brand tokens;
the exceptions are labels on a fixed fill (`.td-btn--light`, the live badge
use `brand-night-court`).

Promoted from `$duna`: icon sizes `size-icon-chip` 14, `size-icon-inline`
16, `size-icon-control` 20, `size-icon-nav` 24, `size-brand-mark-max` 24, and
`icon-stroke` 1.75, `icon-linecap` square, `icon-linejoin` miter (the 18px
`size-icon` is retired; `size-icon-sm` and `size-icon-lg` stay as 16 / 20
aliases); the HQ shell `hq-sidebar-expanded` 248px, `hq-sidebar-collapsed`
64px, `hq-top-bar` 56px and the themed `hq-nav-selected-wash`.

Type: `--td-font-brand` is Jost (falling back to Geist until the Jost files
load, work package F3), with `--td-type-brand-weight` 500,
`--td-type-brand-tracking` -0.015em and `--td-type-brand-min` 22px. The
`.td-display` role, the one title per screen, uses it; every other role is
Geist (`--td-font-ui`), numerals Geist 600 tabular, codes Geist Mono.

### Themes and zones

| Attribute on `.td`                          | Prop           | Effect                                                                                                               |
| ------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------- |
| none, or `data-theme="light"`               | default        | Light: Salt ground (the player ground), white cards                                                                  |
| `data-theme="dark"`                         | `theme="dark"` | The person's dark preference: Night Court ground                                                                     |
| `data-zone="live"` (or `data-theme="live"`) | `zone="live"`  | Play in progress; wins over the theme                                                                                |
| `data-zone="hq"`                            | `zone="hq"`    | HQ: white / cool neutral ground, never Salt or sand; keeps the theme (`data-zone="hq" data-theme="dark"` is HQ dark) |

`tidelineColors(theme, zone)` returns the same resolved set for native code.

### Contrast

`tokens.test.ts` checks, in light, dark and live and in the player and HQ
zones: 4.5:1 for every text role on every ground and surface it may sit on,
every label on its fill (`on-action` on `action` and `action-hover`, ...) and
every status ink on its wash; 3:1 for `border-control`, `focus`, `action`,
`selected-ring`, `live` and `energy-ink` marks on ground, surface and
surface-subtle. Disabled labels are exempt (WCAG 1.4.3). One published
value is adjusted (`TIDELINE_VALUE_ADJUSTMENTS`): light `border-control`
#8A9399 is 2.79:1 on Salt, so the code uses `haze-400` (#7F8A95, 3.14:1).

The build skips any published type style below the 12px floor (the 11px
`tab-label`): it stays in `tokens.json` but is not generated. Names the code
needs before design publishes them live in `tokens.additions.json` (the 12px
`micro` style, `duration-rally`, `ease-rally`, `ease-cross`,
`duration-fade-reduced` and the reduced-motion values); a published name
always wins.

Following the published system, text fields use the hairline `line-strong`
border; small indicators (checkbox, radio, switch) keep the 3:1
`border-control`.

The primary button label is `on-action`: Salt on Night Court in light, Night
Court on Dune in dark and live. A disabled primary is `action-disabled` with
a `text-3` label, always shown with its reason.

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

## Layers

Every family stylesheet lives in `@layer tideline`, and every rule is nested
under `.td`. `styles.css` declares the order `@layer ui-sdk, tideline;` before
anything else. An app's own sheet for design-system screens (HQ:
`apps/hq/app/(next)/hq.css`) adds its layer after these
(`@layer ui-sdk, tideline, hq;`), so it can lay out a library part without
`!important`.

HQ's design-system screens live in a separate root layout (`app/(next)`)
whose document carries no legacy CSS, so they need no bridge
([`hq-shell.md`](hq-shell.md)). `legacy-bridge.css`, a small unlayered file
that uses `revert-layer` to hand properties back from unlayered global CSS,
remains only for Web pages that still share a document with legacy sheets
(today `apps/web/app/legal`); delete it when Web has its own `(next)` group.

## Gallery

`apps/hq/app/(next)/tideline/page.tsx` opens with **Foundations**: the brand
colours, the palette by role in light, HQ, dark and live, the type roles
(Jost falls back to Geist until F3), the icon scale and the motion verbs.
Then it shows every component and state, with an
Interactions lab (simulated latency of 0 / 150 / 600 / 2000ms and a "fail next
request" switch). It builds its sections from
`apps/hq/app/(next)/tideline/sections/<family>.tsx`: each file default exports its
examples with a group and an order, and the page groups and sorts them.

Unless HQ runs with `TIDELINE_GALLERY=1`, `apps/hq/proxy.ts` answers
`/tideline` and everything under it with a plain 404 (`x-robots-tag:
noindex`) before any page, layout or loading UI runs; the pages also call
`notFound()` and set `robots: noindex`. The flag is read per request
(`apps/hq/app/(next)/tideline/gallery-guard.ts`). The gallery is in no navigation,
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
  (`app/(next)/tideline/gallery-guard.test.ts`) and the sections list
  (`app/(next)/tideline/sections/sections.test.ts`).
- The Playwright spec `tests/e2e/tideline-gallery.spec.ts` checks keyboard
  operation of Dialog, Select, Combobox, DatePicker, Switch and Tabs, plus
  search cancellation, loader thresholds, button loading, optimistic undo and
  rollback, the command palette, the Foundations grounds per theme and zone,
  that closed UI SDK parts stay hidden, and that Solar appears only on live
  states. It skips itself unless the flag is set:

  ```bash
  TIDELINE_GALLERY=1 pnpm exec playwright test tests/e2e/tideline-gallery.spec.ts --project=desktop
  ```

  Playwright passes the flag to the HQ server it starts. If an HQ server
  without the flag is already on the port, stop it or set `PLAYWRIGHT_HQ_PORT`.

## Time and conditions (C4, C5)

Presentational: data comes in as props, rules come from `@duna/tideline-core`
(which `@duna/ui` depends on), and every component takes an explicit IANA
zone. Every state is on `/tideline/time-and-light` in the gallery; the
Playwright spec is `tests/e2e/tideline-time-conditions.spec.ts`.

| Component        | Built on                                   | Notes                                                                                                                                                                               |
| ---------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DayStrip`       | UI SDK Radio                               | Takes `days` from `dayStrip()` (or the older `start` / `count`); "Today", count with micro mark or em dash, month label at boundaries, `aria-current="date"`, selected kept in view |
| `TimeSlots`      | UI SDK Radio                               | Chips grouped by daypart with the light mark; 14 px marks; width measured from the longest label; available, few left, full, outside hours, too dark, selected, just taken (stale)  |
| `TimeRail`       | none (ordered list)                        | Vertical day: events in lanes, free windows, a moving "now" line, sunrise / sunset, the daylight-saving change                                                                      |
| `DurationCrests` | UI SDK Radio                               | Up to three crest options (1 crest per first hour, +1 per half hour); longer club lengths as plain options                                                                          |
| `Dayparts`       | toggle buttons (`aria-pressed`)            | Multi-select filter by the venue's light                                                                                                                                            |
| `TimeZoneNote`   | none                                       | "Times in PST" only when the venue's clock differs from the viewer's                                                                                                                |
| `LightMark`      | `Icon`                                     | Glyph, inline or chip; always labelled                                                                                                                                              |
| `SunArc`         | SVG                                        | Light left, or time until first light; elapsed arc draws once                                                                                                                       |
| `WindOnCourt`    | SVG                                        | Wind relative to the court axis, favoured end in words, chip at 12 mph steady / 14 mph gusts                                                                                        |
| `Conditions`     | `NotConfigured` for the unconfigured state | Full panel: temperature, play call (icon, words, crests), readings, hourly, sun arc, wind on court; loading, no data, stale, not configured                                         |
| `ConditionsLine` | UI SDK Popover (wide) / Drawer (phone)     | One line that never wraps (drops parts in the core's priority order); call only when caution or stop; stop announced; opens `Conditions`                                            |

## Not included yet

- No existing screen has been refactored.
- The 4.1.1 components in
  [`tideline-4.1.1/components.md`](tideline-4.1.1/components.md) that are not
  listed above (Map, TimeRail and others),
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
