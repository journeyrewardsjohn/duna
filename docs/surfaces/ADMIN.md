# Duna Admin

Duna Admin is the platform control plane inside `apps/hq`. It is served under
`/admin`, uses the same Vercel deployment as HQ, and is intentionally separated
from organization operations by server-resolved platform roles.

## Ownership

`apps/hq/components/navigation.ts` defines the current modules:

| Group     | Modules                                                                                                                               | Purpose                                                                  |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Network   | Network, Organizations                                                                                                                | Platform state and organization oversight                                |
| Integrity | Trust + safety, Duna Support, Message safety, Ratings, Sand data, Pro tour, Player profiles, Player mapping, Ratings lab, Predictions | Evidence, identity, moderation, ingestion, and model review              |
| Platform  | Payments, Video + Premium, Audit log, Feature flags, System health                                                                    | Money/provider oversight, immutable evidence, controlled rollout, health |

Admin may inspect or repair platform state through typed procedures. It is not
a shortcut around player/operator workflows, provider truth, or evidence
review.

## Access boundary

The shared context resolver combines the WorkOS identity with persisted Duna
roles and active organization membership. Platform roles are `admin` and
`super-admin`; procedures declare the required role/scope.

`DUNA_ADMIN_EMAILS` and `DUNA_SUPER_ADMIN_EMAILS` are server-only bootstrap
allowlists for explicitly approved environments. WorkOS user metadata can also
bootstrap the platform role, and the resulting role is persisted in
`admin_roles`. These mechanisms are not client configuration and must never be
sent to the browser or Expo.

All Admin pages must fail closed. Hiding navigation is not authorization; the
procedure must reject an actor without the platform role.

## Mutation contract

Admin mutations that affect identity, rating evidence, guardianship, payments,
publishing, safety, mappings, or feature flags must preserve:

1. exact typed input and output;
2. explicit actor role/scope;
3. evidence/reason fields where review is required;
4. idempotency key and replay behavior;
5. rate limiting proportionate to the operation;
6. before/after audit evidence in the same transaction;
7. provider re-read or projection rebuild where the provider/event stream is
   authoritative;
8. no activation from an AI proposal without a fresh human confirmation.

Do not add direct SQL controls to an Admin component. The Admin route calls an
`admin.*` procedure; the procedure owns the transaction and audit record.

## Data and model operations

- Sand imports preserve source IDs, raw evidence, checkpoints, ambiguity, and
  approval state. New or uncertain identities remain staged.
- Profile claims never merge automatically. Professional claims require
  official evidence and manual review.
- A match dispute removes the evidence from the projection while reviewed; a
  decision rebuilds the projection chronologically.
- Rating backtests publish immutable pre-match forecasts and diagnostics. A
  winning model is not automatically activated.
- Feature flags are scoped, default-safe, and audited; a UI toggle is not a
  deployment or migration.
- Messaging moderation retains guardian and youth fail-closed rules described
  in [`../MESSAGING_PLATFORM.md`](../MESSAGING_PLATFORM.md).

See [`../API.md`](../API.md) and [`PLATFORM.md`](PLATFORM.md) for procedure and
data-layer contracts.

## Where to change code

| Need                   | Location                                              |
| ---------------------- | ----------------------------------------------------- |
| Admin route            | `apps/hq/app/admin/**`                                |
| Admin shell/navigation | `apps/hq/components/admin-shell.tsx`, `navigation.ts` |
| Admin workspace        | `apps/hq/components/*admin*`, `admin-panels.tsx`      |
| Role/scope/context     | `packages/api/src/context.ts`, `auth.ts`              |
| Admin procedures       | `packages/api/src/router.ts` and owning service       |
| Evidence/schema/audit  | `packages/db/src/schema.ts`, forward migration        |

## Validation

Test at least three states when access changes: approved role, authenticated but
unapproved role, and unauthenticated. For a write, also test replay/conflict,
audit evidence, and the downstream projection/provider state. Production proof
requires an authenticated Admin route and the exact HQ deployment commit, not
only a public HTTP response.
