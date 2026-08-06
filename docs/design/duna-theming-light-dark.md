# Duna Theming — Light and Dark

**Companion to** `duna-design-system.md` (v2) and `duna-mobile-design-guide.md`. This document replaces whatever light/dark handling exists today across web, Players, and Pro. Read §1 before anything else — it resolves a genuine collision in the system.

---

## 1. The collision, and how it resolves

Duna already uses light and dark **semantically**. Light ground means _read this_. Dark ground means _this is live_. That is the zoning rule, and it's the spine of the whole system.

A global dark mode threatens to destroy it. If the user flips to dark and every surface goes dark, then a live match no longer announces itself — it looks like everything else. The signal collapses.

**The resolution: zoning is a relationship, not an absolute.**

Theme sets **the pair**. Zone picks **which member of the pair**. In every theme, the performance zone is the darker, cooler, more accent-dense member. What changes between themes is _how_ that difference is expressed.

|           | Editorial zone       | Performance zone     | What carries the difference                                  |
| --------- | -------------------- | -------------------- | ------------------------------------------------------------ |
| **Light** | Fog `#F6F5F1`        | Ink `#1B1B19`        | **Lightness.** A 15:1 jump.                                  |
| **Dark**  | Warm black `#141310` | Cool black `#0D1114` | **Temperature.** A small lightness delta, a large hue delta. |

In light mode, lightness does the work. In dark mode, lightness can't — so **temperature does the work instead**, backed by three reinforcements: hairline hue, accent density, and a top edge-light on performance surfaces.

This is the same idea already running through the mobile guide, where the Players app uses a warm dusk wash for planning and cold ink for competition. Dark mode just makes temperature the primary carrier everywhere.

**The invariant, stated once:** _editorial is always warmer and lighter than performance, in every theme, on every platform._ If a design breaks that, it's wrong regardless of how it looks.

---

## 2. Architecture

Two attributes on the root and section, four resolved combinations. Everything else derives.

```html
<html data-theme="light">
  <!-- or "dark" -->
  <section data-zone="editorial"><!-- or "performance" --></section>
</html>
```

- `data-theme` comes from `prefers-color-scheme`, overridden by an explicit user choice persisted in `localStorage` / `AsyncStorage`. Offer three states in settings: **Light · Dark · Match device**. Default to Match device.
- `data-zone` is set by the component, never by the user. A live match is `performance` whether the user picked light or dark.
- **A third attribute, `data-contrast`, layers on top** — see §8. It is a contrast override, not a theme.

**No raw hex values in components. Ever.** If a component file contains `#1B1B19`, that's a bug. Components read semantic tokens only. This is the whole point of the exercise: right now the site has a light/dark implementation that can't express zoning because the two concepts are tangled.

---

## 3. Token table

Four resolved contexts. These are the values.

### Grounds and surfaces

| Token                          | Light · Editorial    | Light · Performance     | Dark · Editorial        | Dark · Performance      |
| ------------------------------ | -------------------- | ----------------------- | ----------------------- | ----------------------- |
| `--ground`                     | `#F6F5F1`            | `#1B1B19`               | `#141310`               | `#0D1114`               |
| `--ground-warm` (sand block)   | `#EFE6D3`            | `#231F19`               | `#1E1A14`               | `#171410`               |
| `--ground-cool` (marine block) | `#B5CCD3`            | `#22343B`               | `#16232A`               | `#101A20`               |
| `--surface-1` (card)           | `#FFFFFF`            | `rgba(246,245,241,.05)` | `#1C1A16`               | `#141A1E`               |
| `--surface-2` (nested)         | `#EDECE6`            | `rgba(246,245,241,.08)` | `#24211C`               | `#1B2429`               |
| `--surface-3` (sheet, popover) | `#FFFFFF`            | `#232320`               | `#2C2823`               | `#22343B`               |
| `--hairline`                   | `rgba(27,27,25,.08)` | `rgba(246,245,241,.10)` | `rgba(239,230,211,.10)` | `rgba(181,204,211,.12)` |
| `--hairline-strong`            | `rgba(27,27,25,.18)` | `rgba(246,245,241,.22)` | `rgba(239,230,211,.20)` | `rgba(181,204,211,.24)` |
| `--edge-light`                 | none                 | `rgba(246,245,241,.06)` | none                    | `rgba(181,204,211,.09)` |
| `--scrim`                      | `rgba(27,27,25,.44)` | `rgba(10,10,9,.62)`     | `rgba(10,10,9,.62)`     | `rgba(6,8,9,.70)`       |

Note the hairline hue shift — warm `239,230,211` in editorial, cool `181,204,211` in performance. At 10% opacity nobody consciously sees it, and everybody feels it. It's a meaningful part of how dark mode keeps the zones apart.

`--edge-light` is a 1px inset top highlight on performance surfaces only. It's the thing that makes a dark scoreboard read as _lit_ rather than _empty_.

### Text

| Token                | Light · Editorial | Light · Performance     | Dark · Editorial | Dark · Performance |
| -------------------- | ----------------- | ----------------------- | ---------------- | ------------------ |
| `--text-1`           | `#1B1B19`         | `#F2F0EA`               | `#F2F0EA`        | `#EDF1F2`          |
| `--text-2`           | `#3A3A36`         | `rgba(242,240,234,.72)` | `#B8B4A8`        | `#A9B4B8`          |
| `--text-3` / pending | `#8A8578`         | `rgba(242,240,234,.48)` | `#7E7A70`        | `#78868C`          |
| `--text-on-accent`   | `#FFFFFF`         | `#FFFFFF`               | `#141310`        | `#0D1114`          |

**Never pure white on dark.** `#F2F0EA` in editorial (warm) and `#EDF1F2` in performance (cool) prevent halation and reinforce the temperature split. Approximate contrast on their grounds: ~16:1 and ~17:1.

### Accents — retuned per theme, not reused

An accent tuned for white will glow aggressively on black. Every accent has a dark-mode variant.

| Token                                     | Light                  | Dark                   | Rule                                                |
| ----------------------------------------- | ---------------------- | ---------------------- | --------------------------------------------------- |
| `--flare` (dots, borders, large numerals) | `#E8683A`              | `#F4794C`              | ~3.2:1 on white — **never body text in light mode** |
| `--flare-text` (any flare-colored word)   | `#B84A20`              | `#F4794C`              | ~5.4:1 light, ~7:1 dark                             |
| `--flare-fill`                            | `rgba(232,104,58,.13)` | `rgba(244,121,76,.16)` | Chip and container fills                            |
| `--flare-border`                          | `rgba(232,104,58,.26)` | `rgba(244,121,76,.34)` | Exception cards, AI suggestions                     |
| `--signal`                                | `#C9E265`              | `#A8C44E`              | Dots and fills only. Never text, either theme.      |
| `--gold` (sand-500 role)                  | `#C9A96A`              | `#D4B77C`              | Podium, milestones, winner bracket paths            |
| `--gain`                                  | `#2F6B3A`              | `#6BAE78`              | Always paired with ▲                                |
| `--loss`                                  | `#9A4A2E`              | `#C4785C`              | Always paired with ▼                                |

**Watch out:** in dark mode `--loss #C4785C` sits uncomfortably close to `--flare #F4794C`. That's tolerable only because the system already requires a glyph alongside every directional value. Enforce it — ▲ and ▼ are not optional decoration, they're the actual differentiator for anyone with a color vision deficiency.

### Glass

| Token            | Light                       | Dark                                                              |
| ---------------- | --------------------------- | ----------------------------------------------------------------- |
| `--glass-fill`   | `rgba(255,255,255,.68)`     | `rgba(20,19,16,.66)` editorial · `rgba(13,17,20,.70)` performance |
| `--glass-border` | `rgba(255,255,255,.55)`     | `rgba(242,240,234,.10)`                                           |
| `--glass-blur`   | `blur(22px) saturate(1.35)` | `blur(24px) saturate(1.15)`                                       |

Dark glass needs **higher opacity and less saturation boost** than light glass — saturating a dark blur produces muddy color casts over imagery.

### Imagery

| Token          | Light         | Dark                  | Purpose                                             |
| -------------- | ------------- | --------------------- | --------------------------------------------------- |
| `--image-veil` | `transparent` | `rgba(13,17,20,.16)`  | Overlaid on every photograph in dark mode           |
| `--dissolve`   | `#F6F5F1`     | `#141310` / `#0D1114` | **The fog dissolve target. Must equal `--ground`.** |

**This is the highest-risk implementation detail in the whole theming layer.** Our imagery doctrine says every photograph dissolves into the page with a tall bottom gradient. If that gradient is hardcoded to `#F6F5F1`, dark mode produces a pale bar across the bottom of every hero. Every dissolve must read `--dissolve`, which resolves to whatever the current ground is.

Also: a bright golden-hour photograph on a near-black page is a flashbang. `--image-veil` at 16% plus a 4% desaturation keeps imagery inside the grade in dark mode. Apply it as an overlay, not by shipping second image files.

### Interactive

| Token                | Light                | Dark                    |
| -------------------- | -------------------- | ----------------------- |
| `--btn-primary-bg`   | `#1B1B19`            | `#F2F0EA`               |
| `--btn-primary-fg`   | `#F6F5F1`            | `#141310`               |
| `--btn-ghost-border` | `rgba(27,27,25,.22)` | `rgba(242,240,234,.26)` |
| `--focus-ring`       | `#E8683A`            | `#F4794C`               |

**The primary button inverts.** In light mode it's ink on fog; in dark mode it's off-white on black. It stays the highest-contrast object on the screen in both. Don't make it a mid-gray in dark mode "to be gentler" — the primary action should be unmissable.

---

## 4. Depth: shadows don't work in dark mode

In light mode, elevation reads as _lighter and slightly shadowed_. In dark mode, shadows are invisible — you cannot cast a darker shadow onto near-black.

**Dark-mode elevation ladder:**

| Level                     | Signal                                                             |
| ------------------------- | ------------------------------------------------------------------ |
| 0 — ground                | `--ground`                                                         |
| 1 — card                  | `--surface-1` + 1px `--hairline`                                   |
| 2 — nested                | `--surface-2`, no border                                           |
| 3 — sheet, modal, popover | `--surface-3` + 1px `--hairline-strong` + `--edge-light` inset top |

Elevation goes **lighter** as it rises, in both themes. That's the consistent mental model. What changes is the _supplementary_ cue: light mode adds a soft shadow, dark mode adds a border and an edge-light.

The one shadow permitted in dark mode is under a bottom sheet — `0 -12px 48px rgba(0,0,0,.55)` — purely to separate it from content scrolling beneath.

---

## 5. Zone-by-zone application

How every surface in the product resolves. This is the reference table for implementation.

| Surface                       | Zone        | Light                           | Dark                                      |
| ----------------------------- | ----------- | ------------------------------- | ----------------------------------------- |
| Homepage hero                 | editorial   | Fog, full imagery, fog dissolve | Warm black, imagery + veil, warm dissolve |
| Marine block (/pro tour band) | editorial   | `#B5CCD3`                       | `#16232A`                                 |
| Sand block (Sand Rating)      | editorial   | `#EFE6D3`                       | `#1E1A14`                                 |
| Live match card               | performance | `#22343B`                       | `#0D1114` + edge-light                    |
| /pro hero                     | performance | Marine-900                      | `#0D1114`                                 |
| /pro browsing body            | editorial   | Fog                             | Warm black                                |
| Event page hero               | editorial   | Fog + venue plate               | Warm black + veiled plate                 |
| Match detail page             | performance | Ink                             | `#0D1114`                                 |
| Duna HQ console               | performance | Ink                             | `#0D1114`                                 |
| run-your-club body            | editorial   | Fog                             | Warm black                                |
| Footer                        | performance | Ink                             | `#0D1114`                                 |
| **Players app — planning**    | editorial   | Dusk wash `#FBF3F4→#FFF`        | `#1A1517 → #141310` (warm plum-black)     |
| **Players app — scoring**     | performance | Ink                             | `#0D1114`                                 |
| **Pro app — overview**        | editorial   | Fog                             | Warm black                                |
| **Pro app — console / Money** | performance | Marine-900                      | `#0D1114`                                 |
| **Pro app — courtside mode**  | performance | Marine-900                      | Pure black (see §8)                       |

Note the mobile dusk wash in dark mode: `#1A1517` is a warm plum-tinted near-black. The pink survives as _hue_, not as _lightness_. The planning-vs-competition temperature contrast holds in both themes, which is exactly what the mobile guide's temperature rule requires.

---

## 6. Co-branding in dark mode — the practical problem

Our rule is "monochrome at rest, full color on interaction." In dark mode, monochrome means a **light** treatment of a partner logo, and many brand guidelines explicitly forbid recoloring a mark.

**Decision tree, in order:**

1. **Official reversed lockup exists** → use it at `--text-2` opacity, full color on hover. Best case; request reversed assets from every partner during onboarding.
2. **Reversed lockup exists but recoloring is forbidden** → use the official white/reversed version at 100%, no opacity reduction. Skip the monochrome-at-rest step; the reversed asset _is_ the at-rest state.
3. **Only a full-color mark exists and recoloring is forbidden** → place it inside a **light containment card** (`#FFFFFF`, 16px radius, 12px padding) even on a dark page. Slightly inelegant, entirely correct, and legally safe.

**Event artwork** (FIVB posters, AVP promo art) is case 3 by default: bright, saturated, type-heavy artwork inside a light containment card on a dark page. Apply `--image-veil` at half strength so it doesn't scream, and keep the `Official event artwork` eyebrow caption.

**Never** apply a dark-mode filter, invert, or multiply blend to a partner mark to make it fit. That's a trademark problem, not a design choice.

---

## 7. Everything outside the app shell

| Asset               | Handling                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `meta[theme-color]` | Two values via media query: `#F6F5F1` light, `#141310` dark. **Fix the current `#f8f7f3` while you're in there.**                                                                                                                                                                                                                                                          |
| OG / social cards   | **Light only, always.** Preview surfaces don't know the viewer's theme, and a dark card on a light feed reads as broken. One canonical light treatment.                                                                                                                                                                                                                    |
| Email               | **Light only.** Dark-mode email clients mangle backgrounds unpredictably; design for light and let clients invert. Never ship a dark-background email template.                                                                                                                                                                                                            |
| Maps                | Dark tile style in dark mode. Venue markers switch to `--gold`.                                                                                                                                                                                                                                                                                                            |
| Charts, sparklines  | Stroke reads `--text-1`, fill gradient reads `--gold` at 38%→0. Never hardcode.                                                                                                                                                                                                                                                                                            |
| Splash screen       | Two: `#EFE6D3` with ink ridge (light), `#141310` with gold ridge (dark).                                                                                                                                                                                                                                                                                                   |
| **App icons**       | iOS 18+ supports light, dark, and tinted variants. **Players:** light = ink ridge on sand gradient; dark = sand ridge on `#141310`. **Pro:** light = gold ridge on ink; dark = gold ridge on `#0D1114` with the ridge brightened one step. Ship the tinted (monochrome) variant for both — the ridge mark works as a single-color glyph, which is why it's the right mark. |
| Status bar          | `dark-content` in light theme, `light-content` in dark theme, and it must update on zone change within a screen — a full-dark scoring takeover in light theme still needs a light status bar.                                                                                                                                                                              |

---

## 8. Contrast override — how theming interacts with sunlight

The mobile guide specs a three-state adaptive contrast response for direct beach sun. **That is not a theme.** It is `data-contrast`, applied on top of whichever theme is active.

| `data-contrast`     | Light theme                                                                                    | Dark theme                                                                                                             |
| ------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `ambient` (default) | Full system as specced                                                                         | Full system as specced                                                                                                 |
| `bright`            | Glass → solid, imagery → 15%, `--text-2` promoted to `--text-1`, borders → `--hairline-strong` | Same, plus `--image-veil` to 32%                                                                                       |
| `glare`             | `#FFFFFF` ground, `#000000` text, no imagery, no gradients, type weight +1 step, body min 17px | `#000000` ground, `#FFFFFF` text, same. Pure black is deliberate — OLED pixels off, maximum contrast, minimum battery. |

Pro's **courtside mode** always renders at `glare` regardless of both theme and sensor state. Someone marking attendance in the sun with a clipboard in the other hand does not get an aesthetic experience; they get a legible one.

The relationship in one sentence: **theme is a preference, zone is a meaning, contrast is a condition.** They compose; they never override each other's job.

---

## 9. Implementation

### Web

```css
:root,
[data-theme="light"] [data-zone="editorial"] {
  /* light editorial values */
}
[data-theme="light"] [data-zone="performance"] {
  /* ... */
}
[data-theme="dark"] [data-zone="editorial"] {
  /* ... */
}
[data-theme="dark"] [data-zone="performance"] {
  /* ... */
}

/* zone defaults to editorial when unset */
[data-theme="dark"] {
  color-scheme: dark;
}
```

Set `color-scheme` so native form controls, scrollbars, and the `::selection` default follow. Set the theme attribute in a blocking inline script in `<head>` before first paint — a flash of the wrong theme is the most visible bug in any theming system.

Transitions: `background-color, border-color, color` at **220ms** on theme change only. Add a `data-theme-switching` class for the duration so the transition doesn't fire on every navigation.

### React Native / Expo

```
ThemeProvider
  ├─ theme:    'light' | 'dark'        ← useColorScheme() + persisted override
  ├─ contrast: 'ambient' | 'bright' | 'glare'  ← brightness/light sensor + manual
  └─ ZoneProvider
       └─ zone: 'editorial' | 'performance'    ← set per screen
```

`useTokens()` resolves theme × zone × contrast into a flat object. Screens declare their zone once at the top; nested components never think about it. The scoring screen sets `zone="performance"` and everything inside it — chips, hairlines, the Strand, the status bar — follows automatically.

Ship the token resolution as a pure function with snapshot tests, so a wrong value fails CI rather than shipping.

---

## 10. Test checklist

Run all of these in **light editorial, light performance, dark editorial, dark performance**, and in bright and glare on mobile.

- [ ] No pale bar under any hero image (the `--dissolve` bug)
- [ ] No pure white text on dark, no pure black text on dark grounds
- [ ] Every flare-colored _word_ uses `--flare-text`, not `--flare`
- [ ] `--signal` never used as text
- [ ] ▲ / ▼ present on every gain/loss value
- [ ] Partner logos legible and not recolored in violation of guidelines
- [ ] Event artwork contained, veiled, captioned
- [ ] Empty states legible — `--text-3` is the token most likely to fail contrast
- [ ] Live scoreboard readable at arm's length outdoors
- [ ] Status bar contrast correct during a zone change _within_ a screen
- [ ] No theme flash on cold load, web or native
- [ ] Charts and sparklines re-theme
- [ ] Dynamic Type at 200% in both themes
- [ ] Screenshots of the same screen in all four contexts sit side by side and read as the same product

---

## 11. Migration from the current implementation

The existing site declares `color-scheme: light dark` and ships a theme, but it can't express zoning because theme and meaning are tangled in the same values. Three steps:

1. **Audit and extract.** Grep for hex values in component files. Every one is either a token or a bug. Expect the fog dissolve, the ink footer, and the marine block to be hardcoded.
2. **Introduce `data-zone` before touching dark mode.** Ship light-mode zoning first and confirm the product still reads correctly. Zoning is the load-bearing idea; dark mode is a skin on top of it.
3. **Then swap the pair.** With zones in place, adding dark mode is a values change, not a structural one.

Doing it in the other order — dark mode first, zoning after — is how you end up with a product where a live match looks like a settings page.
