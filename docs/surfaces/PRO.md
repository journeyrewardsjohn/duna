# Duna Pro

`apps/pro` is the native field-operations app for coaches and organization
staff. It is an Expo/React Native application with EAS project
`@journey-rewards-inc/duna-pro`. `apps/pro/app.json` owns identifiers,
permissions, plugins, entitlements, widget configuration, update URL, and the
EAS project link.

HQ owns deep planning and administration; Pro owns the focused on-the-go action
against the same server contracts.

## Navigation and journeys

`apps/pro/App.tsx` defines five primary destinations:

| Destination | Job                                                                           |
| ----------- | ----------------------------------------------------------------------------- |
| Today       | Current sessions, arrivals, work queue, quick create, scoring, notes          |
| Courts      | Schedule, resources, blocks, attendance, scanning, session detail             |
| Money       | Guided in-person collection and earnings state                                |
| People      | Members, players, guardians, staff, profiles, invitations                     |
| More        | Messaging, team/roles, policies, organization tools, links to focused actions |

Focused full-screen surfaces handle creation, Get Paid, messaging, ticket/player
scanning, live scoring, and LiveKit session notes. Deep links can open an exact
conversation, match scorer, session, or organization.

## Runtime architecture

`ProRuntimeProvider` in `apps/pro/runtime.tsx` requires an organization-aware
WorkOS session, creates the typed API/messaging clients, loads operator
dashboard/workspace/members/events/matches, and owns organization switching and
sign-out cleanup.

`apps/pro/mobile-api.ts` calls the Web-hosted `AppRouter` with the WorkOS bearer
token. It also owns the organization-principal messaging delivery engine,
product-media upload, and LiveKit note-room request. Business rules remain in
`operator.*` procedures; the device does not decide organization scope,
inventory truth, fees, refunds, admission, or final payment state.

## Native capability map

| Capability              | Owning files/config                             | Critical boundary                                                                                 |
| ----------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Courtside scoring       | scorer in `App.tsx`, shared league engine/API   | Dark live zone, authoritative device, append-only events, reconnect                               |
| Tap to Pay/readers      | `get-paid.tsx`, Stripe Terminal plugin          | Server-created PaymentIntent and amount; physical supported device and entitlements               |
| Ticket/player check-in  | `ticket-scanner.tsx`, camera plugin             | Player registration and fan ticket validators remain separate; network failure never grants entry |
| Session voice notes     | `session-notes.tsx`, LiveKit WebRTC plugins     | Save is a private draft; publishing to players is a second explicit action                        |
| Arrival/ETA             | `arrival-location-task.ts`, Live Activities     | Explicit opt-in, bounded window, no raw-coordinate retention                                      |
| Messaging               | messaging files and SQLite outbox               | Organization relationship/scope checks, cursor convergence                                        |
| Live Activities/widgets | `live-activities.ts`, `DunaProLiveActivity.tsx` | New native build for target/capability changes                                                    |
| Product media           | `operator-create.tsx`, server upload route      | Short-lived authorized upload and server validation                                               |

See [`../MESSAGING_PLATFORM.md`](../MESSAGING_PLATFORM.md) and
[`../OPERATIONS.md`](../OPERATIONS.md) for delivery and payment/admission
contracts.

## Environment

Pro may read these public build-time names:

```text
EXPO_PUBLIC_DUNA_API_URL
EXPO_PUBLIC_DUNA_AUTH_URL
EXPO_PUBLIC_DUNA_HQ_URL
EXPO_PUBLIC_DUNA_PREVIEW
EXPO_PUBLIC_WORKOS_CLIENT_ID
```

Configure the API URL explicitly in every EAS environment; do not rely on a
compiled fallback when releasing. All `EXPO_PUBLIC_*` values are public. Server
payment, WorkOS, LiveKit, database, R2, APNs, and provider credentials belong in
the Vercel/server environment, never Pro.

## Local development

```bash
pnpm --filter @duna/pro start
pnpm --filter @duna/pro ios
pnpm --filter @duna/pro android
```

Most signature Pro workflows cannot be validated in Expo Go. Use an EAS
development/preview build for LiveKit WebRTC, background location, notifications,
widgets/Live Activities, camera scanning, and Stripe Terminal.

```bash
cd apps/pro
pnpm dlx expo-doctor
pnpm dlx eas-cli project:info
pnpm dlx eas-cli build --platform ios --profile preview-simulator
pnpm dlx eas-cli build --platform android --profile preview
```

`apps/pro/eas.json` defines `development`, `preview`, `preview-simulator`,
`testflight`, and `production`, with app-version runtime matching. JavaScript
updates require the explicit EAS environment; native/config changes require a
fresh binary.

```bash
cd apps/pro
pnpm dlx eas-cli update --channel production --environment production --message "describe the update"
```

## Validation

```bash
pnpm --filter @duna/pro lint
pnpm --filter @duna/pro typecheck
pnpm --filter @duna/pro test
pnpm verify:mobile-runtime
pnpm --filter @duna/pro export
```

For operational work, verify the actor role and organization, offline/retry,
duplicate scanning/payment attempts, deep links, permission denial, bright
glare, large text, and a physical device. Build, upload, TestFlight/Play
processing, entitlement approval, and live provider activation are separate
gates.
