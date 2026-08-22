# Duna infrastructure and provider access

This runbook explains how to find and safely operate Duna's connected services.
It names accounts, projects, and variable names, never credential values.

Provider state changes independently of Git. Re-run the identity/project checks
before a deployment, migration, build, or incident response.

## Access principles

- Request membership in the provider organization/project. Do not ask another
  person to send a token, private key, certificate, database URL, or credential
  file through chat.
- Use individual accounts, least privilege, MFA, and provider audit logs.
- Store local values only in ignored `.env.local` files or inject them for one
  command. Deployed values belong in provider-encrypted environment stores.
- Treat `NEXT_PUBLIC_*` and `EXPO_PUBLIC_*` as public. They can never hold a
  secret.
- Never paste environment listings, connection strings, tokens, private keys,
  certificate bodies, or signed URLs into an issue, PR, log, or documentation.
- Verify the target project, environment, branch, and mode before any write.

The variable catalog and deployment-scope matrix are in
[`ENVIRONMENT_VARIABLES.md`](ENVIRONMENT_VARIABLES.md).

## Provider inventory

| Provider   | Duna resource                                                          | Purpose                                                                    | Access                                                                    |
| ---------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| GitHub     | `journeyrewardsjohn/duna`                                              | Source, PRs, CI, scheduled Sand sync                                       | Repository/team invitation                                                |
| Vercel     | Team `suttonx`; projects `duna-web`, `duna-hq`                         | Next.js deployments, crons, server variables, AI Gateway workload identity | [Vercel dashboard](https://vercel.com/dashboard) team invitation          |
| Expo/EAS   | Organization `journey-rewards-inc`; projects `duna-player`, `duna-pro` | Native builds, updates, credentials, submissions                           | [Expo dashboard](https://expo.dev/) organization invitation               |
| Neon       | Project `duna`; production branch `duna-production`; database `duna`   | Postgres application truth                                                 | [Neon console](https://console.neon.tech/) project invitation             |
| Upstash    | Redis database referenced by the deployed REST variable names          | Messaging wake hints only                                                  | [Upstash console](https://console.upstash.com/) team/database invitation  |
| WorkOS     | Duna AuthKit/User Management environment                               | Web/native identity and organizations                                      | [WorkOS dashboard](https://dashboard.workos.com/) organization invitation |
| Stripe     | Beach Elite LLC, test mode unless an approved release says otherwise   | Checkout, Connect, Identity, Terminal, subscriptions, refunds              | [Stripe dashboard](https://dashboard.stripe.com/test) team invitation     |
| Cloudflare | R2 bucket configured as `R2_BUCKET_NAME`                               | Private video originals and message attachments                            | [Cloudflare dashboard](https://dash.cloudflare.com/) account invitation   |
| Mux        | Duna video environment                                                 | Live ingest, assets, playback signing, Data                                | [Mux dashboard](https://dashboard.mux.com/) team invitation               |
| LiveKit    | Duna Cloud project                                                     | Purpose-bound voice rooms and agent dispatch                               | [LiveKit Cloud](https://cloud.livekit.io/) project invitation             |
| Inngest    | Duna application/environment                                           | Durable event dispatch and recovery                                        | [Inngest dashboard](https://app.inngest.com/) organization invitation     |

Other adapters—Google Places/Routes, Mapbox, Tomorrow.io, Firecrawl, Higgsfield,
Knock, Resend, Sent, Twilio, Sentry, Axiom, PostHog, APNs, and Apple Wallet—are
enabled only where their server variables and external approvals exist.

## Vercel

### Project map

| Project            | Root directory | Primary URL                                     | Special behavior                                                   |
| ------------------ | -------------- | ----------------------------------------------- | ------------------------------------------------------------------ |
| `suttonx/duna-web` | `apps/web`     | `https://duna.coach` and Vercel project aliases | Public/player app, API host, provider webhooks, player-source cron |
| `suttonx/duna-hq`  | `apps/hq`      | `https://hq.duna.coach`                         | Operator/Admin app, pre-build migration, event/Sand crons          |

The Vercel project settings, Git integration, domains, environment variables,
and deployment history live under the `suttonx` team. The repository's
`vercel.json` files are the source of truth for checked-in cron/build behavior.

### Verify access

```bash
vercel whoami
vercel teams list
vercel project inspect duna-web --scope suttonx
vercel project inspect duna-hq --scope suttonx
```

Link each monorepo app independently; `.vercel/` is local metadata and remains
ignored:

```bash
cd apps/web
vercel link --yes --team suttonx --project duna-web

cd ../hq
vercel link --yes --team suttonx --project duna-hq
```

See Vercel's [monorepo guidance](https://vercel.com/docs/monorepos) and
[CLI reference](https://vercel.com/docs/cli).

### Environment variables

List names and target scopes without copying values into another system:

```bash
vercel env ls development
vercel env ls preview
vercel env ls production
```

For local app development, either pull only the Development target into that
app's ignored file or inject it for one command:

```bash
vercel env pull .env.local --environment=development
vercel env run -e development -- pnpm dev
```

Run those commands from the linked `apps/web` or `apps/hq` directory. Do not
pull Production secrets merely for convenience. Vercel's
[`env run`](https://vercel.com/docs/cli/env) path avoids writing readable values
to disk. Sensitive Preview/Production variables should be marked sensitive;
their values cannot be exported later. Add the same required secret directly
to each project rather than trying to copy it out of another project.

An environment change affects only new deployments. Redeploy and verify the
affected project after changing a variable.

### Preview and production

PRs should normally create preview deployments through the GitHub integration.
A manual preview from the linked app directory is:

```bash
vercel --scope suttonx
```

A manual production deployment is a release action, not a routine development
step:

```bash
vercel --prod --scope suttonx
```

Before production, confirm the branch/commit, migration compatibility,
environment-variable target, provider mode, and GitHub checks. Afterward:

```bash
git rev-parse HEAD
vercel inspect <deployment-url> --scope suttonx
vercel logs <deployment-url> --scope suttonx
```

Verify the exact commit metadata, ready state, custom domain, health endpoint,
and the authenticated route changed. `READY` or a root `200` proves only that
deployment gate.

## Expo and EAS

### Project map

| App         | EAS project                        | Source config          | Build config           |
| ----------- | ---------------------------------- | ---------------------- | ---------------------- |
| Duna Player | `@journey-rewards-inc/duna-player` | `apps/player/app.json` | `apps/player/eas.json` |
| Duna Pro    | `@journey-rewards-inc/duna-pro`    | `apps/pro/app.json`    | `apps/pro/eas.json`    |

Project IDs, app identifiers, schemes, update URLs, entitlements, and plugins
remain in the checked-in app config. Do not copy Apple/Google credential files,
private keys, certificates, or service-account JSON into the repository.

### Verify access and config

```bash
pnpm dlx eas-cli whoami

cd apps/player
pnpm dlx eas-cli project:info
pnpm dlx expo-doctor

cd ../pro
pnpm dlx eas-cli project:info
pnpm dlx expo-doctor
```

Manage build/update variables in each Expo project's Environment Variables
screen or with `eas env:*`. `eas env:list` may reveal plaintext or sensitive
values to an authorized user; never paste its output into a report. Expo's
[environment guide](https://docs.expo.dev/eas/environment-variables/) explains
project/account scope and plaintext, sensitive, and secret visibility.

### Build profiles

Both apps define:

- `development`: internal development-client build;
- `preview`: internal device build;
- `preview-simulator`: iOS Simulator build;
- `testflight`: store-distributed iOS build and named submission profile;
- `production`: store build/channel.

Examples, run inside the target app directory:

```bash
pnpm dlx eas-cli build --platform ios --profile preview-simulator
pnpm dlx eas-cli build --platform android --profile preview
pnpm dlx eas-cli build --platform ios --profile testflight
pnpm dlx eas-cli build --platform android --profile production
```

Do not build both apps from the same directory. After completion, use
`eas build:view <build-id>` and verify the source `gitCommitHash`, app, platform,
profile, version/build number, channel, and artifact. A completed build is not a
submission or store release.

Credentials are managed through EAS/Apple/Google account access. Inspect or
configure them interactively with `eas credentials`; never print private key
material or commit downloaded files. If an unchanged Apple capability hits a
known EAS capability-sync failure, first confirm `app.json`, identifiers, and
entitlements are correct. Only then retry that build with
`EXPO_NO_CAPABILITY_SYNC=1`; this is a narrow workaround, not the default build
path.

### EAS Update

Player and Pro use `runtimeVersion.policy = appVersion`. An update can target
only a compatible installed binary. SDK 55+ requires an explicit environment:

```bash
pnpm dlx eas-cli update \
  --channel production \
  --environment production \
  --message "describe the update"
```

Build-profile `env` values do not automatically populate `eas update`. The
required `EXPO_PUBLIC_*` variables must exist in the selected EAS environment.
Inspect the exported bundle/metadata and the update record before considering
the OTA gate complete.

Any app config, permission, entitlement, native library, iOS/Android target,
Watch, widget, HealthKit, LiveKit WebRTC, Stripe Terminal, or background-mode
change requires a new compatible binary. See Expo's
[update compatibility guidance](https://docs.expo.dev/build/updates/).

### Submission

Submit an exact build ID, not an ambiguous latest build:

```bash
pnpm dlx eas-cli submit --platform ios --profile testflight --id <build-id>
pnpm dlx eas-cli submit --platform android --profile production --id <build-id>
```

Track upload, App Store Connect/Play Console processing, tester visibility,
review state, and live availability separately.

## Neon

### Connected database

- Organization: `Journey`
- Project: `duna` (`polished-sky-03515868`)
- Production branch: `duna-production`
- Database: `duna`
- Primary application variable: `DATABASE_URL`
- Read-only replica variable: `NEON_READ_ONLY_REPLICA`
- Schema/migrations: `packages/db/src/schema.ts`, `packages/db/drizzle`

The `duna-production` branch is the primary/default branch. Its read/write
compute is intentionally configured to stay active so production writes and
consistency-sensitive reads do not incur a wake-up delay. A separate read-only
compute serves `NEON_READ_ONLY_REPLICA` and may autosuspend.

Open the [Neon console](https://console.neon.tech/), choose the project, branch,
database, and role, then use **Connect** to obtain a connection string. Put it
directly into the intended local/provider secret store. Never paste it into a
command transcript, code, docs, or an agent prompt.

Route eligible latency-tolerant reads through `getReadOnlyDatabase()`. Public
discovery, rankings, reporting, and dashboards are good candidates. Keep
writes, transactions, migrations, locks, authentication and authorization,
membership/guardian state, payments, inventory/capacity, registration and
waitlist decisions, live scoring, messaging cursors, idempotency/rate limits,
and read-after-write flows on the primary. The helper falls back to
`DATABASE_URL` outside production when the replica variable is absent; never
fall back from the primary to the replica for a write or consistency-sensitive
operation.

Neon branches are isolated copy-on-write data/schema environments. Use a
feature-specific development branch instead of experimenting on
`duna-production`. For data containing personal information, prefer an approved
schema-only/anonymized development source. See Neon's
[branching workflow primer](https://neon.com/docs/get-started-with-neon/workflow-primer)
and [connection guidance](https://neon.com/docs/connect/connection-errors).

### Schema workflow

1. Edit `packages/db/src/schema.ts`.
2. Generate a forward migration:

   ```bash
   pnpm db:generate
   ```

3. Review the new SQL, including locks, backfills, constraints, indexes,
   defaults, and compatibility with old/new app versions.
4. Point `DATABASE_URL` at an isolated Neon branch and apply:

   ```bash
   pnpm db:migrate
   ```

5. Run unit, repository, migration, and affected surface checks.
6. Deploy in a compatible order. HQ's Vercel build applies migrations before
   building; do not rely on that step as the first review of the SQL.
7. Verify the target branch's migration history and connected behavior.

`pnpm db:seed` is only for explicit demo/preview environments. Never seed the
production branch. Never edit a migration already applied to a shared branch.

Production recovery uses Neon point-in-time history to create a new recovery
branch, inspect/verify it, and perform an approved cutover. Do not “recover” by
rewriting migration history or running destructive SQL on production.

Application and external agents should use the typed API/MCP. Direct Neon
access is for reviewed schema, operations, or evidence work—not a shortcut
around tenancy and audit.

## Upstash Redis

Duna uses Upstash only for best-effort messaging wake hints. Message content,
membership, sequence, cursor, authorization, and convergence remain in Neon.

Required server-only names:

```text
MESSAGING_SSE_ENABLED
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

Open the [Upstash console](https://console.upstash.com/) and select the Redis
database whose REST endpoint is configured in the Duna Web/HQ environment. Do
not put the endpoint or Standard REST token in docs or client code. Configure
both Vercel projects that serve messaging routes, then redeploy them.

The API publishes content-free `{conversation, sequence}` hints to private
per-user/support channels after the Neon commit. The authenticated SSE route
subscribes for at most a bounded request lifetime; clients reconnect and
gap-fill. See Upstash's [REST/PubSub documentation](https://upstash.com/docs/redis/features/restapi)
and [security guidance](https://upstash.com/docs/redis/features/security).

Safe verification:

1. Send a message between authorized test accounts and confirm Neon cursor
   convergence with `MESSAGING_SSE_ENABLED=false`.
2. Re-enable SSE in a non-production environment, redeploy, and confirm faster
   wake/reconnect with the same final messages/watermarks.
3. Confirm an Upstash outage returns a wakeup `503` but does not lose or reject a
   valid committed message.
4. Check provider metrics for commands/errors without inspecting message
   content—there should be none in Upstash.

Do not flush the database as a troubleshooting shortcut. Rotating the token
requires updating every serving project and a new deployment; polling preserves
correctness during the rotation.

## WorkOS

WorkOS AuthKit/User Management serves Web/HQ browser sessions and native PKCE.
Server projects use `WORKOS_CLIENT_ID`, `WORKOS_API_KEY`, and
`WORKOS_COOKIE_PASSWORD`; native apps receive only
`EXPO_PUBLIC_WORKOS_CLIENT_ID`.

Register and verify all current origins/callbacks/sign-out URLs in the intended
WorkOS environment, including Web, HQ, local development, and the two native
custom schemes. Never ship a WorkOS API key/client secret in Expo. Organization
and platform authorization remains in Duna's server context, not WorkOS UI
configuration alone.

## Stripe

The connected account is Beach Elite LLC in test mode unless a specific,
verified production release says otherwise. Keep Dashboard test/live mode
visually explicit.

- Webhook: Duna Web `/api/stripe/webhook` with its target-specific signing secret.
- Catalog bootstrap: `pnpm stripe:bootstrap` (review target/mode first).
- Sandbox smoke: `pnpm stripe:smoke`.
- Connect/Terminal/Identity/Tax/Apple Pay/Tap to Pay each have separate provider
  and platform approval gates.

The client receives only a publishable key. Secret key, webhook secret, price
maps, account/fee decisions, and Terminal connection-token creation stay on the
server. Do not activate live mode or invent a legal/tax address as part of a
code change.

## Video, storage, and LiveKit

- **Mux:** live ingest, assets, signed/public playback, Data, and signed
  webhooks. Configure the Mux variable group in every server runtime executing
  video/admin procedures.
- **Cloudflare R2:** private video originals and message attachments. The
  canonical credential names are `CLOUDFLARE_ACCOUNT_ID`, `R2_BUCKET_NAME`,
  `CF_ACCESS_KEY_ID`, and the existing `CE_SECRET_ACCESS_KEY` name. Both Web and
  HQ may execute signing/storage paths; add sensitive values directly to each
  project.
- **Vercel Blob:** selected image/media upload paths use
  `BLOB_READ_WRITE_TOKEN`.
- **LiveKit:** Web/HQ issue short-lived scoped tokens; the separate voice worker
  joins by agent name. Verify token issuance, dispatch, worker health, audio,
  review, and save/publish separately.

Detailed video privacy, migration, provider aliases, and physical-device gates
are in [`VIDEO_PLATFORM.md`](VIDEO_PLATFORM.md).

## Workflows, AI, maps, delivery, and observability

- Inngest requires event/signing keys in the Web runtime serving `/api/inngest`.
  Neon job persistence remains the recovery source.
- Vercel AI Gateway uses `AI_GATEWAY_API_KEY` or deployment workload
  `VERCEL_OIDC_TOKEN`; models remain provider-qualified. Direct OpenAI Agents
  use `OPENAI_API_KEY` only for their documented support/safety/voice paths.
- Duna CoPilot is Gateway-only. It uses `DUNA_COPILOT_MODEL`, currently allows
  only `openai/gpt-5.6-sol` or `moonshotai/kimi-k3`, and never falls back to
  `OPENAI_API_KEY`. Sol is the quality-first default.
- Google Places/Routes, Mapbox, Tomorrow.io, Firecrawl, and Higgsfield keys stay
  server-side except the explicitly public Mapbox client token.
- Knock, Resend, Sent, Twilio, Expo Push, APNs, and Apple Wallet require their
  own sender/certificate/account approvals. A configured variable does not prove
  approval or delivery.
- Sentry, Axiom, and PostHog must not receive Health values, private message
  content, credentials, or raw sensitive provider payloads.

## Release evidence checklist

For every release, record only the applicable gates and their independent
evidence:

1. exact Git commit and clean source;
2. local proportional checks;
3. migration target and result;
4. GitHub job status and any infrastructure/billing annotation;
5. exact Web and HQ Vercel deployments;
6. health plus authenticated product behavior;
7. exact EAS build/update IDs and `gitCommitHash`;
8. native installation/physical capability behavior;
9. submission, store processing, tester/live availability;
10. provider mode, webhook/worker/delivery evidence;
11. account-owner, legal, platform, or partner gates still open.

Never turn one green item into a blanket “live” claim.
