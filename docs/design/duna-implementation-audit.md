# Duna Implementation Audit — VERIFIED

**Date:** 2026-08-06 · **Method:** live DOM, computed styles, and screenshots via browser. Supersedes the earlier inferential audit.

**Headline:** the token architecture is right. The wiring is wrong. This is roughly six CSS changes, not a redesign.

---

## 0. First: your CDN is serving stale HTML

`web_fetch` returned a build several versions old — old nav (`Discover / Create an event / Pro tour`), old proof band (`Backed by beach volleyball's best`), no sun toggle. The browser returned the current build. Same URL, same moment.

**Action:** run `curl -A "Googlebot/2.1" https://duna.coach/ | grep -o "Built for the whole beach"`. If it comes back empty, crawlers are being served stale markup and Google is indexing a build you replaced. Check the CDN cache key and any bot-detection middleware.

---

## 1. Root cause A — the token file shipped only the dark column

`document.documentElement` has `data-theme="light"`, `color-scheme: light`, and `body { background: #F6F5F1 }`. But **every custom property on `:root` is the dark-performance value**:

| Token                      | Shipped               | Should be (light · editorial) |
| -------------------------- | --------------------- | ----------------------------- |
| `--ground`                 | `#0d1114`             | `#F6F5F1`                     |
| `--dissolve`               | `#0d1114`             | `#F6F5F1`                     |
| `--surface-1`              | `#141a1e`             | `#FFFFFF`                     |
| `--surface-2`              | `#1b2429`             | `#EDECE6`                     |
| `--text-1`                 | `#edf1f2`             | `#1B1B19`                     |
| `--text-2`                 | `#a9b4b8`             | `#3A3A36`                     |
| `--glass-fill`             | `#0d1114b3`           | `rgba(255,255,255,.68)`       |
| `--glass-border`           | `#f2f0ea1a`           | `rgba(255,255,255,.55)`       |
| `--hairline`               | `#b5ccd31f`           | `rgba(27,27,25,.08)`          |
| `--flare`                  | `#f4794c`             | `#E8683A`                     |
| `--flare-text`             | `#f4794c`             | `#B84A20`                     |
| `--gold`                   | `#d4b77c`             | `#C9A96A`                     |
| `--signal`                 | `#a8c44e`             | `#C9E265`                     |
| `--gain` / `--loss`        | `#6bae78` / `#c4785c` | `#2F6B3A` / `#9A4A2E`         |
| `--btn-primary-bg` / `-fg` | `#edf1f2` / `#0d1114` | `#1B1B19` / `#F6F5F1`         |

The body background comes from a separate rule, which is why the page _looks_ light while every token is dark. Nothing downstream can be correct.

**Likely mechanism:** `--lightningcss-dark: initial` and `--lightningcss-light: ""` are present, meaning `light-dark()` is being transpiled by LightningCSS. The polyfill resolved to the dark branch despite `data-theme="light"`. Check the custom-media definition and the build config.

---

## 2. Root cause B — the warm palette does not exist

There is no `--sand-100`, `--sand-300`, `--sand-500`, `--marine-200`, `--fog-50`, `--fog-100`, `--ink`, `--dusk`, or `--pending` anywhere in the 86 declared properties.

`--ground-warm` is `#171410` — a near-black. And the legacy alias reads:

```
--color-sand-light: var(--ground-warm);   /* → #171410 */
```

So every piece of legacy code asking for _light sand_ now receives near-black.

**This is the direct answer to "it isn't golden hour."** Warmth is not in the file. Gold survives only as `--gold: #d4b77c`, used as an accent against cold grounds — which inverts the system, where warmth is the environment and dark is the punctuation.

**Action:** add the full light-editorial column. Until those tokens exist, no amount of section-level styling will fix the temperature.

---

## 3. Root cause C — a legacy navy palette is still driving actual backgrounds

Measured section grounds, top to bottom:

| y                        | Background                                | In the system?                         |
| ------------------------ | ----------------------------------------- | -------------------------------------- |
| 0 — hero                 | `#0B2440`                                 | ❌ Not a Duna color                    |
| 920 — proof band         | `#FFFFFF`                                 | ✅                                     |
| 1019 — three faces       | transparent → `#F6F5F1`                   | ✅                                     |
| 2013 — Happening on Duna | `#0B2440`                                 | ❌                                     |
| 3041 — Sand Rating       | transparent → `#F6F5F1`                   | ✅                                     |
| 4141 — Duna HQ           | `#F4F0E7`                                 | ≈ close to `--sand-100`, slightly grey |
| 4992 — closing           | `#0B2440` + radial `rgba(61,129,185,.38)` | ❌ Both                                |

`#0B2440` is a saturated navy. `#3D81B9` is cornflower blue. Neither appears in the design system. The system's darks are `#1B1B19`, `#22343B`, `#0D1114`.

The alias layer (`--color-navy`, `--color-aqua`, `--color-bone`, `--color-ink`) is a migration shim from the previous navy/aqua/bone palette — and the shim is winning over the new tokens.

**Action:** grep for `#0B2440`, `#3D81B9`, `--color-navy`, `--color-aqua`, `--color-bone`. Replace with `--ground`, `--ground-cool`, `--ground-warm`, then delete the alias layer.

---

## 4. Typography — two declarations cause the entire problem

Computed on `h1`:

```
font-family:    "Instrument Serif", Georgia, serif   ✅
font-size:      134.4px          ← spec caps at 116
font-weight:    860              ← ✗✗ Instrument Serif ships ONLY weight 400
letter-spacing: -10.08px         ← −0.075em; spec is −0.015 to −0.022em
line-height:    107.52px         ← ratio 0.80; spec 1.02–1.10
word-spacing:   0px
```

**`font-weight: 860` is the single biggest visual error on the site.** Instrument Serif has one weight. Requesting 860 makes the browser **synthesize a fake bold** by smearing the outlines — which is exactly why the display type reads as a heavy fashion didone rather than an elegant editorial serif.

The proof is inside the same headline: the `<em>` "Know your game." computes to `font-weight: 400` and looks correct. "Play more." computes to 860 and looks smeared. Two different weights in one h1, one of them synthetic.

**`letter-spacing: -0.075em` is 3.4–5× too tight**, which is why word spaces collapse: _Playmore._ · _Thegamefinallyhasahome._

**Fix:**

```css
h1,
.display {
  font-weight: 400; /* never above 400 on Instrument Serif */
  font-size: clamp(46px, 8.4vw, 116px);
  letter-spacing: -0.018em;
  line-height: 1.04;
  word-spacing: 0.04em;
  font-synthesis-weight: none; /* fail loudly instead of faking */
}
```

`font-synthesis-weight: none` is the guardrail — it makes any future over-weighting visible immediately rather than silently smeared.

---

## 5. Eyebrows — wrong on four counts

Computed on `One network. Every side of the sport.`

| Property         | Shipped                | Spec               |
| ---------------- | ---------------------- | ------------------ |
| `font-family`    | **Archivo**            | Fellix             |
| `font-weight`    | **700**                | 500                |
| `color`          | **`#235A96`** (cobalt) | `--ink-soft` @ 72% |
| `font-size`      | 11.2px                 | ✅                 |
| `letter-spacing` | 1.456px (0.13em)       | ✅                 |
| `text-transform` | uppercase              | ✅                 |

Archivo is the **data** font — numbers only. Using it for eyebrows breaks the three-role separation that makes the type system legible.

`#235A96` is another off-palette blue, same family as the navy problem.

**Content:** "One network. Every side of the sport." is a headline with two sentences. Eyebrows are a category, a scope, or a source, max 5 words. Use `Modules` or `The network`.

---

## 6. Imagery — one image is a legal problem, not just an aesthetic one

**`duna-action-dive.webp`** (Happening on Duna) is a saturated broadcast press photo: **MIKASA** and **DUBAI** sponsor boards legible, a USA jersey with a number, identifiable athletes' faces, bright blue sport court, spectators, flat midday-style light.

Aesthetically it violates five doctrine rules at once — saturated, legible logos, crowd, broadcast register, no golden hour.

**More seriously: this appears to be licensed FIVB / Volleyball World press photography of identifiable athletes.** That is a rights exposure independent of design. Confirm the license immediately, and if it isn't cleared for commercial marketing use, pull it today.

**`duna-action-serve.webp`** (hero) is on-doctrine in subject and grade. Keep it; it just needs the warm regrade in §8.

The **sand-texture plate** in the Sand Rating section is correct — muted, abstract, low contrast. That one shows the doctrine working.

**Type-role violation in the event cards:** dates render `03` in **Instrument Serif at 27.2px**. Numbers belong in Archivo. Should be `wdth 74, wght 800`.

---

## 7. Zoning is inverted, and `data-zone` does not exist

`documentElement` carries `data-theme` only. No `data-zone` anywhere.

Measured rhythm: **navy → white → fog → navy → fog → warm → navy.**

Three dark blocks, and all three contain **editorial** content — event browsing and the closing CTA. Meanwhile there is **no performance zone on the page at all**: no live match, no scoreboard, no marine block.

So dark currently means "we felt like it" rather than "this is live." That is exactly the signal collapse the theming doc predicted. Ship `data-zone` in light mode before touching anything else in the theme layer.

---

## 8. Blockers still open from the previous audit

| ID                            | Status                                                                                                                                                                        |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `01 / 02 / 03` markers        | **Still present.** Archivo, 10.4px, `#9B9385`. Quieter than before, still asserting a false sequence. Replace with `For players` / `For competitors` / `For operators` chips. |
| The live strand               | **Still missing.** One static "UP NEXT" card. No ticker, no pulse.                                                                                                            |
| Marine block / Pro tour       | **Still missing.** No performance zone anywhere.                                                                                                                              |
| Sand Rating duplicate         | **Confirmed real** — `Sand Rating 3.00 Sand Rating 3.00 Provisional`. Not an extraction artifact.                                                                             |
| `meta[theme-color]` `#f8f7f3` | Unverified on current build — re-check.                                                                                                                                       |
| `SandRating` in meta          | Unverified on current build — re-check.                                                                                                                                       |

---

## 9. What is genuinely right — do not touch

- **Fellix is licensed and loaded**, variable 100–900. Archivo Variable and Instrument Serif both loading correctly.
- **The token architecture is correct**: semantic names, a proper alias shim for migration, `--flare-fill`, `--flare-border`, `--edge-light`, `--image-veil`, `--scrim` all present and well-formed. They built the system properly and wired one column.
- **Radii exact:** 24 / 16 / 8 / 28. ✅
- **Glass blur exact:** `blur(24px) saturate(1.15)`. ✅
- **Shadows exact:** `0 8px 32px #1b1b190f`, `0 24px 80px #1b1b1914`. ✅
- Sun toggle shipped. Nav primary CTA restored. Body background, font stack, and base size all correct.
- Sand-texture imagery on-doctrine.
- Two-column section layout for "The game finally has a home" is better than the centered version I specced.

---

## 10. Fix order

1. **Add the light-editorial token column** and correct the `light-dark()` resolution. Everything else is downstream. (§1, §2)
2. **`font-weight: 400` and `letter-spacing: -0.018em` on display type**, plus `font-synthesis-weight: none`. Two lines; transforms the page. (§4)
3. **Purge `#0B2440` and `#3D81B9`**, delete the alias shim. (§3)
4. **Confirm the license on `duna-action-dive.webp`** or pull it. (§6)
5. Eyebrows → Fellix 500, `--ink-soft`. Dates → Archivo. (§5, §6)
6. `01/02/03` → role chips. Restore the strand and the marine block. (§8)
7. Ship `data-zone` in light mode. Only then revisit dark. (§7)

Steps 1 and 2 alone will move this most of the way to the references you started from.

---

# ADDENDUM — CRAFT CORRECTIONS

Added after live inspection of /pro, /run-your-club, /events, and /players. Read alongside `duna-design-system-v3.md` Parts 6–9.

## A1. Typography — copy-paste fix

Every display collision on the site comes from three declarations. This one block resolves all of them.

```css
:root {
  font-synthesis-weight: none;
}

.display,
h1,
h2,
h3 {
  font-weight: 400; /* Instrument Serif has ONE weight. 860 = fake bold. */
  letter-spacing: -0.018em; /* was -0.075em */
  word-spacing: 0.03em; /* mandatory compensation */
  line-height: 1.06; /* was 0.80 */
}
h1 {
  font-size: clamp(46px, 7.2vw, 104px);
  letter-spacing: -0.03em;
  word-spacing: 0.05em;
}
h2 {
  font-size: clamp(34px, 4.4vw, 56px);
  letter-spacing: -0.02em;
}
```

Verified collisions this fixes: _Playmore._ · _Thegamefinallyhasahome._ · _Theworld'sgame,_ · _BPTElite16Hamburg_ · _Runthebusiness._

## A2. Role violations found in production

| Where                              | Currently                     | Must be                                        |
| ---------------------------------- | ----------------------------- | ---------------------------------------------- |
| All eyebrows                       | Archivo 700, `#235A96` cobalt | **Fellix 500**, `--ink-soft` @72%              |
| Event card dates (`03`)            | Instrument Serif 27px         | **Archivo** `wdth 74 / wght 800`, tabular      |
| Player name, match teams, rankings | Serif                         | **Fellix 800** — no serif on athletic surfaces |
| Editorial headlines                | Instrument Serif              | **Fraunces** 600–700, `opsz 144`, `WONK 1`     |

Archivo is the data font. Instrument Serif is the editorial font. Neither may take the other's job. Three violations are live right now.

## A3. Positioning and layout errors

| #   | Error                                                  | Where                              | Fix                                                                                                 |
| --- | ------------------------------------------------------ | ---------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1   | **Hero is an inset rounded card** floating in margin   | Player profile                     | Full bleed, zero radius, under the nav                                                              |
| 2   | **Nothing touches a viewport edge** on any page        | Site-wide                          | See v3 Part 7. Every page needs at least one full bleed and one clipped bleed.                      |
| 3   | **No element overlaps another**                        | Site-wide                          | One plane break per page, minimum. Stat shelf straddling the hero boundary is the canonical device. |
| 4   | **Display type in a column narrower than 14ch**        | run-your-club                      | Widen the column. Do not shrink the type.                                                           |
| 5   | **Type scale has a cliff** — 134px then 16px           | Homepage                           | Use all five steps (v3 §6.3)                                                                        |
| 6   | **Centered display type on a data page**               | /pro                               | Left-align. Centering is permitted only on the homepage hero and closing CTA.                       |
| 7   | **Four chips, one repeating the page title**           | Event page                         | Max three: `[LIVE] [Elite16] [Men]`                                                                 |
| 8   | **`105 TRACKED EVENTS` at ~10% opacity on near-black** | /pro                               | Promote to a real stat block on a light ground                                                      |
| 9   | **Legacy navy `#0B2440` on a primary CTA**             | Event page, `See women's division` | `--ink`                                                                                             |
| 10  | **Uniform 24px radius at every scale**                 | Site-wide                          | Radius scales inversely with size (v3 §7.3). Full-bleed = 0.                                        |

## A4. What the AI should stop doing

Patterns observed across three implementation passes, stated as prohibitions with grep-able signals:

- **Never request a font weight a family does not ship.** Signal: any `font-weight` above 400 on `Instrument Serif`.
- **Never set letter-spacing tighter than −0.030em.** Signal: `letter-spacing: -0.0[4-9]`, or any px value whose ratio to font-size exceeds 0.03.
- **Never put a hero inside a card.** Signal: `border-radius` on any element taller than 60vh.
- **Never use Archivo for words** or Instrument Serif for digits.
- **Never introduce a color that is not a token.** Signals: `#0B2440`, `#3D81B9`, `#235A96`, any inline hex in a component.
- **Never render `0/0`, `50% / 50%`, or a medal before a match is final.**
- **Never number a list that is not a sequence.** Signal: `01`/`02`/`03` adjacent to headings.
- **Never generate imagery containing legible logos, crowds, or celebration.** Signal: `celebrat`, `cheer`, `crowd` in alt text.

## A5. Priority

1. **A1** — one CSS block, fixes five pages.
2. **A2** — three role swaps.
3. **A3 #1, #2, #3** — full bleed the player hero, add one clipped bleed and one plane break per page.
4. Remaining A3 items.
5. The blockers in §8 of this audit.
