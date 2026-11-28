# The Duna Design System (Tideline 4.1.1) programme

Dated 27 November 2026. This folder is how the redesign is built: many coding
agents in parallel, one orchestrator. The design contract is
[`docs/design/tideline-4.1.1/README.md`](../design/tideline-4.1.1/README.md);
it overrides every older design document. Safety, privacy, money, health-data
and confirmation rules in [`AGENTS.md`](../../AGENTS.md) override both.

| File                                                 | What it is                                                                                                                                                  |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`web-hq-backend.md`](web-hq-backend.md)             | Web, HQ and backend plan (work packages R, F, S, C, P, B, H)                                                                                                |
| [`mobile.md`](mobile.md)                             | Player and Pro native plan (work packages G, F, N, C, P, R, K, X)                                                                                           |
| [`ios27-research.md`](ios27-research.md)             | iOS 27, iPhone Duo and iPadOS 27 research brief                                                                                                             |
| [`schema-requests/`](schema-requests/)               | One file per work package asking the schema steward for schema changes                                                                                      |
| [`production-readiness.md`](production-readiness.md) | What the owner must set up for production: keep this file current when a package adds a provider, a webhook, a redirect address or an environment variable. |

Before opening a PR, every package meets [`definition-of-done.md`](definition-of-done.md) and keeps its [`persona-journeys.md`](persona-journeys.md) steps passing (Q0).

The three plan files are copied from the planners' reports; only Prettier
whitespace was changed. Where a plan and this README disagree, this README and
the contract win (for example the owner's flag decision below).

**Work-package ids.** Both plans reuse letters (F1, C1, P1, R1 ...). Mobile
plan ids are written with an `M-` prefix everywhere outside `mobile.md`
(`M-F1`, `M-P0`, `M-R3`); web/HQ/backend ids are unprefixed. Board mapping per
package: [`canvases.md`](../design/tideline-4.1.1/canvases.md).

## Wave order

| Wave | Web / HQ / backend                                                                                                    | Native                                                                                                                |
| ---- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 0    | R1 (PR queue), **R2 (this contract and the verifier)**, R3 (seams, flag registry, HQ route map), R4 (CI)              | M-G0 (merge the Player split after a simulator smoke test), M-G1 (done by R2)                                         |
| 1    | F1, F2a, F2b, F3, F4 (F5a, F6a, F5b–e, F6b–d cancelled: see below)                                                    | M-F0 tokens, M-F1 foundation, M-F2 layout, M-F3 posture module, M-F4 shared logic, M-F5 Pro split, M-N1 native config |
| 2    | **S2 merges alone (HQ freeze)**, then S1, S3, S4, C1–C7, P1, P2                                                       | M-C1 … M-C7 component families                                                                                        |
| 3    | W3-0: the schema steward lands every W3 table in one migration plus contracts and demo stubs; then B1–B11 in parallel | M-P0 shell first, then M-P1 … M-P7 Player screens                                                                     |
| 4    | H1–H14 and P3–P9 against frozen contracts, area by area                                                               | M-R0 Pro shell, then M-R1 … M-R6 (alongside wave 3 once M-F5 lands)                                                   |
| 5    | Sweeps: icons to `@duna/ui/icons`, delete legacy sheets and `--hq-*` / flare, baselines, docs                         | M-K1 pointer and keys, M-K2 widgets and Live Activity, M-K3 App Intents, M-X1 cleanup, M-X2 release                   |

Tokens: web/HQ consume `packages/ui/src/tideline/tokens*` (F2a); native
consumes the generated `tokens.native.ts` (M-F0). Both read the one
`tokens.json` built from [`docs/design/tideline-4.1.1/tokens.json`](../design/tideline-4.1.1/tokens.json);
agree names before F2a merges (rename `salt-*` / `night-*`, never re-value).

## Legacy styles: replace, do not preserve (28 November 2026)

The owner decided that old screens and their style rules are replaced outright
by new screens on the Duna Design System. Nothing guards, measures, pins or
layers the old styles any more. The full decision is
[`legacy-styles.md`](legacy-styles.md). In short:

- **Two root layouts per app.** `app/(next)/` has a root layout that imports
  only the design system (`@duna/ui/tideline/styles.css`, the app's fonts and
  its token-based CSS). `app/(legacy)/` keeps today's root layout and legacy
  sheets, untouched, for pages not yet rebuilt. They are separate documents,
  so they load separate CSS. Moving between them is a full page load.
- **A screen package moves its route** from `(legacy)` to `(next)` and deletes
  the old page's components, styles and tests in the same pull request. Never
  add to a legacy sheet; nothing in `(next)` imports one; nobody spends time
  keeping an old screen pixel-identical.
- **When `(legacy)` is empty**, its layout and every legacy sheet are deleted.
  `packages/ui/src/tideline/legacy-bridge.css` goes when the design-system
  gallery (`/tideline`) moves to the `(next)` root layout; until then the
  gallery renders inside the legacy HQ root layout and relies on it.
- **Cancelled:** F5a, F6a, F5b–e and F6b–d (the cascade layering and the
  one-sheet-per-PR dead-CSS deletions). No `@layer legacy`, no `host.css`, no
  zero-diff runs.
- **Removed:** the HQ visual regression workflow and suite, the CSS usage and
  coverage reports, the HQ CSS line ratchet, `hq-ui-contracts.spec.ts`, the unit
  tests that read legacy style sheets, and the `legacy` styling pins in
  `scripts/design-contracts/`.

Checks that remain, because they earn their cost:

- The CI release gate: type-check, lint, unit tests, builds and end-to-end.
- The persona journeys.
- A Vercel-equivalent build step (arriving with the HQ production fix).
- A rehearsal on a throwaway database branch for each migration.
- Checking both production deploys after every merge.
- Looking at screenshots of what you built.
- `pnpm verify:design-system`, `verify:readable-type` and
  `verify:single-react-types`, which enforce the new system on new code.

Not kept: repeat-run flake hunts on legacy specs, separate "verify" agents for
low-risk changes, and local runs of suites CI already runs.

### Owner requirements added on 27 November 2026

1. **Flags are kill switches, not gates.** "Ship everything switched on." Every
   feature flag defaults **on**. A feature that depends on an outside provider
   is on in code and shows an honest "not configured yet" state until
   production credentials exist. Agents never invent, request in chat or enter
   credentials; each PR lists what production needs (for example WorkOS
   redirect URIs, Stripe keys and webhooks, Mapbox token, messaging channel
   accounts, Apple capabilities). Which Stripe mode runs is decided by the
   environment's keys, which the owner controls. Unchanged: a person confirms
   every send, payment and publish; no invented customers, claims, prices or
   policies; product copy never names infrastructure vendors.
2. **Fonts and agent files.** The Duna Design System (Tideline 4.1.1) replaces
   Satoshi everywhere: Jost Medium 500 for one title per screen and marketing
   headlines, Geist and Geist Mono for everything else.
3. **Health.** Owner decision 2026-11-27: the adults-only gate is being
   replaced by a US-only HealthKit integration that includes junior players
   with a parent or guardian's consent; the rules are pending in
   `docs/HEALTH_PRIVACY.md`. Until that lands, do not build or remove health
   gating. (This replaces the plan's "adults only" wording in M-P4c and
   failure 7.)
4. **Mobile.** Upgrade everything needed, Expo included, to the latest stable
   release; minimum iOS 26. Ship a new TestFlight build of both apps and
   prepare the App Store submission (the owner releases). The iPhone Duo open
   and half-open layouts are fully designed for every area. Live Activity and
   Dynamic Island are first-class (M-K2). Integrate Apple's on-device model for
   video where it adds value: it needs a small native Swift Expo module (no
   React Native binding exists). Native apps use the system tab bar; no
   function exists on only one size. Details:
   [`adaptive.md`](../design/tideline-4.1.1/adaptive.md).
5. **Identity chrome stays.** Sign-in, sign-up, the organisation switcher with
   "Create new organisation", and the personal account stay in every shell
   (HQ, Pro, Player, web), restyled.
6. **Video capture** is a separate work stream (recording-first, Apple
   frameworks for the capture core, a different video provider); see the
   hot-spot table.
7. **CI** (PR 290): `release-gate` aggregates three parallel jobs
   (`static-checks`, `unit-tests`, `build-and-e2e`); `mobile-bundles` always
   reports.

## Hot spots: one owner each

Merged from both plans. Anything not in your package's "Owns" column is not
yours: ask the owner listed here.

| Hot spot                                                                                            | Owner                                                                                                                                                                     | How everyone else asks for a change                                                            |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `packages/db/src/schema.ts`, `packages/db/drizzle/**` (SQL, `meta/_journal.json`, snapshots)        | Schema steward (R3, then W3-0; one per wave)                                                                                                                              | Write `docs/plan/schema-requests/<WP>.md`; the steward batches one migration per wave          |
| `packages/api/src/router.ts`, `contracts.ts`, `packages/api/src/index.ts`                           | R3, then frozen                                                                                                                                                           | Code goes in `packages/api/src/routers/<domain>.ts` and `contracts/<domain>.ts`                |
| `packages/api/src/generated/duna-feature-knowledge.ts`                                              | Whoever merges                                                                                                                                                            | Never hand-merge; run `pnpm knowledge:generate` after a rebase                                 |
| `pnpm-lock.yaml`, `pnpm-workspace.yaml`                                                             | F1 (UI SDK), B2 (Stripe Connect JS), B6c (three), M-N1 (native)                                                                                                           | Rerun `pnpm install` after a rebase; one dependency change per PR                              |
| `apps/hq/app/layout.tsx` / `apps/web/app/layout.tsx`                                                | F5a / F6a (F3 supplies the font module)                                                                                                                                   | Request through the owner                                                                      |
| `apps/hq/components/navigation.ts`, HQ route tree, `packages/core/src/hq-routes.ts`                 | S2                                                                                                                                                                        | Request through S2                                                                             |
| `packages/ui/src/tideline/index.ts`, `tideline/styles.css` barrels, gallery index                   | Append-only, one line per family (F1 sets the shape)                                                                                                                      | `merge=union` for local rebases                                                                |
| `AGENTS.md`, `docs/design/**`, `scripts/verify-design-system.ts`, `scripts/verify-readable-type.ts` | R2                                                                                                                                                                        | Request through R2                                                                             |
| `scripts/design-contracts/<surface>.ts`                                                             | That surface's packages: `hq` (S1/S2/H*), `web` (P1/P3–P9), `public` (P2), `player` (M-P*), `pro` (M-R*), `shared` (F1/F2/F3, native planner for `tokens.ts`/`mobile.ts`) | Edit only your own entries; delete legacy entries you replace; never weaken another surface's  |
| `packages/ui/src/tokens.ts`, `packages/ui/src/mobile.ts`                                            | Native planner                                                                                                                                                            | Web/HQ never edit them; F2b aliases web CSS only                                               |
| `packages/ui/src/tideline/tokens.json`, `token-build.ts`                                            | F2a (web lead); M-F0 adds the native builder only                                                                                                                         | Request through F2a                                                                            |
| `packages/ui/package.json` exports, `packages/ui/src/native/index.ts`                               | M-F1                                                                                                                                                                      | Families add their own barrel file; M-F1 merges                                                |
| `apps/player/src/app/DunaApp.tsx`, `apps/player/src/app/router.ts`                                  | M-P0, then each later wave's integrator                                                                                                                                   | Request through the integrator                                                                 |
| `apps/pro/src/app/*`                                                                                | M-R0                                                                                                                                                                      | Request through M-R0                                                                           |
| `apps/*/app.json`, `apps/*/eas.json`, app icons and splash                                          | M-N1                                                                                                                                                                      | Request through M-N1                                                                           |
| `apps/player/src/legacy/styles.ts`                                                                  | Nobody edits it; M-X1 deletes what becomes unused                                                                                                                         | New screens use their own style sheets                                                         |
| `apps/player/modules/duna-video-capture/**` and the capture parts of `apps/player/video-studio.tsx` | Video capture work stream (separate session)                                                                                                                              | Do not edit; M-P4b extracts library and overlay into `features/film/` without touching capture |
| `apps/player/targets/DunaWatch/**` (`swipeGesture`, `WatchScoringStore.swift`)                      | M-P7 (restyle only; interaction byte-identical)                                                                                                                           | Request through M-P7                                                                           |
| `tests/e2e/*.spec.ts`                                                                               | Each package owns its own specs; S2 owns path updates; R4 owns `playwright.config.ts`                                                                                     | Request through the owner                                                                      |
| `.github/workflows/**`, `.github/pull_request_template.md`                                          | R4 (CI package)                                                                                                                                                           | Request through R4                                                                             |

## Rules every agent follows

1. **Own worktree, own branch.** Create a new worktree from `origin/main` and a
   branch named `codex/<wp>-20261127` (lower-case id, for example
   `codex/s1-20261127`, `codex/m-p2-20261127`). Never work in another agent's
   worktree or the main checkout.
2. **Touch only owned paths.** Your package's "Owns" column plus your own tests,
   demo fixtures and the contract file entries for your surface. Everything
   else goes through the hot-spot owner.
3. **Schema changes** are requested in `docs/plan/schema-requests/<WP>.md`
   (what table/column/enum, why, which procedure reads it, the demo fixture
   shape). Only the schema steward runs `drizzle-kit generate` and writes
   migrations. Additive first; drops in a later wave.
4. **Demo mode always works.** CI has no database. Every new page and
   procedure has a demo-mode branch (fixtures in
   `packages/core/src/demo/<domain>.ts`), and e2e opens every new route.
5. **Flags default on** and are kill switches (owner requirement 1). A
   provider-dependent feature shows an honest "not configured yet" state until
   production credentials exist; list what production needs in the PR. No
   messaging channel sends, nothing pays and nothing publishes without a person
   confirming in the UI.
6. **Generated files and the lockfile are never hand-merged.** Regenerate
   (`pnpm knowledge:generate`, `pnpm install`, token builds) after a rebase.
7. **Open a PR, never merge** and never enable auto-merge. Title prefixed with
   your package id. The orchestrator merges in a train.
8. **Screenshots in the PR**: web at 1440, 768 and 390 px in light, dark and
   live where relevant, beside the board name they implement; native from the
   simulator matrix in `adaptive.md`, saved under `output/mobile/<wp>/`.
9. **Follow the contract.** Check rules R1–R22 for your screens; list every
   Proposed assumption and every rule you could not meet.
10. **Verifier.** Run `pnpm verify:design-system` and
    `pnpm verify:readable-type`. When your surface migrates, add its paths to
    `migrated` in `scripts/design-contracts/<surface>.ts` (the Tideline guard
    then forbids retired orange, Solar outside live states, `!important` and
    vendor names there) and delete the `legacy` entries you replaced. Do not
    add exemptions; ask R2.
11. **Production claims.** Never claim a production launch, store publication,
    provider approval or connected credential that has not happened. Record
    build ids, commits and open owner gates per `docs/START_HERE.md`.
