# Duna HQ

`apps/hq` is the calm, dense browser workspace for owners, managers, coaches,
front-desk staff, scorekeepers, and accountants. It deploys as Vercel project
`suttonx/duna-hq`, project root `apps/hq`, with the connected domain
`https://hq.duna.coach`.

Duna Admin is implemented in the same application but has a separate role and
navigation boundary; see [`ADMIN.md`](ADMIN.md).

## Operator navigation

`apps/hq/components/navigation.ts` is the navigation source of truth.

| Group     | Modules                                                   | Primary ownership                               |
| --------- | --------------------------------------------------------- | ----------------------------------------------- |
| Today     | Overview, Calendar                                        | Daily state, schedule, arrivals, quick actions  |
| Run       | Venues, People, Team, Products, Events, Leagues, Messages | Organization operations and delivery            |
| Grow      | Money, Marketing, Reports, Duna AI                        | Commerce, reporting, drafts, proposals          |
| Configure | Settings                                                  | Organization profile, billing, themes, controls |

Specialized routes supplement the module routes:

- `/onboarding` and `/payments/setup` for organization activation;
- `/locations/*` for venue, court, availability, and layout workflows;
- `/events/*` and `/leagues/create` for competition operations;
- `/products/*` for catalog and inventory;
- `/members/*`, `/team/*`, and invitation routes for people;
- `/messages/*` for the organization inbox;
- `/account` and `/settings/theme` for account and theme controls.

## Runtime and data path

HQ server components call `getServerCaller()` in `apps/hq/lib/api.ts`, which
resolves the WorkOS organization session and invokes the shared `AppRouter` in
process. Operator procedures require both an organization context and the
declared scope before any query or mutation runs.

The organization ID rendered by a page is not authority. Keep organization
resolution, membership activity, role mapping, and scope checks in
`packages/api`. The client may select or display an organization, but the
server must prove the actor is an active member.

HQ protocol routes exist for media upload, messaging cursor/SSE delivery,
LiveKit note tokens, Places/Mapbox proxies, venue-layout analysis, scheduled
event operations, and scheduled professional-data ingestion.

## Vercel and migrations

`apps/hq/vercel.json` runs the database migrator before the application build:

```text
pnpm --filter @duna/db migrate && pnpm build
```

That makes every HQ deployment a schema-sensitive release. A migration must be
forward-only, reviewed, tested against an isolated Neon branch, and compatible
with the concurrently deployed Web/native clients. Do not use a deployment to
discover whether unreviewed SQL is safe.

The same file declares event-operations and Sand-data crons. The current
schedule and manual checks are documented in
[`../OPERATIONS.md`](../OPERATIONS.md); the configuration file remains the
executable source of truth.

## Where to change code

| Need                         | Location                                                 |
| ---------------------------- | -------------------------------------------------------- |
| Route and server composition | `apps/hq/app/**`                                         |
| Operator shell/navigation    | `apps/hq/components/operator-shell.tsx`, `navigation.ts` |
| Reusable operator workflow   | `apps/hq/components/**`                                  |
| HQ-only parsing/view helper  | `apps/hq/lib/**`                                         |
| Organization contract/policy | `packages/api`                                           |
| Schema/transaction           | `packages/db`                                            |
| Schedule solver              | `packages/scheduling`                                    |
| Shared UI/token              | `packages/ui`                                            |
| On-the-go equivalent         | `apps/pro`                                               |

HQ and Pro should share typed operations, not copy business logic. HQ can offer
the deeper planning/editing experience; Pro should expose the focused field
action for the same server-owned object.

## High-risk workflows

- **Money:** amounts, fees, destination accounts, refunds, and ledger postings
  are server-owned and provider-confirmed.
- **Scoring:** authoritative-device state and append-only events survive
  reconnect/replay.
- **Publishing:** drafts and previews do not mutate public state until an
  explicit publish procedure succeeds.
- **People/minors:** guardian, consent, role, and scope checks are re-evaluated
  server-side.
- **Waivers & releases:** Settings owns the club-scoped library and immutable
  revisions. Imported files are review drafts; only reviewed text is published.
  See [`../WAIVERS_AND_RELEASES.md`](../WAIVERS_AND_RELEASES.md).
- **AI:** Duna AI produces proposals; publishing, messaging, pricing, and money
  require a fresh human confirmation.
- **Venue layout:** draft, preview, publish, and court creation are distinct
  states; preview must remain non-mutating.

## Team invitations and organization roles

The Team invitation flow makes a private claim link the primary handoff. It is
created without an email address or phone number, returned to the authorized
inviter immediately, and appears in Pending team access for the seven-day
claim window. Email and SMS are optional delivery channels for that same
claim link; a delivery failure never prevents the inviter from copying it.

Director access is ownership-controlled, not an inviteable staff role. This
keeps a staff-management link from creating a new organization owner. Existing
Directors and Managers may invite Coaches, Managers, Front Desk, and
Accountants. The service rechecks this rule, the organization boundary, and
the role target server-side; hiding a role in HQ is never the authorization
boundary.

| Role       | HQ access                                                                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Director   | Organization ownership, financial configuration, ordinary operational settings, and team administration. More than one Director may exist through the ownership workflow. |
| Manager    | Operational settings and team invitations, but no Director creation or financial configuration.                                                                           |
| Coach      | Read-only organization schedule, events, and catalog context; may take a payment at point of service.                                                                     |
| Front Desk | Registrations, schedules, event creation, leagues, tournaments, check-ins, and point-of-service payment collection.                                                       |
| Accountant | Read-only access to money reports and financial records.                                                                                                                  |

Point-of-service collection uses the separate `payments:collect` capability.
It deliberately does not grant `payments:write`, which protects Stripe,
commerce, refunds, pricing, and other financial configuration routes.

### Super Admin organization access

The organization detail screen in Super Admin can grant an existing Duna user
access by email, or create a private-link/email invitation for someone who has
not joined Duna yet. It is the only UI that can assign **Director**, which
creates an active `owner` membership plus the `director` staff profile and
allows multiple organization owners.

For a person and organization already linked to WorkOS, the grant updates the
matching WorkOS organization membership in the same operation (`director`
maps to the WorkOS `owner` role). If either side has not been linked yet, Duna
records the role and returns `not-linked` rather than falsely claiming a WorkOS
sync. Production must set `DATABASE_URL`, `WORKOS_API_KEY`, and
`WORKOS_CLIENT_ID` for a linked grant to be actionable.

## Local development

```bash
pnpm dev:hq
```

HQ runs on `http://localhost:3001`. Configure ignored
`apps/hq/.env.local` only with the variable groups required by the workflow.
Connected HQ must set `DUNA_DATA_SOURCE=database`; visible demo metrics in a
connected environment are a release failure.

## Validation and release

```bash
pnpm --filter @duna/hq lint
pnpm --filter @duna/hq typecheck
pnpm --filter @duna/hq test
pnpm --filter @duna/hq build
pnpm test:e2e
```

Validate the changed role and a role that should be denied. For production,
verify migration success, exact deployment commit, WorkOS organization scope,
authenticated browser behavior, light/dark/glare/responsive states, and any
provider action. A root-page `200` does not prove the authenticated module or
its data is healthy.
