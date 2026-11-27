# HQ information architecture

Sources: the owner's navigation decision (wins), HQ canvas `IA-Map` (Proposed
4.1), Tideline 4.1.1 `HQShell` / `HQSidebar` / `ObjectHeader` / `SubNav` /
`SectionNav`, and the S2 package in
[`docs/plan/web-hq-backend.md`](../../plan/web-hq-backend.md). S2 owns the
route moves; S1 owns the shell; S3 owns the object pattern.

## The shell

- **Sidebar** (`HQSidebar`): white (`surface`) with a 1 px `line` hairline on
  its trailing edge. The logo row is the top bar's height (56 px) with the
  `DunaMark` aligned to the nav icons. Club (organisation) switcher at the top;
  account at the foot. Selected item: ink, weight 600, on the neutral wash
  (`#eceef0` light / `#22343f` dark), never a Night Court pill. Modes:
  expanded 248 px, collapsed 64 px (tablet default), narrow (menu button and
  drawer). Groups are separated by hairlines; quiet group labels are optional.
- **Navigation** (Owner, in this order, groups separated by `·`):

  | Group           | Items                                     |
  | --------------- | ----------------------------------------- |
  | Run the day     | Today, Schedule, Inbox                    |
  | People and play | People, Team, Training, Events, Offerings |
  | Money and setup | Money, Club setup                         |
  | Grow            | Website, Marketing, Reports               |

  There is **no "More tools"** entry and no sidebar children (the old Products
  and Events children become filters inside the page). Settings and the
  personal account open from the account row at the foot of the sidebar.

- **Ask Duna** (`AskDunaButton`): a fixed Night Court button in the top bar
  (⌘J anywhere) that opens a docked panel which pushes the content (Tideline
  4.1.1; replaces the floating / sidebar Ask Duna and the superseded `A-Dock`
  board). It proposes; a person confirms every change.
- **Top bar**: breadcrumb, search, Ask Duna, notifications.
- **Identity chrome stays** (Owner): sign-in, sign-up, the organisation switcher
  with "Create new organisation", and the personal account are restyled, never
  removed. The same holds in Pro, Player and web.
- Admin (`/admin/*`, Duna staff only) keeps its own navigation and is not in
  the operator sidebar.

## Sub-navigation: one pattern per kind of page

| Kind of page        | Pattern                              | Used by                                                                     |
| ------------------- | ------------------------------------ | --------------------------------------------------------------------------- |
| An open object      | `ObjectHeader` + `SubNav`            | Member, team member, program, event, offering, venue, court, drill, website |
| An area of settings | `SectionNav` (list left, form right) | Club setup, Money, Settings                                                 |
| A list              | Page header + filters in the page    | Today, Schedule, People, Offerings, Events                                  |

- `ObjectHeader`: back link, the object's mark, **the one Jost title on the
  screen**, a Draft / Live / Archived chip, facts, one primary action,
  overflow.
- `SubNav`: tab links with counts, `aria-current="page"`, `data-nav-id`; past
  six items the rest go under "More" (a menu inside the object, not a sidebar
  entry); never a third sidebar. Tabs are routes (deep-linkable), implemented
  as route-group layouts such as `/people/[id]/(tabs)` and `/team/[id]/(tabs)`.
- `SectionNav`: grouped list with a completion mark per item (done, in
  progress, not started, needs attention) and optional progress.
- Retired patterns: sidebar children (Products, Events), button tabs (Venue,
  Court, Training), anchor links (Member), route tabs (Money), the state-driven
  Settings nav.

## Page groups, new homes and routes

"Plan" means the move is stated in the web/HQ plan (S2, B4) or the `IA-Map`
board. "R2 proposal" paths are proposed here so S2 has a default; S2 may
change a proposed path only by recording why in its PR. The plan's rule: rename
**without aliases**, except a handful of proxy redirects for bookmarks; update
absolute HQ paths in `packages/api`, Stripe return/refresh URLs, WorkOS
redirects and the e2e/visual manifests in the same PR.

| Today in code (label · route)                                                           | New home                                | New route                                            | Source            | Sub-navigation                                                                                          |
| --------------------------------------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------- |
| Today · `/`                                                                             | Today                                   | `/`                                                  | IA-Map            | —                                                                                                       |
| Get started · `/setup`                                                                  | Club setup › Overview                   | `/setup`                                             | IA-Map            | Readiness list on the Club setup home                                                                   |
| Onboarding · `/onboarding`                                                              | Club setup › first run                  | `/setup/start` (R2 proposal)                         | IA-Map            | "Your club's website" → Duna reads it → review                                                          |
| Schedule · `/calendar`                                                                  | Schedule                                | `/schedule` (R2 proposal; label already Schedule)    | IA-Map            | Day / week, by court, by coach                                                                          |
| Activities · `/activities`                                                              | Removed                                 | redirect to `/events`                                | Plan (B4), IA-Map | Its cards already have homes                                                                            |
| People · `/members`, member page                                                        | People                                  | `/people`, `/people/[id]`                            | Plan (S3)         | Member: Overview, Bookings, Payments, Notes, Health                                                     |
| Inbox · `/messages`                                                                     | Inbox (Concierge threads)               | `/inbox` (R2 proposal)                               | IA-Map            | Thread filters                                                                                          |
| Staff · `/team`                                                                         | Team                                    | `/team`, `/team/[id]`                                | Plan (S3), IA-Map | Person: Overview, Availability, Compensation, Schedule, Pay                                             |
| Training · `/training`                                                                  | Training                                | `/training`                                          | IA-Map            | Today, Programs, Practice plans, Drill library, Insights (Calendar folds into each program's Schedule)  |
| Programs & camps · `/programs`                                                          | Training › Programs (+ linked offering) | dropped; `/training/programs`                        | Plan (B4)         | Program: Overview, Schedule, Roster, After practice                                                     |
| Products · `/products` (+ type children)                                                | Offerings                               | `/offerings`, `/offerings/[id]`                      | Plan, IA-Map      | Type filters (lessons, memberships, packs, shop); object SubNav                                         |
| Events · `/events` (+ type children)                                                    | Events                                  | `/events`, `/events/[id]`                            | IA-Map            | Event: Entries, Divisions, Schedule, Money, Details                                                     |
| Leagues · `/leagues`                                                                    | Events (a league is an event type)      | `/events?type=league` (R2 proposal)                  | IA-Map            | as Events                                                                                               |
| Venues · `/locations` › venue › courts › layout                                         | Club setup › Places and courts          | `/setup/places`, `/setup/places/[id]` (R2 proposal)  | IA-Map            | Venue/court: Overview, Courts, Layout, Hours                                                            |
| Money · `/payments` (Balance, Transactions, Disputes, Payout settings, Refund policies) | Money                                   | `/money` (R2 proposal)                               | IA-Map            | `SectionNav`: Overview, Transactions, Payouts, Duna Pay setup, Tax, Refund policies, Disputes, Team pay |
| Website · `/website`                                                                    | Website                                 | `/website`                                           | IA-Map            | Site, Changes, Capabilities, Connectors, Insights, Domain and hosting                                   |
| Marketing · `/marketing`                                                                | Marketing                               | `/marketing`                                         | IA-Map            | Campaigns, Audiences, Promo codes                                                                       |
| Audiences · `/audiences`                                                                | Marketing › Audiences                   | `/marketing/audiences` (R2 proposal)                 | IA-Map            | —                                                                                                       |
| Promo codes · `/promo-codes`                                                            | Marketing › Promo codes                 | `/marketing/promo-codes` (R2 proposal)               | IA-Map            | Also reachable from an offering                                                                         |
| Reports · `/reports`                                                                    | Reports                                 | `/reports`                                           | IA-Map            | —                                                                                                       |
| Settings · `/settings`, `/settings/theme`                                               | Settings + Club setup                   | `/settings`; theme → `/setup/identity` (R2 proposal) | IA-Map            | Settings: plan and billing, roles, notifications, integrations (`SectionNav`)                           |
| Account · `/account`                                                                    | Shell › your name                       | `/account`                                           | IA-Map            | —                                                                                                       |
| Ask Duna · sidebar link, `/ask`                                                         | Shell (top-bar button, ⌘J)              | panel; `/ask` stays for full-screen use              | 4.1.1             | —                                                                                                       |
| Admin · `/admin/*`                                                                      | Unchanged                               | `/admin/*`                                           | IA-Map            | Admin navigation                                                                                        |

Rules for S2: every path in `packages/core/src/hq-routes.ts` returns 200 in demo
mode; a grep shows no old path in `apps/hq`, `packages/api` or `tests/e2e`;
Stripe Connect return/refresh URLs and WorkOS redirects still work;
`/sign-in`, `/sign-up`, the WorkOS hand-off into the first run (wherever it
now lives) and the organisation switcher keep working end to end.
