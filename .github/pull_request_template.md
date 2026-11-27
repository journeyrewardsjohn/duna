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

<!-- Flags added. Every new flag must default to off. Write "none" if there are none. -->

## Safety statement

- [ ] This change does not activate any provider; Stripe stays in test mode.

## Follow-ups

<!-- Account-owner, legal, vendor, data, or later-package work, named explicitly. -->
