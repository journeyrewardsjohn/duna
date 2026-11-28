# Duna typography

The Duna Design System (Tideline 4.1.1) owns typography; the full rules are in
[`design/tideline-4.1.1/README.md`](design/tideline-4.1.1/README.md) (rule R2)
and [`design/tideline-4.1.1/brand-book.md`](design/tideline-4.1.1/brand-book.md).

- **Jost Medium 500**, tracking −0.015em: marketing headlines and one title per
  screen. Never below 22px, never on a numeral. Club monograms are set in Jost.
- **Geist** for every other word: body, controls, labels, metadata. Numbers,
  times, scores and ratings are Geist 600 with `font-variant-numeric:
tabular-nums`.
- **Geist Mono** for codes, small uppercase labels and NetScore numerals.
- No serif anywhere. Satoshi, Fellix, Archivo and DM Mono are legacy faces
  that remain only until each surface migrates; do not add new uses.
- Product text must never render below 12px (0.75rem). Treat 12px as compact
  metadata only; use at least 14px for controls and form labels and 16px for
  reading copy and input text. Run `pnpm verify:readable-type` before shipping
  typography changes.
- Web and HQ load Jost, Geist and Geist Mono through the shared font module
  (`next/font/google`, work package F3); Player and Pro bundle the static faces
  through Expo Font for reliable offline use. Record font licences in
  `docs/licenses/`.

## How it is wired (F3)

- **Module.** Each web app loads the three families in its own
  `app/fonts.ts` (`apps/web/app/fonts.ts`, `apps/hq/app/fonts.ts`; identical
  files, because `next/font` must be called inside the app that ships the
  font). It uses `next/font/google` (Next.js 16, no new dependency): Jost
  weight 500 only, Geist as a variable font, Geist Mono as a variable font,
  all `display: "swap"`, subset `latin`. Jost and Geist are preloaded; Geist
  Mono is not (numerals in data and scores are not first paint).
- **Variables.** The module sets one variable per loaded face on `<html>`
  through `dunaFontClassName`, which each root layout adds to the `<html>`
  element: `--duna-font-brand` (Jost), `--duna-font-ui` (Geist) and
  `--duna-font-mono` (Geist Mono). The Tideline font-family tokens read them,
  with the contract's stack as the fallback: `--td-font-brand`,
  `--td-font-ui` (and `--td-font-display`, `--td-font-numeric`) and
  `--td-font-mono` resolve to the loaded faces at `:root`
  (`tokens.root.css`) and in every nested `.td` scope (`tokens.css`), so a
  dark, live or HQ scope never swaps a loaded face for a family name
  `next/font` does not serve. The legacy `--font-*` names (`--font-display`,
  `--font-body`, `--font-data` and the public `--public-font`,
  `--duna-web-font-mono`) point at the tokens until each surface migrates.
  Never name Jost, Geist or Geist Mono directly in a `font-family`, and never
  read `--duna-font-*` directly: use the `--td-font-*` tokens.
- **Title role.** Use `font-family: var(--td-font-brand); font-weight: 500;
letter-spacing: -0.015em` for a marketing headline or the ONE title of a
  screen, at 22px or larger. Never put it on a control, a label, a table cell
  or a numeral, and never below 22px.
- **Numerals rule.** Numbers, times, scores, ratings and money are
  `var(--td-font-ui)` at weight 600 with `font-variant-numeric: tabular-nums`.
  Only NetScore numerals and codes use `var(--td-font-mono)`. A numeral is
  never set in Jost, even inside a Jost title.
- **Marks.** Logo components live in `packages/ui/src/brand/` (`DunaMark`,
  `DunaLogo`) and draw the Crest and the wordmark as SVG, never as text.
