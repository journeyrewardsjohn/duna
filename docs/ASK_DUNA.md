# Ask Duna

Ask Duna is the operator's persistent assistant in HQ. `/ask` starts a chat,
`/ask/:conversationId` resumes one, and `/ask/history` searches saved messages,
including archived conversations. A floating composer is available throughout
operator HQ and authorized administration pages. HQ Home and contextual page
prompts open it in place. Drafts, files, and the active conversation survive
navigation, including loading boundaries; switching operator or organization
resets that in-memory state. The current page accompanies subsequent messages
as user context, never authority. Minimize it to work underneath, reopen with
Cmd/Ctrl+J, or expand a saved conversation into `/ask/:conversationId`. The
sidebar exposes recent conversations and the complete history. The full Ask
workspace hides the floating surface and shares the same durable conversation.

Administration pages use the selected organization and the operator's existing
permissions. Without an operator workspace, the floating surface links back to
club HQ to choose one. It does not operate across organizations or inherit the
authority of a transcript being inspected.

The supplied Ask Journey export is a visual reference. Duna retains its Satoshi
type, HQ tokens, organization context, permissions and business rules. The
composer supports people/event references, uploaded images/PDFs/text/CSV, five
effort levels, streaming responses, stop/reconnect, and explicit action review.

## Runtime

- **Eve 0.79.2** owns durable sessions, model/tool loops, streaming, reconnect,
  compaction and budget prompts. `eve/next` mounts its service at `/eve/v1`.
- **AI Gateway / AI SDK 7** routes model calls. Fast uses
  `openai/gpt-6-luna`; Medium/High/Max use `openai/gpt-6.1-sol` with increasing
  reasoning; Ultra uses `openai/gpt-6-astra`. Server environment overrides can
  select other Gateway models. The installed Eve API supports reasoning through
  `xhigh`, which is used for Max and Ultra.
- **Chat SDK 4.42.0** provides portable action-review cards. Browser transport
  uses Eve's React client. No external messaging adapter is activated by this
  change. A future Chat SDK channel must map its external identity to a fresh
  Duna actor and enforce the same conversation ownership; webhook signatures
  alone do not authorize Duna operations.
- **Neon primary** stores operator-owned conversation metadata, searchable final
  text, action approvals, receipts, usage and administration controls. Eve's
  Workflow store owns its durable execution and complete stream. The local
  workflow directory is `.eve/.workflow-data`; Vercel uses its Workflow service.
- A per-session **just-bash** virtual filesystem stages attachments. The agent
  exposes no shell, filesystem, network or subagent tool. Text/CSV attachments
  become clearly delimited user text; validated inline image/PDF bytes are
  staged by Eve. Remote file URLs and client-supplied runtime context are denied.
  Inline attachments are limited to 1.5 MB each and 2.5 MB combined; serialized
  requests stay below 4 MB to fit [Vercel's request limit](https://vercel.com/docs/functions/limitations#request-body-size).

This follows the current [Eve Next.js integration](https://eve.dev/docs/guides/frontend/nextjs),
[Eve authentication model](https://eve.dev/docs/guides/auth-and-route-protection),
[Chat SDK channel model](https://chat-sdk.dev/docs), and
[Vercel AI Gateway](https://vercel.com/docs/ai-gateway) documentation, checked on
October 15, 2026. Installed package documentation was used to validate exact APIs.

## Product actions and authority

`packages/api/src/ask-duna-capabilities.ts` explicitly lists 148 reviewed operator
procedures. New API procedures are denied until added. The model discovers
relevant names and retrieves a schema on demand instead of receiving every
schema in its initial prompt. Its six tools are `workspace_context`,
`find_capabilities`, `describe_capability`, `read_duna`, `propose_change` and
`change_results`.

Every operation passes the existing typed procedure, tenant scope, permission,
rate limits and domain validations. Operator grants are reloaded from primary
storage for every tool invocation and every approval. Session credentials bind
person, organization, conversation, session and purpose and expire after two
minutes. The browser refreshes them when it connects. A Super Admin inspection
does not grant permission to continue someone else's session.

Mutations are validated and stored as exact proposals. They expire after 15
minutes. The operator approves or declines in HQ; the model has no confirmation
tool. Claiming an approval and recording its audit happen in one transaction.
An atomic state transition prevents double execution. The server supplies the
idempotency key, rechecks permissions and the global controls, then calls the
owning procedure. Unknown outcomes remain uncertain and cannot automatically
retry. Executions without a receipt after two minutes are displayed as uncertain
while retaining their original claim.
After review, HQ prompts the agent to read the saved outcome and continue the
remaining task. A declined action stays declined unless the operator revises it.

Coverage includes events, calendars, courts, people, training, audiences,
catalog/inventory, business settings, money and draft communications, subject to
the operator's role. Dedicated checkout/Connect credential flows, device payment
proofs/scans, private health profiles, ownership transfers and the old assistant's
confirmation endpoints remain in their owning screens. Draft communications
are not presented as delivered messages.

## Super Admin

`/admin/ask-duna` shows the latest 100 conversations and action receipts across
organizations, with operator/organization search, read-only transcript inspection,
runtime events, reported model usage/cost over 24 hours, and independent switches
for all agent work and mutations. Inspection and control changes are audited.
Credential presence is labeled configuration status, not proof of a live model
request. Costs without provider reports remain unknown.

## Setup and release

1. Use **Node.js 24** for HQ and the Eve service. CI's release gate uses 24.21.0.
2. Apply `packages/db/drizzle/0108_magical_spot.sql` through the normal migration
   process on an isolated preview database first. It adds four tables and their
   indexes/constraints. The implementation does not apply production migrations.
3. Configure authenticated WorkOS access and the same primary `DATABASE_URL` in
   HQ and its Eve service. Set `NEXT_PUBLIC_DEMO_MODE=false` in connected runtimes.
4. Configure Gateway workload OIDC on Vercel, or `AI_GATEWAY_API_KEY` locally.
   Set `DUNA_AI_SESSION_SECRET` to a random secret of at least 32 characters in
   both runtimes. `WORKOS_COOKIE_PASSWORD` is accepted as a fallback.
5. Use `pnpm --filter @duna/hq dev` locally. For a local production build run
   `pnpm --filter @duna/hq build:agent`, `pnpm --filter @duna/hq build`, then
   `pnpm --filter @duna/hq start`. Vercel's `withEve` builds the agent service as
   part of the project deployment. Optional `DUNA_ASK_AGENT_ORIGIN` chooses an
   internal origin; otherwise HQ uses its incoming origin.
6. Verify a signed-in operator can create, reload and resume a conversation,
   reference actual permitted records, approve a low-impact action once, observe
   its receipt and inspect the same operation as a Super Admin. Confirm a second
   operator/organization cannot access that session. Validate Gateway usage and
   Vercel Workflow persistence before promotion.

Session budgets pause at one million input tokens, 80,000 output tokens, or $10
of reported model cost. Eve asks the operator whether to continue; these are
continuation budgets, not billing entitlements or hard total spend guarantees.
Conversation expiry is disabled to preserve operator continuity. Production
retention/deletion policy must cover both Neon projections and Workflow data;
deleting an account's Neon rows does not delete the provider's retained workflow
logs. Account deactivation/revoked membership prevents further access and tools.

## Operator app follow-on

The server contract already accepts the existing WorkOS bearer flow, including
the selected Duna organization. Native clients can use the same conversation,
token, review and history APIs and attach an Eve client to the signed session.
The native Duna Pro interface, offline queue, attachment picker, push/resume and
device testing remain a separate implementation. No native app screen or store
release changes in this HQ upgrade.

## Verification

`packages/api/src/ask-duna.test.ts` runs the actual migration in disposable
PGlite Postgres and exercises ownership, revoked grants, history pagination and
message search, archive/restore, concurrent approvals, expiry, kill switches and
audit rollback. HQ tests cover signed credentials, the actual Eve client request
format, body limits, file URL rejection and cross-origin writes.

`tests/e2e/ask-duna.spec.ts` and `hq-focus.spec.ts` exercise the UI and Eve stream
protocol with clearly isolated fixtures at desktop, tablet and phone sizes.
They also check the real local Eve endpoint rejects unsigned requests. These
tests do not prove a live Gateway call, deployed database migration, production
identity, external side effect or native runtime.

Local validation on October 15, 2026: 472 API tests, 92 HQ tests and 11 shared UI
tests passed; 33 desktop/tablet/phone browser checks passed, including floating
draft/file persistence across navigation, in-place approval, expand/return,
history, keyboard focus, protected pages, and the existing HQ regression flow.
The HQ, Eve and API declaration builds passed, along with API/UI type checks, targeted lint,
repository formatting and the design/readable-type/knowledge checks. The Super
Admin component was also inspected in light and dark themes at desktop and phone
sizes using a temporary local fixture harness; that harness is not shipped.
