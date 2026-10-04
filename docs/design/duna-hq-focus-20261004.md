# Duna HQ focused workspace

Approved October 4, 2026 after review of the implemented Home screen.
This direction supersedes the earlier HQ accent palette and dashboard density.
Player web and native redesigns remain separate style reviews.

## Design and interaction

- White canvas, black primary text, grey secondary text and borders. Color is
  reserved for meaningful status, focus, and unmodified organization imagery.
- Home starts with a task prompt. Common actions, today's schedule, and items
  needing attention follow. Business metrics and additional insights remain
  available in disclosures.
- Keep Home, Get started, Schedule, People, Events, Messages, and Money in primary
  desktop navigation. More tools retains the remaining modules and opens when
  one is active. Mobile preserves Home, Get started, Schedule, People, and More.
- Other operator pages provide a compact AI task input with their existing page
  context. Immersive workspaces preserve their viewport and assistant entry.
- Suggestions fill an editable draft. Sending a prompt opens the shared Duna
  assistant. Organization authorization, action proposals, explicit confirmation,
  messaging boundaries, and audit behavior remain server-owned.
- Satoshi is the product font. Controls are at least 14px, inputs 16px, and
  metadata 12px. Touch targets remain at least 48px, primary mobile actions 56px.
- Light, Dark, and Match device remain available. The particle loading animation
  becomes still for reduced motion and pauses when the document is hidden.

## Implementation boundary

Shared semantic roles are in `packages/ui/src/hq-workspace.css`; HQ composition
and presentation live in `apps/hq/components` and `apps/hq/app/work-focus.css`.
The stylesheet is loaded only by HQ. No native bundle, Player design, database
schema, provider contract, or organization permission changes are part of this
release.

## Verification

Check all operator module pages and specialized creation/settings routes at
1440px and 390px, plus representative tablet and explicit dark states. Inspect
Home, Schedule, People, Money, Products, Messages, Settings, and Setup visually.
Run the existing HQ workflow regression plus assistant handoff/approval checks.
The release still requires the repository verification pipeline and a READY
production deployment of the approved commit, with canonical-route and auth
boundary checks. Local sample data is not connected production evidence.
