# Duna Brand Book 2.0 for the product

Distilled from the owner's brand handoff (`duna-brand-handoff`, 26 November
2026: `README.md`, `SPEC.md`, `tokens/`, `motion/duna-motion.css`, reference
boards) and the Tideline 4.0–4.1.1 system artifact. Decisions the owner made
after the handoff are marked **Owner** and win. Items the handoff marks
_Proposed_ are not agreed: build them behind the smallest surface and list your
assumptions. Where a handoff reference board and this file disagree on
geometry, the handoff said the board wins; the owner's later decisions still
win over both.

## 1. Logo

The mark is the **Crest**: one line (the net) and three crests growing from it
(a ball crossing). One fill colour, no outlines, shadows or gradients.

**Crest 1.1 A**, viewBox `16 13 59 74`:

```svg
<rect x="16" y="13" width="10" height="74"/>
<path d="M48.96 13A42 40 0 0 1 48.96 87L44.78 87A31 40 0 0 0 44.78 13Z"/>  <!-- outer -->
<path d="M42.12 13A24 40 0 0 1 42.12 87L38.7 87A15 40 0 0 0 38.7 13Z"/>    <!-- middle -->
<path d="M36.04 13A8 40 0 0 1 36.04 87L33 87L33 13Z"/>                     <!-- inner -->
```

**Micro mark**: the same rect and one solid crest
`M48.96 13A42 40 0 0 1 48.96 87L33 87L33 13Z`. Use it under 20 px, for the
favicon and in-button loaders.

**For animation**, put the crests in `<g transform="translate(33 0)">` and use
paths that start at x = 0 so `scaleX` grows from the line:

| Crest  | Path                                                            |
| ------ | --------------------------------------------------------------- |
| Outer  | `M15.96 13A42 40 0 0 1 15.96 87L11.78 87A31 40 0 0 0 11.78 13Z` |
| Middle | `M9.12 13A24 40 0 0 1 9.12 87L5.7 87A15 40 0 0 0 5.7 13Z`       |
| Inner  | `M3.04 13A8 40 0 0 1 3.04 87L0 87L0 13Z`                        |
| Micro  | `M15.96 13A42 40 0 0 1 15.96 87L0 87L0 13Z`                     |

**Wordmark**, viewBox `0 0 306 100`, stroke 9, no fill, square ends. It is
drawn, never set in a font:

```svg
<circle cx="30" cy="70" r="25.5"/><path d="M55.5 0V100"/>
<path d="M86.5 40V70A25.5 25.5 0 0 0 137.5 70M137.5 40V100"/>
<path d="M168.5 40V100M168.5 70A25.5 25.5 0 0 1 219.5 70V100"/>
<circle cx="276" cy="70" r="25.5"/><path d="M301.5 40V100"/>
```

| Lockup     | Rule                                                                                               | File                         |
| ---------- | -------------------------------------------------------------------------------------------------- | ---------------------------- |
| Horizontal | Mark and wordmark the same height; gap 0.36 of that height                                         | `duna-logo-horizontal-*.svg` |
| Stacked    | Wordmark exactly as wide as the mark (height = mark height × 59/74 ÷ 3.06); gap 0.17 × mark height | `duna-logo-stacked-*.svg`    |
| App icon   | Dune mark on Night Court, mark at half the icon height, centred                                    | `duna-app-icon.svg`          |

| Ground                           | Mark        | Wordmark    |
| -------------------------------- | ----------- | ----------- |
| Salt or white                    | Night Court | Night Court |
| Night Court or a dark photograph | Dune        | Salt        |
| Dune                             | Night Court | Night Court |

**Clear space** is three line-widths on every side (each line-width is 10/59
of the mark's width). Never stretch, outline, recolour outside the table, add a
shadow, tilt, or set the wordmark wider than the mark. The "mesh line" version
of the mark is rejected. Duna on a tile (message avatar, `TypeMark`) is Salt on
Night Court in both themes (Tideline 4.1.1).

**Naming.** The codebase already has `Crest` for club crests, so the logo
components are `DunaMark` (mark, micro) and `DunaLogo` (horizontal, stacked,
wordmark, icon). **Owner**: a brand mark is never above 24 px inside a control.

**Assets.** The final SVGs are in [`assets/`](assets/): `duna-mark-{ink,dune,salt}`,
`duna-micro-{ink,dune,salt}`, `duna-wordmark-{ink,salt}`,
`duna-logo-horizontal-{ink,on-dark}`, `duna-logo-stacked-{ink,on-dark}`,
`duna-app-icon`, and the light marks `light-{first-light,full-sun,golden-hour,under-lights}`.
Trademark clearance is not done; do not ship public brand assets on that
assumption.

## 2. Colour

| Name        | Hex       | Role                                                              |
| ----------- | --------- | ----------------------------------------------------------------- |
| Night Court | `#0E1A22` | Ink, primary actions, dark ground                                 |
| Salt        | `#F4F2EC` | Ground on player surfaces, text on dark                           |
| Dune        | `#D9C3A0` | The warm signal; the mark on dark                                 |
| Hardwood    | `#B5814F` | Golden hour (indoor accent use is open; default: one warm signal) |
| Solar       | `#F2542D` | Live, and nothing else (**Owner**; goal-tick exception is open)   |

Token names are Tideline's and do not change; values are in
[`tokens.json`](tokens.json). Light: `action` and `text` Night Court,
`action-hover` `#1B2A35`, `ground` Salt on player surfaces, `surface` white
(cards stay white), `surface-sunken` `#ECE8DF`, `line` / `line-strong`
`#E2DED3` / `#CFC9BA`, `live` / `live-ink` / `live-wash` `#F2542D` / `#B83A17`
/ `#FCE5DC`, `sun` and `energy` Dune with ink `#6E5A3E` and wash `#F3ECDF`.
Dark and live: grounds `#0E1A22` / `#17262F` / `#1C2D38` / `#0A141A`, lines
`#2A3B46` / `#3A4C58`, text `#F4F2EC` / `#C9D3D8` / `#9FB0B8`, action Dune.
Board greys `#3F4B52` (body) and `#55626A` (labels) are `text-2` and `text-3`.
Links, focus, info, positive, warning and danger are unchanged (blue focus).

**Owner**: orange is retired. **Owner**: HQ's ground is white / cool neutral,
never Salt, Dune or any sand tone; HQ's sidebar is white with a hairline.
Solar on white is about 3.4:1: it is a graphic colour, never text on light;
live text uses `live-ink`.

## 3. Type

- One brand family: **Jost**, weight 500, tracking −0.015em, for marketing
  headlines and one title per screen. Never below 22 px. **Owner**: never on
  numerals; club monograms are set in Jost.
- Everything else is **Geist**. Numbers, times, scores and ratings are Geist
  600 with tabular figures, never Jost. Tideline 4.1.1 sets NetScore numerals in
  Geist Mono tabular.
- Codes and small uppercase labels are **Geist Mono**.
- **Owner**: no serif anywhere. The handoff boards use DM Sans and DM Mono as
  stand-ins for Geist and Geist Mono; ship Geist.

## 4. Rating ring

Replaces the single-arc ring wherever the Sand Rating is shown. Everything sits
inside the inner band at every size. Geometry on a 220-unit square scaled to
`size`:

| Layer            | Spec                                                                                                                        |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Track            | Circle r 96, stroke 10, `surface-sunken`                                                                                    |
| Progress arc     | Same circle, `action` (Dune in dark), starts at 12 o'clock, length = `progress`                                             |
| Reliability band | Circle r 84, stroke 3, three equal segments with an 8-unit gap; Dune filled, track empty                                    |
| Goal tick        | Line y 2 → 20 at 12 o'clock, stroke 2.5, `live` (Solar): the named exception (open)                                         |
| Label            | "Sand Rating", Geist Mono uppercase, 0.042 × size, min 9 px (12 px repo floor applies to text: hide the label below 240 px) |
| Number           | Geist 600 tabular, 0.235 × size, two decimals                                                                               |
| Change chip      | 0.055 × size, min 10 px (repo floor 12 px); positive wash up, danger wash down                                              |

| Size     | Shows                                           |
| -------- | ----------------------------------------------- |
| ≥ 240 px | Label, number, chip, both rings, tick           |
| 120–239  | Number (0.25 × size), chip, both rings, tick    |
| 60–119   | Number (0.3 × size) and arc only, arc stroke 14 |
| < 60     | Arc only; the number sits beside the ring       |

| State (_Proposed_) | Arc                                    | Band        | Chip                                                               |
| ------------------ | -------------------------------------- | ----------- | ------------------------------------------------------------------ |
| Up                 | Grows to the new value                 | Reliability | ▲ +0.08, green                                                     |
| Down               | Retreats; never red                    | Reliability | ▼ −0.04, red                                                       |
| Provisional        | Dotted, 45% opacity                    | One segment | "3 more matches", neutral; number is an em dash                    |
| Half point reached | Full, meets the tick once, then resets | Reliability | "Reached 3.50" on `sun-wash` (R2 default; handoff said Solar wash) |

Props: `value` (string or null), `delta`, `progress` (0–1 through the current
half point), `reliability` (1–3), `size`, `theme`; old props keep working for
one release. Motion: the arc Rises from zero over 900 ms on `ease-rise`, the
number counts up with it, the chip lands 120 ms after the arc stops, band
segments arrive in sequence. Tideline 4.1.1: the ring starts at its value and
counts up only when frames arrive, so static renders never show 0.00.

## 5. Motion

Three verbs taken from the mark; canonical keyframes are in the handoff's
`motion/duna-motion.css` (port them into the codebase's own animation approach).

| Verb  | Meaning                         | How                                                                              |
| ----- | ------------------------------- | -------------------------------------------------------------------------------- |
| Rise  | Something grows out of a line   | Scale or draw from the edge nearest the line; 600 ms; `cubic-bezier(.2,.8,.2,1)` |
| Rally | Things arrive one after another | The same move per item, 120 ms apart                                             |
| Cross | Something travels over a line   | Translate across, 320 ms                                                         |

Nothing bounces or springs. Reduced motion shows the end state with at most a
200 ms fade. Entrances play once; only loaders and the live indicator loop.

| Existing component          | Change                                                         |
| --------------------------- | -------------------------------------------------------------- |
| `RatingRing`                | Rises from zero each time a rating is shown after a match      |
| `FormDots`                  | Rally oldest first, or replace with `FormCrests`               |
| `TidelineDivider`           | Draws left to right the first time its section enters view     |
| `Spots`, capacity, progress | Rise from the left                                             |
| `Sunrise`, page loader      | The Crest turned a quarter, crests rising over the line        |
| `Button` loading            | Micro mark with the crest swelling; Dune on the primary button |
| `LivePulse`                 | Solar Crest swelling from its line (`LiveCrest`)               |
| Spinner                     | The same swelling Crest at 16 and 24 px                        |
| Skeleton                    | Shimmer kept; Salt glint on `surface-sunken`, 1.6 s            |
| Lists and card rows         | Rally on first load only, never on scroll                      |

## 6. First open and loaders

**First open** (cold start only; a warm start returns to where the person was):

| Time  | What happens                                                                                                                    |
| ----- | ------------------------------------------------------------------------------------------------------------------------------- |
| 0.0 s | Night Court screen. No spinner, no white flash                                                                                  |
| 0.3 s | The line stands up from its centre, 450 ms                                                                                      |
| 0.7 s | Crests rise inner to outer, 600 ms each, 120 ms apart                                                                           |
| 1.4 s | The wordmark draws on beneath, exactly as wide as the mark, about 1.1 s                                                         |
| 3.5 s | The launch layer turns from its left edge like a page (rotateY to −108°, 1.4 s, perspective 1500 px), revealing Home underneath |

Home loads underneath. If Home is late, hold on the finished mark; if early,
the flip may start once the crests have landed (minimum about 1.5 s). Reduced
motion: the finished lockup, then a 200 ms cross-fade. No sand effect and no
video (this replaces the 10-second launch film).

| Loader          | Use                           | What it is                                                         |
| --------------- | ----------------------------- | ------------------------------------------------------------------ |
| Rally (default) | Any fetching screen           | Three crests swell from the line in turn; 1.4 s loop, 150 ms apart |
| Crossing        | Searching and matching        | A ball arcs over the net line                                      |
| Set by set      | Known steps                   | One crest fills per completed step                                 |
| Pull to refresh | Lists                         | The line follows the finger; crests pop on release                 |
| Tide sweep      | Background refresh at the top | A glint along a hairline                                           |
| Sand shimmer    | First load of lists and cards | Skeleton with a Salt glint                                         |
| In the button   | A pressed primary button      | Keeps width and colour; a micro Rally replaces the spinner         |
| Serve           | Sign-in, long sync            | Full screen; the wordmark draws on                                 |

Loaders grow from the line; they never fade in place of growing.

## 7. The Duna window

A photograph shown through the shape of the mark; it drifts a few percent over
12–14 s (still under reduced motion). Grounds: Night Court, Salt or Dune only.
Never type or a second logo inside it. Clubs, venues and events use the micro
window at small sizes (`WindowAvatar`); **people stay in circles**, so a place
never looks like a person. **Owner**: this is not a decorative illustration;
no other ornament is allowed.

## 8. Proposed components

All _Proposed_; each needs light, dark and reduced-motion states and 44 pt
targets. Full list with props and canvases: [`components.md`](components.md).

- **First set**: `NetScore`, `SurfaceSwitch` (Indoor / Beach only),
  `CrestSteps` (≤3 steps; eyebrow opt-in in 4.1.1), `FormCrests`,
  `WindowAvatar`, `LiveCrest`, `FirstLight`, `Crossing` (props `source` /
  `target`, not `from` / `to`).
- **Time and day** (take the venue's sunrise and sunset; sample Santa Monica,
  28 Nov: sunrise 6:38 AM, golden hour 3:45 PM, sunset 4:45 PM): `DayStrip`
  (no underline, 4.0.1 owner request; `aria-current="date"`), `TimeRail`
  (keyboard operable, `TimeSlots` is the non-drag alternative), `TimeSlots`
  (never clip; full slots disabled, not hidden), `DurationCrests` (compact
  row by default), `Dayparts`.
- **Light and weather** (need data the app may not have: build against a typed
  stub; indoor venues show none): `SunArc` (reconcile with `Sunrise`),
  `Conditions` (play-call thresholds not agreed: Good to play 3, Playable 2,
  Tough 1, Off 0), `WindOnCourt` (needs court orientation; prop `windFrom`),
  `LightMark` (always with a text label), `ConditionsLine` (stop uses
  `danger`, never Solar, and is announced). Small weather icons follow the icon
  set: 24 grid, 1.75 stroke, square ends, no fill.
- **Tideline 4.1.1**: `NetScore` redesign (see contract R16), `HQShell`,
  `HQSidebar`, `AskDunaButton`, `ObjectHeader`, `SubNav`, `SectionNav`, the
  search set (`SearchBar`, `WherePicker`, `WhenPicker`, `WhatPicker`,
  `SearchSheet`, `ResultChips`), map pins and `MapControls`.

## 9. Owner decisions after the handoff

| #   | Decision                                                                                                                                                                                                                                                  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Tideline stays the product system. Orange retired. Solar for live only. HQ white / cool neutral, white sidebar with hairline                                                                                                                              |
| 2   | Jost Medium 500: marketing headlines and one title per screen, ≥22 px, never numerals. Geist and Geist Mono for everything else. No serif. Club monograms in Jost                                                                                         |
| 3   | Logo components are `DunaMark` / `DunaLogo`                                                                                                                                                                                                               |
| 4   | Icons: 24 grid, 1.75 stroke, square ends; 14 / 16 / 20 / 24 px; brand mark ≤24 px in a control; chips contain their content                                                                                                                               |
| 5   | Motion verbs Rise, Rally, Cross; nothing bounces                                                                                                                                                                                                          |
| 6   | No decorative illustration marks; no left-edge colour stripes as status                                                                                                                                                                                   |
| 7   | Club identity: own logo on its chosen colour, uploaded full-bleed tile, or two-character monogram; no white border; pending never desaturates                                                                                                             |
| 8   | Maps: street to zoom 16, satellite for the last three; single icon look button; zoom-ladder pins; inverted = yours; Solar only live; attribution visible                                                                                                  |
| 9   | Navigation: Player Find / Play / Improve / Connect; Pro coach tabs; HQ per `ia-hq.md`, no "More tools"                                                                                                                                                    |
| 10  | Score cards: hairline net, per-set, green check (trophy for a title), one state per `match_status`                                                                                                                                                        |
| 11  | Copy never names infrastructure vendors ("Duna Hosting", "Duna Database"); Stripe only in Duna Pay verification                                                                                                                                           |
| 12  | Honesty: no invented customers, claims, prices or policies; a person confirms every send, payment and publish. 2026-11-27: features ship switched on (flags are kill switches) with honest "not configured yet" states until production credentials exist |
| 13  | Apple Watch interaction unchanged; restyle only                                                                                                                                                                                                           |
| 14  | Mobile: latest stable Expo, minimum iOS 26, width classes, Duo and iPad layouts; system tab bar in native apps                                                                                                                                            |
| 15  | Sign-in, sign-up, organisation switcher (with "Create new organisation") and account stay in every shell                                                                                                                                                  |

The handoff said "do not touch Duna HQ screens"; the owner has since put HQ in
scope with the white ground above.

## 10. Voice

Primary tagline: **Meet you at the net.** Supporting lines: "Find. Play.
Improve. Connect." · "Every court. Every coast." · "There's a game near you." ·
"Better by the next rally." · "The sand remembers." Sentence case, plain
words, name the thing ("Book a court", not "Reserve your experience"). One
tagline per surface where a tagline belongs (launch, website hero, empty
states that invite play, Concierge welcome sign-off). Numbers are facts:
"3.42, up 0.08". "Sand Rating" is always two words.
