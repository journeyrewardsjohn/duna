# Duna architecture

These are required design invariants. Module-by-module implementation status is
tracked separately in `BUILD_MATRIX.md`; this list is not a blanket launch
readiness claim.

## Invariants

1. Rally events are scoring truth. Rating events are rating truth. Ledger entries
   are balance truth.
2. All mutations enter through the same typed procedure layer.
3. Organization scope and permissions are enforced before query execution.
4. Mutations are idempotent and side effects are durably queued.
5. Duna never holds customer funds. Stripe-managed balances are truth.
6. Money, ratings, eligibility overrides, role changes, and platform actions are
   audited in the same transaction as the mutation.
7. Guardian copies, custodial rules, and minors-safety gates are server rules.
8. AI reads freely, proposes drafts, and requires fresh human confirmation for
   money, messaging, publishing, pricing, and rating changes.
9. Currency uses integer minor units and explicit ISO currency. Stored time is
   UTC and rendered in venue time.
10. The four deterministic engines do not import clocks, networks, databases,
    or ambient randomness.

## Delivery shape

The repository deploys two Next.js projects (`apps/web`, `apps/hq`) and two Expo
projects (`apps/player`, `apps/pro`). All share domain contracts and brand tokens.
Connected services are adapter-backed; a deterministic demo adapter is available
for local, preview, and automated verification.
