# Duna shared platform

The shared platform is a set of workspace packages, not a separately deployed
monolith. Web and HQ execute the same server contracts in their own Vercel
runtimes; Player and Pro call the Web-hosted HTTP adapters.

## Package ownership

| Package                  | Owns                                                                                                    | Must not own                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `@duna/api`              | AppRouter, context/auth, scoped procedures, services, transactions, audit, provider adapters, workflows | UI state or client-trusted tenancy                   |
| `@duna/db`               | Drizzle schema, Neon clients, migration/seed entry points                                               | Product authorization or route behavior              |
| `@duna/core`             | Domain types, eligibility, ledger/wallet primitives, trust, reporting, i18n, fixtures                   | Network, database, clock-driven side effects         |
| `@duna/rating`           | Deterministic Sand Rating and evaluation math                                                           | Database reads, active configuration, identity merge |
| `@duna/league-engine`    | Scoring, standings, brackets                                                                            | Persistence or authoritative-device selection        |
| `@duna/scheduling`       | Availability and tournament scheduling                                                                  | Calendar provider calls or publication               |
| `@duna/pricing`          | Deterministic fee/order calculations                                                                    | Stripe calls, plan entitlement, custody              |
| `@duna/ui`               | Brand/type/theme/zone tokens and reusable primitives                                                    | Surface-specific policy or raw local design systems  |
| `@duna/messaging-client` | Cursor sync, wake parsing, retry/offline delivery contracts                                             | Message authorization or source-of-truth storage     |
| `@duna/mobile-auth`      | WorkOS PKCE, SecureStore session, refresh, organization selection                                       | WorkOS client secret or Duna role decisions          |

## Typed API surface

`packages/api/src/router.ts` exports one `AppRouter` with six namespaces:

| Namespace   | Audience                        | Guard                                                            |
| ----------- | ------------------------------- | ---------------------------------------------------------------- |
| `public`    | Anonymous/public projections    | Public procedure plus output minimization                        |
| `player`    | Player/guardian product actions | WorkOS actor and declared player scope                           |
| `operator`  | Organization staff              | Active organization membership and declared scope                |
| `messaging` | User or organization principals | Relationship, participant, age/guardian, block, and cursor rules |
| `agent`     | Duna/partner agents             | Public reads or authenticated scoped tools with risk registry    |
| `admin`     | Platform control plane          | Persisted Admin/Super Admin role and procedure-specific gate     |

Every procedure has Zod input/output. Sensitive mutations run through the
idempotency and audit contracts; rate limits are stored in Postgres so separate
server instances share enforcement.

## Request context

`packages/api/src/context.ts` resolves the actor from WorkOS or the explicit
demo path. It maps organization roles to Duna scopes, synchronizes known
identity/organization records, selects only an active organization membership,
and adds persisted platform roles and guardianship context.

The resulting actor—not an organization ID in a route, cookie, header, or body—
is authority. Any new adapter must create the same context before calling a
protected procedure.

## Repository and data modes

`packages/api/src/repository.ts` selects the connected repository only when a
database is configured and `DUNA_DATA_SOURCE` is not `demo`. Otherwise it
returns deterministic demo projections.

The demo adapter is an intentional development/test mode. Never let a connected
deployment silently fall back to it. Health endpoints and authenticated product
checks should distinguish “provider not configured” from “provider healthy.”

## Database and transaction model

`packages/db/src/client.ts` exposes:

- a Neon HTTP Drizzle client for ordinary reads/writes;
- a Neon serverless transactional client for atomic multi-step mutations.

The schema groups identity/guardianship, organizations, venues/schedules,
catalog/inventory, registrations/operations, competition/rating/imports,
video/Vision/Health, predictions, orders/payments/ledgers, ticketing, privacy,
social/messaging, audit/idempotency/rate limits, and durable workflows.

Core truth rules:

- rally events are scoring truth;
- rating events/configuration versions are rating truth;
- ledger journals/entries are balance truth;
- Stripe objects are payment/custody truth;
- imports retain provenance and ambiguity;
- messages use conversation-local sequence plus client UUID;
- audit evidence is committed with the mutation;
- migrations are forward-only.

## Durable side effects

Webhook handlers verify signatures, persist/deduplicate the raw provider event,
and enqueue a workflow job in Neon before dispatch. `/api/inngest` processes and
recovers jobs, but provider ingress remains durable if Inngest is briefly
unavailable.

Messaging commits content and cursor truth to Neon first, then schedules a
best-effort Upstash publish. Failure to publish never rolls back a valid message;
clients reconcile from Neon on foreground, reconnect, wake, and polling.

Native offline outboxes reuse stable client IDs so retries are idempotent.

## Adding a feature

1. Put pure calculation in the relevant deterministic package.
2. Add shared types/schema and a forward migration if persistence changes.
3. Implement the service transaction and provider boundary in `packages/api`.
4. Expose the smallest scoped procedure with explicit Zod contracts.
5. Project it into each affected surface without duplicating policy.
6. Add unit/contract/replay/denial tests, then connected checks if required.
7. Update the surface, environment, infrastructure, and specialist docs when
   contracts or dependencies changed.

## Validation

```bash
pnpm --filter @duna/core test
pnpm --filter @duna/rating test
pnpm --filter @duna/league-engine test
pnpm --filter @duna/scheduling test
pnpm --filter @duna/pricing test
pnpm --filter @duna/api test
pnpm --filter @duna/db typecheck
pnpm verify
```

Connected scripts under `scripts/verify-*` can write isolated test records and
clean them up. Confirm the target database/provider and read the script before
running it. External agents should use tRPC/MCP, never a database credential.
