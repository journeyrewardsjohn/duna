# Duna design references

**The Duna Design System (Tideline 4.1.1) is the design contract for every
surface** (public web, Player web, Duna HQ and Super Admin, Duna Player, Duna
Pro, Watch, Live Activities and widgets). Start at
[`tideline-4.1.1/README.md`](tideline-4.1.1/README.md); the programme that
builds it is in [`../plan/README.md`](../plan/README.md).

| File                                                           | What it is                                                                |
| -------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [`tideline-4.1.1/README.md`](tideline-4.1.1/README.md)         | The contract: what overrides what, rules R1–R22, how to verify a screen   |
| [`tideline-4.1.1/brand-book.md`](tideline-4.1.1/brand-book.md) | Brand Book 2.0: Crest, colour, Jost / Geist, rating ring, motion, loaders |
| [`tideline-4.1.1/tokens.json`](tideline-4.1.1/tokens.json)     | The 4.1.1 tokens and canonical names                                      |
| [`tideline-4.1.1/components.md`](tideline-4.1.1/components.md) | Every component the designs use                                           |
| [`tideline-4.1.1/canvases.md`](tideline-4.1.1/canvases.md)     | Design canvases and the board for each work package                       |
| [`tideline-4.1.1/ia-hq.md`](tideline-4.1.1/ia-hq.md)           | HQ navigation and route renames                                           |
| [`tideline-4.1.1/adaptive.md`](tideline-4.1.1/adaptive.md)     | Width classes, iPhone Duo and iPad                                        |
| [`tideline-4.1.1/assets/`](tideline-4.1.1/assets/)             | Final brand SVGs                                                          |
| [`tideline-components.md`](tideline-components.md)             | The code library `@duna/ui/tideline`: folders, adding a family, gallery   |

In short: Jost Medium 500 for one title per screen and marketing headlines,
Geist and Geist Mono for everything else, no serif; Night Court, Salt, Dune,
Hardwood, and Solar for live states only; orange retired; HQ on white.

## Superseded references

Every other file in this folder (`duna-font-usage-guide.md`,
`duna-design-system*.md`, `duna-mobile-*.md`, `duna-theming-light-dark.md`,
`duna-implementation-audit.md`, `duna-hq-*.md`, `duna-player-focus-20261004.md`,
`duna-public-*.md`) carries a "Superseded by Tideline 4.1.1" banner. They are
kept for history and for product behaviour the contract does not change (for
example "Next up comes from future bookings only", audience routing, honest
empty data). Their visual rules (Satoshi, DM Mono, flare orange, `--hq-*`, the
sand world, the glass dock, Golden Hour Performance) no longer apply.

The repository-wide implementation contract lives in [`AGENTS.md`](../../AGENTS.md).
`scripts/verify-design-system.ts` enforces the contract with per-surface files
in `scripts/design-contracts/`.

## Generated media

Approved stills and motion plates live in `apps/web/public/media/brand`; their
provenance and intended use live beside them in `imagery-log.json`. Motion is
progressive enhancement: the still is the canonical frame, and motion is
withheld for reduced motion, data saving and constrained connections.
