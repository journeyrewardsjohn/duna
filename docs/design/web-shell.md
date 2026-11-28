# The public site shell and the `(next)` route group (apps/web)

Work package SITE-1 (28 November 2026). How duna.coach's rebuilt pages are laid
out, what the shell gives a page, and how a later package adds a page or moves
one out of `(legacy)`. The design is [`website.md`](website.md); the decision to
replace legacy screens instead of preserving them is
[`docs/plan/legacy-styles.md`](../plan/legacy-styles.md). HQ does the same split
([`hq-shell.md`](hq-shell.md)).

## Two root layouts

`apps/web/app` has no root `layout.tsx`. Two route groups each have their own
root layout, so each is a separate document with separate CSS:

| Group      | Root layout               | CSS it loads                                                          | Holds                                 |
| ---------- | ------------------------- | --------------------------------------------------------------------- | ------------------------------------- |
| `(next)`   | `app/(next)/layout.tsx`   | `@duna/ui/tideline/styles.css`, `app/(next)/site.css`, `app/fonts.ts` | The site shell, home `/`, `/legal/**` |
| `(legacy)` | `app/(legacy)/layout.tsx` | The old sheets (unchanged)                                            | Every page not rebuilt yet, `/app/**` |

Moving between the groups is a full page load (Next does it by itself when the
root layout changes). At the app root, outside both groups, stay the files Next
serves without a layout: `api/**`, `auth/callback`, `agents`, `llms.txt`, the
`/terms` `/privacy` `/cookies` `/refunds` redirects (route handlers),
`community-actions.ts` and `predictions/actions.ts` (server actions),
`fonts.ts`, the metadata files (icons, `manifest.ts`, `robots.ts`,
`sitemap.ts`, the Open Graph image), and `global-error.tsx` /
`global-not-found.tsx`. Those two are their own documents on the design system
only, because Next loads `global-error`'s CSS with every page;
`experimental.globalNotFound` is on in `next.config.mjs`. `proxy.ts` (the
middleware) answers moved addresses (301) before either layout runs.

`scripts/design-contracts/public.ts` pins this: both layouts load the font
module; `(next)`'s layout is a design-system document; nothing under
`app/(next)`, `components/site` or `components/legal`, nor the two global
documents, imports a legacy sheet; `site.css` has no `@import` and no important
flag; `app/layout.tsx` and `app/page.tsx` do not exist.

## The document

`app/(next)/layout.tsx` renders `<body class="td site">`: the whole document is
one design-system scope. A scope does not inherit a theme, so `siteBootScript`
(`components/site/boot.ts`), the first thing in `<body>`, reads the person's
choice (`localStorage["duna-theme"]`: system, light or dark, as everywhere in
Duna) and writes `data-theme` on `<html>` and `<body>` before anything paints.
It also writes `<html data-audience>` from `localStorage["duna-site-audience"]`
so the header shows the right call to action on the first frame. A nested
scope that sits on a photograph (`GlassCard`, the honeypot band, the tile
captions) is `.td` with `data-theme="dark"` in both themes.

## The shell

`app/(next)/(site)/layout.tsx` wraps every public page in `SiteShell`
(`components/site/site-shell.tsx`):

- Skip link ("Skip to content", to `#main`), then `SiteHeader` (banner): the
  Crest and wordmark, the page links (`siteNavigation` in
  `components/site/links.ts`), the "I play / I run a club" `AudienceSwitch`
  (changes the call to action only), Sign in or, signed in, "Open Duna", and
  the call to action. Under 1,080 px the links move into a kit `Sheet`.
- The page, Crossing in on a route change (`SiteTransition`, the kit's CSS
  `PageTransition`: never holds input; a 200 ms fade under reduced motion).
- `SiteFooter` (contentinfo): Play, Run, Watch, Duna and Legal.
- `ThumbBar`: on phones, after 420 px of scroll, one 56 px call to action.

The page renders its own `<main id="main" tabIndex={-1}>` and its one `h1`.
`links.ts` says where links go until later packages ship their pages
(`/add-score`, `/coaches`, `/pricing`, `/sand-rating`): change the address
there when the page lands.

## Parts a page uses

| Need                                | Use (`components/site/`)                                                    |
| ----------------------------------- | --------------------------------------------------------------------------- |
| Section opener "label, line, chip"  | `<NetLine label chip?>`                                                     |
| A photograph (and an optional loop) | `<PhotoStage photo sizes priority? video? credit?>` with `sitePhotos`       |
| Glass over a photo                  | `<GlassCard label status example>`                                          |
| A concept that plays once in view   | `usePlayOnce()` → `rest` / `armed` / `play` (rest is the end state)         |
| Concepts                            | `concepts/concept-*.tsx` (rating, score, open game, pass, drill, ask, film) |
| Buttons that are links              | `<LinkButton>`, `<ArrowLink>` (client navigation inside the site)           |
| Where · When · What                 | `search/search-card.tsx`; pure helpers in `search/search-query.ts`          |
| Styles                              | `app/(next)/site.css`, tokens only, in `@layer site`                        |

Content first, motion as enhancement: the server renders every concept at its
end state; a concept below the fold is set to its start only after hydration,
off screen, and plays at 45% visible. Nothing on the first screen waits for
script (it Rises with CSS from first paint).

## Add a public page, or move one out of `(legacy)`

```text
1. git mv "apps/web/app/(legacy)/run-your-club" "apps/web/app/(next)/(site)/run-your-club"
   (same address; fix relative imports; `@/app/(legacy)/…` imports become `@/app/(next)/(site)/…`)
2. Rebuild page.tsx on @duna/ui/tideline and components/site:
     export const metadata = { title: "Run your volleyball club", alternates: { canonical: "/run-your-club" } };
     export default function Page() {
       return (
         <main id="main" tabIndex={-1}>
           <section className="site-wrap site-section">
             <NetLine label="For clubs" />
             <h1 className="site-display">Run the whole club from one place.</h1>
           </section>
         </main>
       );
     }
3. Delete the old page's components, style rules and tests; update e2e selectors
   that pinned the old layout; remove the legacy contract pins for it.
4. Add new styles to app/(next)/site.css (tokens only) or a page sheet imported
   by the page's own layout; never import a legacy sheet.
5. Update links.ts, the sitemap / Markdown companion entries, and look at it at
   1440, 1024 and 375 px, light and dark, and with reduced motion.
```

When `(legacy)` is empty, delete its layout and every legacy sheet.
