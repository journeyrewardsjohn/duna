# Duna operations

## Connected environments

- Neon project: `beach-elite`
- Neon branch: `duna-production`
- Neon database: `duna`
- Stripe account: Beach Elite LLC, test mode
- Expo projects:
  - `@journey-rewards-inc/duna-player`
  - `@journey-rewards-inc/duna-pro`
- Vercel projects:
  - `https://duna-web.vercel.app`
  - `https://hq.duna.coach`

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
production channels. Physical-device iOS distribution and store submission
remain gated on Apple organization credentials.

GitHub Actions repeats both gates on pushes and pull requests.

The production previews must use `DUNA_DATA_SOURCE=database`. If a hosted HQ
ever displays seeded demonstration metrics, treat that as a release failure and
verify the project-level environment before redeploying.

## Professional tour data

The Sand data workflow refreshes live FIVB tournaments every five minutes, the
rendered AVP League season every thirty minutes, the FIVB event index every six
hours, and Volleyball World rankings daily. Manual runs support `live`, `avp`,
`index`, and `rankings`.

AVP requires `FIRECRAWL_API_KEY` because the league tables are rendered in the
browser. Structured normalization uses Vercel AI Gateway through
`AI_GATEWAY_API_KEY` or the workload’s `VERCEL_OIDC_TOKEN`; the provider-qualified
model defaults to `openai/gpt-5.6-luna` and can be changed with
`AI_GATEWAY_AVP_MODEL`. The AVP code never calls an OpenAI provider endpoint
directly. If Gateway normalization fails, the validated deterministic parse is
kept and the ingestion checkpoint records the fallback instead of clearing
stored results.

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

R2 S3 credentials must be present in Duna Web because its API signs upload and
playback URLs. Duna HQ already has the provided sensitive values; Vercel does
not allow those values to be exported for copying, so add the same
`CF_ACCESS_KEY_ID` and `CE_SECRET_ACCESS_KEY` directly to Duna Web Preview and
Production.

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

## Stripe delivery

`pnpm stripe:bootstrap` idempotently provisions the Duna test catalog.
`pnpm stripe:smoke` validates subscription Checkout, PaymentIntents, and
Terminal connection tokens. The webhook endpoint is
`/api/stripe/webhook`; configure its signing secret only after a stable deployed
URL exists.

Automatic Tax remains disabled until Beach Elite LLC’s verified head-office
address is entered in Stripe. Do not invent that legal address.

## Partner match-history backfill

Duna HQ’s Sand Data panel can stage a complete SandRating network snapshot.
The default run takes the top 200 distinct men and women, retains a 25-player
buffer per division for identity deduplication, and expands their match graph
to four degrees. Player and match data are downloaded through sequential,
one-second-spaced bulk API requests; graph traversal then runs locally so it
does not multiply traffic against the partner service. Email fields are never
persisted.

Imports remain evidence-first: partner IDs and confirmed cross-source IDs are
linked automatically, uncertain identities stay in the mapping queue, and new
source identities become unclaimed profile pages. A super administrator must
use **Approve ready history + rebuild** before complete, decisive, mapped
matches enter the chronological Sand Rating projection. Ambiguous identities,
duplicates, incomplete scores, and invalid rosters remain staged for review.

The same snapshot can be refreshed through the authorized sand cron endpoint
with `mode=sandrating`. Scheduled refreshes stage changes only; they never
approve new rating evidence automatically.

## External launch gates

The repository is technically ready for previews, but public production launch
still requires external approvals or account data:

- WorkOS production environment and verified-domain promotion; staging AuthKit
  redirects and sign-out URLs are connected to the live Duna surfaces
- Stripe Connect production review, Tax address, Terminal/Tap to Pay
  entitlements, Treasury/1099 approvals
- Apple Developer and Google Play organization credentials and store review
- Knock, Resend, Twilio 10DLC, Ably, Inngest, R2, Sentry, Axiom, and PostHog
  production credentials
- Mux account activation, API/signing keys, signed webhook, and a
  physical-device iOS streaming check
- An approved audio-isolation processor before music-removal requests can
  modify recordings
- Provider authorization, retention terms, and credentials for player-data
  sources added beyond the currently operator-authorized partner feeds
- Wallet, escheatment, minors, privacy, and tax counsel review
