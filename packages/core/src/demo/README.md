# Domain demo fixtures

One module per R3 domain (`setup.ts`, `pay.ts`, … `conditions.ts`), imported as
`@duna/core/demo/<domain>`. The legacy fixtures in `../demo.ts` stay where they
are; do not add new domains to that file.

## How demo mode is selected

CI, Playwright and local layout work run without a database. The API serves
demo data whenever **no `DATABASE_URL` is configured, or
`DUNA_DATA_SOURCE=demo`** is set. That rule lives in one function,
`usesDemoData()` in `packages/api/src/services/data-source.ts`, and matches
`getRepository()` in `packages/api/src/repository.ts`.

Separately, `createApiContext()` signs requests in as the synthetic demo actor
(`createDemoActor()`: Mara Lewis, roles player + manager, organization
`demoOrganization`) unless `NEXT_PUBLIC_DEMO_MODE=false`. `actor.isDemo` says
who is calling; it does not choose the data source.

A procedure therefore looks like:

```ts
if (usesDemoData()) return conditionsDemo.forecast; // fixture from here
return loadForecastFromDatabase(ctx.organizationId); // connected path
```

## Rules for fixtures

- Deterministic: fixed ids from `demoId("<domain>", n)` (see `ids.ts`), fixed
  ISO dates or dates derived from a `now` the caller passes in. No clock,
  network, environment or randomness at module load.
- Scoped to `demoOrganization` / `demoPlayer` from `../demo.ts` so the demo
  actor can see them.
- Shaped by the domain's contract: add a unit test that parses each fixture
  with its schema from `packages/api/src/contracts/<domain>.ts`.
- `@duna/core` imports nothing from `@duna/api`, `@duna/db` or an app. Keep
  fixtures as plain data typed structurally (or with `@duna/core` types).
- Writes in demo mode must not persist across requests unless the domain
  already keeps an in-memory store; prefer returning the would-be result.
