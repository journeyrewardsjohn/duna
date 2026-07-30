# Product acceptance matrix

This matrix tracks the business plan, PRD modules, and TRD invariants. A feature
is marked complete only when implementation and verification both exist.

| Module                       | Primary surfaces              | Verification                                  |
| ---------------------------- | ----------------------------- | --------------------------------------------- |
| M1 Identity and guardianship | Player, Pro, HQ, Admin        | Contract, permission, minor-policy tests      |
| M2 Sand Rating               | Player, HQ, Admin             | Determinism, symmetry, cap, explanation tests |
| M3 Import and resolution     | Admin                         | Idempotency and merge-decision tests          |
| M4 Scoring                   | Player, Pro, public live view | Rally/sideout folds, offline replay tests     |
| M5 Leagues and tournaments   | Pro, HQ, Player               | Bracket, tiebreaker, schedule tests           |
| M6 Inventory and booking     | HQ, Pro, Player               | Slot intersection and race contracts          |
| M7 Payments and POS          | HQ, Pro, Player               | Pricing properties and Stripe test flows      |
| M8 Eligibility               | HQ, Player                    | Versioned rule-tree tests                     |
| M9 Events and ticketing      | HQ, Pro, Player               | State-machine and claim-flow tests            |
| M10 Forms and waivers        | HQ, Player                    | Version binding and signature contracts       |
| M11 Consumer network         | Player, web                   | Responsive and browser journeys               |
| M12 Coach marketplace        | Player, HQ, Admin             | Safety gate and review-integrity tests        |
| M13 Messaging                | HQ, Pro, Player               | Consent, frequency, guardian-copy tests       |
| M14 Reporting                | HQ                            | Ledger-derived and reconciliation tests       |
| M15 Ask Duna and Operator    | All                           | Tool-risk and golden-trace tests              |
| M16 Wallet                   | Player, Pro, HQ, Admin        | Ledger, custody, tax-character tests          |
| M17 Trust and administration | Admin                         | Role, audit, hold, and queue tests            |

## External launch gates

- Licensed VolleyballLife and BVBInfo datasets
- Wallet and escheatment counsel review
- Apple Tap to Pay development and distribution entitlements
- App Store and Play Store organization enrollment/review
- Production Stripe Connect, Tax, Treasury, Terminal, and 1099 approvals
- SMS 10DLC registration and background-check provider agreement
