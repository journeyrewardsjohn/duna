# Duna Pay: how clubs get paid

Dated 28 November 2026 (work package B2). The owner's policy, in their words:
"when Duna takes payments, our payouts are within 3 days once settled OR for
one-time bookings, once the event has taken place ... ensure we cover
holdbacks for disputes or refunds". The specification is
[`docs/plan/payout-policy.md`](../plan/payout-policy.md); the frozen tables and
procedures are in [`docs/plan/w3-contracts.md`](../plan/w3-contracts.md)
(section "pay"). This page describes what the code does.

## The model in plain words

1. A player pays. The charge is a destination charge: the money lands in the
   club's connected account, minus Duna's application fee and any sales tax
   Duna collects. The club's processor payout schedule is **manual**: money
   leaves only when Duna instructs a payout.
2. For each sold line Duna records an **obligation**: what it owes the club
   for that sale (the proceeds) and the **delivery rule** the sale follows.
3. The delivery rule splits the proceeds into **tranches**: one for a
   booking, one per session for a program, one per week for a long event
   without sessions, one per redeemed credit for a new club's credit pack.
4. A tranche is **releasable** when the money has **settled** (the processor
   reports it available) **and** the portion has been **delivered**, and no
   hold covers the sale. Releasable time is the later of settlement,
   delivery, the refund window (memberships) and the club's first-payout date.
5. The payout job pays releasable tranches out on the club's schedule.
   **Daily** is the default, so money is paid within 3 business days of
   becoming releasable. Weekly and monthly are slower by the club's choice.

Time alone never delivers anything. The release job looks at the source of
each portion (the court booking, the session, the occurrence, the fulfilment,
the credit grant) and records a **delivery fact**: delivered, or cancelled.
A cancelled session, or one cancelled under its minimum, is recorded as
cancelled and releases nothing; its money waits for the refund. A group
session with a minimum is never delivered before its minimum was decided.

## Delivery rules

| Sale                                                | Rule                  | Delivered when                                                                                                                                                                        |
| --------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Court rental, lesson, assessment, clinic, open play | `scheduled-end`       | The booking or session has ended and was not cancelled                                                                                                                                |
| Event or tournament up to `eventMaxDays` (7) long   | `event-last-day`      | The last day has ended                                                                                                                                                                |
| Program, camp, league with a session schedule       | `pro-rata-sessions`   | Each session's share after that session ends; optional start tranche (≤ 25%) when the first session ends, only for opted-in clubs in good standing                                    |
| Long event or league without sessions               | `pro-rata-weekly`     | Equal weekly portions from start to end                                                                                                                                               |
| Membership period                                   | `membership-period`   | On payment; releasable at the later of settlement + 3 business days and the end of the plan's full-refund window                                                                      |
| Credit pack, bundle                                 | `credit-pack-reserve` | On settlement; for a club's first `creditRedemptionOnlyDays` (90) days, per redeemed credit instead (unredeemed credits refunded cancel their share). The 20% reserve is held on top. |
| Physical goods                                      | `goods-fulfilment`    | Fulfilled (handed over or shipped). Past the ship-by date the buyer may cancel                                                                                                        |
| Digital goods, in-person (card-present) payments    | `instant`             | On payment                                                                                                                                                                            |

The rule and the facts it needs (session schedule, source, credits granted,
start-tranche share, credit release mode) are fixed **at sale time** in the
obligation's snapshot, so a later settings change never reshapes money
already sold.

## State machines

- **Obligation**: `pending-settlement → awaiting-delivery →
partially-released → released`; from any open state → `held`, `disputed`,
  `partially-refunded`, `refunded`; `cancelled` when every portion was
  cancelled before delivery.
- **Tranche**: `scheduled → delivered → releasable → released`; `held` while
  a hold covers it; `reversed` when a refund took its money back before
  release; `cancelled` when its delivery will not happen. A released tranche
  never changes; a failed payout returns it to `releasable`.
- **Delivery event**: append-only (database trigger). Each carries an
  idempotency key, so recording the same fact twice is a no-op.

## The one function

`computeReleasePlan(obligation, events, context, now)` in
`packages/api/src/services/pay/release-rules.ts` is the whole policy. It is
pure and deterministic. Its tests (`release-rules.test.ts`) cover every rule
and include property-style checks over thousands of random sales:

- splits never create or lose a cent;
- no plan pays a club more than it is owed;
- unsettled or undelivered money is never releasable;
- the plan does not depend on the order of facts, and a fact recorded twice
  counts once;
- money released once is never releasable again.

Refunds reduce what is still payable, taken from the latest open portions
first. A refund larger than what is still unpaid is reported as
**over-released**: money that left before it was taken back, to be recovered
(policy §5.5).

## Jobs

| Job                                   | Schedule                       | What it does                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/cron/money-payouts` (HQ)        | Hourly (`apps/hq/vercel.json`) | `processAutomaticOrganizationPayouts`: runs the **release job** (backfill obligations, copy settlement, delivery sweep, recompute every open obligation), then for each club whose schedule is due today creates one payout from its releasable tranches. Reports `overdueTranches`: releasable money older than the 3-business-day promise. |
| `/api/cron/money-reconciliation` (HQ) | Every 10 minutes               | Links each succeeded payment to the processor's charge, transfer and balance transaction (settlement date). Settlement copied from here is what makes money releasable.                                                                                                                                                                      |

Every step is idempotent and safe to run twice at once: delivery facts are
unique by key; tranche updates never touch a released row; payouts take a
per-club advisory lock, claim tranches with `status = 'releasable' AND
payout_id IS NULL`, use a deterministic processor idempotency key
(`duna-auto-payout:<club>:<UTC date>`) and a unique `(organization,
idempotency_key)` on `payouts`.

A payout is capped by the club's available processor balance minus active
club-level holds. Each payout posts one balanced journal (debit
`DUNA_PAY_PAID_OUT`, credit `STRIPE_CLEARING`); a failed or cancelled payout
(processor webhook `payout.failed` / `payout.canceled`) returns its tranches
to `releasable` and posts the reversal journal once.

## How to read a club's balance

- **Releasable now**: tranches with status `releasable` and no payout.
- **On the way**: tranches `released` into a payout that is not yet `paid`.
- **Held**: tranches `held` (a dispute or a hold on the sale) plus club-level
  holds (`pay_holds` without an obligation).
- **Not yet delivered**: tranches `scheduled` or `delivered` (waiting for
  settlement, the refund window or the first-payout date).
- **Over-released**: logged as `pay.obligation.overReleased`; recovery
  follows the policy order (held funds, available balance, future proceeds).

`operator.pay.obligations`, `operator.pay.obligation` and `operator.pay.holds`
return these facts for HQ.

## Settings and defaults

Every number is a setting (`packages/api/src/services/pay/policy-settings.ts`).
The owner may override any of them with the server environment variable
`DUNA_PAY_POLICY_JSON` (a JSON object with any subset of the keys); invalid
fields are ignored one by one and reported, never fatal.

| Key                                                                                                             | Default              | Meaning                                                        |
| --------------------------------------------------------------------------------------------------------------- | -------------------- | -------------------------------------------------------------- |
| `payoutBusinessDays`                                                                                            | 3                    | The payout promise after money becomes releasable              |
| `defaultPayoutInterval`                                                                                         | `daily`              | Written for clubs that have no money settings yet              |
| `firstPayoutDelayDays`                                                                                          | 7                    | New club's first payout waits this long after its first charge |
| `eventMaxDays`                                                                                                  | 7                    | Longer events release weekly or per session                    |
| `startTrancheMaxBps`                                                                                            | 2500                 | Largest start tranche                                          |
| `startTrancheMinPayoutHistoryDays` / `startTrancheMaxRefundRateBps` / `startTrancheMaxDisputeRateBps`           | 90 / 500 / 75        | Good standing for a start tranche                              |
| `membershipMinimumBusinessDays`                                                                                 | 3                    | Membership floor after settlement                              |
| `creditReserveBps`                                                                                              | 2000                 | Unredeemed Credit Reserve                                      |
| `creditRedemptionOnlyDays`                                                                                      | 90                   | New clubs' packs release per redeemed credit                   |
| `goodsDefaultShipDays`                                                                                          | 30                   | Ship-by when the club states none                              |
| `disputeOrganizationEvidenceDays`                                                                               | 7                    | Club's evidence deadline                                       |
| `rollingReserveDefaultBps` / `rollingReserveDefaultDays` / `rollingReserveMaxDays` / `rollingReserveReviewDays` | 1000 / 90 / 180 / 30 | Triggered rolling reserve                                      |
| `recoveryInvoiceDays`                                                                                           | 15                   | Invoice terms for an unrecovered negative balance              |
| `closureReleaseDays`                                                                                            | 120                  | Remainder released after closure notice                        |

Per-club facts live on `organization_pay_accounts`: first charge, first-payout
date (set only for clubs never paid out before; waivable by Duna), start
tranche opt-in and share, suspension.

## Observability

Events (ids only, never amounts tied to people, never card data):
`pay.obligation.created`, `pay.obligation.updated`, `pay.delivery.recorded`,
`pay.release.completed`, `pay.release.overdue`, `pay.payout.created`,
`pay.payout.returned`, `pay.obligation.overReleased`. Failures are
`report()`ed as `pay.obligation.failed` and `pay.release.failed`; an invalid
settings override as `pay.settings.invalid`. Payout creation goes through
`withProviderCall("stripe", "payouts.create")`.

## Status of this work

Pull request 1 of 3 (B2): rules, obligations, delivery facts, the release
job, payouts from tranches, invariants, and the delivery fix (release at the
end, not at start minus the refund window). Disputes, refunds by payment
method, recoveries, reserves and reconciliation drift follow in pull request
2; fees, account status, the publish gate, the bootstrap script and the
legal promise table in pull request 3.
