# Duna design references

“Golden Hour Performance” is Duna’s shared creative system across public web,
the Player experience, Duna HQ, Super Admin, Duna Players, Duna Pro, Watch,
Live Activities, video, imagery, and lifecycle media.

The current references are intentionally separate:

- `duna-font-usage-guide.md` is the authoritative typography contract for all
  web, HQ, Player, and Pro surfaces. It supersedes every earlier font rule.
- `duna-design-system-v4.md` is the active amendment for the public website,
  including its hero, color families, band geometry, navigation, footer, and
  tightly scoped DM Mono metadata accent.
- `duna-design-system-v3.md` is the active amendment for ground inversion,
  athletic composition, club color, and player identity outside the public-web
  v4 scope.
- `duna-hq-component-system.md` is the operational component, content, and
  responsive usage contract for Duna HQ.
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

Duna ships Satoshi for every product word and number. Public editorial metadata
may use the tightly scoped DM Mono accent defined by v4. The authoritative
weights, loading sources, fallbacks, and verification rules live in
`duna-font-usage-guide.md`. Older licensed or open-source font assets may remain
in repository history, but they are not an active product typography contract.

## Generated media

Approved Golden Hour stills and motion plates live in
`apps/web/public/media/brand`; their provenance and intended use live beside
them in `imagery-log.json`. The home cinemagraph is progressive enhancement:
the still remains the canonical frame, and motion is withheld for reduced
motion, data-saving, and constrained mobile connections. The Player sign-in
surface reuses the same scene at a mobile-appropriate encode so brand imagery
does not split across products.
