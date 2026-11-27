# Duna Health privacy and security policy

**Policy version `duna-health-2026-11-27`, effective 27 November 2026.**
Replaces the adults-only boundary. Source of truth in code:
`packages/api/src/services/health/policy.ts` (every rule below is a named
constant or pure function there). This is an engineering policy, not legal
advice; the open questions for counsel are listed at the end.

Owner decisions (27 November 2026): Duna helps junior club players too, so
Health is not adults-only. Apple Health integration is United States only for
now. Players aged 13 and over may use it; under-13s stay blocked until a
verified parental-consent method exists.

## Scope

Duna Health is optional, read-only and US-only. It reads Apple Health data the
player chooses, builds a private timeline, adds descriptive match context, and
can align heart rate with Duna Vision. It serves fitness and performance
context, not medical use. It never diagnoses, prescribes, decides whether
someone should play, or gates booking, membership, eligibility or team
selection.

## Who can do what

Age is computed from the stored birth date on every request (UTC calendar
date), never from a stored band. No birth date means no Health features.

| Action                                | 18 and over                                   | 13 to 17                                                                                                           | Under 13                | No birth date        |
| ------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------- | -------------------- |
| View own Health                       | Yes                                           | Yes (while `health.juniors` is on)                                                                                 | No: "not available yet" | No: add a birth date |
| Opt in                                | Not needed (connect flow is the consent)      | The teen, on their own signed-in session                                                                           | No                      | No                   |
| Guardian approval                     | Not applicable                                | Required: a linked guardian (verified link) who is an adult today                                                  | Not offered             | Not applicable       |
| Sync Apple Health                     | US storefront                                 | US storefront + teen opt-in + guardian approval                                                                    | No                      | No                   |
| Metrics accepted                      | All 19                                        | Heart rate, workouts, active energy, exercise minutes; others dropped                                              | None                    | None                 |
| Daily check-ins                       | US storefront                                 | Not offered                                                                                                        | No                      | No                   |
| New sharing grant                     | US storefront; player, coach or club; ≤1 year | US storefront + both consents; coach or club coaching staff only; ≤90 days; pending until the guardian approves it | No                      | No                   |
| Revoke a grant, withdraw, delete data | Always                                        | Always (teen or guardian)                                                                                          | Always                  | Always               |
| Read someone else's shared Health     | With an effective grant                       | No                                                                                                                 | No                      | No                   |
| Guardian sees                         | Not applicable                                | Status, enabled categories, grants (who, until when), pending requests; never values                               | Status only             | Not applicable       |

Refusals carry a typed reason (`HealthRefusalReason`: `birth-date-required`,
`under-13`, `juniors-paused`, `region-not-supported`, `region-unknown`,
`teen-opt-in-required`, `guardian-approval-required`,
`not-offered-to-minors`, `adult-viewer-required`) returned in the tRPC error
as `data.healthReason`, and from `player.health.eligibility` for every action
at once, so the app can explain them.

**Kill switch.** The registry flag `health.juniors` (`@duna/core/flags`,
default on) turns the 13-to-17 path off without a deploy. When off, minors are
refused (reason `juniors-paused`), minors' grants stop being readable, and
deleting is still allowed. Like every registry flag, an unreadable flag table
falls back to the default (on).

## Consent flow for a 13-to-17-year-old

1. On their own iPhone and signed-in Duna session, the teen reads the opt-in
   text (`HEALTH_TEEN_OPT_IN_TEXT`) and agrees (`player.health.optIn`).
2. A linked guardian, signed in as themselves, reads
   `HEALTH_GUARDIAN_APPROVAL_TEXT` and approves (`player.health.guardianApprove`).
   The guardian must be an adult by their own birth date today and their
   guardianship must be in a state listed in `HEALTH_GUARDIAN_LINK_STATUSES`
   (default: `verified` only).
3. Only then does the server accept samples. The app asks HealthKit only for
   the four allowed types (the native module filters the read types by the
   server's allowlist), and the server drops any other metric before
   encryption.
4. Each grant the teen proposes is stored `pending` and unreadable until a
   linked adult guardian approves it (`player.health.guardianDecideGrant`),
   naming the recipient, categories, uses and expiry. Approval never extends
   the expiry; a new grant needs a new approval.

Every act is an append-only row in `health_consents`: subject, actor, role
(subject or guardian), kind (collection or grant), decision (granted, denied,
withdrawn), grant id, the subject's age band at the time, policy version, the
SHA-256 of the text shown, IP address and time. Consent counts only under the
current policy version, only after the most recent withdrawal, and a
guardian's approval counts only while that person is still a linked adult
guardian.

**Withdrawal.** The teen (`player.health.withdraw` or Disconnect) or any linked
guardian (`player.health.guardianWithdraw`) can withdraw at any time. Consent
resets at once, so the next sync is refused; every grant is revoked
immediately; the connection is paused and its imported data is scheduled for
deletion by the next daily retention run (Disconnect deletes immediately).
Syncing can restart only after the purge and fresh consents.

**Birthdays.** At 13, the player must opt in afresh (no earlier consent
exists). At 18, the adult rules apply automatically; grants a guardian
approved stop being readable, and guardian visibility ends because guardian
links are read only for minors.

## US-only mechanism and its limits

With each sync, check-in, new grant and eligibility call, the app sends the
App Store storefront country that StoreKit reports
(`Storefront.current.countryCode`, ISO alpha-3, read by
`apps/player/modules/duna-health-kit`). The server stores the last reported
value and time on `health_connections` (`storefront_country`,
`storefront_reported_at`) and refuses sync, check-ins and new grants unless it
is `USA` (`HEALTH_ALLOWED_STOREFRONTS`). A missing value is refused
(`region-unknown`), so builds older than this change cannot sync. Existing data
stays viewable and deletable outside the US. Every refusal by region is
audited (`health.refused_region`, without the country value).

Limits, stated plainly:

- **The value comes from the client and can be spoofed.** A modified client
  can send `USA`. It is a policy control, not a security boundary.
- The storefront follows the Apple Account's App Store region, not where the
  person is. US account holders travelling abroad stay eligible; a non-US
  resident with a US account passes.
- Device region settings and IP addresses are not used: both are easy to change
  or misleading for travellers.
- Limiting the Player app's App Store availability to the US (owner decision
  E6) is the complementary control and is set in App Store Connect, not code.

## Retention

A daily job (`/api/cron/health-retention`, 04:40 UTC, `apps/web/vercel.json`)
runs `runHealthRetention`:

- deletes Health samples that started more than **24 months** ago, and more
  than **12 months** ago for anyone under 18 today (by birth date); daily
  check-ins follow the same windows;
- finishes withdrawals: deletes every sample and check-in of a connection whose
  purge was requested, revokes remaining grants, marks it revoked;
- corrects the stored `people.age_band` / `is_minor` columns from birth dates
  for code that filters on them in SQL.

It works in bounded batches (`HEALTH_RETENTION_BATCH_SIZE`,
`HEALTH_RETENTION_MAX_BATCHES`), is idempotent (each step deletes only rows
that still match, and an unfinished run continues next day), records counts in
`health_retention_runs`, and writes one `health.retention_purged` audit entry
with counts only. Logs carry counts only.

Disconnect deletes immediately; account deletion keeps its 7-day recovery
window then purges (`packages/api/src/account-deletion.ts`). Consent rows and
audit entries contain no Health values and are kept as the compliance record.

## Storage and key management (unchanged)

- `HEALTH_DATA_ENCRYPTION_KEY` is a base64-encoded 32-byte server secret. The
  API derives separate payload-encryption and external-ID HMAC keys.
- Values, units, sleep states, workout details and check-in answers are stored
  inside AES-256-GCM ciphertext. Only person, metric, sample kind, time range,
  key version and the keyed external-ID hash remain queryable.
- TLS protects transit. Database columns, logs, analytics, crash reports, Mux
  metadata, notifications and audit entries never receive clear Health values.
- Health data is not placed in iCloud. Local anchors live in the iOS Keychain
  through SecureStore and contain no Health values.
- Key rotation adds a key version and keeps controlled decrypt access until old
  rows are re-encrypted. Never replace the production key in place.
- HealthKit access is read-only (`toShare: []`); Duna never writes to Apple
  Health.

## Who sees what

| Viewer                              | Required grant                                                            | Relationship recheck on every read                                                                    | Scopes                             |
| ----------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Owner                               | None                                                                      | Signed-in person is the owner and their band allows viewing                                           | Summary, timeline, video overlay   |
| Selected player (adult owners only) | Active player grant                                                       | Current follow or teammate relationship; viewer is an adult                                           | Granted categories and scopes only |
| Selected coach                      | Active coach grant; approved by a guardian if the owner is a minor        | Coach remains active at one of the owner's clubs                                                      | Granted categories and scopes only |
| Club                                | Active organization grant; approved by a guardian if the owner is a minor | Owner still affiliated; viewer is active owner, manager or coach staff (coach staff only for a minor) | Granted categories and scopes only |
| Guardian of a minor                 | Not a data viewer                                                         | Linked guardian                                                                                       | Status and grants, no values       |
| Anonymous or public viewer          | Never                                                                     | Not applicable                                                                                        | None                               |

Readiness, Strain and correlations shown to a grantee are derived only from
the categories that grantee may see; for an owner under 18 they are not shown
to grantees at all (the minor alone sees them). Public profile status, public video
status, share links, staff scopes and ordinary club membership never grant
Health access.

## Forbidden uses (all ages)

Advertising or marketing; sale, or sharing for ads or with data brokers;
profiling for eligibility, selection, pricing, insurance or employment;
training any machine-learning model; sending Health data to third-party AI or
LLM services; research. Consent cannot unlock these without a new policy
version and counsel sign-off.

## Audit entries

Existing: `health.sync_completed` (counts, now including dropped metrics),
`health.check_in_saved`, `health.sharing_granted`, `health.sharing_revoked`,
`health.profile_viewed`, `health.video_overlay_viewed`, `health.disconnected`.
Added in H1: `health.teen_opted_in`, `health.guardian_approved`,
`health.sharing_requested`, `health.sharing_approved`, `health.sharing_denied`,
`health.sharing_revoked_by_guardian`, `health.consent_withdrawn`,
`health.refused_region`, `health.retention_purged` (system actor, counts
only). No audit reason contains a Health value or a storefront value.

## Threats and controls

- **Public-video disclosure:** playback loads Health only for an authenticated
  owner or revalidated grantee; video visibility and link tokens never
  authorize Health.
- **Stale age:** bands are recomputed from birth dates on every request and the
  stored columns are corrected daily. A stale stored band can only be
  younger than the truth, which errs toward protection.
- **Stale staff or guardian relationship:** coach, club and guardian links are
  rechecked on every read and every approval.
- **Minor over-collection:** server allowlist plus native read-type filter;
  check-ins not offered to minors.
- **Peer disclosure of a minor:** player grants are refused at creation and
  ignored at read time for minor owners.
- **Replay or duplicate import:** person-scoped keyed identifiers and unique
  constraints make import idempotent; anchored deletions remove server rows.
- **Database disclosure:** AES-GCM protects values and detects modification.
- **Log leakage:** audit, cron and error output carry counts and policy
  versions only.
- **Misleading inference:** correlations require at least five resolved matches
  and are labelled as associations, never causation or medical advice.

## Release gates

- Apply migration `0115_health_juniors_policy.sql` (additive) before deploying
  the API that reads its columns.
- Ship the Player build with the storefront read before enabling sync for
  existing users: older builds send no storefront and are refused.
- Keep `HEALTH_DATA_ENCRYPTION_KEY` in the server secret manager only.
- HealthKit capability on the Apple identifier and provisioning profile.
- App Privacy: Health and Fitness collected, linked to identity, App
  Functionality only, not used for tracking. Age-rating questionnaire: Health
  or Wellness topics = yes, Medical = no. Do not use "For Kids" wording.
- Restrict the Player app's App Store availability to the US (owner decision).
- Physical-device testing: each category, denied and partial authorization,
  the four minor types only, storefront outside the US, historical import,
  deletion anchors, withdrawal and purge, grant approval, expiry and
  revocation, removed coach or club relationships, export and disconnect.
- App Review notes: fitness purpose, read-only, metrics by age band, teen
  opt-in plus guardian approval with demo adult and demo guardian-plus-teen
  accounts, time-limited coach and club sharing, the delete path, no ads or
  AI, US-only.

## Not built yet

- Verifiable parental consent for under-13s (COPPA 16 CFR 312.5(b)(2)); until
  it exists, under-13s are refused.
- Guardian review of a minor's values, export or pause controls for guardians.
- Declared Age Range (Apple) cross-check of the self-declared birth date.
- Purge after 12 months without any sync.
- A signed (server-verifiable) storefront claim.

## Open questions for counsel

From the compliance brief (section E), unanswered as of this version:

- Q1. Is a coach or club grant "integral" to the service (COPPA §312.5(a)(2)),
  or does it need separate verifiable parental consent?
- Q2. Is card verification acceptable verifiable parental consent for Health
  specifically, or is a stronger method needed?
- Q3. For a Washington, Nevada or Connecticut minor, who gives "consumer"
  consent: the teen, the guardian, or both?
- Q4. Does enabling Health for minors count as a Texas SB 2420 "significant
  change"?
- Q5. Is Duna a CTDPA controller in scope with no volume threshold because of
  the health data?
- Q6. Do the Colorado and New York minors' rules apply at Duna's size?
- Q7. Is the club Duna's processor or an independent controller once it views
  Health under a grant?
- Q8. Is a separate consumer health data privacy policy required now, given
  Washington users?
- Q9. Does Readiness or Strain shared with coaches count as "profiling" with
  similarly significant effects?
- Q10. Which state breach laws add duties beyond the FTC Health Breach
  Notification Rule for this data?

Owner decisions from the same section that this version assumes: E1 guardians
of 13-to-17-year-olds do not see values; E2 the four-metric minor set; E3 24
and 12 month retention; E4 90-day minor grants; E5 no peer grants for minors;
E6 US-only App Store availability; E7 launch 13 to 17 only, under-13s blocked.
