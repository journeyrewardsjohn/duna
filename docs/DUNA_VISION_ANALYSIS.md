# Duna Vision analysis control plane

Duna Vision keeps video playback, match truth, and computer-vision inference
separate. Mux serves live/playback, private R2 stores originals and derived
artifacts, Duna Web owns authorization and durable commands, and an external
GPU worker owns decode and inference. No video bytes or model weights belong in
Vercel.

## Product contract

The smallest user-facing loop is intentionally simple:

1. Capture a recording with a calibrated court in Duna Player.
2. Score, save, or flag a rally on Apple Watch without leaving the court.
3. Open the paired iPhone or authenticated web Studio for source-linked
   playback, a visible-court landing map, highlights, and the review queue.
4. Tap a landing only when a coach/player can verify it. That produces a human
   event, never a synthetic ML claim.

The Watch is a courtside cue surface, not a video editor. Full playback and
analysis stay on the iPhone/web Studio.

## Data invariants

- All analysis event time uses recording-relative **microseconds** and is
  bounded to 12 hours.
- The canonical beach court defaults to 8m wide × 16m long. A session may use
  its recorded calibrated dimensions instead.
- A court point carries `observed: visible | edge | out-of-frame`. Only
  `visible` points inside the calibrated court can affect a heatmap.
- Model events are proposals. A separate human review/correction outranks the
  model and must not mutate the original event.
- An analysis event cannot make or alter official scoring. The existing match
  event stream remains the scoring authority.
- Ordinary video permission and model-learning consent are distinct. A run may
  analyze an authorized video without making it training data.

The SQL source of truth is the forward migration in
`packages/db/drizzle/0071_solid_bushwacker.sql`. Its tables are:

| Table                    | Responsibility                                                                   |
| ------------------------ | -------------------------------------------------------------------------------- |
| `video_analysis_runs`    | durable queue/run state, coverage, model/pipeline provenance, artifact reference |
| `video_analysis_events`  | immutable human/model/system observations                                        |
| `video_analysis_reviews` | separate reviewer decisions and corrections                                      |
| `vision_timeline_events` | append-only Watch/iPhone timeline facts, including `review-marker`               |

## Worker contract

The application dispatches an HTTPS request only when both
`DUNA_ANALYSIS_WORKER_URL` and `DUNA_ANALYSIS_WORKER_TOKEN` are configured. The
worker receives a small reference command, not media bytes:

```json
{
  "runId": "uuid",
  "videoId": "uuid",
  "r2ObjectKey": "private source key when available",
  "muxAssetId": "Mux asset reference when available",
  "visionSessionId": "uuid",
  "court": {
    "widthMeters": 8,
    "lengthMeters": 16,
    "coordinateFrame": "canonical-court",
    "calibrationSource": "vision"
  },
  "callbackPath": "/api/video/analysis"
}
```

The worker must authenticate its callback with the same bearer token and send a
`videoAnalysisWorkerResultSchema` payload. Successful model observations need
stable UUIDs, a model version, a bounded microsecond timestamp, and calibrated
coordinates only where the point was visibly observed. Derived manifests,
tracks, or parquet files may be written only below:

```text
video-analysis/{videoId}/
```

The callback is idempotent by event ID. A failed result requires a bounded
failure code; a worker must not report `ready` without a real completion.

## Model promotion rules

The worker repository is intentionally independent from this product
repository. Before a model version is allowed to return production proposals,
the model owner must retain:

- immutable model/container and dataset-manifest identifiers;
- held-out evaluation covering different courts, weather, camera angles, skin
  tones, uniforms, ball families, and visibility/occlusion cases;
- calibration and confidence calibration reports;
- shadow-mode comparison against the active version;
- rollback target and decision record; and
- a privacy record proving that each training sample has the separate required
  consent.

No unregistered model, raw neural logit, inferred invisible landing, or
single-camera centimeter claim is allowed to become a user-visible fact.

## Release gates

1. Apply the latest migration to an approved isolated database branch and
   review generated SQL before production.
2. Confirm Duna Web has `DUNA_DATA_SOURCE=database`, `DATABASE_URL`, and the
   scoped R2 S3 variables. Do not use an account API token as an S3 secret.
3. Deploy the Web control plane and verify authenticated owner, authorized
   coach, and denied-user report access.
4. Build a fresh paired iPhone/Watch binary for native cue behavior; an OTA
   update cannot prove a changed Watch target.
5. If a GPU worker is enabled, run a real private source through it and verify
   the exact run, callback, R2 artifact prefix, model version, and human review
   path. Without a configured worker, reports remain honest and visibly
   queued—do not call model analysis live.

See `docs/VIDEO_PLATFORM.md` for capture/provider behavior and
`docs/ENVIRONMENT_VARIABLES.md` for variable names and scope.
