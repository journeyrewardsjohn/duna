# Duna design references

“Golden Hour Performance” is Duna’s shared creative system across public web,
the Player experience, Duna HQ, Super Admin, Duna Players, Duna Pro, Watch,
Live Activities, video, imagery, and lifecycle media.

The current references are intentionally separate:

- `duna-font-usage-guide.md` is the authoritative typography contract for all
  web, HQ, Player, and Pro surfaces. It supersedes every earlier font rule.
- `duna-design-system-v3.md` is the active amendment for ground inversion,
  athletic composition, typography, club color, and player identity.
- `duna-implementation-audit.md` records the verified production failures and
  their acceptance criteria.
- `duna-design-system.md` defines the core brand and web system.
- `duna-mobile-design-guide.md` defines how that system behaves on phones and
  across the distinct Player and Pro jobs.
- `duna-theming-light-dark.md` defines the composable theme, semantic zone, and
  environmental contrast model.

The repository-wide implementation contract lives in [`AGENTS.md`](../../AGENTS.md).
Keep the references, shared tokens, and that contract in the same change when a
future design-system decision is amended.

## Typography assets

Fellix web and app files in this repository came from the licensed Journey
Rewards font package supplied for Duna. They may not be redistributed or reused
outside the licensed product.

Duna ships exactly two brand families: Fellix for every word and Archivo for
meaningful numerals and the Duna wordmark. Supplied serif archives are design
review inputs only and must not be copied into a web or native bundle.

## Generated media

Approved Golden Hour stills and motion plates live in
`apps/web/public/media/brand`; their provenance and intended use live beside
them in `imagery-log.json`. The home cinemagraph is progressive enhancement:
the still remains the canonical frame, and motion is withheld for reduced
motion, data-saving, and constrained mobile connections. The Player sign-in
surface reuses the same scene at a mobile-appropriate encode so brand imagery
does not split across products.
