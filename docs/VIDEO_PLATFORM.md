# Duna Video

Duna Video is an iOS-first capture, live-streaming, upload, playback, and
governance system for players. New live sessions use tier-aware Cloudflare or
Mux routing, while every provider-specific recording remains playable.
Uploaded originals use a private Cloudflare R2 bucket.

## Product surfaces

| Surface       | Capability                                                                                                                                                                                                                                |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Duna iOS      | Go Live over adaptive SRT/RTMPS, spatially guided camera setup, native recording, Watch scoring, program score/replay/sponsor graphics, second-screen control, library upload, playback, privacy controls, share links, and owner metrics |
| Apple Watch   | Large live scoreboard, four-direction gesture scoring, favorite/undo/side-change tags, a source-linked last-rally review cue, haptics, and a low-frame-rate camera alignment check                                                        |
| Public web    | Cloudflare/Mux/R2 playback on player, event, and match pages; multiple stream angles for the same match; link-only playback; timestamped score overlay; authenticated Duna Vision Studio reports                                          |
| Duna Pro      | Cleaner live scorer with a persistent exit, associated match video/live angles, and a focused handoff to Player Studio for source-linked coaching review                                                                                  |
| Second screen | Time-limited QR/deep-link control on iPhone or iPad for preview, scoring, scoreboard visibility, 8/10/15-second replay, sponsor lower thirds, and camera start/end; HTTPS remains the setup fallback                                      |
| Super Admin   | Provider readiness, safety ceilings, current streams, usage, storage, watch time, and Complimentary Duna+ grants                                                                                                                          |

Android capture is intentionally unavailable in this release. Public playback
continues to work on supported browsers and inside the app.

## Ingest and storage

### Live

1. The authenticated iOS client asks Duna for a live session.
2. Duna verifies Premium access, the enforced monthly allowance, association validity,
   and minor-account privacy rules.
3. The server creates a Cloudflare live input with automatic recording,
   low-latency playback, and the requested access policy. It returns RTMPS and
   SRT ingest credentials only to that player. Recordings are preserved unless
   an explicit retention period is configured; Duna must never enable deletion
   until a durable archive/export policy is active.
4. Provider policy selects secure SRT whenever the active Mux or Cloudflare
   input exposes it; otherwise the client starts with RTMPS. SRT uses caller
   mode, a provider-issued passphrase, 500 ms latency, and 25% recovery
   overhead. The client automatically falls back to that same session's RTMPS
   ingest if SRT cannot connect or drops. Adaptive bitrate responds to observed
   network pressure independently; the network interface name is not treated
   as a quality test. Physical-device validation remains an activation gate.
5. Authenticated Cloudflare live notifications move the stream from draft to
   live and processing. Playback lazily reconciles the ready recording video ID
   because the recording is a separate Cloudflare resource.
6. Link-only live streams and private recordings use short-lived signed
   Cloudflare tokens. Existing Mux live streams retain signed Mux playback and
   webhook processing.

The stream key is never persisted by Duna and must never be logged or placed in
client analytics.

### YouTube simulcast

The selected Duna live provider is also the fan-out layer. A player may
explicitly select the Duna YouTube channel, their connected channel, and any
connected channel owned by the active organization. For each selected channel
Duna:

1. uses the channel's encrypted OAuth refresh credential to create a YouTube
   broadcast and one-use live stream;
2. binds them through the YouTube Live Streaming API;
3. gives the resulting RTMP address and key directly to a Cloudflare output or
   Mux simulcast target; and
4. stores only provider IDs, status, and the public watch URL.

The Google access token and YouTube stream key are never stored. OAuth state is
random, stored only as a hash, expires after ten minutes, and is single-use.
Personal connections belong to the player. Organization connections can be
created or disconnected only by an owner or manager, while an authorized
organization broadcaster may select them. A Public Duna live stream maps to a
Public YouTube broadcast; Link-only maps to Unlisted. Destination failures are
reported per channel and do not falsely mark a healthy Duna stream as failed.

`DUNA_LIVE_PROVIDER=auto` is tier-aware: Premium+ personal streams and Duna HQ
Scale streams prefer Mux; Premium personal streams and Free/Club organization
streams prefer Cloudflare. If the selected provider is unavailable, `auto`
uses the other configured provider. An explicit `cloudflare` or `mux` value
remains available for rollout and incident control. YouTube fan-out works with
either provider.

Mux-routed streams explicitly use Plus video quality by default. This is
separate from a customer's Duna Premium or Premium+ entitlement. Set
`MUX_LIVE_VIDEO_QUALITY=premium` only for an intentional marquee-event policy;
it is not the default merely because a customer is on Duna Premium+.

### Program feed, scoring, replays, and ads

Cloudflare and Mux forward Duna's encoded program feed; neither creates it. The
primary iPhone now composites the authoritative score and sponsor lower third,
maintains a bounded 15-second replay buffer, switches a requested replay into
the outgoing video, marks it visibly, and returns automatically to live. Since
composition happens before provider fan-out, Duna and every selected YouTube
channel see the same program.

The Vision session is the versioned control plane. Watch scoring, the native
second screen, official match events, favorite markers, replay requests, and
sponsor state stay source-linked and ordered. The camera persists score and
replay actions to the timeline; a linked match remains scoring authority.

This first release supports sponsor text lower thirds, not arbitrary uploaded
creative or unattended ad decisions. Sponsor approval, insertion duration,
audio behavior, youth safeguards, and an emergency return-to-live remain gates
for bumper/full-screen creative. The local recording currently follows the
program output; simultaneous clean and program masters require a later
producer-grade pipeline.

Cloudflare Live Instant Clipping can expose highlights from the live recording,
but inserting a clip back into the outgoing YouTube feed still requires this
program compositor. Ad insertion likewise needs an encoded source transition;
it is not created merely by adding a Cloudflare simulcast output.

Invited commentator audio is a later cloud-producer capability. Use a
permissioned LiveKit room, room/web composite, and egress into the selected
Cloudflare/Mux input so commentator access, isolated audio, mute/removal,
monitoring, gain/ducking, echo control, reconnect, and A/V sync are governed.
Do not mix an untrusted remote call directly into the camera phone.

### Uploads

1. iOS records an MP4 and imports locally retained MP4 or QuickTime/MOV assets
   without forcing a long, failure-prone transcode before upload.
2. The API creates a private R2 multipart upload.
3. iOS stages file-backed 64 MiB ranges using a bounded copy buffer, then a
   background `URLSession` sends them to 24-hour presigned URLs. It persists
   ETags locally and reconciles them when JavaScript returns to foreground.
4. R2 `ListParts` is authoritative: the API validates its part numbers, ETags,
   and exact bytes before completing the upload. Local client/DB part records
   are resume hints only.
5. Playback uses a short-lived signed R2 URL; the bucket does not need to be
   public.

The API checks the proposed upload duration against the player's remaining
plan allowance before creating an R2 multipart upload. Upload and live meters
are enforced independently.

Interrupted transport is retryable and never aborts a server upload. Only an
explicit owner cancellation calls R2 abort; that operation is idempotent.

Android library imports accept MP4 and keep a retained file-backed source, but
their upload is foreground-only: the player must keep Duna open until it
finishes. Android makes no background-transfer durability claim; leaving the
app pauses a retryable draft rather than losing it.

### Evidence-only performance review

After a Vision run reaches `ready` or `needs-review`, an adult video owner may
explicitly request a performance review. Duna sends only derived report
evidence to Vercel AI Gateway (`DUNA_VIDEO_REVIEW_MODEL`, default
`openai/gpt-5.6-sol`) with `xhigh` reasoning and a structured schema. It sends
no raw video, identifiers, court image, or player IDs. Recommendations are
stored as draft insights, remain separate from calibration/training/model
promotion, and fall back to an audited unavailable result if Gateway is not
configured or cannot respond.

### Governed Vision improvement proposals

For an adult owner who has opted a video into Vision learning, each completed
`ready` or `needs-review` analysis queues exactly one separate proposal run.
The bounded HQ processor sends Sol only derived metrics, quality failures,
uncertainty, and rule-evidence gaps. Its structured output is limited to
improvement questions, hypotheses, required labels, evaluation slices, and
physics or rules gaps. It cannot receive raw video, generate weights, or train,
calibrate, shadow, or promote a model; every resulting proposal remains a
Super Admin research draft.

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
- Playback authorization is checked before issuing Cloudflare or Mux tokens or
  R2 signed URLs. Share-link use is recorded.

## Premium plans and allowances

Live broadcasting requires an active paid Premium or Premium+ entitlement.
Complimentary Premium+ grants are local, audit-logged entitlements; they do not
create a zero-dollar Stripe subscription.

The launch plan allowances are:

- Free: 4 uploaded-video hours and no native live broadcasting.
- Premium: 8 uploaded-video hours and 2 live-broadcast hours.
- Premium+: 30 uploaded-video hours and 8 live-broadcast hours.

Organization-scoped capture uses a separate pooled meter tied to the effective
Duna HQ plan: Free includes 10 upload / 2 live hours, Club 100 / 10, and Scale
500 / 40. Free organizations earn another 10 upload / 2 live hours for every
$40 in net organization fees collected that month. Recurring add-on packs
increase the included meter; PAYG reports only completed seconds above that
allowance to Stripe Billing. Videos created in an organization context carry
the organization id and do not consume the individual player’s meter.

Both meters reset at the beginning of each UTC calendar month and are enforced
unless the organization explicitly enables PAYG.
Super Admin can set platform safety ceilings or a person-specific override. The
default ceilings are 30 upload hours and 8 live hours so they do not reduce any
launch plan.

Migration `0044_duna_video.sql` creates an indefinite complimentary grant
for `john@beachelite.org`. It attaches to the matching person when that identity
already exists and otherwise remains email-bound until the account is resolved.

## Guided iOS capture

The local Expo module combines ARKit, AVFoundation, Apple Vision, Core Motion,
and HaishinKit:

- Before capture, ARKit finds a horizontal ground plane and projects several
  regulation-court hypotheses for end-line, sideline, and oblique viewpoints.
  On supported devices, LiDAR scene depth and mesh reconstruction improve the
  ground scale and camera-height lock. Non-LiDAR phones use ARKit plane
  detection and then Vision/Core Motion.
- AVFoundation owns camera, microphone, focus/exposure, local recording, and
  capture buffers.
- Vision checks the frame for court-like geometry, elongated net candidates at
  horizontal or diagonal angles, and human body poses. It ranks the visual
  court and spatial hypotheses against the observed net across multiple frames.
  A ground plane alone is not enough to award a Good grade, so an indoor floor
  is not labeled as a volleyball court.
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

The iPhone displays a QR code containing a random, time-limited Duna app deep
link. The share sheet also includes the HTTPS fallback. The server stores only
a hash of the token; the browser route is excluded from search indexing, and
the recording owner can revoke either controller.

Scanning on an iPhone or iPad opens the native second screen for the throttled
preview, match score, score-overlay visibility, 8/10/15-second replay, sponsor
lower third, and camera start/end. The HTTPS setup fallback retains court-corner,
dimension, camera-height, and team-label controls. Optimistic version checks
prevent two controllers from silently overwriting each other. The token grants
control of that Vision session only; it does not grant a Duna account or
general match administration.

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
Queued runs are safely redispatched when the user retries, and a processing run
older than two hours is returned to the queue before redispatch. Worker run-ID
claims and stable observation IDs keep both inference and callbacks idempotent.

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
DUNA_LIVE_PROVIDER=auto
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_STREAM_API_TOKEN
CLOUDFLARE_STREAM_WEBHOOK_SECRET
CLOUDFLARE_STREAM_SRT_ENABLED=true
CLOUDFLARE_STREAM_RECORDING_RETENTION_DAYS
CLOUDFLARE_STREAM_ALLOWED_ORIGINS
R2_BUCKET_NAME=duna
CF_ACCESS_KEY_ID
CE_SECRET_ACCESS_KEY
YOUTUBE_CLIENT_ID
YOUTUBE_CLIENT_SECRET
YOUTUBE_OAUTH_REDIRECT_URI
VIDEO_PROVIDER_ENCRYPTION_KEY
DUNA_YOUTUBE_REFRESH_TOKEN
DUNA_YOUTUBE_CHANNEL_ID
DUNA_YOUTUBE_CHANNEL_TITLE
MUX_TOKEN_ID
MUX_TOKEN_SECRET
MUX_WEBHOOK_SECRET
MUX_SIGNING_KEY_ID
MUX_PRIVATE_KEY
MUX_DATA_ENV_KEY
MUX_LIVE_VIDEO_QUALITY=plus
```

`CLOUDFLARE_STREAM_API_TOKEN` must be a separately scoped Stream Read/Write
token. Duna deliberately does not treat a generic Cloudflare account or R2
token as Stream authorization. `VIDEO_PROVIDER_ENCRYPTION_KEY` must decode to
32 random bytes. Google OAuth requests the narrower `youtube.force-ssl` scope;
the redirect URI must exactly match the production callback and the Google
OAuth client configuration.

The runtime also accepts Mux's dashboard-oriented `MUX_SECRET_KEY` and
`MUX_SIGNING_SECRET` names. The signing secret may be
either the complete PEM or the base64 value Mux displays when the key is
generated.

`CF_TOKEN_VALUE` is useful for Cloudflare account operations but is not used to
sign S3-compatible R2 upload requests or call Stream. Keep the `duna` R2 bucket
private.

Configure the authenticated Cloudflare Stream Live notification destination as:

```text
https://<duna-web-host>/api/cloudflare/stream/webhook
Secret: <CLOUDFLARE_STREAM_WEBHOOK_SECRET>
```

Cloudflare sends this secret in `cf-webhook-auth`; Duna rejects a missing or
mismatched value. The destination must include connected, disconnected, and
errored live-input events. Configure the Google callback as:

```text
https://<duna-web-host>/api/video/youtube/callback
```

Configure the Mux webhook endpoint as:

```text
https://<duna-web-host>/api/mux/webhook
```

The implementation follows Cloudflare's
[live input](https://developers.cloudflare.com/stream/stream-live/start-stream-live/),
[simulcast](https://developers.cloudflare.com/stream/stream-live/simulcasting/),
[recording](https://developers.cloudflare.com/stream/stream-live/replay-recordings/),
and [signed playback](https://developers.cloudflare.com/stream/viewing-videos/securing-your-stream/)
models; and YouTube's
[broadcast and stream](https://developers.google.com/youtube/v3/live/guides/implementation/broadcasts-and-streams)
model. The Mux path follows Mux's
[native live-streaming guidance](https://www.mux.com/docs/guides/live-streaming-from-your-app),
[signed playback guidance](https://www.mux.com/docs/guides/secure-video-playback),
its [simulcast guidance](https://www.mux.com/docs/guides/stream-live-to-3rd-party-platforms),
and [Data monitoring guidance](https://www.mux.com/docs/guides/monitor-react-native-video).
R2 uploads follow Cloudflare's
[presigned URL](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)
and [multipart upload](https://developers.cloudflare.com/r2/objects/multipart-objects/)
models.

## Release sequence

1. Keep Production on `DUNA_LIVE_PROVIDER=mux` while staging this change. Apply
   forward-only migrations through `0101_strange_norrin_radd.sql` before any
   server using the new video schema is deployed.
2. Subscribe the Duna Cloudflare account to Stream. Create a separately scoped
   Stream Read/Write API token, configure the signed notification endpoint,
   and add the Cloudflare Stream values to Duna Web and Duna HQ. Do not reuse
   R2 credentials or `CF_TOKEN_VALUE`.
3. Enable the YouTube Data API in Duna's Google project, configure its OAuth
   consent screen and exact redirect URI, and complete any required Google app
   verification. Generate a 32-byte provider-encryption key. Authorize Duna's
   live-enabled YouTube channel for its server refresh token. A connected
   player or organization channel must also have YouTube live streaming
   enabled and no current live restriction.
4. In Preview, set `DUNA_LIVE_PROVIDER=cloudflare`. Validate SRT and RTMPS ingest,
   Cloudflare live state notifications, signed live playback, recording-ID
   reconciliation, and one opt-in simulcast each to Duna, a personal channel,
   and an organization channel. Confirm that disconnect revokes Duna's access
   without deleting existing YouTube videos. Monitor YouTube API quota; the
   default project allocation is finite and higher-volume rollout may require
   Google's quota and compliance review.
5. Repeat the same Preview matrix with `DUNA_LIVE_PROVIDER=mux`, including
   linked YouTube output, low-latency playback, reconnect behavior, and Mux Data
   attribution. Confirm Plus quality is selected unless the test explicitly
   exercises Premium encoding.
6. Create a fresh iOS build. Expo Go cannot load the local native capture
   module.
7. Validate one Public and one Link-only live stream, a private recording, a
   public recording, two angles on one match, and an R2 upload.
8. On physical iPhone and Watch hardware, validate all four gestures, offline
   event recovery, favorite timestamps, score overlay timing, live score
   authority, QR expiry/revocation, remote version conflicts, camera preview,
   and remote start/stop.
9. Promote Production to `DUNA_LIVE_PROVIDER=auto` only after both provider
   matrices and the device gates pass. Verify Premium+, Premium, Scale, Club,
   and Free accounts resolve to the intended provider before activation.
10. Validate the implemented native SRT caller on constrained cellular service,
    including SRT-to-RTMPS fallback, long-session battery/thermal behavior,
    audio continuity, replay-buffer rotation, score/sponsor output, and return
    to live. Keep production on RTMPS/provider overrides until this matrix
    passes; source completion is not device activation.
11. Confirm the `john@beachelite.org` profile displays Complimentary Duna+ after
    migration.
12. If model processing is enabled, configure the dedicated worker with scoped
    R2 credentials plus `DUNA_ANALYSIS_WORKER_URL` and
    `DUNA_ANALYSIS_WORKER_TOKEN`; verify a callback creates a versioned,
    confidence-labeled observation and a private artifact under the correct
    video prefix. A missing worker is a visible queued-analysis state, not a
    completed analysis.
13. Run `pnpm verify`, the connected repository smoke, and an iOS physical-device
    stream before production promotion.

Cloudflare Stream subscription, Google OAuth verification, YouTube API quota,
production credentials, database migration, App Store distribution, sponsor
rights, and any audio-processing vendor agreement remain account-owner launch
gates.
