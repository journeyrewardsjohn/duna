# Start building on Duna

This is the shortest safe path from a fresh checkout to a correctly scoped
change. It is written for both people and coding agents.

## Read before editing

Read only what the change requires, but do not skip the ownership contract:

1. [`../AGENTS.md`](../AGENTS.md) for product, design, accessibility, and release
   invariants.
2. [`ARCHITECTURE.md`](ARCHITECTURE.md) for runtime, trust, and data boundaries.
3. The target guide in [`surfaces/`](surfaces/README.md).
4. [`ENVIRONMENT_VARIABLES.md`](ENVIRONMENT_VARIABLES.md) and
   [`INFRASTRUCTURE.md`](INFRASTRUCTURE.md) before using a connected provider.
5. The specialist guide for messaging, video, health, predictions, pricing,
   professional data, API, or MCP work.
6. [`BUILD_MATRIX.md`](BUILD_MATRIX.md) and [`OPERATIONS.md`](OPERATIONS.md) when
   the request includes release, deployment, or readiness.

Treat `BUILD_MATRIX.md` as dated evidence, not a permanent production claim.
Routes, provider state, build processing, account access, and live data can
change independently of source.

## Repository requirements

- Node.js `>=22.18.0`; CI currently uses the pinned Node 22 line.
- pnpm is declared in the root `package.json`.
- Turborepo coordinates 15 application and shared-package workspaces.
- Next.js serves Web and HQ; Expo/React Native serves Player and Pro.
- Neon Postgres is connected through Drizzle and `@neondatabase/serverless`.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Focused development:

```bash
pnpm dev:web
pnpm dev:hq
pnpm --filter @duna/player start
pnpm --filter @duna/pro start
pnpm --filter @duna/voice-agent dev
```

Web uses port `3000`; HQ uses port `3001`. Native clients normally call the
Web-hosted tRPC endpoint. A connected native feature may require a signed
development build; Expo Go cannot represent HealthKit, Live Activities, Watch,
Stripe Terminal, LiveKit WebRTC, background location, or other custom native
capabilities.

## Choose the data mode deliberately

### Demo mode

Use demo mode for layout, deterministic product exploration, and tests that do
not need provider truth. Leave `DATABASE_URL` unset and keep
`NEXT_PUBLIC_DEMO_MODE=true`. `getRepository()` will select the demo adapter.
Do not treat seeded metrics, identities, payment state, or provider health as
connected evidence.

### Connected mode

Use a non-production Neon branch and provider sandbox credentials. Set
`DUNA_DATA_SOURCE=database`, provide `DATABASE_URL`, and configure only the
variables needed by the target surface. Store values in ignored app-local
`.env.local` files or the provider's encrypted environment store. Follow
[`ENVIRONMENT_VARIABLES.md`](ENVIRONMENT_VARIABLES.md); do not copy values into
commits, issue text, logs, screenshots, or chat.

Production database or payment access is never required for ordinary feature
development. Create or request an isolated provider branch/environment when a
connected test is necessary.

## Pick the owning layer

| Change                                      | Start in                            | Keep out of                                        |
| ------------------------------------------- | ----------------------------------- | -------------------------------------------------- |
| Public/player web route or API handler      | `apps/web`                          | Native-only UI and direct SQL                      |
| Operator browser workflow                   | `apps/hq`                           | Player shell and client-trusted organization scope |
| Super Admin control                         | `apps/hq/app/admin`, `packages/api` | Operator-only permissions and unaudited writes     |
| Player native journey                       | `apps/player`                       | Server secrets and duplicated domain rules         |
| Pro native journey                          | `apps/pro`                          | HQ-only dense UI and client-owned money decisions  |
| Authorization, mutation, provider behavior  | `packages/api`                      | Route-local copies of business rules               |
| Schema or transaction                       | `packages/db`, then `packages/api`  | Client code and rewritten migration history        |
| Rating, league, schedule, pricing algorithm | Its pure package                    | Clocks, networks, environment, or database imports |
| Shared presentation or theme                | `packages/ui`                       | New local hex/token/font systems                   |
| Messaging delivery client                   | `packages/messaging-client`         | Provider-specific correctness assumptions          |
| Native WorkOS session                       | `packages/mobile-auth`              | Embedded client secrets                            |

## Trace the full request path

Before changing behavior, identify all five parts:

1. **Entry surface:** route, screen, deep link, cron, webhook, or agent tool.
2. **Identity:** public, WorkOS user, organization membership, platform role, or
   demo actor.
3. **Typed contract:** `public`, `player`, `operator`, `messaging`, `agent`, or
   `admin` procedure and its Zod input/output.
4. **Truth write/read:** repository adapter, transaction, immutable evidence,
   ledger, event stream, or provider object.
5. **Recovery path:** idempotent replay, cursor gap-fill, durable job, offline
   outbox, webhook retry, or explicit human review.

If one part is absent, the feature is probably only a UI projection or an
unsafe partial workflow.

## Non-negotiable engineering rules

- Organization access is resolved server-side from the signed-in actor. A
  client-provided organization ID never grants access.
- Every sensitive mutation is typed, scoped, idempotent, rate-limited where
  appropriate, and audited in the transaction that changes truth.
- Rally events, rating events, and ledger entries are append-only truth. Never
  replace evidence with a mutable summary.
- Stripe owns payment/custody truth. Duna records provider references and its
  own immutable accounting evidence.
- Store money in integer minor units with an ISO currency; store timestamps in
  UTC and render them in venue/user context.
- AI may read and propose. Money, messaging, publishing, pricing, identity,
  rating, and safety actions retain explicit role and confirmation gates.
- Forward-only Drizzle migrations are generated and reviewed. Never edit a
  migration already applied to a shared environment.
- Upstash accelerates messaging wakeups only. Neon cursor reads determine
  messaging correctness.
- Public and native environment variables are readable by users. They must not
  contain secrets.

## Validation ladder

Run the smallest relevant check during iteration, then the full proportional
gate before handoff:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm verify:mobile-runtime
pnpm build
pnpm test:e2e
pnpm verify
```

Useful focused checks:

```bash
pnpm --filter @duna/web test
pnpm --filter @duna/hq test
pnpm --filter @duna/player test
pnpm --filter @duna/pro test
pnpm --filter @duna/api test
pnpm --filter @duna/db typecheck
```

Connected verification scripts intentionally exercise external state. Read the
script and [`OPERATIONS.md`](OPERATIONS.md), confirm the target environment, and
understand cleanup before running one.

## Handoff checklist

Record each item separately; never collapse them into “done”:

- branch and exact commit used;
- files/surfaces changed;
- local checks and their results;
- migration generated/applied target, if any;
- exact Vercel deployment for Web and/or HQ, if any;
- exact EAS build/update ID and source commit, if any;
- authenticated browser or physical-device behavior verified;
- provider/account/store/counsel gates still open;
- documentation updated when ownership, routes, variables, or provider behavior
  changed.
