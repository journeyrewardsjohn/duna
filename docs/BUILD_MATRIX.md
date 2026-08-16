# Product acceptance matrix

This matrix tracks the business plan, PRD modules, and TRD invariants. “Core
verified” means executable implementation and acceptance coverage exist.
“Partial” identifies the remaining connected workflow or external launch gate;
it is not a production-complete claim.

| Module                       | Primary surfaces              | Executable evidence                                                                                                                                                                                                                                  | Status                                                                                                                                                                                                     |
| ---------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1 Identity and guardianship | Player, Pro, HQ, Admin        | Connected profile, household, consent, guardian-review, deep People profiles, HealthKit consent surface, export/deletion flows; WorkOS AuthKit adapter                                                                                               | Staging AuthKit live on Web and HQ; production WorkOS promotion remains gated                                                                                                                              |
| M2 Sand Rating               | Player, HQ, Admin             | `rating/index.test.ts` determinism, symmetry, caps, explanations                                                                                                                                                                                     | Core verified                                                                                                                                                                                              |
| M3 Import and resolution     | Admin                         | `import-resolution.test.ts` scoring, ambiguity, provenance, exact links                                                                                                                                                                              | Core verified; licensed source access pending                                                                                                                                                              |
| M4 Scoring                   | Player, Pro, public live view | Connected event log, authoritative-device lock, offline replay, sync divergence, live view                                                                                                                                                           | Connected workflows verified                                                                                                                                                                               |
| M5 Leagues and tournaments   | Pro, HQ, Player               | HQ draft/publish flow, connected scoring, bracket, tiebreaker, and schedule suites                                                                                                                                                                   | Core connected; advanced bracket persistence and purse activation remain gated                                                                                                                             |
| M6 Inventory and booking     | HQ, Pro, Player               | Connected venue/court/rate controls, atomic holds, race alternatives, Stripe checkout                                                                                                                                                                | Connected workflows verified                                                                                                                                                                               |
| M7 Payments and POS          | HQ, Pro, Player               | Pricing properties; guided native Get Paid, payment-attempt history, earnings goals, Stripe Checkout, destination PaymentIntent, Tap to Pay lifecycle, wallet/credit selection, refund, signed-webhook smokes                                        | Code and sandbox contracts verified; Apple entitlement, Stripe production activation, and physical-device acceptance remain gated                                                                          |
| M8 Eligibility               | HQ, Player                    | Versioned rule trees, connected decisions, guardian authority, registration persistence                                                                                                                                                              | Connected workflows verified                                                                                                                                                                               |
| M9 Events and ticketing      | HQ, Pro, Player               | Connected checkout/waitlist/registration lifecycle, offline-safe scan API, ticketing tests                                                                                                                                                           | Connected core; advanced ticket catalog and affiliate UI remain partial                                                                                                                                    |
| M10 Forms and waivers        | HQ, Player                    | Connected idempotent submission/consent endpoints, exact-text hash, guardian binding                                                                                                                                                                 | Server workflow verified; operator builder and checkout rendering remain partial                                                                                                                           |
| M11 Consumer network         | Player, web                   | Responsive browser journeys across desktop, tablet, and phone                                                                                                                                                                                        | Core verified                                                                                                                                                                                              |
| M12 Coach marketplace        | Player, HQ, Admin             | `trust.test.ts` background gate and review integrity                                                                                                                                                                                                 | Partial; screening provider and marketplace settlement pending                                                                                                                                             |
| M13 Messaging                | HQ, Pro, Player, Admin        | Relationship/block/guardian policy, conversation sequence and stable client IDs, Neon cursor sync, native SQLite outboxes, Expo Push delivery records, private R2 attachments, Upstash wake hints, SafeSport moderation, Duna Support and AI handoff | Core delivery architecture implemented; target migrations, provider credentials, signed native builds, sender/privacy approvals, and authenticated end-to-end release evidence remain environment-specific |
| M14 Reporting                | HQ                            | `reporting.test.ts` ledger-derived revenue and reconciliation; live DB admin metrics                                                                                                                                                                 | Core verified; accounting export/sync pending                                                                                                                                                              |
| M15 Ask Duna and Operator    | All                           | Persistent agent drafts, canonical hashes, one-time confirmation, golden trace, audit                                                                                                                                                                | Core risk gate verified; model/provider connection pending                                                                                                                                                 |
| M16 Wallet                   | Player, Pro, HQ, Admin        | `wallet.test.ts` ledger, custody, guardian spend, tax rails, drift incidents                                                                                                                                                                         | Core verified; counsel and production Stripe rails pending                                                                                                                                                 |
| M17 Trust and administration | Admin                         | Live queues/audit/guardian review; scoped feature flags; role and rate-limit contracts                                                                                                                                                               | Connected control plane verified; external monitoring and case providers pending                                                                                                                           |
| M18 Duna Video               | Player iOS, web, Pro, Admin   | Mux live/R2 upload contracts; native court guide; privacy/share authorization; multi-angle playback; usage and grant controls                                                                                                                        | Core implemented; connected Mux, Web R2 credentials, physical-device stream, and audio-isolation provider remain gated                                                                                     |

## Cross-cutting release evidence

- Every tRPC procedure has a Zod input and output contract.
- Every mutation accepts and persists an idempotency key; replays and conflicts
  are contract-tested.
- WorkOS AuthKit sessions resolve through the database into tenant roles and
  organization scopes;
  unknown-age identities cannot enter adult hosting or money flows.
- Per-IP, per-person, per-organization, checkout, messaging, and confirmation
  token buckets are enforced in Postgres.
- Stripe ingress verifies signatures, deduplicates, stores the raw event, and
  atomically enqueues a durable workflow. Inngest serves event processing and
  one-minute recovery functions.
- `pnpm verify:live-repository` exercises the production Neon branch and removes
  its own isolated smoke records.
- Connected commerce, checkout completion, court booking, account lifecycle,
  guardian review, match lifecycle, operator scoring, and operator workflow
  verifiers exercise real Neon and Stripe sandbox state and clean up their
  isolated records.
- `pnpm verify:feature-flags` proves scoped uniqueness, super-admin-only writes,
  configuration persistence, and immutable before/after audit hashes.

## External launch gates

- WorkOS production environment, verified domain, and final redirect/logout
  promotion (staging AuthKit is connected to the live Duna surfaces)
- Inngest event/signing keys
- Provider authorization, retention terms, and credentials for any new player
  dataset beyond the operator-authorized VolleyballLife, BVBInfo, FIVB, and AVP
  feeds
- Wallet, minors, privacy, escheatment, and tax counsel review
- Apple Tap to Pay development and distribution entitlements
- App Store and Play Store organization enrollment and review
- Production Stripe Connect, Tax, Treasury, Terminal, and 1099 approvals
- SMS 10DLC registration, messaging credentials, and background-check agreement
- Cloudflare, Upstash, Knock, PostHog, Sentry, and Axiom production credentials
- Mux account activation, API/signing keys, webhook configuration, and a
  physical-device iOS live-stream validation
- Approved music-isolation processor and media/copyright policy review
