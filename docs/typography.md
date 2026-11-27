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
