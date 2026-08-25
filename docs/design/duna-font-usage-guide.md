# Duna Font Usage Guide

**Status:** authoritative for every Duna surface. This guide supersedes earlier
Fellix/Archivo font rules in the design-system, mobile guidance, and audits.
**Scope:** public web, Player web, Duna HQ, Super Admin, Player, Pro, Watch,
Live Activities, transactional UI, and product media.

## Primary-family system

Duna uses **Satoshi** for every product word and number. The family is the
single source of typographic character across product surfaces; hierarchy comes
from its weight, size, spacing, and numeric treatment. The only public-web
exception is **DM Mono** for short uppercase eyebrows, timestamps, live/data
labels, and tickers defined by `duna-design-system-v4.md`. DM Mono is an accent,
not a product or reading face, and is not used in HQ or native applications.

| Weight | Role                                                  |
| ------ | ----------------------------------------------------- |
| 300    | Editorial display phrases and generous ledes only     |
| 400    | Reading copy, descriptions, and table text            |
| 500    | Controls, labels, navigation, and secondary hierarchy |
| 700    | Buttons, card titles, section headings, and live data |
| 900    | Large metrics and emphatic athletic moments           |

Use `font-variant-numeric: tabular-nums` for values that update or align in a
column. Proportional figures are reserved for static, oversized monuments.
Generic `sans-serif` is failure fallback only; a club-configured typeface is
tenant content and must not replace Duna chrome.

```css
:root {
  --font-display: "Satoshi", "Helvetica Neue", Arial, sans-serif;
  --font-body: var(--font-display);
  --font-data: var(--font-display);
  --font-mono: var(--font-display);
  font-synthesis: none;
}

.duna-numeric {
  font-family: var(--font-data);
  font-variant-numeric: tabular-nums;
}
```

The public website exposes the exception as `--duna-web-font-mono`; shared
product tokens deliberately continue to resolve to Satoshi.

## Accessibility and scale

- Product text never renders below **12px (0.75rem)**. That floor is for dense
  metadata only.
- Controls and form labels are at least 14px; reading copy and inputs are at
  least 16px.
- Native body copy is at least 15pt, native inputs at least 16pt, and touch
  targets are at least 48pt.
- Support Dynamic Type to 200%. Verify scoreboards, schedules, Watch, and Live
  Activities at the largest supported setting.
- Do not synthesize a font weight or style. Tracking never goes tighter than
  `-0.030em`; compensate display tracking with positive word spacing.

## Delivery

- Web and HQ load the official variable normal and italic Satoshi faces through
  the Fontshare API in their root layouts. Web also loads DM Mono from Google
  Fonts for the restricted public-editorial role. Do not copy webfont files
  into `public/`, Vercel, Cloudflare, or another CDN.
- Player and Pro bundle the official static Light, Regular, Medium, Bold, and
  Black faces via Expo Font. This maps native weights consistently and keeps
  type available offline.
- Preserve the Fontshare license with the source package. Do not redistribute
  Satoshi files outside the Duna build pipeline.

## Definition of done

- [ ] Web and HQ load Satoshi from Fontshare; their computed typography uses
      the shared Satoshi tokens.
- [ ] Player and Pro bundle and load all five Satoshi static faces.
- [ ] Numeric UI uses tabular figures where values change or align.
- [ ] `pnpm verify:readable-type`, lint, type checks, web/HQ builds, and native
      exports pass for changed surfaces.
- [ ] Verify desktop, 390px mobile, reduced motion, bright/glare, and native
      Dynamic Type layouts before release.
