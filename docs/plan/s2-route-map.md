# S2 route map: HQ moves to the Tideline 4.1.1 information architecture

Work package S2 (see [`web-hq-backend.md`](web-hq-backend.md) §4) moves every
HQ page to the address in
[`docs/design/tideline-4.1.1/ia-hq.md`](../design/tideline-4.1.1/ia-hq.md).
This is a structural change only: each page keeps its current look at its new
address. The shell (S1), the object sub-navigation (S3) and the new screens
(H1–H14) build on this route tree.

The single source of truth for every HQ address is
[`packages/core/src/hq-routes.ts`](../../packages/core/src/hq-routes.ts)
(`@duna/core/hq-routes`). New code builds paths with `hqHref(name, params)`
instead of string literals.

No club is live, so old addresses are **not** kept as aliases: an old
bookmark answers 404. Addresses registered with outside providers did not
change (see the last section).

## Counts

| Outcome  | Count | Meaning                                                                                         |
| -------- | ----: | ----------------------------------------------------------------------------------------------- |
| Moved    |    29 | Page files at a new address (`git mv`).                                                         |
| Moved    |     4 | List pages served by `/[module]` or a new page: `calendar`, `members`, `products`, `locations`. |
| Merged   |     2 | `/leagues` (module slug) and `/leagues/create` (a page that only redirected): now Events.       |
| Stayed   |    35 | Page files at the same address (includes the 7 Super Admin pages and `/[module]`).              |
| New      |     1 | `/setup/places`: the venue list, which used to be the `/locations` module page.                 |
| Awaiting |     4 | Still served (counted above too) until the named package gives it a home: see below.            |

The map holds 65 page templates before and after S2 (minus `/leagues/create`,
plus `/setup/places`). Awaiting: `/activities` and `/programs` (B4 removes
them), `/events/types/[eventType]` and `/offerings/types/[productType]` (H9
turns them into in-page filters).

## Navigation (sidebar), in IA order

| Group           | Item       | Address      | Icon (`@duna/ui/icons`) |
| --------------- | ---------- | ------------ | ----------------------- |
| Run the day     | Today      | `/`          | `home`                  |
| Run the day     | Schedule   | `/schedule`  | `schedule`              |
| Run the day     | Inbox      | `/inbox`     | `message`               |
| People and play | People     | `/people`    | `users`                 |
| People and play | Team       | `/team`      | `partner`               |
| People and play | Training   | `/training`  | `coach`                 |
| People and play | Events     | `/events`    | `trophy`                |
| People and play | Offerings  | `/offerings` | `pass`                  |
| Money and setup | Money      | `/money`     | `pay`                   |
| Money and setup | Club setup | `/setup`     | `venue`                 |
| Grow            | Website    | `/website`   | `connect`               |
| Grow            | Marketing  | `/marketing` | `send`                  |
| Grow            | Reports    | `/reports`   | `signal-line`           |

There is no "More tools" entry and there are no sidebar children. Settings
and the personal account stay in the account menu, Ask Duna stays in the
shell, and Super Admin keeps its own link and navigation. The old Offerings
and Events children (service / plan / goods, tournaments / clinics / open play
/ pickup / leagues) are now a row of type links inside the Offerings and
Events list pages, so every type page stays reachable until H9 turns them
into in-page filters.

## Every HQ page

`[module]` means the page is served by `apps/hq/app/[module]/page.tsx` with
that slug. Names are the keys in `hqRoutes`.

### Run the day

| Old address                | New address                | Outcome | Name (`hqRoutes`) | Reason                                                               |
| -------------------------- | -------------------------- | ------- | ----------------- | -------------------------------------------------------------------- |
| `/`                        | `/`                        | Stayed  | `home`            | IA: Today.                                                           |
| `/calendar` (`[module]`)   | `/schedule` (`[module]`)   | Moved   | `module`          | IA: Schedule (R2 proposal). Module slug `calendar` → `schedule`.     |
| `/messages`                | `/inbox`                   | Moved   | `inbox`           | IA: Inbox (R2 proposal).                                             |
| `/messages/create`         | `/inbox/create`            | Moved   | `inboxCreate`     | Follows Inbox; still forwards to `/inbox?compose=new`.               |
| `/activities`              | `/activities`              | Stayed  | `activities`      | **Awaiting B4.** IA retires it (redirect to `/events`); B4 drops it. |
| `/ask/[[...conversation]]` | `/ask/[[...conversation]]` | Stayed  | `ask`             | IA: the panel stays; `/ask` stays for full-screen use.               |

### People and play

| Old address                                  | New address                        | Outcome | Name                 | Reason                                                           |
| -------------------------------------------- | ---------------------------------- | ------- | -------------------- | ---------------------------------------------------------------- |
| `/members` (`[module]`)                      | `/people` (`[module]`)             | Moved   | `module`             | IA: People. Module slug `members` → `people`.                    |
| `/members/invite`                            | `/people/invite`                   | Moved   | `memberInvite`       | Follows People.                                                  |
| `/members/[personId]`                        | `/people/[personId]`               | Moved   | `member`             | IA: `/people/[id]`.                                              |
| `/members/[personId]/health`                 | `/people/[personId]/health`        | Moved   | `memberHealth`       | Follows the member page (S3 turns it into a tab).                |
| `/team` (`[module]`)                         | `/team` (`[module]`)               | Stayed  | `module`             | IA: Team (label was "Staff").                                    |
| `/team/invite`                               | `/team/invite`                     | Stayed  | `teamInvite`         |                                                                  |
| `/team/[personId]`                           | `/team/[personId]`                 | Stayed  | `teamMember`         | IA: `/team/[id]`.                                                |
| `/training` and its 9 sub-pages              | unchanged                          | Stayed  | `training*`          | IA: Training.                                                    |
| `/programs`                                  | `/programs`                        | Stayed  | `programs`           | **Awaiting B4.** IA drops it in favour of `/training/programs`.  |
| `/events` (`[module]`)                       | `/events` (`[module]`)             | Stayed  | `module`             | IA: Events.                                                      |
| `/events/create`                             | `/events/create`                   | Stayed  | `eventCreate`        |                                                                  |
| `/events/[sessionId]`                        | `/events/[sessionId]`              | Stayed  | `event`              |                                                                  |
| `/events/[sessionId]/divisions/[divisionId]` | unchanged                          | Stayed  | `eventDivision`      |                                                                  |
| `/events/court-bookings/[activityId]`        | unchanged                          | Stayed  | `eventCourtBooking`  |                                                                  |
| `/events/matches/[activityId]`               | unchanged                          | Stayed  | `eventMatch`         |                                                                  |
| `/events/types/[eventType]`                  | `/events/types/[eventType]`        | Stayed  | `eventType`          | **Awaiting H9** (type filters inside the Events page).           |
| `/leagues` (`[module]`)                      | `/events?type=league` (`[module]`) | Merged  | `hqLeaguesPath`      | IA: a league is an event type (R2 proposal). Same leagues panel. |
| `/leagues/create`                            | `/events/create?type=league`       | Merged  | —                    | The page only redirected there. Page file deleted.               |
| `/products` (`[module]`)                     | `/offerings` (`[module]`)          | Moved   | `module`             | IA: Offerings. Module slug `products` → `offerings`.             |
| `/products/create`                           | `/offerings/create`                | Moved   | `offeringCreate`     |                                                                  |
| `/products/[itemId]`                         | `/offerings/[itemId]`              | Moved   | `offering`           | IA: `/offerings/[id]`.                                           |
| `/products/[itemId]/builder`                 | `/offerings/[itemId]/builder`      | Moved   | `offeringBuilder`    |                                                                  |
| `/products/[itemId]/draft-ready`             | `/offerings/[itemId]/draft-ready`  | Moved   | `offeringDraftReady` |                                                                  |
| `/products/types/[productType]`              | `/offerings/types/[productType]`   | Moved   | `offeringType`       | **Awaiting H9** (type filters inside the Offerings page).        |

### Money and setup

| Old address                              | New address                                | Outcome | Name                  | Reason                                                                                              |
| ---------------------------------------- | ------------------------------------------ | ------- | --------------------- | --------------------------------------------------------------------------------------------------- |
| `/payments`                              | `/money`                                   | Moved   | `money`               | IA: Money (R2 proposal).                                                                            |
| `/payments/transactions`                 | `/money/transactions`                      | Moved   | `moneyTransactions`   | IA SectionNav: Transactions.                                                                        |
| `/payments/transactions/[transactionId]` | `/money/transactions/[transactionId]`      | Moved   | `moneyTransaction`    |                                                                                                     |
| `/payments/payout-settings`              | `/money/payouts`                           | Moved   | `moneyPayouts`        | IA SectionNav names it "Payouts".                                                                   |
| `/payments/setup`                        | `/money/setup`                             | Moved   | `moneySetup`          | IA SectionNav: Duna Pay setup.                                                                      |
| `/payments/refund-policies`              | `/money/refund-policies`                   | Moved   | `moneyRefundPolicies` | IA SectionNav: Refund policies.                                                                     |
| `/payments/disputes`                     | `/money/disputes`                          | Moved   | `moneyDisputes`       | IA SectionNav: Disputes.                                                                            |
| `/setup`                                 | `/setup`                                   | Stayed  | `setup`               | IA: Club setup › Overview (label was "Get started").                                                |
| `/onboarding`                            | `/setup/start`                             | Moved   | `setupStart`          | IA: Club setup › first run (R2 proposal). Proxy sends a signed-in person with no organisation here. |
| `/onboarding/complete`                   | `/setup/start/complete`                    | Moved   | `setupStartComplete`  | Follows the first run; still lands on `/setup`.                                                     |
| `/locations` (`[module]`)                | `/setup/places`                            | Moved   | `places`              | IA: Club setup › Places and courts (R2 proposal). New page file that renders the same venues panel. |
| `/locations/create`                      | `/setup/places/create`                     | Moved   | `placeCreate`         |                                                                                                     |
| `/locations/[venueId]`                   | `/setup/places/[venueId]`                  | Moved   | `place`               | IA: `/setup/places/[id]`.                                                                           |
| `/locations/[venueId]/layout`            | `/setup/places/[venueId]/layout`           | Moved   | `placeLayout`         |                                                                                                     |
| `/locations/[venueId]/courts/create`     | `/setup/places/[venueId]/courts/create`    | Moved   | `placeCourtCreate`    |                                                                                                     |
| `/locations/[venueId]/courts/[courtId]`  | `/setup/places/[venueId]/courts/[courtId]` | Moved   | `placeCourt`          |                                                                                                     |
| `/settings/theme`                        | `/setup/identity`                          | Moved   | `setupIdentity`       | IA: theme → Club setup (R2 proposal).                                                               |
| `/settings`                              | `/settings`                                | Stayed  | `settings`            | IA: opens from the account menu, not the sidebar.                                                   |
| `/stripe/return`                         | `/stripe/return`                           | Stayed  | `stripeReturn`        | Duna Pay return and refresh address given to Stripe. It now forwards to `/money?stripe=…`.          |

### Grow

| Old address               | New address                         | Outcome | Name                      | Reason                                                                   |
| ------------------------- | ----------------------------------- | ------- | ------------------------- | ------------------------------------------------------------------------ |
| `/website`                | `/website`                          | Stayed  | `website`                 | IA: Website.                                                             |
| `/marketing` (`[module]`) | `/marketing` (`[module]`)           | Stayed  | `module`                  | IA: Marketing.                                                           |
| `/marketing/create`       | `/marketing/create`                 | Stayed  | `marketingCreate`         |                                                                          |
| `/audiences`              | `/marketing/audiences`              | Moved   | `marketingAudiences`      | IA: Marketing › Audiences (R2 proposal).                                 |
| `/audiences/create`       | `/marketing/audiences/create`       | Moved   | `marketingAudienceCreate` |                                                                          |
| `/audiences/[audienceId]` | `/marketing/audiences/[audienceId]` | Moved   | `marketingAudience`       |                                                                          |
| `/promo-codes`            | `/marketing/promo-codes`            | Moved   | `marketingPromoCodes`     | IA: Marketing › Promo codes (R2 proposal). Q1 fixes the demo-mode crash. |
| `/reports` (`[module]`)   | `/reports` (`[module]`)             | Stayed  | `module`                  | IA: Reports.                                                             |

### Account, Super Admin and the generic pages

| Address                                 | Outcome | Name                   | Reason                                                                |
| --------------------------------------- | ------- | ---------------------- | --------------------------------------------------------------------- |
| `/account`                              | Stayed  | `account`              | IA: Shell › your name.                                                |
| `/[module]`                             | Stayed  | `module`               | Serves schedule, people, team, events, offerings, marketing, reports. |
| `/admin`                                | Stayed  | `admin`                | IA: Admin unchanged.                                                  |
| `/admin/ask-duna`                       | Stayed  | `adminAskDuna`         |                                                                       |
| `/admin/messaging-safety`               | Stayed  | `adminMessagingSafety` |                                                                       |
| `/admin/organizations/[organizationId]` | Stayed  | `adminOrganization`    |                                                                       |
| `/admin/support`                        | Stayed  | `adminSupport`         |                                                                       |
| `/admin/video`                          | Stayed  | `adminVideo`           |                                                                       |
| `/admin/[module]`                       | Stayed  | `adminModule`          |                                                                       |
| `/tideline/**`                          | Stayed  | — (dev only)           | Gallery behind `TIDELINE_GALLERY=1`; excluded from the map.           |

## Module slugs served by `/[module]`

| Old slug    | New slug    | Note                                                     |
| ----------- | ----------- | -------------------------------------------------------- |
| `calendar`  | `schedule`  |                                                          |
| `members`   | `people`    |                                                          |
| `products`  | `offerings` |                                                          |
| `team`      | `team`      |                                                          |
| `events`    | `events`    | `?type=league` shows the leagues panel (was `/leagues`). |
| `marketing` | `marketing` |                                                          |
| `reports`   | `reports`   |                                                          |
| `locations` | —           | Now its own page at `/setup/places`.                     |
| `leagues`   | —           | Now `/events?type=league`.                               |

The internal navigation ids follow the new names too (`today`, `schedule`,
`inbox`, `people`, `offerings`, `money`, `places`, `ask`); `overview`,
`calendar`, `members`, `messages`, `products`, `payments`, `locations`,
`leagues`, `promo-codes`, `audiences` and `ai` are gone as ids.

## Routes that are not pages

| Address                | Outcome | Reason                                               |
| ---------------------- | ------- | ---------------------------------------------------- |
| `/sign-in`, `/sign-up` | Stayed  | Identity chrome stays (owner).                       |
| `/auth/callback`       | Stayed  | WorkOS redirect URI registered with WorkOS.          |
| `/api/**`              | Stayed  | Route handlers, including Stripe and cron endpoints. |

## Addresses registered with outside providers

None changed.

- WorkOS redirect URI `/auth/callback`: unchanged. After sign-in a person
  without an organisation is now sent to `/setup/start` (was `/onboarding`);
  that is our own redirect, not a registered address.
- Stripe Connect account-link `return_url` and `refresh_url` are
  `/stripe/return?…` (built per request in `apps/hq/app/actions.ts`):
  unchanged. Only its in-product forward moved from `/payments?stripe=…` to
  `/money?stripe=…`.
- Stripe Checkout and billing-portal return addresses built by
  `packages/api` that point at HQ pages were updated to the new pages; they
  are passed per request, never registered.
- Webhooks are under `/api/**` and did not move.

## Demo-mode status

Every address in the map is opened by `tests/e2e/hq-route-walk.spec.ts`.
Pages that already fail in demo mode on `main` are marked there with the
package that fixes them; see that file for the current list.
