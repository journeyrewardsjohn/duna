# Paying 1099 contractors through Duna Pay (B3c design)

Dated 28 November 2026. **Design only.** Nothing here moves money: the
`operator.teamPayouts.*` procedures stay honest stubs, the kill switch
`team.contractorPayouts` exists, and no processor call is made. How money
reaches a contractor needs the owner's decision and counsel's review before
any of it is built.

> This page is not legal or tax advice. It lists questions for counsel and
> the processor; counsel must review before contractor payouts go live.

## Where we are today (B3b)

Clubs compute pay in Duna and **export** it. W-2 employees are tracked and
exported for the club's payroll provider; contractors are exported too, and
the club pays them itself (bank transfer, its payroll tool). Duna is not the
employer, not a payroll provider, and calculates no tax or withholding.
Every pay-run line has `method = 'export'`; `duna-pay` is refused for W-2
lines by a database CHECK and for contractors by the service until B3c.

## The two possible money paths

Players pay a club through **destination charges**: the money lands in the
club's connected account and the club's payouts are manual, released by
Duna's payout job (`docs/money/duna-pay.md`). A contractor would have their
**own** connected account (`staff_connected_accounts`, one per person, so
one account serves every club that pays them).

### Path A: platform transfer funded from the club's proceeds

1. Duna takes the line's amount back from the club's side (for example by
   reversing part of the club's transfer for a sale, or by holding back the
   club's next payout).
2. Duna transfers that amount from the platform balance to the
   contractor's connected account.

What it needs from the processor: transfer reversals or a way to move club
proceeds back to the platform, and platform transfers to the contractor's
account (same region and currency).

What it raises in law (for counsel): Duna would hold and move the club's
money to a third party, which may look like money transmission or
payment-facilitator activity depending on the states involved; Duna (the
platform) may be treated as the payer for information-return purposes
(1099-NEC / 1099-K), with W-9 collection, TIN checks and backup withholding
duties that follow; and payouts would touch obligations, tranches and
reserves that the payout policy currently reserves for the club.

### Path B: a transfer from the club's account to the contractor's

1. The club's connected account is debited for the line (a club-to-platform
   debit the processor must allow for that account type and country).
2. The platform immediately transfers the same amount to the contractor's
   connected account. The club is the source of funds; Duna only executes the
   instruction a person with `payments:write` confirmed.

What it needs from the processor: approval to debit the club's connected
account, platform transfers to the contractor's account, both accounts in
the same region, and webhooks for debit and transfer status.

What it raises in law (for counsel): whether the club stays the payer of
record for 1099 purposes (and how the processor's tax-form tooling, which
usually files for the platform, can reflect that); whether executing the
club's instruction is still a regulated money service; contractor
classification stays the club's decision (Duna records it, never decides
it); consent and terms for the contractor's account (their own agreement
with the processor and Duna).

## What the tables already support

- `staff_connected_accounts`: the contractor's processor account id, the
  same six derived statuses as Duna Pay, `payouts_enabled`, requirements due,
  bank last four, last sync. One row per person; `invited_by_organization_id`
  records which club invited them.
- `staff_contractor_payouts`: one active payout per pay-run line, amount and
  currency, an idempotency key unique per club, the processor transfer id,
  failure code, who started it and when, `paid_at` (CHECK: paid ⇔ paid_at),
  a ledger journal id, and the states pending → processing → paid | failed,
  pending → cancelled.
- `staff_pay_run_lines.method = 'duna-pay'` with `payoutReady` on the line,
  and the run states `paying`, `paid`, `partially-paid`.

Gap for Path B: there is no column for the club-side debit id; the payout
row has only the transfer id. Path A needs no new column but needs ledger
accounts for "owed to contractors". Either path posts a balanced journal per
payout (the ledger already requires it).

## Recommendation

1. Keep the export path as the product for now: it serves W-2 and 1099
   alike and keeps Duna out of the flow of payroll money.
2. If the owner wants Duna to pay contractors, prefer **Path B** (the club's
   own money, debited and transferred on a person's confirmation, one line
   at a time): it keeps the club as the source of funds and leaves club
   proceeds, tranches and reserves untouched.
3. Before building it: counsel reviews money transmission, payer-of-record
   and 1099 duties in the club states we launch in; the processor confirms
   account debits for our account type; the owner approves terms for
   contractors. Then B3c adds the debit id column, ledger accounts and the
   processor calls behind `team.contractorPayouts`.
