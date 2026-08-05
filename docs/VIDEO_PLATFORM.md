# Duna Video

Duna Video is an iOS-first capture, live-streaming, upload, playback, and
governance system for players. Live video uses Mux; uploaded originals use a
private Cloudflare R2 bucket.

## Product surfaces

| Surface     | Capability                                                                                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Duna iOS    | Go Live, guided camera setup, native recording, library upload, live/on-demand playback, private archive, publishing controls, share links, and owner metrics |
| Public web  | Mux/R2 playback on player, event, and match pages; multiple stream angles for the same match; link-only playback                                              |
| Duna Pro    | Associated match video and live angles                                                                                                                        |
| Super Admin | Provider readiness, global allowances, current streams, usage, storage, watch time, and Complimentary Duna+ grants                                            |

Android capture is intentionally unavailable in this release. Public playback
continues to work on supported browsers and inside the app.

## Ingest and storage

### Live

1. The authenticated iOS client asks Duna for a live session.
2. Duna verifies Duna+, the enforced monthly allowance, association validity,
   and minor-account privacy rules.
3. The server creates a Mux live stream and returns the RTMPS ingest information
   only to that player.
4. The native AVFoundation capture pipeline sends H.264/AAC to Mux.
5. Signed Mux webhooks move the stream through live, ended, processing, ready,
   and failed states.
6. Public and signed playback IDs are selected independently for the live
   session and its recording.

The stream key is never persisted by Duna and must never be logged or placed in
client analytics.

### Uploads

1. iOS records an MP4 or converts a library selection to MP4 locally.
2. The API creates a private R2 multipart upload.
3. iOS sends 64 MiB parts directly to short-lived presigned URLs.
4. The API validates every part number, ETag, and size before completing the
   upload.
5. Playback uses a short-lived signed R2 URL; the bucket does not need to be
   public.

There is no application-level upload-duration block in the initial policy. The
24-hour allowance is reported to the player and Super Admin until enforcement
is deliberately enabled.

## Privacy and association rules

- Categories are Practice, Event, Match, and Social.
- Event and match video can use the player's associated history or a searched
  event/match.
- A match can have any number of streams. Its page renders each stream as a
  separate angle.
- A live session is either Public or Link-only.
- The recording has its own Public or Private decision after the stream ends.
- A private recording remains owner-only unless the owner creates a share link.
- Practice uploads start Private.
- Publishing to a player profile is a separate choice and requires a Public
  recording.
- Minor accounts are forced Private for recordings, even if a client submits a
  public value.
- Playback authorization is checked before issuing Mux tokens or R2 signed
  URLs. Share-link use is recorded.

## Duna+ and allowances

Live streaming requires an active paid or Complimentary Duna+ entitlement.
Complimentary grants are local, audit-logged entitlements; they do not create a
zero-dollar Stripe subscription.

The initial global policy is:

- 4 hours of live streaming per calendar billing month, enforced.
- 24 hours of uploaded video per calendar billing month, reported but not
  enforced.

Super Admin can change the global numbers and either enforcement state. A
future person-specific policy can use the existing nullable-person quota model
without changing the global setting.

Migration `0044_duna_video.sql` creates an indefinite Complimentary Duna+ grant
for `john@beachelite.org`. It attaches to the matching person when that identity
already exists and otherwise remains email-bound until the account is resolved.

## Guided iOS capture

The local Expo module combines ARKit, AVFoundation, Apple Vision, Core Motion,
and HaishinKit:

- Before capture, ARKit finds a horizontal ground plane and projects the known
  court geometry from the usual position behind an end line. On supported
  devices, LiDAR scene depth and mesh reconstruction improve the ground lock.
  Non-LiDAR phones use ARKit plane detection and then Vision/Core Motion.
- AVFoundation owns camera, microphone, focus/exposure, local recording, and
  capture buffers.
- Vision checks the frame for court-like rectangular geometry and human body
  poses. A ground plane alone is not enough to award a Good grade; Duna also
  looks for boundary evidence so an indoor floor is not labeled as a court.
- Core Motion checks device stability and records attitude.
- The overlay continuously projects four outside corners, net line, center,
  horizon, and safe margins as the camera moves.
- Guidance covers framing, distance, rotation, stability, player scale, and low
  light. Suggestions are stabilized before changing so the user can make small,
  gradual adjustments.
- Setup asks for Landscape or Portrait. The camera guide detects the physical
  orientation, asks the user to rotate when needed, and locks the selected
  capture orientation once recording begins.
- Acceptable calibration locks focus, exposure, lens, and zoom, then stores the
  calibration with the video.

The user can proceed with a Poor or Limited grade. The guide advises; it does
not prohibit unusual camera angles.

Full court defaults to 16 × 8 meters. Net presets are 2.43 meters for men and
2.24 meters for women. The 2.12-meter junior preset is a setup aid only because
junior height varies by age and competition rules.

Court homography supports high-confidence ground-plane positions. Monocular
ball height and apex remain estimates with a confidence interval. Product copy
must not present arbitrary single-camera height as centimeter-perfect.

## Playback and measurement

Mux Player is used for Mux live streams and recordings on web. Native playback
uses `react-native-video` with the Mux Data wrapper. R2 files use the native or
browser video element.

Duna records a privacy-safe view session and periodic watch heartbeats for both
providers. Owners see views, unique viewers, watched time, average watch time,
completion, and available Mux quality-of-experience metrics. The web and native
players use pseudonymous viewer/session identifiers and must not put email or
other direct personal information into Mux Data fields.

## Music-removal boundary

After a live stream, a player can request an attempt to reduce event music while
preserving court audio. Duna records and audits that request. Until an approved
audio-isolation processor is connected, the status is `provider-required`; the
original recording is unchanged. This avoids claiming copyright clearance or
silently degrading a player's only recording.

## Environment setup

Set these server-side values in both Duna Web and Duna HQ for Preview and
Production:

```text
DATABASE_URL
GOOGLE_PLACES_API_KEY
CLOUDFLARE_ACCOUNT_ID
R2_BUCKET_NAME=duna
CF_ACCESS_KEY_ID
CE_SECRET_ACCESS_KEY
MUX_TOKEN_ID
MUX_TOKEN_SECRET
MUX_WEBHOOK_SECRET
MUX_SIGNING_KEY_ID
MUX_PRIVATE_KEY
MUX_DATA_ENV_KEY
```

The runtime also accepts Mux's dashboard-oriented `MUX_SECRET_KEY` and
`MUX_SIGNING_SECRET` names. The signing secret may be either the complete PEM
or the base64 value Mux displays when the key is generated.

`CF_TOKEN_VALUE` is useful for Cloudflare account operations but is not used to
sign S3-compatible R2 upload requests. Keep the `duna` R2 bucket private.

Configure the Mux webhook endpoint as:

```text
https://<duna-web-host>/api/mux/webhook
```

The implementation follows Mux's
[native live-streaming guidance](https://www.mux.com/docs/guides/live-streaming-from-your-app),
[signed playback guidance](https://www.mux.com/docs/guides/secure-video-playback),
and [Data monitoring guidance](https://www.mux.com/docs/guides/monitor-react-native-video).
R2 uploads follow Cloudflare's
[presigned URL](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)
and [multipart upload](https://developers.cloudflare.com/r2/objects/multipart-objects/)
models.

## Release sequence

1. Apply forward-only database migrations through `0044_duna_video.sql`.
2. Add R2 credentials to Duna Web. The existing sensitive Duna HQ values cannot
   be exported or copied by Vercel CLI.
   Add `GOOGLE_PLACES_API_KEY` to Duna Web as well; the mobile venue picker calls
   the server-side Duna Web Places proxy.
3. Install/approve Mux in the account, create API and signing keys, set the
   webhook secret, and add all Mux values to both server projects.
4. Create a fresh iOS build. Expo Go cannot load the local native capture
   module.
5. Validate one Public and one Link-only live stream, a private recording, a
   public recording, two angles on one match, and an R2 upload.
6. Confirm the `john@beachelite.org` profile displays Complimentary Duna+ after
   migration.
7. Run `pnpm verify`, the connected repository smoke, and an iOS physical-device
   stream before production promotion.

Mux marketplace terms, production credentials, database migration, App Store
distribution, and any audio-processing vendor agreement remain account-owner
launch gates.
