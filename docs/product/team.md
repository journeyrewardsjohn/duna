# Your team: availability and coverage

How Duna keeps track of when your coaches, directors and staff can work, and
what happens when someone cannot make a session they are booked for. Plain
words for owners and support. Dated 28 November 2026 (B3a). The shapes are in
[`docs/plan/w3-contracts.md`](../plan/w3-contracts.md) (`team-availability`).

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

## Moving from the old team editor

What clubs entered in the old Team editor is kept. Weekly hours without dates
become the member's fallback schedule ("Weekly availability"); hours with
dates become active schedules with those dates; blackout dates become
blackouts. This copy happens once per member, the first time anyone changes
their availability or opens their availability page, or for everyone at once
with `packages/api/scripts/migrate-legacy-staff-availability.ts`. Until then
Duna reads the old value directly, so booking does not change in between.
The old editor keeps working and now saves into the new schedules.

## Not yet stored (owner decision)

- **Club-wide closures** (one blackout for everyone) and **blackouts that
  repeat every year** are understood by the availability rule, but the
  database has no place to keep them yet. Today a closure is added per
  member. See [`schema-requests/B3a.md`](../plan/schema-requests/B3a.md).
- **A weekly maximum of hours** per member is understood by the substitute
  ranking but has no field yet (same request).
