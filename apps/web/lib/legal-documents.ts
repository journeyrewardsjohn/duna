export const LEGAL_VERSION = "2026-08-04";
export const LEGAL_EFFECTIVE_DATE = "August 4, 2026";

export interface LegalSection {
  readonly title: string;
  readonly paragraphs: readonly string[];
  readonly bullets?: readonly string[];
}

export interface LegalDocument {
  readonly slug: "terms" | "privacy" | "eula" | "hq-terms";
  readonly shortTitle: string;
  readonly title: string;
  readonly description: string;
  readonly audience: string;
  readonly sections: readonly LegalSection[];
}

export const legalDocuments: readonly LegalDocument[] = [
  {
    slug: "terms",
    shortTitle: "Terms of Service",
    title: "Duna Consumer Terms of Service",
    description:
      "The agreement for players, parents, guardians, spectators, and other people using Duna.",
    audience: "Players, parents, guardians, and consumers",
    sections: [
      {
        title: "1. Agreement and the Duna service",
        paragraphs: [
          'These Terms of Service ("Terms") are a binding agreement between you and Beach Elite LLC, doing business as Duna ("Duna," "we," "us," or "our"). They govern Duna websites, mobile applications, player profiles, ratings, booking and registration tools, wallets, communications, community features, and related services (collectively, the "Service"). By creating an account, clicking acceptance, or using the Service, you agree to these Terms and the Privacy Policy.',
          "Duna provides technology that connects people with independent clubs, coaches, facilities, event organizers, and other users. Unless Duna is identified as the direct seller or host, the relevant organization—not Duna—delivers the event, service, court, merchandise, or membership and is responsible for its descriptions, staffing, safety procedures, cancellation rules, waivers, and legal compliance.",
        ],
      },
      {
        title: "2. Eligibility, minors, parents, and guardians",
        paragraphs: [
          "You must be legally able to enter this agreement. A parent or legal guardian must create, approve, or supervise an account for a minor when required by law or Duna policy. Children under 13 may not independently provide personal information or unlock restricted features; a verified parent or guardian must provide consent and manage the child relationship.",
          "A parent or guardian who manages a child profile represents that they have authority to do so and is responsible for bookings, payments, permissions, waivers, emergency information, and use of funded child wallets. Age-gated features may remain unavailable until guardian consent or age verification is complete.",
        ],
      },
      {
        title: "3. Your account and identity",
        paragraphs: [
          "Provide accurate, current information; protect your sign-in credentials; and promptly report unauthorized access. One person may not impersonate another or create deceptive duplicate identities. You are responsible for activity performed through your account unless you promptly notify us of unauthorized use.",
          "Certain payouts, prizes, tax reporting, age-restricted features, or high-risk activity may require identity verification. A third-party verification provider may collect identity documents and biometric or liveness information under its own terms. Duna generally receives verification status and identifiers rather than a copy of your identity document.",
        ],
      },
      {
        title: "4. Profiles, imported records, and Sand Rating",
        paragraphs: [
          "You may connect public profiles or ask Duna to import competition records from sources such as VolleyballLife, BVBInfo, and professional-tour data providers. You represent that any profile you claim belongs to you or your dependent. Imported records may contain source errors, duplicates, or identity ambiguities.",
          "Sand Rating and related rankings are estimates based on available match data, opponent strength, score margins, recency, confidence, and other disclosed factors. They are not guarantees of ability, eligibility, safety, selection, or future performance. You may flag a result as inaccurate. Duna may temporarily exclude a disputed result from rating calculations while preserving provenance and audit history until review is complete.",
        ],
      },
      {
        title: "5. Bookings, events, teams, and user-created matches",
        paragraphs: [
          "Event pages, divisions, services, court inventory, pickup matches, and tickets may include eligibility rules, team-size requirements, approval requirements, waitlists, waivers, or deadlines. A registration is not final until required roster members, approvals, payments, and forms are complete. A hold or invitation does not guarantee inventory.",
          "A user who hosts a pickup match is responsible for accurate details and lawful conduct. The host may edit or cancel before others join and may remove themselves as permitted by the displayed rules. Once others join, cancellation, refund, and notification rules protect the other participants and may limit unilateral changes.",
        ],
      },
      {
        title: "6. Payments, fees, taxes, refunds, and subscriptions",
        paragraphs: [
          "Prices, taxes, service fees, processing fees, and any organization-specific terms are shown before purchase. By submitting a payment, you authorize Duna and its payment providers to charge the selected method. Payment processing is provided by third parties, including Stripe, and is also subject to their applicable terms.",
          "Refunds, credits, transfers, installments, cancellation windows, and no-show charges follow the terms displayed at checkout and any mandatory law. Organizations may be the merchant of record for their offerings. Duna may correct pricing mistakes before fulfillment and may reverse fraudulent, duplicate, disputed, or erroneous transactions.",
          "Recurring memberships renew at the disclosed interval until cancelled. Cancellation stops future renewal but normally does not retroactively refund an already-started period unless the checkout terms or applicable law require it. Failed payments may be retried and may suspend benefits after notice.",
        ],
      },
      {
        title: "7. Wallets, organization credits, prizes, and payouts",
        paragraphs: [
          "Duna may display cash-related balances, organization credits, promotional value, refunds, and payouts. Cash and payout funds remain on regulated payment rails; Duna does not represent organization credits as cash, a bank deposit, or a transferable stored-value account. Organization credits are closed-loop, usable only with the issuing organization, and may expire or be forfeited only as disclosed by the applicable plan and permitted by law.",
          "Prize or coach payouts may require identity verification, tax information, payout eligibility, and resolution of disputes or holds. Ledger entries are authoritative records of debits and credits, while processor records remain authoritative for custody and settlement.",
        ],
      },
      {
        title: "8. Safety, assumption of risk, and waivers",
        paragraphs: [
          "Sports, training, travel, facilities, weather, equipment, and competition involve risks of serious injury, illness, property damage, or death. You are responsible for evaluating your condition, skill, equipment, environment, and the qualifications of a provider. Stop participation and seek appropriate care when necessary.",
          "Duna is not a medical provider, emergency service, coach-certification body, or facility inspector. An organizer may require a separate waiver or policy. Those terms are between you and the organizer unless Duna expressly states otherwise, and accepting them does not waive rights that cannot lawfully be waived.",
        ],
      },
      {
        title: "9. User content, media, and communications",
        paragraphs: [
          "You retain ownership of content you submit. You grant Duna a worldwide, non-exclusive, royalty-free license to host, reproduce, adapt, display, and distribute that content as needed to operate, secure, and improve the Service and to present content according to your visibility settings. This license ends when content is deleted, except for lawful retention, backups, disputes, and content shared with others.",
          "Do not upload content you lack rights to, private information about others without authority, unlawful material, malware, harassment, sexual exploitation, or misleading commercial content. You consent to transactional messages needed to operate your account. Marketing email, SMS, WhatsApp, RCS, and push messages require the permissions and opt-outs described at collection.",
        ],
      },
      {
        title: "10. AI, maps, recommendations, and availability",
        paragraphs: [
          "Duna may use automated systems to summarize information, recommend actions, infer profile fields from your statements, identify possible matches or churn risk, optimize schedules, or assist organizers. AI output may be incomplete or wrong. Review material decisions before acting; Duna does not use AI output as a substitute for legal, tax, medical, safeguarding, or employment advice.",
          "Maps, geocoding, travel times, availability, and alerts can be delayed or approximate. Confirm the venue, date, time zone, court, surface, access instructions, and organizer before traveling.",
        ],
      },
      {
        title: "11. Acceptable use",
        paragraphs: [
          "You may not misuse the Service, evade eligibility or payment rules, manipulate ratings or results, scrape protected areas, overload systems, reverse engineer restricted software, interfere with another account, use bots without authorization, resell access, facilitate unlawful gambling, discriminate unlawfully, or use Duna to exploit or endanger a minor.",
          "Duna may investigate, preserve evidence, restrict features, remove content, cancel fraudulent transactions, or suspend accounts when reasonably necessary to protect users, organizations, the Service, or the public.",
        ],
      },
      {
        title: "12. Intellectual property and license",
        paragraphs: [
          "Duna and its licensors own the Service, software, design, trademarks, rating methodology implementation, and Duna-created content. Subject to these Terms, Duna grants you a limited, personal, revocable, non-exclusive, non-transferable license to use the Service for its intended purpose. No other rights are granted.",
        ],
      },
      {
        title: "13. Third-party services",
        paragraphs: [
          "The Service may rely on or link to payment, identity, communications, maps, calendar, analytics, app-store, and competition-data services. Their terms and privacy practices apply to their services. Duna is not responsible for independent third-party outages, content, or conduct, but will use reasonable care in selecting and operating material processors.",
        ],
      },
      {
        title: "14. Suspension, termination, and account deletion",
        paragraphs: [
          "You may stop using Duna and may initiate account deletion from Account Settings. Before deletion, you must resolve withdrawable or pending money, active subscriptions, disputes, and ownership of any organization. If eligible organization credits remain, Duna will show the amount and require express acknowledgement of any permitted forfeiture.",
          "When an eligible request is accepted, Duna immediately revokes Health sharing, remote-control sessions, public video visibility, share links, and live updates. Permanent deletion is scheduled seven days later so you can cancel from Account Settings. Cancellation does not automatically recreate grants, links, or public visibility that were revoked for safety.",
          "After the recovery window, Duna deletes the authentication identity, imported Health records, Duna-hosted videos and provider copies, posts, messages, forms, connected-account credentials, and other sensitive service data. Financial, tax, consent, fraud-prevention, safety, dispute, security, and transaction-integrity records may be retained only as reasonably required and are de-identified or access-restricted where possible. Duna may suspend or terminate access for material breach, risk, or legal necessity, with notice when reasonably possible.",
        ],
      },
      {
        title: "15. Disclaimers and limitation of liability",
        paragraphs: [
          'TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE." DUNA DISCLAIMS IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. DUNA DOES NOT GUARANTEE THAT AN EVENT, PROVIDER, PLAYER, RATING, RESULT, FACILITY, OR SERVICE IS ACCURATE, SAFE, AVAILABLE, OR SUITABLE.',
          "TO THE MAXIMUM EXTENT PERMITTED BY LAW, DUNA AND ITS AFFILIATES WILL NOT BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, LOST PROFITS, LOST DATA, OR LOSS OF GOODWILL. DUNA'S AGGREGATE LIABILITY FOR A CLAIM WILL NOT EXCEED THE GREATER OF US$100 OR THE AMOUNT YOU PAID DIRECTLY TO DUNA FOR THE SERVICE GIVING RISE TO THE CLAIM DURING THE 12 MONTHS BEFORE THE EVENT. THESE LIMITS DO NOT APPLY WHERE PROHIBITED OR TO LIABILITY THAT CANNOT LAWFULLY BE LIMITED.",
        ],
      },
      {
        title: "16. Indemnity, disputes, changes, and contact",
        paragraphs: [
          "To the extent permitted by law, you will defend and indemnify Duna from third-party claims arising from your unlawful conduct, content, hosted match, violation of these Terms, or infringement of another person's rights. This does not require indemnity for Duna's own unlawful conduct.",
          "Before filing a claim, contact legal@duna.coach and allow 30 days for informal resolution. These Terms are governed by applicable law, without overriding mandatory consumer protections. Claims may be brought in a court with lawful jurisdiction over the parties and dispute. We have not imposed mandatory arbitration in this version.",
          "We may update these Terms for new features, legal requirements, security, or business changes. Material changes will be presented with reasonable notice and, when required, renewed acceptance. Questions may be sent to legal@duna.coach.",
        ],
      },
    ],
  },
  {
    slug: "privacy",
    shortTitle: "Privacy Policy",
    title: "Duna Privacy Policy",
    description:
      "How Duna collects, uses, shares, protects, retains, and deletes personal information.",
    audience: "Everyone whose information is processed by Duna",
    sections: [
      {
        title: "1. Scope and roles",
        paragraphs: [
          "This Privacy Policy explains how Beach Elite LLC, doing business as Duna, processes personal information through Duna consumer, mobile, public-profile, Duna HQ, event, communications, rating, and support services.",
          "Duna is generally the controller of consumer accounts, platform security, Sand Rating, public profiles, and product analytics. An organization using Duna HQ may separately control member, employee, coach, event, waiver, marketing, and facility information. In those cases, contact the organization first for organization-directed requests; Duna supports the organization as its service provider or processor.",
        ],
      },
      {
        title: "2. Information we collect",
        paragraphs: [
          "We collect information you provide, information created through use of Duna, information from organizations and other users, public or licensed sports records, and technical information from your device and browser.",
        ],
        bullets: [
          "Account and identity: name, display name, handle, email, phone, birth date, age band, guardian relationships, authentication identifiers, locale, and profile visibility.",
          "Player and professional details: height, playing experience, indoor and collegiate history, school, photos, ratings, rankings, match history, teams, scores, eligibility, source-profile URLs, and identity-resolution evidence.",
          "Transactions: orders, tickets, bookings, memberships, credits, refunds, payouts, tax status, processor identifiers, and immutable ledger entries. Duna does not store full payment-card numbers.",
          "Organization records: business, venue and court addresses, staff roles, schedules, compensation configuration, customer records, waivers, policies, inventory, campaign settings, and performance data.",
          "Device and usage: IP address, device and browser details, app version, logs, diagnostics, approximate or precise location when permitted, cookies, feature interactions, and security events.",
          "Content and communications: messages, forms, waivers, support requests, campaign engagement, uploaded media, voice or typed onboarding responses, and AI-derived profile suggestions.",
          "Optional Apple Health information: the performance categories you select, which may include heart rate and variability, sleep, respiratory and oxygen signals, body temperature, activity, energy, steps, distance, workouts, weight, body-fat percentage, and lean body mass. Duna does not write data to Apple Health.",
        ],
      },
      {
        title: "3. Public and third-party sports sources",
        paragraphs: [
          "When you connect or claim a VolleyballLife, BVBInfo, FIVB-related, or other supported profile, Duna may retrieve the public profile, results, opponents, teams, rankings, events, and source identifiers. Discovering an opponent in a connected result may cause Duna to create an unclaimed player record so match history and ratings remain coherent.",
          "Unclaimed profiles are labeled, limited to appropriate public sports information, and may be claimed, corrected, challenged, restricted, or removed where required. We preserve source provenance so corrections do not silently rewrite historical records.",
        ],
      },
      {
        title: "4. How we use information",
        paragraphs: [
          "We use information to authenticate users; operate profiles, households, bookings, events, tickets, wallets, payments, subscriptions, notifications, and organization tools; calculate and explain ratings; import and reconcile records; prevent fraud; support safety; provide customer service; comply with law; and improve Duna.",
          "We may use AI to structure information you provide, produce suggestions, detect anomalies, assist support, recommend schedules or offerings, and measure risk. Material account, payout, guardian, disciplinary, or employment decisions include appropriate rules, review, or appeal paths.",
        ],
      },
      {
        title: "5. Legal bases",
        paragraphs: [
          "Depending on location and context, we process information to perform a contract, take steps you request before a contract, comply with law, protect vital interests, pursue legitimate interests such as security and service improvement, or based on consent. You may withdraw consent prospectively where consent is the basis.",
        ],
      },
      {
        title: "6. Payments, identity verification, and taxes",
        paragraphs: [
          "Payment and identity providers process payment credentials, bank or payout details, government identifiers, documents, liveness or biometric signals, and risk information under their privacy terms. Duna normally receives payment tokens, account and transaction identifiers, verification status, requirements, and limited fraud signals—not complete card or identity-document data.",
          "We retain transaction, payout, tax, consent, and dispute records for legally required periods and to maintain a balanced, auditable ledger.",
        ],
      },
      {
        title: "7. Children and family accounts",
        paragraphs: [
          "Duna does not knowingly allow a child under 13 to independently consent to collection of personal information. If a birth date or other information indicates the user is under 13, we restrict the account and seek verifiable parental consent before collecting or using information beyond what is permitted to obtain that consent.",
          "Parents and guardians can manage linked children, review key information, approve bookings and spending, fund organization wallets, and request access, correction, or deletion. If you believe a child supplied information without proper consent, contact privacy@duna.coach.",
        ],
      },
      {
        title: "8. Apple Health and performance context",
        paragraphs: [
          "Duna imports Apple Health information only after you choose categories and complete Apple's system permission flow. We use imported information to build your private Health timeline, provide descriptive recovery and match context, and—when separately authorized—align heart rate with your Duna Vision recordings. These features are for fitness and performance context, not diagnosis, treatment, or medical advice.",
          "Imported Health values are encrypted before database storage and are not used for advertising, marketing profiles, eligibility, credit, insurance, employment, or sale. Public profile or video visibility never makes Health information public. Duna shares Health information with another player, a coach, or authorized club staff only when you create a specific, expiring Duna grant identifying the recipient, categories, and allowed view. Current relationships and the grant are rechecked when information is viewed, and non-owner access is audited.",
          "You can revoke a Duna sharing grant immediately or disconnect Duna Health to delete imported samples and revoke all grants. Apple separately controls source permission in Health and Settings; changing a Duna display grant does not change Apple's permission, and changing Apple's permission may limit future imports. Duna does not store Health data in iCloud.",
        ],
      },
      {
        title: "9. How we disclose information",
        paragraphs: [
          "We disclose information to the organization, coach, facility, event host, teammate, parent, guardian, or user involved in a transaction or activity; to vendors that provide cloud hosting, payments, identity, messaging, maps, analytics, customer support, app distribution, and security; and to authorities or counterparties when reasonably necessary for law, safety, fraud, disputes, or corporate transactions.",
          "We do not sell personal information for money and do not share it for cross-context behavioral advertising. If that practice changes, we will update this policy and provide legally required choices before the change applies.",
        ],
      },
      {
        title: "10. Public visibility and search",
        paragraphs: [
          "Public profiles, ratings, event pages, rosters, professional results, and public match pages may be visible to search engines and AI answer systems. Private account fields, exact birth dates, payment details, guardian records, private messages, and protected forms are not intended for public display. Use visibility controls and contact us if a public field is inaccurate.",
        ],
      },
      {
        title: "11. Communications and choices",
        paragraphs: [
          "Transactional messages include receipts, security alerts, booking changes, invitations, waitlist notices, guardian actions, and service notices. You cannot opt out of messages necessary to provide a requested service. Marketing email, SMS, WhatsApp, RCS, and push notifications use the consent and unsubscribe controls shown in Duna or the message.",
        ],
      },
      {
        title: "12. Cookies, analytics, and location",
        paragraphs: [
          "We use essential storage for authentication, security, preferences, and transactions and may use limited analytics to understand reliability and feature use. Where required, optional cookies or similar technologies are presented through a consent choice. Location is used only with permission or from an address you provide to support maps, nearby discovery, taxes, availability, and safety.",
        ],
      },
      {
        title: "13. Retention and deletion",
        paragraphs: [
          "We retain information only as long as reasonably necessary for the purpose collected, the life of your account, an organization instruction, and applicable tax, accounting, consumer-protection, employment, safeguarding, fraud, dispute, and legal obligations. Retention periods differ by record type.",
          "An eligible account-deletion request immediately revokes Health sharing, remote-control sessions, public video visibility, share links, and live updates. Permanent deletion is scheduled seven days later and can be cancelled before that deadline. Cancellation does not automatically restore previously revoked sharing or public access.",
          "After the recovery window, we delete the authentication identity, imported Health records, Duna-hosted videos and provider copies, posts, messages, forms, connected-account credentials, and other sensitive service data. Ledger, payment, tax, consent, moderation, dispute, fraud-prevention, and security records may be retained in restricted, de-identified form for their required period. Backups age out under controlled schedules and are not restored to production except for disaster recovery.",
        ],
      },
      {
        title: "14. Your privacy rights",
        paragraphs: [
          "Depending on where you live, you may request access, correction, deletion, restriction, portability, or objection; withdraw consent; opt out of certain marketing or automated processing; or appeal a denied request. You may also submit a complaint to your local privacy regulator.",
          "Use Account Settings to edit profile fields, export data, manage communications, or initiate deletion, or email privacy@duna.coach. We verify requests and may deny or limit them when permitted by law, such as to protect another person, preserve transaction integrity, or comply with retention duties. Authorized agents must provide proof of authority.",
        ],
      },
      {
        title: "15. Security and international transfers",
        paragraphs: [
          "We use administrative, technical, and organizational safeguards appropriate to the sensitivity of the information, including scoped access, encryption in transit, audit trails, tenant isolation, and incident procedures. No system is perfectly secure.",
          "Duna and its providers may process information in the United States and other countries. Where required, we use recognized transfer mechanisms and contractual safeguards.",
        ],
      },
      {
        title: "16. Changes and contact",
        paragraphs: [
          "We may update this policy to reflect new features, providers, or laws. Material changes will be highlighted and renewed consent will be requested when required.",
          "Contact the privacy team at privacy@duna.coach or Beach Elite LLC d/b/a Duna, United States. Organization-specific questions may also be directed to the relevant club, coach, facility, or event organizer.",
        ],
      },
    ],
  },
  {
    slug: "eula",
    shortTitle: "Mobile App EULA",
    title: "Duna Mobile Application End User License Agreement",
    description:
      "The software license and app-store terms for Duna and Duna Pro mobile applications.",
    audience: "Users of Duna mobile applications",
    sections: [
      {
        title: "1. License and relationship to other terms",
        paragraphs: [
          'This End User License Agreement ("EULA") is between you and Beach Elite LLC d/b/a Duna, not the app-store provider. It applies to the Duna and Duna Pro applications, updates, and related software ("Licensed Application"). The Consumer Terms or Duna HQ Terms also apply to the services accessed through the app. If terms conflict, this EULA controls only the software license.',
        ],
      },
      {
        title: "2. Limited license",
        paragraphs: [
          "Duna grants you a personal, revocable, non-exclusive, non-transferable, non-sublicensable license to install and use the Licensed Application on devices you own or control, subject to applicable app-store usage rules and any permitted family or volume-purchase features. The application is licensed, not sold.",
        ],
      },
      {
        title: "3. Restrictions",
        paragraphs: [
          "You may not copy except for permitted backup, rent, lease, sell, redistribute, sublicense, reverse engineer, decompile, bypass security, derive source code except where law expressly permits, remove notices, use unauthorized automation, or use the Licensed Application to violate law or another person's rights.",
        ],
      },
      {
        title: "4. Accounts, connectivity, and updates",
        paragraphs: [
          "Some features require a Duna account, compatible device, network access, permissions, or third-party service. Carrier and data charges may apply. Duna may provide updates needed for security, compatibility, legal compliance, or features. Failure to install a required update may limit use.",
        ],
      },
      {
        title: "5. Device permissions and local data",
        paragraphs: [
          "With your permission, the app may access notifications, contacts, camera, photos, microphone, calendar, and location to provide invitations, onboarding, maps, check-in, media, voice features, or schedule sync. You can change operating-system permissions, although features may stop working. Offline drafts and score events may remain encrypted or protected on the device until synchronized or removed.",
        ],
      },
      {
        title: "6. Health, sport, and emergency disclaimer",
        paragraphs: [
          "The application is not medical advice, emergency communication, or a substitute for qualified supervision. Sports participation has inherent risks. Confirm event and facility conditions and contact local emergency services when needed.",
        ],
      },
      {
        title: "7. External services and content",
        paragraphs: [
          "Maps, payments, identity verification, calendars, messaging, event data, and links may be provided by third parties. Use is subject to their terms and geographic restrictions. Do not use external services in a way that violates law or provider terms.",
        ],
      },
      {
        title: "8. Ownership and feedback",
        paragraphs: [
          "Duna and its licensors retain all rights in the Licensed Application. If you provide feedback, Duna may use it without restriction or compensation, but this does not grant Duna ownership of your personal content.",
        ],
      },
      {
        title: "9. Termination",
        paragraphs: [
          "This EULA continues until terminated. Your license ends automatically if you materially violate it. On termination, stop using and delete the application. Account data and service obligations continue under the applicable Terms and Privacy Policy.",
        ],
      },
      {
        title: "10. Warranty, support, and liability",
        paragraphs: [
          "To the maximum extent permitted by law, the application is provided as is and available without implied warranties. Duna, not Apple, Google, or another app-store provider, is responsible for maintenance and support. Any refund remedy required from an app-store provider is limited to the purchase price paid for the application, if any.",
          "The liability limits in the applicable Duna Terms apply, except where law does not permit limitation.",
        ],
      },
      {
        title: "11. App-store beneficiary terms",
        paragraphs: [
          "Apple and its subsidiaries are third-party beneficiaries of this EULA for an application obtained through Apple's App Store and may enforce it after your acceptance. Apple is not responsible for the application, support, product claims, legal compliance, or intellectual-property claims. Equivalent marketplace rules apply to applications obtained elsewhere.",
        ],
      },
      {
        title: "12. Export and government use",
        paragraphs: [
          "You may not use or export the application in violation of United States or other applicable sanctions and export-control law. You represent that you are not located in a prohibited jurisdiction or on a prohibited-party list. The application is commercial computer software licensed to government users only with the rights granted under this EULA.",
        ],
      },
      {
        title: "13. Contact",
        paragraphs: [
          "Questions, complaints, or support requests may be sent to support@duna.coach. Legal notices may be sent to legal@duna.coach.",
        ],
      },
    ],
  },
  {
    slug: "hq-terms",
    shortTitle: "Duna HQ Terms",
    title: "Duna HQ Organization Terms of Service",
    description:
      "The business agreement for clubs, coaches, facilities, organizers, and their authorized staff.",
    audience: "Organizations and Duna HQ administrators",
    sections: [
      {
        title: "1. Agreement, authority, and organization account",
        paragraphs: [
          'These Duna HQ Organization Terms ("HQ Terms") are between Beach Elite LLC d/b/a Duna and the legal entity or sole proprietor identified when a workspace is created ("Organization"). The person accepting represents that they have authority to bind the Organization. The Consumer Terms apply to an administrator in their individual player capacity.',
          "Duna permits one administrator to create or join multiple organizations. Each organization is a separate tenant, billing relationship, data boundary, payment configuration, brand, and responsibility. Owners must keep legal entity, address, tax, payout, and authority information current.",
        ],
      },
      {
        title: "2. Plans, trials, fees, and changes",
        paragraphs: [
          "The selected plan, included features, usage limits, monthly or annual fee, transaction fees, and any promotional period are shown at signup or in an order form. Paid plans renew until cancelled. Taxes are additional unless stated otherwise. Duna may change future pricing with advance notice; changes apply at the next renewal or as permitted in the order form.",
          "Custom multi-venue, data, implementation, support, or payment terms require a signed order form. If an order form conflicts with these HQ Terms, the order form controls for that purchase.",
        ],
      },
      {
        title: "3. Authorized users, roles, and security",
        paragraphs: [
          "The Organization controls invitations and roles for owners, administrators, managers, coaches, front desk, scorekeepers, and accountants. It is responsible for least-privilege access, prompt offboarding, device security, and user conduct. A team member may not change their worker classification without authorized administrator action.",
          "Notify Duna promptly of suspected compromise. Duna may require multi-factor authentication, step-up verification, or restriction of high-risk actions.",
        ],
      },
      {
        title: "4. Customer data and privacy roles",
        paragraphs: [
          "The Organization owns or controls the customer, staff, schedule, event, form, waiver, inventory, marketing, and operational data it submits, subject to individual rights and Duna's independent rights in platform accounts, security records, transaction integrity, and Sand Rating.",
          "The Organization is responsible for lawful notices, consents, instructions, retention choices, and responses to rights requests for data it controls. Duna acts as service provider or processor for those instructions and may process data as an independent controller for authentication, fraud prevention, product security, billing, legal compliance, and platform-wide services.",
        ],
      },
      {
        title: "5. Minors, guardians, safeguarding, and waivers",
        paragraphs: [
          "An Organization serving minors must implement legally appropriate parental consent, staff screening, communication, pickup, supervision, emergency, and safeguarding practices. Duna tools do not replace those duties.",
          "The Organization is responsible for the content, enforceability, versioning, presentation, and retention of its policies and waivers. Duna records acceptance evidence but does not provide legal advice or guarantee enforceability.",
        ],
      },
      {
        title: "6. Offerings, inventory, scheduling, and smart rules",
        paragraphs: [
          "The Organization is responsible for accurate events, services, goods, plans, membership benefits, credit rules, schedules, venues, courts, coaches, equipment, capacity, prices, taxes, eligibility, cancellation policies, waitlists, and approval rules. Smart rules and AI suggestions are configurable automation; the Organization must review them before publication.",
          "Calendar sync, alerts, equipment allocation, and conflict detection may depend on third-party availability and are not guaranteed to prevent every conflict or double booking.",
        ],
      },
      {
        title: "7. Payments, Connect, refunds, disputes, and reserves",
        paragraphs: [
          "Payment services are provided through Stripe or another disclosed provider. The Organization must complete onboarding and is responsible for its connected account, products, fulfillment, customer service, refunds, disputes, negative balances, reserves, prohibited activity, and payment-provider agreement.",
          "The parties' checkout configuration determines charge routing, application fees, and settlement. Duna does not take custody of Organization funds. Duna may suspend checkout when payments, identity, risk, or legal requirements are incomplete.",
        ],
      },
      {
        title: "8. Credits, memberships, payment plans, and failed payments",
        paragraphs: [
          "Organization credits are closed-loop units usable only with the issuing Organization. The Organization must clearly disclose purchase value, expiration, transfer, refund, cancellation, and forfeiture rules and comply with gift-card, stored-value, unclaimed-property, and consumer law.",
          "Payment plans and recurring memberships involve collection risk. Duna may automate retries and notifications but does not guarantee future payments. The Organization remains responsible for fair collection, access suspension, refunds, and legally required notices.",
        ],
      },
      {
        title: "9. Taxes and reporting",
        paragraphs: [
          "The Organization is responsible for tax registrations, classifications, rates, exemptions, filings, remittance, and professional advice. Duna may calculate tax from Organization and venue addresses through a tax provider, but the Organization must verify configuration. Reports support operations and do not replace accounting or tax advice.",
        ],
      },
      {
        title: "10. Staff, coaches, compensation, and payroll boundary",
        paragraphs: [
          "The Organization determines whether a worker is an employee or independent contractor and is solely responsible for classification, wage and hour law, payroll, withholding, insurance, benefits, background checks, and employment records. Compensation tracking and goals are administrative tools. A future payroll feature is not active unless separately contracted.",
        ],
      },
      {
        title: "11. Messaging and marketing compliance",
        paragraphs: [
          "The Organization must have a lawful basis and required consent before sending email, SMS, RCS, WhatsApp, or push campaigns; honor opt-outs; identify itself; avoid purchased or misleading lists; and comply with applicable telemarketing, anti-spam, privacy, quiet-hours, and platform rules.",
          "Duna may block campaigns that pose deliverability, safety, fraud, or compliance risk. The Organization remains the sender of its campaigns even when Duna routes messages through providers.",
        ],
      },
      {
        title: "12. Goods, inventory, and equipment",
        paragraphs: [
          "The Organization is the seller of its goods and is responsible for descriptions, title, safety, warranties, shipping, returns, recalls, sales tax, and inventory accuracy. Equipment cost, depreciation, rental, and coach-use records are operational estimates and must be reviewed by the Organization's accountant.",
        ],
      },
      {
        title: "13. AI and analytics",
        paragraphs: [
          "Duna may provide forecasts, churn indicators, scheduling proposals, campaign suggestions, summaries, or automated configuration. These are decision-support tools and may be inaccurate. The Organization must review actions affecting money, access, staff, minors, safety, taxes, or legal rights. Duna does not promise a particular revenue, utilization, ranking, or retention result.",
        ],
      },
      {
        title: "14. Acceptable use and platform integrity",
        paragraphs: [
          "The Organization may not use Duna for unlawful, deceptive, discriminatory, exploitative, infringing, unsafe, or payment-prohibited activity; manipulate results or ratings; send unlawful messages; misuse personal information; evade fees; scrape protected systems; or interfere with another tenant.",
          "Duna may investigate, rate-limit, suspend, preserve evidence, or remove content when reasonably necessary for security, legal compliance, payment risk, user safety, or material breach.",
        ],
      },
      {
        title: "15. Confidentiality, intellectual property, and feedback",
        paragraphs: [
          "Each party will protect the other's non-public business, technical, and customer information using reasonable care and use it only for the relationship, except for permitted disclosures to personnel, providers, advisers, or authorities. Confidentiality does not cover information lawfully public, independently developed, or rightfully received.",
          "Duna owns the platform, documentation, designs, models, and improvements. The Organization owns its marks and content and grants Duna a license to host and display them to provide the Service. Feedback may be used without restriction.",
        ],
      },
      {
        title: "16. Availability, warranties, and liability",
        paragraphs: [
          "Duna will use commercially reasonable efforts to operate the Service but does not guarantee uninterrupted availability. Preview, beta, or coming-soon features are provided without commitment and should not be used for critical obligations.",
          "TO THE MAXIMUM EXTENT PERMITTED BY LAW, DUNA DISCLAIMS IMPLIED WARRANTIES. NEITHER PARTY IS LIABLE FOR INDIRECT, SPECIAL, INCIDENTAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES OR LOST PROFITS, REVENUE, GOODWILL, OR DATA. EXCEPT FOR EXCLUDED CLAIMS, EACH PARTY'S AGGREGATE LIABILITY IS LIMITED TO FEES PAID OR PAYABLE TO DUNA UNDER THE APPLICABLE ORGANIZATION ACCOUNT DURING THE 12 MONTHS BEFORE THE EVENT GIVING RISE TO LIABILITY.",
          "The cap does not apply to payment obligations, misuse of the other party's intellectual property, breach of confidentiality, unlawful data use, indemnity obligations, fraud, gross negligence, willful misconduct, or liability that cannot lawfully be limited.",
        ],
      },
      {
        title: "17. Indemnity",
        paragraphs: [
          "The Organization will defend and indemnify Duna against third-party claims arising from its offerings, facilities, staff, participants, waivers, messages, products, taxes, worker classification, unlawful data instructions, or breach of these HQ Terms. Duna will defend and indemnify the Organization against a third-party claim that the unmodified Duna software infringes a United States intellectual-property right, subject to prompt notice, control of defense, and reasonable cooperation.",
        ],
      },
      {
        title:
          "18. Term, cancellation, data export, and organization ownership",
        paragraphs: [
          "The Organization may cancel a plan in billing settings. Access continues through the paid period unless suspended for risk or breach. Before deleting an owner account, ownership must be transferred or the Organization closed through a reviewed process. Duna will provide a reasonable export path for supported data while the account is active and for a limited period after termination.",
          "Duna may terminate for uncured material breach, nonpayment, legal requirement, or serious risk. Provisions that by their nature should survive—including payment, confidentiality, intellectual property, liability, indemnity, dispute, and retention obligations—survive.",
        ],
      },
      {
        title: "19. General terms and contact",
        paragraphs: [
          "Neither party may assign these HQ Terms without the other's consent, except in a merger, reorganization, or sale of substantially all relevant assets, provided the assignee assumes the obligations. The parties are independent contractors. Force majeure excuses delay caused by events beyond reasonable control, excluding payment obligations.",
          "Before litigation, the parties will attempt good-faith resolution for 30 days after written notice. Applicable law governs without overriding mandatory law. Courts with lawful jurisdiction over the parties and dispute may hear claims. Mandatory arbitration is not imposed in this version.",
          "Notices to Duna may be sent to legal@duna.coach. Operational support may be sent to support@duna.coach.",
        ],
      },
    ],
  },
];

export function getLegalDocument(slug: string): LegalDocument | undefined {
  return legalDocuments.find((document) => document.slug === slug);
}
