# Duna Pro rebuild — coach mobile delivery plan

## Current release scope

Duna Pro is the mobile operations app for club owners, facility managers, and
coaches. It is intentionally not a compressed copy of Duna HQ: configuration,
campaign design, theme editing, and ledger reconciliation stay in HQ, while
the phone owns on-the-go operating decisions.

This rebuild delivers the foundations and the two missing coach workflows:

- Rebranded Duna Pro shell, native Duna assets, bundled Fellix/Archivo type,
  light/dark app icons, launch experience, and version `1.3.0`.
- Today, court calendar, attendance, arrivals, people, payments, protected
  messaging, ticket scanning, session notes, offline match scoring, and Live
  Activity support.
- Tournament Desk: choose an organization tournament, inspect divisions and
  live status, start a generated draw with confirmation, enter auditable
  walk-in teams, and move directly into the existing offline-first scorer.
- Coach Video: record with the phone camera or select a video, keep it private
  by default, attach it to an event, upload it in resumable R2 parts, and view
  the organization video library.

## Delivery sequence

1. **Run the event:** Tournament Desk, scanner, court schedule, roster,
   scoring, check-in, payments, and operational messages.
2. **Teach from the event:** private coach video, event linkage, review library,
   then curated player sharing only through existing privacy controls.
3. **Proactive operations:** actionable notifications, Watch expansion, and
   the existing Live Activity/arrival flow.
4. **Store release:** independent iOS and Android bundles; then signed build,
   upload, Apple/Google processing, and physical-device checks.

## Explicit remaining gates

- A phone upload is not a live broadcast. Live streaming remains the existing
  Mux path and requires configured Mux plan/provider credentials.
- Tournament setup (divisions, eligibility, field rules, and bracket design)
  remains in Duna HQ by design; Pro runs the published structure.
- Apple widget provisioning was previously the blocker for a signed Duna Pro
  build. A successful JavaScript export does not prove a signed TestFlight
  build, App Store processing, or physical-device behavior.
