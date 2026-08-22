# Duna Design System v3 — Ground Inversion, Club Color, and Player Identity

**Supersedes:** the zoning rule in v2 §1. Everything else in `duna-design-system.md`, `duna-theming-light-dark.md`, and `duna-mobile-design-guide.md` still stands.
**Trigger:** the NBA reference and the live /pro page. You were right, and the correction is structural.

---

# PART 1 — THE GROUND INVERSION

## 1.1 What I got wrong

v2 said: **performance zone = dark.** So live scores, match pages, /pro, rankings, and the operator console all went dark.

The NBA player page is the counter-example that breaks it. It is a **light gray page** and it is unmistakably a sports product. Its energy comes from four things, none of which is darkness:

1. **Oversized type used as graphic** — the ghosted team wordmark
2. **A photographic cutout that breaks the layout plane**
3. **Huge condensed numerals** in blocked fills
4. **A single saturated team color** used sparingly and precisely

Meanwhile the live /pro page went dark and the result is a near-black stadium plate where `105 TRACKED EVENTS` is illegible at ~10% opacity and the headline collides with itself. Dark bought atmosphere and cost energy.

## 1.2 The revision

**Old rule:** editorial = light, performance = dark.
**New rule:** **live = dark. Everything else = light.**

| Surface                            | v2        | **v3**                                 |
| ---------------------------------- | --------- | -------------------------------------- |
| Homepage, run-your-club, about     | Light     | **Light**                              |
| Player profile                     | Dark      | **Light**                              |
| Event page                         | Light     | **Light**                              |
| /pro browsing, rankings, directory | Dark hero | **Light**                              |
| Match page, pre/post               | Dark      | **Light**                              |
| **Match page, in progress**        | Dark      | **Dark**                               |
| **Live scoring (app)**             | Dark      | **Dark**                               |
| **Courtside mode (Pro app)**       | Dark      | **Dark**                               |
| Duna HQ console                    | Dark      | **Light**, with dark stat blocks       |
| Footer                             | Dark      | **Dark** — it's a terminus, not a zone |

Dark now means one thing only: **a ball is in the air right now.** That makes it rare, which makes it loud. Roughly 5% of surfaces instead of 40%.

## 1.3 Where the energy comes from instead

Replace darkness with these five devices. Every athletic surface should use at least three.

1. **Ghost type at scale.** The surname, the event name, the tour mark — Archivo Expanded 900 at 6–8% opacity, 180–290px. Free energy, zero color cost.
2. **Blocked numerals.** Stat cards in solid ink or club color with `wdth 96 / wght 800` figures at 44px+. This is what reads as "sport."
3. **Plane breaks.** One element must cross another: the rank mark over the athlete, the athlete's foot behind the stat row, a card overlapping a section edge.
4. **One saturated accent per screen.** Club color, tour color, or Duna gold. Never two.
5. **Density contrast.** Airy hero, then a tight data block. The compression is the drama.

Light ground plus these five is the NBA formula. It is also, not coincidentally, closer to the baba reference you started from — which is high-key, luminous, and light.

## 1.4 The two-family system, settled

Duna uses Fellix for every word and Archivo for meaningful numerals. The
previous display-serif layer is retired across every surface.

- **Editorial surfaces** (homepage, run-your-club, about, Sand Rating explainer): Fellix 700 display with airy composition and the shared tracking curve.
- **Athletic surfaces** (player, match, event, /pro, rankings): Fellix 800 names and primary display, Fellix 700 supporting headlines, and Archivo for meaningful numbers.

And universally: `letter-spacing: -0.018em` max, `word-spacing: 0.04em`, `font-synthesis-weight: none`. The collisions — _Theworld'sgame_, _BPTElite16Hamburg_, _Runthebusiness_ — are all one bad value.

---

# PART 2 — SITE-WIDE AUDIT

## 2.1 Homepage

The homepage now uses a high-key, scroll-driven **Sand World** instead of the
old dusk plate and numbered audience cards. A single persistent procedural
terrain moves through four full-viewport chapters: the connected-game promise,
Play, Compete, and Operate. Copy and calls to action remain ordinary semantic
content above the canvas; WebGL is atmosphere, never the information layer.

The ground is near-white in light mode. Once the Sand World ends, the page
returns to crisp `--surface-1` editorial sections for current play, Sand Rating,
the professional tour, and HQ. The Apple Watch chapter is the sole dark live
zone. The old `01/02/03` markers, duplicated Sand Rating node, beige card hero,
live strand, and decorative marine block are retired.

Canonical fallbacks: pause offscreen, cap rendering at 30fps, clamp internal
resolution, freeze on `prefers-reduced-motion`, freeze when data saving is on,
freeze low-resolution software WebGL, and preserve the composed CSS sand ground
if WebGL cannot initialize. The atmosphere never captures pointer input.

## 2.2 /pro — went dark, and it cost the page

| Finding                                                                                            | Fix                                                                                                          |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Hero plate is near-black night stadium. Detail invisible, mood funereal.                           | **Invert to light.** Blue-hour-to-dawn plate, pale sky, empty stands, floodlights just off. Headline in ink. |
| `105 TRACKED EVENTS` ghosted at ~10% on black — unreadable                                         | Promote to a real stat block: Archivo Expanded, ink card, `105 / TRACKED EVENTS`                             |
| Headline collides: _Theworld'sgame,_                                                               | Tracking fix per §1.4                                                                                        |
| `AVP League— connected`                                                                            | Malformed em dash. Use a period.                                                                             |
| `2 LIVE NOW` flare pill                                                                            | ✅ Correct. Keep.                                                                                            |
| Date rail, event card anatomy, `0/0`, flat priors, flag emoji, `Tues`, oversized live-report cards | All unresolved from v2 audit. See that doc.                                                                  |
| Player directory lists both partners at the same rank                                              | Group by **team**; one card, two player links, rank once                                                     |

## 2.3 /run-your-club — light, and it invented a color

| Finding                                                                          | Fix                                                               |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Headline set enormous in a narrow column → 4 stacked lines, one word each        | Cap at `clamp(40px, 5.4vw, 76px)`, widen the column to ~14ch      |
| Eyebrow sits in a **pale green pill**; the HQ mock uses **mint/teal** throughout | Green is not in the palette. **Formalize it properly** — see §2.7 |
| Twelve flat feature sections                                                     | Collapse to four chapters (v2 §12) — still open                   |
| No photography anywhere                                                          | Add `club-hero-*`: empty courts before the day starts             |
| No pricing, no operator proof                                                    | Add both                                                          |
| Duna AI card treatment                                                           | ✅ Strong. Keep the pattern, restate in the formalized HQ color.  |

## 2.4 /events/[event] — the best-implemented page on the site

| Finding                                                              | Status                                                             |
| -------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **Official FIVB artwork contained in a card**, not full-bleed        | ✅ **This landed.** Exactly right.                                 |
| Breadcrumb `← Pro events`                                            | ✅ Landed                                                          |
| `Pool A 0/2` instead of `0/0`                                        | ✅ Improved                                                        |
| Light fog ground                                                     | ✅ Correct                                                         |
| Title collides: _BPTElite16Hamburg_                                  | Tracking fix                                                       |
| **Four chips**, one repeating the page title (`BPT ELITE16 HAMBURG`) | Max three. Drop the redundant one. Order: `[LIVE] [Elite16] [Men]` |
| `See women's division` CTA is **navy `#0B2440`**                     | Legacy navy on a primary control. Use `--ink`.                     |
| No Duna venue plate — official artwork is the only image             | Generate `event-venue-hamburg`. Artwork stays contained beside it. |
| Teams still four tables (12/16/23/45)                                | One table, four filter chips                                       |
| `Medals provisional` with podium emoji pre-event                     | Suppress until a match is final                                    |

## 2.5 /match/[id]

Unchanged from v2 audit, **with one revision**: pre-match and post-match are now **light**. Only in-progress goes dark. The transition when a match starts is the payoff.

## 2.6 /players/[slug]

Covered last turn. Core moves: light ground, name in Fellix 800, world rank as the jersey-number graphic, ghost surname pushed to 280px, one unified stat-block system, cutout layering per `duna-player-image-layering.html`. Also fix `city-not-listed` in slugs.

## 2.7 Duna HQ has invented a color — formalize it, don't delete it

run-your-club uses a mint/teal that appears nowhere in the system. The instinct is sound: **the operator product deserves its own accent.** Adding a foreign hue does not.

Derive it from `--signal` (`#C9E265`), which already means _available, active, go_ — semantically correct for operator tooling.

```
--hq-tint:  #E8F2D4    /* washes, session blocks, eyebrow pills */
--hq-core:  #A9C463    /* buttons in HQ context, active states */
--hq-ink:   #3F5417    /* text on tint, AA-safe */
--hq-deep:  #1E2A0E    /* the Duna AI card ground */
```

Rule: `--hq-*` appears **only inside Duna HQ surfaces and the run-your-club page**. Never on player, match, event, or /pro. It is the operator product's signature, not a Duna brand color.

---

# PART 3 — THE CLUB COLOR SYSTEM

This is the Theme Kit answer, and it is the same problem as tour co-branding at 100× the volume.

## 3.1 Principles

1. **A club supplies one color, not a palette.** Asking for a palette guarantees a bad one.
2. **Duna normalizes it before it is ever rendered.** No club color reaches the screen raw.
3. **Club color is decorative, never functional.** It never carries meaning that Duna's own tokens carry.
4. **Budget: two slots per screen, ≤8% of pixels.**
5. **Competition surfaces are always neutral.** When two clubs meet, neither color wins.

## 3.2 Normalization — the technical core

Convert the submitted hex to OKLCH, keep the hue, clamp lightness and chroma into Duna's tonal band, and derive four tones. This preserves brand identity while guaranteeing the result sits inside our system.

```css
/* stored per club: hue + clamped chroma */
--club-h: 212; /* from brand color */
--club-c: clamp(0.04, var(--club-c-raw), 0.15); /* neon impossible */

--club-tint: oklch(0.95 calc(var(--club-c) * 0.28) var(--club-h));
--club-edge: oklch(0.85 calc(var(--club-c) * 0.5) var(--club-h));
--club-core: oklch(0.55 var(--club-c) var(--club-h));
--club-ink: oklch(0.4 calc(var(--club-c) * 0.85) var(--club-h));
```

Guaranteed outcomes: white on `--club-core` ≈ 4.6:1. `--club-ink` on `--club-tint` ≈ 7:1. `--club-tint` is always light enough to carry ink body copy. **Chroma clamped at 0.15 means no club can ship neon.** A club submitting `#FF0000` gets a controlled brick red; `#00FF00` gets a muted moss.

Show the club its normalized swatches in Theme Kit with the honest line: _"Duna tunes your color so it stays readable across the product. Your hue is preserved."_

## 3.3 The five permitted slots

Club color may appear **only** here:

| Slot                | Token                         | Notes                                                                                      |
| ------------------- | ----------------------------- | ------------------------------------------------------------------------------------------ |
| **Edge bar**        | `--club-core`                 | 4–6px rule on the leading edge of a club-owned surface. The NBA reference's navy left bar. |
| **Numeral mark**    | `--club-core`                 | The oversized rank or jersey-style graphic                                                 |
| **Stat block fill** | `--club-core`                 | Replaces `--ink` on stat cards, on club surfaces only                                      |
| **Identity chip**   | `--club-ink` on `--club-tint` | Club badge lockup, roster chips                                                            |
| **Section wash**    | `--club-tint`                 | One section background, ≤8% of the page                                                    |

**Never:** CTA buttons, links, nav, focus rings, form controls, status pills, the live indicator, the available indicator, Duna gold, chart lines, or error states. Those meanings belong to Duna and must read identically at every club.

## 3.4 Competition neutrality

**On any match, live, bracket, or head-to-head surface, no club color fills anything.** Each team may carry a **2px edge indicator** on their own row — that is the entire allowance.

Reason: whose color wins when two clubs meet? Neither. This is how broadcast scoreboards work, and getting it wrong makes the product look partisan. It also protects you from a club complaining their color read as "the losing side."

## 3.5 Propagation to players

The tightest rule in this section, because it protects the athlete.

| Context                                   | What the player page inherits                                                                             |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Player's own profile**                  | `--club-tint` wash and `--club-edge` hairline only. Rank mark and stat blocks stay **Duna gold and ink.** |
| **Club roster page** (club's own context) | Full: `--club-core` on stat blocks, edge bar, numeral mark                                                |
| **Player affiliated with 2+ clubs**       | **No club color at all.** Affiliations render as neutral chips. Ambiguity resolves to neutral.            |
| **Match surfaces**                        | 2px edge indicator only                                                                                   |

**The principle:** a player's identity is theirs; the club is context. Invert it and every athlete looks like a billboard. On their own page, the loudest color should be the one attached to their achievement — Duna gold on the world rank — not their employer's brand.

## 3.6 Governance

- Clubs submit through Theme Kit and see a **live preview across five real surfaces** before publishing.
- Duna reserves the right to reject a color that resolves within ΔE 6 of `--flare` — a club cannot own the live color.
- A club changing its color triggers a regeneration of cached OG images.
- Store `--club-h` and `--club-c` on the club record, never the derived tones. Derive at render so a system-wide retune propagates everywhere.

---

# PART 4 — PLAYER SELF-MODERATION

## 4.1 The line

**Players control identity. Players never control data.**

Everything expressive is theirs. Everything evidential is Duna's. That single line is what makes the Sand Rating credible, and it is worth defending against every feature request.

| Player controls                 | Duna controls, always                  |
| ------------------------------- | -------------------------------------- |
| Cutout photo or silhouette pose | Sand Rating and its history            |
| Accent color from a curated set | Verified record, W/L, scores           |
| Display name and pronunciation  | Match results and verification state   |
| Bio, home beach, socials        | World rank and tour points             |
| Sponsor lockups                 | Page layout, typography, section order |
| Pinned career highlights        | Partner history and head-to-head       |

## 4.2 Verification tiers

| Tier                | Unlocks                                                                                                                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Unclaimed**       | Nothing. Initials or assigned silhouette. Duna gold rank mark. A visible `Claim this profile` prompt — but move it out of the top-left; negative framing should not be the first thing a visitor reads. |
| **Claimed**         | Photo upload, bio, home beach, socials, silhouette pose selection                                                                                                                                       |
| **Verified pro**    | + accent color from the curated set, sponsor lockup, up to 3 pinned highlights, custom cutout                                                                                                           |
| **Club-affiliated** | + `--club-tint` wash and `--club-edge` hairline                                                                                                                                                         |

## 4.3 The curated accent set — not a color picker

Give verified pros **10 swatches**, not a hex field. Each is a pre-normalized `--player-h` / `--player-c` pair drawn from Duna's hue wheel at controlled chroma. They occupy exactly one slot: **the rank mark**. Nothing else.

Suggested set: dune gold (default), marine, deep coral, moss, terracotta, slate blue, ochre, plum, sea green, ink.

`--flare` is excluded — no player owns the live color.

This is how you get personality without entropy. Ten good options beat sixteen million bad ones, and every profile stays recognizably Duna.

## 4.4 Sponsors on player profiles

Verified pros will want sponsor logos, and that revenue matters to them. Apply the co-branding tiers exactly as with tour partners: **monochrome `--ink-soft` at 55% at rest, full color on hover**, inside a fixed lockup below the stat row, capped at four, with a `PARTNERS` eyebrow. Never in the hero. Never colored at rest.

## 4.5 Moderation floor

Photos, bios, and sponsor marks are user content on a public profile. Before shipping self-service: an upload review queue, an automated check for the crop anchor so the rank mark never lands on a face, a reporting path, and a written policy on what gets removed. Ship the queue with the feature, not after it.

---

# PART 5 — FIX ORDER

1. **Tracking and weight** — apply the shared tracking curve, Fellix 700–800 for display, and `font-synthesis-weight: none`. One commit, fixes every page.
2. **Add the light token column** and correct the `light-dark()` resolution.
3. **Invert /pro and the player page to light.** Regenerate the /pro plate high-key.
4. **Purge `#0B2440` and `#3D81B9`**, including the `See women's division` CTA.
5. **Remove the display-serif layer**; use Fellix for every word on every surface.
6. **Formalize `--hq-*`** from the signal hue; retire the invented mint.
7. **Ship `--club-h` / `--club-c` normalization** and the five-slot budget. Theme Kit preview before publish.
8. Homepage blockers: role chips, live strand, marine block.
9. Player verification tiers and the curated accent set.
10. /pro date rail, card anatomy, empty states.

Steps 1 through 3 are most of the perceived quality gap.

---

# PART 6 — AESTHETIC DIRECTION

## 6.1 The target, in one line

**Broadcast-grade sports editorial, lit like a beach at six in the evening.**

Triangulate from three points and reject a fourth:

- **baba** gives the light — high-key, luminous, atmospheric, fog dissolve.
- **NBA** gives the structure — scale, confidence, oversized graphics, blocked numerals.
- **Print sports annuals and broadsheet sport sections** give the discipline — left-aligned, edge-to-edge, unafraid of a big picture.
- **Not** SaaS dashboards, wellness apps, or generic tournament sites.

## 6.2 The failure mode we keep hitting

**The pages look like software.** Diagnostic symptoms, all currently present:

- Every element lives inside a rounded box
- Nothing touches a viewport edge
- No two elements overlap
- Spacing is uniform everywhere, so nothing is emphasized
- The type scale jumps from ~130px straight to ~16px with nothing between
- Hierarchy is even, so the eye has no entry point

## 6.3 The four moves that fix it

**1 — Scale with a middle register.**
Currently the homepage runs h1 at 134px and then drops to 16px body. That is not hierarchy, it is a cliff. Build five steps and use all five on every page:

| Step    | Size     | Role                                  |
| ------- | -------- | ------------------------------------- |
| Display | 76–104px | One per page. The name, the headline. |
| Feature | 40–56px  | Section headlines, the hero number    |
| Sub     | 24–32px  | Card titles, secondary stats          |
| Body    | 15–17px  | Prose                                 |
| Micro   | 10–12px  | Eyebrows, labels, captions            |

**2 — Bleed.** Part 7.

**3 — Overlap.** At least one plane break per page — one element crossing a boundary another element defines. Without this, a page is a stack of trays.

**4 — Restraint.** One accent color, one dominant element, one moment of motion per screen. If two things compete, neither wins.

---

# PART 7 — THE EDGE DOCTRINE

## 7.1 The problem

Almost everything on Duna today is a rounded rectangle floating in a margin: the player hero is an inset dark card, the HQ mock is a framed panel, imagery sits in bordered boxes, and section after section is a stack of 24px-radius trays. Nothing reaches an edge.

That is why it reads as an application rather than a publication.

## 7.2 The principle

**Edges are for identity. Containers are for data.**

Full bleed carries atmosphere, imagery, and identity — the emotional layer. Containment carries tables, comparisons, and discrete units — the evidential layer. Duna currently has this exactly backwards: heroes are contained, and the page ground is undifferentiated.

## 7.3 The five rules

1. **A hero is never a card.** No exceptions, on any page.
2. **Imagery bleeds on at least one edge.** A photo with margin on all four sides is a thumbnail.
3. **Sections bleed; content is measured.** The background runs edge to edge; the content inside sits on the grid. That distinction is what separates a _section_ from a _card_.
4. **Cards are earned.** A card asserts "this is one of several comparable units." If there is only one of a thing, it is not a card.
5. **Radius scales inversely with size.**

| Element width                  | Radius |
| ------------------------------ | ------ |
| ≤ 360px                        | 24px   |
| 360–720px                      | 20px   |
| 720–1100px                     | 12px   |
| > 1100px or full-bleed         | **0**  |
| Pills, chips, avatars, buttons | full   |

Large rounded rectangles read as software. Large square surfaces read as print and broadcast. This single rule changes the register of the whole product.

## 7.4 Four kinds of bleed

- **Full bleed** — 100vw, edge to edge. Heroes, section grounds, live scoreboards.
- **Single-edge bleed** — content runs off one edge only, usually right or bottom. Asymmetry reads editorial; symmetry reads corporate. Prefer this for imagery beside text.
- **Clipped bleed** — oversized graphics (ghost type, ring marks) run off _both_ edges and are clipped. The clipping is the point; it implies the graphic is bigger than the screen.
- **Overflow bleed** — an element crosses a boundary another element defines. The stat shelf straddling hero and body. The athlete's foot behind the stat row.

## 7.5 Per-page bleed assignments

| Page               | Must bleed                                                                         | Stays contained                                                           |
| ------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Homepage           | Procedural Sand World, section grounds, "Happening" imagery (right edge)           | Event rows, rating principles, operator metrics                           |
| Player profile     | Identity band, ghost surname (clipped both edges), athlete cutout (bottom + right) | Trajectory chart, match history, KPI tiles                                |
| /pro               | Hero plate, **date rail** (edge to edge with snap scroll)                          | Event cards, rankings table, directory cards                              |
| Event page         | Venue plate, section grounds                                                       | Official artwork (**a frame is respect**), teams table, standings, market |
| Match, in progress | Everything. Full dark, scoreboard edge to edge.                                    | Nothing.                                                                  |
| run-your-club      | Hero, each chapter ground, the HQ console (bleeds right, cropped)                  | Module grid, pricing                                                      |

## 7.6 What stays contained, permanently

Tables and standings · match lists · event cards · comparison stats · forms and inputs · **all partner assets**. The FIVB artwork being in a card is correct — the frame is what makes the co-branding respectful and legible. Don't "fix" it.

---

# PART 8 — TYPE, IN DETAIL

## 8.1 The six errors, precisely

Measured on the live site.

| #   | Error                 | Computed value                                                   | Correct                      | Effect                                                                   |
| --- | --------------------- | ---------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------ |
| 1   | **Synthetic bold**    | `font-weight: 860` on Instrument Serif, which ships **only 400** | `400`                        | Browser smears outlines. This is the entire "heavy fashion didone" look. |
| 2   | **Tracking collapse** | `letter-spacing: -10.08px` on 134px = **−0.075em**               | `−0.030em`                   | Word spaces vanish: _Playmore._ _BPTElite16Hamburg_                      |
| 3   | **Leading collapse**  | `line-height: 107.52px` on 134px = **0.80**                      | `1.02–1.08`                  | Descenders touch the next line's caps                                    |
| 4   | **Oversize**          | `font-size: 134.4px`                                             | cap at 104px                 | Compounds errors 2 and 3                                                 |
| 5   | **Role violation**    | Archivo (data font) on eyebrows at weight 700                    | Fellix 500                   | Breaks the three-role separation                                         |
| 6   | **Role violation**    | Instrument Serif at 27px on event card dates                     | Archivo `wdth 74 / wght 800` | Numbers must be tabular                                                  |

Errors 1–3 are one commit and account for most of the perceived quality gap.

```css
:root {
  font-synthesis-weight: none;
} /* fail loudly, never fake */
```

## 8.2 The tracking curve

Tracking is a function of size, not a constant. Apply per band, both families.

| Size          | Letter-spacing | Word-spacing |
| ------------- | -------------- | ------------ |
| 96px+         | −0.030em       | +0.05em      |
| 64–96         | −0.024em       | +0.04em      |
| 40–64         | −0.018em       | +0.03em      |
| 28–40         | −0.012em       | +0.02em      |
| 20–28         | −0.006em       | 0            |
| 15–20         | 0              | 0            |
| 12–15         | +0.005em       | 0            |
| Eyebrows (11) | **+0.14em**    | 0            |

**Word-spacing compensation is not optional.** Negative tracking shrinks word spaces along with letter spaces. Adding it back is what prevents collision at display sizes.

## 8.3 Weight discipline

| Family  | Available              | Use                                                                                                                   |
| ------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Fellix  | 100–900 variable       | 300 subtitles ≥20px · 400 body · 500 labels/eyebrows · 600 buttons · 700 editorial display · 800 athletic/app display |
| Archivo | 100–900, `wdth 62–125` | 700 tables/chips · 800 hero/block numerals · 900 scores/monuments                                                     |

## 8.4 Measure and leading

| Role             | Max measure | Line-height |
| ---------------- | ----------- | ----------- |
| Display          | **14ch**    | 1.02–1.08   |
| Feature headline | 20ch        | 1.10        |
| Lede             | 52ch        | 1.5         |
| Body             | 66ch        | 1.6         |
| Caption          | 44ch        | 1.45        |
| Data             | never wraps | 1.0         |

The run-your-club headline breaks to one word per line because a 76px display is set in a column narrower than 14ch. Widen the column, don't shrink the type.

## 8.5 The heading cluster

Fixed vertical rhythm everywhere:

```
eyebrow
  ↓ 14px
headline
  ↓ 20px
lede
  ↓ 32px
content
```

## 8.6 Alignment

- **Athletic surfaces: left-aligned, always.** Player, match, event, /pro, rankings. Centered type on a data page reads as a landing page.
- **Centering is permitted twice per site:** the homepage hero and the closing CTA. Nowhere else.
- **Numbers:** right-aligned in tables (so digits stack), left-aligned in cards.
- **Ghost type:** optically centered on the composition, not the container.

## 8.7 Interactive data tables

TanStack Table v9 is the standard headless engine for sortable, filterable,
searchable HQ tables. Duna owns the semantic HTML, responsive behavior, and
visual design; the library owns deterministic row models and table state.

- Register only the features and row models a table uses.
- Keep search and the most important filters visible above the table.
- Make useful headers sortable and show the current direction.
- Put tables inside a bounded horizontal scroller on narrow screens; do not
  remove evidence just to avoid overflow.
- Keep the first identifying column visible when horizontal scrolling is
  required, and provide an explicit link to the full record.
- Use server-side pagination and filtering once a result set can exceed the
  bounded response for the route. Never fetch an unbounded ledger into the
  browser.

---

# PART 9 — PERFORMANCE PAGE ARCHITECTURE

One template. Player profiles, team pages, match pages, and event pages all use it.

## 9.1 The four zones

**Zone 1 — Identity band. Full bleed. No radius. No margin.**
Ghost type clipped at both edges · subject cutout bleeding bottom and right · the numeral mark · name in Fellix 800 · a four-item meta row · two actions. Light ground, warm gradient. Minimum height 72vh, maximum 660px.

**Zone 2 — The stat shelf. Straddles the Zone 1 / Zone 3 boundary.**
Three to five blocked numerals, `transform: translateY(30px)` so it overlaps. This is the page's mandatory plane break. One block is the hero stat and takes the accent — everything else is ink.

**Zone 3 — The evidence. Contained. This is where cards are legitimate.**
Trajectory chart, match history, head-to-head, KPI tiles. Measured, comparable, scannable. Radius 20px, white on fog.

**Zone 4 — Context. Contained, lower contrast.**
Partner, teammates, similar players, upcoming events. Visually quieter than Zone 3 so the page tapers rather than stopping.

## 9.2 The five tests

1. **One number is the hero.** Not five equal stats. On a player page it's the Sand Rating; give it the accent, the gradient, and the largest numeral. Five equal numbers is a dashboard.
2. **Evidence beats assertion.** Never state a rating without showing the matches that produced it. This is Duna's actual differentiator — the trajectory chart and "the story in the results" are the most valuable modules on the site.
3. **Recency is prominence.** The latest result outranks the career summary. What happened yesterday goes above what happened last season.
4. **Empty states are designed, never blank.** "Rating pending" gets a chip and a plain explanation, once per team — not six repetitions.
5. **Nothing is a dashboard.** If the page could be described as "cards showing metrics," it has failed. It should be describable as "a portrait of an athlete, with proof."

## 9.3 Player profile — the specific build

- Identity band **full bleed**, replacing the current inset dark card entirely.
- Ghost surname at `clamp(140px, 20vw, 290px)`, Archivo `wdth 124 / wght 900`, 6% opacity, **clipped at both edges**.
- Cutout per `duna-player-image-layering.html` — three states, one layout: licensed cutout, backlit silhouette (the scalable default), initials.
- World rank as the jersey-number graphic, `wdth 112 / wght 900`, sand-gold, **overlapping the athlete's trailing edge**.
- Name: `Elmer` at 0.40em weight 500 above `ANDERSSON` at full size weight 800. Two registers, one block.
- Stat shelf: Sand Rating in gold-on-dark, the other three in flat ink.
- Zone 3 keeps the trajectory chart and the AI narrative exactly as built — they are the best things on the page.
- Fix `city-not-listed` in slugs.
- Move `Unclaimed profile` out of the top-left. A negative state should not be the first thing a visitor reads.

---

# PART 10 — HQ WORKSPACE AND FIELD STANDARDS

Duna HQ is a desktop operating workspace. It is not a public landing page and
it is not a stack of centered cards. An operator should be able to scan the
state, change it confidently, and keep relevant context in view without
scrolling through decorative empty space.

## 10.1 Workspace geometry

- **Anchor work to the left.** HQ pages use the available desktop width from
  the navigation rail outward. Page content may cap at a broad `112rem`, but
  it never recenters itself into a narrow editorial column.
- **Constrain the reading task, not the whole page.** Narrative inputs and
  descriptions may have a readable measure. Supporting context, a schedule,
  a review panel, or a live preview uses the remaining column.
- **Use columns to preserve context.** On wide screens, the primary task,
  guidance, and a live summary can sit beside one another. At intermediate
  widths, move the summary below the task. Never keep a narrow center column
  just to preserve a desktop composition.
- **Headers describe a job.** One clear title, a short operational description,
  and actions grouped at the edge. Page titles and settings content are left
  aligned. Centering is reserved for deliberate public/editorial moments, not
  HQ configuration.

## 10.2 A field represents the decision, not the database shape

The control must match the mental model of the information being collected.
Raw storage notation is never an acceptable shortcut when Duna already has a
structured control.

| Decision                                           | Required HQ control                                                                                | Never use                                               |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| One date, a date range, or unavailable dates       | Duna calendar/range picker with a clear applied state                                              | A text field asking for YYYY-MM-DD                      |
| Time on a known day                                | Duna date-and-time picker in the schedule context                                                  | A line such as `2026-09-08 17:00`                       |
| Recurring sessions                                 | Start/end calendar window, weekday selection, time, timezone, and calendar blackout exceptions     | Comma-separated rules or a multiline recurrence string  |
| A collection of sessions, quotes, FAQs, or options | A vertical repeater with a named item header, one clear remove action, and fields in reading order | A single wide "spreadsheet" row or a blank tile grid    |
| A relationship or recommended offer                | Compact selectable rows with type, name, state, and any selection limit                            | Image-sized empty cards whose only action is a checkbox |
| A constrained choice                               | A labelled select, segmented control, or short choice set with a description                       | Free text that later needs parsing                      |
| Narrative copy                                     | A single clearly labelled text area with useful example copy and the content format stated         | A multiline area pretending to be a structured editor   |

For a repeating record, ask for the most meaningful field first: quote before
attribution, question before answer, session date and time before internal
metadata. A field set should read in the same order an operator would explain
it aloud.

## 10.3 Field anatomy and states

- Every input has a visible label. Supporting help explains the consequence or
  gives an example; it does not repeat the label.
- Form labels are at least 14px. Text entered into a control is at least 16px.
  Standard interactive controls are at least 48px high unless they are compact
  inline actions inside a clearly larger row.
- Requiredness, default values, timezone, capacity, and selection limits are
  visible at the moment the decision is made.
- Empty collections get an honest empty state and the exact action that starts
  them. Existing records keep their own edit and remove actions; nothing is
  hidden behind an unlabeled hover state.
- Destructive actions are explicit, local to the record they affect, and use a
  clear name. `Remove quote 2` is better than an anonymous icon.
- Keyboard focus, native input semantics, and readable error text are part of
  the component definition. Color never carries the only state signal.

## 10.4 Responsive is a hierarchy change, not a scaled desktop

Desktop HQ is the primary authoring experience. At smaller widths, preserve
the same decision sequence: stack supporting panels after the task, make
choice rows full width, and expose all current state without horizontal
clipping. A complex authoring flow that cannot remain clear on a phone should
offer a deliberate desktop handoff rather than collapse into raw fields.

## 10.5 Detail management surfaces

- **Use a management rail for supporting controls.** Lifecycle, inventory,
  history, and recovery actions follow the primary editor in a left-aligned,
  readable-width workspace. They do not each stretch across a 2K desktop.
- **Give every operational card the same anatomy.** A compact icon, an
  eyebrow, a clear action-oriented title, explanatory copy, and a padded work
  area. A status or destructive action belongs beside the decision it affects,
  never isolated at the far edge of a mostly empty panel.
- **History is a record list, not a placeholder box.** Each revision shows its
  version, meaning, time, current state, and recovery action. When no record
  exists yet, explain exactly what will appear and why instead of rendering an
  empty bordered rectangle.
- **Saving a draft ends in a decision screen.** Show the saved customer-facing
  summary, then make **Publish Live** the primary action, **Edit draft** the
  secondary action, and **See all products** a quiet escape hatch. Do not drop
  an operator back into a long editor with a small publish link.
- **A validation bar has one truthful state.** Never present “ready” beside an
  invalid warning. Name each remaining step and let the operator jump directly
  to it; a review acknowledgement must both visibly and actually gate saving.

## 10.6 Review checklist for every HQ field

1. Can an operator understand what will happen before they enter a value?
2. Does the control visually represent the thing being chosen?
3. Is the current value, default, validation, and applied state observable?
4. Does the layout use desktop width to preserve context rather than create
   blank margins?
5. Can the same task be completed with keyboard navigation and at a narrower
   width without clipping or hidden actions?
