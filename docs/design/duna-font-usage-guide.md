# Duna Font Usage Guide

**Status:** authoritative. Supersedes all type guidance in v1, v2, v3, and the audit.
**Scope:** duna.coach, Duna HQ, Duna Players app, Duna Pro app.
**Audience:** any human or AI agent writing Duna interface code.

---

## 1. The three-question test

Resolve any element in three questions, in order. Stop at the first yes.

```
1. Is it a NUMBER that carries meaning?        → ARCHIVO
   (score, rank, rating, points, count, date, time, delta, percentage, seed)

2. Is it a HEADLINE ≥24px on an EDITORIAL surface?  → FRAUNCES
   (homepage, run-your-club, about, methodology, marketing)

3. Everything else.                             → FELLIX
```

Two clarifications that resolve most edge cases:

- **"A number that carries meaning" means a number the user reads as data.** `21–19`, `#1`, `6.60`, `+0.14`, `Aug 03`, `8,360 pts` → Archivo. A number inside a sentence — _"we tracked 105 events"_ — is prose. Fellix.
- **Editorial vs athletic is a property of the surface, not the element.** An `<h1>` on the homepage is Fraunces. The identical `<h1>` on a player page is Fellix 800.

---

## 2. Surface classification

Every screen is exactly one of these. The classification decides whether serif is permitted at all.

| Class          | Surfaces                                                                        | Serif?                                |
| -------------- | ------------------------------------------------------------------------------- | ------------------------------------- |
| **Editorial**  | Homepage, run-your-club, about, Sand Rating methodology, blog, marketing, legal | **Yes** — Fraunces on headlines ≥24px |
| **Athletic**   | Player profile, match, event, /pro, rankings, directory, live scoring, brackets | **No** — Fellix 800 for display       |
| **Operator**   | Duna HQ console, admin, settings                                                | **No**                                |
| **App** (both) | Every screen in Duna Players and Duna Pro                                       | **No** — see §7                       |

---

## 3. The four families

| Family            | Role                                     | Source                | Axes                                         | Status                              |
| ----------------- | ---------------------------------------- | --------------------- | -------------------------------------------- | ----------------------------------- |
| **Fellix**        | Text and UI. The default for everything. | Licensed, self-hosted | `wght 100–900`                               | ✅ In production                    |
| **Fraunces**      | Editorial display serif                  | Google Fonts, OFL     | `opsz 9–144`, `wght 100–900`, `SOFT`, `WONK` | **Add** — replaces Instrument Serif |
| **Archivo**       | Numerals only. The data engine.          | Google Fonts, OFL     | `wdth 62–125`, `wght 100–900`                | ✅ Loaded, badly under-used         |
| **Big Shoulders** | Monument numerals only. **Optional.**    | Google Fonts, OFL     | `wght 100–900`                               | Conditional — see §6.4              |

**Deprecated, remove from the codebase:**

- **Instrument Serif** — one weight only, delicate by construction, reads as wellness. Replaced by Fraunces.
- **Figtree** — was a stand-in for Fellix. Fellix is licensed and loaded. Figtree stays in the fallback stack only, never as a shipping face.

### Fallback stacks

```css
--font-ui: "Fellix", Figtree, -apple-system, BlinkMacSystemFont, sans-serif;
--font-display: "Fraunces", Georgia, "Times New Roman", serif;
--font-data: "Archivo", "Fellix", sans-serif;
--font-monument:
  "Big Shoulders", "Archivo", sans-serif; /* optional tier only */
```

---

## 4. FELLIX — text and UI

**Use for:** body, navigation, buttons, labels, eyebrows, chips, form fields, table text, athletic display names, team names, every word in both apps.
**Never use for:** numerals that carry meaning. Editorial headlines on editorial surfaces.

### Weight ladder — treat as law

| Weight  | Use                                                                |
| ------- | ------------------------------------------------------------------ |
| **300** | Subtitles and ledes at ≥20px only. Never below 20px.               |
| **400** | Body, descriptions, table text, captions                           |
| **500** | Labels, nav links, eyebrows, player names in lists, team names     |
| **600** | Buttons, card titles, emphasis inside proof lines, section labels  |
| **700** | A chip that must out-rank an adjacent 600. Rare.                   |
| **800** | **Athletic display** — player names, event titles, match headlines |
| **900** | Never. If 800 isn't enough, the size is wrong.                     |

---

## 5. FRAUNCES — editorial display

**Use for:** headlines ≥24px on editorial surfaces only.
**Never use for:** anything on an athletic, operator, or app surface. Any numeral. Anything below 24px. Buttons, labels, tables, nav.

### Variable settings

```css
.display {
  font-family: var(--font-display);
  font-optical-sizing: auto;
  font-variation-settings:
    "SOFT" 0,
    "WONK" 1;
  font-weight: 600; /* 600–700 only */
}
/* below 32px, drop the quirk */
.display--small {
  font-variation-settings:
    "SOFT" 0,
    "WONK" 0;
}
```

`WONK 1` enables the characterful alternates that give Fraunces its energy — the thing Instrument Serif lacked. `SOFT 0` keeps the terminals crisp rather than rounded. Optical sizing does the rest.

### Sizes

| Step    | Size                        | Line-height | Tracking | Word-spacing |
| ------- | --------------------------- | ----------- | -------- | ------------ |
| Display | `clamp(46px, 7.2vw, 104px)` | 1.04        | −0.030em | +0.05em      |
| Feature | `clamp(34px, 4.4vw, 56px)`  | 1.08        | −0.020em | +0.03em      |
| Sub     | 24–32px                     | 1.12        | −0.012em | +0.02em      |

**Max measure: 14ch.** If a headline breaks to one word per line, the column is too narrow — widen the column, never shrink the type.

---

## 6. ARCHIVO — the numeral engine

**Use for:** every number that carries meaning.
**Never use for:** words. Not eyebrows, not labels, not buttons, not headings. It is a numeral engine.

### 6.1 Six tiers

Width is the expressive axis. Use its full range.

| Tier          | Where                                       | `font-variation-settings` | Size      | Tracking | `tnum` |
| ------------- | ------------------------------------------- | ------------------------- | --------- | -------- | ------ |
| **Score**     | Live score, set numerals, match point       | `"wdth" 64, "wght" 900`   | 72–140px  | −0.03em  | **on** |
| **Monument**  | Rank mark, jersey-style numeral, ghost stat | `"wdth" 122, "wght" 900`  | 120–200px | −0.03em  | off    |
| **Hero stat** | Sand Rating value, headline KPI             | `"wdth" 108, "wght" 800`  | 40–56px   | −0.02em  | on     |
| **Block**     | Stat card values, event card dates          | `"wdth" 94, "wght" 800`   | 32–46px   | −0.02em  | on     |
| **Table**     | Points, seeds, deltas, times, dates in rows | `"wdth" 78, "wght" 700`   | 13–19px   | 0        | **on** |
| **Chip**      | Metric chips, `3 spots`, `+0.14`            | `"wdth" 78, "wght" 700`   | 12–13px   | 0        | on     |

```css
.num {
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum" 1;
}
```

### 6.2 The tabular exception

Tabular is **mandatory** anywhere a value updates live or sits in a column — a score must not jitter mid-rally, a points column must align. It is **off at Monument tier only**, where a static 180px numeral set tabular can look oddly gapped and proportional reads better.

### 6.3 Rules

- Use `font-variation-settings`, never `font-stretch` — the latter snaps to named instances and loses precision.
- **Never below `wght 700`** for a meaningful number. A 400-weight figure reads as body copy.
- **Never the same width twice on one screen** across Score / Monument / Hero. The contrast is the effect.
- Subset the webfont to `0-9 # + − – . , % / : ×` plus the scoreline glyphs. Full-charset Archivo Variable is heavy.

### 6.4 Big Shoulders — conditional

Only if, after pushing Archivo to `wdth 122 / wght 900`, the rank mark still reads generic. Then swap **Monument tier only**, load subset to digits and `#`, on player and match pages only.

Test question: _does the rank numeral look like it belongs on a jersey?_ If Archivo Expanded clears that bar, don't add the family.

---

## 7. The apps ship two families

**Duna Players and Duna Pro load Fellix and Archivo only. No serif, anywhere.**

Rationale: serif at mobile sizes renders poorly, the apps are tools rather than publications, and dropping a font file matters on cellular at a beach. Brand continuity in the app comes from color, radii, the numeral system, and the Strand — not from letterforms.

App type scale:

| Role            | Family             | Size                         |
| --------------- | ------------------ | ---------------------------- |
| Screen title    | Fellix 800         | 28–34px                      |
| Section header  | Fellix 600         | 17–19px                      |
| Body            | Fellix 400         | 16/24 — **never below 15px** |
| Secondary       | Fellix 400         | 14.5/21                      |
| Caption         | Fellix 400         | 13/18                        |
| Micro / eyebrow | Fellix 500         | 11.5, +0.14em, uppercase     |
| Tab bar label   | Fellix 500         | 10.5                         |
| Live score      | Archivo Score tier | 56–72px                      |
| Rating value    | Archivo Hero tier  | 38–48px                      |
| Table figures   | Archivo Table tier | 13–15px                      |

Support Dynamic Type to 200%. Test the scoreboard and the schedule at that size.

---

## 8. Complete element map

| Element                         | Family                                          | Weight / settings     | Size                          | Tracking    | Case      |
| ------------------------------- | ----------------------------------------------- | --------------------- | ----------------------------- | ----------- | --------- |
| **Editorial h1**                | Fraunces                                        | 600, `WONK 1`         | clamp(46,7.2vw,104)           | −0.030em    | Sentence. |
| **Athletic h1** (player, event) | Fellix                                          | 800                   | clamp(44,7vw,98)              | −0.038em    | Sentence  |
| **Editorial h2**                | Fraunces                                        | 600                   | clamp(34,4.4vw,56)            | −0.020em    | Sentence. |
| **Athletic h2**                 | Fellix                                          | 700                   | clamp(30,3.6vw,44)            | −0.022em    | Sentence  |
| **h3 / card title**             | Fellix                                          | 600                   | 20–26px                       | −0.010em    | Sentence  |
| **Eyebrow**                     | Fellix                                          | 500                   | 11px                          | **+0.14em** | UPPER     |
| **Lede**                        | Fellix                                          | 300 (≥20px) / 400     | 17–20px                       | 0           | Sentence  |
| **Body**                        | Fellix                                          | 400                   | 16/26                         | 0           | Sentence  |
| **Secondary**                   | Fellix                                          | 400                   | 14.5/22                       | 0           | Sentence  |
| **Caption**                     | Fellix                                          | 400                   | 13/18                         | +0.005em    | Sentence  |
| **Nav link**                    | Fellix                                          | 500                   | 13.5px                        | 0           | Sentence  |
| **Button**                      | Fellix                                          | 600                   | 14–14.5px                     | +0.005em    | Sentence  |
| **Status pill (A)**             | Fellix                                          | 700                   | 9.5px                         | +0.16em     | UPPER     |
| **Taxonomy chip (B)**           | Fellix                                          | 500                   | 10px                          | +0.12em     | UPPER     |
| **Metric chip (C)**             | **Archivo**                                     | `wdth 78 / wght 700`  | 12.5px                        | 0           | —         |
| **Identity chip (D)**           | Fellix                                          | 500                   | 10px                          | +0.10em     | UPPER     |
| **Table header**                | Fellix                                          | 600                   | 9.5px                         | +0.14em     | UPPER     |
| **Table cell — text**           | Fellix                                          | 400 (500 for names)   | 14.5px                        | 0           | Sentence  |
| **Table cell — number**         | **Archivo**                                     | Table tier            | 15–17px                       | 0           | —         |
| **Player name, hero**           | Fellix                                          | 800                   | clamp(44,7vw,98)              | −0.038em    | Sentence  |
| **Player given name**           | Fellix                                          | 500                   | 0.40em of surname             | −0.010em    | Sentence  |
| **Team name, match**            | Fellix                                          | 500                   | 15–20px                       | 0           | Sentence  |
| **Live score**                  | **Archivo**                                     | Score tier            | 72–140px                      | −0.03em     | —         |
| **Completed set score**         | **Archivo**                                     | `wdth 68 / wght 600`  | 19px, 42% opacity             | −0.01em     | —         |
| **Rank mark**                   | **Archivo**                                     | Monument tier         | 120–200px                     | −0.03em     | —         |
| **Rank label** (`World rank`)   | Fellix                                          | 700                   | 11px                          | +0.18em     | UPPER     |
| **Sand Rating value**           | **Archivo**                                     | Hero tier             | 40–56px                       | −0.02em     | —         |
| **Stat block label**            | Fellix                                          | 700                   | 9.5px                         | +0.15em     | UPPER     |
| **Stat block value**            | **Archivo**                                     | Block tier            | 32–46px                       | −0.02em     | —         |
| **Stat block sub**              | Fellix                                          | 400                   | 11.5px                        | 0           | Sentence  |
| **Event card date**             | **Archivo**                                     | `wdth 74 / wght 800`  | 32px                          | −0.02em     | —         |
| **Delta** (`▲ 0.14`)            | **Archivo**                                     | `wdth 78 / wght 700`  | 13px                          | 0           | —         |
| **Form pill** (`W` / `L`)       | **Archivo**                                     | `wdth 78 / wght 800`  | 12px                          | 0           | UPPER     |
| **Ghost surname**               | **Archivo**                                     | `wdth 124 / wght 900` | clamp(140,20vw,290)           | −0.035em    | UPPER     |
| **Wordmark** `DUNA`             | **Archivo**                                     | `wdth 90 / wght 800`  | 19–22px                       | +0.17em     | UPPER     |
| **Input label**                 | Fellix                                          | 500                   | 12px                          | +0.06em     | Sentence  |
| **Input field**                 | Fellix                                          | 400                   | 16px (never lower — iOS zoom) | 0           | Sentence  |
| **Empty-state headline**        | Fraunces (web editorial) / Fellix 700 elsewhere | 600                   | 24–30px                       | −0.012em    | Sentence. |
| **Toast**                       | Fellix                                          | 500                   | 14px                          | 0           | Sentence  |
| **Footer link**                 | Fellix                                          | 400                   | 13.5px                        | 0           | Sentence  |

Terminal periods on headlines are correct on editorial surfaces and optional on athletic ones.

---

## 9. Global rules

```css
:root {
  font-synthesis-weight: none; /* never fake a weight the family doesn't ship */
  font-synthesis-style: none;
}
```

**The tracking curve** — tracking is a function of size, never a constant:

| Size     | Letter-spacing | Word-spacing |
| -------- | -------------- | ------------ |
| 96px+    | −0.030em       | +0.05em      |
| 64–96    | −0.024em       | +0.04em      |
| 40–64    | −0.018em       | +0.03em      |
| 28–40    | −0.012em       | +0.02em      |
| 20–28    | −0.006em       | 0            |
| 15–20    | 0              | 0            |
| 12–15    | +0.005em       | 0            |
| Eyebrows | +0.14em        | 0            |

**Word-spacing compensation is mandatory.** Negative tracking shrinks word spaces along with letter spaces. Adding it back is what prevents _Playmore._ and _BPTElite16Hamburg_.

**Measure:** display 14ch · feature 20ch · lede 52ch · body 66ch · caption 44ch · data never wraps.

**Line-height:** display 1.02–1.08 · feature 1.10 · sub 1.12 · body 1.6 · caption 1.45 · data 1.0.

**Heading cluster rhythm:** eyebrow → 14px → headline → 20px → lede → 32px → content.

**Alignment:** athletic and operator surfaces are left-aligned, always. Centering is permitted on exactly two surfaces sitewide — the homepage hero and the closing CTA.

---

## 10. Loading

### Web

```html
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&family=Fraunces:opsz,wght@9..144,300..900&display=swap"
  rel="stylesheet"
/>
```

Self-host in production. Preload Fellix and Archivo — both are above the fold on every page. Fraunces loads on editorial routes only. `font-display: swap` throughout. Subset Archivo to numerals and scoreline glyphs.

### React Native

Bundle Fellix and Archivo variable files. Register named instances for the six Archivo tiers rather than setting variation axes at runtime — RN's variable-font support is inconsistent across platforms, and named instances are reliable.

---

## 11. Never do this

Each with a grep-able signal.

| Rule                                                     | Signal                                               |
| -------------------------------------------------------- | ---------------------------------------------------- |
| Never request a weight a family doesn't ship             | `font-weight` > 400 on `Instrument Serif`            |
| Never track tighter than −0.030em                        | `letter-spacing: -0.0[4-9]`, or px:size ratio > 0.03 |
| Never omit word-spacing when tracking is negative        | negative `letter-spacing` with no `word-spacing`     |
| Never use Archivo for words                              | `Archivo` on an element whose text has no digits     |
| Never use a serif for digits                             | `Fraunces`/`Instrument` on numeric content           |
| Never put serif on athletic, operator, or app surfaces   | `--font-display` outside editorial routes            |
| Never set serif below 24px                               | `Fraunces` with `font-size` < 24px                   |
| Never set body below 15px                                | `font-size` 14px or less on `p`                      |
| Never set an input below 16px on mobile                  | iOS auto-zooms                                       |
| Never center display type on a data page                 | `text-align: center` on athletic surfaces            |
| Never use Fellix 900                                     | `font-weight: 900` on `--font-ui`                    |
| Never use a numeral below Archivo 700                    | data tier with `wght` < 700                          |
| Never ship Instrument Serif or Figtree as a display face | either name outside a fallback stack                 |

---

## 12. Migration checklist

- [ ] Add Fraunces; remove Instrument Serif from all display rules
- [ ] Demote Figtree to fallback position only
- [ ] Apply `font-synthesis-weight: none` at `:root`
- [ ] Replace all `font-weight` > 400 on serif with `600` on Fraunces
- [ ] Apply the §9 tracking curve; add word-spacing everywhere tracking is negative
- [ ] Swap all eyebrows from Archivo 700 to Fellix 500
- [ ] Swap event card dates from Instrument Serif to Archivo Block tier
- [ ] Swap athletic display headlines from serif to Fellix 800
- [ ] Implement the six Archivo tiers; audit for more than two widths in use
- [ ] Subset Archivo; preload Fellix + Archivo; route-load Fraunces
- [ ] Verify the app bundles two families only
