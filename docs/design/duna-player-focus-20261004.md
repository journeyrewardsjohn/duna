# Duna Player task-first interface

The October 4 request extends the approved simple HQ direction to Duna Player:
white working surfaces, black and grey text, restrained color, compact controls,
and Duna AI as the first way to start a task. This supersedes the older Player
Home ordering and decorative quick-action styling, while retaining Satoshi,
semantic live states, accessibility, and existing business behavior.

- Web and native Home lead with an editable task prompt. Suggestions prepare a
  draft; only Send submits it to the existing authenticated assistant.
- Direct actions remain visible. Personal commitments precede discovery.
  Explore your game reveals the existing discovery, results, and performance
  content rather than crowding the first screen.
- Web has one small-icon mobile bar with Home, Play, the Duna D assistant,
  Messages, and Video. The full menu retains every destination and search.
- Secondary web pages expose a compact contextual prompt. Video, scoring,
  messaging, and onboarding preserve their focused workspaces.
- Native Home insights open AI, not support messages. The AI conversation stays
  mounted while users navigate to a booking, event, or another screen and back.
  Existing account lifecycle owns the signed-in runtime.
- Native suggestions fill an editable composer. Consequential actions keep
  their existing server authorization, review, checkout, and approval contracts.
- No capture, upload, video provider, score, payment, or permission contracts
  change. The center mark stays small inside an accessible control.

Web presentation roles live in `packages/ui/src/player-workspace.css`; the
reusable task input is `DunaTaskPrompt`. Native uses `@duna/ui/mobile` roles and
the existing Satoshi input wrapper. Public website and HQ styles stay scoped.

Verify responsive Home, AI prompt handoff and error/review states, all direct
destinations, dark preference, keyboard use, and reduced motion. Native exports
and type checks establish build compatibility, not physical-device or store
release proof. Check keyboard, Dynamic Type, prompt submission, navigation back
to the conversation, and video access on a device before claiming native rollout.
