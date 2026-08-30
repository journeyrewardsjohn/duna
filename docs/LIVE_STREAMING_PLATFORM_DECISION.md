# Duna live streaming platform decision

Status: implementation-ready, production activation gated
Reviewed: August 30, 2026

## Decision

Duna should use Cloudflare Stream as the managed live origin, recorder,
playback service, and simulcast fan-out layer. New Duna live sessions should
use Cloudflare RTMPS now; SRT should become the preferred mobile contribution
protocol only after the native iOS broadcaster completes its SRT module
migration and physical-device validation.

Keep Mux available for existing recordings and as a controlled rollback during
the migration. Do not add AWS Elemental MediaConnect or operate a Duna SRT
relay for the first release.

This gives Duna the important part of Playcam's relay model without taking on a
24/7 media control plane:

```text
Player iPhone -- RTMPS now / SRT later --> Cloudflare Stream
                                           |-- Duna live + replay
                                           |-- Duna YouTube
                                           |-- player YouTube
                                           `-- organization YouTube

Apple Watch / second device --> Duna match-event timeline --> Duna overlay now
                                                   `-------> program compositor later
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

| Option                | What it solves                                                                                                      | Missing work                                                                                                                                     | Duna decision                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| Cloudflare Stream     | RTMPS/SRT ingest, adaptive playback, automatic recording, signed playback, analytics, and up to 50 RTMP/SRT outputs | Program graphics, replay switching, sponsor composition                                                                                          | Use now                          |
| AWS MediaConnect      | Broadcast-grade SRT/RIST/RTP/Zixi contribution transport                                                            | No direct RTMP/RTMPS output to YouTube; add MediaLive or a custom bridge, playback CDN, recording, and orchestration                             | Do not add now                   |
| Self-hosted SRT relay | Full protocol and placement control                                                                                 | High availability, patching, failover, transcoding, recording integrity, signed playback, metrics, abuse handling, egress, and on-call ownership | Revisit only at proven scale     |
| Mux                   | Managed live ingest, playback, recording, and established legacy Duna assets                                        | Higher-cost dependency for the intended fan-out model                                                                                            | Preserve for legacy and rollback |

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

## YouTube ownership model

Each broadcast is explicit opt-in. A creator may choose any combination of:

- Duna's official YouTube channel;
- their own linked YouTube channel; and
- a linked channel owned by their active organization.

Duna creates a one-use YouTube live stream and broadcast through OAuth, binds
them, and sends the resulting RTMPS address and key directly to a Cloudflare
output. Duna stores provider IDs, status, and watch URL. It does not store the
YouTube stream key, Google access token, Cloudflare ingest key, SRT passphrase,
or private share URL in its application or idempotency records. Linked refresh
credentials are AES-256-GCM encrypted and can be revoked from Duna.

Public Duna streams map to Public YouTube broadcasts. Link-only Duna streams
map to Unlisted YouTube broadcasts. A YouTube destination failure is isolated
and visible; it does not incorrectly fail the healthy Duna stream.

Sources: [YouTube Live API overview](https://developers.google.com/youtube/v3/live/getting-started),
[create and bind broadcasts](https://developers.google.com/youtube/v3/live/guides/implementation/broadcasts-and-streams),
and [RTMPS ingest](https://developers.google.com/youtube/v3/live/guides/rtmps-ingestion).

## Second screen, score, replay, and ads

Cloudflare is a relay and delivery service, not a live video compositor. The
first release therefore keeps Duna's existing Apple Watch and remote-device
score timeline authoritative and renders it over Duna playback. YouTube
receives the clean camera and court-audio feed.

### Phase 1: connected metadata

- Watch and remote scoring continue to write ordered Duna match events.
- Duna web and app players render the live score over Cloudflare playback.
- Score events remain source-linked for replay markers, clips, and later
  analysis.
- YouTube destinations receive the same clean encoded feed.

### Phase 2: native SRT contribution

- Move the iOS broadcaster from its current RTMP-only CocoaPods bridge to the
  HaishinKit SPM SRT module.
- Validate Cloudflare SRT caller mode, reconnect behavior, keyframe interval,
  battery, thermals, audio continuity, and constrained cellular networks on
  physical devices.
- Retain RTMPS as an automatic operational fallback.

### Phase 3: a real Duna program feed

Add a compositor that consumes the authoritative event timeline before the
feed is fanned out. The same rendered program then reaches Duna and every
YouTube channel. It can support:

- score bug, serving indicator, set count, and sponsor-safe lower thirds;
- operator-triggered full-screen or bumper ads with duration limits;
- a bounded replay buffer with a clear return-to-live action; and
- an insertion audit containing sponsor, operator, start, end, and affected
  destinations.

The lower-cost first implementation is phone-side composition, matching what
Playcam says it does. Duna should locally preserve a clean recording while
sending the composited program feed. If multiple cameras, higher reliability,
or clean/program cloud masters become requirements, introduce a dedicated
producer service then—not merely an SRT relay.

Cloudflare's Live Instant Clipping can make a recent clip manifest or MP4, but
it does not switch that clip back into the outgoing YouTube program. Likewise,
Cloudflare Player VAST support can monetize Duna's web player, but it does not
burn a sponsor message into simulcast output. Universal replay and sponsor
graphics therefore belong at the compositor.

Sources: [Cloudflare Live Instant Clipping](https://developers.cloudflare.com/stream/stream-live/live-instant-clipping/)
and [Cloudflare Stream Player ads](https://developers.cloudflare.com/stream/viewing-videos/using-the-stream-player/).

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
5. Validate RTMPS capture on a physical iPhone and live scoring on Watch and a
   second device before setting Production to Cloudflare-first.
6. Monitor Cloudflare minutes, YouTube API quota, output failures, startup
   time, disconnect recovery, and recording reconciliation during rollout.

Native SRT and composited score/replay/ads are separate device-tested releases;
they should not be described as active merely because Cloudflare can accept an
SRT input or create a clip.
