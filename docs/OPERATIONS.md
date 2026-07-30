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
  - `https://duna-hq.vercel.app`

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

## Durable workflows

`/api/inngest` serves the event-driven workflow processor and one-minute recovery
function. Stripe ingress remains safe if Inngest is unavailable because the
signed payload and workflow job are committed to Neon first. Production dispatch
requires both `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY`.

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

## External launch gates

The repository is technically ready for previews, but public production launch
still requires external approvals or account data:

- Clerk production application and keys
- Stripe Connect production review, Tax address, Terminal/Tap to Pay
  entitlements, Treasury/1099 approvals
- Apple Developer and Google Play organization credentials and store review
- Knock, Resend, Twilio 10DLC, Ably, Inngest, R2, Sentry, Axiom, and PostHog
  production credentials
- VolleyballLife and BVBInfo data licenses
- Wallet, escheatment, minors, privacy, and tax counsel review
