## Duna web, HQ and backend implementation plan for Tideline 4.1.1 / Brand Book 2.0

I read `origin/main` at 1613bba and the `tideline-ui-sdk-20261125` branch. I changed nothing.

### 1. Ground truth

**Styles today**

- **HQ** loads nine global stylesheets in `apps/hq/app/layout.tsx`:
  - `@duna/ui/styles.css` (3,053 lines) and `mapbox-gl.css`
  - `globals.css` (41,810), `design-v3.css` (10,951), `training.css` (7,467), `work-focus.css` (1,395), `ask-duna.css` (1,387) and `forms.css` (761)
  - `@duna/ui/hq-workspace.css` (385)
  - All of them are unlayered, so the cascade is decided by import order. Four CSS modules sit on top (`messages`, `website`, `activities`, `admin`).
- **Web** loads ten global sheets in `apps/web/app/layout.tsx`:
  - `globals.css` (44,127), `design-v3` (5,712), `design-v4` (1,516), `public-website` (533) and `player-focus` (393)
  - the `@duna/ui` public and player sheets, plus `flag-icons` and `mapbox-gl.css`
  - about 25 CSS modules on top.
- **Fonts:** both apps load Satoshi from the fontshare CDN; Web also loads DM Mono from Google.
- **Hex values and icons:** there are hundreds of raw hex values (`packages/ui` about 400, Web about 1,400). `lucide-react` is imported in 109 HQ files and 122 Web files.
- **`packages/ui`:**
  - `tokens.ts` holds the legacy palette, including `flare #E8683A`, the orange being retired. `mobile.ts` is shared with the Expo apps.
  - `web.tsx` holds the current `DunaMark`, used in 19 files.
  - Other shared parts: `duna-action-center.tsx`, date pickers and `form-controls.tsx`.
- **Rules that will fight the rebrand:**
  - `AGENTS.md` still makes Satoshi and `--hq-*` mandatory.
  - `scripts/verify-design-system.ts` (961 lines) runs in `pnpm verify` and fails the build unless the font guide says "Duna uses **Satoshi**…". It also checks literal strings in HQ, Web, Player and mobile source files.
- **Backend monoliths:** `packages/api/src/router.ts` (16,131 lines; `operatorRouter` is inline from line 8275), `contracts.ts` (7,364), `operator-service.ts` (7,731), `training-service.ts` (6,112), `packages/db/src/schema.ts` (12,952) and `apps/hq/app/actions.ts` (3,296).
  - There is a precedent for splitting them: `schema.ts:12851` has `export * from "./website-schema"`, and `messagingRouter` lives in its own file.
- **Generated knowledge file:** `scripts/generate-duna-feature-knowledge.ts` fingerprints `router.ts`, `docs/BUILD_MATRIX.md` and `docs/surfaces/*`. Since GEN-1 the output is not committed: it is generated on install and before build, typecheck, lint, test and dev, so PRs never conflict on it.

**What the Tideline branch contains (8 commits on top of 1613bba, 67 files, about 19.4k lines)**

- Location: `packages/ui/src/tideline/` with about 40 files.
- **Tokens:** `tokens.json` is the published Tideline **3.1** file (not 4.1.1), generated into `tokens.css`/`tokens.ts` by `scripts/build-tideline-tokens.ts`.
- **Stylesheet:** one 4,256-line `tideline.css` in `@layer tideline`, scoped under `.td`, plus a `legacy-bridge.css` that uses `revert-layer` to beat the apps' unlayered CSS.
- **Components on UI SDK:** Button, toggles, Segmented, Tabs, Field/Input, Select/Combobox, Dialog/Sheet, Popover/Tooltip/Menu, Toast, Calendar/DatePicker/DateRangePicker/TimePicker, DayStrip/TimeSlotGrid/SlotList, Avatar family, AddPlayers, SearchField, CommandPalette, Card/Chip/Badge/Notice/EmptyState, Stepper, loaders, Progress.
- **Also:** a booking flow (`booking-state.ts`), interaction hooks with tests, a gallery at `apps/hq/app/tideline/**` gated by `TIDELINE_GALLERY=1`, `tests/e2e/tideline-gallery.spec.ts` and the vendored `.agents/skills/ui-sdk`.
- No existing screen uses it yet.

**How far the branch is from the brief**

- **Palette:** the action colour is tide-blue `#1e5aa8` and live is flare orange `#e0602f`. There is no Night Court `#0E1A22`, Salt `#F4F2EC`, Dune, Hardwood or Solar.
- **Name clashes:** `salt-*` is a cool grey ramp and `night-*` is a warm brown ramp. These names collide with the Brand Book's meaning and must be renamed, not just re-valued.
- **Type:** Geist and Geist Mono are already present; Jost is missing.
- **Brand pieces:** no Crest logo, icon family, motion verbs (Rise/Rally/Cross) or 14/16/20/24 icon scale.
- **Components:** none of NetScore, RatingRing, ClubMark, Map, TimeRail, DurationCrests, the conditions set, MembershipCard, Concierge parts, the search set, the HQ shell, ObjectHeader, SubNav or SectionNav exist. DayStrip and the range DatePicker exist but need restyling.
- Its own doc lists DataTable, SideNav, AppHeader and others as "not included yet".

**Merging the branch onto main**

- It is based on 1613bba, which is main today, so it merges cleanly.
- After PRs 288 and 289 land, expect only a one-line conflict in the root `package.json` scripts.
- Drop the unrelated `skills-lock.json` churn (version 1→2 and rehashes of the Higgsfield skills).

**The `minimumReleaseAgeExclude` line**

- pnpm 11.9 defaults `minimum-release-age` to 1,440 minutes (I confirmed `24 * 60` in the pinned pnpm's `dist/pnpm.mjs`). pnpm will not resolve a version published less than 24 hours ago, and with `--frozen-lockfile` it re-checks every lockfile entry against that age.
- The two added lines exempt exactly `@ui-sdk/core@0.1.0-beta.17` and `@ui-sdk/react@0.1.0-beta.17` from that check. Nothing else and no later version is exempted.
- **It can be avoided.** beta.17 was published 2026-11-24 17:15 UTC, more than 72 hours ago. Neither the repo nor the user config raises the age, so the exclusion is now inert.
  - Delete both lines and confirm with `pnpm install --frozen-lockfile` in a clean worktree.
  - The owner then has nothing new to approve.
- Rule going forward: take UI SDK betas only once they are at least 24 hours old, pinned exactly. Do not take beta.19, which was published today and would need the exclusion again.

### 2. CI and release

- **`verify.yml`:**
  - `release-gate` (Node 24.21, 25-minute timeout) runs `knowledge:check`, then `@duna/hq build:agent`, then `pnpm verify`. That chain is format, knowledge, design-system, readable-type, lint, typecheck, unit tests, mobile-runtime, build and Playwright desktop/tablet/phone against both apps in **demo mode**; CI has no `DATABASE_URL`.
  - `mobile-bundles` (Node 22) exports both Expo apps in about 2.5 minutes.
  - Recent PR runs took 13–24 minutes. The last `main` run was **cancelled at the 25-minute timeout**.
  - `cancel-in-progress` is keyed on the ref, so every push to `main` cancels the previous `main` verification.
- **Required checks:** none. `main` has no branch protection and no rulesets, and auto-merge is off. Squash and merge commits are both allowed.
- **Production deploys:** Vercel's Git integration deploys `main` to `suttonx/duna-web` and `suttonx/duna-hq` about 2–3 minutes after a merge, **not gated by CI**. 1613bba went to production while its verify run was still going and later timed out.
- **Migrations:** `apps/hq/vercel.json` runs `pnpm --filter @duna/db migrate` only when `VERCEL_ENV=production`. Web never migrates, so Web can go live before HQ has applied the schema. `packages/db/src/migrate.ts` has custom recovery logic. The latest migration is `0113`, and PR 289 adds `0114`.
- **Previews:** both projects get one per PR. Previews never migrate.
  - I could not see the Vercel environment settings. If Preview `DATABASE_URL` points at `duna-production`, every schema PR's preview will break.
  - Fix: give previews a Neon branch (the Neon–Vercel integration, or a `duna-preview` branch migrated in the preview build).
- **Feature flags:**
  - The `feature_flags` table (global, organization or market scope) and Super Admin editing exist (`packages/api/src/feature-flags.ts`).
  - There is **no runtime evaluator**; nothing in product code reads the flags.
  - Env toggles exist too: `NEXT_PUBLIC_DEMO_MODE`, `DUNA_WALLET_CASH_ENABLED`, `MESSAGING_SSE_ENABLED`, `STRIPE_AUTOMATIC_TAX_ENABLED`.
- **Seed and demo data:**
  - `packages/db/src/seed.ts` (preview only).
  - `packages/core/src/demo.ts` (787 lines) powers the demo adapter used by CI.
  - Services carry their own demo stores (for example `training-service.ts`).
  - The Super Admin "Enable Demo Data" control builds the labelled Beach Elite Academy QA set (`demo-data-service.ts`).
  - Stripe is Beach Elite LLC in **test mode**.
- **PR 288 (draft)** adds:
  - `hq-visual.yml`: label-triggered baselines, not a required check.
  - `scripts/hq-css-ratchet.json`: 64,156 lines of HQ global CSS that may only go down.
  - `css-usage.ts` coverage, `render-for-test.ts` and source-text test conversions.

**Open PRs: what to do with each, in this order**

| PR                                                                                              | Action                                                                                                             | Why                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 286 Player guardrails                                                                           | Merge first                                                                                                        | 3 files, green. It also makes `verify-design-system.ts` locate Player contracts by declaration, which the rewrite in R2 builds on.                                                          |
| 287 Player split                                                                                | Retarget to `main` after 286, rebase, merge (the native planner owns verification)                                 | Touches only `apps/player`, so it doesn't collide with web/HQ. It is stacked on 286.                                                                                                        |
| 289 Booking rules                                                                               | Merge before any web/HQ wave. First rehearse `0114` on a Neon branch, because merging it applies it in production. | It edits `schema.ts`, `router.ts`, `contracts.ts`, `design-v3.css` and `guided-product-builder.tsx`, which are all hot spots. Landing it later forces every domain agent to rebase onto it. |
| Local fix in this worktree (`actions.ts`, `guided-product-builder.tsx`, `lib/catalog-media.ts`) | Rebase onto 289, open a PR, merge                                                                                  | It overlaps 289 in `guided-product-builder.tsx`. It is not pushed yet.                                                                                                                      |
| 288 HQ safety net                                                                               | Finish, un-draft, merge before W1. Keep visual checks non-required.                                                | The ratchet and usage report drive the CSS collapse, and the harness catches regressions on pages not yet migrated. Re-render baselines on purpose after each wave.                         |
| 270 Sand redesign                                                                               | Close                                                                                                              | Conflicting, two months stale, spans `AGENTS.md`, `packages/ui` and every app. Tideline 4.1.1 supersedes it.                                                                                |

### 3. Hot spots: one owner each, and how others request changes

| Hot spot                                                                         | Owner                                                                                            | How everyone else asks for a change                                                                                                                                  |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/db/src/schema.ts`, `drizzle/**` (SQL, `meta/_journal.json`, snapshots) | **Schema steward** (one agent per wave: R3, then W3-0)                                           | Write `docs/plan/schema-requests/<WP>.md`; the steward batches requests into one migration per wave. Domain agents never run `drizzle-kit generate`.                 |
| `router.ts`, `contracts.ts`, `packages/api/src/index.ts`                         | R3, then frozen                                                                                  | Code goes into `packages/api/src/routers/<domain>.ts` and `contracts/<domain>.ts`, which R3 pre-mounts as `operator.<domain>`, `player.<domain>`, `public.<domain>`. |
| `generated/duna-feature-knowledge.ts`                                            | Whoever merges                                                                                   | Not committed any more (GEN-1): generated on demand, nothing to do after a rebase.                                                                                   |
| `pnpm-lock.yaml` and `pnpm-workspace.yaml`                                       | Only F1 (UI SDK), B2 (Stripe Connect JS), B6c (three)                                            | Rerun `pnpm install` after a rebase; one dependency change per PR.                                                                                                   |
| `apps/hq/app/layout.tsx` / `apps/web/app/layout.tsx`                             | F5a / F6a (F3 supplies the font module)                                                          | Request through the owner.                                                                                                                                           |
| `apps/hq/components/navigation.ts`, HQ route tree, `packages/core` HQ route map  | S2                                                                                               | Request through S2.                                                                                                                                                  |
| `tideline/index.ts`, `tideline/styles.css` barrels and the gallery index         | Append-only, one line per family (F1 splits them into this shape)                                | Set `merge=union` in `.gitattributes` for local rebases.                                                                                                             |
| `AGENTS.md`, `docs/design/**`, `scripts/verify-design-system.ts`                 | R2. Each surface's contract file under `scripts/design-contracts/` is owned by that surface's WP | Request through R2.                                                                                                                                                  |
| `packages/ui/src/tokens.ts`, `mobile.ts`                                         | **Native planner**                                                                               | Web/HQ never edit them; F2b aliases web CSS only.                                                                                                                    |
| `tests/e2e/*.spec.ts`                                                            | Each WP owns its own spec files; S2 owns path updates; R4 owns `playwright.config.ts`            | Request through the owner.                                                                                                                                           |

Universal "must not touch" rule: anything outside a WP's **Owns** column. Every new page and procedure must have a **demo-mode branch** (fixtures in `packages/core/src/demo/<domain>.ts`), because CI and e2e run without a database.

### 4. Work packages

> F5 and F6 (the HQ and Web cascade layering and the dead-CSS deletions) are superseded by [`legacy-styles.md`](legacy-styles.md): they are cancelled.

Model column: **Top** = top-tier model, **Fast** = cheaper and faster model. Line counts are approximate changed lines.

**Wave 0: reconcile and lay the rails (mostly serial, 1–2 days)**

| ID  | Goal                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Owns                                                               | Depends | Schema                      | Tests / verify                                      | Risk                                             | Model        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------- | --------------------------- | --------------------------------------------------- | ------------------------------------------------ | ------------ |
| R1  | Land the PR queue above                                                                                                                                                                                                                                                                                                                                                                                                                                 | — (orchestrator)                                                   | —       | 0114 (from 289)             | Green CI; Neon-branch migrate of 0114               | Med                                              | Orchestrator |
| R2  | Put the contract in the repo: `docs/design/tideline-4.1.1/` (tokens.json 4.1.1, brand-book.md, IA map, PNG exports of every canvas, named per WP). Rewrite `AGENTS.md` typography and colour rules (Jost 500 / Geist / Geist Mono, Solar for live only, orange retired). Mark the font guide and v3/v4 docs superseded. Make `verify-design-system.ts` data-driven (`scripts/design-contracts/{hq,web,public}.ts`; the native planner owns player/pro). | those paths                                                        | R1      | —                           | `pnpm verify:design-system`, `knowledge:check`      | High: agents will otherwise "fix" toward Satoshi | Top, ~900    |
| R3  | Seams: `schema/` stubs per domain plus `export *` lines; `routers/`, `contracts/` and `demo/` stubs mounted into the routers; knowledge generator also reads `routers/**`; `flags.ts` typed registry of every planned flag plus `isFeatureEnabled(key, {organizationId})` (primary DB, cached per request, demo returns registry default); central HQ route map in `packages/core/src/hq-routes.ts`                                                     | those paths, plus one-line mounts in `router.ts` and `schema.ts`   | R1      | none, or an empty migration | Unit tests for the flag evaluator; `pnpm typecheck` | Med                                              | Top, ~900    |
| R4  | CI and release rails                                                                                                                                                                                                                                                                                                                                                                                                                                    | `.github/workflows/verify.yml`, `.github/pull_request_template.md` | R1      | —                           | Main run completes; PR wall time under 15 minutes   | Med                                              | Fast, ~200   |

R4 changes, in detail:

- Do not cancel in-progress runs on `main`.
- Raise the timeout to 40 minutes.
- Split into static, unit and build+e2e jobs.
- Add Turbo remote cache.
- Run the mobile export only when needed, using a filter step inside the job so the check name always reports.

Owner actions that agents cannot take (settings, secrets and approvals):

- Branch protection on `main` requiring `release-gate` and `mobile-bundles`, without "require up to date"; a merge queue isn't available on a personal-account repo.
- Vercel "require checks before production promotion".
- A Neon branch for previews.

**Wave 1: foundation (6 in parallel after R2 and R3)**

| ID           | Goal                                                                                                                                                                                                                                                                | Owns                                                                                                                            | Depends   | Tests / verify                                                                                                   | Risk               | Model                |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------- | ------------------ | -------------------- |
| F1           | Land the Tideline branch: delete the two exclusion lines; drop `skills-lock.json`; make `apps/hq/proxy.ts` return a true 404 for `/tideline`; split `tideline.css` into `tideline/<family>/*.css` with an index; make the gallery auto-list `sections/<family>.tsx` | `packages/ui/src/tideline/**`, `apps/hq/app/tideline/**`, `docs/design/tideline-components.md`, lockfile, `pnpm-workspace.yaml` | R1        | `pnpm --filter @duna/ui test`; `TIDELINE_GALLERY=1 playwright tideline-gallery.spec.ts`                          | Med                | Top, ~1,200          |
| F2a          | Tokens 4.1.1: replace `tokens.json`; rename `salt`/`night`; Solar only on `zone=live`; HQ ground white/cool neutral; icon sizes 14/16/20/24; motion Rise/Rally/Cross with reduced-motion fallbacks and no bounce                                                    | `tideline/tokens*`, `scripts/build-tideline-tokens.ts`                                                                          | F1        | `tokens.test.ts` contrast in every theme; `tideline:tokens --check`; gallery screenshots in light, dark and live | Med                | Top, ~800            |
| F2b          | Point the legacy aliases (`--hq-*`, `--duna-*`, flare) at `--td-*` so every old screen recolours immediately                                                                                                                                                        | `packages/ui/src/styles.css`, `hq-workspace.css`, `public-website.css`, `player-workspace.css`                                  | F2a       | `verify:readable-type`; visual diff (expected wholesale)                                                         | Med                | Fast, ~600           |
| F3           | Type and marks: `next/font/google` Jost 500, Geist and Geist Mono module (no new dependency); Crest, micro and wordmark (`DunaMark`/`DunaLogo`) in `packages/ui/src/brand/`; replace the 19 `DunaMark` imports; favicons, apple-icon, OG                            | `packages/ui/src/brand/**`, `web.tsx` mark, `public/` icons, the 19 import sites                                                | F2a       | Jost never on numerals, at least 22px (lint the contract)                                                        | Low                | Fast, ~700           |
| F4           | Icons: `@duna/ui/icons` adapter (24 grid, 1.75 stroke, square ends) plus custom glyphs; a global `.lucide{stroke-width:1.75;stroke-linecap:square;stroke-linejoin:miter}` restyles every existing icon with no sweep; ESLint warns on new `lucide-react` imports    | `packages/ui/src/icons/**`, eslint config                                                                                       | F1        | Snapshot tests                                                                                                   | Low                | Fast, ~500           |
| F5a          | HQ cascade: declare `@layer reset, legacy, tideline, hq`; wrap the six HQ sheets in `@layer legacy`; apply the Tideline scope at `<body>`; remove `legacy-bridge` from HQ; swap fonts                                                                               | `apps/hq/app/layout.tsx`, first and last lines of each HQ sheet                                                                 | F1, F3    | 288 visual suite; `verify:hq-css-ratchet`                                                                        | **High** (cascade) | Top, ~300            |
| F6a          | Same layering for Web                                                                                                                                                                                                                                               | `apps/web/app/layout.tsx`, Web global sheets                                                                                    | F1, F3    | Public and player e2e                                                                                            | High               | Top, ~300            |
| F5b–e, F6b–d | Dead-CSS deletion, one sheet per PR, driven by `css:usage:hq` / runtime coverage                                                                                                                                                                                    | one sheet each                                                                                                                  | F5a / F6a | Ratchet goes down; visual unchanged                                                                              | Low                | Fast, deletion-heavy |

**Wave 2: shell, information architecture and components (about 12 in parallel; S2 merges alone)**

| ID  | Goal                                                                                                                                                                                                       | Owns                                                                                                                                                                                                                                   | Depends | Tests / verify                                                                                                                          | Risk                                                     | Model                                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------- |
| S2  | HQ information architecture and route renames, **no aliases**                                                                                                                                              | `navigation.ts`, `app/[module]`, `module-panels.tsx`, the moved directories, `proxy.ts`, `hq-routes.ts`, HQ path literals in `packages/api/src/{duna-ai,organization-setup,catalog-service}.ts`, `tests/e2e/**` paths, 288 `routes.ts` | F5a     | Every path in `hq-routes` returns 200 in demo mode; grep shows no old paths; Stripe return/refresh URLs and WorkOS redirects still work | **High** (touches everything; merge during an HQ freeze) | Top, ~1,500 (mostly moves)            |
| S1  | HQ shell: white sidebar, 56px logo row, top bar, Ask Duna pill opening a docked panel; replaces `ask-duna-floating*`/`-sidebar`                                                                            | `operator-shell.tsx`, `ask-duna-*.tsx` shell parts, `tideline/app-shell/**`                                                                                                                                                            | S2      | Keyboard and focus trap on the panel; 390px layout                                                                                      | Med                                                      | Top, ~1,200                           |
| S3  | Open-object pattern: ObjectHeader, SubNav, SectionNav and route-group layouts (`/people/[id]/(tabs)`, `/team/[id]/(tabs)`)                                                                                 | `tideline/object/**`, those layout files                                                                                                                                                                                               | S1      | e2e tab routing with deep links                                                                                                         | Med                                                      | Top, ~900                             |
| S4  | One form, two drivers: a zod FormSpec in `<SpecForm>` on UI SDK parts; a `fill_form` agent tool that returns a proposal pre-filling the same form; ProposalCard (before/after) with two confirmation tiers | `tideline/form-spec/**`, `packages/api/src/ask-duna-capabilities.ts`, `apps/hq/agent/tools/{fill_form,propose_change}.ts`                                                                                                              | S1      | Unit tests: spec round-trip; nothing is written without confirmation                                                                    | High                                                     | Top, ~1,300                           |
| C1  | NetScore (one state per `match_status`), RatingRing (two rings)                                                                                                                                            | `tideline/score/**` + gallery section                                                                                                                                                                                                  | F2a     | Unit tests for each state; screen-reader summary                                                                                        | Low                                                      | Fast, ~600                            |
| C2  | ClubMark (logo on its colour or two-letter monogram), MembershipCard/wallet                                                                                                                                | `tideline/identity/**`                                                                                                                                                                                                                 | F2a     | Contrast on club colours (OKLCH)                                                                                                        | Low                                                      | Fast, ~500                            |
| C3  | Map: MapPin, zoom ladder, icon-only look control (standard map to zoom 16, satellite for the last three zooms)                                                                                             | `tideline/map/**`                                                                                                                                                                                                                      | F2a     | e2e with a stubbed token                                                                                                                | Med                                                      | Top, ~800                             |
| C4  | Time: DayStrip restyle, TimeRail, TimeSlots, DurationCrests                                                                                                                                                | `tideline/time/**`                                                                                                                                                                                                                     | F2a     | Keyboard roving                                                                                                                         | Low                                                      | Fast, ~700                            |
| C5  | Conditions: SunArc, Conditions, WindOnCourt, LightMark, ConditionsLine (presentational)                                                                                                                    | `tideline/conditions/**`                                                                                                                                                                                                               | F2a     | Legible without colour; reduced motion                                                                                                  | Low                                                      | Fast, ~800                            |
| C6  | Search: SearchBar, WherePicker, WhenPicker (DateRangePicker), WhatPicker, SearchSheet, SearchResults                                                                                                       | `tideline/search/**`                                                                                                                                                                                                                   | F2a, C3 | Keyboard and sheet tests                                                                                                                | Med                                                      | Top, ~1,100                           |
| C7  | Concierge parts: thread, context chip, Send card (recipients × channel), per-person delivery row                                                                                                           | `tideline/concierge/**`                                                                                                                                                                                                                | F2a     | —                                                                                                                                       | Low                                                      | Fast, ~700                            |
| P1  | Player web shell with nav verbs Find / Play / Improve / Connect                                                                                                                                            | `apps/web/app/app/layout.tsx`, player nav component                                                                                                                                                                                    | F6a     | `player-focus.spec` updated                                                                                                             | Med                                                      | Top, ~600                             |
| P2  | Public site chrome and marketing pages (home, `/players`, run-your-club): Jost headlines and token swaps in the `*.module.css` files                                                                       | `apps/web/components/*-page.module.css`, header and footer                                                                                                                                                                             | F6a, F3 | `public-website.spec`; Markdown companions unchanged                                                                                    | Low                                                      | Fast, ~1,200 (split into 2 if needed) |

**Wave 3: domain backends, contract-first.**

W3-0 comes first: the schema steward lands **all W3 tables, one migration** (rehearsed on a Neon branch), the zod contracts and stub sub-routers that return demo fixtures. After that, B-packages (services) and W4 UIs run **in parallel** against the frozen contracts.

| ID  | Goal                                                                                                                                                                                                                                                                                                 | Owns (`packages/api/src/routers/<x>.ts`, `services/<x>/**`, `core/demo/<x>.ts`) | Schema added by W3-0                                                                                                      | Tests                                                            | Risk | Model       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ---- | ----------- |
| B1  | Organisation profile plus AI setup. Reuses the Firecrawl reader (key already set); the model proposes, code validates; review states Keep / Edit / Skip                                                                                                                                              | `setup`                                                                         | `organizations`: phone, email, website, hours (jsonb), socials; `setup_runs`, `setup_proposals` (kind, payload, state)    | Integration test: proposal to apply is audited                   | Med  | Top, ~1,300 |
| B2  | Duna Pay: Connect account sessions (embedded components), six derived statuses, payouts/tax/refund policies, `assertPaymentsReady` for the publish gate                                                                                                                                              | `pay`                                                                           | Derived status cache on organization; refund policy table if missing                                                      | Status derivation tests from Stripe fixtures; **test mode only** | High | Top, ~1,200 |
| B3a | Team availability: named schedules with effective dates, blackouts, time off; coverage and substitute suggestions via `packages/scheduling` (pure)                                                                                                                                                   | `team-availability`, `packages/scheduling/src/coverage.ts`                      | `staff_availability_schedules`, `_windows`, `staff_blackouts`, `staff_time_off`                                           | Property tests on coverage                                       | Med  | Top, ~1,400 |
| B3b | Compensation models (per session, hourly, salary), pay periods, pay runs (compute and export; W-2 tracked and exported only)                                                                                                                                                                         | `team-pay`                                                                      | `staff_compensation`, `pay_periods`, `pay_runs`, `pay_run_lines`                                                          | Money in integer minor units; idempotent run                     | High | Top, ~1,300 |
| B3c | 1099 contractor payouts through their own connected account; flag `team.contractorPayouts`, off                                                                                                                                                                                                      | `team-payouts`                                                                  | `staff_connected_accounts`                                                                                                | No provider call while the flag is off                           | High | Top, ~700   |
| B4  | Training programs unified. **Drop the legacy `programs` table and `/programs` and `/activities` routes.** Programs gain per-weekday start/end times, blackout dates, tournaments and travel, multiple coaches, a real cancelled state, plan or focus/load; "create from a sentence" makes a proposal | `training-programs` (extracted from `training-service.ts`)                      | Alter `training_programs`/`training_events`; `training_program_coaches`; drop `programs`                                  | Integration tests                                                | Med  | Top, ~1,400 |
| B5  | Drill library: scopes (mine, club, Duna library, purchased), versions, review before public listing; storefront flag `training.storefront`, off                                                                                                                                                      | `training-drills`                                                               | `training_drills.scope`, `review_state`; reuse `trainingDrillVersions`/`Licenses`                                         | Review gate tests                                                | Med  | Top, ~1,000 |
| B6a | New `packages/training-scene` (pure): model v2 (metres from net centre; slots vs people), layout, physics, resolve, the 17-rule validator, derive (load from the scene), timeline                                                                                                                    | `packages/training-scene/**`                                                    | Scene jsonb on drill versions                                                                                             | Port the prototype's cases; one test per validator rule          | Med  | Top, ~1,500 |
| B6b | 2D SVG renderer plus timeline player (React)                                                                                                                                                                                                                                                         | `packages/training-scene/react/**`                                              | —                                                                                                                         | Snapshot tests                                                   | Low  | Fast, ~800  |
| B6c | 3D player in three.js, separate subpath, lazy loaded, flag `training.scene3d`                                                                                                                                                                                                                        | `packages/training-scene/three/**`                                              | —                                                                                                                         | Bundle-size check                                                | Med  | Top, ~900   |
| B6d | "Create with AI" pipeline: the model names spots, code places them, then the validator runs                                                                                                                                                                                                          | `training-scene-ai`                                                             | —                                                                                                                         | Golden fixtures                                                  | Med  | Top, ~700   |
| B7  | Concierge: threads linked to a lesson, match, tournament, league or club; Send card proposal; one channel per person; per-person delivery records. Email, iMessage (reuse `sendblue-*`) and WhatsApp adapters return `not-enabled` behind `concierge.channel.*` flags, **all off**                   | `concierge`, `packages/messaging-client/src/delivery/*`                         | `messaging_conversations.context_type/id`; `person_channel_preferences`; new enum values (`imessage`, `whatsapp`, `duna`) | A test asserts no provider HTTP call while flags are off         | High | Top, ~1,400 |
| B8a | Website Changes model: four request lanes, change, preview, checks, publish (by a person), undo; replaces the one-edit flow in `website-service.ts`; flag `website.workspace`                                                                                                                        | `website-workspace`                                                             | `website_changes`, `website_change_jobs`, `website_change_checks`; can drop the old document tables (no live clubs)       | Lifecycle integration tests                                      | High | Top, ~1,500 |
| B8b | Five templates plus onboarding of an existing site                                                                                                                                                                                                                                                   | `website-templates`                                                             | —                                                                                                                         | Render tests                                                     | Med  | Top, ~1,200 |
| B9  | Facility owners (public courts): listing, access rules (approved users only, by hours or days), approvals, links to the existing waivers; stop-play                                                                                                                                                  | `facility`                                                                      | `facility_access_rules`, `facility_access_requests`, `court_play_stops`                                                   | Policy tests                                                     | Med  | Top, ~1,200 |
| B10 | Search API (where / when / what) with map bounds and availability; extends `discovery-search.ts`, reads go to the replica                                                                                                                                                                            | `search`                                                                        | Indexes                                                                                                                   | Contract tests                                                   | Med  | Top, ~900   |
| B11 | Conditions service: hourly Tomorrow.io (`weather.ts` exists), sunrise/sunset (the NOAA helper exists), wind relative to court orientation, light; cached                                                                                                                                             | `conditions`                                                                    | `courts.orientation_deg`                                                                                                  | Unit tests                                                       | Low  | Fast, ~600  |

**Wave 4: feature UIs.** Each package owns its route directory and `apps/<app>/components/<area>/**` only.

HQ:

| ID  | Area and design delta                                                                                                                                        | Depends             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| H1  | Today (Overview)                                                                                                                                             | S1                  |
| H2  | Schedule, plus the court schedule's conditions rail and stop-play                                                                                            | S1, C4, C5, B9, B11 |
| H3  | Inbox / Concierge                                                                                                                                            | C7, B7              |
| H4  | People                                                                                                                                                       | S3                  |
| H5  | Team member: Overview / Availability / Compensation / Schedule / Pay                                                                                         | S3, B3a, B3b        |
| H6  | Training programs                                                                                                                                            | B4                  |
| H7  | Practice plan builder: visible assumptions, totals (time, load, touches, jumps), estimates that rescale, diagrams in blocks, coach mode, print with diagrams | B6b                 |
| H8  | Drill library and detail, editing, versions                                                                                                                  | B5, B6b             |
| H9  | Events and Offerings (the renamed products)                                                                                                                  | S3                  |
| H10 | Money / Duna Pay plus the publish gate                                                                                                                       | B2, S4              |
| H11 | Club setup (AI review plus SpecForms)                                                                                                                        | B1, S4              |
| H12 | Website workspace (page tree, preview, chat)                                                                                                                 | B8                  |
| H13 | Marketing and Reports                                                                                                                                        | S1                  |
| H14 | Facilities                                                                                                                                                   | B9                  |

Web:

| ID  | Area                                                                                    | Depends     |
| --- | --------------------------------------------------------------------------------------- | ----------- |
| P3  | Search over the map and discover with pins                                              | C3, C6, B10 |
| P4  | Club page with ClubMark                                                                 | C2          |
| P5  | Booking with DayStrip / TimeSlots / durations plus light and weather marks              | C4, C5, B11 |
| P6  | Wallet with membership cards                                                            | C2          |
| P7  | Concierge threads                                                                       | C7, B7      |
| P8  | Result and score with NetScore / RatingRing                                             | C1          |
| P9  | Film library (heart-rate overlay only where data exists; sharing to coaches) and Health | —           |

- Each W4 package is 600–1,500 lines. Split H5, H7, H12 and P3 into list and detail PRs.
- Use Top for H5, H7, H10, H11, H12 and P3–P5; Fast for the rest.
- Verify each on its Vercel preview at 1440, 768 and 390 widths, in light, dark and live, plus keyboard; attach screenshots next to the canvas PNG from R2.

**Wave 5: sweeps (Fast)**

- Replace `lucide-react` imports with `@duna/ui/icons` (HQ, then Web, about 115 files per PR).
- Delete the remaining legacy sheets and `legacy-bridge.css`; retire `--hq-*` and flare.
- Re-render visual baselines.
- Final docs pass (`docs/surfaces/HQ.md`, `WEB.md`, `BUILD_MATRIX.md`).

### 5. Sequencing advice

**Order:**

1. R1–R4.
2. **F1, F2, F3, F5a, F6a.** This is the first visible production win: new colours, type, logo and icon stroke everywhere through the aliases, with no screen rewrites.
3. S2 then S1 (new navigation and shell).
4. W3-0 contracts.
5. W3 and W4 together, area by area.

Your instinct is right. The one change: S2's route moves must land **before** any feature package starts, or every branch conflicts.

**Keep behind flags (all off in production):**

- Concierge external channels
- Contractor payouts
- Drill storefront
- 3D scene
- Website workspace (until B8a and H12 are done)
- Facility owners
- Duna Pay embedded onboarding until Stripe gives a live review; it stays in test mode anyway.

**Cut or stub honestly:**

- The Website "new capability" lane records a request only; nothing is built.
- Website helper jobs run one at a time at first.
- W-2: tracked and exported only; Duna doesn't run payroll.
- Heart-rate overlay appears only when data exists.
- Channel options in the Send card are shown disabled with "Not available yet".

**Where "no live clubs" allows a shortcut:**

- Drop `programs`, `/programs` and `/activities` instead of merging data.
- Rename routes without aliases (keep a handful of proxy redirects for bookmarks).
- Recreate the `message_channel` enum rather than migrating values.
- Replace the website document tables.
- Delete legacy CSS outright instead of ratcheting slowly.
- **Not a shortcut:** the Beach Elite QA dataset (`demo-data-service.ts` must be updated in the same PR as any dropped table), the Stripe test account and WorkOS organisations still exist.

### 6. Ten likely failures and their guardrails

1. **Migration collisions, or bad SQL auto-applied by the HQ production build.** Only the steward generates migrations, one per wave, rehearsed on a Neon branch. Changes are additive first; drops come in a later wave.
2. **Production ships red.** Deploys aren't gated and `main` CI cancels itself. R4 plus owner settings: required checks, Vercel deployment checks, no cancellation on `main`.
3. **Monolith conflicts** (`router.ts`, `schema.ts`, `contracts.ts`, `actions.ts`, `globals.css`). Use the R3 seams and freeze those files; agents work in domain files.
4. **The legacy cascade overrides Tideline** and agents pile on `!important`. F5a/F6a layering lands before any adoption. Ban `!important` outside `tideline/` in lint, and keep the ratchet.
5. **Old contracts pull agents back to Satoshi or orange.** R2 lands first. Every brief says the Tideline 4.1.1 docs override older docs.
6. **Demo-mode crashes in CI** because new pages need a database. Demo fixtures are required per domain, and e2e opens every new route.
7. **Agents invent design.** Canvas PNGs go in the repo per WP. The PR template requires preview screenshots next to the canvas, and the orchestrator reviews them visually.
8. **A provider gets activated by accident** (messaging, payouts, Stripe live). Flags default off and adapters return `not-enabled`. A test fails on any provider fetch while flags are off. Keys never go into Preview.
9. **UI SDK beta churn or the age gate.** Pin exactly; only `tideline/` imports it; F1's owner does upgrades; take only releases older than 24 hours.
10. **Rebase storms on generated files and S2 moves breaking links.** Regenerate the knowledge file and lockfile, never hand-merge them; `merge=union` on barrels; merge in a train. S2 updates absolute HQ paths in `packages/api`, the Stripe return/refresh URLs and the e2e/visual manifests, and greps prove no old path remains.

**Cross-planner boundary:** `packages/ui/src/tokens.ts`, `mobile.ts` and the player/pro design contracts belong to the native planner. Web/HQ consumes `tideline/tokens.ts`, which F2a owns. Agree the 4.1.1 token names with them before F2a merges.

### Critical files for implementation

- `/Users/journeysuttonm5max/Duna Project Worktrees/hq-product-media-variant-fix-20261125/apps/hq/app/layout.tsx`
- `/Users/journeysuttonm5max/Duna Project Worktrees/hq-product-media-variant-fix-20261125/packages/api/src/router.ts`
- `/Users/journeysuttonm5max/Duna Project Worktrees/hq-product-media-variant-fix-20261125/packages/db/src/schema.ts`
- `/Users/journeysuttonm5max/Duna Project Worktrees/hq-product-media-variant-fix-20261125/scripts/verify-design-system.ts`
- `/Users/journeysuttonm5max/Duna Project Worktrees/tideline-ui-sdk-20261125/packages/ui/src/tideline/tokens.json`
- `/Users/journeysuttonm5max/Duna Project Worktrees/hq-product-media-variant-fix-20261125/apps/hq/components/navigation.ts`
- `/Users/journeysuttonm5max/Duna Project Worktrees/hq-product-media-variant-fix-20261125/.github/workflows/verify.yml`
- `/Users/journeysuttonm5max/Duna Project Worktrees/hq-product-media-variant-fix-20261125/apps/hq/vercel.json`
