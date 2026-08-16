# Duna Video

Duna Video is an iOS-first capture, live-streaming, upload, playback, and
governance system for players. Live video uses Mux; uploaded originals use a
private Cloudflare R2 bucket.

## Product surfaces

| Surface     | Capability                                                                                                                                                                                                                                    |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Duna iOS    | Go Live, guided camera setup, native Duna Vision recording, Watch scoring and review cues, visible-court marker verification, remote setup QR, live score overlay, library upload, playback, privacy controls, share links, and owner metrics |
| Apple Watch | Large live scoreboard, four-direction gesture scoring, favorite/undo/side-change tags, a source-linked last-rally review cue, haptics, and a low-frame-rate camera alignment check                                                            |
| Public web  | Mux/R2 playback on player, event, and match pages; multiple stream angles for the same match; link-only playback; timestamped score overlay; authenticated Duna Vision Studio reports                                                         |
| Duna Pro    | Cleaner live scorer with a persistent exit, associated match video/live angles, and a focused handoff to Player Studio for source-linked coaching review                                                                                      |
| Remote web  | Time-limited QR control for team/court setup, draggable court corners, camera and net heights, camera preview, and record/stop controls                                                                                                       |
| Super Admin | Provider readiness, safety ceilings, current streams, usage, storage, watch time, and Complimentary Duna+ grants                                                                                                                              |

Android capture is intentionally unavailable in this release. Public playback
continues to work on supported browsers and inside the app.

## Ingest and storage

### Live

1. The authenticated iOS client asks Duna for a live session.
2. Duna verifies Premium access, the enforced monthly allowance, association validity,
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
3. iOS sends 16 MiB parts directly to short-lived presigned URLs.
4. The API validates every part number, ETag, and size before completing the
   upload.
5. Playback uses a short-lived signed R2 URL; the bucket does not need to be
   public.

The API checks the proposed upload duration against the player's remaining
plan allowance before creating an R2 multipart upload. Upload and live meters
are enforced independently.

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

## Premium plans and allowances

Live broadcasting requires an active paid Premium or Premium+ entitlement.
Complimentary Premium+ grants are local, audit-logged entitlements; they do not
create a zero-dollar Stripe subscription.

The launch plan allowances are:

- Free: 4 uploaded-video hours and no native live broadcasting.
- Premium: 8 uploaded-video hours and 2 live-broadcast hours.
- Premium+: 30 uploaded-video hours and 8 live-broadcast hours.

Organization-scoped capture uses a separate pooled meter tied to the effective
Duna HQ plan: Coach & Organizer includes 4 upload / 2 live hours, Club 100 / 10,
Facility 500 / 40, and Network 1,000 / 100. Videos created in an organization
context carry the organization id and do not consume the individual player’s
meter.

Both meters reset at the beginning of each UTC calendar month and are enforced.
Super Admin can set platform safety ceilings or a person-specific override. The
default ceilings are 30 upload hours and 8 live hours so they do not reduce any
launch plan.

Migration `0044_duna_video.sql` creates an indefinite complimentary grant
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

## Duna Vision sessions

Every Duna Vision capture creates a server-owned session before recording. A
session can be linked to a match and later attached to either a live video or a
completed upload. It stores normalized court corners, court and camera
dimensions, team labels, score-overlay preference, and a monotonically
increasing control version.

The timeline is append-only. Each Watch, iPhone, remote, or match event carries
its own UUID, source, wall-clock time, recording-relative elapsed time, and the
score snapshot after the action when relevant. Event UUIDs make retries
idempotent. Undo events target prior event IDs rather than deleting history.
This preserves the raw material needed to rebuild a replay accurately and to
add later computer-vision observations without rewriting human input.

### Apple Watch controls

While a Vision session is active, the Watch uses four full-screen gestures:

- Swipe up: Side A point.
- Swipe down: Side B point.
- Swipe right: favorite the current moment.
- Swipe left: undo the previous scoring action.

The Watch also exposes explicit favorite, undo, and side-change controls. It
queues events locally and removes them only after iPhone and server
acknowledgement, so a brief connectivity interruption does not silently lose a
tag. The final Watch score remains a draft until the official match scorer
accepts it; when an authorized live scorer is linked, accepted point and undo
events also enter the existing official match event stream.

The camera check is deliberately a low-resolution, low-frame-rate preview for
alignment, not a second video stream. Real-device battery, thermal, reachability,
and background-behavior testing is required before release.

### Connect Remote Device

The iPhone displays a QR code containing a random, time-limited control URL.
The server stores only a hash of that token. The remote page is excluded from
search indexing and can be revoked by the recording owner.

The remote can view the throttled alignment preview, drag the four court
corners, select court and net presets, set camera height and team labels, toggle
the score overlay, and request start or stop. Optimistic version checks prevent
two controllers from silently overwriting each other. The QR grants control of
that Vision session only; it does not grant a Duna account or general match
administration.

### Score overlays and Duna Vision analysis

If a video is linked to an officially scored match, the current match score is
authoritative during a live stream. Recorded playback reconstructs the
bottom-right score from timestamped Vision events. A live score is never
replaced by an older Watch snapshot.

Court geometry, camera height, event timestamps, and side-change tags also
establish the coordinate and time foundation for Duna Vision analysis. The
product keeps three layers separate:

- **Timeline facts:** Watch and iPhone score, favorite, undo, side-change, and
  review-cue events remain append-only and source-linked to the recording.
- **Analysis observations:** `video_analysis_events` stores model proposals and
  human-confirmed placements with recording-relative microsecond time,
  confidence, calibrated court coordinates, model version, and source
  provenance. A model never writes an official score.
- **Human review:** `video_analysis_reviews` stores a coach/player decision or
  correction separately from the original observation. A confirmed human
  correction outranks a model result; reprocessing cannot silently overwrite it.

Player Studio and the authenticated web Video Studio show only visible,
calibrated landing points on a court map. Unknown, edge, and out-of-frame
regions are not presented as zero activity. Each report names its calibration,
coverage, source-video availability, score-timeline availability, and whether
separate learning consent is present.

Analysis runs are durable server records. The application may queue a run even
when the external model worker is not configured, but it must remain visibly
queued rather than claim that ML completed. The dedicated worker is the only
component allowed to publish model observations; it writes derived artifacts
under `video-analysis/{videoId}/` in private R2 and posts a validated callback
to Duna Web. Heavy decode, inference, and model weights never run in Vercel.

On Watch, the review surface is intentionally a compact last-rally cue with the
latest alignment snapshot, score, and a `Flag for coaching review` action. It
does not promise full video playback on the wrist; the paired iPhone or web
Studio opens the source-linked replay and report.

### Private Health overlay

When the recording owner has connected the Heart category, Duna can align
HealthKit heart-rate samples to the video's recording start. Native and web
players render the current value at the bottom left while the linked scoreboard
remains at the bottom right.

Health authorization is independent of video authorization. A public video or
valid video share link never grants access to Health data. The API returns
heart-rate points only to the Health owner or to an authenticated recipient
with an active, unexpired grant that includes both the Heart category and the
`video-overlay` scope; the underlying player, coach, or organization
relationship is rechecked on every request. See `docs/HEALTH_PRIVACY.md` for
the full boundary.

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
HEALTH_DATA_ENCRYPTION_KEY
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

1. Apply forward-only database migrations through the latest checked-in
   migration. The Vision timeline and analysis run/event/review tables must be
   present before deploying a client that can create a review cue or analysis
   marker.
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
6. On physical iPhone and Watch hardware, validate all four gestures, offline
   event recovery, favorite timestamps, score overlay timing, live score
   authority, QR expiry/revocation, remote version conflicts, camera preview,
   and remote start/stop.
7. Confirm the `john@beachelite.org` profile displays Complimentary Duna+ after
   migration.
8. If model processing is enabled, configure the dedicated worker with scoped
   R2 credentials plus `DUNA_ANALYSIS_WORKER_URL` and
   `DUNA_ANALYSIS_WORKER_TOKEN`; verify a callback creates a versioned,
   confidence-labeled observation and a private artifact under the correct
   video prefix. A missing worker is a visible queued-analysis state, not a
   completed analysis.
9. Run `pnpm verify`, the connected repository smoke, and an iOS physical-device
   stream before production promotion.

Mux marketplace terms, production credentials, database migration, App Store
distribution, and any audio-processing vendor agreement remain account-owner
launch gates.
