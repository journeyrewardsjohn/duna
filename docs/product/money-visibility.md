# Who sees a club's money (PRIV-2)

The server decides who sees money, using the actor on each request. A screen
that hides a figure is not a control: if the procedure returns it, anyone with
the procedure's scope can read it.

## The rule

Amounts of money that belong to the club or to another person are returned only
to actors with `payments:read` or `payments:write`. That covers:

- money collected, gross and net
- refunds
- order totals and what a person paid
- lifetime spend
- the value of a person's credits
- margins, costs and inventory value
- payouts
- staff pay rates and income goals
- ledger liabilities

For any other actor these fields are **absent** from the answer. The output
schemas mark them optional. A missing figure is never sent as `0`, because a
zero reads as a real number.

Paid **state** has a second tier: whether someone has paid, a team's
`fullyPaid` / `paidPlayers` / roster `paid`, and an attendee's
`paymentStatus`. These are flags and counts, with no amount. They also reach
`payments:collect` roles, because the person taking a payment has to know who
still owes.

**Still visible to everyone who can read the record:**

- public list prices: session price, division entry fee, rate plans, catalog
  prices, plan prices
- credit counts (credits, not money)
- counts of sales

### One helper

`packages/api/src/money-visibility.ts` holds the whole decision:

- `moneyVisibilityFor(actor)` returns `{ amounts, paidState }`.
- `redactMoney(output, value, actor)` removes the paths listed in
  `MONEY_PATHS[output]`.
- `redactMoneyMetrics` drops dashboard figures marked `money: true`.

Procedures call these helpers. None of them decides on its own.

`money-visibility.test.ts` walks each output schema. It fails when a money-like
field (`…Minor`, amount, gross, net, refund, paid, spend, margin, cost, payout,
balance, total…) is in neither `MONEY_PATHS` nor `REVIEWED_VISIBLE_PATHS`. A new
field must be classified before it ships.

## Roles

| Role        | Money amounts | Paid state | Why                                            |
| ----------- | ------------- | ---------- | ---------------------------------------------- |
| Owner       | yes           | yes        | `*`                                            |
| Director    | yes           | yes        | manager + `payments:write`, `payments:collect` |
| Manager     | yes           | yes        | `payments:read`                                |
| Accountant  | yes           | yes        | `payments:read`                                |
| Coach       | no            | yes        | `payments:collect` only                        |
| Front desk  | no            | yes        | `payments:collect` only                        |
| Scorekeeper | no            | no         | no payment scope                               |

### One role table

`packages/api/src/role-scopes.ts` is the only table of what each role may do.
An actor's scopes are its roles' scopes plus the scopes stored on its
memberships.

Before PRIV-2 there was a second, hand-written table:
`scopesForOrganizationStaffRole` in `operator-service.ts`, which writes the
stored scopes. The two tables disagreed:

- The stored coach list lacked `reports:read` and `audiences:*`.
- The stored manager list lacked `payments:read` and `audiences:*`.

The stored list is now derived from the role table. A Director is the manager
role plus `directorExtraScopes`. No role gains or loses a scope: the union
was already the role table, and a test pins each staff role's effective scopes.

## The deliberate exception: the schedule

`operator.schedule` and the other schedule procedures show a booking's total
and paid state to `payments:collect` roles: coach, front desk, and anyone else
with that scope. The front desk taking a payment at the desk needs to see what
is owed.

`canSeeMoney` in `services/schedule/shared.ts` is now
`moneyVisibilityFor(actor).paidState`. That is the same set of roles as
before, neither wider nor narrower.

## What was found and fixed

| Procedure / surface                                        | What leaked to roles without `payments:read`                                                                                                                                                                   | Now                                                |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `operator.sessionDetail` (sessions:read)                   | `finance` (gross, refunded, net, paid orders), attendee `paidMinor` / `refundedMinor`, cancellation preview refund and credit values and order totals, `refundSummary.cashRefundMinor`                         | amounts absent; paid state only for collect roles  |
| `operator.workspace` (sessions:read)                       | product gross / net / COGS / profit / margin, product-customer spend, `lifetimeSpendMinor`, recent purchase amounts, staff hourly rate and income goal, inventory cost and book value, ledger credit liability | absent                                             |
| `operator.activityDetail` (sessions:read)                  | booking total, funded amount, each participant's share                                                                                                                                                         | absent                                             |
| `operator.dashboard` (reports:read, which the coach holds) | "Gross sales" metric                                                                                                                                                                                           | money metrics dropped                              |
| `operator.divisionDetail` (sessions:read)                  | `fullyPaid`, `fullyPaidAt`, `paidPlayers`, roster `paid` (the scorekeeper saw them)                                                                                                                            | paid state only for collect roles; entry fee stays |
| `operator.memberProfile` (members:read)                    | lifetime spend, purchase / refund amounts, credit grant values, purchase amounts in the timeline text                                                                                                          | absent; the timeline text carries no amount        |
| Duna AI context snapshot and knowledge search              | the dashboard's "Gross sales" figure (for any staff actor), plus the workspace money above                                                                                                                     | built from the redacted dashboard and workspace    |

### Clients

- **HQ Events** (`components/events/events-model.ts`, rebuilt in PR 387): the
  Money tab already needed `payments:read`. It now also needs `finance` in the
  answer. Team payment words and attendee "Payment due" appear only with paid
  state, never as a default.
- **HQ activity (`/events/matches/[id]`) and division
  (`/events/[id]/divisions/[id]`) pages:** booked value and paid words render
  only when sent.
- **HQ people and inbox:** use absence, never `0`.
- **Pro startup load** (`src/app/organization-load.ts`): each part loads on
  its own. A FORBIDDEN part is "refused" and the rest loads.
  - Before, a coach's whole organisation load failed because the Money read
    was refused.
  - Money now shows "You don't have access to club money" instead of preview
    figures.
  - A real failure still fails the load.
- **Pro cancel sheet:** says "refunded the way they paid" when amounts are
  absent.

## Found, not changed here (follow-ups)

- **Payment collection results** (`startPaymentCollection`,
  `finalizePaymentCollection`, `recordPaymentEvent`, all `payments:collect`)
  return the collection's application fee, processing fee, commission and net.
  - They are the collector's own transaction and match their earnings, so
    they are left as is.
  - `finalizePaymentCollection` returns any succeeded collection in the
    organisation by id, without checking who started it. It should be scoped
    to the collector.
- **`people.planChangePreview`** (members:read) shows a member's plan charge
  and credit. This is a list price plus a proration, so it was left as is and
  needs review.
- **Payment-rule audiences** (for example lifetime value) list their members
  to `audiences:read` roles, which lets someone infer spend.
- **`trainingDrills.purchases`** (training:read) shows the club's drill
  purchase prices.
- **Platform admin "Gross volume":** intended for platform staff.
