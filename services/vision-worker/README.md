# Duna Vision GPU worker

This service is the private execution plane for Duna Vision. It downloads an
authorized R2 source, runs a CUDA-backed ONNX detector and temporal volleyball
classifier, writes a versioned manifest below the video's private analysis
prefix, and posts typed observations to Duna Web.

It deliberately has no demo inference mode. Missing CUDA, weights, source
access, or court evidence produces a bounded failed callback; an unsigned model
can complete only as `needs-review`.

## Model contract

Mount a directory at `DUNA_VISION_MODEL_BUNDLE`. It contains `manifest.json`
using `model-bundle.example.json`, plus the detector and temporal ONNX files.
The detector output is `N × 6`: `x1, y1, x2, y2, confidence, class_id`. The
temporal model receives `1 × windowFrames × 6` ball/court features and returns
one probability per declared label. The worker requires ONNX Runtime's CUDA
provider and never silently falls back to CPU.

The worker derives rally boundaries only from typed contacts, landings, and
bounded time gaps. It does not invent kills, errors, player identity, or speed.

## Runtime configuration

Required secrets and settings:

- `DUNA_ANALYSIS_WORKER_TOKEN`: shared only with the Web callback route.
- `DUNA_CONTROL_PLANE_URL`: the production Web origin.
- `DUNA_VISION_MODEL_BUNDLE`: mounted immutable model directory.
- `CLOUDFLARE_ACCOUNT_ID`, `R2_BUCKET_NAME`, `CF_ACCESS_KEY_ID`, and
  `CE_SECRET_ACCESS_KEY`: scoped private R2 S3 access.

For a promoted model, also mount `DUNA_VISION_PROMOTION_ATTESTATION` and
`DUNA_VISION_PROMOTION_PUBLIC_KEY`. The private signing key belongs only in the
offline validation environment, never in the worker.

The container needs one NVIDIA GPU and a persistent volume at
`/var/lib/duna-vision`. The SQLite claim registry makes retries idempotent for a
single GPU replica; do not increase replicas until the registry is moved to a
shared durable queue.

`/health` is a lightweight liveness check. `/ready` loads the model, confirms
CUDA and R2 configuration, and reports only the model version and promotion
state—never credentials or private artifact details.

## Real-match validation

Predictions cannot become `ready` merely because inference completed. Build a
private held-out manifest from consented match clips and truth reviewed by at
least two independent annotators. Each clip binds the source, truth, and
prediction hashes; the evaluator also proves every prediction came from the
exact candidate model bundle. Minimum clip, contact, rally, landing, and
per-slice contact counts prevent an easy or empty corpus from passing. Raw
videos and annotations stay out of Git.

The validator also decodes each held-out source with `ffprobe` and checks its
measured duration, so a manifest cannot promote from missing or placeholder
media. The worker container already includes ffmpeg; local validation needs it
on `PATH`.

Run:

```sh
duna-vision-validate benchmark.json \
  --model-bundle /models/candidate \
  --output promotion-attestation.json \
  --private-key /validation-secrets/ed25519-private.pem
```

The gate measures contact, rally, and landing F1; landing error; court error;
false events per minute; usable coverage; and minimum performance across court,
lighting, occlusion, and camera-angle slices. Synthetic fixtures can test the
harness but are structurally forbidden from promoting a model.

## Local checks

```sh
python -m pytest
docker build -t duna-vision-worker .
```
