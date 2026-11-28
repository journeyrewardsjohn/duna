# People: import, merge, notes, tags, households, documents and plan changes

Backend for HQ People (`operator.people.*`, PEOPLE-API, 28 November 2026).
Code: `packages/api/src/services/people/**`, router
`packages/api/src/routers/people.ts`, contract
`packages/api/src/contracts/people.ts`, tables in
`packages/db/src/schema/people.ts` (migration `0124_people_api`).

## What each part does

**Import.** `importPreview` takes the rows HQ parsed from the club's file and
a column mapping (at most 1,000 rows). Every row gets one decision:

- `create`: a new person record in the club (unclaimed, no sign-in), with
  the club's tags. A junior is created with their guardian (created once per
  guardian contact, or the guardian already in the club) and a guardian link
  in review (`pending`), consent "not recorded". A junior's own email or
  mobile is never imported: the guardian is the contact.
- `update`: someone already in the club (same email or mobile); only the
  club's new tags are added. A person's own profile is never overwritten.
- `duplicate`: already in the club and nothing to add.
- `problem`: with the reason per field (missing name, bad email, a mobile
  not in international format, a date not written year-month-day, a junior
  without a guardian contact, the same contact twice in the file, or a
  contact that belongs to a Duna account outside the club: invite them with
  Add a person instead).

Nothing about a person is written by the preview; the plan is stored for 30
minutes. `import({ previewId, confirmed: true, idempotencyKey })` writes
exactly that plan in transactions of 100 rows; each transaction also
advances the progress, so an interrupted import continues where it stopped.
If a matched record changed, or someone joined with a contact the plan would
create, the import is refused: preview again. The stored rows are cleared
when the import finishes. No message is sent to anyone.

**Merge.** `mergePreview({ keepId, mergeId })` shows what stays, how many
rows of each kind move, and any reason the merge cannot happen;
`merge({ previewId, confirmed: true, idempotencyKey })` does it in one
transaction (preview valid 15 minutes, refused if anything changed).

Merge rules (conservative, because a person record is shared across Duna):

| Rule                                                            | Why                                                                                                                                              |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| The record merged away must have no sign-in account of its own  | A club cannot fold someone's account into another; keep that record instead or ask Duna support                                                  |
| It must not be known to another club, nor be on the club's team | A club only merges records that are its own                                                                                                      |
| Not both on the same active plan                                | Two subscriptions would charge twice; end one first                                                                                              |
| Not both holding club credits                                   | Credit balances are moved with the credit tools, not by a merge                                                                                  |
| Not both booked into the same session                           | One booking has to be cancelled first                                                                                                            |
| Both juniors or both adults                                     | Age and guardianship rules differ                                                                                                                |
| Juniors with different guardians are refused                    | Duna support confirms the family first                                                                                                           |
| Every payment and waiver record moves, none is deleted          | Orders are re-pointed to the kept record; the credit wallet moves with its ledger account (ownership only, no journal entry, balances unchanged) |

What moves: bookings, attendance, memberships, the credit wallet, orders,
waiver signatures, family links, notes and tags (a tag the kept record
already has is dropped). The merged record is marked merged and restricted,
and every moved row id is kept in `people_merges.moved`.

**Notes.** Staff notes on a person, with author and time. Owners and
managers write; the author edits; the author or the owner removes (the text
is cleared, who removed it and when are kept). Notes are never visible to the
person or another club, never in exports, and never sent to Ask Duna (the
procedures are not on the Ask Duna capability list). Policy: a note must not
hold health values; Duna stores what staff type, so excluding notes from
exports and Ask Duna is the control.

**Tags.** The club's own labels. `tags.set` tags up to 200 people at once
(add and remove at most 10 tags each), rate limited.

**Household.** Guardians (relationship, review state, who is contacted,
who pays), juniors with their parental-consent state (recorded, withdrawn or
not recorded) and who pays and who is contacted for this person. A junior is
contacted through a verified guardian only. `linkGuardian` links an adult the
club knows, `pending` until Duna reviews it. `inviteGuardian` creates the
existing `/join/guardian/[token]` invitation and returns the link with a
draft to review and send from Inbox; nothing is sent.

**Documents.** Each waiver with the version signed and the current version,
when, by whom (the guardian for a junior), expiry and status (signed,
missing, expired, superseded), plus parental consents. `requestSignature`
saves a message draft through the existing review-before-send path
(`saveMessageDraft`) to the adult, or to a junior's verified guardian.

**Plan changes.** `planChangePreview` / `changePlan` (upgrade, downgrade or
switch, now or at renewal). Duna Pay has no proration rule and no way to
switch a plan it bills at renewal, and this package does not invent one:

- A plan billed through Duna Pay: the preview shows both plans' prices and
  the next charge on the current plan; the change answers `unavailable` with
  the reason and changes nothing.
- A plan not billed through Duna Pay (complimentary, or collected by the
  club): "now" moves the membership to the other plan, and Duna charges and
  credits nothing; "at renewal" is unavailable (no Duna renewal exists).

Pause, resume and cancel by staff (HQ's `membershipChange` switch) are not
built here.

## Permissions

| Who                          | Reads                                                             | Writes                                           |
| ---------------------------- | ----------------------------------------------------------------- | ------------------------------------------------ |
| Owner                        | everything                                                        | everything                                       |
| Manager                      | everything; money fields only with `payments:read`                | everything except removing another author's note |
| Coach                        | the people they coach (booked into a session they lead); no money | nothing                                          |
| Front desk                   | every club person; no money                                       | nothing                                          |
| Roles without `members:read` | nothing                                                           | nothing                                          |
| Another club                 | not found                                                         | not found                                        |

Reads need `members:read`; writes need `members:write`. Logs and audit rows
carry ids and counts only.

## SCREEN SWITCH (apps/hq/components/people/people-capabilities.ts)

Each switch turns on by itself when this package's procedure is on `main`.
The matching server action in `app/(next)/(hq)/people/actions.ts` still
answers "needs API" until HQ wires it, so wire them in the same release.

| Switch             | Procedure that turns it on                             | HQ wiring                                                                                                                                            |
| ------------------ | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `import`           | `operator.people.import`                               | `importPreview({ rows, mapping })` for the dry run (replaces the client-side dry run), then `import({ previewId, confirmed: true, idempotencyKey })` |
| `merge`            | `operator.people.merge`                                | `mergePreview({ keepId, mergeId })` for the plan and blockers, then `merge({ previewId, confirmed: true, idempotencyKey })`                          |
| `notes`            | `operator.people.notes`                                | `notes.list / add / edit / remove`                                                                                                                   |
| `tags`             | `operator.people.tags`                                 | `tags.list`, `tags.set({ personIds, add, remove, idempotencyKey })`                                                                                  |
| `household`        | `operator.people.household`                            | `household`, `inviteGuardian`, `linkGuardian`                                                                                                        |
| `documents`        | `operator.people.documents`                            | `documents`, `requestSignature`                                                                                                                      |
| `membershipChange` | stays off                                              | pause, resume and cancel are not built; plan changes are `planChangePreview` / `changePlan` (add a new switch for them)                              |
| Health tab         | `operator.memberProfile.healthAccess.canView` (PRIV-1) | replace `healthTabExists` (role copy plus the `health` marker) with `healthAccess.canView`                                                           |
