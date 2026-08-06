# Duna Font Usage Guide

**Status:** authoritative. Supersedes all type guidance in earlier design
systems, mobile guidance, and implementation audits.
**Scope:** duna.coach, Duna HQ, Super Admin, Duna Players, Duna Pro, Watch,
Live Activities, generated product media, and transactional/lifecycle UI.
**Audience:** every human or agent writing Duna interface code.

---

## 1. The two-family rule

Duna ships exactly two brand typefaces:

1. **Archivo** when a numeral carries product meaning.
2. **Fellix** for everything else, including every word and every headline.

```text
Is it a number the user reads as data?
  Yes → Archivo, using one of the six numeral tiers.
  No  → Fellix.
```

There is no editorial-family exception and no optional third face. Serif type
is not part of the Duna product system.

### What counts as a meaningful numeral

Scores, ranks, ratings, points, counts, dates, times, deltas, percentages,
seeds, prices, availability, and quantities are data: `21–19`, `#1`, `6.60`,
`+0.14`, `Aug 03`, `8,360 pts`.

A digit embedded in a prose sentence stays Fellix because the sentence is read
as language: “We tracked 105 events.” Do not split a sentence into mixed font
runs merely because it contains a digit.

---

## 2. The two families

| Family      | Role                                      | Source                | Axes                          |
| ----------- | ----------------------------------------- | --------------------- | ----------------------------- |
| **Fellix**  | Every word, headline, label, and control  | Licensed, self-hosted | `wght 100–900`                |
| **Archivo** | Meaningful numerals and the Duna wordmark | OFL, bundled/loaded   | `wdth 62–125`, `wght 100–900` |

No third family may be added to a Duna-owned surface without amending this
guide and its automated verifier in the same change. Generic `sans-serif` is
permitted only as a failure fallback after the two approved families. A club's
explicitly configured theme font is tenant content and remains contained to
that club's branded marketing surface; it does not alter Duna chrome.

```css
--font-body: "Fellix", sans-serif;
--font-display: var(--font-body);
--font-ui: var(--font-body);
--font-data: "Archivo Variable", "Archivo", "Fellix", sans-serif;
--font-monument: var(--font-data);
```

---

## 3. Fellix — all language

Use Fellix for body copy, navigation, buttons, labels, eyebrows, chips, form
fields, table text, player and team names, event titles, editorial headlines,
athletic display names, operator headings, and every word in both apps.

Do not use Fellix for a standalone numeral that carries product meaning.

### Weight ladder

| Weight  | Use                                                                      |
| ------- | ------------------------------------------------------------------------ |
| **300** | Subtitles and ledes at 20px or larger only                               |
| **400** | Body, descriptions, table text, captions                                 |
| **500** | Labels, nav links, eyebrows, names in lists, team names                  |
| **600** | Buttons, card titles, proof-line emphasis, section labels                |
| **700** | Editorial display, feature headings, strong hierarchy                    |
| **800** | Athletic display, player names, event titles, match headlines, app title |
| **900** | Do not use; if 800 is not strong enough, correct scale or composition    |

### Display hierarchy

| Role                 | Weight | Size                      | Tracking | Word spacing | Measure |
| -------------------- | ------ | ------------------------- | -------- | ------------ | ------- |
| Editorial display    | 700    | `clamp(46px,7.2vw,104px)` | −0.030em | +0.05em      | 14ch    |
| Athletic display     | 800    | `clamp(44px,7vw,98px)`    | −0.030em | +0.05em      | 14ch    |
| Feature heading      | 700    | `clamp(34px,4.4vw,56px)`  | −0.018em | +0.03em      | 20ch    |
| Section/card heading | 600    | 20–32px                   | −0.012em | +0.02em      | 20ch    |
| App screen title     | 800    | 28–34px                   | −0.018em | +0.03em      | 18ch    |

The surface still controls composition, not family. Editorial surfaces are
airier and use Fellix 700. Athletic surfaces use Fellix 800, denser blocking,
and larger Archivo data. Operator surfaces use Fellix 600–800 with restrained
scale. All remain recognizably one system.

---

## 4. Archivo — the numeral engine

Use Archivo for every standalone number that carries meaning. Do not use it
for words, labels, buttons, headings, or prose.

Width is the expressive axis. Use `font-variation-settings`, not
`font-stretch`; the latter snaps to named instances and loses the precision
this system depends on.

### Six numeral tiers

| Tier          | Where                                       | `font-variation-settings` | Size      | Tracking | Figures      |
| ------------- | ------------------------------------------- | ------------------------- | --------- | -------- | ------------ |
| **Score**     | Live score, set numerals, match point       | `"wdth" 64, "wght" 900`   | 72–140px  | −0.03em  | Tabular      |
| **Monument**  | Rank mark, jersey numeral, ghost stat       | `"wdth" 122, "wght" 900`  | 120–200px | −0.03em  | Proportional |
| **Hero stat** | Sand Rating value, headline KPI             | `"wdth" 108, "wght" 800`  | 40–56px   | −0.02em  | Tabular      |
| **Block**     | Stat card values, event card dates          | `"wdth" 94, "wght" 800`   | 32–46px   | −0.02em  | Tabular      |
| **Table**     | Points, seeds, deltas, dates, times in rows | `"wdth" 78, "wght" 700`   | 13–19px   | 0        | Tabular      |
| **Chip**      | Metric chips, `3 spots`, `+0.14`            | `"wdth" 78, "wght" 700`   | 12–13px   | 0        | Tabular      |

```css
.duna-numeric {
  font-family: var(--font-data);
  font-feature-settings: "tnum" 1;
  font-variant-numeric: tabular-nums;
}

.duna-numeric--monument {
  font-feature-settings: "pnum" 1;
  font-variant-numeric: proportional-nums;
}
```

Tabular figures are mandatory anywhere a value updates live or sits in a
column. Monument is the only proportional tier because its static optical
spacing reads better at extreme scale.

Never use a meaningful numeral below weight 700. Never flatten Score,
Monument, and Hero to the same width on one screen; their contrast supplies the
energy that a two-family system needs.

---

## 5. Complete element map

| Element                        | Family  | Weight/settings        | Size                        |
| ------------------------------ | ------- | ---------------------- | --------------------------- |
| Editorial h1                   | Fellix  | 700                    | `clamp(46px,7.2vw,104px)`   |
| Athletic h1                    | Fellix  | 800                    | `clamp(44px,7vw,98px)`      |
| Editorial/feature h2           | Fellix  | 700                    | `clamp(34px,4.4vw,56px)`    |
| Athletic h2                    | Fellix  | 700                    | `clamp(30px,3.6vw,44px)`    |
| h3 / card title                | Fellix  | 600                    | 20–26px                     |
| Eyebrow                        | Fellix  | 500                    | 11px, +0.14em, uppercase    |
| Lede                           | Fellix  | 300 at ≥20px, else 400 | 17–20px                     |
| Body                           | Fellix  | 400                    | 16/26                       |
| Secondary                      | Fellix  | 400                    | 14.5/22                     |
| Caption                        | Fellix  | 400                    | 13/18                       |
| Nav link                       | Fellix  | 500                    | 13.5px                      |
| Button                         | Fellix  | 600                    | 14–14.5px                   |
| Status/taxonomy/identity label | Fellix  | 500–700                | 9.5–10px                    |
| Metric chip value              | Archivo | Chip tier              | 12–13px                     |
| Table header/text cell         | Fellix  | 600 / 400–500          | 9.5px / 14.5px              |
| Table numeric cell             | Archivo | Table tier             | 13–19px                     |
| Player name / event title      | Fellix  | 800                    | display scale               |
| Team name                      | Fellix  | 500                    | 15–20px                     |
| Live score                     | Archivo | Score tier             | 72–140px                    |
| Rank mark                      | Archivo | Monument tier          | 120–200px                   |
| Sand Rating value              | Archivo | Hero tier              | 40–56px                     |
| Stat block value / event date  | Archivo | Block tier             | 32–46px                     |
| Delta / time / points / seed   | Archivo | Table or Chip tier     | 12–19px                     |
| Duna wordmark                  | Archivo | `wdth 90 / wght 800`   | 19–22px, +0.17em, uppercase |
| Input label / field            | Fellix  | 500 / 400              | 12px / 16px minimum         |
| Empty-state headline           | Fellix  | 700                    | 24–30px                     |
| Toast / footer link            | Fellix  | 500 / 400              | 14px / 13.5px               |

---

## 6. Apps, Watch, and native extensions

Duna Players and Duna Pro bundle Fellix and six named Archivo tier instances.
They do not bundle a third face. Register named Archivo instances rather than
setting variable axes at runtime because React Native variable-font support is
not consistent across platforms.

| Native role     | Family        | Size                       |
| --------------- | ------------- | -------------------------- |
| Screen title    | Fellix 800    | 28–34px                    |
| Section header  | Fellix 600    | 17–19px                    |
| Body            | Fellix 400    | 16/24, never below 15px    |
| Secondary       | Fellix 400    | 14.5/21                    |
| Caption         | Fellix 400    | 13/18                      |
| Micro / eyebrow | Fellix 500    | 11.5px, +0.14em, uppercase |
| Tab bar label   | Fellix 500    | 10.5px                     |
| Live score      | Archivo Score | 56–72px                    |
| Rating value    | Archivo Hero  | 38–48px                    |
| Table figures   | Archivo Table | 13–15px                    |

Support Dynamic Type to 200%. Test scoreboards, schedules, Live Activities,
and the Watch at the maximum supported size.

---

## 7. Global rhythm and accessibility

```css
:root {
  font-synthesis-weight: none;
  font-synthesis-style: none;
}
```

| Size     | Letter spacing | Word spacing |
| -------- | -------------- | ------------ |
| 96px+    | −0.030em       | +0.05em      |
| 64–96px  | −0.024em       | +0.04em      |
| 40–64px  | −0.018em       | +0.03em      |
| 28–40px  | −0.012em       | +0.02em      |
| 20–28px  | −0.006em       | 0            |
| 15–20px  | 0              | 0            |
| 12–15px  | +0.005em       | 0            |
| Eyebrows | +0.14em        | 0            |

Word-spacing compensation is mandatory whenever negative tracking compresses
display text. Tracking may never be tighter than −0.030em.

Body text is at least 15px; mobile inputs are at least 16px. Display measure is
14ch, feature measure 20ch, lede 52ch, body 66ch, and data never wraps.

---

## 8. Loading and licensing

Web loads the licensed, self-hosted Fellix variable file and Archivo Variable.
Preload/subset them according to route needs with `font-display: swap`. Do not
request a third font from a remote service.

Native bundles the licensed Fellix files and named Archivo instances already
stored inside each app. The Fellix files may not be redistributed or reused
outside the licensed Duna product.

---

## 9. Never do this

| Rule                                                     | Enforcement signal                          |
| -------------------------------------------------------- | ------------------------------------------- |
| Never add a third Duna brand family                      | import, dependency, asset, or family token  |
| Never use a serif family                                 | serif family in product CSS                 |
| Never use Archivo for words                              | numeric component contains literal language |
| Never use Fellix for standalone meaningful data          | data lacks a named Archivo tier             |
| Never use `font-stretch`                                 | use a named Archivo tier instead            |
| Never track tighter than −0.030em                        | design-system verifier                      |
| Never synthesize weight or style                         | global synthesis guard                      |
| Never use Fellix 900                                     | fix scale/composition                       |
| Never use a meaningful numeral below Archivo 700         | tier verifier                               |
| Never use non-tabular figures for updating/columnar data | only Monument is proportional               |

---

## 10. Definition of done

- [ ] Public web and HQ load Fellix and Archivo only.
- [ ] Player, Pro, Watch, and native extensions bundle Fellix and Archivo only.
- [ ] Every word and headline computes to Fellix.
- [ ] Every meaningful numeral uses the correct Archivo tier.
- [ ] No retired/third font dependency, import, asset, or active family remains.
- [ ] Light, dark, editorial, athletic, live, and operator zones preserve the
      same family roles.
- [ ] Desktop, tablet, mobile, reduced-motion, and 200% type QA pass.
- [ ] `pnpm verify:design-system` and `pnpm verify:readable-type` pass.
