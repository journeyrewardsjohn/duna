# Duna managed websites

The Website workspace adds a separate $200 USD monthly subscription per site. It includes 1,000 expiring monthly website credits. A standard generated edit reserves 25 credits and consumes them only when its usable draft commits. The first preview is free, bounded to three attempts per site in a rolling 24-hour period. These credits are unrelated to player wallets or club session packs. Existing Duna plans and transaction fees remain separate.

## Owner flow

1. Open Website, describe the club's goals, optionally supply an existing HTTPS website and up to three inspiration URLs.
2. Duna uses the current public offerings and club brand knowledge to generate structured pages. External content is untrusted reference material; it cannot invoke business actions.
3. Review desktop/mobile previews and individual pages. Saved versions remain accessible. Further edits require the website subscription and available credits.
4. Activate the subscription through Stripe Checkout. Billing status is confirmed by signed Stripe webhook processing, not by a successful return URL.
5. Select a completed version, review it, and explicitly publish. Publication uses that exact revision. Deployment acceptance is not publication success: the live pointer advances after the provider reports READY, the stable alias is assigned, and an ordinary visitor receives the exact published revision.
6. Owners can cancel renewal from the website billing section after reviewing a confirmation. Access continues through the paid period; other club and player subscriptions remain unchanged.
7. Restore a previous design by previewing and publishing that completed version. Attach a domain or subdomain and complete the displayed DNS verification instructions.

The generated site uses controlled layouts and escaped content, not arbitrary generated server code. Its booking, account, and wallet links open the secure canonical Duna experience. Embedded custom-domain identity and unrestricted application generation are not part of this release.

## Authorization and reliability

- Current club owners/managers can manage sites; billing purchases require an owner or super administrator. Sample/demo actors cannot create or publish.
- Every site/revision operation checks the current organization's ownership. Mutation routes reject cross-origin requests.
- Jobs are persisted before execution. The initiating request schedules immediate processing; `/api/cron/websites` recovers queued/stale jobs using the existing cron secret.
- Generation runs with bounded time/attempts. Claims are fenced by attempt number. Draft persistence and credit settlement share a database transaction. Failure releases reserved credits, including after owner revocation.
- Preview HTML is private/no-store, escaped, script-free, sandboxed, and disables transactional navigation. Page navigation retains the selected site and revision.
- Public sites contain public club content. Duna remains authoritative for identities, families, reservations, wallets and payments.

## Configuration

Existing HQ variables: database, Stripe, cron, AI Gateway and Firecrawl credentials. Generation without reference URLs does not require Firecrawl. Website provisioning requires `DUNA_SITES_VERCEL_TOKEN`, `DUNA_SITES_VERCEL_TEAM_ID`, `DUNA_SITES_NEON_API_KEY`, and `DUNA_SITES_NEON_ORG_ID`. Keep these separate from the existing HQ/web database credentials. Every club receives a dedicated Vercel project and Neon project; marketplace-created prefixed database variables do not replace the HQ `DATABASE_URL`.

Stripe uses `STRIPE_WEBSITE_MONTHLY_PRICE_ID` when configured; otherwise it finds or idempotently creates `duna-website-monthly-v1`, validating an active $200 USD monthly price before checkout. Existing signed Stripe webhook handling reconciles paid invoices and subscriptions. Credits are invoice-idempotent, concurrency-safe and expire at the invoice period end. Spending all AI credits does not stop published pages or Duna bookings.

## Release evidence

Local review currently includes PostgreSQL-backed billing and generation lifecycle tests, route authorization/CSRF tests, real Stripe test-mode checkout/subscription/cancellation cleanup, and independently authored responsive UI contract tests. UI fixtures intercept all website API traffic and are not connected provider proof.

Before declaring hosting active, record the exact released SHA, CI, canonical HQ/web deployments, migrations, provider configuration, a real generated revision, a READY dedicated deployment, its database-backed page response, and domain verification status. Record Sendblue line activation and physical delivery separately in `duna-phone-messaging.md`.
