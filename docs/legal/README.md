# Duna legal center: drafting notes

Status: drafts for attorney review, 27 November 2026, version `1.0-draft`. Not legal advice. The drafts live in `apps/web/content/legal/` with a manifest in `index.json`. No page links to them yet; the published documents remain `apps/web/lib/legal-documents.ts` (version `2026-08-04`). The payout spec is `docs/plan/payout-policy.md`.

Code facts were read from `origin/main` at `a11b21a`. Paths below are relative to the repository root.

## (a) Placeholders the owner must supply

| Placeholder                                     | Where                                          | Notes                                                                                                                                                                                                     |
| ----------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[confirm legal entity]`                        | every document                                 | The product says "Beach Elite LLC d/b/a Duna" (`apps/web/app/layout.tsx:77`, `apps/web/lib/legal-documents.ts:31`, `docs/OPERATIONS.md:248`). Confirm the entity, state of formation and the d/b/a filing |
| `[Duna mailing address]`                        | every document                                 | Also needed for CAN-SPAM, Stripe Tax head office and the DMCA agent. `docs/OPERATIONS.md` says not to invent it                                                                                           |
| `[State of governing law]`, `[County, State]`   | terms §20–22, hq-terms §20                     |                                                                                                                                                                                                           |
| Arbitration choice                              | terms §20 (Alternative A or B), hq-terms §20.2 | Current published terms impose no arbitration                                                                                                                                                             |
| Arbitration forum and fee threshold `$[amount]` | terms §20.4A                                   | AAA or JAMS                                                                                                                                                                                               |
| `[DMCA agent name]`, phone, copyright email     | copyright §2                                   | Register at the Copyright Office directory ($6, renew every 3 years)                                                                                                                                      |
| `[SMS program name]`                            | messaging §3.1                                 | Must match the 10DLC campaign registration                                                                                                                                                                |
| Quiet hours                                     | messaging §6                                   | Code: `packages/api/src/messaging.ts:33-50`                                                                                                                                                               |
| Toll-free number for privacy requests           | privacy §11.2                                  | Some states require two methods; email plus in-app may be enough (counsel)                                                                                                                                |
| `[GPU hosting provider]`                        | subprocessors                                  | Vision worker host not identified in the repo                                                                                                                                                             |
| Contacts                                        |                                                | Existing addresses used: legal@, privacy@, support@duna.coach. Proposed new: copyright@duna.coach                                                                                                         |

## (b) Owner decisions, with the default drafted

| #   | Decision                                                  | Default in the drafts                                                                                                                                                                                                                        | Where                                                        |
| --- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| O1  | Service Fee on refunds                                    | Returned when the club cancels or does not deliver, or on Duna error; kept when the player cancels within policy; disclosed at checkout                                                                                                      | fees-and-premium §2.6, booking-and-refunds §2, duna-pay §9.4 |
| O2  | Processing cost on refunds                                | Borne by the organization (Duna by its own errors)                                                                                                                                                                                           | duna-pay §9.4                                                |
| O3  | Program, camp, league release                             | Pro-rata per session after it ends; weekly portions with no schedule; optional 25% start tranche for organizations with 90 days' history, refund rate < 5%, dispute rate < 0.75%                                                             | duna-pay §6.2–6.3; spec Note B                               |
| O4  | Multi-day events                                          | Released at the end of the last day for events ≤ 7 days; longer events treated as programs                                                                                                                                                   | duna-pay §6.2; spec Note A                                   |
| O5  | Credit-pack release                                       | On settlement + 3 business days, with a 20% Unredeemed Credit Reserve; redemption-based for the first 90 days                                                                                                                                | duna-pay §7.4; spec Note D                                   |
| O6  | Rolling reserve                                           | 10% for 90 days when triggered; max 180 days; reviewed every 30 days                                                                                                                                                                         | duna-pay §7.3                                                |
| O7  | First-payout delay                                        | 7 days after first payment                                                                                                                                                                                                                   | duna-pay §7.1                                                |
| O8  | Default payout schedule                                   | Daily (needed for the 3-business-day promise)                                                                                                                                                                                                | duna-pay §8                                                  |
| O9  | Goods                                                     | Ship or pick-up time stated; 30 days if not; buyer may cancel after that; returns per club policy with defective/not-described floor                                                                                                         | booking-and-refunds §2.5, §3                                 |
| O10 | Refund floor for clubs                                    | Full refund incl. Service Fee when club cancels, does not deliver or makes a material change (60+ minutes, venue, format, named coach); under-filled sessions refunded; policy shown before purchase; refunds started within 5 business days | booking-and-refunds §2                                       |
| O11 | Partly used credit packs                                  | Refund at least unused credits at the per-credit price paid                                                                                                                                                                                  | fees-and-premium §4.6                                        |
| O12 | Closure holds                                             | 60 days for players to claim credit refunds; remainder released 120 days after last sale                                                                                                                                                     | duna-pay §17                                                 |
| O13 | Dispute evidence deadline                                 | 7 days                                                                                                                                                                                                                                       | duna-pay §10.2                                               |
| O14 | Premium refunds                                           | No refund for unused period; pro-rata if a main feature is removed; NY 14-day rule on unagreed price increases                                                                                                                               | fees-and-premium §3.7, §3.10                                 |
| O15 | Premium on iOS                                            | Offer by in-app purchase alongside US web link (see fees-and-premium note)                                                                                                                                                                   | fees-and-premium §3.11 note                                  |
| O16 | Juniors' video removal on Guardian request                | Within 7 days                                                                                                                                                                                                                                | guardians-and-youth §6.3                                     |
| O17 | Health retention and minors (from the health brief E1–E7) | 24 months adults, 12 months teens; teen metric set; 90-day teen shares; no teen peer shares; Guardians do not see teen values by default; under-13 blocked                                                                                   | consumer-health-privacy                                      |
| O18 | Children's inactivity deletion                            | Ask after 24 months, delete 30 days later if no answer                                                                                                                                                                                       | childrens-privacy §8                                         |
| O19 | COPPA consent method                                      | Card verification through Stripe (16 CFR 312.5(b)(2)(ii))                                                                                                                                                                                    | childrens-privacy §6                                         |
| O20 | Staff minimum age                                         | 18                                                                                                                                                                                                                                           | hq-terms §3.4                                                |
| O21 | Domain ownership for club sites                           | Registered in the club's name or transferred on request                                                                                                                                                                                      | hq-terms §10.3                                               |
| O22 | Processing-cost rates as published rates                  | 3% + $0.35 online; 2.8% + $0.15 in person; ACH 1% capped at $6 (from `packages/pricing/src/index.ts:224-260`)                                                                                                                                | duna-pay §4.2                                                |

## (c) Questions for counsel

1. **Arbitration:** Alternative A (arbitration, class waiver, opt-out) or B (courts only), for consumers and for organizations?
2. **Minors and arbitration:** given the split (e.g. Pennsylvania 2025 trampoline-park cases), should Juniors' personal-injury claims be carved out as drafted?
3. **Limited payment collection agent:** does the "limited agent" language, with destination charges where Duna is the platform of record until `on_behalf_of` applies, avoid state money-transmitter licensing?
4. **Merchant of record:** charges settle on the platform when an organization's card-payments capability is not active (`payments.ts:52-63`). Should Duna block sales until it is active?
5. **Marketplace facilitator:** in which states is Duna the facilitator for goods, admissions and taxable services? The code sets tax liability to the platform (`packages/api/src/tax-policy.ts:78-83`).
6. **All-in pricing:** under California SB 478 (and MN, MA, CO, OR, CT, VA), must the 7.5% Service Fee be included in every displayed price, and can a fee included in the price be non-refundable on player cancellation?
7. **FTC fees rule:** are tournament entries or event tickets "live-event tickets" under 16 CFR 464?
8. **Auto-renewal:** do the Premium and organization membership flows meet ROSCA, the California ARL (AB 2863) and NY GBL 527-a, including annual reminders and price-change notice timing?
9. **Apple:** can Duna Premium be sold only on the web and unlocked in the iOS app, or must in-app purchase be offered (Guideline 3.1.1, 3.1.3(b))?
10. **Credits:** are dollar-denominated club credits "gift certificates" under the CARD Act and California Civ. Code 1749.5? Is the no-expiry rule for paid packs sufficient? Who holds escheat duties if a club closes?
11. **Prediction games:** free credits with no cash value and no prizes: any gambling or sweepstakes issue, and should they be age-gated?
12. **Reserves:** do the reserve triggers and notice terms satisfy Stripe's requirement that a platform's terms "clearly explain" its reserve policy?
13. **Health (brief Q1):** is a coach or club grant "integral" to the service under COPPA §312.5(a)(2)?
14. **Health (brief Q2):** is card verification acceptable verifiable parental consent for Health?
15. **Health (brief Q3):** for a WA, NV or CT minor, who gives consumer-health consent: the teen, the Guardian or both?
16. **Health (brief Q4):** is enabling Health for minors a Texas SB 2420 "significant change"?
17. **Health (brief Q5):** is Duna a Connecticut controller in scope with no volume threshold because it processes health data?
18. **Health (brief Q6):** do Colorado's and New York's minors' rules apply at Duna's size?
19. **Health (brief Q7):** is a club Duna's processor or an independent controller when it views Health data under a grant (and, generally, the roles in the HQ data processing addendum)?
20. **Health (brief Q8):** is a separate consumer health data privacy policy required now, given Washington users?
21. **Health (brief Q9):** are Readiness or Strain scores shared with coaches "profiling" with similarly significant effects?
22. **Health (brief Q10):** which state breach laws add duties beyond the FTC Health Breach Notification Rule?
23. **Parent-signed waivers:** should Duna require state-specific waiver templates for minors, given that FL and NJ do not enforce parent pre-injury releases for commercial activities?
24. **Guardian indemnity:** is the Guardian indemnity in terms §18 enforceable?
25. **SMS:** does the messaging consent language meet TCPA and the FCC's 2026 revocation order (category-specific STOP), and CTIA requirements?
26. **Retention periods:** confirm 7 years for financial records and 6 years for consents and safeguarding reports.
27. **State privacy notices:** is the single US-wide rights section enough, or are state-specific sections required?

## (d) Engineering gap list (drafts describe behaviour the code does not have)

Ordered by importance. "Blocking" means the draft must not take effect until it ships or the draft is changed.

| #   | Gap                                                                                                                                                                                       | Code today                                                                                                                                                                    | Blocking                                               |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| G1  | No acceptance of consumer terms or privacy policy is recorded at player sign-up; sign-up shows no terms link                                                                              | `apps/web/app/sign-up/page.tsx`, `components/branded-auth-entry.tsx`; `legal_acceptances` only written for `hq-terms` (`packages/api/src/organization-onboarding.ts:162-185`) | Yes                                                    |
| G2  | `legal_acceptances.document_key` CHECK allows only four keys; new documents (duna-pay, guardians-and-youth, fees-and-premium) cannot be recorded                                          | `packages/db/drizzle/0038_dashing_paper_doll.sql:13`                                                                                                                          | Yes                                                    |
| G3  | Release is tied to event start minus refund window, not delivery (end time); no session-based release for programs                                                                        | `packages/api/src/money-service.ts:313-350`; `schema.ts:9370-9420`                                                                                                            | Yes (payout-policy P1, P2)                             |
| G4  | Disputes: no transfer reversal, fee handling, ledger journal or evidence; HQ lists disputes from the connected account, where destination-charge disputes do not appear                   | `money-service.ts:1863-1941`; `payments.ts:2099, 2267-2277`                                                                                                                   | Yes (P3)                                               |
| G5  | No negative-balance recovery, set-off, reserves, first-payout delay, or closure handling                                                                                                  | none                                                                                                                                                                          | Yes (P4, P8, P10, P11)                                 |
| G6  | Service Fee refunded on every refund; player event cancellation refunds full total; processing estimate returned on refunds                                                               | `catalog-service.ts:8335-8342`; `player-bookings.ts:116-157`                                                                                                                  | Yes if O1/O2 kept (P5)                                 |
| G7  | Player court-booking cancellation never refunds automatically                                                                                                                             | `player-bookings.ts:306-351`                                                                                                                                                  | Yes (P6)                                               |
| G8  | Under-13 self-sign-up is possible; no birth date before account creation; no COPPA verifiable consent method; dependant consent is self-attested                                          | `packages/api/src/identity.ts:328-513`                                                                                                                                        | Yes                                                    |
| G9  | Health: adult-only today (good), but no time-based retention (24/12 months, 12-month inactivity), no teen flow, no US storefront check                                                    | `packages/api/src/health-service.ts`; `auth.ts:75`; health brief D1–D13                                                                                                       | Retention: yes. Teen flow: drafts say "when available" |
| G10 | Account deletion skips new messaging tables, attachments, push devices, channel bindings, Ask Duna conversations, `playerPublicProfiles`, `playerMediaWorkflows`; `people` row tombstoned | `packages/api/src/account-deletion.ts:381-626`                                                                                                                                | Yes (privacy §8)                                       |
| G11 | All-in price display including the Service Fee (California etc.)                                                                                                                          | `payments.ts:1181-1205` shows a separate line                                                                                                                                 | Yes for CA users (counsel Q6)                          |
| G12 | Duna Premium: no annual renewal reminder, no price-change notice, no free-trial reminders; Customer Portal disables cancel (in-app cancel exists)                                         | `packages/api/src/membership.ts:551-593`; `payments.ts:1452-1486`                                                                                                             | Yes for CA/NY                                          |
| G13 | Premium not offered by in-app purchase in iOS                                                                                                                                             | no StoreKit code in `apps/player`                                                                                                                                             | Apple review risk                                      |
| G14 | Daily payout schedule hidden in HQ; no 3-business-day monitor                                                                                                                             | `apps/hq/components/money-workspace.tsx:419-423`                                                                                                                              | Yes (P7)                                               |
| G15 | Goods: no tracking number, ship-by date, auto-cancel offer or fulfilment-driven release                                                                                                   | fulfilment statuses `schema.ts:8806-8812`                                                                                                                                     | Yes (P9)                                               |
| G16 | Partly used credit packs cannot be refunded; operator can refund to credits without the player's choice; no Unredeemed Credit Reserve                                                     | `catalog-service.ts:8218-8253`                                                                                                                                                | Yes (P8, P14)                                          |
| G17 | Membership release does not honour `full-within-window` length                                                                                                                            | `workflows.ts:1255-1262`                                                                                                                                                      | Medium (P12)                                           |
| G18 | Possible double platform fee on native recurring memberships                                                                                                                              | `payments.ts:815-829, 924-944`; `workflows.ts:1117-1133`                                                                                                                      | Defect (P13)                                           |
| G19 | SMS STOP handled only on the iMessage channel; no HELP auto-reply; no marketing-email unsubscribe handler                                                                                 | `sendblue-ingress.ts:57`; no `List-Unsubscribe`                                                                                                                               | Yes before texts go live                               |
| G20 | Voice onboarding has no age gate; support agent treats unknown age as allowed                                                                                                             | `apps/web/app/api/livekit/token/route.ts`; `duna-ai-support.ts:421`                                                                                                           | Yes (terms §12, guardians §8)                          |
| G21 | Cookie Policy says no analytics; but the video player loads playback analytics (Mux Data `envKey`) and map iframes on public pages                                                        | `apps/web/components/duna-video-gallery.tsx:357-362`; `apps/web/app/events/[slug]/page.tsx:873`                                                                               | Disclosed as third parties; consider `disableTracking` |
| G22 | Guardian removal of Junior video within 7 days: no workflow                                                                                                                               | none                                                                                                                                                                          | Medium                                                 |
| G23 | Copyright: no DMCA notice intake or repeat-infringer tracking                                                                                                                             | none                                                                                                                                                                          | Yes before relying on safe harbour                     |
| G24 | Reports exist only for messages; no reporting on profiles, videos or results                                                                                                              | `messaging-service.ts:3815`                                                                                                                                                   | Medium (acceptable-use §7)                             |
| G25 | Prediction market has no age gate                                                                                                                                                         | `packages/api/src/prediction-market.ts`                                                                                                                                       | Counsel Q11                                            |
| G26 | Subprocessor change notifications to organization owners                                                                                                                                  | none                                                                                                                                                                          | Medium (hq-terms Annex A.6)                            |
| G27 | HQ Annex A: export for 30 days after termination and deletion within 60 more days                                                                                                         | no organization closure or deletion flow                                                                                                                                      | Medium                                                 |
| G28 | Unclaimed imported profiles created with `ageBand unknown`, `isMinor false`; a junior in public results could be misclassified                                                            | `packages/api/src/sand-data/service.ts:957-967`                                                                                                                               | Medium                                                 |

Conflicts between the current published copy (`apps/web/lib/legal-documents.ts`) and the code, now corrected in the drafts: acceptance on account creation (not recorded); "limited analytics" and a consent banner (neither exists); WhatsApp and RCS marketing (disabled); identity verification for age-restricted features (payouts only); "administrators" as an HQ role (no such role); HQ terms version `2026-08-20` recorded versus `2026-08-04` published.

## (e) Sources

Stripe

- Connected Account Agreement and suggested platform language: <https://docs.stripe.com/connect/updating-service-agreements>, <https://stripe.com/connect-account/legal/full>, <https://stripe.com/legal/ssa>
- Destination charges, refunds, disputes: <https://docs.stripe.com/connect/destination-charges>
- Risk and negative balances: <https://docs.stripe.com/connect/risk-management>
- Reserves (max 180 days; terms must explain the policy): <https://docs.stripe.com/connect/connected-account-reserves>
- Manual payouts (US funds up to 2 years; no escrow): <https://docs.stripe.com/connect/manual-payouts>
- Restricted businesses: <https://stripe.com/legal/restricted-businesses>

Auto-renewal and fees

- FTC negative option rulemaking restarted (ANPRM March 2026): <https://www.gibsondunn.com/ftc-restarts-negative-option-rulemaking-after-eighth-circuit-vacatur-enforcement-under-rosca-continues/>
- ROSCA, 15 U.S.C. 8403: <https://www.law.cornell.edu/uscode/text/15/8403> (unverified this session)
- California ARL (AB 2863): <https://btlaw.com/en/insights/alerts/2025/california-expands-automatic-renewal-law-new-requirements-now-in-effect>
- New York GBL 527-a: <https://www.nysenate.gov/legislation/laws/GBS/527-A>
- FTC fees rule FAQ: <https://www.ftc.gov/business-guidance/resources/rule-unfair-or-deceptive-fees-frequently-asked-questions>
- California SB 478 AG FAQ: <https://oag.ca.gov/system/files/attachments/press-docs/SB%20478%20FAQ%20%28B%29.pdf>
- Other state fee laws: <https://www.bakerlaw.com/insights/2025-year-in-review-junk-fee-laws/>

Privacy, children and health

- COPPA amended rule: <https://www.federalregister.gov/documents/2025/04/22/2025-05904/childrens-online-privacy-protection-rule>; <https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-312>
- Washington MHMDA: <https://app.leg.wa.gov/RCW/default.aspx?cite=19.373&full=true>; Nevada SB 370: <https://legiscan.com/NV/text/SB370/id/2825632/Nevada-2023-SB370-Enrolled.pdf>; comparison: <https://fpf.org/wp-content/uploads/2023/06/NV_WA-Comparison-Chart-FINAL.pdf>
- Universal opt-out signals by state (secondary): <https://www.haynesboone.com/news/publications/george-and-dargan-for-reuters-global-privacy-control-what-businesses-need-to-know.pdf>
- FTC Health Breach Notification Rule: <https://www.ftc.gov/business-guidance/resources/complying-ftcs-health-breach-notification-rule-0>
- Health and juniors sources: see the health brief (Apple HealthKit, App Review 5.1, CT, CO, NY, design codes)

Messaging

- CAN-SPAM guide: <https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business>
- FCC one-to-one rule vacated: <https://www.mofo.com/resources/insights/250130-eleventh-circuit-vacates-fcc-s-tcpa-one-to-one-consent-rule>
- FCC 2026 revocation order (secondary; confirm in the Federal Register): <https://www.nelsonmullins.com/insights/alerts/fcc-download/all/fcc-adopts-overhaul-of-tcpa-consent-revocation-rules-revoke-all-narrowed-exclusive-opt-out-methods-permitted-and-fraud-alert-exemption-expanded>
- CTIA Messaging Principles: <https://api.ctia.org/wp-content/uploads/2023/05/230523-CTIA-Messaging-Principles-and-Best-Practices-FINAL.pdf>

Copyright

- DMCA agent directory: <https://www.copyright.gov/dmca-directory/>, <https://www.copyright.gov/dmca-directory/faq.html>

Apple

- App Review Guidelines 3.1.1, 3.1.3: <https://developer.apple.com/app-store/review/guidelines/>
- Ninth Circuit, Epic v. Apple (Dec 2025): <https://cases.justia.com/federal/appellate-courts/ca9/25-2935/25-2935-2025-12-11.pdf>
- Supreme Court docket 25-1311: <https://www.supremecourt.gov/search.aspx?filename=/docket/docketfiles/html/public/25-1311.html>

Goods, tax, credits

- FTC Mail Order Rule: <https://www.ftc.gov/business-guidance/resources/business-guide-ftcs-mail-internet-or-telephone-order-merchandise-rule>
- Marketplace facilitator overview (secondary): <https://stripe.com/resources/more/marketplace-facilitator-laws>
- Reg E gift cards, 12 CFR 1005.20: <https://www.consumerfinance.gov/rules-policy/regulations/1005/20/>
- California Civ. Code 1749.5: <https://california.public.law/codes/ca_civ_code_section_1749.5>

Arbitration and minors

- AAA mass arbitration: <https://www.adr.org/rules-forms-and-fees/mass-arbitration>; JAMS: <https://www.jamsadr.com/MASS-ARBITRATION-PROCEDURES>
- Chabolla v. ClassPass (9th Cir. 2025): <https://library.nclc.org/sites/default/files/field_media_file/2025-04/Chabolla_v_ClassPass.pdf>
- Pennsylvania Supreme Court on parent-signed arbitration (2025): <https://cases.justia.com/pennsylvania/supreme-court/2025-24-eap-2023.pdf>

Items marked unverified in the research: ROSCA text, CA ARL price-change notice timing, NY 527-a effective date, Virginia fee statute, per-state teen opt-in rules, per-state facilitator rules, CTIA 2025 revision, an October 2026 App Review revision.

## (f) Placeholders shown as “To be confirmed” on duna.coach/legal

Added 28 November 2026 with the legal center (`apps/web/app/legal`, work package L2). Every draft above is now published at `/legal/<slug>` (or at `/legal/<slug>/draft` for Terms, Privacy and HQ Terms, whose 2026-08-04 versions stay in effect at their own address). Each index entry has a `status` (`draft` | `in-effect`); drafts show "Draft for review. Not yet in effect.", are `noindex` and stay out of the sitemap.

The page never shows a bracketed field as final text: `apps/web/components/legal/legal-markdown.ts` turns every bracket that is not a link (and TODO / TBD) into a marked "To be confirmed" span, and every drafting-note block quote into a "Note for review. Not part of the text." aside. `legal-library.test.ts` fails if a document marked `in-effect` still has any of them or has no ISO `effectiveDate`. The list below is generated by that scanner (kind | where | text); "frontmatter" is the `effectiveDate: [to be set when approved]` every draft carries.

**Duna Legal Center** (`legal-center`, 2)

- frontmatter, Front matter: effectiveDate: [to be set when approved]
- field, Contact: Duna mailing address

**Duna Terms of Service** (`terms`, 15)

- frontmatter, Front matter: effectiveDate: [to be set when approved]
- note, 1. About these terms: Confirm legal entity name: Beach Elite LLC is the name used in the product today.
- field, 1. About these terms: Duna mailing address
- note, 5. Ages, Guardians and Juniors: Engineering gap: not built; see `docs/legal/README.md`.
- note, 6. Duna is a platform; Organizations are independent: Counsel: confirm limited-agent language and state money-transmission position.
- note, 13. Prediction games: Counsel: confirm no state gambling or sweepstakes issue; decide whether to age-gate.
- note, 18. Indemnity: Counsel: confirm enforceability against Guardians.
- review-note, 20. Disputes: Counsel to choose Alternative A or Alternative B. The current published terms impose no arbitration.
- field, 20. Disputes: American Arbitration Association (AAA) Consumer Arbitration Rules / JAMS Streamlined Rules, counsel to choose
- field, 20. Disputes: amount
- note, 20. Disputes: Counsel: state law is split on whether a parent can bind a child to arbitration.
- field, 20. Disputes: County, State
- note, 20. Disputes: Counsel: assess enforceability of a class waiver without arbitration.
- field, 22. General: State of governing law
- field, 22. General: Duna mailing address

**Guardian and Youth Terms** (`guardians-and-youth`, 5)

- frontmatter, Front matter: effectiveDate: [to be set when approved]
- note, 2. How a Guardian is linked: Engineering note: today, review is by Duna staff; see `docs/legal/README.md`.
- note, 6. Photos and video of Juniors: Owner: confirm 7 days.
- note, 8. AI features and Juniors: Engineering gap: no age check on voice onboarding today.
- note, 10. How consent is given and withdrawn: Owner: method to be chosen; see `docs/legal/README.md`.

**Player Fees and Duna Premium** (`fees-and-premium`, 7)

- frontmatter, Front matter: effectiveDate: [to be set when approved]
- note, 2. The Service Fee: Owner: confirm the rate; it is set in code at 7.5%.
- note, 2. The Service Fee: Engineering gap: all-in prices are not shown today.
- note, 2. The Service Fee: Owner decision; the code today refunds the Service Fee on every refund. California and other all-in pricing laws may limit a non-refundable fee: counsel question.
- note, 3. Duna Premium: Engineering gap: reminders and price-change notices are not sent today.
- review-note, 3. Duna Premium: Note for the owner (not part of the published terms): Apple's rules for Duna Premium in the iOS app. Duna Premium unlocks digital feature…
- note, 4. Credits and credit packs: Engineering gap: partly used packs cannot be refunded today.

**Booking and Refund Policy** (`booking-and-refunds`, 3)

- frontmatter, Front matter: effectiveDate: [to be set when approved]
- note, 2. The Duna Floor: Owner: confirm 60 minutes
- note, 10. Asking for help: Engineering gaps: player cancellation of court bookings does not refund automatically today; the Service Fee is refunded on every refund today; goods ship-by dates are not tracked. See `docs/legal/README.md`.

**Duna HQ Terms** (`hq-terms`, 11)

- frontmatter, Front matter: effectiveDate: [to be set when approved]
- field, 1. The agreement: confirm legal entity
- note, 3. Authorized Users: Owner: confirm; Juniors should not hold staff roles.
- note, 7. Data: Counsel: controller or processor role for the club when viewing a grant.
- note, 10. Club websites: Owner: confirm domain ownership model.
- field, 12. Team features: Not available today.
- note, 20. Disputes, law and general terms: Counsel to choose: (A) binding arbitration under the [AAA Commercial Arbitration Rules] in [City, State], with no class or consolidated proceedings; or (B) exclusive jurisdiction of the state and federal courts in [County, State].
- field, 20. Disputes, law and general terms: State of governing law
- field, 20. Disputes, law and general terms: Duna mailing address
- review-note, Annex A: Data Processing Addendum: Roles in this Annex are drafted for counsel to confirm (counsel question C7).
- note, Annex A: Data Processing Addendum: Owner/counsel: confirm 72 hours.

**Duna Pay Terms** (`duna-pay`, 12)

- frontmatter, Front matter: effectiveDate: [to be set when approved]
- note, 4. Fees: Owner: these are Duna's estimates, built into code; confirm they are the published rates.
- note, 5. How payments flow: Counsel: confirm.
- note, 5. How payments flow: Engineering note: today this applies only when the account's card-payments capability is active.
- note, 6. When Proceeds are released: Owner: thresholds.
- note, 7. Holdbacks and reserves: Owner: 7 days.
- note, 7. Holdbacks and reserves: Owner: defaults.
- note, 7. Holdbacks and reserves: Owner: 20%.
- note, 8. Payouts: Engineering gap: daily schedule is hidden in HQ today.
- note, 9. Refunds: Owner decision; see `docs/legal/README.md`.
- note, 13. Taxes: Counsel: state-by-state facilitator analysis; the code currently treats Duna as the tax seller for automatic tax.
- note, 17. Suspension and closure: Owner: confirm 60 and 120 days.

**Duna Privacy Policy** (`privacy`, 7)

- frontmatter, Front matter: effectiveDate: [to be set when approved]
- field, 1. Who we are and what this policy covers: confirm legal entity
- field, 1. Who we are and what this policy covers: Duna mailing address
- note, 8. How long we keep it: counsel to confirm
- note, 8. How long we keep it: Engineering gap: account deletion does not yet cover every data type listed; see `docs/legal/README.md`.
- note, 11. Your rights: Owner: add a toll-free number if required.
- field, 15. Contact: Duna mailing address

**Consumer Health Data Privacy Policy** (`consumer-health-privacy`, 4)

- frontmatter, Front matter: effectiveDate: [to be set when approved]
- field, 1. Scope: confirm legal entity
- note, 8. How long we keep it: Engineering gap: automatic time-based deletion is not built yet; today data is kept until you disconnect or delete your account. Must ship before this policy takes effect.
- field, 10. Changes and contact: Duna mailing address

**Children's Privacy Notice** (`childrens-privacy`, 7)

- frontmatter, Front matter: effectiveDate: [to be set when approved]
- field, 1. Who this applies to: confirm legal entity
- field, 1. Who this applies to: Duna mailing address
- note, 2. How a Child comes to be on Duna: Engineering gap: not built.
- note, 6. Verifiable parental consent: Owner: choose the method, for example a card verification through Stripe with a small charge or authorization. See `docs/legal/README.md`.
- note, 8. How long we keep it: Owner: confirm; engineering gap: inactivity deletion not built.
- field, 10. Contact: Duna mailing address

**Cookie Policy** (`cookies`, 1)

- frontmatter, Front matter: effectiveDate: [to be set when approved]

**Service Providers** (`subprocessors`, 8)

- frontmatter, Front matter: effectiveDate: [to be set when approved]
- review-note, Introduction: This is the one place in Duna's product copy where providers are named, because privacy law and our customers' contracts expect it.
- field, 2. Providers: confirm; may be removed
- field, 2. Providers: confirm hosting
- field, 2. Providers: confirm sender configured
- field, 2. Providers: confirm
- field, 2. Providers: GPU hosting provider, to be confirmed
- field, 3. Location: Confirm per provider.

**Acceptable Use and Community Rules** (`acceptable-use`, 1)

- frontmatter, Front matter: effectiveDate: [to be set when approved]

**Messaging and Notifications Terms** (`messaging`, 4)

- frontmatter, Front matter: effectiveDate: [to be set when approved]
- field, 3. Consent to texts: SMS program name
- note, 4. Opting out and help: Engineering gap: STOP handling today covers only the iMessage channel, and marketing email lacks an unsubscribe link handler. See `docs/legal/README.md`.
- note, 6. Quiet hours and blocks: Owner: state the hours, for example 9 pm to 8 am

**Content, Video and Likeness Policy** (`content-and-video`, 1)

- frontmatter, Front matter: effectiveDate: [to be set when approved]

**Copyright and Takedown Policy** (`copyright`, 7)

- frontmatter, Front matter: effectiveDate: [to be set when approved]
- field, 2. Designated agent: DMCA agent name
- field, 2. Designated agent: confirm legal entity
- field, 2. Designated agent: Duna mailing address
- field, 2. Designated agent: Agent phone number
- field, 2. Designated agent: copyright notice email, proposed copyright@duna.coach
- note, 2. Designated agent: Owner: register and renew every 3 years.

**Turning a document on.** When the owner and counsel have settled a document: replace its placeholders in the Markdown, set `effectiveDate` (YYYY-MM-DD) and `version` in its front matter, remove the "Draft for attorney review" banner line if wanted (the page ignores it either way), then change that entry's `"status": "draft"` to `"status": "in-effect"` in `index.json`. That one line makes the page indexable, adds it to the sitemap and, for Terms, Privacy and HQ Terms, replaces the 2026-08-04 version at `/legal/<slug>`. Acceptance records (`legal_acceptances`, gap G1/G2) and the HQ onboarding version string are separate work.

## (g) Cookie Policy against the code (28 November 2026)

Read from the code at the legal-center branch; the Cookie Policy text was not changed. Mismatches for the owner and counsel:

1. **Video playback analytics cookie.** The match-video player (`apps/web/components/duna-video-gallery.tsx`, `@mux/mux-player-react` with `envKey`) runs the provider's playback-analytics script in Duna's own page. That script sets a first-party cookie named `muxData` (a viewer id, long-lived) on duna.coach unless `disableCookies` is set. The policy says "no analytics … cookies" (section 4) and lists video players only as third-party content (section 3). Either set `disableCookies` (and consider `disableTracking`) on the player, or list the cookie.
2. **Map storage on duna.coach.** The discovery map and venue layout viewer (`discovery-map.tsx`, `venue-layout-viewer.tsx`) load the map library inside Duna's page; it writes `mapbox.eventData*` keys to duna.coach local storage for its usage telemetry. Not in the section 2 tables. Section 3 also says maps appear "on event and venue pages"; the discovery page (`/discover`) has one too.
3. **Sign-in verifier cookie.** The sign-in library sets a short-lived `wos-auth-verifier` cookie during sign-in, besides `wos-session`. Strictly necessary; not listed.
4. **Checkout resume.** `duna.catalog-checkout-resume.v1` in session storage (`apps/web/lib/catalog-checkout-resume.ts`) keeps a checkout in progress across sign-in. Not listed.
5. **Public site preferences (SITE-1, 28 November 2026).** The new public site (`apps/web/components/site/boot.ts`) keeps two values in duna.coach local storage, never sent to a server: `duna-site-audience` ("play" or "run": the "I play / I run a club" switch, which changes only the header's call to action) and `duna-site-recent-places` (up to three places the visitor searched, with their map point, for the Where picker). Strictly functional, set only after the visitor acts; no consent banner is needed, but both belong in the section 2 tables.
6. **Library first-open flag.** `td-first-open` (session or local storage, `packages/ui/src/tideline/motion/motion.tsx`) is set only where `FirstOpen` is used; no app uses it yet. List it when one does.
7. Confirmed as described: `wos-session`, `duna-organization-context` (httpOnly, 90 days), `duna-theme`, `duna-ai-recent-player-paths`, `duna-ai-recent-hq-paths`, `duna-action-center-paths-*`, `duna-search-recents-*`, `duna-scoring-device-id`, `duna-score-pending:*`, `ask-duna:draft:*`. No analytics, advertising or tag-manager scripts were found. The `duna-demo-persona` cookie exists only in demo and test runs and is refused in production. Error reporting (when its key is set) sends device details with error reports but sets no cookie.
