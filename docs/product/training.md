# Training: programs, practice plans, drills and scenes (B4, B5, B6a)

Dated 28 November 2026. The services behind `operator.trainingPrograms`,
`player.trainingPrograms`, `operator.trainingDrills`,
`player.trainingDrills` and `public.trainingDrills`. Shapes are frozen in
`packages/api/src/contracts/training-programs.ts` and
`contracts/training-drills.ts` (W3-0); the procedures are listed in
[`docs/API.md`](../API.md). Code: `packages/api/src/services/training-programs/`,
`services/training-drills/`, and the pure scene model in
`packages/core/src/training-scene/` (`@duna/core/training-scene`).

## What each thing is

- **Program**: a season or block a club runs (and sells through a linked
  catalog offering: `catalogItemId`, never a second price model). It has a
  date range and time zone, weekly practice slots (weekday, wall-clock start
  and end, every N weeks, venue and courts), date exceptions (blackout,
  break, tournament, travel), coaches (one lead, assistants limited to some
  weekdays), athletes, and a week-by-week plan (phase and planned load).
  States: draft → active → completed; draft | active → cancelled (stored as
  `archived` + `cancelled_at`, reported as `cancelled`). An active program
  past its end date reads as `completed`.
- **Session**: one `training_events` row: a practice generated from a slot,
  or a one-off (`source: manual`) of any kind. It carries coaches, and either
  a practice plan version, a focus with an estimated load, or nothing.
  planned → ready (plan or focus, and a coach) → completed (after-practice
  record); planned | ready → cancelled (row and reason kept).
- **Practice plan**: what a coach runs on the day: blocks on a timeline
  (lane per court or "all", start minute, duration, transition, intensity,
  focus, a drill reference pinned to a version, estimates). Every save is a
  new immutable version; a session keeps the version it was given. Totals
  are computed, never stored from the client: load = duration-weighted mean
  of `intensity × 9.2`; work is any minute with a block at intensity 5+;
  focus mix is by drill and game minutes.
- **Drill**: the club's own (`club`), a coach's own (`personal`, "My
  drills"), Duna's library (`duna`), or bought (`purchased`, derived from
  complete purchases or licences). Every save is a new version; plans pin a
  version.
- **Scene**: the drill's court picture and movement as a v2 document
  (`duna.drill/2`: court, people, slots on named spots or pinned metres from
  the net centre, balls, steps with contact and movement verbs, rotation,
  teaching layer). One per drill version, validated by
  `validateTrainingScene` (never executed, capped at 64 KB, depth 12, 40
  people, 60 steps). `resolveTrainingScene` is the read a 2D or 3D player
  needs (everything in metres, captions filled in).

## What each role can do

| Role               | Programs                       | Sessions                                                                       | Practice plans         | Drills                                                                |
| ------------------ | ------------------------------ | ------------------------------------------------------------------------------ | ---------------------- | --------------------------------------------------------------------- |
| Owner, manager     | create, edit, activate, cancel | everything                                                                     | everything             | edit any club drill, list, buy for the club                           |
| Coach              | read                           | add, cancel, coaches, plan, conflicts, after practice — on programs they coach | create; edit their own | create; edit their own; share personal → club; list in their own name |
| Front desk         | read schedules                 | read schedules                                                                 | no                     | no                                                                    |
| Athlete / guardian | own programs (not drafts)      | own schedule (and a verified junior's)                                         | no                     | published Duna, listed, or used in their program                      |

Another club's ids answer `NOT_FOUND`. Duna and purchased drills are
read-only. Nothing public is added beyond `public.trainingDrills.store` and
`listing` (the contract's storefront).

## Generating sessions

`activate` and every later `update` of an active program regenerate future
practices from the slots minus exceptions (`schedule.ts`, pure, tested
across daylight-saving changes). A session someone relied on (athlete
responses, an outcome, a plan or focus, a substitute, a coverage request, any
status but planned) is never moved or deleted: it stays, the audit row
counts it as "left for review", and if an exception now covers it the
conflicts read shows it. Untouched future practices that no longer fit are
removed; cancelled ones keep their slot. Running it twice changes nothing.

## Conflicts

Computed on every read, never stored: a practice on an exception date, a
coach's blackout or approved time off (team availability), a court closure
(facility play stops). A decision is kept on the session
(`external_load.conflictResolutions`): `drop-practice` cancels it,
`keep-both` records the choice, `ask-cover` opens a coverage request (with
the named substitute asked), `move-practice` moves it to the day after the
blocking period at the same local time, inside the program.

## Review and the store

`submitForReview` runs two automatic checks on the latest version: the scene
validates, and the text and scene carry no personal data (emails, phone
numbers, handles, photo links). Both pass → `in-review` (waiting for Duna
review); otherwise `changes-requested`. Duna's decision has no procedure yet.
A listing is `pending-review` until the drill is approved, then `listed`.
The store and purchases honour the `training.storefront` kill switch. Paid
listings need the owner's marketplace fee (`TRAINING_MARKETPLACE_FEE_BPS`);
without it they answer "not configured". A free purchase completes at once;
a paid one stays pending until checkout (no money moves here).

## What happens to existing club data

Nothing is deleted or rewritten.

- **Programs** made by the legacy training workspace live in the same
  tables. Reads derive weekly slots from `recurrence` (days, start,
  duration, interval), exceptions from `milestones` (tournament, travel,
  break; assessments are not exceptions) and `recurrence.excludedDates`
  (blackouts), and the lead coach from who led most sessions. The first
  write (update, activate) copies them into the W3 tables once, under an
  advisory lock with an audit marker `training-program.legacy-copied`.
  Legacy `ai-draft` sessions are kept and never duplicated. New writes keep
  `recurrence` and `milestones` in step so the old page still lists them.
- **Practice plans** are read as they are: unknown block kinds read as
  `custom`, missing assumptions read as 8 athletes, 1 court, 3 balls.
- **Drills** keep their v1 scene in `training_drills.choreography`. Reads
  convert it on the fly (`source: converted`); the first write (a new
  version or a review) stores it once in `training_drill_scenes`, audit
  marker `training-drill.legacy-scene-converted`. Drills saved by the new
  service are not shown by the old HQ training page (its snapshot shape is
  different); the new screens replace it.

## Logging

`log.info` events `training-programs.*` and `training-drills.*` carry ids,
counts and states only — never names, notes, scene text or messages. Audit
rows carry hashes of what changed, never coach notes.
