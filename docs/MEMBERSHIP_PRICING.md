# Duna player membership and pricing

## Launch plans

| Plan     | Monthly | Annual | Uploaded video / month | Live broadcasting / month | Duna service fee           |
| -------- | ------: | -----: | ---------------------: | ------------------------: | -------------------------- |
| Free     |      $0 |     $0 |                4 hours |                   0 hours | 7.5% on eligible purchases |
| Premium  |   $9.99 |    $99 |                8 hours |                   2 hours | Waived                     |
| Premium+ |  $29.99 |   $299 |               30 hours |                   8 hours | Waived                     |

Annual pricing includes roughly two free months. Uploaded-video and live-broadcast
allowances are separate meters and reset at the beginning of each UTC calendar
month. Existing videos remain in the member's library; storage class and cold
archiving are internal cost controls rather than a customer-facing deletion
clock.

### Premium

- No Duna service fees on eligible purchases.
- 8 hours of uploaded video and 2 hours of native live broadcasting each month.
- Cloud video library, shareable clips, full rating history, and partner insights.

### Premium+

- Everything in Premium.
- 30 hours of uploaded video and 8 hours of native live broadcasting each month.
- Advanced video insights and priority processing.

## Transaction-fee rules

Duna charges a 7.5% service fee on eligible card transactions for court
bookings, event registrations, tickets, club or event memberships, and packages.
Premium and Premium+ waive that Duna fee. Merchandise, pay-in-person purchases,
organization-credit redemptions, and wallet funding are excluded; taxes and
third-party payment processing are not Duna membership fees and are not
represented as waived. For recurring organization plans, the service-fee line
recurs with the plan unless it was waived at checkout.

## Launch guardrails

- A player-specific Super Admin policy can override either monthly video meter.
- Global Super Admin settings are safety ceilings, not the source of plan
  allowances.
- Legacy `duna-plus-*` Stripe tiers map to Premium so existing subscriptions keep
  working.
- Additional upload or live-hour blocks are deliberately deferred until real
  utilization and provider costs show where demand clusters.
