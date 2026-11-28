# Club setup: the club profile and AI-assisted setup from a website

Owner: B1 (backend). Screens: H11 (`CS-Start`, `CS-Reading`, `CS-Found`,
`CS-States`, `CS-Home`). Code: `packages/api/src/services/setup/`, router
`operator.setup.*` (`packages/api/src/routers/setup.ts`), contracts
`packages/api/src/contracts/setup.ts`.

## In plain words

A club owner types the address of the website they already have. Duna reads
a handful of its pages and **proposes** what it found: the club's name,
tagline and description, the sports it plays, phone numbers, email, social
links, places and courts with their addresses, opening hours, logo and brand
colours, the coaches and staff the site names, lessons, programs, leagues and
memberships with their prices as the site states them, and policies
(cancellation, weather, conduct…). Every proposal shows the page it came from
and a short quote of the sentence it was read from.

The owner goes through the list: **Keep**, **Edit** or **Skip** each item, or
keep a whole group at once. Only kept and edited items are written into the
club, and only when the owner presses Apply. Nothing is ever written without a
person.

A club with no website is just as welcome: the same facts can be typed by hand
(`profile` / `updateProfile`), or the owner can describe the club in a few
sentences and Duna proposes facts from that description instead.

## What a run does

1. **Start** (`startRun`). The address is checked (below). A club can start
   6 reads a day; while one read is running, starting the same read again
   returns it, and a different one is refused until it finishes or is
   cancelled.
2. **Read**. The home page first (its links, logo and colours too), then at
   most 7 more pages, one per topic: contact, about, locations, programs and
   lessons, pricing and membership, staff, policies. Pages on other sites,
   files (PDFs, images), and pages the site's `robots.txt` disallows are never
   read. Each page's status is visible while it happens (`run` shows Read /
   Reading / Queued / Failed / Skipped).
3. **Extract**. Each page's text goes to the model with fixed instructions;
   the model can only answer in a strict form per kind of fact, and every fact
   must carry a short quote from the page.
4. **Verify** (code, not the model). A fact is kept only when its quote is on
   the page and its value is inside that quote. Then each value is checked by
   type: phone numbers become full international numbers; emails and links are
   checked; prices become whole cents (minor units) with the currency and the
   wording kept; hours become weekly opening windows; colours become hex with a
   contrast check; addresses stay as text marked "not confirmed on a map yet".
   What cannot be verified is flagged for the person; what is not on a page is
   dropped. Duna never invents a fact.
5. **Merge**. The same fact on several pages becomes one proposal listing every
   page. Two different values for something that has one value (two phone
   numbers, two emails) become a choice: pick one, or Neither.
6. **Review**. Each proposal carries a confidence band, never a percentage:
   **stated** (written on the page) or **inferred** (for example a policy
   summary), and inferred items are always flagged.
7. **Apply** (`applyProposals`). One transaction per group. Every write is
   recorded in the audit log with who applied it, when, and the run and
   proposal it came from. Applying twice changes nothing the second time.

A later read of the same site proposes **only what differs** from the club's
current records, each with the current value as "before". Values a person set
or edited are never overwritten: a different value on the site is shown as a
proposal marked "You set this yourself". Pending items of an older read are
marked superseded.

## What is never done automatically

- Nothing reaches the club's records before a person keeps it and presses
  Apply.
- **Prices and offerings** are created as **drafts** (private, not on sale).
  If an offering with the same name already exists, its live price is never
  changed: the site's price is stored on the offering as a suggestion.
- **Policies** are drafts: a cancellation or refund policy with a stated
  notice period becomes an inactive refund policy (never applied to a sale
  until turned on); other policies become notes in the club's knowledge.
- **People** named on the site become draft staff (an unclaimed profile, not
  active). Nobody is invited, emailed or texted.
- **Places** are created as draft venues; courts are only ever added, never
  removed or renamed. The club's own address is filled only when it has none.
- Logos and colours update the club's theme; nothing is published.

## Where it writes

| Kept item                                         | Written to                                                                                                                                            |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Club name, sports                                 | `organizations.name`, `organizations.volleyball_types` (beach / indoor added, never removed)                                                          |
| Tagline, about, phone, email, hours, social links | `organization_profiles` with provenance in `field_sources` ("From your website" until a person confirms it); `website_url` and `website_last_read_at` |
| Logo, colours                                     | `organization_themes.logo_url`, `organization_themes.palette` (primary, accent)                                                                       |
| Place                                             | `venues` (draft) and `courts` (draft, "Court 1"…), the club address if empty                                                                          |
| Offering                                          | `catalog_items` (draft, private) + `catalog_variants` + `catalog_prices` (card, minor units) + `catalog_item_versions` v1                             |
| Staff                                             | `people` (unclaimed) + `organization_staff_profiles` (inactive)                                                                                       |
| Cancellation / refund policy                      | `organization_refund_policies` (inactive, not default)                                                                                                |
| Other policies                                    | `organization_brand_knowledge_sources` (note)                                                                                                         |
| Every applied item                                | `audit_log` (`setup.proposal.applied`, actor, run and proposal, request id); the proposal records `applied_entity_type` / `applied_entity_id`         |

## Limits

| Limit                        | Value                                         |
| ---------------------------- | --------------------------------------------- |
| Pages per read               | 8 (home + 7)                                  |
| Text kept per page           | 150,000 characters (more: "too large")        |
| Text the model sees per page | 24,000 characters                             |
| Reads per club               | 6 per rolling 24 hours                        |
| One reader call / model call | 20 s / 60 s                                   |
| One background step          | 40 s, then the next step continues            |
| A read that is still going   | finishes with what it has after 10 minutes    |
| Quote kept per fact          | 200 characters, at most 3 quotes per proposal |

All in `packages/api/src/services/setup/limits.ts`.

## When a read cannot finish

Every failure a person can act on has a plain reason (`failureReason`; the
run's `outcome` is `site-unreachable`), with the words in
`services/setup/failure-reasons.ts`:

| Reason                | What the person sees                                                                     |
| --------------------- | ---------------------------------------------------------------------------------------- |
| `no-response`         | Your website did not answer. Check the address, or try again later.                      |
| `no-such-host`        | That address does not exist. Check the spelling of your website.                         |
| `address-not-allowed` | Duna can only read a public website address (http or https, no special ports).           |
| `blocked-by-site`     | Your website asked not to be read by tools like Duna. You can fill in your club by hand. |
| `nothing-readable`    | Duna could not find readable text on your website. You can fill in your club by hand.    |
| `too-large`           | Your website's pages are too large to read. You can fill in your club by hand.           |
| `timed-out`           | Reading your website took too long. Try again, or fill in your club by hand.             |

A read that found fewer than 3 facts ends in review with outcome
`found-very-little`; a description ends with `no-website`. Without the
reader or the AI gateway configured, `startRun` answers the honest
not-configured state and makes no outbound call; the profile, review and
readiness keep working.

## Safety

**Server-side fetching of a typed address (SSRF).** Duna's servers never open
a connection to the address; the hosted reader fetches it. Duna still checks
everything: only http and https; no user name or password; no port other than
the default; a public DNS name, never an IP address in any spelling (decimal,
hex, octal, IPv6, mapped) and never an internal name (`localhost`, `.local`,
`.internal`, `.test`, …); every address the name resolves to must be public
(private, loopback, link-local, carrier-grade NAT, cloud metadata,
documentation and multicast ranges, and their IPv6 embeddings, are refused);
the reader's final address after redirects passes the same checks; pages
after the home page must stay on the same site. Tested with a table of
hostile addresses and redirects (`url-safety.test.ts`,
`setup.integration.test.ts`).

**Prompt injection.** Website text is untrusted data. Lines that read like
instructions to an AI are removed before the model sees the page; the page is
passed only as a data field under fixed instructions; the model has no tools
and one turn, and the strict form is its only output; afterwards any fact
whose quote is not on the page, or that carries instruction-like text, is
dropped. A test page that says "ignore previous instructions…" produces the
same facts as an honest read: no extra phone, no invented offering, no
changed price (`extraction.test.ts`).

**Logs.** Ids, counts and timings only (pages read, facts kept and dropped,
lines removed). Never page text, quotes, names, numbers or prices.

## Privacy: what is stored from a site, and for how long

- Stored: each page's address, title and status; for each proposal, the
  proposed value, the page paths it came from and up to three quotes of at
  most 200 characters. Full page text is never stored: it lives in memory for
  the length of one page's extraction.
- The reader is asked not to cache pages (`storeInCache: false`).
- **Proposed default retention: 180 days.** After a read has finished for 180
  days, its page list, the quotes and a description's text are deleted
  (`purgeExpiredSetupRunData`); the decisions, the values a person applied and
  the audit trail stay. This is a proposed default for the owner to confirm;
  the purge is a service function waiting to be scheduled.

## Running a read in the background

A read is a sequence of short steps. Every page's progress is saved as it
happens, and a step holds the read only through a heartbeat. A step that
stops (a serverless timeout, a deploy, a crash) is taken over 90 seconds
later by whoever looks next: the setup screen polling `run`, or the
`processPendingSetupRuns` service function (ready for a cron). A half-read page
is read again; nothing is counted twice. `cancelRun` stops a read and
discards what it found.

## Procedures (`operator.setup.*`)

See [`docs/API.md`](../API.md#club-setup-operatorsetup-owner-b1).
