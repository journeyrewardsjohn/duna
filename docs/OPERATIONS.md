# Duna operations

Provider membership, verified project names, safe CLI access, and secret-store
rules live in [`INFRASTRUCTURE.md`](INFRASTRUCTURE.md). The complete variable
name/scope catalog lives in
[`ENVIRONMENT_VARIABLES.md`](ENVIRONMENT_VARIABLES.md). This file owns release
and connected-workflow procedures; it never contains credential values.

## Connected environments

- GitHub repository: `journeyrewardsjohn/duna`
- Neon organization: `Journey`
- Neon project: `duna` (`polished-sky-03515868`)
- Neon branch: `duna-production`
- Neon database: `duna`
- Stripe account: Beach Elite LLC, test mode
- Expo projects:
  - `@journey-rewards-inc/duna-player`
  - `@journey-rewards-inc/duna-pro`
- Vercel projects:
  - `suttonx/duna-web`, root `apps/web`
  - `suttonx/duna-hq`, root `apps/hq`
- Upstash: the Redis database referenced by the server-only REST variable names;
  it carries messaging wake hints, not message truth

Secrets remain outside source control. Local values live in ignored
`.env.local`; deployed values belong in the hosting provider’s encrypted
environment store.

## Release gate

`pnpm verify` is the required web release gate. It checks formatting, lint,
types, unit and property suites, production builds, and responsive browser
journeys across desktop, tablet, and phone.

`pnpm verify:live-repository` is the connected Neon smoke. It validates typed
reads, tenant scope, atomic pickup/audit writes, idempotent replay, persistent AI
confirmation, durable webhook processing, and database rate limiting. It removes
the isolated records it creates.

Production Web and HQ configure both `DATABASE_URL` and
`NEON_READ_ONLY_REPLICA`. The former is the primary and stays active; the latter
is the read-only compute used by `getReadOnlyDatabase()` for latency-tolerant
queries. The connected smoke remains on the primary because it proves writes,
transactions, idempotency, and immediate consistency. Monitor primary and
replica load separately, and never route release migrations or repair work to
the replica.

Native JS bundles are checked with:

```bash
cd apps/player && pnpm dlx expo-doctor
cd ../pro && pnpm dlx expo-doctor
cd ../..
pnpm --filter @duna/player export
pnpm --filter @duna/pro export
```

Installable internal builds use the `preview` profile for Android and the
`preview-simulator` profile for iOS Simulator. Both apps are configured for EAS
Update with app-version runtime matching and separate development, preview, and
production channels. SDK 55+ updates must specify `--environment`; build-profile
`env` values are not automatically update variables. Physical-device
distribution, signing, upload, store processing, and publication remain
separate release gates.

GitHub Actions repeats both gates on pushes and pull requests.

The production previews must use `DUNA_DATA_SOURCE=database`. Do not mistake
the local demo adapter for connected evidence. During the current QA period,
the only permitted production-like Demo records are the clearly labelled,
Super-Admin-controlled Beach Elite Academy dataset described below; it is
stored in the connected database and is not a fallback data source.

## Professional tour data

Scheduled data ingress is split between checked-in Vercel crons and GitHub
Actions. The executable configuration is authoritative:

- `apps/hq/vercel.json`: event operations every minute; Volleyball World live
  polling every minute; the general live feed at minute 15 every two hours; and
  Elite stats hourly at minute 17.
- `apps/web/vercel.json`: player-source refresh daily at 03:15 UTC.
- `.github/workflows/sand-sync.yml`: AVP every 30 minutes, event index every six
  hours, rankings daily at 10:10 UTC, event research at 10:45 UTC, and player
  research at 11:20 UTC.

The manual GitHub workflow supports `live`, `vw-live`, `avp`, `index`,
`rankings`, `research`, and `players`. The HQ cron route may support additional
review/staging modes; inspect the current route before invoking one. Scheduled
imports do not bypass evidence, mapping, or publish/approval gates.

AVP requires `FIRECRAWL_API_KEY` because the league tables are rendered in the
browser. Structured normalization uses Vercel AI Gateway through
`AI_GATEWAY_API_KEY` or the workload’s `VERCEL_OIDC_TOKEN`; the provider-qualified
model defaults to `openai/gpt-5.6-luna` and can be changed with
`AI_GATEWAY_AVP_MODEL`. The AVP code never calls an OpenAI provider endpoint
directly. If Gateway normalization fails, the validated deterministic parse is
kept and the ingestion checkpoint records the fallback instead of clearing
stored results.

Upcoming-event research also requires `FIRECRAWL_API_KEY`. It searches for the
current event year, asks the configured Gateway model
(`AI_GATEWAY_EVENT_RESEARCH_MODEL`) to return evidence-linked facts, validates
the venue through Google Places, and keeps the result as a review proposal.
Automation never publishes the proposal directly: a super admin approves it,
and approval fills only editorial fields that staff have not already set.

Player-profile synthesis and professional sportswriting use the same Gateway
credential with `AI_GATEWAY_PROFILE_MODEL` and
`AI_GATEWAY_SPORTSWRITER_MODEL`. Duna does not call an OpenAI provider endpoint
directly.

Event and match broadcast options, including match overrides, are audited
super-admin changes. Seasonal AVP team mappings and date-bounded substitutions
are also audited; approved historical matches are not silently rewritten.

## Durable workflows

`/api/inngest` serves the event-driven workflow processor and one-minute recovery
function. Stripe ingress remains safe if Inngest is unavailable because the
signed payload and workflow job are committed to Neon first. Production dispatch
requires both `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY`.

## Duna Video delivery

Live streaming uses Mux RTMPS ingest and signed/public playback. Native uploads
use private Cloudflare R2 multipart uploads with short-lived presigned URLs.
Provider variables, privacy boundaries, migration order, and the physical-device
release checklist are documented in
[`VIDEO_PLATFORM.md`](VIDEO_PLATFORM.md).

R2 S3 credentials must be present in every server project that executes upload,
attachment, or playback signing. Sensitive Vercel values cannot be exported for
copying, so add the canonical names directly to each required Preview and
Production project and verify by behavior without printing them.

## Database delivery

Migrations are forward-only and live in `packages/db/drizzle`. Apply them before
deploying application code that requires the new schema:

```bash
pnpm db:migrate
```

Seed data is idempotent and intended for demo and preview environments:

```bash
pnpm db:seed
```

Production recovery uses Neon point-in-time recovery and a new branch; never
rewrite a live migration.

### Beach Elite Academy live Demo data

In Super Admin → Feature flags, **Enable Demo Data** controls the current
Beach Elite Academy (legacy `Demo`) QA account. Enabling it creates an
idempotent, production-shaped dataset: a multi-division tournament with a
waitlist plus live, future, and completed leagues across NC, SC, GA, and FL.
Every created entity is recorded in `demo_data_records` under the scoped
`demo_data_sets` entry, and all visible names are labelled `Demo`.

Turning the control off is an audited Super Admin action and deletes only the
tracked rows in dependency-safe order. It never deletes normal organization
data. Use the control rather than `pnpm db:seed` for this QA dataset.

## Stripe delivery

`pnpm stripe:bootstrap` idempotently provisions the Duna test catalog, including
monthly and annual Premium and Premium+ Prices, and prints the four environment
variable mappings. Configure those Prices as switchable products in Stripe's
Customer Portal so an existing subscriber can change plans without a second
subscription.
`pnpm stripe:smoke` validates subscription Checkout, PaymentIntents, and
Terminal connection tokens. The webhook endpoint is
`/api/stripe/webhook`; configure its signing secret only after a stable deployed
URL exists.

Automatic Tax remains disabled until Beach Elite LLC’s verified head-office
address is entered in Stripe. Do not invent that legal address.

Organization-plan Checkout uses the six `STRIPE_HQ_*_PRICE_ID` variables for
Club, Facility, and Network monthly/annual prices. `stripe-bootstrap.ts` creates
the canonical catalog. Organization commission policy remains server-owned and
is applied to each Connect payment; Accounts v2 metadata is a synchronized
operational mirror, not the fee authority. See `docs/ORGANIZATION_PRICING.md`.

### Duna Pro Get Paid

Duna Pro card-present collections use a platform PaymentIntent with the
organization's connected account as the destination. The server owns the
amount, organization commission, processing estimate, order linkage, and
idempotency key. The device only retrieves and processes that PaymentIntent;
the server re-reads Stripe before posting the Duna payment ledger.

Declines and reader errors remain attached to the original pending order and
PaymentIntent so the coach can retry the same attempt. Every reader state,
decline, failure, and approval is appended to `operator_payment_events`.
Successful collections update the coach's net earnings and active goal.

Tap to Pay requires a native Duna Pro build, a compatible physical device,
Stripe Terminal production activation, and Apple's Tap to Pay entitlement and
terms. It cannot be validated in Expo Go. Do not enable live collection based
only on an emulator or JavaScript export.

`DUNA_WALLET_CASH_ENABLED` defaults to `false`. Keep it disabled until the
environment has completed custody, minors, escheatment, ledger, and support
review. Organization-credit redemption remains available independently and is
posted through the existing immutable organization-credit journals.

### Native coach session notes

Duna Pro and HQ both use short-lived, session-scoped LiveKit room tokens. The
mobile app requires a native development or production build because LiveKit
uses WebRTC native modules. A coach reviews the editable transcript, generated
summary, detected roster names, and privacy mode before saving. Saving never
publishes. Player-shareable notes require a second explicit confirmation;
private notes never enter the player feed.

### Tournament admission and Apple Wallet

Tournament players and attendees receive different admission credentials.
Player registration QR codes are valid only in Duna Pro's player check-in mode;
fan ticket QR codes are valid only in the ticket validator. Accepted, duplicate,
and rejected player scans append audit entries, while fan scans use the atomic
ticket scan ledger. A network failure never grants admission; the device keeps a
pending entry for explicit validation after reconnecting.

Apple Wallet downloads use five-minute, person-bound signed links. Pass creation
remains unavailable until `DUNA_WALLET_DOWNLOAD_SECRET`, the Apple pass type and
team identifiers, the WWDR certificate, and the Pass Type ID signing certificate
and key are present in the encrypted server environment. Do not copy certificate
material into source control or between environments. The in-app QR remains the
authoritative fallback when Wallet signing is unavailable.

## Partner match-history backfill

Duna does not refresh SandRating.com. Its historical records are retained in a
Duna-owned legacy archive and are never used as an upstream lookup.

Imports remain evidence-first: only enabled sources may be fetched, linked
player profiles use active/idle cadences, FIVB event-detail pages stop after
their completed-event grace window, and Firecrawl sources use the configured
cache age and change tracking. SuperAdmin can inspect and change those policies
in HQ. Official Volleyball World live transport is separate from scraping: its
WebSocket feed and REST fallback record freshness, latency, and failure state
in the same control plane. Complete, decisive, mapped matches still require an
explicit approval before entering the chronological Duna Sand Rating projection.

## Rating backtests and agent access

Duna HQ's Ratings Lab runs a true chronological backtest across approved
doubles history. It persists pre-match probabilities for every compared model,
the players' historical pre-match ratings, calibration, Brier score, log loss,
AUC, confidence intervals, and cumulative curves. Run it after a material data
repair or before proposing a rating configuration change. A winning backtest
does not activate a model automatically.

The public methodology and rankings pages read only the latest completed run.
Apply the backtest migration before release, run the first evaluation from Duna
HQ, then verify `/methodology` and both genders on `/rankings`.

`/api/mcp` provides discovery and booking-entry tools publicly, participant
issue reporting for authenticated players, and audited repair tools for WorkOS
super admins. See [`API.md`](API.md) and [`MCP.md`](MCP.md). Never give an agent
database credentials or bypass the identity and evidence gates with direct SQL.

## External launch gates

The repository is technically ready for previews, but public production launch
still requires external approvals or account data:

- WorkOS production environment and verified-domain promotion; staging AuthKit
  redirects and sign-out URLs are connected to the live Duna surfaces
- Stripe Connect production review, Tax address, Terminal/Tap to Pay
  entitlements, Treasury/1099 approvals
- Apple Developer and Google Play organization credentials and store review
- Knock, Resend, Sent, Twilio 10DLC, Inngest, Upstash, R2, Sentry, Axiom, and PostHog
  production credentials
- Mux account activation, API/signing keys, signed webhook, and a
  physical-device iOS streaming check
- An approved audio-isolation processor before music-removal requests can
  modify recordings
- Provider authorization, retention terms, and credentials for player-data
  sources added beyond the currently operator-authorized partner feeds
- Wallet, escheatment, minors, privacy, and tax counsel review
