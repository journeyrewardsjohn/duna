# Duna

**The operating system for sand. The network for everyone who plays on it.**

Duna is a two-sided beach-volleyball platform:

- **Duna** gives players and parents identity, Sand Rating, discovery, pickup,
  match recording, event entry, community, health, video, and wallet
  experiences.
- **Duna Pro** and **Duna HQ** give coaches, clubs, facilities, leagues, and
  tournament operators scheduling, scoring, commerce, messaging, reporting,
  and venue operations.
- **Duna Admin** gives the platform team default-deny trust-and-safety,
  organization, integrity, money-movement, feature-gate, and system-health
  controls.

## Start here

New contributors and agents should read these in order:

1. [`AGENTS.md`](AGENTS.md) — product, design, accessibility, and definition-of-done contract.
2. [`docs/START_HERE.md`](docs/START_HERE.md) — setup, reading order, change workflow, and handoff checklist.
3. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — runtime topology, trust boundaries, data flow, and package ownership.
4. The guide for the surface being changed:
   - [Duna Web](docs/surfaces/WEB.md)
   - [Duna HQ](docs/surfaces/HQ.md)
   - [Duna Admin](docs/surfaces/ADMIN.md)
   - [Duna Player](docs/surfaces/PLAYER.md)
   - [Duna Pro](docs/surfaces/PRO.md)
   - [Voice agents](docs/surfaces/VOICE_AGENTS.md)
   - [Shared platform](docs/surfaces/PLATFORM.md)
5. [`docs/ENVIRONMENT_VARIABLES.md`](docs/ENVIRONMENT_VARIABLES.md) and
   [`docs/INFRASTRUCTURE.md`](docs/INFRASTRUCTURE.md) before connecting any
   provider or deployment.

The complete documentation index is in [`docs/README.md`](docs/README.md).

## Workspace

| Path                        | Ownership                                                                      | Guide                                                                |
| --------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| `apps/web`                  | Public editorial, player web, events, Pro tour, live views, checkout, API host | [Duna Web](docs/surfaces/WEB.md)                                     |
| `apps/hq`                   | Operator workspace and Duna Admin control plane                                | [Duna HQ](docs/surfaces/HQ.md), [Duna Admin](docs/surfaces/ADMIN.md) |
| `apps/player`               | Duna Player Expo app, Live Activities, Health, Vision, Watch scoring           | [Duna Player](docs/surfaces/PLAYER.md)                               |
| `apps/pro`                  | Duna Pro Expo app, courtside operations, scanning, Tap to Pay, Live Activities | [Duna Pro](docs/surfaces/PRO.md)                                     |
| `apps/voice-agent`          | Private LiveKit profile guide and coach session-note scribe                    | [Voice agents](docs/surfaces/VOICE_AGENTS.md)                        |
| `packages/api`              | Typed procedures, authorization, audit, workflows, provider adapters           | [Shared platform](docs/surfaces/PLATFORM.md)                         |
| `packages/db`               | Drizzle schema, forward-only migrations, Neon clients                          | [Shared platform](docs/surfaces/PLATFORM.md)                         |
| `packages/core`             | Shared domain contracts, eligibility, ledger, i18n, demo fixtures              | [Shared platform](docs/surfaces/PLATFORM.md)                         |
| `packages/rating`           | Pure Sand Rating engine                                                        | [Shared platform](docs/surfaces/PLATFORM.md)                         |
| `packages/league-engine`    | Pure scoring, standings, and bracket engine                                    | [Shared platform](docs/surfaces/PLATFORM.md)                         |
| `packages/scheduling`       | Pure availability and tournament schedulers                                    | [Shared platform](docs/surfaces/PLATFORM.md)                         |
| `packages/pricing`          | Pure fee engine using integer minor units                                      | [Shared platform](docs/surfaces/PLATFORM.md)                         |
| `packages/messaging-client` | Owned cursor-sync and offline delivery contracts                               | [Messaging platform](docs/MESSAGING_PLATFORM.md)                     |
| `packages/mobile-auth`      | WorkOS AuthSession/PKCE and encrypted native session storage                   | [Shared platform](docs/surfaces/PLATFORM.md)                         |
| `packages/ui`               | Brand tokens, type, theme/zone semantics, shared primitives                    | [Design index](docs/design/README.md)                                |

## Local development

Requirements are Node.js `>=22.18.0` and the pnpm version declared in
`package.json`.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

The web app runs on `http://localhost:3000`; HQ runs on
`http://localhost:3001`. With no provider credentials, both use the explicit
demo adapter. For connected development, create ignored app-local environment
files from `.env.example` and follow the scope rules in
[`docs/ENVIRONMENT_VARIABLES.md`](docs/ENVIRONMENT_VARIABLES.md). Never copy a
production secret into source, documentation, an Expo public variable, or a
client bundle.

Common focused commands:

```bash
pnpm dev:web
pnpm dev:hq
pnpm --filter @duna/player start
pnpm --filter @duna/pro start
pnpm --filter @duna/voice-agent dev
```

## Connected services

The current provider map, account/project names, access checks, safe CLI
commands, database workflow, and deployment verification steps live in
[`docs/INFRASTRUCTURE.md`](docs/INFRASTRUCTURE.md). The canonical variable-name
catalog lives in
[`docs/ENVIRONMENT_VARIABLES.md`](docs/ENVIRONMENT_VARIABLES.md); values remain
in ignored local files or provider-encrypted stores.

## Quality and release

```bash
pnpm verify
```

This checks formatting, design/type contracts, lint, types, unit/property
tests, native runtime alignment, production builds, and responsive browser
journeys. A green build is evidence for that gate only. Web, HQ, each native
platform, provider configuration, migrations, store submission, and live
authenticated behavior are verified independently.

- Product and technical status: [`docs/BUILD_MATRIX.md`](docs/BUILD_MATRIX.md)
- Connected checks and release sequence: [`docs/OPERATIONS.md`](docs/OPERATIONS.md)
- Internal tRPC/API contract: [`docs/API.md`](docs/API.md)
- Public agent/MCP contract: [`docs/MCP.md`](docs/MCP.md)
- Messaging: [`docs/MESSAGING_PLATFORM.md`](docs/MESSAGING_PLATFORM.md)
- Video and Vision: [`docs/VIDEO_PLATFORM.md`](docs/VIDEO_PLATFORM.md)
- Health privacy: [`docs/HEALTH_PRIVACY.md`](docs/HEALTH_PRIVACY.md)
