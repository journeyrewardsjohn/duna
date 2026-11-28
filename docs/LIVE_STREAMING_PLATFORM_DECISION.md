# Duna live streaming platform decision

> **2026-11-27: superseded — Mux removed; Cloudflare Stream + R2 are the only
> video providers.** The tier-aware two-provider routing this document first
> recommended, its provider-selection environment switch, and the second
> provider's code, webhook, player, and metrics are gone. What follows is the
> part of the reasoning that still applies to the Cloudflare-only system.

Status: implemented in source, production activation gated
Reviewed: August 30, 2026; revised November 27, 2026

## Decision

Cloudflare Stream is Duna's only live video provider, for every personal plan
and every Duna HQ plan. It supplies economical ingest, automatic recording,
signed playback, and multi-destination fan-out. Uploaded originals stay in a
private Cloudflare R2 bucket.

A live stream can simulcast to Duna's, a player's, or an organization's YouTube
channel through Cloudflare live outputs. There is no provider selection: when
Cloudflare Stream is not configured, live video is unavailable. Do not add AWS
Elemental MediaConnect or operate a Duna SRT relay for the first release.

The native broadcaster supports both transports. It prefers secure SRT whenever
the live input exposes it, and every SRT session retains that same input's
RTMPS credentials as an automatic connection and dropout fallback. Adaptive bitrate handles observed network pressure independently;
Duna does not pretend the interface label (Wi-Fi versus cellular) is a live
quality test. This policy still requires physical-device, thermal, and
long-session validation before production activation.

This gives Duna the important part of Playcam's relay model without taking on a
24/7 media control plane:

```text
Player iPhone -- SRT or RTMPS --> Cloudflare Stream live input
                                        |
                                        |-- Duna live + recording
                                        |-- Duna YouTube
                                        |-- player YouTube
                                        `-- organization YouTube

Apple Watch / second device --> Duna match-event timeline
                                      |-- score / replay / sponsor commands
                                      `-- iPhone program compositor --> every output
```

## What Playcam publicly reveals

The following is confirmed by Playcam's public product, pricing, onboarding,
dashboard, privacy, and terms pages:

- The camera phone emits one RTMP feed to a relay in US-East. Playcam lists SRT
  as forthcoming, not current.
- The relay sends that feed to Facebook and YouTube and records a master.
- The camera app draws the score into the video. A second phone or tablet can
  operate score, replay, and ads without moving the camera phone.
- Their dashboard says sponsor artwork is composited by the phone, not by the
  relay.
- YouTube and Facebook are connected on behalf of the user. Their privacy
  policy says provider access and refresh tokens are encrypted at rest.
- Their dashboard exposes separate YouTube ingest keys per Playcam channel and
  custom RTMP destinations. It also references recordings stored on the relay,
  Cloudflare R2, or both.
- Community permits one YouTube or Facebook output and public broadcasts. The
  phone records locally; clips can be viewed but not exported, and prior clips
  are mostly cleared when a new stream begins.
- Producer costs $49/month and adds five destinations, seven-day recording
  downloads, exports, branding, and sellable sponsor inventory.
- The free-plan copy remains on the user's YouTube or Facebook account. Their
  terms also grant Playcam a publication and promotional license for Community
  broadcasts, and free streams show a house ad.

Sources: [platform](https://playcam.tv/platform),
[pricing](https://playcam.tv/pricing), [onboarding](https://playcam.tv/start),
[dashboard](https://playcam.tv/app.html),
[privacy](https://playcam.tv/privacy.html), and
[terms](https://playcam.tv/terms.html).

### The likely architecture

Playcam does not disclose its relay software, so an exact claim such as
FFmpeg, SRS, MediaMTX, or nginx-rtmp would be speculation. The observable
design is nevertheless clear:

1. The phone is both camera and lightweight program compositor.
2. A relatively inexpensive regional relay receives one already-encoded feed.
3. The relay duplicates packets to one or more social ingest endpoints and a
   recorder; it is not rendering the score or sponsor graphics.
4. YouTube and Facebook carry nearly all audience-delivery traffic and retain
   the free user's accessible copy.
5. Playcam monetizes exports, retention, additional destinations, sponsor
   inventory, and staffed production rather than charging viewers.

That is how “free unlimited streaming” can be economically plausible: the free
tier has one relay output, little or no first-party audience CDN delivery,
limited first-party retention/export, house-ad inventory, a public-content
license, and a paid conversion path. It is not evidence that ingest, relay
compute, storage, or support have zero cost.

## Why Cloudflare instead of AWS MediaConnect

| Option                | What it solves                                                                                                      | Missing work                                                                                                                                     | Duna decision                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| Cloudflare Stream     | RTMPS/SRT ingest, adaptive playback, automatic recording, signed playback, analytics, and up to 50 RTMP/SRT outputs | Program graphics, replay switching, sponsor composition                                                                                          | Use now                      |
| AWS MediaConnect      | Broadcast-grade SRT/RIST/RTP/Zixi contribution transport                                                            | No direct RTMP/RTMPS output to YouTube; add MediaLive or a custom bridge, playback CDN, recording, and orchestration                             | Do not add now               |
| Self-hosted SRT relay | Full protocol and placement control                                                                                 | High availability, patching, failover, transcoding, recording integrity, signed playback, metrics, abuse handling, egress, and on-call ownership | Revisit only at proven scale |

MediaConnect is excellent when Duna needs broadcast contribution between
venues, production control rooms, and AWS services. It is not the shortest
path from a phone to Duna plus YouTube. AWS's current MediaConnect transport
output list does not include RTMP/RTMPS, while YouTube expects RTMP/RTMPS. An
AWS version therefore becomes SRT to MediaConnect, then MediaLive or a bridge,
then YouTube—more components and more operating cost than Cloudflare's direct
live output.

Sources: [Cloudflare live inputs](https://developers.cloudflare.com/stream/stream-live/),
[Cloudflare simulcast](https://developers.cloudflare.com/stream/stream-live/simulcasting/),
[MediaConnect protocols](https://docs.aws.amazon.com/mediaconnect/latest/ug/protocols.html),
[MediaLive RTMP outputs](https://docs.aws.amazon.com/medialive/latest/ug/creating-rtmp-output-group.html),
and [MediaConnect pricing](https://aws.amazon.com/mediaconnect/pricing/).

## Cost shape

Cloudflare currently charges $5 per prepaid 1,000 stored video minutes and $1
per 1,000 delivered minutes. Ingest and encoding are free. Simulcast output
minutes count as delivered minutes.

For one 60-minute match:

- automatic recording consumes 60 stored minutes, a nominal $0.30 of the
  prepaid storage block;
- three simultaneous YouTube destinations consume 180 delivered minutes, or
  $0.18;
- 100 people watching all 60 minutes directly in Duna consume another 6,000
  delivered minutes, or $6.00; and
- viewers watching on YouTube do not multiply Duna's Cloudflare cost—only the
  one 60-minute output to that YouTube channel is metered by Cloudflare.

The minimum initial storage purchase remains $5, and real costs also include
Google API administration, support, database, and application work. Still,
this is a favorable shape for Duna: use YouTube for broad free distribution
and Duna playback for the richer first-party experience.

Source: [Cloudflare Stream pricing](https://developers.cloudflare.com/stream/pricing/).

Cloudflare's low-latency HLS pipeline is still documented as beta. Duna should
treat long-session latency drift as a measured activation gate: run the same
iPhone encoder and player for 15, 60, and 180 minutes and record p50/p95
live-edge distance, startup, rebuffering, reconnect recovery, and score overlay
error.

Source: [Cloudflare low-latency requirements](https://developers.cloudflare.com/stream/stream-live/start-stream-live/).

## YouTube ownership model

Each broadcast is explicit opt-in. A creator may choose any combination of:

- Duna's official YouTube channel;
- their own linked YouTube channel; and
- a linked channel owned by their active organization.

Duna creates a one-use YouTube live stream and broadcast through OAuth, binds
them, and sends the resulting RTMPS address and key directly to a Cloudflare
live output. Duna stores provider IDs, status, and watch URL.
It does not store the YouTube stream key, Google access token, provider ingest
key, SRT passphrase, or private share URL in its application or idempotency
records. Linked refresh credentials are AES-256-GCM encrypted and can be
revoked from Duna.

Public Duna streams map to Public YouTube broadcasts. Link-only Duna streams
map to Unlisted YouTube broadcasts. A YouTube destination failure is isolated
and visible; it does not incorrectly fail the healthy Duna stream.

Sources: [YouTube Live API overview](https://developers.google.com/youtube/v3/live/getting-started),
[create and bind broadcasts](https://developers.google.com/youtube/v3/live/guides/implementation/broadcasts-and-streams),
and [RTMPS ingest](https://developers.google.com/youtube/v3/live/guides/rtmps-ingestion).

## Second screen, score, replay, ads, and commentary

Cloudflare Stream is a relay/delivery service, not a live video compositor.
Duna's native camera creates the initial program feed before sending it to
Cloudflare. The same rendered frames therefore reach Duna and every
selected YouTube channel. This release includes:

- an authoritative score bug driven by the linked match/Watch/second-screen
  timeline;
- a bounded 15-second rolling replay buffer with 8-, 10-, and 15-second
  operator actions, a visible replay badge, and automatic return to live;
- sponsor-safe text lower thirds controlled from the second screen; and
- source-linked score and replay events for audit and later analysis.

The QR now opens `duna://vision/remote/<token>` directly in the Duna iOS app,
with the existing expiring HTTPS control URL available when the app is not
installed. An invited iPhone or iPad can preview the camera, score, show/hide
the score bug, request replay, take/return a sponsor graphic, and start/end the
camera. Optimistic version checks prevent one stale controller from silently
overwriting another.

The first compositor is deliberately phone-side, matching the cost shape that
Playcam describes. The current local recording follows that program output.
Preserving simultaneous clean and program masters is a separate producer-grade
feature; Duna must not claim a clean master until dual recording is implemented
and device-tested.

### Invited commentator audio

Commentary is not safely solved by adding another audio track to SRT or mixing a
remote call directly on the camera phone. The production design is a
permissioned LiveKit room and cloud program stage:

```text
camera contribution --> LiveKit room <-- invited commentator audio
                               |
                    room/web composite + audio mix
                               |
                    LiveKit egress --> Cloudflare Stream --> YouTube
```

That stage can keep commentator identity, invitations, mute/removal, isolated
tracks, gain/ducking, monitoring, echo control, reconnection, and A/V sync
auditable. It also becomes the right boundary for multiple cameras and clean
plus program masters. Commentary remains activation-gated until those controls,
moderation, youth-safety, and real-device latency tests exist; this iOS release
does not pretend remote commentator audio is already mixed.

Cloudflare's Live Instant Clipping can make a recent clip manifest or MP4, but
it does not switch that clip back into the outgoing YouTube program. Likewise,
Cloudflare Player VAST support can monetize Duna's web player, but it does not
burn a sponsor message into simulcast output. Universal replay and sponsor
graphics therefore belong at the compositor.

Sources: [Cloudflare Live Instant Clipping](https://developers.cloudflare.com/stream/stream-live/live-instant-clipping/)
and [Cloudflare Stream Player ads](https://developers.cloudflare.com/stream/viewing-videos/using-the-stream-player/),
[LiveKit ingress and egress](https://docs.livekit.io/transport/media/ingress-egress/),
and [LiveKit web compositing](https://docs.livekit.io/home/egress/web/).

## Activation gates

1. Apply the forward-only database migration before deploying code that reads
   the new schema.
2. Enable Cloudflare Stream and configure a separately scoped Stream Read/Write
   token and authenticated live-input notifications.
3. Configure Google OAuth, enable the YouTube Data API, complete any required
   verification, generate the encryption key, and authorize Duna's official
   live-enabled channel.
4. Exercise public, link-only, private recording, official-channel, personal,
   and organization simulcast paths in Preview.
5. Run the long-duration SRT/RTMPS and playback matrix against Cloudflare on
   physical iPhones. Include live-edge drift, startup, rebuffering,
   SRT-to-RTMPS recovery, battery/thermal behavior, audio continuity, score and
   sponsor synchronization, replay return-to-live, recording reconciliation,
   and one linked YouTube output.
6. Monitor Cloudflare minutes, YouTube API quota, output failures, startup
   time, disconnect recovery, and recording reconciliation.

Native SRT and the phone-side score/replay/sponsor program are implemented but
must not be described as production-active until this physical-device matrix
passes. Invited commentary remains a later cloud-producer release.
