# Duna typography

- Satoshi is Duna's core typeface for display headings, body copy, controls,
  labels, metadata, numeric data, and native app text.
- Use 300 for editorial display phrases, 400/500 for reading and controls, 700
  for actions and section headings, and 900 for compact metrics or emphatic
  moments. Numeric UI uses `font-variant-numeric: tabular-nums` when values
  update or align.
- Product text must never render below 12px (0.75rem). Treat 12px as compact
  metadata only; use at least 14px for controls and form labels and 16px for
  reading copy and input text. Run `pnpm verify:readable-type` before shipping
  typography changes.
- Web and HQ load Satoshi from the official Fontshare API. Player and Pro bundle
  the official static faces through Expo Font for reliable offline use. Do not
  redistribute the webfont files outside the Duna build pipeline.
