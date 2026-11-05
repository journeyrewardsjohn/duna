# HQ forms and AI-first creation

Approved direction: November 5, 2026. The supplied reference screens inform
component hierarchy and creation flow, while Duna retains its typography,
neutral HQ tokens, authorization, and operational capabilities.

- Use a bordered workspace, plain titles, compact sections, restrained radii,
  and consistent labeled inputs. Avoid decorative icons and promotional copy.
- New events, leagues, offers and venues begin with an editable brief for Duna.
  Examples fill the brief; only explicit submission opens the existing assistant.
  The secondary manual action opens the complete existing builder.
- Existing event drafts, populated handoffs and offer clones open directly in
  their builder. Preserve validation, registration locks, draft saving, upload
  completion, billing and publication review.
- The assistant uses the existing authenticated organization context and audited
  proposal/approval flow. The creation entry itself performs no data mutations.
- Creation state resets across organization changes. Switching to manual entry
  moves keyboard focus to the form heading. Inputs remain16px, controls14px,
  touch targets48px, and primary mobile actions56px.
- The website editor already starts with an AI brief and retains its live preview,
  version, domain and billing controls.

Verify desktop/tablet/mobile, dark mode, keyboard entry and manual fallback,
example selection without writes, explicit assistant handoff, and existing
prefilled/manual workflows. Run the full release gate remotely to avoid local
memory pressure, then verify the canonical authenticated production deployment.
