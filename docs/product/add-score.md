# Add a score without an account (`/add-score`)

Work package SITE-3, 28 November 2026. Design: `docs/design/website.md` 2.5 and 3.3. The public
"honeypot": anyone can add a match and where they played without an account, see what the result
would do for their Sand Rating, and save it to their name by signing up or signing in. Places
people name that Duna does not list become candidate venues for staff to review.

## The flow

1. **Where.** The same Where picker as the home search, in "flow" mode: Duna's own clubs and courts
   first (with their club marks), then places from the maps provider ("Powered by Google", the
   attribution the provider's terms require). "I can't find it: add this place" (or, when nothing
   matches, "Add "[text]" as a new court") opens a short form: court name, an address or a dropped
   pin ("Use where I am now"), surface and nets. A search that found nothing on the home page opens
   `/add-score?where=[text]` with the text carried over.
2. **Score.** Format (2 v 2 to 6 v 6), the day (no future, last 90 days), competitive or friendly,
   sets with large thumb-sized steppers, and a live `NetScore` of what is entered. A set under 21
   (15 in a decider) gets a soft warning that never blocks; a set without a two-point winner, or a
   match without a winner, is refused in place (these are the checks `recordCompletedMatch` applies
   at claim, so a draft that saves can always be claimed).
3. **Players.** Your first name (optional), first names or initials for your side and the other
   side (at least one), and "Everyone on court agreed to record this match." No contact details.
4. **What this result would do.** The match as a `NetScore` card (awaiting confirmation), the
   `RatingRing` in its provisional form (an em dash and "N more matches", brand book section 4), and
   one sentence: "If the other side confirms it, a win like this moves a player new to Duna from
   3.00 to 3.09 (+0.09)." It is never shown as a rating. Friendly or non-doubles matches say they do
   not move a Sand Rating. Then one next step: **Save it to your name** (Create my account / I have an
   account; signed in: Save to my account), with what happens next in three plain lines.
5. **Claim** (`/add-score/claim`, signed in): a last name or an initial for every player, and an
   optional phone or email per player for the confirm link. Saving creates exactly one normal
   unverified match and lands on it in the app (`/app/matches/[id]`); the cookie is cleared.

Each step is saved as it is left, so returning to `/add-score` resumes the draft ("Welcome back";
Start over deletes it after a confirm). States: loading, validation in place with focus on the first
problem, rate-limited (a quiet "try again in N seconds"), place search not configured or busy (Duna's
own courts still show; a new court can always be typed), offline (Next is disabled with the kit's
offline banner), expired draft, and errors with a reference id.

## What is stored, where, for how long

| What                                                                                                                                                                                                                                                        | Where                                                                                   | How long                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| A random 32-byte token                                                                                                                                                                                                                                      | `duna-score-draft` cookie (HTTP-only, `SameSite=Lax`, `Secure` in production, path `/`) | Until the draft's expiry; cleared on claim, on Start over, or when found expired              |
| SHA-256 of the token (never the token)                                                                                                                                                                                                                      | `score_drafts.token_hash`                                                               | 7 days from when the draft was started (never extended)                                       |
| The draft: where (a Duna venue id; or the provider's place id, name, address and coordinates as the details endpoint returned them; or a typed name, address, pin, surface and nets), format, match type, day, sets, first names or initials, the agreement | `score_drafts.data` (JSON)                                                              | 7 days, then deleted by the daily cleanup (`/api/cron/add-score-cleanup`) or on the next read |
| After a claim: who claimed it and the match it became (the data is emptied)                                                                                                                                                                                 | `score_drafts`                                                                          | Until the 7 days end                                                                          |
| Contacts typed at claim                                                                                                                                                                                                                                     | Passed straight to `recordCompletedMatch`, stored only by the existing invitation path  | As that path keeps them                                                                       |

No IP address, user agent, email or phone is stored with a draft. Rate-limit buckets
(`rate_limit_buckets`) are keyed by a one-way hash of the address and expire on their own. Nothing
anonymous is shown publicly anywhere, and nothing anonymous moves a rating or a ranking.

## How the preview is computed without writing

`public.addScore.preview` reads the draft and runs the real rating engine (`@duna/rating`
`rateDoublesMatch`, the weight a both-sides-confirmed match gets) on four synthetic new-player
ratings created in memory and discarded. "Matches until it shows" comes from running the engine
again until its confidence leaves Provisional. No table is read for ratings and none is written;
an integration test counts `matches`, `ratings`, `rating_events` and the draft row before and after.

## Claim: the existing rules, unchanged

`player.addScore.claim` (signed in, `matches:write`, idempotency key) calls `recordCompletedMatch`
with the claimer on side A and everyone else as a provisional player. The match is
`pending-verification`; a rating moves only through `confirmMatchResult` (a player on each side
confirms, nobody disputes, competitive two-on-two, every player has a claimed profile). Claiming
again returns the same match; a draft claimed by one person can never be claimed by another; a claim
that fails (for example a contact that belongs to an existing profile) hands the draft back to fix
and retry. Under-13 accounts cannot claim ("A parent or guardian needs to add this score"); teens may,
as with the signed-in recorder.

## Abuse controls without friction

- Per-address budgets (hashed): 12 new drafts an hour, 60 saves (30 a minute), 60 previews, 120 reads;
  per-draft: 30 saves (15 a minute), 30 previews; per-person: 10 claims (5 a minute).
- Content rules on typed text: names are letters, spaces, apostrophes, hyphens and a full stop, at
  most 40 characters, never a web address; place names and addresses refuse links.
- No contact details before sign-up; nothing shown publicly; drafts expire.
- Bot challenge: none is wired in the repository, so none was added (no third-party script). Sign-up's
  own protections apply at claim. Owner decision needed: add an invisible challenge on claim.

## From a suggested court to a listing

A place that is not a Duna venue becomes a `venue_candidates` row (source `places` or `described`)
counted once per draft (`venue_candidate_submitters`). Duplicates: the same provider place id, or
within 150 m with a similar name (significant words or close spelling), first against existing
venues (a provider place that already is a venue simply uses that venue; a close, similar venue is
suggested on the candidate) and then against pending candidates. Candidates are never public.
Staff review them with `admin.addScore.candidates` and `admin.addScore.resolveCandidate`
(promote to a **draft** venue under an organisation staff choose, merge into an existing venue, or
dismiss with a reason; audited). The HQ review screen is a later package. Facility listings (B9) are
not built here.

Provider content on candidates (name, address, coordinates) is kept at most 30 days
(`provider_content_expires_at`), then cleared by the daily cleanup; the place id is kept, as the
provider's terms allow, so staff can look it up again.

## Places endpoints

`/api/places/autocomplete`, `/details` and `/map` now have per-address budgets (autocomplete 60 at
once and 60 a minute; details 20 and 10 a minute; map 30 and 30 a minute) with a 429 and
`Retry-After`, pass the picker's session token to the provider (one billing session per open
picker, ended by the details call), bias autocomplete to the visitor's country when the hosting edge
says it, and cache identical requests for 10 minutes in process. Clients show "Lots of searches just
now. Try again in a few seconds." and keep Duna's own results.

## Code

`packages/api/src/contracts/add-score.ts`, `routers/add-score.ts`, `services/add-score/**`,
`packages/db/src/schema/add-score.ts` (migration 0120), `packages/core/src/demo/add-score.ts`,
`apps/web/app/(next)/(site)/add-score/**`, `apps/web/app/api/places/**`,
`apps/web/app/api/cron/add-score-cleanup`.
