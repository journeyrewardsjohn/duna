# Duna voice agents

`apps/voice-agent` contains two private LiveKit agent workers. They support
human-reviewed drafts; neither worker owns profile truth, note publication, or
authorization.

| Agent name           | Entry file                   | Purpose                                                                      |
| -------------------- | ---------------------------- | ---------------------------------------------------------------------------- |
| `duna-profile-guide` | `src/agent.ts`               | Ask a player/parent about playing history and recap proposed profile answers |
| `duna-session-notes` | `src/session-notes-agent.ts` | Quietly transcribe a coach's session note for later recipient/privacy review |

## End-to-end flow

1. An authenticated Web, HQ, or Pro user requests a purpose-specific room.
2. The server rechecks the player household or operator session scope.
3. The server creates a short-lived room-scoped participant token and dispatches
   exactly one named agent with minimal metadata.
4. The worker joins through LiveKit and runs the constrained realtime prompt.
5. The user reviews the transcript and structured draft in the product.
6. A normal typed mutation saves the draft; a separate explicit action publishes
   any player-shareable coach note.

Room tokens are private, short lived, purpose bound, and never persisted in
source. The agent receives no database credential and cannot bypass the
`player.*` or `operator.*` authorization path.

## Safety boundary

The profile guide must not request identity documents, Social Security numbers,
payment information, medical history, exact birth date, or address. It cannot
verify professional status or identity.

The note agent stays silent unless asked, does not repeat volunteered sensitive
data, and never says a note has been shared. Saving and publishing are distinct
human-controlled states.

When changing prompts, preserve the prohibited-data list, concise interaction,
review language, and product-side confirmation. Prompt changes are product and
safety changes, not copy-only edits.

## Configuration

```text
LIVEKIT_URL
LIVEKIT_API_KEY
LIVEKIT_API_SECRET
OPENAI_API_KEY
```

All are server-side values. Store them in the LiveKit worker's encrypted
runtime environment and in the Vercel projects that issue room tokens as
needed. Do not expose them to browsers, Expo public variables, logs, or docs.

The repository does not currently codify a production worker host. Do not infer
that a Vercel deployment starts these long-running workers; verify the LiveKit
agent deployment separately.

## Local development

```bash
pnpm --filter @duna/voice-agent dev
pnpm --filter @duna/voice-agent dev:profile
pnpm --filter @duna/voice-agent dev:session-notes
```

The combined command starts both named workers. A complete test also needs the
issuing Web/HQ route, an authenticated permitted user, a LiveKit project, audio
input/output, transcript review, save, and publish/privacy assertions.

## Validation

```bash
pnpm --filter @duna/voice-agent lint
pnpm --filter @duna/voice-agent typecheck
pnpm --filter @duna/voice-agent test
```

Then test wrong user/household/organization/session denial, expired token,
worker unavailable, interrupted audio, sensitive-data redirection, draft-only
save, and explicit publication. A worker process starting is not proof that
room dispatch or the product flow works.
