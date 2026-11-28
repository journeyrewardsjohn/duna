# Releasing Duna and Duna Pro to TestFlight

Dated 28 November 2026 (work package M-P0). How to build and submit both iOS
apps with the `testflight` profile, what is configured in the repository, and
what only the owner can do in App Store Connect. Local builds and the
simulator matrix are in [`BUILDING.md`](BUILDING.md); the owner's full
production list is [`docs/plan/production-readiness.md`](../plan/production-readiness.md)
(section "Apple").

Nothing here has been run against Apple or EAS by an agent: agents never sign
in, never run `eas`, and never submit. A TestFlight build exists only when the
owner has run the commands below and App Store Connect shows it.

## The two apps

|                      | Duna (Player)                                                                        | Duna Pro                                           |
| -------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------- |
| Folder               | `apps/player`                                                                        | `apps/pro`                                         |
| Bundle id            | `com.duna.player`                                                                    | `com.duna.pro`                                     |
| App Store Connect id | 6796792115 (`eas.json` → `submit.testflight`)                                        | 6796792651                                         |
| EAS project          | `87615942-8a2d-47e3-9dc4-334e427a5944`                                               | `c3898acf-d6cd-4667-8dfc-570354c4d566`             |
| Version              | 2.0.0 (build number set remotely, auto-incremented)                                  | 2.0.0                                              |
| Minimum iOS          | 26.0                                                                                 | 26.0                                               |
| Devices              | iPhone, iPad (universal, resizable), iPhone Duo                                      | same                                               |
| Extensions           | Apple Watch app (`DunaWatch`), widgets / Live Activities (`com.duna.player.widgets`) | widgets / Live Activities (`com.duna.pro.widgets`) |
| EAS build image      | `macos-tahoe-26.6-xcode-27.2`                                                        | same                                               |

The update runtime policy is `appVersion`: 2.0.0 is a new over-the-air
runtime. Never publish an `eas update` to 2.0.0 before the 2.0.0 binaries are
on TestFlight.

## Before building (engineering, from the repository root)

```sh
pnpm install --frozen-lockfile
pnpm verify:mobile-runtime        # React pins, iOS 26 minimum, universal and resizable, HealthKit strings
pnpm verify:design-system
pnpm --filter @duna/player test
pnpm --filter @duna/player export # the JavaScript bundles CI builds too
pnpm --filter @duna/pro export
```

and one simulator smoke run of each app per [`BUILDING.md`](BUILDING.md).

## Build and submit (the owner, signed in to the Expo account `journey-rewards-inc`)

Duna (Player):

```sh
cd apps/player
eas build --platform ios --profile testflight
eas submit --platform ios --profile testflight --latest
```

Duna Pro:

```sh
cd apps/pro
eas build --platform ios --profile testflight
eas submit --platform ios --profile testflight --latest
```

Or in one step per app: `eas build --platform ios --profile testflight --auto-submit-with-profile testflight`.

The `testflight` build profile is `distribution: "store"`, `autoIncrement:
true`, channel `testflight`, and sets `EXPO_PUBLIC_DUNA_PREVIEW=false` with the
production web, API and sign-in addresses. Build the two apps one after the
other. When EAS asks to sync capabilities or create provisioning profiles,
accept: the capabilities listed below must be on each App ID.

Production updates later: `eas build --platform ios --profile production`
(also `autoIncrement`; `submit.production` still needs the `ascAppId` above,
item 60 in `production-readiness.md`).

## What the repository configures (and why)

### Purpose strings (both `app.json` files)

Every string says what the person gets and when; none is a plugin default
(`Allow $(PRODUCT_NAME) …`). Checked with
`npx expo config --type introspect --json` in each app.

| Key                      | Duna                                                                                      | Duna Pro                                          |
| ------------------------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Camera                   | Recording with Duna Vision, profile photos, an optional live broadcast                    | Check-in code scanning, product and member photos |
| Microphone               | Only for a recording with sound or a live broadcast you choose                            | Only for a voice note or a live coaching session  |
| Photo library (read)     | Profile photos and videos added to your private film archive                              | Photos chosen for products and member media       |
| Location when in use     | Nearby courts, clubs and games; Share trip ETA                                            | Card readers; the optional arrival reminder       |
| Location always          | Only after Share trip ETA; stops 30 minutes after the start                               | Only after the arrival reminder; same window      |
| Motion                   | Phone tilt while recording (level court, upright overlay); not stored                     | not used                                          |
| Contacts                 | Only the contacts you pick (partners, a one-time invitation)                              | not used                                          |
| Calendars (full access)  | Adds the bookings you choose to sync; reads events you approve                            | Reads calendars you approve; never writes         |
| Reminders                | removed (not used)                                                                        | removed (not used)                                |
| Health read / update     | Reads only the categories you choose; does not write (checked by `verify:mobile-runtime`) | not used (no HealthKit in Pro)                    |
| Bluetooth, local network | not used                                                                                  | Card readers for in-person payments               |
| Face ID                  | removed (secure storage does not use biometrics)                                          | removed                                           |

### Icons and splash

Generated from the brand's Crest geometry (`docs/design/tideline-4.1.1/assets/duna-app-icon.svg`:
the mark at half the icon height, centred). The SVG sources are committed in
`apps/<app>/assets/brand/`; the PNGs next to `app.json` were rendered from them
with sharp 0.34.5 (librsvg), the copy already in the workspace's
`node_modules`. No new raster art was drawn.

| File                                                  | Duna                                                                                                            | Duna Pro                                    |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `icon.png` (light, App Store)                         | Dune Crest on Night Court, opaque, no alpha                                                                     | Night Court Crest on Salt, opaque, no alpha |
| `icon-dark.png`                                       | Dune Crest on transparent (iOS draws the dark ground)                                                           | same                                        |
| `icon-tinted.png`                                     | White Crest on transparent (iOS tints it)                                                                       | same                                        |
| `adaptive-icon.png` + `monochrome-icon.png` (Android) | Crest in the adaptive safe zone, Night Court ground                                                             | Night Court Crest, Salt ground              |
| Splash                                                | Plain Night Court (`#0E1A22`), no mark: it is the first frame of the first-open sequence (brand book section 6) | same                                        |

Pro on Salt is a Proposed decision so the two apps differ on a Home Screen
while both carry the Crest (brand table: on Salt, the mark is Night Court).

### Entitlements and capabilities (resolved by `expo config --type introspect`)

| Capability                      | Duna                                          | Duna Pro                                                   |
| ------------------------------- | --------------------------------------------- | ---------------------------------------------------------- |
| Push (`aps-environment`)        | yes                                           | yes                                                        |
| HealthKit + background delivery | yes (read only)                               | no                                                         |
| App Groups                      | `group.com.duna.player` (app and widgets)     | `group.com.duna.pro`                                       |
| Apple Pay merchant              | `merchant.com.duna.player`                    | no                                                         |
| Live Activities                 | `NSSupportsLiveActivities` + frequent updates | same                                                       |
| Background modes                | location, remote notifications                | same                                                       |
| Associated domains              | not configured (see below)                    | not configured                                             |
| Tap to Pay on iPhone            | no                                            | not in the entitlements yet: needs Apple's grant (item 56) |

**Push environment.** `expo-notifications` writes `aps-environment =
development` into the generated entitlements. A store build is signed with the
App Store distribution profile, whose `aps-environment` is `production`, and
Xcode's App Store export writes the profile's value. Check it on the first
TestFlight build:

```sh
unzip -o Duna.ipa -d /tmp/duna-ipa >/dev/null
codesign -d --entitlements :- /tmp/duna-ipa/Payload/Duna.app | grep -A1 aps-environment   # expect production
```

**Universal links.** The Player already understands `https://<duna>/matches/…`
links, but no `apple-app-site-association` file is hosted and no
`ios.associatedDomains` is set, so they open the website. To turn them on: host
the AASA file on `duna.coach` (item 65), then add
`"associatedDomains": ["applinks:duna.coach"]` under `ios` in
`apps/player/app.json` and rebuild.

### Privacy manifest (`ios.privacyManifests`, both apps)

Required-reason APIs the apps and their React Native / Expo dependencies use
(dependencies that ship their own `PrivacyInfo.xcprivacy` are merged at build
time):

| API category     | Reasons        | Where                                                                 |
| ---------------- | -------------- | --------------------------------------------------------------------- |
| User defaults    | CA92.1         | React Native, AsyncStorage, the Watch scoring bridge                  |
| File timestamp   | C617.1, 0A2A.1 | React Native, `expo-file-system`, the recording journal               |
| System boot time | 35F9.1         | React Native, the capture engine's run timing                         |
| Disk space       | E174.1, 85F4.1 | the capture engine and background upload (space before writing video) |

`NSPrivacyTracking` is false; the apps do not track.

### Encryption

`ITSAppUsesNonExemptEncryption` is `false` in both apps: they use HTTPS and the
operating system's cryptography only (`expo-crypto` hashing, Keychain through
`expo-secure-store`). No custom or proprietary encryption ships.

## What the owner does in App Store Connect

1. **Capabilities** on each App ID (or accept EAS's capability sync):
   the table above, plus the widget and Watch bundle ids.
2. **App Privacy** labels. Duna: Contact Info (name, email, phone: account),
   Health & Fitness (Health: only categories the player chooses, not used for
   advertising), Location (precise: nearby courts, Share trip ETA), Contacts
   (only those picked), Photos or Videos and Audio Data (recordings the player
   makes), User Content (messages, match results, photos), Identifiers (user
   id), Purchases. Duna Pro: Contact Info, Location, Photos or Videos, Audio
   Data, User Content, Identifiers, Purchases and Financial Info (in-person
   payments run through Duna Pay). All "linked to the person", none "used for
   tracking". Confirm against `docs/HEALTH_PRIVACY.md` before submitting.
3. **Age rating** questionnaire: user-generated content, messaging, live
   streaming, health data (item 64).
4. **Review notes** (one per app): a production demo account (item 63; agents
   never create one); HealthKit is read only and offered in the United States
   with a guardian's consent for juniors (`docs/HEALTH_PRIVACY.md`); background
   location runs only after "Share trip ETA" / the arrival reminder and stops 30
   minutes after the start; Live Activities show next-up and live scores; live
   broadcasting is optional; Duna Pro's Bluetooth and local network are for card
   readers, and Tap to Pay is shown as unavailable until Apple grants it.
5. **Screenshots.** iPhone 6.9-inch (1320 × 2868), iPad 13-inch (2064 × 2752),
   and iPhone Duo if App Store Connect asks for it (Apple has not published the
   Duo's sizes; take them from the Xcode 27.2 Duo simulator, both displays).
   Use preview builds' demo data, never real people's data.
6. **TestFlight**: add the internal testers group; write the "What to Test"
   note; run the physical-device pass in item 67 (HealthKit background
   delivery, Live Activities, Watch scoring, payment readers, recording).

## Checklist

- [ ] `pnpm verify:mobile-runtime`, `pnpm verify:design-system`, both exports green on `main`
- [ ] Simulator smoke run of both apps (BUILDING.md), screenshots looked at
- [ ] Capabilities enabled on both App IDs, widget and Watch ids
- [ ] `eas build --platform ios --profile testflight` for Duna, then for Duna Pro
- [ ] `eas submit --platform ios --profile testflight --latest` for each
- [ ] First build's `aps-environment` is `production` (codesign check above)
- [ ] App Privacy labels, age rating, review notes and demo account entered
- [ ] Screenshots uploaded (iPhone 6.9-inch, iPad 13-inch, iPhone Duo if asked)
- [ ] TestFlight internal group added; physical-device pass (item 67) done
- [ ] Build ids and source commits recorded per `docs/START_HERE.md`
- [ ] Only the owner releases to the App Store
