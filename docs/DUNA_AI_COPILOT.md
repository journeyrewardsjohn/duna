# Duna AI CoPilot

Duna AI is a permission-scoped operating layer shared by Duna Player, Duna Pro,
and Duna HQ. It is not a second source of business truth. The signed-in actor,
active organization, structured Duna records, approved organization knowledge,
and server-owned mutations remain authoritative.

## The context stack

Every turn is assembled server-side from four bounded layers:

1. **Identity and tenancy** — person, roles, scopes, age band, and active
   organization resolved from the WorkOS session or bearer token.
2. **Live operating context** — current schedule, sessions, courts, coaches,
   attendees, conflicts, weather, metrics, and the current app surface.
3. **Organization context** — published theme, palette, brand voice, tagline,
   and operator-approved brand knowledge. Organization content may guide an
   answer or draft but never overrides permissions, pricing, safety, or live
   structured data.
4. **Product capability knowledge** — a CI-generated manifest of Duna modules,
   surface guides, status, and typed API capabilities. This is how the copilot
   stays current as the product changes.

The client may send the current page and recent conversation, but it never sends
or decides authorization. The server rebuilds identity and organization scope on
every request.

## Release-time feature knowledge

`scripts/generate-duna-feature-knowledge.ts` reads:

- `docs/BUILD_MATRIX.md` for module scope and delivery status;
- `docs/surfaces/*.md` for player, coach, operator, admin, and platform usage;
- typed procedures in `packages/api/src/router.ts` for executable capability.

It generates
`packages/api/src/generated/duna-feature-knowledge.ts`. Duna AI searches this
manifest with `search_duna_feature_knowledge` when someone asks what Duna can do
or how a feature is used or managed.

The pull-request verification workflow runs `pnpm knowledge:check`. If a change
to the source guides or API procedures makes the committed manifest stale, CI
fails with the command required to regenerate it. The generated fingerprint is
also returned with feature searches so runtime traces can identify the exact
knowledge revision used by a deployment.

When adding or materially changing a feature:

1. implement the typed server operation and role boundary;
2. update the owning surface guide and the product acceptance matrix;
3. run `pnpm knowledge:generate`;
4. add a golden prompt/action test for the new user intent;
5. run `pnpm knowledge:check` and the affected package tests;
6. deploy the exact reviewed commit and verify the signed-in role that should be
   allowed and one that should be denied.

## Coach reschedule transaction

“Move my 9:30 AM group lesson to 10:00 AM tomorrow” follows one server-owned
transaction:

1. Resolve “my,” the local date, current start time, session kind, and active
   organization. If zero or multiple sessions match, ask for the exact title or
   court and make no change.
2. Preserve the singular session’s duration, assigned coach, and court.
3. Create a calendar-change proposal. This checks current court and coach
   reservations and counts active registrations. A conflict produces a question
   about another time or court; it never silently substitutes one.
4. Present the exact before/after time, court/coach availability, and notification
   count in a governed approval card.
5. On approval, re-check the actor’s `sessions:write` permission, confirm the
   calendar proposal, update the one session and resource reservations, write the
   audit event, and queue player schedule notifications.
6. Refresh Duna Pro from server state. Partial or stale failures are shown; the
   copilot never claims success from a proposal alone.

Cancellation, refunds, pricing, publication, outgoing messages, account deletion,
and money movement remain `confirm-always` actions with fresh, non-replayable
approval. Reads execute only within the actor’s current server-resolved scope.

## Duna Pro experience

Duna AI is the elevated center action in the bottom navigation. Today and
Calendar remain primary; creation is the `+` action. People, Money, Messaging,
Video, tournaments, and other focused operator tools remain available through
More. The former line-only Duna mark is removed from runtime and onboarding
states in favor of the current textured Duna wordmark.

The Pro copilot is deliberately conversational but not vague: it shows the active
organization, offers context-aware prompts, preserves recent turns, renders
structured result cards, asks follow-up questions when identity or target
resolution is ambiguous, and keeps consequential work behind review.
