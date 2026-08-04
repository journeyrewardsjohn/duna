# Duna

**The operating system for sand. The network for everyone who plays on it.**

Duna is a two-sided beach-volleyball platform:

- **Duna** gives players and parents identity, Sand Rating, discovery, pickup,
  match recording, event entry, community, and wallet experiences.
- **Duna Pro** and **Duna HQ** give coaches, clubs, facilities, leagues, and
  tournament operators scheduling, scoring, commerce, messaging, reporting,
  and venue operations.
- **Duna Admin** gives the platform team trust-and-safety, organization,
  integrity, money-movement, feature-gate, and system-health controls.

## Workspace

| Path                     | Surface                                                      |
| ------------------------ | ------------------------------------------------------------ |
| `apps/web`               | Marketing, public profiles, player web app                   |
| `apps/hq`                | Operator HQ, platform admin, super admin                     |
| `apps/player`            | Duna Expo app                                                |
| `apps/pro`               | Duna Pro Expo app                                            |
| `apps/voice-agent`       | Private LiveKit player-onboarding voice guide                |
| `packages/api`           | Typed procedures, authorization, audit, integration adapters |
| `packages/db`            | Drizzle schema, migrations, Neon access                      |
| `packages/rating`        | Pure Sand Rating engine                                      |
| `packages/league-engine` | Pure scoring, standings, and bracket engine                  |
| `packages/scheduling`    | Pure availability and tournament schedulers                  |
| `packages/pricing`       | Pure fee engine                                              |
| `packages/core`          | Shared domain types, eligibility, i18n, demo fixtures        |
| `packages/ui`            | Shared visual tokens and cross-surface primitives            |

## Local development

```bash
pnpm install
pnpm dev
```

Copy `.env.example` to `.env.local` for connected services. Without connected
credentials, the apps run in a seeded, clearly labeled demo environment so the
entire product can still be explored and tested.

## Guided player onboarding

Player onboarding is available at `/app/onboarding` on the web and from the
Profile tab in the Duna mobile app. The typed flow always works. Connecting
`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, and `OPENAI_API_KEY`
adds the optional voice conversation:

```bash
pnpm --filter @duna/voice-agent dev
```

The browser receives a short-lived, room-scoped participant token. The agent
asks only about playing history and returns a transcript for the player or
parent to review. It does not collect identity documents, payment credentials,
an exact birth date, or an address.

Stripe Identity is a separate, Stripe-hosted flow for adults who need payout
eligibility. Duna stores the provider session reference and status, never the
document or selfie.

## Connected previews

- Player, parent, and public network: <https://duna-web.vercel.app>
- Club, coach, facility, and platform operations: <https://duna-hq.vercel.app>

The hosted previews use the connected Neon production branch and Stripe test
mode. Real-money activation, identity onboarding, messaging delivery, and store
distribution remain deliberately gated until the responsible account owner
completes the required third-party attestations.

## Quality gate

```bash
pnpm verify
```

This runs formatting checks, type checks, unit/property tests, production
builds, and browser tests.

The product and technical acceptance matrix lives in
[`docs/BUILD_MATRIX.md`](docs/BUILD_MATRIX.md).

Connected-environment and release procedures live in
[`docs/OPERATIONS.md`](docs/OPERATIONS.md).

The iOS-first live-streaming, upload, playback, privacy, and video-governance
architecture lives in [`docs/VIDEO_PLATFORM.md`](docs/VIDEO_PLATFORM.md).
