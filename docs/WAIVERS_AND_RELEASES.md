# Waivers & Releases

Duna is the evidence keeper for club-scoped waivers and releases. The legal
agreement is between the signing participant or guardian and the organization;
Duna does not author legal language or guarantee enforceability. Organizations
must obtain qualified legal review for their documents, configuration, and
retention obligations.

## Product contract

Each organization owns an independent library of documents. A document has an
immutable current version, a content hash, a signature-validity period (365
days by default), signing configuration, key sections, assignments, and a
complete version history. Publishing a revision changes the current version;
previous executions remain preserved as evidence but cannot satisfy a new
version's requirement.

HQ operators create or revise a waiver in **Settings → Waivers & Releases**.
They may paste Markdown or import Markdown, text, PDF, or DOCX. The importer
extracts source text and uses Duna AI only to propose key-section anchors for
review; it never rewrites legal terms or decides enforceability. The exact
reviewed Markdown is the source stored in the version record.

Documents may be required for all members, all bookings, individual membership
plans, or an event. An event stores the selected library document ID, version
ID, content hash, and rendered snapshot so it remains attributable even when a
later version is published.

## Signing journey

The Web and Player native flows always render the complete waiver inline. The
final confirmation and per-section acknowledgements remain disabled until the
signer reaches the end. A configured signature requires an affirmative checkbox
and typed full legal name.

For a minor, a verified parent or legal guardian signs against the child’s
profile. A teen can separately acknowledge a waiver when the organization
enables an age threshold from 13–17, but it never replaces a required guardian
signature. Guardian invitation/claim links use the existing linked dependent
flow; relationship review must be verified before it can be used to execute a
waiver.

Each execution retains the subject and signer, signer role and relationship,
typed name, required section IDs, the full-inline/scroll confirmations,
timestamp, IP address, user agent, content hash, version, and expiry. The
execution is written with an audit event. Duna generates a PDF receipt of the
exact version and sends it to the signer’s email as a best-effort transactional
delivery when Resend is configured. Delivery failure never invalidates the
durable signature evidence.

## Enforcement

`loadWaiverRequirements` is the shared authoritative requirement resolver.
It derives the active document/version and checks unexpired, role-complete
executions for the participant. The following entry points must use it rather
than treating a client checkbox as consent:

| Journey                                    | Enforcement point                                |
| ------------------------------------------ | ------------------------------------------------ |
| Catalog purchase and membership activation | `packages/api/src/catalog-checkout.ts`           |
| Event checkout                             | `packages/api/src/checkout.ts`                   |
| Web purchase UI                            | `apps/web/components/catalog-checkout-panel.tsx` |
| Player native purchase UI                  | `apps/player/organization-experience.tsx`        |

Server-side refusal is mandatory. UI gates only explain and collect the
required execution; they are not authorization.

## Implementation map

| Concern                  | Source                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------- |
| Tables and migrations    | `packages/db/src/schema.ts`, `packages/db/drizzle/0073_legal_mephisto.sql`, `0074_old_zombie.sql` |
| Service, evidence, rules | `packages/api/src/waiver-service.ts`                                                              |
| Typed procedures         | `packages/api/src/router.ts`, `packages/api/src/contracts.ts`                                     |
| PDF receipt and delivery | `packages/api/src/waiver-receipt.ts`, `packages/api/src/resend.ts`                                |
| HQ library/import        | `apps/hq/components/waiver-library.tsx`, `apps/hq/app/api/waivers/import/route.ts`                |
| Web signer               | `apps/web/components/waiver-signature-panel.tsx`                                                  |
| Native signer            | `apps/player/organization-experience.tsx`                                                         |

## Configuration and release checks

`DATABASE_URL` and `DUNA_DATA_SOURCE=database` are required for connected
records. AI proposal uses `AI_GATEWAY_API_KEY` or workload
`VERCEL_OIDC_TOKEN`; `AI_GATEWAY_WAIVER_IMPORT_MODEL` optionally selects the
provider-qualified model. Receipt email requires `RESEND_API_KEY` and
`RESEND_FROM_EMAIL`.

Before release, apply migrations to an isolated Neon branch, test an adult and
minor/guardian signing journey, revise a waiver and prove re-consent is
required, verify event and membership checkout refusal, and inspect a generated
receipt. Confirm the exact Web and HQ production deployment commits separately.
