# Duna environment variables

This is the variable-name and storage contract. It intentionally contains no
credential values, connection strings, private endpoints, certificates, keys,
or signed URLs.

The executable sources of truth are `.env.example`, `turbo.json`, the two
`eas.json` files, and `process.env` reads in source. Update this document and
`.env.example` together when adding or retiring an application variable.

## Sensitivity classes

| Class                | Rule                                                                               | Examples                                                 |
| -------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Public client config | Compiled into browser/native code and readable by every user                       | `NEXT_PUBLIC_*`, `EXPO_PUBLIC_*`, Stripe publishable key |
| Server config        | Non-secret behavior/identifier, but not automatically exposed to clients           | feature switches, model names, sender/template names     |
| Server secret        | Credential, connection string, signing material, allowlist, private endpoint/token | `DATABASE_URL`, `NEON_READ_ONLY_REPLICA`, API keys       |
| Provider/system      | Injected by Vercel/EAS/CI; normally not created or copied manually                 | `VERCEL`, `VERCEL_ENV`, `VERCEL_OIDC_TOKEN`, `CI`        |

When uncertain, treat a value as a server secret. “Publishable” or “public”
means safe to embed for its restricted purpose; it does not mean safe to grant
admin permissions.

## Storage locations

| Location                                | Use                                                 | Never put here                                                            |
| --------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------- |
| `.env.example`                          | Committed names, safe defaults, comments            | Real values                                                               |
| `apps/web/.env.local`                   | Ignored Web local values                            | Production values unless an approved local production check requires them |
| `apps/hq/.env.local`                    | Ignored HQ local values                             | Any committed content                                                     |
| `apps/player/.env.local`                | Ignored Expo local public config                    | Server secrets                                                            |
| `apps/pro/.env.local`                   | Ignored Expo local public config                    | Server secrets                                                            |
| Vercel `duna-web` Environment Variables | Web/API runtime, per target                         | Native-only config or values intended for HQ only                         |
| Vercel `duna-hq` Environment Variables  | HQ/Admin runtime, per target                        | Assumption that Web automatically shares the value                        |
| EAS project Environment Variables       | Player or Pro build/update environment              | Database/provider/signing secrets embedded into app code                  |
| LiveKit worker environment              | Voice worker's server credentials                   | Browser/native config                                                     |
| GitHub Actions secrets                  | Workflow-only secrets, for example Sand cron bearer | Values copied into workflow logs                                          |

Next and Expo load app-local `.env` files. Root scripts need variables exported
in their process or injected by a provider command; do not assume every tool
loads the repository root `.env.local` automatically.

Because `packages/api` executes inside both Web and HQ, configure a shared
server variable in every Vercel project that can execute the affected procedure
or route. Adding a value to one project does not add it to the other.

## Core runtime, URLs, roles, and cron

| Name                       | Class                | Consumer/purpose                                                           |
| -------------------------- | -------------------- | -------------------------------------------------------------------------- |
| `NEXT_PUBLIC_APP_URL`      | Public               | Canonical/local Web origin                                                 |
| `NEXT_PUBLIC_HQ_URL`       | Public               | HQ link and e2e build-time target                                          |
| `NEXT_PUBLIC_WEB_URL`      | Public               | Current Web URL alias used by HQ/API links                                 |
| `NEXT_PUBLIC_DUNA_WEB_URL` | Public               | Preferred explicit Duna Web URL alias                                      |
| `DUNA_WEB_URL`             | Server config        | Server-only Web URL fallback for video/Vision links                        |
| `NEXT_PUBLIC_DEMO_MODE`    | Public config        | Enables explicit demo actor behavior when not `false`                      |
| `DUNA_DATA_SOURCE`         | Server config        | Set to `database` for connected deployments; `demo` forces demo repository |
| `DATABASE_URL`             | Server secret        | Neon primary for writes, transactions, migrations, and consistent reads    |
| `NEON_READ_ONLY_REPLICA`   | Server secret        | Neon read-only replica for eligible latency-tolerant reads                 |
| `DUNA_ADMIN_EMAILS`        | Server secret/config | Comma-separated approved Admin bootstrap allowlist                         |
| `DUNA_SUPER_ADMIN_EMAILS`  | Server secret/config | Comma-separated approved Super Admin bootstrap allowlist                   |
| `DUNA_MCP_ALLOWED_ORIGINS` | Server config        | Additional explicit CORS origins for public MCP                            |
| `CRON_SECRET`              | Server secret        | Bearer validation for Web/HQ cron routes                                   |

`getReadOnlyDatabase()` uses `NEON_READ_ONLY_REPLICA` and falls back to
`DATABASE_URL` when the replica is absent in local or isolated environments.
Production should configure both values in `duna-web` and `duna-hq`. The
replica is only for read-only, latency-tolerant work such as public discovery,
rankings, reporting, and dashboards. Authentication/authorization,
membership/guardian state, payments, inventory/capacity, registration,
waitlists, live scoring, messaging cursors, migrations, transactions, and any
read-after-write flow stay on `DATABASE_URL` because replica data can lag.

GitHub's scheduled Sand workflow stores the bearer under the repository secret
name `DUNA_CRON_SECRET` and exposes it to the request process as `CRON_SECRET`.
Do not add the GitHub secret name to application code.

## WorkOS identity

| Name                              | Class                | Consumer/purpose                                                      |
| --------------------------------- | -------------------- | --------------------------------------------------------------------- |
| `WORKOS_CLIENT_ID`                | Server config        | Web/HQ AuthKit and native code exchange audience                      |
| `WORKOS_API_KEY`                  | Server secret        | WorkOS server SDK                                                     |
| `WORKOS_COOKIE_PASSWORD`          | Server secret        | AuthKit cookie encryption; minimum length enforced by provider/config |
| `NEXT_PUBLIC_WORKOS_REDIRECT_URI` | Public config        | Fallback redirect for tooling that cannot derive request origin       |
| `EXPO_PUBLIC_WORKOS_CLIENT_ID`    | Public client config | Player/Pro OAuth public client identifier                             |

There is no WorkOS client secret in the native apps. Native authorization uses
PKCE and the server endpoints under `/api/auth/mobile/*`.

## Native app public runtime

| Name                           | App         | Purpose                                           |
| ------------------------------ | ----------- | ------------------------------------------------- |
| `EXPO_PUBLIC_DUNA_API_URL`     | Player, Pro | Base Web/API URL; normalized to `/api/trpc`       |
| `EXPO_PUBLIC_DUNA_AUTH_URL`    | Player, Pro | Base URL for mobile WorkOS exchange/refresh       |
| `EXPO_PUBLIC_DUNA_WEB_URL`     | Player      | Public Web links, fallback auth base              |
| `EXPO_PUBLIC_DUNA_HQ_URL`      | Pro         | HQ links                                          |
| `EXPO_PUBLIC_DUNA_PREVIEW`     | Player, Pro | Visible preview/non-production mode label         |
| `EXPO_PUBLIC_MAPBOX_API_TOKEN` | Player      | Restricted public Mapbox token for the native map |
| `EXPO_PUBLIC_WORKOS_CLIENT_ID` | Player, Pro | WorkOS public client identifier                   |

These names must be present in the selected EAS environment for `eas update`.
Values defined only in a build profile's `env` block are not automatically
available to the update command.

## Stripe, plans, identity, and wallet

| Name/group                                                     | Class                | Purpose                                                                                                                           |
| -------------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_PUBLISHABLE_KEY` | Public/server config | Browser/native-safe publishable key and server alias                                                                              |
| `STRIPE_SECRET_KEY`                                            | Server secret        | Stripe server API                                                                                                                 |
| `STRIPE_WEBHOOK_SECRET`                                        | Server secret        | Signature verification for the deployed Web webhook                                                                               |
| `STRIPE_AUTOMATIC_TAX_ENABLED`                                 | Server config        | Tax switch for Duna-owned subscriptions; organization marketplace sales use required platform-liable Tax after Connect onboarding |
| `STRIPE_IDENTITY_REQUIRE_SELFIE`                               | Server config        | Stripe-hosted identity policy switch                                                                                              |
| `DUNA_WALLET_CASH_ENABLED`                                     | Server config        | Fail-closed cash-wallet switch; organization credits are separate                                                                 |
| `STRIPE_DUNA_SERVICE_FEE_PRODUCT_ID`                           | Server config        | Canonical service-fee product reference when provisioned                                                                          |

Consumer membership price map:

```text
STRIPE_DUNA_PREMIUM_MONTHLY_PRICE_ID
STRIPE_DUNA_PREMIUM_ANNUAL_PRICE_ID
STRIPE_DUNA_PREMIUM_PLUS_MONTHLY_PRICE_ID
STRIPE_DUNA_PREMIUM_PLUS_ANNUAL_PRICE_ID
STRIPE_DUNA_PLUS_MONTHLY_PRICE_ID
STRIPE_DUNA_PLUS_ANNUAL_PRICE_ID
```

Organization plan price map:

```text
STRIPE_HQ_CLUB_MONTHLY_PRICE_ID
STRIPE_HQ_CLUB_ANNUAL_PRICE_ID
STRIPE_HQ_FACILITY_MONTHLY_PRICE_ID
STRIPE_HQ_FACILITY_ANNUAL_PRICE_ID
STRIPE_HQ_UPLOAD_PACK_MONTHLY_PRICE_ID
STRIPE_HQ_UPLOAD_PACK_ANNUAL_PRICE_ID
STRIPE_HQ_LIVE_PACK_MONTHLY_PRICE_ID
STRIPE_HQ_LIVE_PACK_ANNUAL_PRICE_ID
STRIPE_HQ_UPLOAD_PAYG_PRICE_ID
STRIPE_HQ_LIVE_PAYG_PRICE_ID
```

Legacy organization aliases still read by the API:

```text
STRIPE_SMALL_CLUB_MONTHLY_PRICE_ID
STRIPE_SMALL_CLUB_ANNUAL_PRICE_ID
STRIPE_CLUB_MONTHLY_PRICE_ID
STRIPE_CLUB_ANNUAL_PRICE_ID
```

Price/product IDs are server configuration. They are not secret credentials,
but they still belong in environment configuration so test/live catalogs cannot
be mixed in source.

## AI, research, Sand data, and media generation

| Name                                   | Class                  | Purpose                                                            |
| -------------------------------------- | ---------------------- | ------------------------------------------------------------------ |
| `AI_GATEWAY_API_KEY`                   | Server secret          | Vercel AI Gateway credential outside workload identity             |
| `VERCEL_OIDC_TOKEN`                    | Provider/system secret | Short-lived Vercel workload identity used by Gateway-capable code  |
| `OPENAI_API_KEY`                       | Server secret          | OpenAI Agents/LiveKit paths that are explicitly direct-provider    |
| `DUNA_AI_MODEL`                        | Server config          | Duna messaging/support agent model                                 |
| `DUNA_SAFETY_MODEL`                    | Server config          | Youth/safety screening model                                       |
| `DUNA_COPILOT_MODEL`                   | Server config          | Provider-qualified Duna CoPilot model used only through AI Gateway |
| `OPENAI_ZERO_DATA_RETENTION_CONFIRMED` | Server config          | Fail-closed environment attestation for minor-content provider use |
| `FIRECRAWL_API_KEY`                    | Server secret          | Firecrawl access for rendered/source research                      |
| `SAND_SCRAPER_ENGINE`                  | Server config          | Explicit native/scraper selection                                  |
| `DUNA_MEDIA_CONCURRENCY`               | Tool config            | Bounded media-generation script concurrency                        |
| `HF_CREDENTIALS`                       | Server/tool secret     | Higgsfield product-media generation credentials                    |
| `HIGGSFIELD_BIN`                       | Tool config            | Optional local Higgsfield CLI path override                        |

Gateway model selectors (server config, provider-qualified values):

```text
AI_GATEWAY_AVP_MODEL
AI_GATEWAY_WAIVER_IMPORT_MODEL
AI_GATEWAY_EVENT_RESEARCH_MODEL
AI_GATEWAY_PLAYER_RESEARCH_MODEL
AI_GATEWAY_PROFILE_MODEL
AI_GATEWAY_SPORTSWRITER_MODEL
AI_GATEWAY_VIRTUAL_COACHING_MODEL
AI_GATEWAY_TOURNAMENT_ANALYTICS_MODEL
AI_GATEWAY_VENUE_LAYOUT_MODEL
```

`FIRECRAWL_API` remains a legacy key alias in some adapters; new environments
should use `FIRECRAWL_API_KEY`. Do not put a provider key directly into a model
selector or URL variable.

## Maps, places, routes, and weather

| Name                                     | Class                            | Purpose                                                                     |
| ---------------------------------------- | -------------------------------- | --------------------------------------------------------------------------- |
| `GOOGLE_PLACES_API_KEY`                  | Server secret                    | Places autocomplete/detail/venue validation through server routes           |
| `GOOGLE_ROUTES_API_KEY`                  | Server secret                    | Bounded arrival distance/ETA route service; may fall back per service logic |
| `GOOGLE_WORKSPACE_SERVICE_ACCOUNT_EMAIL` | Server secret                    | Service-account identity used only for delegated Workspace authorization    |
| `GOOGLE_WORKSPACE_PRIVATE_KEY`           | Server secret                    | PEM key for the delegated Workspace service account                         |
| `GOOGLE_WORKSPACE_MEET_ORGANIZER_EMAIL`  | Server config                    | Licensed Duna Workspace user impersonated as Calendar/Meet organizer        |
| `GOOGLE_WORKSPACE_MEET_CALENDAR_ID`      | Server config                    | Optional organizer-owned calendar ID; defaults to the organizer email       |
| `MAPBOX_API_TOKEN_PUBLIC`                | Public config stored server-side | Preferred public `pk` token returned by the Web/HQ token proxy              |
| `MAPBOX_API_TOKEN`                       | Public-or-server token           | Compatibility fallback; route accepts only a public `pk` token for clients  |
| `TOMORROW_IO_API_KEY`                    | Server secret                    | Weather/daylight context                                                    |

Use `EXPO_PUBLIC_MAPBOX_API_TOKEN` only for the restricted native public token.
Secret-scope Mapbox tokens never belong in Expo.

## Apple Wallet

| Name                                 | Class         | Purpose                                             |
| ------------------------------------ | ------------- | --------------------------------------------------- |
| `DUNA_WALLET_DOWNLOAD_SECRET`        | Server secret | Signs short-lived, person-bound pass download links |
| `APPLE_WALLET_PASS_TYPE_ID`          | Server config | Apple Pass Type identifier                          |
| `APPLE_WALLET_TEAM_ID`               | Server config | Apple team identifier                               |
| `APPLE_WALLET_WWDR_CERT_BASE64`      | Server secret | WWDR certificate material                           |
| `APPLE_WALLET_SIGNER_CERT_BASE64`    | Server secret | Pass signing certificate                            |
| `APPLE_WALLET_SIGNER_KEY_BASE64`     | Server secret | Pass signing private key                            |
| `APPLE_WALLET_SIGNER_KEY_PASSPHRASE` | Server secret | Signing-key passphrase                              |

Certificate/private-key values belong only in the encrypted server store. Do
not reuse APNs keys as Wallet signing keys.

## Mux video

Canonical names:

```text
MUX_TOKEN_ID
MUX_TOKEN_SECRET
MUX_WEBHOOK_SECRET
MUX_SIGNING_KEY_ID
MUX_PRIVATE_KEY
MUX_DATA_ENV_KEY
```

All are server-side. `MUX_SECRET_KEY`, `MUX_SIGNING_KEY`, and
`MUX_SIGNING_SECRET` are accepted compatibility aliases in parts of the video
adapter; prefer the canonical names above for new environments. Private key
material may contain real newlines or the documented escaped representation and
must never enter client code/logs.

## Health encryption

| Name                         | Class         | Purpose                                                     |
| ---------------------------- | ------------- | ----------------------------------------------------------- |
| `HEALTH_DATA_ENCRYPTION_KEY` | Server secret | Base64-encoded 32-byte root for separated AES-GCM/HMAC keys |

This key is required in every server environment that accepts Health sync. Key
rotation is versioned/re-encrypted; never replace the production key in place.
See [`HEALTH_PRIVACY.md`](HEALTH_PRIVACY.md).

## Cloudflare R2 and Vercel Blob

Canonical R2 names:

```text
CLOUDFLARE_ACCOUNT_ID
R2_BUCKET_NAME
CF_ACCESS_KEY_ID
CE_SECRET_ACCESS_KEY
```

`CF_TOKEN_VALUE` is an optional Cloudflare account operations token and is not
used for application S3 uploads. `CF_ACCOUNT_ID` and `CF_SECRET_ACCESS_KEY` are
accepted legacy aliases; the server-only deployment aliases
`cloudflare_account_id`, `cf_r2_access_key_id`, `cf_r2_secret_access_key`, and
`cf_rs_s3_endpoint` are also accepted during the R2 rollout. Prefer the
canonical names above for new environments. Despite the unusual existing
`CE_SECRET_ACCESS_KEY` spelling, it is the current canonical application name
and must match code/provider configuration exactly. An R2 S3 endpoint must be
HTTPS and under `r2.cloudflarestorage.com`; Cloudflare account API tokens never
substitute for the scoped S3 access key and secret.

`BLOB_READ_WRITE_TOKEN` authorizes Vercel Blob paths. R2/Blob credentials are
server secrets and should be configured separately in Web and HQ where those
routes execute.

### Duna Vision analysis worker

```text
DUNA_ANALYSIS_WORKER_URL
DUNA_ANALYSIS_WORKER_TOKEN
DUNA_VISION_OPERATIONS_URL
DUNA_VISION_ATTESTATION_PUBLIC_KEY_PEM
DUNA_CONTROL_PLANE_URL
DUNA_VISION_MODEL_BUNDLE
DUNA_VISION_PROMOTION_ATTESTATION
DUNA_VISION_PROMOTION_PUBLIC_KEY
```

The optional worker receives a queued server-to-server job and posts validated
model observations back to `/api/video/analysis`. It may read private source
video and write derived artifacts only under `video-analysis/{videoId}/` in R2.
This worker is the model execution plane—not a Vercel request handler—and its
token must remain server-side.

`DUNA_ANALYSIS_WORKER_URL` points Web to the worker's `/v1/analysis` endpoint.
The worker uses `DUNA_CONTROL_PLANE_URL` plus the fixed callback path; it never
trusts a callback origin supplied by a job. The model bundle is an immutable
mounted directory. Promotion files are optional as a pair: without a verified
Ed25519 attestation for the exact bundle hash, results remain `needs-review`.
The offline private signing key is intentionally not a runtime variable.

`DUNA_VISION_OPERATIONS_URL` lets the authenticated Super Admin Model Lab start
bounded Modal validation and training operations. Web verifies every returned
promotion record with `DUNA_VISION_ATTESTATION_PUBLIC_KEY_PEM`, an Ed25519 public
key; the corresponding private signer remains only in Modal's protected secret.

The worker also needs the canonical scoped R2 S3 variables above and a
persistent `/var/lib/duna-vision` volume. It requires an NVIDIA GPU and will
fail closed when the CUDA execution provider is unavailable.

## LiveKit and voice

```text
LIVEKIT_URL
LIVEKIT_API_KEY
LIVEKIT_API_SECRET
```

All are server-side. Web/HQ need them to issue scoped tokens; the voice worker
needs them to join/serve the LiveKit project. Native apps receive only a
short-lived participant token and public server URL returned by an authorized
route.

## Live Activities, APNs, and Expo Push

APNs server names:

```text
APNS_TEAM_ID
APNS_KEY_ID
APNS_PRIVATE_KEY
APNS_BUNDLE_ID
APNS_PLAYER_BUNDLE_ID
APNS_PRO_BUNDLE_ID
```

`APNS_BUNDLE_ID` is the legacy Player fallback. New multi-app environments
should set the explicit Player and Pro bundle names. `APNS_PRIVATE_KEY` is
server-only `.p8` material.

Optional Expo Push access tokens:

```text
EXPO_PLAYER_ACCESS_TOKEN
EXPO_PRO_ACCESS_TOKEN
EXPO_ACCESS_TOKEN
```

Prefer per-project tokens when enhanced push security is enabled;
`EXPO_ACCESS_TOKEN` is a single-project compatibility fallback. These are
server tokens, not EAS public variables.

## Messaging, workflows, email, and SMS

Durable workflow names:

```text
INNGEST_EVENT_KEY
INNGEST_SIGNING_KEY
```

Messaging AI/safety names are listed in the AI section. Wakeup names:

```text
MESSAGING_SSE_ENABLED
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

`UPSTASH_REDIS_REST_*` are server secrets/config and must never enter a client.
Missing/disabled Upstash keeps Neon polling active.

Delivery provider names:

```text
KNOCK_SECRET_API_KEY
RESEND_API_KEY
RESEND_FROM_EMAIL
SENT_DM_API
SENT_DM_SANDBOX
SENT_DM_BOOKING_INVITE_TEMPLATE_ID
SENT_DM_BOOKING_INVITE_TEMPLATE_NAME
SENT_DM_MATCH_INVITE_TEMPLATE_NAME
SENT_DM_PLAYER_INVITE_TEMPLATE_NAME
SENT_DM_STAFF_INVITE_TEMPLATE_NAME
SENT_DM_TEAM_INVITE_TEMPLATE_NAME
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_FROM_NUMBER
```

`SENT_DM_API_KEY` remains an accepted legacy alias for `SENT_DM_API`. API keys
and Twilio auth tokens are secrets; sender addresses/numbers/template names are
server config and still require provider approval.

## Observability

```text
SENTRY_AUTH_TOKEN
NEXT_PUBLIC_SENTRY_DSN
NEXT_PUBLIC_POSTHOG_KEY
AXIOM_TOKEN
```

The `NEXT_PUBLIC_*` observability values are public project identifiers. Ingest
tokens are server/build secrets. Instrumentation must redact credentials,
private message/Health content, signed URLs, and raw sensitive provider payloads.

## Test and provider-system variables

Local/CI test controls:

```text
PLAYWRIGHT_BASE_URL
PLAYWRIGHT_HQ_BASE_URL
PLAYWRIGHT_WEB_PORT
PLAYWRIGHT_HQ_PORT
PLAYWRIGHT_WORKERS
CI
NODE_ENV
```

Vercel injects `VERCEL` and `VERCEL_ENV`; application code uses them only for
runtime behavior. `VERCEL_OIDC_TOKEN` is provider-issued workload identity when
enabled. Do not hardcode these values or create fake Production values.

## Adding or rotating a variable

1. Decide public/server/system class and minimum consumer scope.
2. Add the blank name and safe comment to `.env.example`.
3. Add it to `turbo.json` pass-through only if a workspace task needs it.
4. Read it in the server/client layer appropriate to its class and fail safely.
5. Update this catalog and the affected surface/provider guide.
6. Add it directly to each required Vercel/EAS/worker/CI environment; do not
   copy a sensitive value out of another project.
7. Redeploy/rebuild/update as appropriate; environment changes are not
   retroactive.
8. Verify configured and missing/invalid behavior without logging the value.
9. For rotation, keep a documented overlap or maintenance plan and revoke the
   old credential only after every consumer uses the new one.
