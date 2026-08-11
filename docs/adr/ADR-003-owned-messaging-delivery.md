# ADR-003: Owned cursor-sync messaging delivery

- Status: accepted
- Date: 2026-08-11
- Decision owner: Duna

## Context

Duna Messaging initially used an Electric-oriented read projection. Duna needs
delivery that remains correct without a sync vendor, preserves the existing
Postgres-standard schema and authorization model, and can adopt a future Neon
native sync product without rewriting messaging UI, outbox, or policy code.

## Decision

Duna owns a thin delivery layer:

- Neon is authoritative. Authenticated HTTP endpoints expose keyset-paginated
  inbox rows, gap-filled messages by conversation sequence, participant and
  reaction state by update cursor, and monotonic read/delivered watermarks.
- `DeliveryEngine` is the only liveness abstraction used across Player Web,
  Duna HQ, Player, and Pro.
- Upstash Redis publishes content-free wake-up hints to per-person and support
  staff channels. An authenticated SSE route forwards those hints.
- SSE is never a correctness dependency. Connect, reconnect, foreground, push,
  and 15-second foreground polling all run the same cursor convergence pass.
- Electric client packages, shape proxies, environment values, and Neon logical
  replication artifacts are removed after cursor-only verification.

## Consequences

Duna owns a small amount of cursor, reconnect, and streaming code, but avoids a
sync-vendor runtime dependency. A wake-up outage increases delivery latency only.
Permissions, SafeSport screening, idempotent outbox writes, sequence assignment,
widgets, and watermarks remain unchanged. Neon-native sync is the designated
successor and should be adopted by implementing another `DeliveryEngine`, not by
changing product surfaces.
