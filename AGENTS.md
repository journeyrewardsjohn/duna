# Duna product and design contract

This file applies to the entire Duna monorepo. Product behavior, accessibility,
and data truth always take precedence over visual novelty.

## Required design references

Read the relevant reference before changing any user-facing surface:

1. [`docs/design/duna-font-usage-guide.md`](docs/design/duna-font-usage-guide.md)
   is the authoritative typography contract for every surface. It supersedes
   all font guidance in the design-system, mobile, theming, and audit files.
2. [`docs/design/duna-design-system-v3.md`](docs/design/duna-design-system-v3.md)
   is the current source of truth for ground inversion, athletic composition,
   typography, club color, player identity, and page-level direction. It
   supersedes only the zoning rule in v2; its typography guidance applies only
   where the font usage guide does not amend it.
3. [`docs/design/duna-implementation-audit.md`](docs/design/duna-implementation-audit.md)
   is the verified correction ledger. Treat an item as closed only when source,
   computed styles, responsive layout, and live behavior agree.
4. [`docs/design/duna-design-system.md`](docs/design/duna-design-system.md)
   remains the source for brand, imagery, motion, voice, and co-branding where
   v3 does not amend it.
5. [`docs/design/duna-mobile-design-guide.md`](docs/design/duna-mobile-design-guide.md)
   extends the system for Duna Players and Duna Pro. It owns mobile navigation,
   adaptive contrast, sunlight behavior, touch targets, offline states, the
   Strand, and the Watch.
6. [`docs/design/duna-theming-light-dark.md`](docs/design/duna-theming-light-dark.md)
   owns theme architecture. Theme is a preference, zone is meaning, and
   contrast is an environmental condition.

When the documents appear to conflict, preserve these invariants:

- Light is the default ground for editorial, athletic, browsing, ranking,
  pre-match, post-match, HQ, and Super Admin surfaces.
- Dark means a ball is in the air right now. Only live matches, live scoring,
  and courtside mode use the live zone. A user-selected dark theme remains a
  preference and does not change a surface's semantic zone.
- Athletic energy comes from ghost type, blocked numerals, a single accent,
  density contrast, and one plane break—not a dark background.
- Energy belongs in athletes and meaningful data, not decorative chrome.
- Flare is reserved for live, scarce, changing, or exception states. It is not
  a general CTA or brand color.
- Brand owns the fill; Duna owns the frame. Partner assets stay inside a Duna
  container and must never be recolored outside their approved usage.

## Shared implementation rules

- Build shared primitives and semantic tokens in `packages/ui` before adding a
  local variant. Raw hex values in product components are defects unless the
  value belongs to a third-party asset that cannot use Duna tokens.
- Web surfaces declare `data-zone="editorial"`, `data-zone="athletic"`, or
  `data-zone="live"`. Native screens declare the equivalent zone through the
  shared token resolver. Never use the retired `performance` zone.
- Every theme supports Light, Dark, and Match device. Never hardcode a fog
  dissolve: it must resolve to the active zone ground.
- Duna ships exactly two brand typefaces. Use Fellix for every word, including
  editorial, athletic, operator, and app display; use Archivo for every
  meaningful numeral and the Duna wordmark. No serif, optional monument face,
  or third brand family may enter a product bundle. Generic `sans-serif` is a
  failure fallback only. Club-configured theme fonts remain contained tenant
  content and never replace Duna chrome.
- Never synthesize a font weight. Tracking follows the v3 size curve and is
  never tighter than `-0.030em`; display word spacing compensates negative
  tracking.
- HQ uses `--hq-*` only. Club Theme Kits accept one submitted color, normalize
  it in OKLCH, and limit it to the five documented identity slots. Competition
  surfaces remain neutral.
- Players control expressive identity but never verified data. Curated accents,
  photos, biographies, highlights, and sponsor marks obey verification and
  moderation gates.
- Meaningful numbers use the six Archivo tiers from the font guide. Score,
  Hero, Block, Table, and Chip use tabular figures; Monument is deliberately
  proportional. Use `font-variation-settings`, never `font-stretch`. Fellix is
  the only family for words across web, HQ, Super Admin, and both native apps.
- Use the four chip classes from the design system. Do not render status,
  taxonomy, identity, and metrics as undifferentiated badges.
- Do not render misleading empty data such as `0/0`, `0–0`, undifferentiated
  `50% / 50%`, or podium treatment before competition has begun.
- “Sand Rating” is always two words in user-facing copy.

## Interaction and accessibility

- Design for the actual setting: beach sun, one sandy hand, intermittent
  connectivity, Dynamic Type at 200%, keyboard/switch access, and reduced
  motion.
- Touch targets are at least 48pt; primary mobile actions are at least 56pt.
- Motion must encode hierarchy or state. Editorial surfaces get at most one
  ambient motion per viewport; athletic surfaces may move more, but only in
  response to meaningful data.
- Never make essential content depend on parallax, blur, hover, autoplay, or
  motion. Reduced-motion and data-saving fallbacks are part of the component.
- Prefer opacity and translate transitions. Never use decorative bounce, glow,
  or scale-on-hover.
- Charts must explain change, expose an accessible summary, respect reduced
  motion, and remain legible without color.

## Homepage creative direction

- The homepage opens on a nearly white editorial ground. Its signature is one
  persistent, scroll-driven procedural sand world that moves through the Play,
  Compete, and Operate value chapters; do not replace it with a card hero,
  generic stock loop, or a collection of competing ambient effects.
- The sand canvas is progressive enhancement. All copy, links, proof, and
  chapter order remain complete when WebGL is unavailable, reduced motion is
  requested, or data saving is enabled. In those states, render a composed
  static sand frame instead of removing the atmosphere. Software-rendered
  WebGL must also use the low-resolution static path so motion never blocks
  navigation or theme controls on constrained devices.
- After the opening world, return to crisp `--surface-1` sections with measured
  editorial type and one purposeful plane break. Dark ground is reserved for
  the live Apple Watch / match-control chapter.
- Reference sites may inform pacing and spatial behavior, never assets,
  geometry, shaders, copy, or brand motifs. Duna's motion subject is wind-shaped
  sand, court lines, and the connected game.

## Imagery and generated media

- Follow the image manifest and seed/licensing rules in the design system.
- Generated people must be non-identifiable unless the person has approved a
  likeness workflow. Never synthesize a recognizable real athlete without
  written permission.
- Every web hero image dissolves into its semantic ground. Native apps use
  photography only in the five approved slots in the mobile guide.
- Record provenance, model, prompt intent, source references, permissions, and
  output names for every generated asset in
  `apps/web/public/media/brand/imagery-log.json`.
- Do not generate replacement partner logos, tour marks, or official event art.

## Surface ownership

- `apps/web`: public editorial pages, player web experience, Pro tour, events,
  rankings, live/match views, discovery, checkout, and account settings.
- `apps/hq`: operator workspace and Super Admin. Dense operational UI remains
  calm, legible, and default-deny; mobile HQ work is handled by Duna Pro.
- `apps/player`: planning, discovery, scoring, rating, Tour, Health, Vision,
  Live Activities, and Watch scoring.
- `apps/pro`: on-the-go operator work, the Watch, people, money, inbox,
  courtside operations, payments, and Live Activities.
- `packages/ui`: the one source for visual tokens, brand marks, theme/zone
  semantics, and reusable presentation primitives.

## Definition of done for user-facing work

- Verify the changed experience in light editorial, light athletic, live,
  explicit dark preference, and bright/glare contexts.
- Verify desktop, tablet, 390px mobile, reduced motion, keyboard navigation,
  and the native bright/glare conditions relevant to the change.
- Run formatting, readable-type, lint, type, unit, build, mobile export, and
  Playwright checks in proportion to the touched surfaces. The repository-wide
  release gate remains `pnpm verify`.
- A successful build is not a successful release. Verify web, HQ, Player iOS,
  Player Android, Pro iOS, and Pro Android independently, and name any external
  credential, store, provider, or account-owner gate that remains.
- Do not claim an award, production launch, app-store publication, partner
  approval, or generated-asset permission that has not actually happened.
