# Duna Design System v2 — "Golden Hour Performance"

**Product:** Duna — the operating system for sand. Player network, Sand Rating, pro tour coverage, and Duna HQ club operations.
**Thesis:** the calm, atmospheric, editorial language of luxury wellness, applied to elite sport. Serene surfaces, serious data. Energy lives in the athletes and the numbers, never in the chrome.
**Audience:** players who compete, operators who run the sand, and fans who follow the world tour.
**Status:** v2 supersedes v1. This document is the single source of truth for humans and for AI agents building Duna surfaces.

---

# PART I — FOUNDATIONS

## 1. The one rule that resolves everything: zoning

Duna carries two conflicting obligations. Our aesthetic is quiet. Our partners — FIVB, Beach Pro Tour, AVP, equipment and apparel brands — are loud. Resolve it by **zoning, not compromise.**

| | Editorial zone | Performance zone |
|---|---|---|
| **Where** | Homepage, run-your-club, About, Sand Rating explainer, player features, marketing | Live match, match detail, event pages, /pro, brackets, standings, Duna HQ console |
| **Ground** | Fog `#F6F5F1`, sand, marine | Ink `#1B1B19`, marine-900 `#22343B` |
| **Display type** | Serif, large, airy | Condensed tabular numerals |
| **Motion** | Max one ambient element per viewport | Unrestricted but purposeful |
| **Partner brands** | Monochrome at rest, color on hover only | Full color, inside a contained frame |
| **Feeling** | Still | Alive |

**Brand owns the fill. Duna owns the frame.** Corner radius, type, spacing, and fog dissolve are non-negotiable. Everything inside a partner container can be theirs.

A loud brand inside a quiet frame reads premium. A loud brand on a loud page reads like a banner ad.

---

## 2. Color

### Environmental
| Token | Hex | Name | Use |
|---|---|---|---|
| `--sand-100` | `#EFE6D3` | Warm Sand | Light warm sections |
| `--sand-300` | `#E2CFA6` | Dune Gold | Gradient partner, imagery tint |
| `--sand-500` | `#C9A96A` | Golden Hour | Podium, gold medal, premium tier, winner bracket paths |
| `--marine-200` | `#B5CCD3` | Marine Haze | Cool section backgrounds |
| `--marine-400` | `#8FB0BC` | Offshore | Hover on marine surfaces, secondary data |
| `--marine-900` | `#22343B` | Deep Water | Dark performance ground, alternative to ink |

### Structural
| Token | Hex | Use |
|---|---|---|
| `--ink` | `#1B1B19` | Headlines, primary buttons, dark ground |
| `--ink-soft` | `#3A3A36` | Body copy on light |
| `--fog-50` | `#F6F5F1` | Default page background |
| `--fog-100` | `#EDECE6` | Card surfaces |
| `--white` | `#FFFFFF` | Glass at 60–80% opacity |

> Fix on live site: `meta[theme-color]` is `#f8f7f3`. Change to `#F6F5F1` to match `--fog-50`.

### Accents — rationed, meaning-bearing
| Token | Hex | Meaning | Budget |
|---|---|---|---|
| `--flare` | `#E8683A` | **Something is happening right now.** Live badges, match point, spots running out, in-progress. | ≤2% of pixels |
| `--signal` | `#C9E265` | **Available / online / serving / verified.** Dots and small chips only. | ≤1% |
| `--dusk` | `#F2DDE0` | Mobile ambient wash on planning screens only. Never a component fill on web. | Background only |
| `--dusk-deep` | `#EDD3D9` | Selected date pill in app | — |

**The flare test:** before using coral, ask "is this describing a live, time-bound state?" If no, use ink or a neutral chip. Flare is never decorative, never a brand color, never a CTA fill.

### Semantic
| Token | Hex | Use |
|---|---|---|
| `--gain` | `#2F6B3A` | Rating up, rank up, revenue up |
| `--loss` | `#9A4A2E` | Rating down, rank down |
| `--pending` | `#8A8578` | Not yet available, unmapped, provisional |

### Ratio target per screen
Fog + shell 60% · sand 15% · marine 15% · ink 8% · accents ≤2%. Dark performance screens invert: ink 70%, marine 15%, fog type 12%, accents ≤3%.

### Gradients — three, and only three
1. **Golden hour wash** — `marine-200 → sand-300` at 15–20°. Section transitions, hero overlays.
2. **Fog dissolve** — imagery → `fog-50` over 300–500px. **Every hero uses this. Imagery never has a hard bottom edge.**
3. **Dusk wash** — `#FBF3F4 → #FFFFFF` vertical. Mobile planning screens only.

---

## 3. Typography

You are cleared to ship the free stack. Structure is identical either way — the licensed upgrade is a font-file swap, nothing more.

### Role 1 — Display (serif)
- **Shipping:** Instrument Serif, 400. **Optional upgrade:** Awesome Serif Light (~300).
- Stack: `"Awesome Serif","Instrument Serif",Georgia,serif`
- Line height 1.02–1.10. Letter-spacing −0.015 to −0.022em. **Sentence case with a terminal period.**
- Sizes: hero `clamp(46px,8.4vw,116px)` · section `clamp(34px,4.6vw,60px)` · card `25–32px`
- **Use it for:** hero headlines, section headlines, card titles in editorial zones, pull quotes, event names on event heroes.
- **Never use it for:** buttons, labels, table cells, nav, any number, any UI in the app, anything under 20px.

### Role 2 — Text / UI (sans)
- **Shipping:** Figtree. **Optional upgrade:** Fellix.
- Stack: `"Fellix","Figtree",-apple-system,sans-serif`
- Weight map — treat as law:
  - **300** subtitles ≥20px only
  - **400** body, descriptions, table cells
  - **500** nav links, labels, player names, team names, eyebrows
  - **600** buttons, card titles in performance zones, emphasis in proof lines
  - **700** reserved; only for a chip that must out-rank a 600 next to it
  - **800+** never in this role — that's Archivo's job
- Sizes: body 16/26 · secondary 14.5/23 · caption 13/18 · micro 11.5/16

### Role 3 — Data / Score (condensed + expanded)
- **Archivo** (Google Fonts, SIL OFL). Variable: `wdth 62–125`, `wght 100–900`. One file, both jobs.
- Always: `font-variant-numeric: tabular-nums; font-feature-settings:"tnum" 1;`
- Width map:
  - `wdth 66–72, wght 800` — live scores, huge match numerals
  - `wdth 76–80, wght 700` — table figures, seeds, points, deltas, timestamps, chips
  - `wdth 88–92, wght 800` — the DUNA wordmark, section counts
  - `wdth 110–120, wght 800` — hero statistics and the Sand Rating value (the only "expanded" moments)
- **Use it for:** every number that means something. Scores, sets, seeds, ranks, points, ratings, percentages, credit volume, counts, times, dates in cards.
- **Never use it for:** prose, headlines, buttons, or numbers inside a sentence ("we tracked 105 events" stays in Figtree).

### The signature contrast
A serif headline sitting directly above a condensed tabular scoreline is the entire brand in one frame. Poetry above, precision below. Design at least one such pairing into every major page.

### Loading
```html
<link href="https://fonts.googleapis.com/css2?family=Archivo:ital,wdth,wght@0,62..125,100..900;1,62..125,100..900&family=Figtree:wght@300;400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet">
```
Self-host in production. Subset Archivo to Latin + numerals + `–` en dash. Preload the serif — it is above the fold on every page.

---

## 4. Eyebrow system

Eyebrows are the most-used and most-abused device on the current site. They are doing real work: they tell you what *kind* of thing you're about to read. Formalize them.

**Spec:** Figtree 500 · 11px · `letter-spacing: .14em` · uppercase · `--ink-soft` at 72% opacity (or `--sand-300` at 90% on dark) · 16px below it before the headline.

**An eyebrow must be a category, a scope, or a source.** Three legal forms:

1. **Category** — what this section is. `Pro tour` · `Sand Rating` · `Smart Rules` · `Plans + memberships`
2. **Scope** — the slice of data shown. `2026-08-03 – 2026-08-09` · `Top 6, men` · `Round 1 · Court CC`
3. **Source or state** — where it came from or how fresh. `Official entry lists` · `Updated 8:21 PM` · `Volleyball World snapshot` · `Live · updating`

**Never:**
- A teaser or a sales line. *"Your next yes is closer than you think"* is a headline, not an eyebrow.
- A sentence, or anything over 5 words.
- A repeat of the headline's noun. Eyebrow `Sand Rating` + headline "Sand Rating explained" wastes both.
- Two eyebrows on one section.
- Sentence case. Always uppercase, always tracked.

**Live-site corrections:** `Happening on Duna` → keep. `Everything connected` → change to `Modules`. `Your club, presented as yours` → change to `Theme Kit`. `Start at your size` → change to `Getting started`. Vague-poetic eyebrows are the single most common error on run-your-club.

**Optional flare dot:** an eyebrow may carry a leading 6px flare dot **only** when the section content updates in real time.

---

## 5. Tag and chip system

Tags carry state and taxonomy. On the current site they run together as undifferentiated text — `upcomingmen FutureBPT Futures Pingtan` — because there is no visual hierarchy between four different kinds of tag. Fix it with four distinct classes. Never place two tags of the same class adjacent; never place more than three tags on one card.

### Class A — Status pill (what is happening)
Full radius · 5px 11px · Figtree 600 · 9.5px · `.16em` uppercase. **One per card, always first, always leftmost.**

| State | Fill | Text | Notes |
|---|---|---|---|
| Live | `rgba(232,104,58,.14)` | `#B84A20` | Pulsing 6px flare dot |
| Upcoming | `rgba(27,27,25,.06)` | `--ink-soft` | No dot |
| Final | `--ink` | `--fog-50` | Solid — a result is settled |
| Cancelled / withdrawn | transparent, 1px `--pending` border | `--pending` | Strikethrough team name |
| Pending data | `rgba(138,133,120,.12)` | `--pending` | Italic label |

### Class B — Taxonomy chip (what kind of thing)
8px radius · 4px 9px · Figtree 500 · 10px · `.12em` uppercase · `--fog-100` fill · `--ink-soft` text. Tier and division: `Elite16` · `Challenge` · `Futures` · `AVP League` · `Pickup` · `League` · `Clinic` · `Men` · `Women` · `Coed`.
Division chips (men/women/coed) are **always last** in the chip row and always lower contrast than tier.

### Class C — Metric chip (a number with a unit)
8px radius · Archivo `wdth 78, wght 700` · 12.5px · tabular. `3 spots` · `+0.14` · `8,360 pts` · `0/20 matches`.
Turns flare-tinted (`rgba(232,104,58,.13)` / `#B84A20`) **only** on scarcity or live change: ≤3 spots left, rating moved this session, score changed in the last 10s.

### Class D — Identity chip (who)
Flag + country code, or a partner mark. **Replace all flag emoji with a single SVG flag set** — emoji render differently on every OS and currently break the type line on /pro and event pages. Spec: 16×11px SVG flag, 4px gap, then `SWE` in Figtree 500 10px `.1em` uppercase at 60% opacity.

### Ordering law
`[Status] [Tier] [Division] … [Metric right-aligned]`. Status left, metric right, taxonomy between. Applied consistently, a scanning eye learns the card in one fixation.

---

## 6. Surfaces, depth, radii, motion

- **Glass:** white 60–75%, `backdrop-filter: blur(16–24px) saturate(1.3)`, 1px `rgba(255,255,255,.55)` border. Used for nav, tickers, cards on imagery, cards on tinted blocks.
- **Shadows:** avoid. When unavoidable, `0 8px 32px rgba(27,27,25,.06)`. Depth comes from translucency and layering, not drop shadows.
- **Radii:** `999px` pills and chips · `24px` cards · `16px` nested · `8px` chips and inputs. No sharp corners anywhere in the product.
- **Minimum three visible layers** on any hero or section-lead surface: background gradient → imagery with fog dissolve → glass → content.
- **Motion budget:** editorial ≤1 ambient element per viewport. Performance zones unrestricted but every motion must encode a state change. Score flip 200ms ease-out. Live dot pulse 2s. Ticker 42s linear. All motion respects `prefers-reduced-motion`.
- **Hover:** `translateY(-2px)` on buttons, `-4px` on cards, 220ms `cubic-bezier(.2,.7,.3,1)`. Never scale. Never glow.

---

## 7. Voice and tone

The current copy is already strong — *"Run the business. Keep the game human."* and *"Performance over trophies"* are exactly right. Codify it.

### Do
- **Short declaratives. Sentence case. Terminal periods on headlines.** "There's always another game."
- **Name the thing.** "Record a match," not "Log your athletic performance."
- **Let data speak.** "128 teams. 14 stops. One tour." Never "the most exciting season yet."
- **Be honest about emptiness.** *"Both teams currently have an even prior because mapped rating data is incomplete."* — this is the best sentence on the site. It explains rather than hides. Write every empty state this way.
- **Active verbs on controls.** `Follow the tour` · `See full results` · `Publish the session`. The button that says "Publish" produces a toast that says "Published."
- **Second person for players, plain third person for the system.** "Your rating moved. Duna reads the whole result."

### Avoid
- Hype adjectives: *revolutionary, seamless, powerful, cutting-edge, game-changing, unleash, elevate.*
- Exclamation marks. Anywhere. Including toasts.
- Em dashes in UI copy (use a period or a colon).
- Apologizing errors. State what happened and what to do.
- Sport clichés: *leave it all on the sand, grind, next level, built different.*
- Anthropomorphizing the model. "Duna reads the result," not "Duna thinks you're improving."
- Superlatives about our own size. We have 50 profiles. Say 50.

### Naming consistency (real bug)
The site currently uses **"Sand Rating"** and **"SandRating"** interchangeably — sometimes in the same card. Pick one: **"Sand Rating"** in all prose and headings, `sand-rating` in slugs and code. Search-and-replace "SandRating" out of the UI. Also standardize `Tues` → `Tue` on /pro (currently the only three-letter-plus-s day abbreviation, and it breaks the date rail's optical rhythm).

---

# PART II — IMAGERY AND THE HIGGSFIELD PIPELINE

## 8. Image doctrine

Every image in Duna obeys these, whether photographed, licensed, or generated.

**The look:** golden hour or blue hour only. Low sun, long shadows on sand, backlit spray. Muted filmic grade — lifted blacks, desaturation 15–25%, highlights warmed toward `--sand-300`, shadows cooled toward `--marine-400`. Fine grain. Medium-format film, not broadcast television.

**The feeling:** frozen athleticism inside stillness. A player mid-swing silhouetted against hazy sky. Sand suspended off a dig. An empty court at dawn with the net line dissolving into fog. Motion captured, frame quiet.

**Depth is mandatory.** Build every hero in five plates:
1. **Foreground occlusion** — dune grass, net mesh, a blurred shoulder entering frame. 20–40% blur. Parallax 0.78.
2. **Subject** — athlete or object, tack sharp. Parallax 0.42.
3. **Atmosphere** — haze, backlit sand particles, ocean mist. Parallax 0.52.
4. **Sky** — graded clouds carrying marine → sand. Parallax 0.10.
5. **Fog dissolve** — bottom 30–46% fades to `--fog-50`. Not a plate; a CSS gradient. Always present.

**Never:** confetti, decorative lens flares, HDR crunch, saturated sponsor-blue skies, crowd wide shots as heroes, stock-photo grins, motivational text burned into an image, arms-raised trophy clichés, or midday harsh light.

---

## 9. Higgsfield MCP — generation pipeline

Server: `https://mcp.higgsfield.ai/mcp` (Settings → Connectors → authenticate with the Higgsfield account). Runs on Higgsfield plan credits. Generation is async — the agent submits, polls, returns URLs.

### 9.1 Model routing
| Need | Model | Why |
|---|---|---|
| Hero plates, venue atmosphere, 4K editorial | **Nano Banana Pro** | Best composition and lighting fidelity at 4K |
| Anything with legible text, signage, court boards, event posters | **GPT Image 2** | Near-perfect text rendering |
| Recurring athlete or coach across many screens | **Soul 2.0** + `create_character` | Cast consistency across a multi-shot library |
| Stylized abstracts, sand texture, net-mesh overlays, empty-state art | **Flux 2** | Fast, controllable, cheap for iteration |
| Draft/thumbnail passes before committing credits | **Seedream 5.0 Lite** | Cheapest exploration |

Default to Nano Banana Pro at 4K for anything that ships as a page hero. Explore at Seedream, finish at Nano Banana Pro.

### 9.2 Seed images — this is the whole ballgame

Generation without seeds produces generic AI beach volleyball. Generation *with* real seeds produces Duna. **Always pass 1–3 reference images.**

**Legal sourcing — required, in this priority order:**
1. Duna's own event and club photography (South Bay, Charlotte, Hermosa, Manhattan Beach).
2. Athlete-supplied images with written permission — the backer relationships (Dalhausser, Crabb, Sander) make this straightforward.
3. Licensed federation or tour assets where our agreement covers derivative use — confirm with FIVB/AVP before seeding from official tour photography.
4. Properly licensed stock (Getty Sport, Stocksy) where the license permits AI reference use — check, many do not.

**Do not seed from** press photos, scraped social media, other platforms' galleries, or any image whose license you cannot name. **Do not generate a recognizable likeness of a real athlete** unless that athlete has signed off — for real players, use their actual photograph, not a generated one. Generated humans in Duna imagery should be non-identifiable: silhouettes, backs, distance, motion blur, cropped faces.

**Seed selection rules:**
- Seed for **light and composition**, not subject. A dawn frame of your own empty Hermosa court is a better seed for a Hamburg hero than a Hamburg action photo shot at noon.
- Two seeds beat one: pass one **grade reference** (the color and light you want) plus one **composition reference** (the framing you want).
- Keep a permanent `/brand/seeds/` folder: `seed-grade-goldenhour-01.jpg`, `seed-comp-lowangle-net.jpg`, `seed-tex-sand-macro.jpg`, `seed-atmo-haze-backlit.jpg`. Reuse the same seeds across the whole library — that is what makes 40 images look like one photographer shot them.

### 9.3 The prompt template

Every Duna image prompt is assembled from six slots, in this order. Do not freestyle.

```
[SUBJECT + ACTION] , [FRAMING + LENS] , [LIGHT] , [ATMOSPHERE] ,
[GRADE] , [TECHNICAL]
```

Locked strings for the last three slots — copy verbatim every time:

- **LIGHT:** `golden hour low sun, strong backlight, long soft shadows across sand`
- **ATMOSPHERE:** `ocean haze, suspended sand particles catching the light, soft depth falloff, out-of-focus dune grass in the immediate foreground`
- **GRADE:** `muted filmic color grade, lifted blacks, desaturated 20%, warm champagne highlights, cool blue-grey shadows, fine 35mm grain, medium format editorial sports photography`
- **TECHNICAL:** `ultra high resolution 4K, no text, no logos, no watermarks, natural skin tones, no HDR crunch, shallow depth of field`

**Negative prompt (always attach):**
`saturated colors, midday sun, harsh contrast, HDR, lens flare, confetti, crowd, cheering, motivational text, logos, brand marks, watermark, stock photo smile, over-sharpened, plastic skin, cartoon, illustration`

**Worked example — homepage hero subject plate:**
```
A lone beach volleyball player at the top of a swing, seen from a low
three-quarter angle, silhouetted against hazy sky, net line crossing the
frame — wide 35mm frame, athlete small in the composition, horizon low —
golden hour low sun, strong backlight, long soft shadows across sand —
ocean haze, suspended sand particles catching the light, soft depth
falloff, out-of-focus dune grass in the immediate foreground — muted
filmic color grade, lifted blacks, desaturated 20%, warm champagne
highlights, cool blue-grey shadows, fine 35mm grain, medium format
editorial sports photography — ultra high resolution 4K, no text, no
logos, no watermarks, natural skin tones, no HDR crunch, shallow depth
of field
```

### 9.4 Agent workflow (per image)

1. **Check the manifest** (§10). Never generate an image that isn't on it.
2. **Pick 2 seeds** from `/brand/seeds/` — one grade, one composition.
3. **Draft pass:** Seedream 5.0 Lite, 3 variants, 1024px. Cheap.
4. **Gate against §9.5.** If it fails, adjust the SUBJECT/FRAMING slots only — never the locked LIGHT/ATMOSPHERE/GRADE strings.
5. **Finish pass:** Nano Banana Pro (or GPT Image 2 if text is in frame), 4K, same prompt, same seeds.
6. **Plate separation** for heroes: generate foreground, subject, and sky as **separate** generations sharing the same seeds and grade string, so they can be layered and parallaxed. Do not try to parallax a single flat image.
7. **Post:** export WebP + AVIF at 2560 / 1920 / 1280 / 768. Apply the fog dissolve in CSS, not in the image — the dissolve must match whatever background the section actually uses.
8. **Name and log:** `duna-{page}-{slot}-{plate}-v{n}.webp`, e.g. `duna-pro-hero-subject-v3.webp`. Record model, seeds, and full prompt in `/brand/imagery-log.json` so any image can be regenerated identically.

### 9.5 QA gate — reject if any is true

- Sun is high or light is neutral white.
- Colors are saturated; sky is postcard blue.
- A face is identifiable and not cleared.
- Any text, logo, sponsor board, or jersey number is legible.
- Foreground occlusion layer is missing (image reads flat).
- More than two people in frame for an editorial plate.
- Sand looks like CGI: too uniform, no grain, no wind texture.
- Anatomy fails at the hands, feet, or the ball.
- Two images in the same page have visibly different grades.

### 9.6 Video

Higgsfield does video up to 15s (Veo 3.1, Kling 3.0). Duna uses it for exactly one thing: the homepage hero ambient loop (the site already ships `duna-hero.mp4`). Rules: 8–12s, seamless loop, **no cuts**, near-static camera with only atmospheric movement (haze drifting, grass moving, one bird crossing), same grade string, muted, `poster` frame always set, and it never autoplays on reduced-motion or on cellular. Everywhere else, use a still.

---

## 10. Image manifest

The complete list of images Duna needs. Generate nothing outside it.

| ID | Page | Slot | Subject direction |
|---|---|---|---|
| `home-hero-{sky,subject,fore}` | / | Hero, 3 plates | Lone player at top of swing, wide, small in frame |
| `home-spotlight` | / | Player feature | Portrait, soft backlight, neutral sand background, eyes down |
| `home-mobile-context` | / | App section | Hands holding phone at a court edge, dawn, phone screen blank for compositing |
| `club-hero-{sky,subject,fore}` | /run-your-club | Hero, 3 plates | **Empty courts before the day starts** — nets being tensioned, lines freshly raked, no people or one distant figure |
| `club-people` | /run-your-club | People chapter | A coach mid-instruction with two players, backs to camera, distance |
| `club-money` | /run-your-club | Money chapter | Abstract: sand texture macro, raking lines, extreme close, near-monochrome |
| `pro-hero-{sky,subject,fore}` | /pro | Dark hero, 3 plates | Blue hour, stadium court from high behind, floodlights just on, empty seats |
| `pro-directory` | /pro | Player directory band | Backlit silhouette row of players walking off court |
| `event-venue-{slug}` | /events/* | Event hero plate | **Per venue.** Hamburg-Horn: racecourse grandstand + show court, low sun, north-European light, cool grade |
| `event-empty-draw` | /events/* | Pre-event empty state | Bare court, no net yet, chalk line only |
| `match-court-{cc,c2}` | /match/* | Match ambient plate | Center Court vs Court 2, shot tight and dark, heavily fogged for use behind a scoreboard |
| `rating-texture` | /methodology | Background | Sand ripple macro, near-abstract, very low contrast |
| `empty-generic` | global | Empty states | Single volleyball at rest on sand, long shadow, far off-center |
| `og-{page}` | global | Social cards | 1200×630 crops of the above, never new generations |

Venue plates scale per event: one per **venue**, not per event, reused across men's/women's divisions and across years. Two dozen plates covers the tour.

---

# PART III — PAGE AUDIT

## 11. Homepage — refactored (built)

Implemented in `duna-homepage-redesign.html`. Summary of the decisions:

- **Five-layer parallax hero** with fog dissolve; every layer marked `[PLATE]` for Higgsfield replacement.
- **Signature element: the live strand.** A glass ticker sitting exactly on the fog line, scrolling real activity — Golden Hour 4s with 3 spots, Summer Series, a just-verified result with its rating delta. Flare dots on live items. The only kinetic thing in a still hero. Hover pauses.
- **Killed the `01 / 02 / 03` markers.** Those three items are three audiences, not a sequence. Now `For players / For competitors / For operators`. Numbering implied an order that doesn't exist.
- **Small numbers stay small.** 50 / 29 / 4 sit as a quiet inline strip. Oversized Archivo Expanded is spent on the Sand Rating value and the live score, where it's earned.
- **Backers row** — monochrome at rest, color and 2px lift on hover. Same pattern will carry sponsor logos.
- **Marine block** for pro tour with a dark live card inside it and a contained presented-by lockup.
- **Ink block** for Duna HQ. **Dusk-pink panel** for the mobile section, showing the temperature rule: pink for planning, dark for competition.

---

## 12. /run-your-club — audit

**What's working:** the strongest copy on the site. *"Run the business. Keep the game human."* is on-voice and on-brand. Eyebrows here are mostly correct-form category labels. The micro-mocks (Mon/Tue/Wed schedule, Smart Rules chips, payment-recovery status, segment/trigger/action) are genuinely good content — they show rather than claim.

**Problems:**

1. **Twelve feature sections in a flat row.** Today at a glance / One system your shape / Smart Rules / One synced schedule / Plans + memberships / Payments that recover / Simple marketing / Community intelligence / Everything connected / Theme Kit / Start at your size. Each has an eyebrow, an h2, and a mock. It reads as an endless list and nothing is ranked.
2. **No imagery at all.** A B2B page with zero photography reads as unfinished, and it's the one page where Duna's atmosphere could do the most selling — you're asking someone to trust you with their livelihood.
3. **The micro-mocks are unstyled text fragments.** "Mon 9:00 AM Private lesson Tue Wed 5:30 PM Open play" is data with no container. These should be the Duna HQ visual language.
4. **Poetic eyebrows.** `Your club, presented as yours`, `Start at your size`, `Everything connected`, `One system, your shape` are headlines masquerading as eyebrows.
5. **No proof and no pricing.** Nothing anchors trust — no operator quote, no club logo, no "here's what it costs."
6. **No human.** The page is about keeping the game human and contains no people.

**Recommendations:**

- **Hero:** golden-hour plate `club-hero-*` — **empty courts before the day starts**, nets being tensioned, lines raked. That single image says "we handle the setup" better than any headline. Keep the current headline verbatim. Add the existing reassurance line *"Start as one coach. Add locations, courts, and a team when you are ready."* directly under the CTAs as a `--pending`-toned micro-line.
- **Collapse twelve sections into four chapters,** each on an alternating ground, each with one anchor visual and 2–3 sub-features inside it:
  1. **The day** (fog) — synced schedule + Smart Rules. Anchor: the schedule console.
  2. **The money** (marine block) — plans, memberships, payments, wallet/ledger. Anchor: payment-recovery console. This is a performance zone: Archivo tabular everywhere.
  3. **The people** (sand) — marketing, community intelligence, consent routing. Anchor: `club-people` image + the segment/trigger/action mock.
  4. **The brand** (ink) — Theme Kit, profile layout, publish preview. Dark ground makes the palette swatches sing.
- **Console component:** all micro-mocks become the same object — dark `--marine-900` or ink surface, 24px radius, 15px header row with `DUNA HQ` in Archivo `wdth 88/800` and a `--signal` connected dot, body with Archivo tabular figures. Build it once, reuse eight times. Consistency here is what makes the product look real.
- **Duna AI callouts** (*"Two courts are quiet after 4 PM"*) get the flare-bordered container: `rgba(232,104,58,.1)` fill, `rgba(232,104,58,.26)` border, pulsing dot, `DUNA AI · TODAY` micro-label. This is a live suggestion, so flare is correct here.
- **Eyebrow rewrites:** `One system, your shape` → `Scale`. `Everything connected` → `Modules`. `Your club, presented as yours` → `Theme Kit`. `Start at your size` → `Getting started`. `Today at a glance` → keep, it's a real scope label.
- **Add** an operator proof band (one quote, one club name, monochrome logos) between chapters 2 and 3, and a plain pricing anchor before the closing CTA. Even "starts free, 2.9% + 30¢ on what you sell" beats silence.
- **Module list** (`Booking + calendar`, `Commerce`, `Wallet + ledger`, `Team`, `Marketing`, `Theme Kit`, `Performance`, `Operations`) becomes a 4×2 grid of small fog-100 cards with Figtree 600 titles and 400 descriptions — not a bulleted list.

---

## 13. /pro — audit

**What's working:** the underlying data is excellent and genuinely differentiated — 105 tracked events, live counts, Sand Rating on pro players, tour marks, a Volleyball World snapshot, a prediction market. Nobody else assembles this. *"The world's game, in one live view."* is a strong headline. *"More dots mean more play on that date"* is a smart, well-explained affordance.

**Problems:**

1. **The date rail is a wall.** ~120 dates render as an unbroken run of `Mon 6 Jul Tues 7 Jul Wed 8 Jul…`. It's the first interactive element and it's unusable.
2. **Event cards are text dumps.** `upcomingmen FutureBPT Futures PingtanAug 6 – Aug 9, 2026China0/0 matches complete` — status, division, tier, name, dates, country, and progress with no hierarchy.
3. **`0/0 matches complete` everywhere.** For future events this is meaningless and reads as broken.
4. **Live reporting cards are enormous** — each carries four player names, four Sand Ratings, two "Not started," two "Sets —", two percentages, and a credit line. Twenty of them stacked.
5. **Everything at 50%.** Flat priors across the board make the prediction market look non-functional rather than honestly uninformed.
6. **/pro is a light page.** It's the most performance-heavy surface in the product and it's dressed as an editorial one.
7. **Flag emoji** at inconsistent baselines throughout.
8. **`Tues`** — the only day abbreviation with four letters, breaking the rail's rhythm.

**Recommendations:**

- **Invert the ground.** /pro opens dark: `pro-hero-*` plates at blue hour behind a `--marine-900` scrim, `2 LIVE NOW` as a flare status pill, `105` in Archivo Expanded, headline in serif reversed on dark. Below the hero, return to fog for browsing. Dark hero, light body — the page announces itself as live, then becomes readable.
- **Rebuild the date rail as a density strip.** Fixed 44px-wide day cells in a horizontally scrolling track with snap points, a sticky month divider, `Tue` three letters, weekend cells tinted `--sand-100`. Under each cell, the existing dot density becomes a 3px bar whose height maps to match count, ink-toned, flare-toned on live days. Today gets a full-radius ink pill. Add a `Jump to today` control. The whole rail collapses to 96px tall.
- **Event card anatomy — one strict template:**
  ```
  ┌──────────────────────────────────────────┐
  │ [LIVE]  [Elite16]  [Men]                 │  Class A, B, B
  │                                          │
  │ BPT Elite16 Hamburg                      │  Serif 25px
  │ Hamburg, Germany                         │  Figtree 400 13.5
  │                                          │
  │ Aug 5 – 9              ▓▓▓▓▓░░░░░  8/20  │  Archivo tabular + progress
  └──────────────────────────────────────────┘
  ```
  Progress bar only when `total > 0`. When a draw isn't published, replace with `Draw not yet published` in `--pending` italic. Never render `0/0`.
- **Tour marks are the co-branding moment.** BPT and AVP SVG marks: monochrome `--ink-soft` at 55% at rest, full brand color plus 2px lift on hover, and full color when a tour filter is active. That's celebration earned by interaction.
- **Collapse live-reporting cards to two lines.** Team A / Team B, set scores right-aligned in Archivo tabular, one status pill, one probability bar. Sand Rating appears on hover or on the match page — not in the list. Twenty cards become scannable.
- **Design the flat-prior state honestly.** When both sides sit at 50%, don't draw a split bar that looks broken. Show a single centered `Even prior` chip with the model note beneath it — reuse the excellent existing sentence about incomplete mapping. Only render the probability bar once the model has an opinion.
- **Player directory is the best module on the page.** Give it room: `World #1` as a sand-500 chip, Archivo Expanded for the Sand Rating value, tour points in Archivo tabular, SVG flag chip, subtle sand wash behind the top three. This is where the Expanded width earns its keep.
- **Volleyball World snapshot** becomes a proper two-column table (men / women) with tabular points, rank in Archivo `wdth 72` at 55% opacity, and `new` as a small `--signal`-tinted Class B chip. Add the eyebrow `Official snapshot · 2026-08-05` — scope and source, exactly the legal form.

---

## 14. /events/[event] — audit

**What's working:** genuinely deep. Entry lists with seeds, entry points and technical points; four pools; live standings; a prediction market; venue with map and timezone; an official-source link. The `Official source` link to FIVB is a real trust signal — keep it prominent.

**Problems:**

1. **The event hero is the official FIVB promotional poster, full width.** This is the co-branding collision in its purest form: a saturated, type-heavy, brand-led artwork dropped into a calm system. It also carries its own typography, which fights ours.
2. **96 teams in four flat tables** — main draw 12, qualification 16, reserve 23, withdrawn 45. The withdrawn list is the longest table on the page.
3. **Pool standings all read `0 00–0 0–0`.** Pre-event, every cell is a zero. It looks broken rather than "not started."
4. **`Live standings` with 🥇🥈🥉 on 0–0 records.** Medals awarded before a ball is served. `Medals provisional` is doing a lot of work that the visual design contradicts. This is a credibility problem, not a styling one.
5. **`Who wins it all?` — twelve teams all at 8.3%.** Mathematically honest, visually indistinguishable from a bug.
6. **Two nearly identical tables** — pool standings and live standings — repeat the same teams with the same zeros.
7. **Broadcast section says nothing is announced,** but occupies a full section slot.

**Recommendations:**

- **Split the hero in two.** Duna generates `event-venue-hamburg` (racecourse grandstand, show court, low north-European sun, cool grade) as the full-bleed atmospheric hero with fog dissolve. The **official artwork becomes a contained card** in the hero's lower-left: 24px radius, 1px white border, fixed 3:4 or 16:9 crop, caption `Official event artwork` in eyebrow spec. Brand owns the fill, Duna owns the frame. This gives FIVB a genuine, respectful placement while the page stays ours.
- **Hero content:** `LIVE` status pill + `Elite16` + `Men` chips → event name in serif → `Aug 5 – 9, 2026 · Hamburg-Horn racecourse · 16 teams` in Figtree 400 → two ghost CTAs (`Women's division`, `Official source`) → a glass strand along the fog line showing next matches with court and time.
- **Teams: one table, four filters.** Replace four stacked tables with a single table plus a segmented control — `Main draw (12) · Qualification (16) · Reserve (23) · Withdrawn (45)`. Default to Main draw, sticky header, seed in Archivo `wdth 72` at 55%, team name Figtree 500 with player links in 400, SVG flag chip, entry and technical points right-aligned tabular. Withdrawn rows: name struck through, row at 55% opacity, Class A cancelled pill.
- **Design the pre-event state as a first-class state, not an empty table.** Before any match completes, pool standings should not render as grids of zeros. Show each pool as a **card of three teams in seed order** with the label `Pool A · starts Aug 6, 11:00` and no W/L/Sets/Pts columns at all. The moment the first match finishes, the card transforms into the full standings table. Same for live standings.
- **Suppress medals until earned.** No 🥇🥈🥉 until at least one match in the event is final. Pre-event, show seed-order rank as Archivo `wdth 72`. Post-first-match, replace emoji with a small `--sand-500` filled rank badge for 1st, `--marine-400` for 2nd, `--sand-300` for 3rd. Consistent, on-palette, and it doesn't claim results that don't exist.
- **Flat-prior market:** collapse the twelve 8.3% rows into a single `Even field · 12 teams` state with the explanation and the `Sign in to predict` CTA. Render individual probabilities only once they diverge. Keep the credits disclaimer — it's clear and correctly cautious.
- **Merge the two standings tables.** One `Standings` section with a `By pool / Overall` toggle.
- **Broadcast section:** don't give "not announced" a full section. Collapse to a single glass strip under the hero: `Broadcast · not yet announced. Duna will show VBTV, YouTube, or TV coverage here when confirmed.` Promote it to a full module only when there's something to link.
- **Add a breadcrumb component.** `Pro tour → BPT Elite16 Hamburg` in Figtree 500 11px `.1em` uppercase, chevron in `--pending`. Needed on both event and match pages.

---

## 15. /events/[event]/match/[id] — audit

This is the most important performance surface in the product and currently the least designed.

**Problems:**

1. **It's a light page.** A live match view should be dark. Broadcast, phone-in-sun, bar TV, and the emotional register all argue for ink.
2. **The score is a dash.** `Momme Lorenz / Tilo Rietschel — *:* — Mart Tiisaar / Dimitriy Korotkov` is the page's reason to exist rendered as punctuation.
3. **`SandRating pending` appears four times** in a small area, plus `Profile mapping pending` twice. Six "we don't know" strings stacked.
4. **The h1 is 66 characters of player names.** It doesn't fit any reasonable display size and repeats immediately below.
5. **Three empty modules in a row** — head-to-head, broadcast, prediction — each with a full section header.
6. **`CC` is unexplained.** Center Court is a great detail and it's rendered as two letters with no context.

**Recommendations:**

- **Full dark takeover.** `--ink` ground, `match-court-cc` plate at 12% opacity behind the scoreboard, heavy fog-to-ink dissolve. This is the one page in Duna that is unambiguously a performance zone.
- **Scoreboard as hero.** Anatomy:
  ```
  [SCHEDULED]  Round 1  ·  Center Court  ·  13:30 CEST
  ─────────────────────────────────────────────────────
  ●  Lorenz / Rietschel        GER        —    —    —
     Tiisaar / Korotkov        EST        —    —    —
  ─────────────────────────────────────────────────────
  Starts in 2h 14m                    Team rating 3.01
  ```
  Names Figtree 500 20px. Set columns Archivo `wdth 68/800`, 34px for the current set, 19px at 42% opacity for completed sets. Serving indicator `--signal` dot. Pre-match, the dashes become an Archivo em-dash at 30% opacity — deliberate, not accidental.
- **Fix the h1.** Page title becomes the matchup in serif at a size that fits: `Lorenz / Rietschel` **vs** `Tiisaar / Korotkov` on two lines with a small ink `vs` between, surnames only. Full names live in the team cards below. Keep the long form in `<title>` and og tags for SEO — that's where it belongs.
- **Design the pending state once, use it everywhere.** A `--pending` chip reading `Rating pending` with a tooltip: `This player's tour profile isn't mapped to a Duna profile yet.` Show it **once per team**, not once per player, when both are pending. Six strings become two.
- **Team cards:** side by side, each with the two players, avatar initials on a sand→marine gradient, Sand Rating in Archivo `wdth 110/800` when known, the pending chip when not, and the aggregate `Team rating 3.01` in a sand-500 chip. Countries as SVG flag chips.
- **Collapse the three empty modules into one honest block** titled `Not yet available`, containing three one-line rows: `Head-to-head — no prior verified meetings.` `Broadcast — not yet announced.` `Prediction — even prior; rating data incomplete.` Each expands into a full module the moment it has content. Three dead sections become one truthful one.
- **Explain the court.** `CC` renders as `Center Court` with `CC` as a small monospaced-feel Archivo chip beside it. On event pages, court `2` renders as `Court 2`.
- **Keep the model note verbatim.** *"Both teams currently have an even prior because mapped rating data is incomplete."* Set it in Figtree 400 13px `--pending`, italic, under the prediction. It's the most trustworthy sentence on the site.
- **Add live-state choreography** for when the match starts: status pill flips scheduled → live with a pulsing flare dot, score numerals slide-flip on change (200ms), a thin flare progress line tracks toward 21, and `Match point` appears as a flare chip at 20. This is the payoff for all the restraint everywhere else.

---

## 16. Mobile app

- **Temperature rule:** dusk-pink wash (`#FBF3F4 → #FFFFFF`) on planning surfaces — home, schedule, discover, profile. Full `--ink` on competition surfaces — live match, scoring, results. The screen's temperature tells you what mode you're in before you read a word.
- Components on the pink wash stay **white, ink, and gray**. Pink is atmosphere, never a component fill.
- Date pills: active state `--dusk-deep`. Session cards: white, 18px radius, avatar, Figtree 600 title, 400 sub, `--signal` dot for confirmed.
- Sand Rating on the profile screen: Archivo `wdth 112/800` at 38–48px with a `--gain` delta.
- Live match screen: full dark, Archivo `wdth 66/800` at 60px+, flare accents, set strip beneath.
- Radii 24 / 16 / full-pill. Shadows near zero.

---

# PART IV — GOVERNANCE

## 17. Co-branding — three tiers

1. **At rest (editorial):** monochrome `--ink-soft` at 50–60%, uniform sizing grid, color and 2px lift on hover only.
2. **Presented-by (performance):** full color inside a defined glass or dark container with a fixed corner position and an eyebrow-spec `PRESENTED BY` caption. Brand color never leaks outside the container.
3. **Partner spotlight (dedicated modules, event artwork):** full brand expression inside a Duna-framed canvas. Their imagery, their color as the module's background wash; our typography, radii, spacing, and fog dissolve as the frame.

**Hard rules:** no partner color in any Duna UI control — buttons, links, focus rings, states. `--flare` is the only warm-hot color in the system, which is precisely what makes sponsor reds and oranges read as *theirs*. Never re-color a partner mark to match our palette except in the monochrome at-rest state, and confirm that treatment is permitted in the agreement.

## 18. Master do / avoid

**Do**
- Fog-dissolve every image into the page.
- Build heroes in separate parallax plates.
- Put a serif headline directly above a condensed tabular number at least once per page.
- Use Archivo for every number that means something, with `tnum` on.
- Give every empty state a designed treatment and an honest sentence.
- Keep one Class A status pill per card, leftmost.
- Let dark ground signal "live" and light ground signal "read."
- Respect `prefers-reduced-motion` and ship visible keyboard focus.

**Avoid**
- A hard bottom edge on any photograph.
- Flare used as decoration, as a CTA, or on anything that isn't live.
- Drop shadows as the primary depth cue.
- Serif below 20px, or in any table, button, or app UI.
- More than three chips on a card, or two Class A pills anywhere.
- Rendering `0/0`, `0–0`, `50% / 50%`, or a medal before a ball is served.
- Flag emoji.
- Numbered markers (`01/02/03`) on content that isn't a sequence.
- Poetic eyebrows.
- Exclamation marks, hype adjectives, and "SandRating."
- A second bold idea on the same screen as the live strand or a live scoreboard. Spend boldness once.

## 19. North-star brief — paste into any AI design or image tool

> Duna is a beach volleyball platform with a "golden hour performance" aesthetic: the calm, atmospheric, editorial language of luxury wellness applied to elite sport. Fog-white and shell neutrals, marine haze blue, dune gold sand tones, court ink black; one hot accent, sun-flare coral `#E8683A`, reserved exclusively for live states; a dusk-pink wash used only as mobile planning atmosphere. Type is three roles: Instrument Serif (or Awesome Serif Light) for editorial display, Figtree (or Fellix) 400–600 for all UI and body, and Archivo with tabular numerals for every meaningful number — condensed for scores and tables, expanded for hero stats and ratings. Imagery is ultra-high-resolution golden-hour photography with a muted filmic grade, generated via Higgsfield MCP from real, licensed beach volleyball seed images, always built in separate depth plates — blurred dune-grass foreground, sharp subject, haze, graded sky — and always dissolved into the page with a tall fog gradient. Surfaces are glassmorphic pills and 24px cards; depth comes from translucency and layering, never drop shadows. Editorial zones are light and still; performance zones — live matches, results, brackets, the operator console — are dark and kinetic. Partner brands appear monochrome at rest and full-color only inside contained frames: brand owns the fill, Duna owns the frame.
