# Legacy colour aliases (F2b)

Every pre-Tideline screen in `apps/web` and `apps/hq` takes the Duna Design
System (Tideline 4.1.1) colours through its old variables. No screen was
rebuilt: the legacy variables now point at Tideline roles. This file is the
mapping, the judgement calls and what is left for the surfaces' own work
packages. Wave 5 deletes the aliases with the legacy sheets.

## How the values reach legacy pages

- `pnpm tideline:tokens` also writes
  `packages/ui/src/tideline/tokens/tokens.root.css` (exported as
  `@duna/ui/tideline/tokens.root.css`): the same `--td-*` custom properties
  as the library's `tokens.css`, but on `:root`, unlayered, and with nothing
  else: no `color-scheme`, no font-family stack (`next/font` defines
  `--td-font-*` on `<html>`), no component style or reset.
  `pnpm tideline:tokens --check` and `tokens.test.ts` keep it current.
- Selectors: `:root` and `:root[data-theme="light"]` (light, Salt ground),
  `:root[data-theme="dark"]`, the live zone (`:root[data-zone="live"]` and any
  descendant `[data-zone="live"]`, because a live section sits inside a light
  page), and `:root[data-zone="hq"]` (white ground) with its dark and live
  variants.
- `packages/ui/src/styles.css`, which both apps load first, imports it on its
  first line.
- Themes: both apps already resolve Light / Dark / Match device onto
  `<html data-theme>` before paint (`themeBootScript` reads the stored choice
  and the system preference; the theme toggle rewrites it), so the root
  sheet only needs the attribute and has no `prefers-color-scheme` block.
- Zone: `apps/hq/app/layout.tsx` sets `data-zone="hq"` on `<html>`. The HQ
  body keeps its legacy `data-zone="operator"`, which the HQ sheets select on.
- A `var()` alias resolves on the element that declares it. The legacy
  aliases are therefore declared once on `:root` (they follow the theme
  because the `--td-*` values change on the same element), and a live zone
  redeclares them on its own element.
- `rgb(var(--x-rgb) / a)` cannot read a variable, so the `*-rgb` triplets are
  written as the channels of the role named in a comment beside each one.

## Mapping

### Shared legacy names (`packages/ui/src/styles.css`, player and public)

| Legacy variable                                            | Tideline role                                                         | Reason                                                       |
| ---------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------ |
| `--ground`, `--dissolve`                                   | `--td-ground`                                                         | Salt on player and public; white in HQ (zone)                |
| `--ground-warm`                                            | `--td-surface-warm`                                                   | the warm plane, Salt in light                                |
| `--ground-cool`                                            | `--td-surface-sunken`                                                 | a recessed plane; the marine blue is retired                 |
| `--surface-1`                                              | `--td-surface`                                                        | cards stay white                                             |
| `--surface-2`                                              | `--td-surface-sunken`                                                 | wells, chips, avatars                                        |
| `--surface-3`                                              | `--td-surface-raised`                                                 | popovers and raised cards                                    |
| `--hairline` / `--hairline-strong`                         | `--td-line` / `--td-line-strong`                                      | dividers and control edges                                   |
| `--scrim`                                                  | `--td-scrim`                                                          |                                                              |
| `--text-1` / `--text-2` / `--text-3`                       | `--td-text` / `--td-text-2` / `--td-text-3`                           | three text levels                                            |
| `--text-on-accent`                                         | `--td-on-action`                                                      | label on the primary action                                  |
| `--btn-primary-bg` / `-fg` / `-hover`                      | `--td-action` / `--td-on-action` / `--td-action-hover`                | Night Court with a Salt label; Dune with Night Court in dark |
| `--btn-ghost-border`                                       | `--td-border-control`                                                 | control boundary (3:1 on white)                              |
| `--focus-ring`                                             | `--td-focus`                                                          | was flare orange                                             |
| `--gain` / `--loss`                                        | `--td-positive` / `--td-danger`                                       |                                                              |
| `--color-warning`                                          | `--td-warning`                                                        | was the gold accent                                          |
| `--gold`, `--signal`                                       | `--td-energy`                                                         | Dune, the warm signal (fills only)                           |
| `--signal-text`                                            | `--td-energy-ink`                                                     | readable warm text                                           |
| `--flare`                                                  | `--td-energy`                                                         | retired orange; see "The old orange" below                   |
| `--flare-text` / `-fill` / `-border`                       | `--td-energy-ink` / `--td-energy-wash` / Dune 60%                     |                                                              |
| `--performance-ground`, `--color-ink`                      | `--td-mesh-night-court-base`                                          | the dark Night Court plane                                   |
| `--glass-fill` / `--glass-border`                          | surface at 72% / `--td-glass-edge`                                    |                                                              |
| `--image-veil` (dark)                                      | Night Court at 16%                                                    |                                                              |
| `--overlay-rgb`, `--text-rgb`, `--accent-rgb`, `--ink-rgb` | channels of `--td-text` / `--td-action`                               | Night Court in light; Salt / Dune in dark                    |
| `--muted-rgb`                                              | channels of `--td-text-2`                                             |                                                              |
| `--warning-rgb` / `--positive-rgb` / `--danger-rgb`        | channels of `--td-warning` / `--td-positive` / `--td-danger`          | was gold / green / rust                                      |
| `--flare-rgb`                                              | channels of `--td-energy`                                             |                                                              |
| `--shadow-small` / `--shadow-large`                        | Night Court at 6% / 8%                                                | shadows carry Night Court, not warm black                    |
| `--color-*` compatibility names                            | the semantic names above                                              | unchanged indirection                                        |
| `--sand-100/300/500`                                       | `--td-dune-100/300/500`                                               | palette constants keep a constant                            |
| `--marine-200/400/900`                                     | `--td-sky-300`, `--td-tide-300`, `--td-tide-900`                      |                                                              |
| `--ink`, `--fog-50`                                        | `--td-brand-night-court`, `--td-brand-salt`                           | theme-independent constants by design                        |
| `--ink-soft`, `--fog-100`                                  | `--td-haze-800`, `--td-haze-100`                                      |                                                              |
| `--dusk`, `--dusk-deep`                                    | `--td-dusk-100`, `--td-dusk-300`                                      |                                                              |
| `--pending`                                                | `--td-text-3`                                                         |                                                              |
| `::selection`                                              | `--td-energy` with `--td-on-energy`                                   |                                                              |
| `--hq-tint/core/ink/deep` (outside HQ)                     | `--td-surface-sunken`, `--td-line-strong`, `--td-text`, `--td-action` | the old lime HQ accent is retired                            |

### Player (`player-workspace.css`) and public (`public-website.css`, `apps/web/app/design-v4.css`)

| Legacy variable                                                                    | Tideline role                                     | Reason                                                                                                                         |
| ---------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `--player-ground`, `--public-ground`, `--duna-web-snow`                            | `--td-ground`                                     | player and public surfaces sit on Salt                                                                                         |
| `--player-surface`, `--duna-web-white`, `--duna-web-logo-surface`                  | `--td-surface`                                    | cards stay white                                                                                                               |
| `--player-soft`, `--public-soft`, `--duna-web-surface-grey`                        | `--td-surface-sunken`                             |                                                                                                                                |
| `--player-text`, `--public-ink`, `--duna-web-charcoal`, `--duna-web-logo-ink`      | `--td-text`                                       |                                                                                                                                |
| `--player-muted`, `--public-muted`, `--duna-web-grey-600`, `--duna-web-sky-ink`    | `--td-text-2`                                     | was #636363 / #646464                                                                                                          |
| `--duna-web-grey-500`, `--duna-web-mist`                                           | `--td-text-3`                                     |                                                                                                                                |
| `--duna-web-grey-300`                                                              | `--td-text-disabled`                              |                                                                                                                                |
| `--player-line`, `--public-line`, `--duna-web-hairline`, `--duna-web-blush-border` | `--td-line`                                       |                                                                                                                                |
| `--duna-web-border`, `--duna-web-sky-border`                                       | `--td-line-strong`                                |                                                                                                                                |
| `--duna-web-charcoal-press`                                                        | `--td-action-hover`                               |                                                                                                                                |
| `--duna-web-navy`                                                                  | `--td-action`                                     | used as the primary fill (with `--duna-web-on-navy`) and as strong text; a constant Night Court disappeared on the dark ground |
| `--duna-web-on-navy` (`-muted`), `--duna-web-navy-2`                               | `--td-on-action` (76%), `--td-mesh-night-court-b` | the footer gradient keeps a constant Night Court plane with Salt text                                                          |
| `--duna-web-sky`, `--duna-web-sky-2`                                               | `--td-info-wash`                                  | pale blue wash                                                                                                                 |
| `--duna-web-sky-3`, `--duna-web-cream-2`                                           | `--td-surface-subtle`                             |                                                                                                                                |
| `--duna-web-blush`, `--duna-web-sand`, `--duna-web-gold`                           | `--td-energy`                                     | warm accents become Dune                                                                                                       |
| `--duna-web-blush-2`                                                               | `--td-energy-wash`                                |                                                                                                                                |
| `--duna-web-blush-3`, `--duna-web-cream`                                           | `--td-surface-warm`                               |                                                                                                                                |
| `--duna-web-rust`, `--duna-web-gold-ink`                                           | `--td-energy-ink`                                 | rust text was a retired orange                                                                                                 |
| `--duna-web-live`                                                                  | `--td-live`                                       | only as a live mark; the editorial `--loss` now uses `--td-danger`                                                             |
| `--duna-web-positive`                                                              | `--td-positive`                                   |                                                                                                                                |
| editorial `--focus-ring`                                                           | `--td-focus`                                      | was rust                                                                                                                       |
| editorial `--btn-primary-*`, `--text-on-accent`                                    | `--td-action`, `--td-on-action`                   |                                                                                                                                |
| hero / nav / warm / club gradients                                                 | Dune at the same strength                         | the blush, sand, gold and rust glows                                                                                           |
| dark-theme palette overrides                                                       | deleted                                           | the roles flip with `data-theme`                                                                                               |

### HQ (`packages/ui/src/hq-workspace.css`)

HQ sits on white / cool neutral. The HQ zone repaints `--td-ground` white,
but the light theme's `--td-surface-sunken` (#ECE8DF) and `--td-line`
(#E2DED3) are warm, so HQ takes its neutral fills and hairlines from the cool
`haze` ramp in light and from the (already cool) dark roles in dark. This
block also sets the shared names that `apps/hq/app/design-v3.css` set for the
operator zone, so HQ has one palette.

| Legacy variable                            | Light                                 | Dark                                    | Reason                                      |
| ------------------------------------------ | ------------------------------------- | --------------------------------------- | ------------------------------------------- |
| `--hq-ground`, `--hq-surface`              | `--td-ground` (white), `--td-surface` | Night Court, `#17262F`                  | zone `hq`                                   |
| `--hq-soft`, `--hq-tint`, `--hq-rail`      | `--td-haze-50`                        | `--td-surface-raised` (rail: `-sunken`) | cool neutral, never sand                    |
| `--hq-line`, `--hq-border`                 | `--td-haze-200`                       | `--td-line`                             | the light `--td-line` is warm               |
| `--hq-core`, `--hairline-strong`           | `--td-haze-300`                       | `--td-line-strong`                      |                                             |
| `--hq-edge`                                | `--td-haze-300`                       | `--td-line-strong`                      | popover edge                                |
| `--hq-text`, `--hq-ink`                    | `--td-text`                           | same                                    |                                             |
| `--hq-muted`                               | `--td-text-3`                         | same                                    | `--text-2` takes `--td-text-2`              |
| `--hq-deep`, `--color-aqua`                | `--td-action`                         | same (Dune)                             | used as the primary fill and as strong text |
| `--hq-text-on-deep`, `--hq-action-on-deep` | `--td-on-action`                      | same                                    |                                             |
| `--hq-*-on-deep` muted / line / surface    | `--td-on-action` at 76% / 24% / 10%   |                                         |                                             |
| `--hq-focus`                               | `--td-focus`                          | same                                    |                                             |
| `--hq-shadow-color`                        | `--td-brand-night-court`              | `#000`                                  | shadows carry colour                        |
| `--hq-highlight`                           | `--td-haze-0`                         | `--td-line-strong`                      |                                             |
| HQ nav selected wash                       | `--td-hq-nav-selected-wash`           | same                                    | was a pale blue                             |

## The old orange, use by use

`--flare` itself is Dune (`--td-energy`, a fill), with `--td-energy-ink` for
text. Inside a live zone it stays Dune: a live zone is a dark ground, not a
live state, so Solar appears only on explicit live indicators.

| Where (selector)                                                                                                                                                            | Meaning                                    | Now                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------- |
| `.duna-live-dot`, `.duna-status--live`, `.duna-badge--live`, `duna-live-pulse`                                                                                              | live                                       | `--td-live`, `-wash`, `-ink`              |
| HQ `.today-list article > i.live`, `.venue-match-operations__list > article[data-state="live"]`                                                                             | live                                       | `--td-live`                               |
| Web `.pro-live-scoreboard__status--live`, `__now`, `__set.is-current`, `.professional-match-card__sets > span.is-current`                                                   | live play, current set                     | `--td-live` roles                         |
| Web `.vision-remote__status--recording svg`                                                                                                                                 | recording now                              | `--td-live`                               |
| `.duna-badge--danger` (shared with live before)                                                                                                                             | danger                                     | `--td-danger` roles                       |
| `.duna-metric--urgent`                                                                                                                                                      | needs attention                            | `--td-attention` roles                    |
| Web `.deletion-confirm`, `.source-import-status__error`, `.vision-remote__error`, `.vision-remote__hero > button.is-ending`, `.player-account-menu > div button` (sign out) | destructive / error                        | `--td-danger` roles                       |
| Web `.match-confirmation--disputed > svg`, `.division-explorer ... strong.is-low`                                                                                           | caution, low spots (never scarcity orange) | `--td-warning`                            |
| HQ `.icon-button i`, `.team-calendar-day--needed`, `.team-calendar-legend__needed`; web `.notification-dot`                                                                 | unread / needed                            | `--td-attention`                          |
| HQ `.calendar-now` (current-time line)                                                                                                                                      | time, not play                             | `--td-action`                             |
| Web `.rating-trend-chart__line` / `__point`                                                                                                                                 | primary chart series                       | `--td-action` (area keeps the Dune wash)  |
| HQ `.event-table__icon`, `.calendar-session--flare`; web event markers in calendars, `.wallet-activity__icon--prize`, `.campaign-operator__insight`, `.campaign-hero h1 em` | warm accent                                | `--td-energy-ink` on `--td-energy-wash`   |
| Hero suns, glows, confetti, `next-up` / pickup / registration / athlete / ranking glows, `.guided-product-builder` type tint                                                | decoration                                 | Dune (`--td-energy`) at the same strength |
| HQ `.money-rail-warning`, `.money-dispute-list__icon`, `.event-live-arrivals ... running-late`, `.money-reconciliation-banner--attention > span`                            | warning                                    | `--td-warning` roles                      |
| Web `--discover-coral` (coach pins)                                                                                                                                         | taxonomy                                   | `--td-dusk-500`                           |
| HQ sidebar count badge (`.hq-sidebar nav a i`)                                                                                                                              | count                                      | Dune with Night Court text (alias)        |

## The old blue primary action

Replaced with `--td-action` / `--td-on-action` (or a Night Court plane where
the old block was a constant dark panel): the action centre launcher, avatar,
send and approval buttons and the user's message bubble
(`packages/ui/src/styles.css`); the Ask Duna workspace intro, user turn,
approval and send buttons; Settings' active section and readiness card; the
offering form (`.guided-product-builder`, whose navy / ivory / blush palette
now uses HQ roles); the HQ sidebar's selected item; Discover's `--discover-ink`
and `--discover-blue` (`--td-brand-night-court`: the Discover page draws its
own white cards in both themes, so a theme-flipping role would make its white
labels disappear).

Sign-in's "Continue to Duna" (`.auth-entry__primary`, blue) sits on a
constant white card, so it takes the constant `--td-brand-night-court` with a
Salt label.

Labels written as `#fff`, `white`, `#f2f0ea` or `--color-white` on an action
fill (`--hq-deep`, `--color-aqua`, `--color-aqua-deep`, `--btn-primary-bg`,
`--btn-primary-hover`, `--hq-ink`, `--duna-web-navy`) in the HQ and web global
sheets now use `--td-on-action`, so they stay legible when the action turns
Dune in dark (41 declarations). The wallet card's buttons take
`--td-text-inverse` against their `--color-ink` fill.

## Contrast fixes (measured on the rendered pages)

A script walked every visible text node on the 17 pages below in light and
dark at 1440px and composited its colour on the real background. Fixed by
choosing a role (or, on a constant light card, the matching ramp step):

- captions written as `rgb(var(--muted-rgb) / 48%)` in the web sheet (11; the
  sidebar handle, wallet labels) and HQ's search trigger and placeholder:
  `--td-text-3`;
- HQ `.money-movement-card > small` (raw sand): `--td-text-3`;
- HQ member avatar and other white labels on the action-hover fill: as above;
- Discover's raw greys on its white search bar and Pro Tour band, and the
  sign-in card's secure / alternate / body text: `--td-haze-500` / `-600`;
- the sign-in card kicker (sand on white): `--td-dune-700`; the hero
  benefit chips: Salt.

Left: the sign-in page relies on its video for a dark ground (the editorial
zone paints Salt behind it in light); it was so before and is a rebuild item.

## What remains (rebuild, not alias)

See the PR description for the raw-colour counts. Retired orange still
present, deliberately:

- `apps/web/app/globals.css`: `.health-page` `--health-coral`,
  `.health-strain-meter` gradient (health data colours belong to the health
  work package); `.ticket-selector__card--2` / `--vip` art gradients;
  weather icons (`.weather-inline svg`, `.weather-card__icon`), which are an
  amber sun glyph, not an accent; the campaign gold text on dark campaign
  pages (sand gold, not orange).
- CSS modules (`*.module.css`) are outside this package: they take the
  aliases through `var(--flare)` and friends, but raw values inside them
  (for example the watch marketing page) wait for P2 / P-series rebuilds.
- `apps/web/app/design-v3.css` `.club-marketing-page` now points its
  `--hq-*` accent at Dune / Night Court (the lime is retired); the CSS-module
  pages that read `--hq-*` (training, run-your-business) take the shared
  aliases.
