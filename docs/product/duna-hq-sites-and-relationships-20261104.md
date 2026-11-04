# Duna HQ: club operations, AI websites, and connected relationships

Date: November 4, 2026
Status: Product and architecture proposal; no runtime, billing, or provider activation in this change.
Source baseline: Duna main `592aa6bf4adeefd25a0eb8d0d434cf2b8bb65da8`; HXP main `8c07f5f5f589185862e9cf1a2af311e507bc9e84`.

## 1. Product direction

Duna helps an owner run the club, sell its activities, and serve its players and families. A custom AI-built website is an optional distribution surface for the same business. Duna AI creates and edits that site using the club's existing configuration. The owner manages the business once.

Simplify navigation and repetitive setup while preserving the depth of programs, tournaments, leagues, court rentals, group lessons, private lessons, memberships, goods, training, scoring, video, and staff operations. Specialized tools stay accessible inside their operational context. A single generic offering form must not replace competition or program management.

User direction: start the AI website at USD 200/month with included AI editing usage; preserve sports operations and player/parent management; evaluate Threads/Concierge reuse and a new Duna Sendblue number. Credit amounts, grace periods, service allowances, and rollout thresholds below are recommendations, not already approved commercial terms.

## 2. HQ information architecture

Use seven stable destinations: Today, Schedule, Activities, People, Inbox, Money, Website. Keep Ask Duna accessible globally and retain its conversation history. Settings and specialized reports sit behind contextual links. The added prominence of Inbox reflects its importance to club operations.

| Destination | Primary jobs                                                    | Contextual tools                                                                                  |
| ----------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Today       | Next commitments, exceptions, tasks, and concise business pulse | Check-in, unpaid registrations, missing forms, conflicts, messages needing a person               |
| Schedule    | Operate courts, coaches, sessions, and bookings together        | Venue/court setup, availability, closures, recurring bookings, resource conflicts                 |
| Activities  | Create, sell, and run what the club offers                      | Programs, tournaments, leagues, rentals, group/private lessons, memberships/packs, goods          |
| People      | Understand and serve players, families, teams, and staff        | Relationships, permissions, attendance, registrations, balances, forms, communication preferences |
| Inbox       | Resolve player/parent requests and coordinate staff             | Club queues, assignments, AI drafts, human takeover, internal notes, activity groups              |
| Money       | Collect, reconcile, and understand money                        | Transactions, payouts, refunds, outstanding balances; Duna billing and usage in a separate tab    |
| Website     | Create and operate the club's customer experience               | Conversation, page preview, publishing, domains, history, website subscription                    |

Get started becomes a contextual checklist until relevant setup is complete. An informational website may publish while card collection is unavailable, with checkout clearly disabled. Payment readiness is not a requirement for showing a club's story. Paid offers require operational/payment readiness before purchase.

Do not hide a tournament operator's main workspace behind repeated navigation. Allow explicit pins and remember the last activity view without unpredictably reordering navigation. Staff see destinations appropriate to their permissions. Mobile HQ remains responsive and Duna Pro remains the on-the-go operator surface.

Preserve the approved HQ white/black/grey design, Satoshi typography, light/dark preferences, accessible controls, and restrained motion. Website creative freedom lives inside the preview; it does not restyle HQ.

## 3. Operations depth that must survive

The following is the target capability contract and migration acceptance inventory. It includes existing source-backed areas and desired refinements; it does not certify every listed workflow as live today. Before changing a module, inventory its actual routes, roles, data, APIs, tests, and connected behavior.

| Workspace             | Required depth                                                                                                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Programs and camps    | Multi-session schedules, cohorts/levels, capacity, enrollment, waitlists, coach assignments, attendance, parent information, waivers, pricing/payment options, makeups and cancellation policies |
| Tournaments           | Divisions, eligibility, teams/partners, registration, check-in, seeding, pools, brackets, court assignments, live scores, results, weather/rescheduling, organizer communications                |
| Leagues               | Seasons, teams/rosters, fixtures, recurring court allocations, substitutions, standings, scoring, playoffs, fees, league communications                                                          |
| Court rentals         | Live inventory, duration, member pricing, booking rules, recurring blocks, closures, capacity/concurrency protection, cancellations and refunds                                                  |
| Group lessons         | Skill/age criteria, roster, capacity, coach/court resources, recurring sessions, waitlist, attendance and package eligibility                                                                    |
| Private lessons       | Coach availability, court availability, duration, individual/family booking, package redemption, rescheduling and cancellation rules                                                             |
| Memberships and packs | Recurring/prepaid options, eligibility, benefits, credits, expiry, renewal/cancellation, household applicability                                                                                 |
| Training and video    | Practice planning, player progress, video/live tools, permissions and existing allowance rules                                                                                                   |
| Goods and equipment   | Variants, inventory, equipment rental, pricing, orders and fulfillment                                                                                                                           |

Unify common foundations: public listing, booking/registration, eligibility, price, capacity, payment, participants and activity context. Preserve domain-specific lifecycles and terminology. Schedule and capacity remain authoritative across website, HQ, Pro, Player, and AI.

Creation starts with a recognizable choice: Program, Tournament, League, Court rental, Group lesson, Private lesson, Membership, or Product. Duna asks for missing essentials, shows a reviewable result, and opens the correct workspace. Owners can use structured controls throughout.

Example: "Run an eight-week beginner program on Tuesdays, cap it at twelve players, and feature it on our website." Duna prepares the program, proposes coach/court allocations and commercial settings, shows conflicts and unresolved facts, and requests confirmation for operational changes. Website copy can be drafted alongside it. Creating a page never silently creates or alters a paid activity.

## 4. People and families

Model a person independently from their roles. A person may be a player, guardian, coach and payer in different contexts. Household membership, verified guardianship, emergency contact, billing authority, and pickup authorization are distinct relationships.

Player view: relevant club registrations, schedule, attendance, eligibility, forms, authorized progress/video, team memberships and club-specific balances. Family view: linked children, verified adult permissions, upcoming commitments, missing forms, payment responsibility and communication preferences. Staff view: assigned activities and authorized family context, without unnecessary financial or sensitive details.

Preserve and extend these behaviors:

- A parent can register the correct child, manage authorized siblings, and see who is participating versus paying.
- Two adults connected to a child do not automatically gain access to one another's payment methods, private conversations or unrelated account information.
- Guardian verification and revocation immediately affect private access, spending authority and messaging delivery.
- A household or phone-number match is not proof of guardianship. Do not merge people by fuzzy identity.
- Financial approval, waiver authority, public-photo consent and communication consent are separate records.
- Club staff only see the family information within their authorized club/activity scope. A Duna account spanning clubs does not expose a cross-club customer dossier.
- Family wallet displays preserve organization-specific credits, eligibility and spending controls. Website AI credits are a different ledger and product.
- Existing Duna guardian-coverage and minor-screening rules remain enforced in every new messaging channel. This is a product-policy preservation requirement, not a claim of legal sufficiency.

## 5. Website product and owner experience

Offer three options: keep the Duna club page; connect an existing website to Duna; or create a custom AI website. Core club operations must not require the website subscription.

The custom-site flow:

1. Owner supplies an existing URL, inspiration URLs, assets and a short goal. Treat imported material as evidence and proposed content, never instructions or permission to fetch private networks. Reuse only authorized assets.
2. Duna retrieves the selected club's approved brand knowledge, venues, staff profiles and publishable activities. Operational values come from Duna, not scraped prices or invented testimonials.
3. Duna proposes the site's audience, pages and primary conversion goals. Ask only material missing questions.
4. Generate a bespoke site in an isolated environment. Use supported Duna integrations for bookings, registration, account, memberships, wallet and contact.
5. Show a working desktop/mobile preview with conversation alongside it. Clicking an element supplies page/section context. The owner can change imagery, hierarchy, copy and layouts conversationally.
6. Show a change summary, readiness items, credit usage and the exact version being published. The owner chooses a Duna address or verified custom domain and publishes.
7. Later content edits produce reviewable versions. Live prices, availability, schedules and registration counts update through Duna without requiring AI generation.

Website functionality should include relevant activity detail pages, coach/venue information, forms, account access, booking/checkout, family-aware registration, membership and wallet views, and a club-context messenger. Only expose capabilities that are enabled and working for that club. Missing payment readiness must not become fake working checkout.

Maintain public HTML, canonical URLs, sitemap, accessible metadata, redirects from imported URLs where authorized, factual structured data and appropriate Duna Markdown/agent representations. Private family/account content never enters public indexing. Draft previews are access protected and noindex.

## 6. Commercial model: Duna Website

Proposed launch offer: **USD 200 per published website per month**, as an optional add-on to the organization's existing HQ plan. Includes a managed Vercel project, separate Neon project/database, domain connection, certificates, maintained Duna integrations, version history, hosting operations and a bounded allowance for AI creation/edits. Domain registration/renewal, premium third-party assets, unusual media generation, extra AI usage and messaging transport are separately disclosed when applicable.

Existing source pricing is HQ Free, HQ Club at USD 199/month, and HQ Scale at USD 499/month. Preserve their capability access and fee policies. At current list prices, Club plus one Website would be USD 399/month before taxes and other applicable charges. This is an illustration of proposed packaging, not a new subscription created today. A club can buy Website on Free without silently receiving Club's lower transaction fee.

### Included AI credits

- Proposed starting allowance: **1,000 website AI credits per paid monthly service period**, subject to measured workload cost validation before public launch. Do not promise a fixed number of edits before defining and testing the rate card.
- One bounded initial website build is included in the activation experience; budget it separately from recurring edits so onboarding does not unexpectedly empty the first month's allowance. Iterative redesigns consume the visible allowance.
- Show a plain task description, estimated credit range and a maximum accepted credit amount before an expensive job. Minor edits can use a persistent owner-selected spending cap.
- Freeze the credit rate version for each job. Reserve atomically, settle once against recorded billable work, and release unused reservations. Do not charge again for duplicate requests or Duna-caused retries/failures. An owner-requested revision after a delivered preview is new work.
- If cancellation occurs before billable work, release the reservation. If the owner cancels after work begins, settle only disclosed consumed work within the accepted cap. Provider costs of unsuccessful platform work remain Duna's cost.
- Included credits refresh on the website subscription's monthly service-period boundary and do not roll over. No UTC-calendar resets imported from Journey by accident. Start monthly-only; specify annual grants before offering annual billing.
- At exhaustion, the published website, direct business edits, bookings, wallet and staff inbox continue working. Pause new billable website AI jobs; offer an explicit top-up or wait for renewal. No automatic overage charges by default.
- Website AI usage, operator AI usage, guest-facing AI assistance, messaging delivery and player wallets have distinct meters and entitlement scopes. They may share metering infrastructure, not spendable balances.
- Scope included grants to the site at launch and provide an organization-level usage overview. Cross-site credit pooling is a later explicit pricing decision.
- Paid top-up price, quantity, expiry and refund treatment must be shown at purchase; do not sell undefined credits. Failed renewal must not mint a new grant. Grants are unique by subscription item, service period and allowance type.

Validate unit economics using measured first-build cost, edit-task mix, model/tool costs, builds, hosting, DB, storage, monitoring, support and payment costs. Proposed business target: recurring direct cost within 25–30% of subscription revenue for typical clubs; this is a target, not a measured margin. Heavy video/media and external channel usage need their own limits. Credits alone do not cap support or infrastructure costs.

### Billing and service lifecycle

Reuse Duna's platform billing customer and server-side subscription integration. Add a separate site subscription/entitlement rather than overloading the single existing organization-plan subscription pointer. This preserves a monthly website alongside an annual HQ plan and permits per-site cancellation. Display all Duna charges together in HQ even if Stripe issues distinct invoices.

Use Stripe Billing and Checkout subscription mode; expose invoices, payment-method updates and cancellation through the existing Customer Portal where configured. A checkout redirect does not activate service. Signed, deduplicated events plus current Stripe state drive paid entitlement and reconciliation. Trial, admin grant and paid allowance are distinct sources.

Proposed states: draft -> activating -> active -> payment-attention -> suspended or ended. Subscription, hosting, domain, build and publishing statuses remain separate state machines. A paid subscription cannot certify a failed deployment as live.

Allow a bounded draft preview before purchase. At activation, show the recurring price and start service when payment and the required provisioning checks succeed. If activation fails after payment, resolve/refund or credit according to the disclosed policy; never repeatedly charge to retry provisioning.

Proposed renewal grace: seven days of hosting continuity while payment recovery is attempted; pause expensive new AI jobs immediately. After grace, suspend custom-site serving with a recovery route; maintain underlying Duna records and honor existing registrations through Duna. Cancellation at period end stops renewal and future allowances, with clear site end-date, export options and domain handoff instructions. Retention/deletion is a separate disclosed policy; do not automatically delete a database or release a domain on a webhook.

Do not change existing HQ plan economics or Connect settlement rules as a side effect of website billing. Club customer revenue remains separate from the club's software bill to Duna.

## 7. Hosting and shared integration architecture

| System                            | Authority                                                                                                 |
| --------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Duna operational services         | People, verified relationships, activities, capacity, bookings, memberships, payments and wallet          |
| Duna site management              | Ownership, source revision, provider resource IDs, domains, jobs, entitlements, usage and release history |
| Club Vercel project               | Independent website builds, previews, releases and domain serving                                         |
| Club Neon project                 | Site content/configuration and approved site-specific data; no duplicate operational ledger               |
| Shared site agent and provisioner | Bounded authorized edit/build/deploy jobs; per-site workspace and credentials                             |
| Shared conversation services      | Tenant-scoped messages, routing, assignments, approved AI work, outbox and channel receipts               |

Reuse Journey AI Sites concepts and mature common modules through versioned interfaces. Complete missing provider bootstrap, durable jobs, publishing, rollback and billing qualification before reusing them as production capabilities. HXP PR #707 was open at the preceding November 3 review; verify its state when implementation begins.

Do not duplicate the full Duna backend or run a permanently dedicated editing agent for every site. Isolate public site projects and databases, while running authorized editing jobs through managed shared infrastructure. Keep source revisions and supported integration versions identifiable for fleet updates.

Provisioning must record intent before remote creation, reconcile uncertain outcomes and avoid duplicate projects/subscriptions on retry. Broker server-only, site-scoped credentials; generated code receives neither platform provider keys nor broad Duna DB credentials. Preview environments use synthetic/test transactions and isolated data. No automatic clone of real families or message history into a generated site's database.

Central Duna sign-in with a verified redirect/token exchange establishes site sessions on custom domains. Do not depend on cookies shared between unrelated domains or assume Journey consumer identity is interchangeable with Duna identity. Duna authorizes every personal and transactional call. Prices/capacity are revalidated when the action executes.

Approve and promote the exact reviewed revision after responsive, accessibility, identity, tenant and transaction checks. Keep the previous working deployment and backward-compatible content changes available for rollback. A code rollback is not a rollback of bookings or payments. Domain connection includes ownership verification and preserves unrelated email DNS.

## 8. Messaging decision: converge deliberately

Recommendation: adopt a Duna-branded conversation experience based on Threads/Concierge, with reusable service contracts for channel ingress, inbox assignment, AI assistance, human takeover, durable outbox and delivery evidence. Retain Duna as the authority for sports relationships, activity membership, family permissions and approved actions.

Threads/Concierge currently lives in HXP; it is not a drop-in standalone messaging service. Its Journey identity, reservation and branding assumptions need explicit Duna adapters. Do not route Duna users through hospitality membership rules or copy HXP source tables. Choose an extracted shared package/service boundary during the first implementation phase; avoid a permanent source-code fork.

Concrete compatibility gap: at the inspected HXP main revision, `lib/concierge/channels.ts` explicitly acknowledges and ignores inbound Sendblue messages carrying `group_id`. Provider group-message support therefore does not establish application support. Duna activity groups and guardian-visible conversations need a separately implemented and qualified path before any old group-delivery path can retire.

Duna currently uses owned cursor-sync delivery across Web, HQ, Player and Pro, with SSE wakeups and polling convergence. The system already supports dm/group/event/division/league/broadcast/support contexts, widgets, permissions, blocking, guardian coverage and screening. Replacing only its inbox UI or transport does not replace these responsibilities.

Retire duplicate orchestration and obsolete delivery implementations only after parity evidence. Do not sunset Duna's messaging policy or activity-group model simply because the new guest-support experience works. ADR-003 remains current until an explicitly reviewed successor changes it.

### One inbox, distinct audiences

- **Club service conversations:** parent/player and the club, with authorized AI and staff replies.
- **Activity/group conversations:** program, tournament, division, league, team and lesson communities with membership-based access.
- **Staff collaboration:** assignments, internal notes and private AI assistance, never rendered or sent to families.
- **Duna assistance:** a user's private platform conversation for discovery and cross-club help, with explicit handoffs to a club.

HQ Inbox shows Needs attention, Assigned to me, Waiting and Resolved, with club/activity/team filters. A context panel shows only authorized player/family details, relevant booking and activity. Reply and Internal note are distinct composer modes. Human takeover invalidates queued AI responses; the user can request staff at any point.

An owner can ask Duna to draft a program update and inspect recipients before sending. Transactional announcements, marketing campaigns and service replies have different permission/consent rules. Do not turn the existing no-unsolicited-marketing inbox into a campaign sender by changing its UI.

## 9. Club routing: explicit context before AI inference

Route by verified context in this order, with conflicts resolved explicitly:

1. Existing authorized conversation or valid reply correlation: keep its club and audience. A new explicit club choice opens/switches context rather than silently retargeting old history.
2. Verified club website session, selected club, club-specific endpoint, or validated activity link: use that club after ordinary access checks.
3. A clear user request naming a club or authorized booking: resolve the intended destination and show it. Confirm a switch before sharing prior private content.
4. AI suggests a club based on permitted user context. If ambiguous, ask a short selection question. Do not expose the pending message to candidate club inboxes.

Route selection is not authorization. A user can ask public questions about any club, but private schedules, child information, balances and actions still require identity and relationship checks. The platform router sees only the minimum authorized context needed to route; it must not retrieve all candidate clubs' private conversations to infer intent.

Show the active club prominently. Once routed, store a server-resolved conversation scope and route version. Each queued reply freezes its authorized club, endpoint, recipient binding and audience. Recheck permissions and guardian coverage before delivery; switching club, revocation or human takeover invalidates stale work.

Shared-number example: a parent writes "Can you move her Tuesday lesson?" If two children or clubs fit, Duna asks which child/club before exposing the request. After authorization it retrieves live options, proposes the change, and commits only after the required confirmation. A message saying "cancel it" must not inherit the wrong context from an unrelated recent notification.

On a shared phone thread, provider reply-to identifiers may not always resolve context. Label outbound replies with the club; use correlation where supported and ask when unclear. Distinct club conversations remain separate internally even if a phone presents one continuous thread. Routing to another club sends only the approved new request or selected summary, never the full private history.

## 10. Sendblue launch approach

Use a new Duna-branded number, independent of the existing Journey customer-facing number. Begin as a shared Duna entry point for inbound requests and qualified replies. Later, offer dedicated club numbers where demand, provider capability and economics justify them; these can reduce routing ambiguity but do not remove identity checks.

Current official documentation supports incoming webhooks, outbound status callbacks and line-specific webhook filtering. Its API provisioning applies to eligible inbound-only/Agent-plan accounts and the confirmation step charges the account. A new number therefore requires actual account/line capability and price readback before purchase; a number alone does not qualify outbound announcements, groups, traffic capacity or every device service.

Implementation requirements:

- Authenticate ingress using the provider's actual contract, verify the exact Duna endpoint, deduplicate events and persist durable receipt before asynchronous work.
- Link a verified phone binding through Duna sign-in/one-use verification. Possession of a phone alone does not authorize child data or a booking change.
- Maintain opt-outs, consent scope, delivery state and quiet-hour rules independently of AI intent.
- Freeze one delivery destination per reply; never fan out to several clubs/channels to improve odds of delivery. Reconcile an unknown send result before retrying.
- Preserve guardian coverage in the actual communication experience. A one-to-one coach/minor phone thread with an invisible database copy is not sufficient. Use a qualified guardian-visible channel/group, parent-facing delivery, or the protected Duna messenger.
- Retain web/app messaging for rich actions, private account details, group activity use and unavailable native channels. Duna-hosted secure links carry authenticated actions; chat text cannot certify a payment or reschedule.
- Test inbound, reply, delivery receipts, wrong endpoint, duplicates, opt-out, unknown outcome, human takeover and guardian revocation on the activated line before release.

No Sendblue line has been provisioned and no message has been sent as part of this specification.

## 11. Migration without losing conversations

1. Inventory current conversation types, widgets, audiences, blocks, safety reports, guardian rules, media, cursor/read state, native clients and queued sends. Record contract and behavior parity tests.
2. Add a read-only conversation adapter and new inbox behind a per-club flag. Keep existing stores authoritative. Shadow routing/classification with no external sends and no expanded staff visibility.
3. Pilot new club-service conversations and the new Duna endpoint. Each conversation has exactly one authoritative writer and sender. Historical/group threads continue through existing delivery until qualified.
4. Migrate or bridge history using stable IDs, verified participant mappings, attachment access controls, edits/deletions, timestamps, reports and read/delivery state. Never resend history. Reconcile pending/unknown sends and define rollback ownership before cutover.
5. Qualify group messaging and supported Player/Pro versions, including reconnect/offline recovery and notification deep links. Older clients require a compatibility window or an explicit version policy.
6. Retire old components per conversation type only after guardian/tenant/feature parity, delivery reconciliation and a rehearsed rollback. Keep a searchable authorized history and audit trail through the retention period.

Rollback routes new work to its declared owner without allowing both systems to send. It cannot undo a message already delivered. Do not require a universal destructive database migration before proving the new model.

## 12. Delivery packages and acceptance

| Package                           | Deliverable                                                                            | Completion evidence                                                                                                           |
| --------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| A. HQ and domain contracts        | Navigation, operations preservation inventory, People/family model, AI action map      | Owner/coach/front-desk/guardian task walkthroughs; no lost specialist routes or permissions                                   |
| B. Website studio and billing     | Real club context, conversational editing, preview, USD 200 checkout, grants and usage | Payment/renewal/replay/failure tests; one preview generated and edited with reconciled credits                                |
| C. Dedicated site launch          | Provisioning, site DB, Duna auth/commerce integration, domain, release/rollback        | Club site accepts an authorized family booking; capacity, payment and wallet agree with HQ; exact version and domain verified |
| D. Shared inbox pilot             | Duna adapters, human takeover, club routing, Sendblue integration                      | Adult and guardian test users; ambiguous multi-club requests withheld; no cross-tenant disclosure or duplicate sends          |
| E. Operations/group parity        | Programs/leagues/tournament messaging, widgets, native delivery                        | Competition-day and program workflows preserved; real supported-device delivery/reconnect evidence                            |
| F. Commercial and fleet readiness | Cost controls, support, lifecycle recovery, updates, migration gates                   | Measured pilot cost/margins, billing reconciliation, rollback exercise and approved retirement decisions                      |

Work can overlap where contracts are independent. Website release does not wait for a wholesale messaging rewrite; use the existing authorized web messenger through an adapter during transition. A shared-number pilot must not force every club to migrate.

Release tests must include two clubs and a family with multiple children; non-guardian denial; revoked guardian; account switching on custom domains; competing last-slot bookings; duplicate/out-of-order billing events; no double grant/debit; top-up/cancellation/renewal boundaries; failed activation; unsupported checkout; stale AI suggestions; staff internal-note separation; incorrect club inference; shared-number ambiguity; delivery uncertainty; provider outage; reduced motion and responsive accessibility.

Measure time to first working preview, time to first real registration, owner completion without support, edit acceptance/rework, generation cost, monthly direct cost per site, billing discrepancies, routing correction rate, human handoff success, duplicate/lost sends, family task completion and regressions in existing operational workflows. Set release thresholds from a representative pilot, not invented success percentages.

The first complete demonstration should be: an owner creates a program with Duna, features it on a generated site, subscribes and publishes; a parent signs in, selects a child, registers with the correct payment/credit rules, and asks a question that reaches the correct club; staff respond or take over, and every resulting booking, financial entry and message appears in the appropriate HQ workspace.

## 13. Source evidence and limits

Current Duna source inspected:

- `docs/design/duna-hq-focus-20261004.md`: approved task-first HQ design.
- `docs/ORGANIZATION_PRICING.md`, `packages/core/src/organization-plans.ts`, `packages/api/src/organization-billing.ts`: existing HQ tiers and platform billing separation.
- `packages/api/src/catalog-service.ts`: present brand publishing is a profile theme, not a website builder.
- `packages/api/src/organization-setup.ts`, `packages/api/src/duna-ai.ts`, `packages/api/src/ask-duna-store.ts`: shared setup context, organization-aware AI and reported usage.
- `packages/messaging-client/src/contracts.ts`, `packages/messaging-client/src/permissions.ts`, `packages/api/src/messaging-service.ts`, `docs/adr/ADR-003-owned-messaging-delivery.md`: conversation breadth, policy and current delivery ownership.
- `packages/api/src/family-wallet.ts`, `packages/league-engine/src`, `apps/hq/components/training-program-designer.tsx`: family/operational foundations.

Current HXP source inspected at the pinned main SHA: `AGENTS.md`, `openspec/specs/platform-tenancy/spec.md`, `lib/concierge/channels.ts`, `lib/concierge/member-access.ts`. These establish reusable transport/scope patterns and Journey-specific identity assumptions; they do not prove Duna compatibility or activated Duna providers.

Related work: [Journey AI Sites PR #707](https://github.com/Journey-Rewards/hxp/pull/707), including its provider bootstrap and publishing limitations from the prior review. Its commercial defaults do not automatically become Duna terms.

Provider references checked November 4, 2026:

- [Stripe subscription events](https://docs.stripe.com/billing/subscriptions/webhooks): asynchronous state and webhook handling.
- [Stripe Customer Portal](https://docs.stripe.com/customer-management/integrate-customer-portal): self-service billing capabilities.
- [Sendblue webhooks](https://docs.sendblue.com/getting-started/webhooks/): channel ingress and status events.
- [Sendblue webhook configuration](https://docs.sendblue.com/api/resources/webhooks): line-specific inbound filters.
- [Sendblue line provisioning](https://docs.sendblue.com/api-v2/line-provisioning): account eligibility, preview/confirm and paid provisioning.

This is a source-informed specification. It does not establish live provider availability, unit economics, production family/booking correctness, or messaging migration readiness. Runtime implementation should use focused changes, current provider contracts, required repository reviews and separately recorded connected evidence.
