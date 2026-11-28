# Your team

How Duna keeps track of when your coaches, directors and staff can work, what
happens when someone cannot make a session, what they earn, and how pay is
prepared for your payroll system. Plain words for owners and support. Dated
28 November 2026 (B3a availability and coverage, B3b compensation and pay).
The shapes are in [`docs/plan/w3-contracts.md`](../plan/w3-contracts.md)
(`team-availability`, `team-pay`).

## Availability

- **Named schedules.** Each team member has one or more weekly schedules with
  a name and dates, for example "School term" from 1 September to 18
  December and "Holidays" from 19 December. Each day can have several
  windows (07:00–09:00 and 15:00–20:00), to the minute, and a window may run
  past midnight (20:00–02:00).
- **Times are your club's local time.** A 09:00 window stays 09:00 when the
  clocks change. On the night the clocks go forward, a window that would
  start in the missing hour starts when the clock resumes; on the night they
  go back, the repeated hour counts once.
- **One schedule at a time.** A new schedule starts as a draft. When you make
  it active it takes over on its first day; a schedule that would still be
  running ends the day before. A member can also have one **fallback**
  schedule that applies whenever no active schedule covers the date.
  Archived schedules are kept for history and never count.
- **Blackouts** are dates a member cannot work (a single day or a range). They
  need no approval.
- **Time off** is asked for and decided: requested, then approved, declined or
  cancelled. Approved time off can still be cancelled.
- **Real commitments count.** A member is busy when they already coach a
  session or a training event, are assigned to a booked lesson, or their
  connected calendar says busy. Free time is time inside their schedule that
  none of these cover.

Duna answers "is this coach free?" with one rule everywhere (bookable
session times, the coverage list, substitute suggestions and the coverage
grid), so the answer never differs between screens.

## Who can change what

| Action                                           | Who                                                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| See any member's availability and coverage       | Anyone on the team who can see members (coaches, front desk, managers, directors, owner)    |
| Edit a schedule, add or remove a blackout        | The member themselves, or a manager, director or owner                                      |
| Ask for time off                                 | The member themselves, or a manager on their behalf                                         |
| Approve or decline time off                      | A manager, director or owner, never for their own time off (the owner may decide their own) |
| Cancel time off                                  | The member who asked, or a manager                                                          |
| Ask a substitute, assign, cancel a coverage need | A manager, director or owner                                                                |

## Coverage

When someone becomes unavailable for something already scheduled (time off
approved, a blackout added, a schedule changed, or "sick today" as a
blackout), Duna lists each affected session as a **coverage need** and
suggests substitutes, ranked by plain rules:

1. Free for the whole session.
2. Set up to coach that program, when the program says who coaches it (others
   rank below them; members the program leaves out are not suggested).
3. Already at that venue that day.
4. Fewer hours already scheduled that week.

A need moves from **open** to **asking** when you ask someone, to **covered**
when you assign someone, or to **nobody free** when no one fits; you can
cancel it. Asking only records the ask: the message itself is a Concierge
draft that a person sends. **Nobody is reassigned until a person presses
Assign**; Duna then checks the substitute is still free, moves the session
to them, closes the other suggestions, and keeps an audit record of who
changed what.

The **coverage grid** shows each hour of a week: how many sessions run and
how many coaches are available for them; an hour is short when fewer coaches
are available than sessions.

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

What clubs entered in the old Team editor is kept. Weekly hours without dates
become the member's fallback schedule ("Weekly availability"); hours with
dates become active schedules with those dates; blackout dates become
blackouts. This copy happens once per member, the first time anyone changes
their availability or opens their availability page, or for everyone at once
with `packages/api/scripts/migrate-legacy-staff-availability.ts`. Until then
Duna reads the old value directly, so booking does not change in between.
The old editor keeps working and now saves into the new schedules.

The old editor's compensation (hourly, profit share, hourly plus profit
share) and income goal are copied once per member into the new model and
goal, from the member's start date (or for everyone with
`packages/api/scripts/migrate-legacy-staff-compensation.ts`). Profit share
becomes revenue share. The
old editor keeps working: it shows the new model, and a change made there
becomes a new model from today (owner only).

## Not yet stored (owner decision)

- **Club-wide closures** (one blackout for everyone) and **blackouts that
  repeat every year** are understood by the availability rule, but the
  database has no place to keep them yet. Today a closure is added per
  member. See [`schema-requests/B3a.md`](../plan/schema-requests/B3a.md).
- **A weekly maximum of hours** per member is understood by the substitute
  ranking but has no field yet (same request).
- **Hourly from attended time** instead of scheduled time is supported by the
  calculation but has no setting yet; Duna uses scheduled time.
- **Per-session rates by offering** (a different flat rate for private
  lessons and clinics) has no field yet; per session is one flat rate.
