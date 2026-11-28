# Domain routers (R3 seams)

`router.ts`, `contracts.ts`, `packages/api/src/index.ts` and
`packages/db/src/schema.ts` are frozen monoliths. New feature work goes into
the per-domain seams below; nobody else edits those files.

| Domain              | Owner | Mounted at                                                                  |
| ------------------- | ----- | --------------------------------------------------------------------------- |
| `setup`             | B1    | `operator.setup`                                                            |
| `pay`               | B2    | `operator.pay`                                                              |
| `team-availability` | B3a   | `operator.teamAvailability`                                                 |
| `team-pay`          | B3b   | `operator.teamPay`                                                          |
| `team-payouts`      | B3c   | `operator.teamPayouts`                                                      |
| `training-programs` | B4    | `operator.trainingPrograms`, `player.trainingPrograms`                      |
| `training-drills`   | B5    | `operator.trainingDrills`, `player.trainingDrills`, `public.trainingDrills` |
| `training-scene-ai` | B6d   | `operator.trainingSceneAi`                                                  |
| `concierge`         | B7    | `operator.concierge`, `player.concierge`                                    |
| `website-workspace` | B8a   | `operator.websiteWorkspace`                                                 |
| `website-templates` | B8b   | `operator.websiteTemplates`, `public.websiteTemplates`                      |
| `facility`          | B9    | `operator.facility`, `player.facility`, `public.facility`                   |
| `search`            | B10   | `public.search`, `player.search`                                            |
| `conditions`        | B11   | `operator.conditions`, `public.conditions`                                  |
| flags (R3)          | R3    | `public.flags` (`public.flags.enabled`)                                     |
| readiness (R3)      | R3    | `admin.readiness` (`admin.readiness.providers`, Super Admin only)           |

Each domain owns exactly these paths:

- `packages/api/src/routers/<domain>.ts`: the sub-routers
  (`<domainCamel>OperatorRouter`, `…PlayerRouter`, `…PublicRouter`).
- `packages/api/src/contracts/<domain>.ts`: Zod schemas and inferred types.
- `packages/api/src/services/<domain>/**`: service code.
- `packages/core/src/demo/<domain>.ts`: demo fixtures
  (`@duna/core/demo/<domain>`).
- `packages/db/src/schema/<domain>.ts`: tables, written by the schema steward
  only.

If you need a part that is not mounted yet (for example `player.pay`), ask
the orchestrator; R3's owner adds the one mount line.

## Add a procedure

1. Add it to the right sub-router in `routers/<domain>.ts`. Use the same
   builders as the neighbouring procedures in `router.ts`:
   - operator: `organizationProcedure("<scope>")` from `../auth` (sign-in,
     scope check, organization resolved server-side as `ctx.organizationId`;
     never accept an organization id from input to grant access);
   - player: `protectedProcedure.use(requireScope("<scope>"))`
     (`adultProcedure` for money or public hosting);
   - public: `publicProcedure`.
     Add `rateLimitMiddleware(...)`, idempotency keys and audit for risky
     mutations exactly as `router.ts` does.
2. Give it `.input(...)` and `.output(...)` schemas from
   `contracts/<domain>.ts`.
3. Give it a demo-mode branch (below). CI and Playwright have no database.
4. Delete the placeholder `status` query once a real procedure exists, and
   update `routers/seams.test.ts` (that test is the proof the mount works;
   swap your `status` call for a real demo-mode call).
5. Nothing to run for the Ask Duna knowledge manifest: it is generated on
   demand (on install and before build, typecheck, lint, test and dev) and is
   not committed. The generator reads `routers/**`; procedures appear as
   `<domain>.<procedure>`, the `status` placeholders are skipped.

## Add a contract

Write schemas in `contracts/<domain>.ts`. The file is re-exported from
`@duna/api` by `src/index.ts`, so every contracts module shares one export
namespace: prefix names with the domain (`conditionsForecastSchema`), or
typecheck fails with TS2308. You may import shared schemas from
`../contracts`; `contracts.ts` must never import a domain contract (import
cycle). Do not move existing contracts out of `contracts.ts`.

## Ask for a table (never edit `schema.ts`, never generate a migration)

Write `docs/plan/schema-requests/<WP>.md`: the tables, columns (types,
nullability, defaults), indexes, constraints, enum values and the reason for
each. Use integer minor units plus an ISO currency for money and keep the
versioning/lineage rules in `docs/ARCHITECTURE.md`. One schema steward per wave
(W3-0) writes `packages/db/src/schema/<domain>.ts` and generates one
migration for the whole wave. Until it lands, code against the contract and
demo fixtures.

## Add demo fixtures

Demo data is served whenever `usesDemoData()` (`services/data-source.ts`) is
true: no `DATABASE_URL`, or `DUNA_DATA_SOURCE=demo`. That is the same rule as
`getRepository()`. Requests are signed in as `createDemoActor()` (player +
manager of `demoOrganization`) unless `NEXT_PUBLIC_DEMO_MODE=false`.

```ts
if (usesDemoData()) return conditionsDemo.forecast;
```

Put fixtures in `packages/core/src/demo/<domain>.ts`, deterministic, with ids
from `demoId("<domain>", n)`, and parse them with the contract schema in a
unit test. See `packages/core/src/demo/README.md`.

## Use a flag and a provider

Flags are kill switches: every registry flag in `packages/core/src/flags.ts`
defaults ON; a Super Admin row turns it off (or back on) globally, for an
organization or for a market. Precedence: organization + market >
organization > market > global > registry default. Demo mode and an
unreadable table return the registry default; the evaluator never throws.

Outside integrations are listed in `packages/core/src/providers.ts` (env var
NAMES only). `providerStatus(key)` returns `configured`, `not-configured` or
`test-mode` (Stripe test keys). A feature that needs a provider checks both:

```ts
import { isFeatureEnabled } from "../feature-flag-evaluator";
import { providerStatus } from "../provider-readiness";
if (
  !(await isFeatureEnabled("concierge.channel.email", {
    organizationId: ctx.organizationId,
    context: ctx,
  }))
)
  return { state: "not-enabled" }; // switched off: hide or explain
if (providerStatus("email") === "not-configured")
  return { state: "provider-not-configured" }; // visible, honest, NO outbound call
// configured or test-mode: call the provider (label test-mode in the UI)
```

Pass `context: ctx` so flags are read once per request. Clients read
`public.flags.enabled` (client-visible flags for the caller's organization).
To add a flag, append it to the registry (key pattern
`^[a-z0-9][a-zA-Z0-9._-]*$`, never rename a shipped key). To add a provider,
append to `providerRegistry` with the env names the code reads, and add the
names to `docs/ENVIRONMENT_VARIABLES.md` through its owner.

## Dependency direction

`@duna/core` imports nothing from `@duna/db`, `@duna/api` or an app.
`@duna/db` may import `@duna/core`. `@duna/api` may import both. Apps import
`@duna/api` (server) and `@duna/core`. Client components import pure
subpaths (`@duna/core/flags`, `@duna/core/hq-routes`) rather than `@duna/api`.
