# Group sessions that fill up

How Duna handles player minimums, group sizes and group-size pricing, in plain
words for the owner and for support. Dated 28 November 2026 (PART-1 to PART-3).
The design is [`docs/plan/participation.md`](../plan/participation.md); this page
is what the product does today.

## The idea in one sentence

A group session has a smallest group that runs, a largest group, a time when the
group is decided (the **decision time**), and what happens if it is too small.
Everything a player, coach or owner sees is written from those four facts by one
function, so the words never disagree between the website, HQ and the apps.

Example club sentence: "Runs with at least 3 players, up to 8. We decide 24 hours
before it starts. If fewer are booked, cancel and return credits."

## The decisions behind it (build defaults)

These are the owner's open decisions with the design's recommendation used as the
default. Each lives in one place in code (`PARTICIPATION_POLICY` in
`packages/core/src/participation/policy.ts`), so changing one is one edit.

| Decision                       | Default today                                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Decision time and free cancel  | The same moment. Default 24 hours before the start.                                                                             |
| Attendance and price           | Price is fixed when the group is decided. No-shows pay like everyone; attendance is still recorded for coaches.                 |
| Price as the group grows       | The price per player can never go up as the group grows. A "cliff" (one more player lowers the club's total) is a warning only. |
| Cancelling after the decision  | Allowed after "I understand". Costs the final price, not the reserve. Given back if someone takes the place.                    |
| Booking the same session twice | Blocked. "Add a player" brings guests.                                                                                          |
| Card payers                    | Will reserve the most and get the difference back, like credits (wired by PART-10; today cards pay the fixed price).            |
| Old "auto-cancel" settings     | Only sessions created from now on cancel. Existing ones were mapped to "run" and listed for review.                             |

## The lifecycle of a session

| State            | When                                                           | Player sees                                            | Coach and club see                 |
| ---------------- | -------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------- |
| Needs players    | Before the decision, fewer booked than the minimum             | "Needs 2 more" · "Confirms Thu 6:00 PM if 2 more join" | "At risk · needs 2 by Thu 6:00 PM" |
| Minimum reached  | Before the decision, enough booked, places left                | "Minimum reached" · "Confirms Thu 6:00 PM"             | "On track · 4 of 12"               |
| Full             | Every place taken                                              | "Full" · "Join the waitlist" or "3 waiting"            | "Full · 3 waiting"                 |
| Confirmed        | Decided, minimum met                                           | "Confirmed · 5 players"                                | "Confirmed · 5"                    |
| Running small    | Decided under the minimum, but the rule (or the club) says run | "Confirmed · small group"                              | "Running with 2 of 4"              |
| Cancelled (low)  | Decided under the minimum and the rule says cancel             | "Cancelled · not enough players"                       | "Cancelled · 2 of 4 booked"        |
| Cancelled (club) | A person at the club cancelled                                 | "Cancelled by {club}"                                  | "Cancelled by {name}"              |
| Done             | Ended; attendance open for 24 hours                            | "Done" (and "You were marked absent" if so)            | "Mark attendance"                  |
| Settled          | Attendance closed                                              | "Done"                                                 | "Done"                             |

Rules that always hold:

- **After the decision, numbers never cancel a session.** Only a person at the
  club can, and they confirm the refunds first.
- **A session that already started is never cancelled automatically.** If the
  schedule missed the decision, the session runs.
- **Nothing changes under a booked player's feet.** The rule is copied (a
  "snapshot") when the first person books. Editing the offering later changes
  only sessions nobody has booked yet. The club can apply a change to booked
  sessions only when it is better for the players (lower minimum, run instead
  of cancel, cheaper prices, later decision, more places).
- **Places and the minimum count the same bookings.** Paid places and unexpired
  pay-in-person reservations count toward the minimum. An unpaid checkout holds
  a place while it is open and shows as "1 place being booked".
- **Two people cannot both take the last place.** One booking keeps it; the
  other is told the session no longer has enough places and nothing is charged.

## Money

- **Credits with a price ladder.** At booking a player reserves the highest
  price on the ladder. At the decision each booking settles to the price for
  the final group and the difference goes back to the wallet it came from,
  once. Nobody ever pays more than they reserved.
- **Booking after the decision** pays the final price straight away.
- **Cancelled under the minimum or by the club.** Everything comes back:
  credits to the wallet, card payments refunded with the Service Fee,
  pay-in-person reservations released. A card refund the processor refuses is
  marked "needs attention" for the club.
- **Cancelling before the decision** returns everything.
- **Cancelling after the decision** (only after "I understand") costs the final
  price for the group (for example 2 credits in a group of 5, not the 3
  reserved). When a later booking takes the place, the canceller gets that
  back too, first-cancelled first-refunded.
- **Payouts.** A session's status is what Duna Pay reads: a cancelled session
  releases nothing to the club, and a session with a minimum is not delivered
  before it was decided.

## What each person can do

| Who                         | Can                                                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Player or parent            | See the state, the price at each group size and the most they can be charged; book (themselves, a child, or more places); cancel.          |
| Coach (assigned)            | See who is in; mark attendance (from the start until 24 hours after the end, offline marks keep the phone's time); ask the club to cancel. |
| Director (`sessions:write`) | Set the club rule; extend the decision time (players are told; free cancellation moves with it); run anyway.                               |
| Owner (`payments:write`)    | Cancel a session with refunds after a strong confirmation that restates people and refunds.                                                |

Attendance never changes a price, and recording it needs no money permission.

## Settings

| Setting             | Where                                                         | Default                                  |
| ------------------- | ------------------------------------------------------------- | ---------------------------------------- |
| Club booking rule   | Club setup › Booking rules (HQ, PART-6)                       | none until the club sets one             |
| Applies to          | Same                                                          | lessons and clinics (`service`)          |
| Smallest group      | Club rule or the offering's group rule                        | 1 (no minimum)                           |
| Largest group       | The offering's "Players per session"                          | the offering's capacity                  |
| Decision time       | Club rule or offering; falls back to the club's refund window | 24 hours before                          |
| If too small        | Cancel and return, or run anyway                              | run                                      |
| Waitlist            | On or off                                                     | off (presets Small group and Clinic: on) |
| Price by group size | A ladder per offering (credits today)                         | off                                      |

Presets (proposed defaults, not prices): **Private** 1 of 1; **Semi-private** 2
of 2, cancel; **Small group** 3 to 6, cancel, waitlist; **Clinic** 4 to 12,
cancel, waitlist, price ladder on (left empty for the owner). A session that
holds one person never inherits a group rule; a club minimum larger than a small
session becomes "must be full".

Other constants: the waitlist offer hold (2 hours, never past the start,
PART-4), the attendance window (24 hours), the "still needs players" reminder
(24 hours before the decision, once per booking) and the at-risk window (7
days), all in `packages/core/src/participation/policy.ts`.

## Messages Duna writes

Duna writes a notice row for each moment (booked into a session that needs
players, the reminder, confirmed, cancelled, decision moved, place refilled,
refund needs attention, staff cancelled). Each person hears about each moment
once. Sending them on the person's channel is PART-5; until then they are queued
and visible to support in the `participation_notices` table. Messages a person at
the club writes (Nudge, the note on a cancellation) always go through Send
review.

## For support

- "Why was my session cancelled?" The decision is in `participation_decisions`
  (`outcome`, `cancel_reason`, `decided_group_size`) and the audit log.
- "Why did I pay 2 and not 3?" The settlement is in
  `catalog_participation_settlements`; late cancellations and refills are in
  `participation_adjustments`.
- "Why can't I book?" Already booked (decision 5), the session is full, or it
  was cancelled.
- The schedule runs every 5 minutes (`/api/cron/catalog-participation`); its
  `failed` count raises an alert.

## Waitlist, invite links and merging (part 2)

- **Waitlist.** When a session with "waitlist on" is full, players (or a
  parent for a child) join the line. When a place opens (a cancellation, an
  offer nobody took) the first person in line gets an offer that holds the
  place for 2 hours, never past the start; nobody else can book it meanwhile.
  An offer nobody answers passes to the next person. Someone who needs two
  places is never skipped by someone who needs one.
- **Invite links.** An adult who holds a place can share the session. The link
  shows the session, the club, the time and "Needs 2 more", never who booked
  or what they paid. It expires when the session starts. Juniors cannot create
  links; their guardians can. Duna counts opens (and, once checkout passes the
  code, bookings) and nothing about visitors.
- **Merging two thin sessions.** An owner moves everyone from one session into
  another of the same offering after a strong confirmation. Nobody's price can
  go up (Duna refuses a merge that would); each person keeps what they reserved
  and settles at the new group. Someone already booked in both is refunded for
  the first. Moved people are told; the emptied session shows "Cancelled"
  (merged). Directors can merge two thin divisions of an event the same way.

## Event sessions, divisions and pickups

The same engine decides event sessions, divisions (counting teams) and pickups
at their decision time, from the rule on each one. Old settings that never
worked (the HQ "Minimum to run", the event builder's and pickup form's
"Auto-cancel") were mapped to rules that RUN, so nothing anyone booked is
cancelled by this change (decision 7); they appear under "Rules to review"
with Keep or Turn on cancel. New rules set from now on cancel when they say so.
A player hosting a pickup sets its rule themselves. A pickup cancelled under its
minimum is cancelled for everyone with a notice; a paid place in a pickup with
no club is flagged to the host.

## Not built yet

Cancelling event sessions and pickups by hand still uses their own flows;
offers to the waitlist when a club raises a session's capacity; counting
bookings made through an invite link (needs the code at checkout); notice sending
(PART-5); card price ladders and partial refunds (PART-10); every screen
(PART-6 to PART-12).
