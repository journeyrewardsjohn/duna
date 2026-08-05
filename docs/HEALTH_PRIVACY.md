# Duna Health privacy and security boundary

Duna Health is an opt-in, read-only Apple Health integration for adult player
accounts. It imports performance-relevant categories selected by the player,
builds a private timeline, adds descriptive match context, and can align heart
rate with Duna Vision. It is not a medical product and must not diagnose,
prescribe, or decide whether someone should play.

## Data flow

1. Duna first explains the optional features without imitating Apple's system
   permission UI.
2. The player selects one or more Duna categories: Heart, Recovery, Activity,
   or Body.
3. iOS presents Apple's HealthKit authorization sheet for only the selected
   read types. Duna requests no write types.
4. Anchored HealthKit queries return new and deleted samples. Each metric has a
   separate secure cursor on the iPhone.
5. The API validates metric, type, time window, and selected category. Values
   are encrypted with AES-256-GCM before database insertion. The external
   HealthKit identifier is stored only as a keyed hash.
6. The iPhone cursor advances only after the API acknowledges the batch.
7. Observer queries flag changes; foreground and manual sync perform the
   network transfer. Physical-device testing is required for background
   delivery behavior.

HealthKit does not disclose whether read access to an individual type was
denied. Duna therefore describes authorization as requested, never as fully
granted, and treats an empty result as unknown rather than denial.

## Access matrix

| Viewer                        | Required grant                       | Relationship recheck                                                          | Available scopes                    |
| ----------------------------- | ------------------------------------ | ----------------------------------------------------------------------------- | ----------------------------------- |
| Player/owner                  | None                                 | Signed-in person ID is owner                                                  | Summary, timeline, video overlay    |
| Selected Duna player          | Active, unexpired player grant       | Current followed-player or teammate relationship                              | Explicit categories and scopes only |
| Selected coach                | Active, unexpired coach grant        | Coach remains active at one of the player's current clubs                     | Explicit categories and scopes only |
| Club/organization             | Active, unexpired organization grant | Player remains affiliated and viewer is active owner, manager, or coach staff | Explicit categories and scopes only |
| Anonymous/public video viewer | Never eligible                       | Not applicable                                                                | None                                |

Every non-owner profile or video-overlay read revalidates both the grant and
the relationship. Grant creation, revocation, non-owner reads, sync, and
disconnect are audit logged. Public profile status, public video status, share
links, staff scopes, and ordinary club membership do not independently grant
Health access.

## Storage and key management

- `HEALTH_DATA_ENCRYPTION_KEY` is a base64-encoded 32-byte server secret. The
  API derives separate payload-encryption and external-ID HMAC keys.
- Values, units, sleep states, and workout details are stored inside an
  authenticated ciphertext. Only person ID, metric, sample kind, time range,
  key version, and keyed external-ID hash remain queryable.
- TLS protects transit. Database, logs, analytics, crash reports, Mux metadata,
  and notifications must never receive clear Health values outside the
  encrypted Health service path.
- Health data is not placed in iCloud. Local anchors are stored in the iOS
  Keychain through SecureStore and contain no Health values.
- Key rotation must add a new key version and retain controlled decrypt access
  until old rows are re-encrypted. Do not replace the production key in place.

## Sharing and deletion

Duna Health starts owner-only. A sharing grant records the chosen audience,
categories, scopes, consent version and text hash, creation time, and mandatory
expiration (maximum one year; mobile defaults to 90 days). Heart-rate video
overlay requires both the Heart category and the `video-overlay` scope.

Revocation takes effect on the next read. Disconnect deletes all imported
samples, revokes all active Duna grants, clears the device cursor, and marks the
connection revoked. The player must separately use Apple Health or Settings to
change Apple's source permission. Account export includes clear player-owned
Health samples and grant history through the authenticated privacy workflow;
foreign recipients never receive an export of the owner's data.

An account-deletion request immediately disables new Health sync and sharing
and revokes every active Health grant. The player has a seven-day recovery
window. If the request is not cancelled, the durable deletion workflow removes
all encrypted samples, connection metadata, and grant records before the player
identity is de-identified. Cancelling the request does not silently restore any
previous grant.

## Threats and controls

- **Public-video disclosure:** playback loads Health only for an authenticated
  owner or revalidated grantee; video visibility and link tokens are ignored
  for Health authorization.
- **Stale staff relationship:** organization and coach membership is checked on
  every read, not only when consent is created.
- **Overbroad club access:** organization grants resolve only to active owner,
  manager, and coach staff, never every club member.
- **Replay or duplicate import:** person-scoped keyed identifiers and unique
  constraints make import idempotent; anchored deletions remove server rows.
- **Database disclosure:** AES-GCM protects values and detects modification;
  metric/time metadata is minimized to what timeline queries require.
- **Log leakage:** sync audit entries record counts and consent version, not
  values. Health payloads must not be logged in request or error tooling.
- **Misleading inference:** correlations require at least five resolved matches,
  are labeled as associations, and are never presented as causation or medical
  advice.
- **Minor consent ambiguity:** Health import and sharing are adult-only until a
  separately reviewed guardian flow exists.

## Release gates

- Apply database migration `0046_odd_korg.sql` after the Duna Vision migration.
- Generate and store `HEALTH_DATA_ENCRYPTION_KEY` in the server secret manager;
  do not expose it to Expo, browsers, client logs, or build configuration.
- Add HealthKit and background-delivery capabilities to the Apple identifier,
  provisioning profile, and production build.
- Verify permission copy and App Privacy labels against the approved v1 privacy
  policy and data-retention controls in the release record.
- On physical iPhone and Watch hardware, test each category independently,
  denied and partially authorized types, historical import, deletion anchors,
  foreground recovery, observer completion, airplane mode, keychain retention,
  grant expiration/revocation, removed coach/club relationships, export, and
  disconnect.
- Confirm Health values never appear in public playback, Mux Data, analytics,
  crash reporting, notifications, screenshots, or unauthenticated API output.
- Complete App Review notes explaining the fitness purpose, contextual
  permission request, read-only behavior, sharing controls, and delete path.

This document describes technical controls. Apple review, production
provisioning, policy labels, legal review, and physical-device behavior remain
release gates rather than claims made by the code alone.
