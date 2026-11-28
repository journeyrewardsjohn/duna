# Public website performance (SITE-PERF-1)

The first measured baseline of the rebuilt public site, the cause of the browser-test hang that
blocked merges in November 2026, what changed, the budgets proposed per page, and how to measure
again. Read with `docs/design/website.md` §6 (the design budgets) and `docs/design/web-shell.md`.

## 1. Why `load` hung in CI (`site-pages.spec.ts`, 28 November 2026)

Symptom: `page.goto("/sand-rating")` (other runs: `/pro`, `/apps`) and the accessibility scan's
`page.reload()` timed out after 90 s "waiting until load", on `main` and on every pull request.

Evidence (CI run 46138891590, artifact `browser-qa`, trace of the failing test):

- The page itself was fine: the document answered 200 in 14 ms, the h1, banner, footer and canonical
  link all passed, and every script, sheet and font finished.
- Exactly one request never finished: `/_next/image?url=…partners-lowfive….webp&w=384&q=75`, the
  375 px variant of the Sand Rating hero photograph. The hero is `priority` (eager, `fetchpriority=high`
  and a `<link rel="preload" imagesrcset>`), so the document's `load` event waited for it forever.
- The test did `setViewportSize(375)` on the already loaded 1440 px page and then navigated at once.
  The resize makes the browser request the 384 w source; the navigation abandons that request.
- The same trace for the accessibility scan shows five `/_next/image` addresses that never answered
  (`beach-attack` w 1080, `partners-lowfive` w 1080 and w 384, `watch-rest` w 1080 and w 384), all
  first requested by a page that then navigated away.

Mechanism, read in `next@16.2.12` (`dist/server/next-server.js`, `image-optimizer.js`,
`lib/batcher.js`, `compiled/send`):

1. `next start` optimises an image in process. For a static import it reads the source through a
   mocked request that reuses the browser's socket (`fetchInternalImage`,
   `createRequestResponseMocks({ socket: _req.socket })`).
2. If the browser has already abandoned that request, the socket is destroyed. `send`'s
   `onFinished` sees a finished response and destroys the file stream, so the mocked response never
   emits `finish` and `hasStreamed` never settles.
3. The image response cache deduplicates work per cache key (`Batcher`). The never-settling promise
   stays in its `pending` map, so **every later request for that address, from any page or test,
   waits on it for the life of the server**. That is why all three retries failed identically, and why
   other runs failed on `/pro` or `/apps`: whichever hero address another spec abandoned first.

Production on duna.coach is not affected: Vercel serves `/_next/image` from its own optimiser
(`server: Vercel`, `x-vercel-cache`), and the live `/sand-rating` fires `load` at 0.55 s with nothing
pending. A self-hosted `next start` behind real users would be: a visitor who leaves while a
photograph is still on its first request can stall that address for everyone until a restart. This
is an upstream Next.js defect worth reporting with the trace above.

What changed so CI is honest and stable (no timeout was raised):

- `site-pages.spec.ts` waits for what a person needs: `domcontentloaded`, the one h1 visible, the
  primary call to action visible and enabled. It never waits for `load`.
- Each width gets a fresh page sized before it loads (no resize-then-navigate), and the spec lets a
  page's photographs finish (bounded, 5 s) before leaving it, so it no longer abandons first
  requests and stalls addresses for itself or other specs.
- A new test per page (`/`, `/run-your-club`, `/coaches`, `/pricing`, `/apps`, `/sand-rating`, `/pro`),
  at 375 and 1440 px, catches this defect class directly. Five seconds after the h1 is visible:
  - no request is still open except video (a stream, a poll, an event source or an image that never
    ends fails, naming the address); no WebSocket is opened;
  - an open `/_next/image` request that the server cannot answer either within 5 s is the stall above:
    it is recorded as a test annotation (`image optimiser stall`), not failed, so one abandoned request
    elsewhere cannot block merges again; any other open request fails;
  - every video has `preload` `none` or `metadata`, no `poster` pointing at a full-size original, and
    none plays outside the viewport;
  - the largest visible photograph is `loading=eager` and `fetchpriority=high`;
  - the first screen's transfer is under the budget in §4 (document, applied CSS, document scripts,
    fonts, images, video), and the measured numbers are attached to the test result.

## 2. Baseline on the live site, before this change

Method: Lighthouse 12.8 (`npx --yes lighthouse@12`, not added to the repository), headless Chrome on
an Apple M5 Max, default mobile preset (Moto G Power emulation, simulated slow 4G, 4× CPU) and the
desktop preset, one run per page, one run at a time, performance category only. Measured
28 November 2026 against https://duna.coach (Vercel production). Transfer is what Lighthouse saw,
Brotli where Vercel served it. Single runs: treat ±10 points and ±0.5 s as noise.

### Mobile

| Page             | Score | LCP    | CLS   | TBT    | Transfer  | Requests | LCP element                                 |
| ---------------- | ----- | ------ | ----- | ------ | --------- | -------- | ------------------------------------------- |
| `/`              | 77    | 6.22 s | 0.000 | 51 ms  | 1,153 KiB | 54       | hero lead `p.td-rise.site-lead` (text)      |
| `/run-your-club` | 81    | 5.16 s | 0.000 | 46 ms  | 1,141 KiB | 65       | hero photo `img.site-photo__image` (huddle) |
| `/pricing`       | 77    | 6.35 s | 0.000 | 45 ms  | 1,014 KiB | 61       | `h1#pricing-title` (text)                   |
| `/apps`          | 78    | 4.79 s | 0.000 | 248 ms | 1,118 KiB | 64       | hero photo (friends walk)                   |
| `/sand-rating`   | 89    | 3.60 s | 0.000 | 87 ms  | 1,023 KiB | 54       | hero photo (partners low five)              |
| `/pro`           | 78    | 5.00 s | 0.000 | 3 ms   | 1,070 KiB | 65       | hero photo (beach attack)                   |
| `/add-score`     | 85    | 4.42 s | 0.000 | 45 ms  | 744 KiB   | 41       | `div.as-note > p` (text)                    |
| `/discover`      | 51    | 5.24 s | 0.000 | 872 ms | 2,555 KiB | 83       | `h1` in `discover-v2-hero` (text)           |

Three heaviest requests per page (mobile):

| Page             | 1                                         | 2                                                 | 3                                  |
| ---------------- | ----------------------------------------- | ------------------------------------------------- | ---------------------------------- |
| `/`              | `beach-attack.webp` original, 258 KiB (¹) | JS chunk `0qgs…`, 190 KiB                         | JS chunk `1ssn…`, 189 KiB (²)      |
| `/run-your-club` | JS `0qgs…`, 190 KiB                       | JS `1ssn…`, 189 KiB (²)                           | legacy CSS `2e7t…`, 120 KiB (³)    |
| `/pricing`       | JS `0qgs…`, 190 KiB                       | JS `1ssn…`, 189 KiB                               | legacy CSS `2e7t…`, 120 KiB        |
| `/apps`          | JS `0qgs…`, 190 KiB                       | JS `1ssn…`, 189 KiB                               | legacy CSS `2e7t…`, 120 KiB        |
| `/sand-rating`   | JS `0qgs…`, 190 KiB                       | JS `1ssn…`, 189 KiB                               | legacy CSS `2e7t…`, 120 KiB        |
| `/pro`           | JS `0qgs…`, 190 KiB                       | JS `1ssn…`, 189 KiB                               | legacy CSS `2e7t…`, 120 KiB        |
| `/add-score`     | JS `0qgs…`, 190 KiB                       | JS `1ssn…`, 189 KiB                               | JS `07wo…` (React, Sentry), 74 KiB |
| `/discover`      | JS `2qbn…`, 501 KiB                       | event photo from blob storage, 448 KiB, unresized | JS `0qgs…`, 190 KiB                |

### Desktop (four pages, to stay within twelve runs)

| Page           | Score | LCP    | CLS   | TBT  | Transfer  | Requests | LCP element           |
| -------------- | ----- | ------ | ----- | ---- | --------- | -------- | --------------------- |
| `/`            | 99    | 1.04 s | 0.000 | 4 ms | 1,655 KiB | 95       | hero photo (portrait) |
| `/apps`        | 99    | 0.95 s | 0.000 | 0 ms | 1,204 KiB | 84       | hero photo            |
| `/sand-rating` | 99    | 0.89 s | 0.000 | 0 ms | 1,086 KiB | 73       | hero photo            |
| `/pro`         | 95    | 0.97 s | 0.000 | 0 ms | 1,146 KiB | 104      | hero photo            |

Desktop `/` also downloads both video loops' posters as full-size originals (258 KiB + 67 KiB) and
the 120 KiB hero loop.

### Worst offenders

1. (²) **The same 560 KB bundle twice on every page.** Chunks `0qgsderocp3a7.js` and
   `1ssn0cjyos4m7.js` are byte-for-byte the same size (573,721 bytes), hold the same 89 module ids and
   the same characters in a different order: the Tideline UI kit (motion, confirm, NetScore and
   friends) emitted into two chunk groups. Every marketing page downloads and parses it twice:
   190 KiB compressed and ~560 KB of script wasted per view. Not fixed here (it is a build question,
   outside this package's paths); see §5.
2. (¹) **Video posters were the full-size originals.** `PhotoStage` set `poster={photo.image.src}`,
   the unoptimised 2000 px WebP, which the browser downloads the moment the loop mounts (after `load`,
   on phones too, even for the story frame that phones never show). Fixed: §3.
3. (³) **A legacy 675 KB stylesheet (120 KiB compressed) arrives after `load` on six of eight
   pages.** Next prefetches links in view; `/discover`, `/rankings`, `/about` and `/safety` still live
   in the `(legacy)` root layout, and their prefetch preloads that layout's sheet. A link across root
   layouts is a full page load anyway, so the prefetch is pure waste. `/discover` moves into `(next)`
   in PR 351, which removes the main source (every hero's "Find a game"). See §5.
4. **Script weight against the design budget.** `website.md` §6 sets 90 KB of compressed JS for the
   first view; every marketing page ships 600–720 KiB (Lighthouse: 356–384 KiB of it unused). LCP on
   phones is 3.6–6.4 s against a 2.0 s target, driven by script and the render path, not by photos
   (hero photographs are 12–43 KiB AVIF on phones).
5. `/discover` (measure only, PR 351 owns it): 2.5 MB, 872 ms TBT, a 448 KiB event photograph served
   straight from blob storage at full size, 1.2 s of render-blocking CSS.

Good already: CLS is 0.000 everywhere; hero photographs are AVIF at the right width with
`fetchpriority=high` and a preload; fonts are two preloaded `next/font` files (Jost 500 and Geist,
Latin) with Geist Mono not preloaded; video never loads before `load`, is muted, `preload="none"`,
plays only in view and with motion allowed, and pauses off screen.

## 3. What this change does, and what it should move

| Change                                                                                                                                    | Where                                      | Expected effect after deploy                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No `poster` on the loops: the optimised photograph underneath is the poster (the video is transparent until it can play)                  | `apps/web/components/site/photo-stage.tsx` | `/`: −325 KiB on desktop (−258 KiB of `beach-attack` and −67 KiB of `hero-portrait` originals), −258 KiB on phones. Home mobile transfer ≈ 1,153 → ~895 KiB. No visual change.               |
| `Cache-Control: public, max-age=86400, stale-while-revalidate=604800` on `/site/*`                                                        | `apps/web/next.config.mjs`                 | Loops were `max-age=0, must-revalidate`: every visit re-validated 120–435 KiB of video. Repeat visits within a day skip the network. Files are served by name, not hash, so not `immutable`. |
| `site-pages.spec.ts` waits for use, not `load`; fresh page per width; no abandoned first requests; per-page settle, media and budget test | `tests/e2e/site-pages.spec.ts`             | The merge blocker ends; a page that opens a long-lived request, plays video off screen, ships a full-size poster or outgrows its budget fails with the address named.                        |

Assets: the two loops are already 720 p H.264, `+faststart`, no audio, 122 KB and 435 KB, inside the
§6 cap of 500 KB. Re-encoding `attack-loop.mp4` with `libx264 -preset veryslow` gave 533 KB at
CRF 24 (SSIM 0.992), 482 KB at CRF 26 and 436 KB at CRF 28 (SSIM 0.988): no saving at equal quality,
so the files are unchanged. The eleven photographs (1450–2000 px WebP, 67–263 KB) are only the
optimiser's source now that no page downloads an original; unchanged. `avifenc` is not on the
machine; `ffmpeg`, `sips` and `cwebp` are, and were not needed.

Not measurable yet: none of this is on duna.coach until the pull request merges and deploys. The
"after" numbers are the commands in §6, run on the deployed site.

## 4. Budgets

Proposed per page, Lighthouse mobile preset (the design targets from `website.md` §6 in brackets):

| Page             | LCP (target)  | CLS    | JS, compressed (target) | Media on first screen                                     |
| ---------------- | ------------- | ------ | ----------------------- | --------------------------------------------------------- |
| `/`              | ≤ 3.0 s (2.0) | ≤ 0.05 | ≤ 450 KiB (90)          | hero photo ≤ 60 KiB at 800 w; loop after `load` ≤ 150 KiB |
| `/run-your-club` | ≤ 3.0 s (2.0) | ≤ 0.05 | ≤ 450 KiB (90)          | hero photo ≤ 60 KiB                                       |
| `/coaches`       | ≤ 3.0 s (2.0) | ≤ 0.05 | ≤ 450 KiB (90)          | hero photo ≤ 60 KiB                                       |
| `/pricing`       | ≤ 2.5 s (2.0) | ≤ 0.05 | ≤ 450 KiB (90)          | none                                                      |
| `/apps`          | ≤ 3.0 s (2.0) | ≤ 0.05 | ≤ 450 KiB (90)          | hero photo ≤ 60 KiB                                       |
| `/sand-rating`   | ≤ 3.0 s (2.0) | ≤ 0.05 | ≤ 450 KiB (90)          | hero photo ≤ 60 KiB                                       |
| `/pro`           | ≤ 3.0 s (2.0) | ≤ 0.05 | ≤ 450 KiB (90)          | hero photo ≤ 60 KiB                                       |
| `/add-score`     | ≤ 2.5 s (2.0) | ≤ 0.05 | ≤ 400 KiB (90)          | none                                                      |
| `/discover`      | ≤ 3.0 s (2.0) | ≤ 0.05 | ≤ 500 KiB               | result photos resized, ≤ 200 KiB                          |

The 450 KiB step is reachable by removing the duplicate chunk (−190 KiB) and nothing else; the 90 KB
target needs the concepts to load per section as `website.md` §6 already asks.

Enforced in CI today (`BUDGET_KIB` in `site-pages.spec.ts`, per first screen, `next start` with gzip,
at 375 and 1440 px): document 64, applied CSS 96, document scripts 900, fonts 128, images 320, video 200,
total 1,400 KiB. These are a ratchet at today's size plus headroom, not the targets above: lower them
as §5 lands. Each run attaches the measured numbers to the test result (annotation
`first-screen transfer (KiB)`), so the next reduction can be set from data.

## 5. Quick wins not done here, with expected gain

Status after SITE-PERF-2 (§7): the duplicate chunk, the legacy prefetch and the unused script are
fixed; the text-LCP row is explained in §7.4.

| Finding                                                                         | Expected gain                                                                        | Owner path                                                                                                                                                                   |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Duplicate Tideline chunk (`0qgs…` = `1ssn…`, same 89 modules) on every page     | −190 KiB compressed and ~560 KB less script to parse per view; TBT and LCP on phones | build configuration / `packages/ui` chunking (try one client entry for `@duna/ui/tideline`, then compare `.next/static/chunks`)                                              |
| Prefetch of `(legacy)` routes from `(next)` pages loads the 675 KB legacy sheet | −120 KiB compressed after `load` on six of eight pages                               | `/discover` moves in PR 351; for `/rankings`, `/about`, `/safety` until they move: `prefetch={false}` on those footer links (a cross-root-layout link is a full load anyway) |
| `/discover` event photographs served full size from blob storage                | −516 KiB (Lighthouse "properly size images")                                         | PR 351: send them through `next/image` with `sizes`                                                                                                                          |
| `/discover` render-blocking CSS                                                 | −1.2 s on phones                                                                     | PR 351 (leaves the legacy sheet)                                                                                                                                             |
| 356–384 KiB of unused JS per marketing page                                     | most of the gap to the 90 KB target                                                  | load each concept with its section (`website.md` §6)                                                                                                                         |
| Text LCP at 6.2–6.4 s on `/` and `/pricing` on phones while FCP is 1.6 s        | up to ~4 s of mobile LCP                                                             | investigate: the h1 and lead Rise with a clip-path from the first paint; check whether Chrome counts the frame where the Rise ends, and the script-bound main thread         |

## 6. Re-measure after deploy

Run one at a time from any directory (nothing is installed in the repository):

```sh
for p in "" run-your-club pricing apps sand-rating pro add-score discover; do
  npx --yes lighthouse@12 "https://duna.coach/$p" --only-categories=performance \
    --output=json --output-path="./lh-mobile-${p:-home}.json" \
    --chrome-flags="--headless=new" --quiet
done
for p in "" apps sand-rating pro; do
  npx --yes lighthouse@12 "https://duna.coach/$p" --preset=desktop --only-categories=performance \
    --output=json --output-path="./lh-desktop-${p:-home}.json" \
    --chrome-flags="--headless=new" --quiet
done
```

Read each report's `categories.performance.score` and the audits `largest-contentful-paint`,
`cumulative-layout-shift`, `total-blocking-time`, `network-requests` (sum `transferSize`) and
`largest-contentful-paint-element`. Expect `/` to drop the two `/_next/static/media/*.webp` originals
from `network-requests`, and `curl -sI https://duna.coach/site/hero-loop.mp4 | grep -i cache-control`
to show `max-age=86400`.

## 7. SITE-PERF-2: what is shipped, and when (28 November 2026)

Package SITE-PERF-2 changes what the public site ships on the first view and when the rest
arrives. Nothing is restyled or moved: every change keeps the markup, the motion and the
behaviour a visitor sees.

### 7.1 Method

`next build` and `next start` locally (port 3417, no database, so the rail and discovery show
their empty states), images warmed through the optimiser before measuring (production serves
them from Vercel's cache; see §1 for the `next start` optimiser stall). Lighthouse 12.8 mobile
preset (simulated slow 4G, 4x CPU), performance only, one run at a time, nothing else running.
The four target pages were run twice after the change; both runs agreed within 0.02 s. The
bundle composition comes from `next experimental-analyze -o` (Turbopack's analyzer; the output
lands in `apps/web/.next/diagnostics/analyze`).

### 7.2 Before and after (local production build, Lighthouse mobile)

| Page             | Score before | Score after | LCP before | LCP after | Script before the LCP | Total script |
| ---------------- | ------------ | ----------- | ---------- | --------- | --------------------- | ------------ |
| `/`              | 78           | 89          | 5.94 s     | 3.75 s    | 650 → 191 KiB         | 650 → 412    |
| `/discover`      | 79           | 90          | 5.71 s     | 3.51 s    | 640 → 252 KiB         | 661 → 355    |
| `/pricing`       | 77           | 92          | 6.31 s     | 3.36 s    | 661 → 208 KiB         | 661 → 399    |
| `/run-your-club` | 76           | 87          | 7.00 s     | 3.90 s    | 665 → 187 KiB         | 665 → 368    |
| `/apps`          | 78 (live)    | 85          | 4.8 (live) | 4.27 s    | → 254 KiB             | → 341        |
| `/sand-rating`   | 89 (live)    | 90          | 3.6 (live) | 3.51 s    | → 189 KiB             | → 299        |
| `/pro`           | 78 (live)    | 89          | 5.0 (live) | 3.66 s    | → 211 KiB             | → 293        |
| `/add-score`     | 85 (live)    | 88          | 4.4 (live) | 3.92 s    | → 312 KiB             | → 393        |

Compressed transfer. "Script before the LCP" is what finished downloading before the observed
largest contentful paint, which is what Lighthouse's model charges to LCP; "total script" now
includes the prefetches and deferred islands that arrive after the first view. CLS stayed 0.000
and TBT under 20 ms everywhere. FCP is unchanged (1.35–1.66 s). The last four pages were not
measured locally before the change; their "before" is the live baseline in §2.

### 7.3 What changed, in order of gain

1. **`"sideEffects": ["*.css"]` on `@duna/ui`.** Without it Turbopack had to keep every module
   behind `export *` in `@duna/ui/tideline`, so any client component importing one part pulled the
   whole kit (UI SDK popups, calendar, toast, the training-scene player…), and it did so once per
   chunk group: that was the 190 KiB chunk downloaded twice (§2, ²). First-view script fell from
   ~2.0 MB to ~1.1 MB raw on every page in one line.
2. **First-view settling** (`components/site/first-view.ts`). The site waits for `load`, the end
   of the entrance motion (1.5 s) and an idle moment, or the visitor's first scroll, tap or key,
   before spending bandwidth on what is not on screen:
   - `SiteLink` (`components/site/site-link.tsx`, now used for every link on the public site)
     prefetches only after that. Viewport prefetch had fired 5–7 RSC requests plus the next
     pages' chunks in the first 450 ms of every page (−1.1 s LCP on `/pricing` by itself).
   - `SiteLink` never prefetches a page still in `(legacy)` (`isCrossDocumentPath` in
     `components/site/links.ts`): `/about`, `/rankings`, `/safety`, `/sign-in`, `/sign-up`. Their
     prefetch only downloaded the 675 KB legacy stylesheet; following the link is a full page load
     anyway. Remove an entry when its page moves into `(next)`.
   - `deferHydration` (`components/site/defer-hydration.tsx`, used in
     `components/site/deferred.tsx`) renders an island on the server as before and fetches its
     script after the first view; React keeps the server HTML and hydrates it when the code
     arrives. Used for everything below the hero: the concept tiles, the home story, the
     run-your-club setup read, the pricing fee calculator, the Pro finder and the rating story.
     Heroes keep their eager components.
   - The header's phone menu sheet (`site-menu.tsx`), the home search card's pickers
     (`search/search-pickers.tsx`) and the discovery bar's pickers
     (`discover/search-bar-pickers.tsx`) load the same way, or on the first press. The menu
     button is the server's button until the sheet's script is here; it is never swapped in the
     middle of a press, and a press before then opens the sheet when it arrives.
3. **Error boundaries and the header without the UI SDK.** Next ships every `error.tsx` and
   `global-error.tsx` with every page, and `global-error` in its own chunk group, so what they
   import is paid for twice. `SiteErrorState` draws the kit's error state (same `td-state` markup,
   retry, home link, copyable reference) without the interaction kit and toasts. The header's
   Sign in is the button-styled link it always rendered, without the UI SDK Button; the home
   Search submit likewise. `Cross`/`PageTransition` moved to `motion/cross.tsx` so the site layout
   stops shipping the first-open sequence and its Button.

Also: hidden button loaders stand still (`button.css`): every UI SDK Button carries a
`MicroRally` whose infinite animation ran unseen on every page in every app.

Tried and reverted: `experimental.inlineCss` (LCP +0.15–0.2 s: larger documents, same CSS).

### 7.4 What still misses the target, and why

No page reaches LCP 2.5 s; `/`, `/run-your-club`, `/apps`, `/pro` and `/add-score` are still below 90.

- **Chrome counts the hero's Rise.** The LCP element on most pages is the h1 or the lead
  paragraph, which Rises from opacity 0. Chrome reports an element that starts at opacity 0 at the
  end of its opacity animation, not at its first paint (measured: an h1 with the Rise is
  reported at 744 ms, the same h1 starting at opacity 0.01 at 8 ms). With the Rally stagger the
  LCP lands 720–900 ms after first paint, and Lighthouse's model then charges everything loaded
  and run before that moment: the framework (React and the Next router, ~165 KiB, about 0.9 s of
  simulated phone CPU) and the main-thread work of the entrance animations. With all script
  blocked, `/pricing` still measures 2.26 s.
- So the floor with this motion is about 3.3–3.5 s. Reaching 2.5 s needs a design decision, not a
  bundling one: start the hero text's Rise at a visible opacity (with the clip-path alone
  revealing it) or shorten it on the LCP element. That is the motion contract
  (`packages/ui/src/tideline/motion/motion.css`), owned by the design review, so it is not
  changed here. Changing only the starting opacity to a non-zero value would also make Chrome
  skip the text entirely while it is fully clipped, which would hide the problem rather than fix
  it.
- `/run-your-club` and `/apps` also load four below-the-fold photographs (~150 KiB) inside the
  browser's lazy-load distance before the LCP (−0.15 s if they were later; native lazy loading,
  left alone).
- `/add-score` and `/discover` are applications on the first view (the flow, the results with
  their states); their remaining script is what they need to work.

Budgets in §4 and `BUDGET_KIB` in `tests/e2e/site-pages.spec.ts` were not lowered here: lower
them from the next CI run's `first-screen transfer (KiB)` annotations.

### 7.5 Re-measure

Locally: `next build`, `next start --port 3417`, warm the hero images with `curl`, then the §6
loop against `http://127.0.0.1:3417`. On production, §6 as written.
