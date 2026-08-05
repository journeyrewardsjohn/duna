# Duna HQ organization plans and transaction pricing

## Launch plans

| Customer-facing plan | Internal plan id | Monthly | Annual | Organization fee | Uploaded video / month | Live video / month |
| -------------------- | ---------------- | ------: | -----: | ---------------: | ---------------------: | -----------------: |
| Coach & Organizer    | `coach`          |      $0 |     $0 |               5% |                4 hours |            2 hours |
| Club                 | `small-club`     |    $199 | $1,990 |               0% |              100 hours |           10 hours |
| Facility             | `club`           |    $499 | $4,990 |               0% |              500 hours |           40 hours |
| Network              | `multi-venue`    |    $999 | $9,990 |               0% |            1,000 hours |          100 hours |

Annual pricing is ten months of the monthly rate. Paid tiers include unlimited
staff and player records. Video hours are pooled by organization, and uploaded
video and live broadcasting remain separate monthly meters. Existing recordings
are retained; storage tiering and cold storage are internal COGS controls rather
than customer-facing deletion limits.

## Two independent transaction fees

Every connected card transaction is evaluated against two different rules:

1. The consumer service fee is 7.5% of eligible non-goods purchases. Duna
   Premium and Premium+ waive this fee for the player. Merchandise, wallet loads,
   cash, and organization-credit redemptions are excluded.
2. The organization fee is 5% of the full card-transaction subtotal on the Free
   Coach & Organizer plan, including merchandise. It is charged to the operator
   in addition to card processing. Paid Duna HQ plans default to 0%.

There is no longer a 12–15% Duna-originated coach marketplace fee. Coach-, club-,
and Duna-originated bookings use the same consumer rule and the organization’s
current plan or Super Admin override.

## Stripe Connect behavior

Duna stores fee policy in its database and calculates the current
`application_fee_amount` for every destination charge. The amount includes the
consumer service fee, estimated card-processing fee, and organization fee that
apply to that payment. Split court payments allocate the operator charges across
participant shares; recurring catalog subscriptions use the equivalent Stripe
application-fee percentage.

The effective organization rate, source, plan, and policy version are mirrored
to Accounts v2 metadata for operational visibility. Stripe metadata is not the
entitlement source of truth. If metadata synchronization fails, Super Admin sees
the failure while new payments continue to use the saved Duna policy.

Super Admin may set an organization-specific rate from 0% to 25% or clear the
override to restore the plan default. Every change requires confirmation and a
reason and is written to the audit log.

## Subscription state

Organization software subscriptions use Stripe Prices, Checkout in subscription
mode, the Customer Portal, and webhook-projected state. The platform billing
customer is separate from the organization’s connected payout account. A paid
plan becomes economically effective only while its subscription is `active` or
`trialing`; an incomplete, past-due, or ended subscription receives Free-plan
economics until billing recovers.
