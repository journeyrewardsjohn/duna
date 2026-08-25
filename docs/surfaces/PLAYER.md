# Duna Player

`apps/player` is the native Duna experience for players and guardians. It is an
Expo/React Native application with EAS project
`@journey-rewards-inc/duna-player`. `apps/player/app.json` is the source of
truth for the app slug, custom URL scheme, bundle/package identifiers,
permissions, plugins, targets, update URL, and EAS project link.

## Navigation and journeys

`apps/player/App.tsx` defines five persistent dock actions:

| Dock action   | Job                                                                                   |
| ------------- | ------------------------------------------------------------------------------------- |
| Home          | Personal next commitment, recent outcomes, direct actions, game context               |
| Calendar      | Plans, bookings, training, hosted play, and full calendar                             |
| Duna AI       | Full-screen contextual assistant inside the messaging shell                           |
| Quick actions | Temporary sheet for scoring, discovery, hosting, booking, events, coaching, and video |
| Messages      | Full-screen human conversation inbox and threads                                      |

Secondary surfaces include score upload, video/Vision studio, performance,
Duna Health, wallet and prediction portfolio, messaging, profile/artwork
editing, booking management, organization/coach/venue views, pickup hosting,
and Watch-score review.

The implementation-grade inventory of every current screen, state, entry point,
handoff, and interconnection is in
[`PLAYER_SCREEN_INVENTORY.md`](PLAYER_SCREEN_INVENTORY.md). Use it as the
required route/state checklist for Player redesign work.

Deep links currently route messaging, bookings, and live-match context back to
the owning screen. Authentication returns through the `auth/callback` path on
the app's custom scheme. Update both routing code and provider redirect
registration when adding a deep link.

## Runtime architecture

`PlayerRuntimeProvider` in `apps/player/runtime.tsx` owns live/demo selection,
authentication, API clients, dashboard/settings/profile data, messaging
delivery, refresh, and sign-out cleanup. `apps/player/mobile-api.ts` creates a
typed tRPC client against Duna Web and attaches a current WorkOS bearer token.

Native identity uses `packages/mobile-auth`:

- browser-based WorkOS authorization through Expo AuthSession/WebBrowser;
- authorization-code flow with PKCE and the app callback scheme;
- no WorkOS client secret in the app;
- short-lived access token, refresh token, expiry, and selected organization in
  iOS/Android encrypted SecureStore;
- server-side code exchange and refresh at Duna Web `/api/auth/mobile/*`.

When a club requires a waiver, the Player purchase journey takes payment first,
then renders the full version in-app and requires reaching the end, one
key-section verification, and a typed name when configured. A minor’s guardian
signature is verified server-side before participation can continue; a secure
completion link can be shared with the remaining signer. The complete contract is in
[`../WAIVERS_AND_RELEASES.md`](../WAIVERS_AND_RELEASES.md).

Messaging uses the shared cursor engine plus a native SQLite outbox. Neon is
the message source of truth; push notifications and Upstash SSE only prompt a
faster gap-fill.

## Native capability map

| Capability                        | Owning files/config                                                 | Release implication                                                |
| --------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| HealthKit read and encrypted sync | `health-kit.ts`, `health-screen.tsx`, `app.json`                    | Physical iPhone, entitlement, privacy labels; never OTA-only proof |
| Video, live, Vision, camera       | `video-studio.tsx`, Vision services, Mux/R2 server routes           | Camera/mic/device/provider validation                              |
| Live Activities/widgets           | `live-activities.ts`, `DunaLiveActivity.tsx`, `expo-widgets` config | Fresh compatible native build when target/capability changes       |
| Watch scoring                     | `watch-scoring.ts`, Apple-target plugin/source                      | Fresh paired iPhone/Watch build and receipt/reconnect tests        |
| Apple Pay                         | `native-payments.ts`, Stripe plugin/merchant configuration          | Entitlement, merchant setup, physical/sandbox payment proof        |
| Map and travel                    | `discovery-map.tsx`, location task, Mapbox/Routes                   | Public Mapbox token only; location consent and background limits   |
| Calendar/contacts                 | calendar and discovery flows, Expo plugins                          | Permission-denied and partial-access paths                         |
| Notifications                     | `messaging-notifications.ts`                                        | APNs/FCM credentials, signed build, opt-in behavior                |

The authoritative privacy and behavior details are in
[`../HEALTH_PRIVACY.md`](../HEALTH_PRIVACY.md),
[`../VIDEO_PLATFORM.md`](../VIDEO_PLATFORM.md), and
[`../MESSAGING_PLATFORM.md`](../MESSAGING_PLATFORM.md).

## Environment

The app may read these public build-time names:

```text
EXPO_PUBLIC_DUNA_API_URL
EXPO_PUBLIC_DUNA_AUTH_URL
EXPO_PUBLIC_DUNA_WEB_URL
EXPO_PUBLIC_DUNA_PREVIEW
EXPO_PUBLIC_MAPBOX_API_TOKEN
EXPO_PUBLIC_WORKOS_CLIENT_ID
```

Every `EXPO_PUBLIC_*` value is extractable from the installed app. It may
contain a public client identifier or publishable token, never an API secret,
database URL, signing key, or provider admin token. EAS project/environment
configuration and storage rules are in
[`../ENVIRONMENT_VARIABLES.md`](../ENVIRONMENT_VARIABLES.md).

## Local development

```bash
pnpm --filter @duna/player start
pnpm --filter @duna/player ios
pnpm --filter @duna/player android
```

Expo Go is useful only for compatible JavaScript/UI work. Use a development or
preview build when the journey uses a custom native module or entitlement.

```bash
cd apps/player
pnpm dlx expo-doctor
pnpm dlx eas-cli project:info
pnpm dlx eas-cli build --platform ios --profile preview-simulator
pnpm dlx eas-cli build --platform android --profile preview
```

## EAS profiles and updates

`apps/player/eas.json` defines `development`, `preview`, `preview-simulator`,
`testflight`, and `production`. The app uses app-version runtime matching, so an
update can reach only a compatible binary/channel.

| Change                                                                           | Delivery                                                    |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| TypeScript/JS/assets only, compatible native runtime                             | EAS Update may be appropriate                               |
| `app.json`, plugin, permission, entitlement, native package, Watch/widget target | New EAS build required                                      |
| Store metadata, signing, capability, or provisioning                             | New signed build and separate submission/store verification |

For SDK 55+, publish updates with an explicit EAS environment. Build-profile
`env` values are not automatically the update environment, so verify every
required public variable exists in EAS before publishing.

```bash
cd apps/player
pnpm dlx eas-cli update --channel production --environment production --message "describe the update"
```

Never publish from an unverified working tree. Inspect the generated bundle and
the resulting update/build source commit. See
[`../INFRASTRUCTURE.md`](../INFRASTRUCTURE.md) for build, submit, and exact-SHA
verification.

## Validation

```bash
pnpm --filter @duna/player lint
pnpm --filter @duna/player typecheck
pnpm --filter @duna/player test
pnpm verify:mobile-runtime
pnpm --filter @duna/player export
```

Also test the relevant physical-device capability, permission denied/partial
states, offline/reconnect, Dynamic Type, one-handed targets, bright glare,
light/dark/match-device preference, and deep-link return. An export proves the
bundle, not signing, installation, paired Watch behavior, TestFlight processing,
or App Store availability.
