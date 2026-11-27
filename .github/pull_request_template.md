## Work package

<!-- Programme work-package id (for example R4) and one-line title. -->

## What changed

<!-- User-visible and technical outcome. Keep it to what a reviewer must know. -->

## Files owned

<!-- Paths this package owns. Note any file touched outside them and why. -->

## How it was verified

<!-- Commands run and their results. Paste real output summaries, not intentions. -->

- [ ] Focused tests: `<command>` -> `<result>`
- [ ] `pnpm verify` (or the CI `release-gate` and `mobile-bundles` checks) is green
- [ ] Connected-data behaviour checked without exposing credentials
- [ ] New external calls have failure and stale-data behaviour

## UI evidence (UI work only)

<!-- Preview screenshots placed beside the matching design board, at each width. -->

| Width | Preview screenshot | Design board |
| ----- | ------------------ | ------------ |
| 1440  |                    |              |
| 768   |                    |              |
| 390   |                    |              |

## Schema changes

- [ ] No schema change
- [ ] Schema change: migration file `<path>`; rehearsed on `<branch or database>` with result `<result>`

## Feature flags

<!-- Flags added. Flags default ON and exist as kill switches, not gates. Name the kill switch and what the off state shows. Write "none" if there are none. -->

## Safety statement

- [ ] Provider-dependent features are on in code and show an honest "not configured yet" state until production credentials exist; no credentials were invented or entered.
- [ ] A person still confirms every send, payment and publish; no invented customers, claims, prices or policies; product copy names no infrastructure vendors.

## Follow-ups

<!-- Account-owner, legal, vendor, data, or later-package work, named explicitly. -->
