# Schedule: what the front desk can do (SCHED-API)

Dated 28 November 2026. HQ's Schedule (`apps/hq/components/schedule/**`)
shows every court booking, lesson, group session, event and block. This
document is the backend behind its five front-desk actions,
`operator.schedule.*` (shapes in `packages/api/src/contracts/schedule.ts`,
reference in [`docs/API.md`](../API.md)). Group sessions are not handled
here: they keep their own engine and operator actions
([`participation.md`](participation.md)).

## One booking system

The desk writes the same records a player booking writes: `court_bookings`,
`court_booking_participants`, `orders` and `order_items`. Money, the
player's bookings and the calendar therefore all see a desk booking without
anything new.

- **Price.** The court's own rate (`priceCourtRate`, now shared with the
  player checkout). Paid at the desk: the rate alone (cash carries no Duna
  fee, as `operator.fees.quote` says). By a payment link: the rate plus the
  consumer fees the player checkout adds. A different price needs
  `payments:write` and a reason, and writes an audit row. The person sees
  the total first; `expectedTotalMinor` refuses a total that changed.
- **Conflicts.** The one rule is `availabilityFor` from `@duna/scheduling`,
  with the court as the resource: its opening hours (weekly windows in the
  place's time zone, daylight-saving days included), weekly closures,
  one-off blocks and closures, other bookings (with their buffers), sessions
  on the court and court reservations. It runs inside the transaction that
  writes, after the court row is locked, so two desks cannot book the same
  slot; bookings made by players are also stopped by the database's
  `court_bookings_no_overlap` constraint. A court with no opening hours
  stored is open around the clock, as the calendar draws it.
- **Walk-ins.** A walk-in becomes a contact for the booking: an unclaimed,
  private profile with no sign-in and no phone on it. A phone number is kept
  on the booking only if given.

## The five actions

| Action                | What it does                                                                                                                                                                                                                                                   | Who is told                                                                                                                           |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Book a court          | Pay at the desk: confirmed booking, unpaid order (shows as "Unpaid"). Payment link: the court is held for two hours (the split-pay hold) and the booker pays through the existing invitation checkout (`/app/booking-invite/…`); unpaid, it is released. Free. | Nobody. The link is shown to the person at the desk, who hands it over (or drafts it to Inbox).                                       |
| Move a booking        | Re-checks the new slot by the same rule. An unpaid desk order still at the court's rate takes the new slot's rate, only with `confirmedPriceChange`; paid, link, staff-priced and free bookings keep their price. A linked player match moves with it.         | With `notify`: a draft for the booker, invited players and the verified guardians of juniors, as a Concierge Send review. Never sent. |
| Cancel a booking      | The preview says exactly who gets what back; the cancellation runs the same plan. The slot is released; unpaid orders and invitations are cancelled; a linked player match is cancelled with it.                                                               | A draft as above, as a Concierge Send review. Never sent.                                                                             |
| Record a desk payment | Marks the booking's desk order paid (the whole amount due), records how it was paid in an audit row.                                                                                                                                                           | Nobody.                                                                                                                               |
| Remove a block        | A one-off block or closure is removed; a weekly block can be removed for one date, from a date on, or entirely. Opening hours are never removed here.                                                                                                          | Nobody. A closure that sessions or bookings were cancelled under is refused until the person acknowledges that they stay cancelled.   |

A moved booking can be undone by moving it back (the answer carries
`undo`). A move of an hour or more, or to another place, is flagged
`materialChange`: under the refund floor (legal register O10) players may
then ask for a full refund.

## Refunds

`planCourtCancellation` decides, from the booking's own policy snapshot:

- **By policy** (the player asked): inside `refundBeforeHours` before the
  start, every payer gets what they paid back; later, nothing.
- **Full** or **none**: as chosen.
- **The club cancels** (`cause: "club"`): every payer gets their money back in
  full, whatever was chosen (refund floor, legal register O10).

Card money goes back through `refundOrganizationOrder`, the club's refund
path (a refund record, then Duna Pay's funding order). Money paid at the
desk is handed back at the desk: the order is marked refunded and an audit
row records it; Duna moves nothing. Returning money needs `payments:write`;
front desk can cancel bookings that return nothing.

## How desk payments are represented

There is no off-platform representation in the ledger, so none is invented.
Recording a desk payment:

- sets the desk order to `paid`, the booking's funded amount to its total and
  the booker's place to `paid`;
- writes an audit row `court-booking.desk-payment-recorded` (who, when,
  method, amount hash, note);
- writes **no** payment row, **no** ledger journal and **no** Duna Pay
  obligation, so it never reaches payouts, balances or risk rates.

Money shows the order as paid (no processor payment attached); the
calendar's `bookingPayments` read shows it paid. Only the whole amount due
can be recorded: orders have no paid-so-far amount. Gaps for the payments
owner: an off-platform tender in the ledger (cash drawer), part payments,
and a desk payment against a link booking (today: cancel the link and book
at the desk).

## Permissions (existing scopes only)

| Who        | Can                                                                                                                                    |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Front desk | Book, move, cancel (without returning money), record desk payments, remove blocks; sees amounts (`payments:collect`).                  |
| Manager    | Book, move, cancel (without returning money), remove blocks; sees amounts (`payments:read`). No desk payments (no `payments:collect`). |
| Owner      | Everything, including staff prices, free bookings of paid time and refunds.                                                            |
| Coach      | Reads; checks people in on their own sessions (`recordSessionAttendance`). Cannot book or change bookings.                             |

Another club's courts, bookings, blocks and people answer "not found".

## What it does not do

It sends nothing, charges no card, moves no Duna Pay balance, books no
lessons (coach lessons stay with sessions), and does not restore sessions
cancelled under a closure that is removed.

## SCREEN SWITCH

`apps/hq/components/schedule/schedule-capabilities.ts` turns each feature on
when its path exists. This pull request adds all five, so it must land with
the HQ wiring below, never alone.

| Switch          | Procedure                               | HQ's action must call                                                                                                                                                                                |
| --------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createBooking` | `operator.schedule.createCourtBooking`  | `createCourtBookingPreview` when the sheet opens (conflicts, price), then `createCourtBooking` with `expectedTotalMinor`; show `paymentLink.url` when returned.                                      |
| `moveBooking`   | `operator.schedule.moveCourtBooking`    | `moveCourtBookingPreview` on drop (who is told, price), then `moveCourtBooking` with its `previewToken`, `notify` and `confirmedPriceChange` when `requiresPriceConfirmation`; Undo moves to `undo`. |
| `cancelBooking` | `operator.schedule.cancelCourtBooking`  | `cancelCourtBookingPreview` for the refund choice, then `cancelCourtBooking` with `confirmed: true` and its `previewToken`; open `conciergeDraft` in Inbox.                                          |
| `deskPayment`   | `operator.schedule.recordDeskPayment`   | With the order's whole amount (from `bookingPayments`), `confirmed: true`.                                                                                                                           |
| `removeBlock`   | `operator.schedule.removeCalendarBlock` | `removeCalendarBlockPreview` (list `cancelledUnder`), then `removeCalendarBlock` with `scope`, `date` for weekly blocks and `acknowledgeCancelled` when needed.                                      |

Also for HQ: coaches' availability in one call is
`operator.teamAvailability.range({ from, to })` (replaces the per-coach loop
in `coachAvailabilityAction`; its answer is already `availabilityFor`
input), money per booking is `operator.schedule.bookingPayments`, and the
server also treats weekly `blocked` / `maintenance` windows as closures
(the screen's `courtAvailabilityInputs` does not yet).
