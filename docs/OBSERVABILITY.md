# Observability: logging, error reporting and request ids

Dated 27 November 2026 (work package O1). This is how every Duna feature logs,
reports errors and lets a person's error be found. The privacy, health,
messaging and audit rules in [`AGENTS.md`](../AGENTS.md) come first; nothing
here relaxes them.

## The layer

`@duna/observability` (`packages/observability`) is the only place that
writes to the console or talks to an error vendor. It has no runtime
dependencies.

| Entry                        | Runs in                     | What it gives you                                                                                                    |
| ---------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `@duna/observability`        | Node, browser, React Native | `log`, `report`, `withProviderCall`, redaction, request ids, the HTTP transport, global error handlers               |
| `@duna/observability/server` | Node only                   | per-request context (AsyncLocalStorage) and the server console guard                                                 |
| `@duna/observability/react`  | Web and React Native        | `<ErrorBoundary>` and `useErrorReference` (no DOM: the app supplies the fallback UI)                                 |
| `@duna/observability/sentry` | Anywhere                    | the Sentry adapter, typed structurally: init options, `beforeSend` / `beforeSendSpan` / `beforeBreadcrumb` scrubbing |
| `@duna/api/observability`    | Server                      | the tRPC procedure observer, the safe error payload, the client-error endpoint, `withProviderCall` typed by provider |

Why a separate package and not `packages/core/src/observability`: `@duna/core`
must stay importable from client code and React Native and has no
dependencies. Observability needs a Node-only entry (`node:async_hooks` for
request context, the console guard), an optional React peer for the
boundary, and a vendor adapter. A package with subpath entries keeps the root
entry portable while the Node and React parts stay out of client bundles.

## How to log

```ts
import { log } from "@duna/observability";

log.info("payments.checkout.created", { orderId, amountMinor, currency });
log.warn("concierge.channel.skipped", {
  channel: "email",
  reason: "provider-not-configured",
});
log.error("website.revision.failed", { revisionId, error });
```

- Never call `console.*` in `packages/api`, `apps/web` or `apps/hq` source
  (tests are exempt). ESLint's `no-console` enforces this; see "Console
  ratchet" below.
- Every line automatically carries `ts`, `level`, `event`, `surface` (`web`,
  `hq`, `api`, `player`, `pro`), `environment`, `release` (the commit),
  `demo`, and, inside a request, `requestId`, `actorId` and
  `organizationId`. Do not pass these yourself.
- Pass ids, codes, counts and durations. Pass an `error` field to attach a
  serialised, redacted error.
- Server output is one JSON line per event (Duna Hosting collects stdout and
  stderr). Local development prints a readable line. `DUNA_LOG_LEVEL`
  (`debug`, `info`, `warn`, `error`; default `info`) and `DUNA_LOG_FORMAT`
  (`json`, `pretty`) override the defaults.

### Event names: `domain.action.outcome`

Lower camelCase segments, three to five of them. The domain is the feature or
layer (`api`, `provider`, `payments`, `concierge`, `ui`, `client`), the action
what was attempted, the outcome a past-tense word or state: `succeeded`,
`failed`, `rejected`, `skipped`, `created`, `caught`. Examples:
`api.procedure.failed`, `provider.call.succeeded`, `ui.boundary.caught`.
An invalid name is still logged, as `log.event.invalid` with the original
under `invalidEvent`, so it shows up in review.

## What must never be logged

Redaction is enforced in the layer (logger, reporter, HTTP transport, the
client-error endpoint and the Sentry hooks all apply it), and it is
unit-tested in `packages/observability/src/redact.test.ts`. Do not rely on it
as permission: do not pass these in the first place.

- Credentials: authorization headers, cookies, tokens, passwords, API keys,
  webhook secrets, signatures, client secrets, connection strings.
- Money details: card numbers, CVC, bank account, routing and IBAN numbers.
- Contact and identity: email, phone, names (first, last, display, guardian),
  addresses, postcodes, dates of birth, government ids, IP addresses, user
  agents.
- Content: message bodies, notes, comments, descriptions, transcripts, AI
  prompts, free text of any kind, search queries, procedure input.
- Health: any health value or metric (heart rate, HRV, sleep, weight and so
  on), consent text, injury or medical notes.
- Precise location: latitude, longitude, coordinates.

How it is enforced:

1. **Field names.** A deny list matched against the normalised key replaces
   the value with `[redacted]`, including whole nested objects (`headers`,
   `request`, `person`, `health`, `location`, `input`, `payload` ...).
2. **Known-safe names** (ids, codes, durations, counts, path, provider,
   operation, reason) keep their value, still scanned.
3. **Every string** is scanned for JWTs, `Bearer`/`Basic` credentials,
   provider key formats (Stripe, webhook secrets, OpenAI, GitHub, AWS,
   Resend, Firecrawl, Sentry), Stripe client secrets, credentials in URLs,
   sensitive query parameters, emails, phone numbers, Luhn-valid card numbers,
   IBANs and long high-entropy tokens. UUIDs, commit SHAs, request ids and
   timestamps survive.
4. **Unknown fields** holding prose (five or more words) become
   `[redacted:text]`; strings are truncated; depth, keys and array lengths are
   bounded; cycles are cut.
5. **Errors** keep only name, scanned message, bounded stack, a short code,
   HTTP status and the cause chain. Every other property an SDK attached
   (request, response, config, body) is dropped.
6. **The server console guard** (installed by both apps' `instrumentation.ts`)
   routes everything other code writes to the console through the same
   redaction. Next.js prints server render errors with their full message and
   attached properties; with the guard those lines are redacted too.

The audit log stays the product's record of who did what. Logging does not
replace it, and log lines never copy personal data out of it.

## How to report

```ts
import { report } from "@duna/observability";

const reference = report(error, {
  event: "website.revision.failed",
  fields: { revisionId },
  tags: { provider: "siteReader" },
});
```

- Report only **unexpected** failures. Expected outcomes (validation, not
  found, refused by policy, provider not configured, rate limited) are logged,
  not reported.
- `report` writes one `error` line, sends a redacted report to every
  registered transport (Sentry when configured; the client-error endpoint on
  mobile), never throws, and reports an error object only once (a second call
  returns the first reference).
- Throw `ProviderNotConfiguredError` (or call `providerNotConfigured(key)`
  from `@duna/api`) when a provider has no credentials: it is classified as
  expected and the client receives `PRECONDITION_FAILED` "This feature is not
  configured yet."

### Provider calls

```ts
import { withProviderCall } from "@duna/api/observability"; // typed by providerRegistry

const session = await withProviderCall(
  "stripe",
  "checkout.sessions.create",
  () => getStripeClient().checkout.sessions.create(params, { idempotencyKey }),
);
```

Records `provider.call.succeeded` with the duration; a provider refusal (HTTP
4xx other than 401, 403, 429, such as a declined card) is
`provider.call.rejected` (warn, not reported); anything else is
`provider.call.failed`, reported once with provider and operation. The
payload never enters the helper. Adopted so far: Stripe Checkout for Premium
and events, the event PaymentIntent, the billing portal (`payments.ts`), and
the site reader (`website-service.ts`). Still to convert, one per owning work
package: the rest of `payments.ts` (subscriptions, connected accounts,
payouts, refunds, meters, tax), `stripe-connect.ts`, `operator-payments.ts`,
`organization-billing.ts`, `website-billing.ts`, `website-provisioning.ts`
(Vercel and Neon APIs), `training-service.ts` and `player-research.ts`
(site reader), `weather.ts`, `resend.ts`, `sent.ts`, `sendblue-outbox.ts`,
`messaging-delivery.ts` (Expo push), `live-activities.ts` (APNs),
`video-providers.ts`, `video-youtube-*.ts`, `video-service.ts`
(Cloudflare, R2), `higgsfield.ts`, `duna-ai.ts` and `ask-duna-*.ts` (AI
Gateway), `context.ts` (WorkOS) and `identity-verification.ts`.

### tRPC

Every procedure is built on an observed base procedure (`packages/api/src/auth.ts`):

- one line per call: `api.procedure.succeeded` (info) or
  `api.procedure.failed` (warn when expected, error when unexpected) with
  `path`, `type`, `code`, `durationMs`, `requestId`, `actorId`,
  `organizationId`, and for refusals the reason code (for example a health
  refusal reason). The input is never logged.
- classification: `BAD_REQUEST`/`PARSE_ERROR` and friends are validation,
  `NOT_FOUND` is not-found, `UNAUTHORIZED`/`FORBIDDEN`/`PRECONDITION_FAILED`
  are refusals, `CONFLICT`, `TOO_MANY_REQUESTS`, a `ProviderNotConfiguredError`
  and a service error with code `DATABASE_REQUIRED` are expected; everything
  else is unexpected and reported.
- what the client receives: every error payload carries `data.requestId`.
  Unexpected failures get the message "Something went wrong on our side.
  Reference: <requestId>" instead of the internal message. Expected failures
  keep their message. `data.healthReason` is unchanged. The server stack is
  only sent in local development.

## The request id

1. **Edge.** Each app's `proxy.ts` sets one id per request: Duna Hosting's own
   `x-vercel-id` when present, otherwise `req_<24 hex>`. A client-sent
   `x-request-id` is ignored there. The id is forwarded to the app in
   `x-request-id` and returned on every response in `x-request-id`.
2. **Server.** `requestIdFromHeaders` reads it into the tRPC context
   (`ctx.requestId`) in the HTTP route and in server components and actions
   (`lib/api.ts`). The procedure middleware runs the call inside that
   context, so every log line and report carries it.
3. **Client.** API errors carry it in `data.requestId`, in the message of
   unexpected failures and in the `x-request-id` response header.
4. **Pages.** Next.js gives the browser only an opaque `digest` for a server
   error. The error page shows the digest as "Reference: …", and
   `onRequestError` writes a `next.request.failed` line holding both the
   digest and the request id. A browser-only error gets a client event id
   (`err_<16 hex>`), sent with the event to the client-error endpoint.

## Finding a person's error

Ask for the reference on their screen, then search the logs (Duna Hosting
log search or the drain) for it:

- `req_…` or a Duna Hosting id: search `requestId` or `reference`. You get
  the procedure line, the report and every other line of that request.
- a number (a digest): search `digest`. The `next.request.failed` line gives
  the `requestId`; search that next.
- `err_…`: search `reference`. The `client.*` / `ui.*` line carries the
  person's id (`actorId`), the page and the endpoint request's `requestId`.

In Sentry, the same references are tags (`reference`, `requestId`), and the
user is the internal person id only.

## Next.js apps

- `instrumentation.ts`: server logging with request context and the console
  guard, Sentry when configured, and `onRequestError` for server components,
  route handlers, server actions and the proxy.
- `instrumentation-client.ts`: unhandled errors and promise rejections in the
  browser go to Duna's log through `POST /api/observability/client-errors`
  (signed-in people only) and to Sentry when configured.
- `app/error.tsx`, `app/global-error.tsx`, route-level `error.tsx`
  (`apps/web/app/app/`, `apps/hq/app/admin/`) and `not-found.tsx` share one
  presentational component, `components/observability/error-state.tsx`: what
  happened in plain words, Try again, a way home, and the reference. Restyle
  that component and its CSS module; the behaviour lives in `route-error.tsx`
  and `@duna/observability/react`.
- `components/observability/pane-error-boundary.tsx`: wrap one panel so a
  failure shows a small state with Try again while the rest of the page keeps
  working:

  ```tsx
  <PaneErrorBoundary label="Your next game" name="player.home.nextUp">
    <NextUpCard />
  </PaneErrorBoundary>
  ```

## Rules for every feature

Every feature logs and reports through `@duna/observability`, never
`console.*` or a vendor SDK. Name events `domain.action.outcome`. Log ids,
codes, counts and durations, never personal data, message bodies, health
values, free text, procedure input or credentials. Report only unexpected
failures; log expected outcomes (validation, not found, refused, provider not
configured) at warn or info. Wrap each outside-provider call in
`withProviderCall(provider, operation, fn)`, and throw
`ProviderNotConfiguredError` when credentials are missing instead of calling
out. Every user-facing error state shows what happened in plain words, a
Try again, and the reference; wrap independent panels in
`PaneErrorBoundary`. Add no `console.*` (the lint baseline only goes down)
and, when touching a file in the baseline, convert its calls and prune the
suppression.

## Console ratchet

`eslint.config.mjs` turns on `no-console` for `packages/api/src`,
`packages/observability/src`, `apps/web` and `apps/hq` (tests excepted). The
existing calls are counted in `packages/api/eslint-suppressions.json` (16),
`apps/web/eslint-suppressions.json` (7) and
`apps/hq/eslint-suppressions.json` (3): 26 in all. ESLint fails on a new call
and on a suppression that no longer occurs, so after converting a call run
`npx eslint <the package's lint paths> --prune-suppressions` in that package.
Never add to the files by hand or with `--suppress-all`.

`apps/web/lib` is not yet in the web lint paths because of two existing
`no-useless-escape` errors in `lib/volleyball-world-gameday.ts`; whoever owns
that file should fix them and add `lib` to the `lint` script.

## Sentry: what the owner sets up

Sentry is wired in code and reports `not-configured` in
`admin.readiness.providers` until a DSN exists. Until then every error is
still written to Duna's structured logs. To turn it on:

1. Create a Sentry organisation, then one project for Web and one for HQ
   (platform: Next.js). One shared project also works.
2. In each Vercel project (`duna-web`, `duna-hq`) set, for Production (and
   Preview if wanted):
   - `NEXT_PUBLIC_SENTRY_DSN`: the project's DSN (public by design). The
     server also accepts `SENTRY_DSN`.
   - for readable stack traces: `SENTRY_AUTH_TOKEN` (an organisation auth
     token with release and source-map scopes), `SENTRY_ORG` and
     `SENTRY_PROJECT`. Source maps are uploaded only when all three are set,
     and deleted from the deployed client output after upload.
   - optional: `NEXT_PUBLIC_SENTRY_ENVIRONMENT` (default: the hosting
     environment), `NEXT_PUBLIC_SENTRY_SAMPLE_RATE` (errors, 0 to 1, default
     1), `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` (performance, default 0).
3. Redeploy. `admin.readiness.providers` then shows `sentry` as configured.
4. In Sentry, set data retention, turn on "Data Scrubber" and "Use Default
   Scrubbers" as a second layer, turn off "Store Native Crash Reports" and
   IP address storage, and add the alert rules below.

The SDK runs with `sendDefaultPii: false`, no session replay (it would record
personal and minors' data), no local variables, no console or click
breadcrumbs, no request bodies, cookies, query strings or headers beyond
content type, the user as the internal person id only, and Sentry's build
telemetry off.

**Data processing.** With a DSN set, Duna sends Sentry (Functional Software,
Inc., United States) error events: the redacted error name, message and
stack, source code lines around each frame, the page path with slugs
removed, browser and OS versions, the hosting environment, Duna's request
and event references, and the internal person and organisation ids, which
are pseudonymous but linkable to an account inside Duna. No names, contact
details, message content, health data, payment details or precise location
are sent. Sentry becomes a subprocessor: sign Sentry's DPA, list it (the
draft at `apps/web/content/legal/subprocessors.md` already lists it as "when
enabled"), and set a retention period that matches Duna's privacy policy.

## Alerting (recommended)

- Sentry: a new issue in Production; an issue with more than 20 events in 5
  minutes; any `provider.call.failed` for `stripe` (tag `provider`); any
  error on a `payments.*`, `webhook` or `health` path; release regression
  alerts on.
- Logs (a Duna Hosting log drain to the owner's log tool, or Vercel's log
  alerts): a rate of `"level":"error"` lines above the normal baseline; any
  `provider.call.failed`; `client.crash.fatal`; `api.procedure.failed` with
  `code` `INTERNAL_SERVER_ERROR` above 1% of procedure calls for 10 minutes.
- Route alerts to the owner by email first; add a pager only once someone is
  on call.

## Mobile (Player and Pro)

Today (this package): the same logger, reporter, redaction and
`<ErrorBoundary>` run in React Native; `installReactNativeErrorHandler()`
reports through the global handler and then hands the error to the previous
handler; `createHttpTransport({ endpoint, surface, headers })` posts redacted
events to `POST https://duna.coach/api/observability/client-errors` with the
person's bearer token (at most 10 per minute per device, 6 KB per event; the
server takes at most 5 events and 16 KB per request, 30 per person per
minute, and re-redacts). The apps do not use it yet: adding
`"@duna/observability": "workspace:*"` to `apps/player/package.json` and
`apps/pro/package.json` belongs to the Expo upgrade branch (M-N1), and then
the app root wraps `<DunaApp />` in an `<ErrorBoundary>` and calls
`installReactNativeErrorHandler()` and `registerTransport(createHttpTransport(...))`
once at start-up.

After the Expo SDK upgrade lands (native crash step): add
`@sentry/react-native` (a version older than the 24-hour release-age rule)
and its Expo config plugin, wrap the root with `Sentry.wrap`, initialise it
with `sentryInitOptions` from `@duna/observability/sentry` plus
`attachScreenshot: false`, `attachViewHierarchy: false` and
`enableNativeCrashHandling: true`, register `createSentryTransport(Sentry)`,
upload source maps and dSYMs from EAS builds with `SENTRY_AUTH_TOKEN`
(EAS secret), and set `EXPO_PUBLIC_SENTRY_DSN` per app. Then stop
registering the HTTP transport (or keep it only where Sentry is not
configured) so an event is not sent twice. The Watch and widget extensions
are Swift targets and need their own decision.
