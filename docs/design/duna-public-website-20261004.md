# Public website refinement — October 4, 2026

The user's current direction is a simpler public site inspired by the navigation
and composition at Journey's Muse page and the typography at Hightouch's Muse
page. This amendment supersedes v4's heavy verdict headlines, gradient navigation,
and oversized detail-page imagery. It does not change HQ, authenticated Player,
native apps, event data, booking rules, permissions, or checkout.

## Presentation

- Full-width white navigation with a centered 1216px content rhythm, flat HQ
  link, one Player action, and existing menus, account, and theme access.
- Regular-weight headings, black/grey text, restrained borders and smaller
  imagery. Quiet grey sections separate the homepage chapters. Live match
  content retains its distinct semantic treatment.
- Event facts become readable rows. The hero, section index, and registration
  rail share one centered width. The image is capped at 400px on desktop and
  240px on phones. The registration rail precedes supporting details on phones.
- Sticky navigation, section links, and the booking rail must not overlap.
- Completed/cancelled events show the recorded field instead of advertising
  available places. Lifecycle, registration, results, and recordings remain intact.

## Exact reference font: pending licensed asset

Live computed styles at https://hightouch.com/muse on October 4 show **Acid
Grotesk** for the primary headings and body, weight 400; primary buttons use 500. Nuckle appears in peripheral site UI. The requested main typography is
therefore Acid Grotesk, not Journey's serif display font.

https://acidgrotesk.folchstudio.com/ identifies Folch as the license source.
No Acid Grotesk webfont package was found in the Duna or Journey source assets.
The owner has been asked for the licensed files. Until supplied, the public
website uses its existing Satoshi delivery at the new lighter scale; this is
an interim font, not an assertion that the exact swap has shipped. Do not copy
or hotlink Hightouch's font files. Once supplied, load the licensed regular and
medium webfont faces and update `--public-font` in the shared public tokens.

## Ownership and verification

`packages/ui/src/public-website.css` contains the public palette and typography
roles. They activate only on routes with the public SiteHeader; Player/HQ keep
their existing tokens. `apps/web/app/public-website.css` owns presentation and
loads after the legacy public CSS. Homepage composition remains in its module.

Regression coverage checks the reported shrink-to-content header at 390, 820,
1440, and 2280px, capped imagery, anchor clearance, ended-event capacity text,
keyboard menus, and dark preference. Existing discovery, club, booking, and
mobile-navigation tests remain release requirements.
