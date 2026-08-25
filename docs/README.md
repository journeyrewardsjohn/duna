# Duna documentation

This index separates durable architecture from surface implementation,
provider operations, and time-sensitive release evidence.

## Begin here

1. [`../AGENTS.md`](../AGENTS.md) — binding product and design contract.
2. [`START_HERE.md`](START_HERE.md) — contributor and agent onboarding.
3. [`ARCHITECTURE.md`](ARCHITECTURE.md) — system shape and ownership.
4. [`surfaces/README.md`](surfaces/README.md) — surface-by-surface entry points.
5. [`ENVIRONMENT_VARIABLES.md`](ENVIRONMENT_VARIABLES.md) — variable names,
   sensitivity, consumers, and storage locations.
6. [`INFRASTRUCTURE.md`](INFRASTRUCTURE.md) — provider access and operating
   procedures.

## Product surfaces

- [`surfaces/WEB.md`](surfaces/WEB.md) — public Duna and Player Web.
- [`surfaces/HQ.md`](surfaces/HQ.md) — browser-based operator workspace.
- [`surfaces/ADMIN.md`](surfaces/ADMIN.md) — Super Admin control plane inside HQ.
- [`surfaces/PLAYER.md`](surfaces/PLAYER.md) — Duna Player native app and Watch.
- [`surfaces/PLAYER_SCREEN_INVENTORY.md`](surfaces/PLAYER_SCREEN_INVENTORY.md) —
  source-backed Player screen, state, navigation, and journey map for redesigns.
- [`surfaces/PRO.md`](surfaces/PRO.md) — Duna Pro native operator app.
- [`surfaces/VOICE_AGENTS.md`](surfaces/VOICE_AGENTS.md) — LiveKit voice workers.
- [`surfaces/PLATFORM.md`](surfaces/PLATFORM.md) — shared API, data, domain, and UI packages.

## Contracts and specialist architecture

- [`API.md`](API.md) — internal tRPC namespaces and evidence-sensitive workflows.
- [`MCP.md`](MCP.md) — public and authenticated agent access.
- [`MESSAGING_PLATFORM.md`](MESSAGING_PLATFORM.md) — messaging policy, persistence,
  delivery, moderation, attachments, and Upstash wakeups.
- [`adr/ADR-003-owned-messaging-delivery.md`](adr/ADR-003-owned-messaging-delivery.md)
  — owned cursor-sync decision.
- [`VIDEO_PLATFORM.md`](VIDEO_PLATFORM.md) — Mux, R2, upload, playback, Vision,
  privacy, and release gates.
- [`DUNA_VISION_ANALYSIS.md`](DUNA_VISION_ANALYSIS.md) — analysis event model,
  human review, GPU-worker contract, and release gates.
- [`HEALTH_PRIVACY.md`](HEALTH_PRIVACY.md) — HealthKit storage, sharing, and
  deletion boundary.
- [`PREDICTION_CREDITS.md`](PREDICTION_CREDITS.md) — play-credit market boundary.
- [`WAIVERS_AND_RELEASES.md`](WAIVERS_AND_RELEASES.md) — club-scoped waiver
  library, execution evidence, guardian consent, enforcement, and release checks.
- [`VOLLEYBALL_WORLD_LIVE.md`](VOLLEYBALL_WORLD_LIVE.md) — live professional data.
- [`MEMBERSHIP_PRICING.md`](MEMBERSHIP_PRICING.md) and
  [`ORGANIZATION_PRICING.md`](ORGANIZATION_PRICING.md) — commercial contracts.

## Delivery and design

- [`OPERATIONS.md`](OPERATIONS.md) — release gates, migrations, workflows, and
  connected checks.
- [`BUILD_MATRIX.md`](BUILD_MATRIX.md) — current implementation evidence and
  external gates; verify time-sensitive claims before repeating them.
- [`design/README.md`](design/README.md) — design-system reading order.
- [`typography.md`](typography.md) — legacy pointer; the font usage guide is
  authoritative.

## Documentation rules

- Describe source-backed behavior, not intended behavior presented as shipped.
- Link to the owning source file or specialist guide instead of duplicating a
  mutable contract.
- Name variables, projects, and secret stores; never include credential values.
- Separate implementation, deployment, migration, authentication, native build,
  store submission, and external approval evidence.
- Update the relevant surface guide when a route, navigation model, runtime,
  provider dependency, or ownership boundary changes.
