# Product acceptance matrix

This matrix tracks the business plan, PRD modules, and TRD invariants. “Core
verified” means executable implementation and acceptance coverage exist.
“Partial” identifies the remaining connected workflow or external launch gate;
it is not a production-complete claim.

| Module                       | Primary surfaces              | Executable evidence                                                                         | Status                                                               |
| ---------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| M1 Identity and guardianship | Player, Pro, HQ, Admin        | `identity.test.ts`; Clerk JWT/Organization adapter; adult-flow gate                         | Core verified; Clerk keys and onboarding UI pending                  |
| M2 Sand Rating               | Player, HQ, Admin             | `rating/index.test.ts` determinism, symmetry, caps, explanations                            | Core verified                                                        |
| M3 Import and resolution     | Admin                         | `import-resolution.test.ts` scoring, ambiguity, provenance, exact links                     | Core verified; licensed source access pending                        |
| M4 Scoring                   | Player, Pro, public live view | `league-engine/engine.test.ts` rally, sideout, undo, offline replay                         | Core verified; device-authority sync UI pending                      |
| M5 Leagues and tournaments   | Pro, HQ, Player               | Bracket, tiebreaker, and schedule suites; typed output contracts                            | Core verified; connected creation workflow partial                   |
| M6 Inventory and booking     | HQ, Pro, Player               | Slot intersection and buffer tests; tenant-scoped venue repository                          | Partial; transactional booking race path pending                     |
| M7 Payments and POS          | HQ, Pro, Player               | Pricing properties; Stripe Checkout, PaymentIntent, Terminal, refund, signed-webhook smokes | Sandbox verified; production approvals and physical Terminal pending |
| M8 Eligibility               | HQ, Player                    | `eligibility.test.ts` versioned rule trees and overrides                                    | Core verified; registration persistence workflow partial             |
| M9 Events and ticketing      | HQ, Pro, Player               | `ticketing.test.ts` exclusions, claims, scan dedupe, waitlists                              | Core verified; connected purchase UI partial                         |
| M10 Forms and waivers        | HQ, Player                    | `forms.test.ts` conditional fields, exact-text hash, guardian binding, re-sign              | Core verified; connected form endpoints partial                      |
| M11 Consumer network         | Player, web                   | Responsive browser journeys across desktop, tablet, and phone                               | Core verified                                                        |
| M12 Coach marketplace        | Player, HQ, Admin             | `trust.test.ts` background gate and review integrity                                        | Partial; screening provider and marketplace settlement pending       |
| M13 Messaging                | HQ, Pro, Player               | `messaging.test.ts` guardian-copy and quiet-hours enforcement                               | Partial; consent ledger endpoints and providers pending              |
| M14 Reporting                | HQ                            | `reporting.test.ts` ledger-derived revenue and reconciliation; live DB admin metrics        | Core verified; accounting export/sync pending                        |
| M15 Ask Duna and Operator    | All                           | Persistent agent drafts, canonical hashes, one-time confirmation, golden trace, audit       | Core risk gate verified; model/provider connection pending           |
| M16 Wallet                   | Player, Pro, HQ, Admin        | `wallet.test.ts` ledger, custody, guardian spend, tax rails, drift incidents                | Core verified; counsel and production Stripe rails pending           |
| M17 Trust and administration | Admin                         | `trust.test.ts`; live queues/audit; role and rate-limit contracts                           | Core verified; external monitoring and case providers pending        |

## Cross-cutting release evidence

- Every tRPC procedure has a Zod input and output contract.
- Every mutation accepts and persists an idempotency key; replays and conflicts
  are contract-tested.
- Clerk sessions resolve through the database into tenant roles and scopes;
  unknown-age identities cannot enter adult hosting or money flows.
- Per-IP, per-person, per-organization, checkout, messaging, and confirmation
  token buckets are enforced in Postgres.
- Stripe ingress verifies signatures, deduplicates, stores the raw event, and
  atomically enqueues a durable workflow. Inngest serves event processing and
  one-minute recovery functions.
- `pnpm verify:live-repository` exercises the production Neon branch and removes
  its own isolated smoke records.

## External launch gates

- Clerk production keys and final sign-in/onboarding configuration
- Inngest event/signing keys
- Licensed VolleyballLife and BVBInfo datasets
- Wallet, minors, privacy, escheatment, and tax counsel review
- Apple Tap to Pay development and distribution entitlements
- App Store and Play Store organization enrollment and review
- Production Stripe Connect, Tax, Treasury, Terminal, and 1099 approvals
- SMS 10DLC registration, messaging credentials, and background-check agreement
- Ably, Cloudflare, Knock, PostHog, Sentry, and Axiom production credentials
