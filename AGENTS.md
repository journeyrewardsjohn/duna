# Duna product and design contract

This file applies to the entire Duna monorepo. Product behavior, accessibility,
safety, and data truth always take precedence over visual novelty.

> **Override, 27 November 2026.** The Duna Design System (Tideline 4.1.1,
> the owner's Brand Book 2.0) is the design contract for every surface:
> [`docs/design/tideline-4.1.1/README.md`](docs/design/tideline-4.1.1/README.md).
> It overrides every older design document and every earlier visual rule in
> this file's history (Satoshi, DM Mono, flare orange, `--hq-*`, the sand
> world, the glass dock). The redesign programme, its ownership and its agent
> rules are in [`docs/plan/README.md`](docs/plan/README.md). Nothing in the
> redesign relaxes the safety, privacy, money, health-data, messaging-consent
> or confirmation rules below.

## Earlier dated directions

The November 2 public website, October 4 Player, October 4 public website and
October 4 HQ directions (`docs/design/duna-public-audiences-20261102.md`,
`duna-player-focus-20261004.md`, `duna-public-website-20261004.md`,
`duna-hq-focus-20261004.md`) and the older design references
(`duna-font-usage-guide.md`, `duna-design-system*.md`, `duna-mobile-*.md`,
`duna-theming-light-dark.md`, `duna-implementation-audit.md`,
`duna-hq-component-system.md`) are superseded by Tideline 4.1.1 and carry a
banner saying so. Their product behaviour still holds where the contract does
not change it: `/` leads with Clubs and `/players` is the player landing page
with a visible For Clubs / For Players selector; Player Home is task-first with
a personal Next up; HQ is calm and AI-first with roles and accessibility intact.

## The Duna Design System (Tideline 4.1.1)

Read the contract before changing any user-facing surface. Its rules R1–R22
are checkable; the essentials:

- **Type.** Jost Medium 500 (tracking −0.015em) for marketing headlines and
  one title per screen, never below 22px and never on a numeral; club
  monograms are set in Jost. Geist for every other word; numbers, times,
  scores and ratings are Geist 600 with tabular figures; Geist Mono for codes,
  small uppercase labels and NetScore numerals. No serif anywhere. Satoshi,
  Fellix, Archivo and DM Mono are legacy faces that remain only until each
  surface migrates; never add new uses. Generic `sans-serif` is a failure
  fallback only. Never synthesize a font weight. Tracking follows the tokens
  and is never tighter than `-0.030em` outside Tideline's published display
  styles. Club-configured fonts stay inside the club's own content and never
  replace Duna chrome.
- **Colour.** Night Court `#0E1A22` is ink, actions and the dark ground; Salt
  `#F4F2EC` is the ground on player surfaces (cards stay white); Dune
  `#D9C3A0` is the warm signal; Hardwood `#B5814F` is golden hour; Solar
  `#F2542D` is for live states only (the rating ring's goal tick is the one
  named exception, pending owner confirmation). Orange (flare, sunburst, the
  old sun ramp) is retired and is never a CTA, scarcity or brand colour.
- **HQ** sits on white / cool neutral (`data-zone="hq"`), never Salt, Dune or
  any sand tone, with a white sidebar and a hairline divider. HQ uses the
  shared Tideline roles; `--hq-*` variables are legacy aliases that F2b points
  at Tideline and wave 5 deletes. Navigation follows
  `docs/design/tideline-4.1.1/ia-hq.md` with no "More tools".
- **Logo.** The Crest mark, micro mark and drawn wordmark from
  `docs/design/tideline-4.1.1/assets/`, through `DunaMark` and `DunaLogo`;
  `Crest` remains the club crest. A brand mark is never larger than 24px
  inside a control.
- **Icons** are on a 24 grid with a 1.75 stroke and square ends: 14px in chips
  and dense rows, 16 inline, 20 in buttons, rows and inputs, 24 in navigation.
  Chips always contain their content with padding (test "10:30 PM").
- **Motion** uses Rise, Rally and Cross. Nothing bounces, springs or scales on
  hover; entrances play once; only loaders and the live indicator loop.
- **No ornament.** No decorative illustration marks and no left-edge colour
  stripes as status indicators; use a small icon with a word.
- **Club identity.** A club's own logo on the colour it chooses, a full-bleed
  tile it uploads, or a two-character monogram; no white border; pending
  states never desaturate a club's brand. Brand owns the fill; Duna owns the
  frame: partner assets are never recoloured outside their approved usage.
- **Maps** (Mapbox): street map to zoom 16, satellite for the last three zoom
  levels, a single icon button for the look, zoom-ladder pins (inverted means
  "yours", Solar only on a live pin), attribution always visible.
- **Navigation.** Player (web and native) uses Find / Play / Improve /
  Connect; Pro keeps coach tabs. Native apps use the system tab bar (it
  becomes the iPhone Duo's vertical bar and the iPad sidebar). No function
  exists on only one size; surfaces may. Sign-in, sign-up, the organisation
  switcher (with "Create new organisation") and the personal account stay in
  every shell and are restyled, never removed.
- **Score cards** have a hairline net, per-set scores, a green check for the
  winner (a trophy only for a title match) and one designed state for every
  `match_status` value.
- **Watch.** The shipped Apple Watch interaction (swipe up / down for a point,
  left to undo, right to favourite) never changes; restyle only.
- **Mobile.** Latest stable Expo (SDK 58 at the time of writing), minimum iOS
  26, layouts by width class (compact / regular / expanded) with fully
  designed iPhone Duo open and half-open layouts and iPad layouts; see
  `docs/design/tideline-4.1.1/adaptive.md`.

## Honesty, flags and confirmation

- Never invent customers, quotes, claims, prices or policies; use real data or
  a visible placeholder such as `[club policy]`.
- A person confirms every send, payment, publish and destructive change. AI
  may read and propose; it never acts without that confirmation.
- Owner decision 2026-11-27: features ship switched on. Feature flags default
  on and are kill switches, not gates. A feature that depends on an outside
  provider shows an honest "not configured yet" state until production
  credentials exist; agents never invent, request in chat or enter
  credentials, and list what production needs in their PR (see
  `docs/plan/production-readiness.md`). Which Stripe mode runs is decided by
  the environment's keys, which the owner controls.
- Product copy never names infrastructure vendors: say "Duna Hosting" and
  "Duna Database", never Vercel or Neon. "Stripe" appears only where Duna Pay
  explains verification. Required attributions (Mapbox, weather credit) stay.

## Shared implementation rules

- Build shared primitives and semantic tokens in `packages/ui` before adding a
  local variant. Raw hex values in product components are defects unless the
  value belongs to a third-party asset that cannot use Duna tokens. Token
  names keep their roles; values come from
  `docs/design/tideline-4.1.1/tokens.json`.
- Web surfaces declare a semantic zone (`data-zone="editorial"`, `"athletic"`,
  `"live"` or `"hq"`). Native screens declare the equivalent zone through the
  shared token resolver. Never use the retired `performance` zone. Live means
  play is in progress; a user-selected dark theme is a preference and does not
  change a surface's semantic zone.
- Every theme supports Light, Dark, and Match device. Never hardcode a fade:
  it must resolve to the active zone ground.
- Club Theme Kits accept one submitted color, normalize it in OKLCH, and limit
  it to the documented identity slots. Competition surfaces remain neutral.
- Players control expressive identity but never verified data. Curated accents,
  photos, biographies, highlights, and sponsor marks obey verification and
  moderation gates.
- Use the four chip kinds (status, taxonomy, identity, metric). Do not render
  status, taxonomy, identity, and metrics as undifferentiated badges.
- Do not render misleading empty data such as `0/0`, `0–0`, undifferentiated
  `50% / 50%`, or podium treatment before competition has begun.
- “Sand Rating” is always two words in user-facing copy.
- `pnpm verify:design-system` enforces the contract through per-surface files
  in `scripts/design-contracts/`. A check marked `legacy` pins pre-Tideline
  code and is deleted by the surface's own work package when it migrates; add
  migrated paths to that file's `migrated` list so the Tideline guard protects
  them.

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

## Database routing contract

- Neon production has a read/write primary and a read-only replica. Use
  `DATABASE_URL` for writes, transactions, migrations, locking, and any read
  that must observe a just-completed write. Use `NEON_READ_ONLY_REPLICA` through
  `getReadOnlyDatabase()` for eligible read-only work so public discovery,
  reporting, rankings, dashboards, and other latency-tolerant queries do not
  add avoidable load to the primary.
- A replica can lag the primary. Keep authentication, authorization,
  membership/guardian checks, checkout and payments, capacity/inventory,
  registration and waitlist decisions, live scoring, messaging cursors,
  idempotency, rate limits, and read-after-write flows on the primary.
- Never migrate, seed, repair, or mutate through `NEON_READ_ONLY_REPLICA`.
  `getReadOnlyDatabase()` safely falls back to `DATABASE_URL` when a replica is
  not configured, but connected production must configure both server secrets
  in every Web/HQ runtime that executes eligible reads.
- Direct database access remains server-only and subordinate to typed API,
  tenancy, permission, and audit rules. Moving a query to the replica must not
  weaken any of those controls.

## Homepage creative direction

- `/` is the club landing page. `/players` is the player landing page.
- Public navigation offers a persistent For Clubs / For Players selector with
  route-based active state, and audience-specific desktop navigation.
- Use a simple editorial hero, restrained existing imagery, clear feature
  summaries, grouped access to the full platform, FAQs, and a relevant action.
- Use the Duna Design System palette and type (Jost headlines, Geist text).
  All content and links work without animation; do not restore the legacy
  ticker or sand world.
- Club features and pricing remain at their existing `/run-your-club` URLs.
- Reference sites may inform hierarchy and pacing; do not copy their assets,
  copy, brand names, product claims, or customer proof.

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

## Player experience contract

- Center Player web content within a consistent 96rem outer cap and a 90rem
  content rhythm. At larger resolutions, add breathing room rather than
  stretching cards, forms, or copy across the viewport.
- The Player home is a utility surface, not a campaign page. It opens with a
  concise personal greeting and four direct actions; never restore a decorative
  photo hero above those actions.
- “Next Up” means the signed-in player’s next future booking or hosted session.
  Filter expired records in the client-facing layer even when the repository is
  expected to do so, and place this personal commitment ahead of discovery on
  both web and native.
- Consumer event cards use approved event photography from the event media
  library or explicit organizer media. Do not restore synthetic court-art
  placeholders when a real poster is available.
- Public event pages keep one centered editorial stage and one readable sticky
  registration rail. All supporting copy is at least 13px; body copy is at
  least 15px. Ultra-wide screens preserve the cap instead of creating empty
  full-width planes.
- Pickup creation and editing are guided host workflows: group name, time,
  place, access, and review into explicit steps; show a live player preview,
  future-time validation, location confidence, and the participant lock rule.
  Never place a public site header inside the authenticated Player shell.

## Public knowledge, SEO, AEO, and agent access

- Every indexable public route in the sitemap must have one canonical HTML URL
  and a deterministic Markdown companion. Append `.md` to the pathname; use
  `/index.md` for the homepage. The Markdown response is a representation, not
  a competing canonical page, and must link back to Duna for live state,
  registration, booking, tickets, purchases, and checkout.
- `/agents` is Markdown-only and is the authoritative machine navigation and
  interpretation guide. `/sitemap.md` pairs the XML sitemap with all Markdown
  representations. `llms.txt` stays compact and points to both.
- Event, player, match, and professional-team templates must emit one coherent
  JSON-LD graph with stable entity IDs, canonical URLs, breadcrumbs, verified
  identity links, dates, timezone-aware location data, and Markdown encoding.
  Do not create structured data for facts that are absent from the visible
  public page, and never promise a search feature or ranking.
- Public event pages use a sticky, horizontally scrollable section index with
  active-section state. Every target uses a stable fragment ID and at least
  80px scroll clearance. The index reflects only sections actually rendered.
- The public MCP Streamable HTTP endpoint supports the current stable protocol
  plus an explicit migration window for the previous stable version. Public
  tools and resources return structured data, canonical URLs, Markdown URLs,
  provenance, and explicit pending states. Mutations remain authenticated,
  role-gated, and audited.
- Missing public data is unverified, not zero and not permission to infer.
  Broadcasts, venues, player mappings, results, rankings, prices, spots, and
  availability must preserve this distinction.

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
  and the native bright/glare conditions relevant to the change. Native work
  also verifies iPhone Duo (closed, half-open, open) and iPad full and split
  windows.
- Run formatting, readable-type, lint, type, unit, build, mobile export, and
  Playwright checks in proportion to the touched surfaces. The repository-wide
  release gate remains `pnpm verify`; in CI, `release-gate` aggregates the
  parallel `static-checks`, `unit-tests` and `build-and-e2e` jobs, and
  `mobile-bundles` always reports.
- A successful build is not a successful release. Verify web, HQ, Player iOS,
  Player Android, Pro iOS, and Pro Android independently, and name any external
  credential, store, provider, or account-owner gate that remains.
- Do not claim an award, production launch, app-store publication, partner
  approval, or generated-asset permission that has not actually happened.
