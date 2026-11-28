# Your team: compensation and pay runs

How Duna tracks what your coaches and staff earn and prepares pay for your
payroll system. Plain words for owners and support. Dated 28 November 2026
(B3b). The shapes are in [`docs/plan/w3-contracts.md`](../plan/w3-contracts.md)
(`team-pay`).

## What Duna does and does not do

- Duna **computes and exports** pay. It is not the employer and not a payroll
  provider. It calculates no tax, no withholding and no benefits.
- **W-2 employees** are tracked for reporting and exported for your payroll
  system on the pay periods you choose. Duna never pays a W-2 employee
  (the database refuses it).
- **1099 contractors** are exported too, and you pay them yourself today.
  Paying contractors through Duna Pay is designed but switched off until the
  owner and counsel review it: [`docs/money/contractor-payouts.md`](../money/contractor-payouts.md).

## Compensation

Each team member has one compensation model at a time, with the date it
starts. Starting a new model ends the current one the day before; the old one
stays in the history.

| Model             | How it pays                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Per session       | A flat amount for each session they delivered                                                                                   |
| Hourly            | Their rate × the scheduled length of each delivered session                                                                     |
| Salary            | Annual salary ÷ pay periods a year (52, 26, 24 or 12), for W-2 employees only                                                   |
| Revenue share     | A percentage of what the club kept from the sessions they ran (after refunds), for the offerings you choose (none chosen = all) |
| Hourly plus share | Both                                                                                                                            |

Each model records whether the member is a **W-2 employee** or a **1099
contractor**. An **income goal** (per week, month, quarter or year) shows how
much of the goal their delivered sessions have earned so far.

Who: the owner (and anyone with the payments permission) changes
compensation, goals, pay periods and pay runs. A member sees their own pay;
managers can see everyone's; other coaches cannot see a colleague's pay.

## Pay periods and pay runs

- **Pay periods**: weekly, every two weeks, twice a month (1st–15th and
  16th–end of month) or monthly, starting on the date you choose, in your
  club's local dates. Periods cannot overlap.
- A **pay run** computes one line per member from the sessions they
  delivered in the period (sessions, training events and booked lessons that
  ended and were not cancelled). Every line lists the sessions it pays and
  what each earned.
- Steps: **computed → ready for approval → approved → exported**. You can
  add labelled adjustments (a bonus, a deduction) before approval; a line
  cannot go below zero. Computing again makes a new revision and cancels the
  unapproved one.
- **Approval** is the owner's. An approved run never changes. A correction
  (a session recorded late) is a new run for the same period that pays only
  what was not paid before: a session is never paid twice, and salary is
  paid once per period.
- **Rounding**: money is kept in cents (minor units). Each division rounds
  half up to the cent once: per session for hourly pay and revenue share,
  per period for salary. Lines add up exactly to the run totals.

## The payroll file

Exporting an approved run writes a CSV for your payroll system or
accountant and records who exported it and when. Columns: `pay_run_id`,
`revision`, `period_start`, `period_end`, `staff_profile_id`, `person_id`,
`name`, `classification`, `compensation_model`, `sessions`, `hours`,
`currency`, `earnings`, `adjustments`, `total`, `adjustment_labels`
(amounts in major units, "1234.50"). The download link lasts 15 minutes.
Layouts for named payroll products are not available yet; they need a sample
import file from a club that uses them.

## Moving from the old team editor

The old editor's compensation (hourly, profit share, hourly plus profit
share) and income goal are copied once per member into the new model and
goal, from the member's start date. Profit share becomes revenue share. The
old editor keeps working: it shows the new model, and a change made there
becomes a new model from today (owner only).

## Not yet stored (owner decision)

- **Hourly from attended time** instead of scheduled time is supported by the
  calculation but has no setting yet; Duna uses scheduled time.
- **Per-session rates by offering** (a different flat rate for private
  lessons and clinics) has no field yet; per session is one flat rate.
