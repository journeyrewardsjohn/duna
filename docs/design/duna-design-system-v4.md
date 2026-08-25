# Duna public web design system v4

**Status:** active amendment for Duna's public website.
**Source:** the approved `Duna Homepage v2` reference and its companion Duna
Design System package.
**Scope:** homepage, public editorial pages, ratings and rankings education,
public navigation, public footer, and public club-marketing pages. Authenticated
Player, live competition, HQ, and native surfaces keep their existing semantic
systems unless this document explicitly says otherwise.

## Character

Duna's public web presence is bright, warm, direct, and unmistakably about the
game. It uses decisive Satoshi headlines, restrained data labels, generous
space, softly atmospheric color, and a small number of strong full-width bands.
The page should feel like one continuous system rather than a stack of generic
cards.

## Foundation

- Snow `#FCFCFF` is the default public ground.
- Charcoal `#18181B` is the default text and primary-action color.
- Passport navy `#142335` and `#2B385C` carry club, tour, footer, and other
  high-authority moments.
- Sky `#D3E3F0`, blush `#FECFC0`, sand `#E6B48C`, cream `#FAF6F2`, and gold
  `#D6B143` create the atmospheric families.
- Rust `#B0561F`, live red `#C94443`, and positive green `#1E7A46` communicate
  specific meaning; they are not general decoration.
- Public-web tokens live in `apps/web/app/design-v4.css` under the
  `--duna-web-*` namespace. Components consume tokens instead of repeating raw
  colors.

## Type

- Satoshi remains Duna's primary face. Public verdict headlines use weight 900,
  a line height near 1, balanced wrapping, and tracking no tighter than
  `-0.030em`.
- DM Mono is a deliberately narrow public-editorial accent. Use it only for
  uppercase eyebrows, timestamps, live/data labels, and tickers. It never
  replaces Satoshi for controls, body copy, product UI, scores, or long text.
- Body copy is regular Satoshi with calm line height and readable contrast.
- Large numerals stay in the established Duna numeric tiers and never imply
  data that is missing or pending.

## Geometry and composition

- Content centers to a 1216px maximum while section color can span the viewport.
- Primary colored bands use 48px corners on desktop and 32px on mobile.
- A band floating on snow is rounded. Consecutive bands that intentionally butt
  together use square adjoining corners so no thin white seam appears.
- Media uses 28px corners; cards use 22px; compact items use 14px; controls use
  pill geometry.
- Navy-tinted shadows are soft and broad. Glow belongs to a single meaningful
  quote or focal panel, not every card.
- Icons are used only when they clarify an action or state. Typography,
  photography, and data carry the composition.

## Homepage

The homepage opens with the approved v2 hero system: continuous sky/blush/cream
wash, dynamic event announcement, a short verdict headline, two pill actions,
one rounded volleyball image, and a compact connected-network proof row. The
hero is content-first and fully usable without animation. It must not depend on
WebGL, parallax, autoplay, blur, or hover.

The existing homepage story and data remain intact after the hero. Recompose
them through the warm Play band, sky Compete band, navy Operate or tour band,
and restrained white editorial intervals. The redesign changes presentation,
not the truth or meaning of those sections.

## Shared public surfaces

- Navigation is a 78px continuous atmospheric wash with the existing Duna HQ,
  Duna Player, profile, theme, and mobile-sheet access preserved.
- Editorial pages use the atmospheric hero, a centered cream content band, and
  at most one glow treatment.
- Ratings and rankings education use the sky family and passport-navy ink.
- Club-marketing moments use cream, gold, and navy rather than an unrelated
  green campaign palette.
- The footer is passport navy with a white Duna mark and clear grouped links.
- Dark preference changes tokens and contrast without changing the semantic
  meaning of a page.

## Motion and accessibility

- Motion is optional polish. Prefer opacity and translation; pause continuous
  movement for reduced motion.
- Preserve keyboard focus, 48px touch targets, readable labels, balanced text,
  and meaningful image alternatives.
- Verify desktop, tablet, 390px mobile, wide-short viewports, dark preference,
  reduced motion, and horizontal overflow before release.
