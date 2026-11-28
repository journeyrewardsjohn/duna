# Legacy styles: owner decision, 28 November 2026 (supersedes the cascade-layering plan)

Owner: "Get rid of the HQ visual comparison tool hard requirements asap so that stops wasting time and
money." and "get rid of the legacy rules all together and re-write them entirely for our new system.
Those old rules have no place here and I approve removing them and rethinking in Tideline and our
latest designs."

## What this changes

1. **Legacy screens are not preserved, layered, bridged or pixel-compared.** Packages F5a, F6a and the
   deletion packages F5b–e / F6b–d are cancelled. No `@layer legacy`, no `host.css`, no zero-diff runs.
2. **Removed tooling:** the HQ visual regression workflow (gone: PR 309), the visual harness and
   route matrix (`tests/e2e/hq-visual/**`, `playwright.hq-visual.config.ts`), the CSS usage and
   coverage reports, the HQ CSS line ratchet (script, baseline, CI step), `tests/e2e/hq-ui-contracts.spec.ts`,
   the source-text unit tests that pin legacy CSS, and the "legacy" pins in `scripts/design-contracts/*`.
3. **How new screens coexist with old ones until the old ones are gone: two root layouts.**
   Each app gets route groups with separate root layouts (separate documents, so separate CSS):
   - `app/(next)/…`: root layout imports ONLY the design system (`@duna/ui/tideline/styles.css`, the app's
     fonts, the app's own token-based CSS). The new shell lives here. Every rebuilt screen lives here.
   - `app/(legacy)/…`: the current root layout and its legacy sheets, untouched, for pages not yet rebuilt.
     A screen package MOVES its route from `(legacy)` to `(next)` when it rebuilds it and deletes the old
     page's components, styles and tests in the same pull request. When `(legacy)` is empty, its layout and
     every legacy sheet are deleted. Nothing new is ever added to a legacy sheet; nothing in `(next)` imports
     one. Navigation between the two groups is a full page load: acceptable while no club is live.
4. **Checks that stay because they earn their cost:** the CI release gate (type-check, lint, unit tests,
   builds, end-to-end), the persona journeys, a Vercel-equivalent build step (arriving with the HQ
   production fix), a rehearsal on a throwaway database branch for each migration, checking both
   production deploys after every merge, and looking at screenshots of what you built. Not kept:
   repeat-run flake hunts on legacy specs, separate "verify" agents for low-risk changes, local runs of
   suites CI already runs.
5. **Still needed from the layering findings:** inside any `.td` scope the generated token block replaces
   the loaded next/font families with literal names. Fix in the token generator (font tokens resolve to
   the variables `fonts.ts` sets, literals as fallback). Owner: the shell package (S1).
