# Duna product and design contract

This file applies to the entire Duna monorepo. Product behavior, accessibility,
and data truth always take precedence over visual novelty.

## Required design references

Read the relevant reference before changing any user-facing surface:

1. [`docs/design/duna-design-system.md`](docs/design/duna-design-system.md) is
   the source of truth for brand, web, imagery, motion, voice, co-branding, and
   page-level direction.
2. [`docs/design/duna-mobile-design-guide.md`](docs/design/duna-mobile-design-guide.md)
   extends the system for Duna Players and Duna Pro. It owns mobile navigation,
   adaptive contrast, sunlight behavior, touch targets, offline states, the
   Strand, and the Watch.
3. [`docs/design/duna-theming-light-dark.md`](docs/design/duna-theming-light-dark.md)
   owns theme architecture. Theme is a preference, zone is meaning, and
   contrast is an environmental condition.

When the documents appear to conflict, preserve these invariants:

- Editorial is always warmer and lighter than performance.
- Light means “read”; cool dark means “live, compete, or operate.”
- Energy belongs in athletes and meaningful data, not decorative chrome.
- Flare is reserved for live, scarce, changing, or exception states. It is not
  a general CTA or brand color.
- Brand owns the fill; Duna owns the frame. Partner assets stay inside a Duna
  container and must never be recolored outside their approved usage.

## Shared implementation rules

- Build shared primitives and semantic tokens in `packages/ui` before adding a
  local variant. Raw hex values in product components are defects unless the
  value belongs to a third-party asset that cannot use Duna tokens.
- Web surfaces declare `data-zone="editorial"` or `data-zone="performance"`.
  Native screens declare the equivalent zone through the shared token resolver.
- Every theme supports Light, Dark, and Match device. Never hardcode a fog
  dissolve: it must resolve to the active zone ground.
- Use Fellix for product text, controls, labels, and names; Instrument Serif for
  editorial display moments; and Archivo with tabular numerals for meaningful
  data. Awesome Serif is an optional licensed display upgrade only when the
  applicable web/app embedding rights are documented.
- Meaningful numbers use Archivo and tabular numerals. Serif never appears in
  buttons, tables, small labels, or native UI below 24pt.
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
  ambient motion per viewport; performance surfaces may move more, but only in
  response to meaningful data.
- Never make essential content depend on parallax, blur, hover, autoplay, or
  motion. Reduced-motion and data-saving fallbacks are part of the component.
- Prefer opacity and translate transitions. Never use decorative bounce, glow,
  or scale-on-hover.
- Charts must explain change, expose an accessible summary, respect reduced
  motion, and remain legible without color.

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

- Verify the changed experience in light editorial, light performance, dark
  editorial, and dark performance contexts.
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
