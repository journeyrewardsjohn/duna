# Wallet and membership card (WALLET-0)

Design specification for the Duna wallet: the membership card a club sells, the
wallet that holds it on iPhone, iPhone Duo, iPad and the web, the pass on its
back, the card designer in HQ and the moment a purchase lands. Status:
**WALLET-1 built** (web components, gallery, Player web `/app/wallet`; see
"Built in WALLET-1" below). WALLET-2 to WALLET-7 are not built yet.

- Prototype (private artifact, "Duna Wallet"):
  https://claude.ai/artifact/NnrLyBNsDz6Vys6J7E5XF2
- Owner's ask, 28 November 2026: a far prettier wallet of cards, swipeable,
  more native, also on the web; clubs want to sell memberships and the card
  means a lot; moving (video) backgrounds.
- Contract this extends: [`tideline-4.1.1/README.md`](tideline-4.1.1/README.md)
  (R10 motion, R13 club identity), [`brand-book.md`](tideline-4.1.1/brand-book.md),
  [`components.md`](tideline-4.1.1/components.md) (`ClubMark`,
  `MembershipCard`, `Wallet`), [`adaptive.md`](tideline-4.1.1/adaptive.md).

## What exists today (read before building)

| Piece                      | Where                                                                                      | What it does                                                                                                                                                                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Club memberships           | `packages/db/src/schema.ts` `memberships`, `membershipTiers`                               | A person's membership in a tier; the tier belongs to an organisation (null = Duna Plus). Status, current period end, `pausedUntil`, trial, `cancelAtPeriodEnd`, cancellation dates, policy snapshot. Tier: name, price, interval (`month`/`year`), `benefits` (string list). |
| Club credits               | `organizationWallets`, `organizationCreditGrants`, `creditLedger`, `familyCreditTransfers` | One credit wallet per person per club (`unit`, cached balance, status `active`/`frozen`/`closed`), grants with remaining credits and expiry, guardian-to-dependent transfers.                                                                                                |
| Per-club summary           | `player.organizationWallets` → `organizationWalletSummarySchema` (`packages/api`)          | Per club: name, slug, credits, next expiry, membership name / status / interval / price / period end / cancel / trial / policy / manageable. **This is the card list's source.**                                                                                             |
| Club brand                 | `organizationThemes`                                                                       | Display name, `membershipProgramName`, logo / mark / light / dark logos, `heroMediaType` + `heroMediaUrl` + `heroPosterUrl`, palette (primary, accent, sand, ink…), `cardStyle`.                                                                                             |
| Member credential          | `player.memberCard` → `loadPlayerMemberCard` (`member-card-service.ts`)                    | One Duna-wide credential per person: `memberId`, holder name, `credentialPayload` (encodes the static `people.membershipQrToken`), Apple Wallet status and download path, upcoming activities.                                                                               |
| Check-in scan              | `attendance-service.ts` (member scan)                                                      | Staff scan the credential; it resolves the person and accepts only if they are registered for an activity at that organisation today. Membership alone does not admit.                                                                                                       |
| Apple Wallet               | `apps/web/app/api/wallet/members/[token]` and `/passes/[token]` (`passkit-generator`)      | Signed `.pkpass` for the Duna member credential and for tournament admission passes. Not configured shows an honest 503. Env: `APPLE_WALLET_*`, `DUNA_WALLET_DOWNLOAD_SECRET`.                                                                                               |
| Components                 | `packages/ui/src/tideline/identity/` `ClubMark`, `MembershipCard`, `WalletStack`           | Card = club colour band + white face + code area; wallet = open card plus 64 px strips. No tilt, no shine, status as a chip (R13).                                                                                                                                           |
| Screens                    | `apps/web/app/app/wallet/page.tsx`, `apps/player/src/features/wallet/WalletScreen.tsx`     | Money-first ledger pages; the Player screen shows one Duna member card with a QR and an Apple Wallet button.                                                                                                                                                                 |
| Native libraries in Player | `apps/player/package.json`                                                                 | `expo-haptics`, `expo-video`, `react-native-svg` (via `react-native-qrcode-svg`). No Reanimated, no gesture-handler, no brightness, no sensors, no linear-gradient.                                                                                                          |

## Built in WALLET-1 (28 November 2026)

What exists on `main` after WALLET-1, and where it differs from this spec.

### Public API (`@duna/ui/tideline`, family `identity/`)

| Export                                          | What it is                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MembershipCard`                                | The face (mark + name, one chip, member, one live fact), art layer, measured scrim, keyline, glass edge, pointer sheen, Salt state chip, kinds `member` / `junior` (`heldBy`) / `family` / `staff` / `day` / `pack`, sizes `card` / `hero` / `strip`, `flipped` to the pass, `onFlip` makes the card itself a toggle. Props as in "Component API changes" plus `until` (formatted pause end or end date) and `label`. |
| `MembershipPass`, `QrCode`                      | The back: club band, member, status in words with an icon, plan, number or reference, valid-to, guardian, and the code drawn from the exact server payload (`encodeQr` in `@duna/tideline-core`, no dependency).                                                                                                                                                                                                      |
| `CardFlip`                                      | 620 ms Rise-curve turn with perspective; 200 ms cross-fade under reduced motion; the hidden face is `inert`.                                                                                                                                                                                                                                                                                                          |
| `CardArt`, `CardArtProvider`, `CARD_ART_ASSETS` | The art registry and renderer (below).                                                                                                                                                                                                                                                                                                                                                                                |
| `Wallet`                                        | Band + carousel or stack + caption + actions + sheet (split from 860 px of its own width, sticky band). `value` / `onChange`, `flipped` / `onFlip`, `presentation` (`auto` remembers the person's switch in `localStorage`), `title`, `toolbar`, `notice`, `actions`, `empty`, `layout`. Announces the flip in a polite live region.                                                                                  |
| `WalletCarousel`                                | `tablist`: scroll-snap, neighbours at 94 % from the inner edge, dots, arrows / Home / End, Enter or Space flips, mouse drag, touch and trackpad swipe.                                                                                                                                                                                                                                                                |
| `WalletStack`                                   | `listbox` with `aria-activedescendant`: 36 % strips, tap or drag up 30 px to draw, drag down 60 px / tap the pile / "Back to stack" / Escape to return. Replaces the old 64 px strip list (same name, same `cards` / `value` / `onChange` / `empty` props).                                                                                                                                                           |
| `WalletActions`                                 | The four 48 px actions; links stay links; a disabled action keeps its place and says why.                                                                                                                                                                                                                                                                                                                             |
| `CardArrival`                                   | The purchase moment (line 450 ms, card rises 700 ms, text Rallies); `playKey` replays it. CSS transitions, no keyframes; reduced motion is the last frame faded in.                                                                                                                                                                                                                                                   |
| `CardArtPicker`                                 | The designer's art tab as a `radiogroup` (club colour + the set).                                                                                                                                                                                                                                                                                                                                                     |
| Re-exported model                               | `assignWalletArt`, `clubSummaryCard`, `orderWalletCards`, `cardPassBack`, `formatCardDate`, `DUNA_ART_SET` and types, so apps need no second import path.                                                                                                                                                                                                                                                             |

Pure logic in `@duna/tideline-core` (`wallet.ts`, `qr.ts`, tested) for native
reuse in WALLET-3: art set data, `derivedArtPalette`, `tintPalette`,
`defaultCardArt`, `assignWalletArt`, `measureCardContrast` /
`estimateCardContrast` / `strongestContrast`, `cardStateChip`,
`cardMetaLine`, `cardAccessibleName`, `cardPassBack`, `walletPresentation`,
`orderWalletCards`, `walletKeyStep`, `carouselScale`, `stackLayout`,
`clubSummaryCard`, `encodeQr` / `qrPath` (byte mode, versions 1–40, checked
module for module against the `qrcode` package).

### Changes from this spec

- **Art set: eight pieces ship, not ten.** Noon Net and Ember Net (drawn grid
  lines) were dropped as computer-looking; Under Lights lost its floating
  light circles (now floodlight cones through drifting mist) and Marram Gold
  lost its bokeh (grass, haze and a soft light field). Shipped: Golden Dune,
  Coral Dusk, Under Lights, Ocean Teal, Sea Glass, Storm Swell, First Light,
  Marram Gold, plus Club colour (derived). `RETIRED_CARD_ART` records the
  dropped ones.
- **Derived palette hue shifts are 18° and 29°** (the approved prototype's
  0.05 / 0.08 of a turn); the "5° / 8°" above was a unit slip.
- **No text under 12 px** (the library floor): chips, the mono member line
  and the fact are 12 px, not 10.5–11.
- **Paused cards keep their code** on the back (§4) even though the older
  `membershipPassModel` says otherwise; that helper is unchanged for its
  existing callers.
- **Pending and ended cards show no live fact**; the state chip carries it.
- **Brightness**: the web never claims "Brightness up"; the caption says "Tap
  again for the card".
- **Show pass on a pending or ended card** stays pressable and turns the card
  to its honest back ("No pass yet", "This membership ended …"), which is the
  explanation the spec asks for.
- **Default art today**: no card design exists (Needs API), so a club with a
  colour gets derived art and every other club a stable set piece by its id;
  `assignWalletArt` keeps neighbours different.

### Art registry: adding painted stills and loops

Each Duna piece is a shader recipe (`packages/ui/src/tideline/identity/card-art.tsx`,
one fragment shader, about 5 KB, one shared WebGL context, 30 fps for the one
selected and most visible card, posters for the rest, a canvas-2D gradient
without WebGL, and a CSS gradient as the server-rendered poster). To swap a
piece for generated painterly art, add files and one line; nothing else
changes and the shader stays the fallback:

1. Poster: JPEG 1116 × 704 (≤ 140 KB) and the same as AVIF, named
   `<key>.jpg` / `<key>.avif`. Loop (optional): 3–6 s, seamless (first frame
   = last frame), muted, H.264 `.mp4` 1116 × 704 ≤ 900 KB as `<key>.mp4`,
   optionally AV1 as `<key>-av1.mp4`. Keys are the `DUNA_ART_SET` keys
   (`golden-dune`, …).
2. Put them in `apps/web/public/media/wallet/art/` (and
   `apps/hq/public/media/wallet/art/` for the gallery and the designer), and
   log each in `apps/web/public/media/brand/imagery-log.json` (model, prompt,
   provenance) per `AGENTS.md`.
3. Add a line to `CARD_ART_ASSETS` in `card-art.tsx`:
   `"golden-dune": { poster: "/media/wallet/art/golden-dune.jpg", posterAvif: "/media/wallet/art/golden-dune.avif", loop: { mp4: "/media/wallet/art/golden-dune.mp4", av1: "/media/wallet/art/golden-dune-av1.mp4" } },`
   (or wrap a tree in `CardArtProvider assets={…}` to try them first).
4. The card measures the scrim on the poster when it loads (same origin), so
   the type stays at 5:1; the gallery's art-set check proves it in CI.

Club uploads use `art={{ source: "upload", poster, loop }}` the same way.
The loop plays only on the selected card, after it can play through, never
under reduced motion, data saver, `prefers-reduced-data` or a battery under
20 % that is not charging, and pauses off screen.

### The web wallet page (`/app/wallet`)

Moved from `(legacy)` to `apps/web/app/(next)/(app)/app/wallet/` (route table
`rebuilt: true`). Band with the Jost title, the "find a club" button, a notice
(pass not loaded with its reference, demo mode, or acting for a junior), the
wallet and the four actions; the selected club's sheet (plan · price ·
renews/ends, state banner, credits with expiry, up next here, member benefits,
activity, End / Resume membership with a tier 1 confirmation, or tier 2 when
an immediate cancel refunds money, and Club page); then "Your Duna balance"
(available, pending and recent money; prediction credits linking to
`/app/wallet/predictions`, adults only). `?card=<club id>` opens on that card
(Home's club strips link there). Empty: an example card with the person's
name, "Your club cards live here" and Find a club. Acting for a junior: the
junior's club credits as junior cards held by the guardian.

Data, all existing: `player.organizationWallets`, `player.memberCard` (the
static Duna-wide credential, shown on every card's back as "Duna member
credential · Duna ID …"), `player.catalogSessionBookings` (upcoming and past,
filtered to the club and the person), `player.wallet`, `player.predictionWallet`,
`player.familyWallets` (acting for a junior). Test-only:
`duna-demo-wallet=0|1|5|12` in demo mode.

**Needs API** (unchanged from the table below, plus): tier benefits in the
wallet summary (the sheet links to the club page), member number and "since"
per club, the club's theme colour and card design in the summary, a junior's
memberships and pass readable by the guardian, total credits granted (for the
meter), per-club activity (check-ins, credit ledger, renewals), pins and order,
family seats, and the per-club rotating pass. Add to Apple / Google Wallet is a
component that renders nothing (`AddToPhoneWallet` in `wallet-view.tsx`) until
a per-club pass endpoint exists.

### Budget

Wallet-specific client code (core wallet model, QR, art renderer and shader,
card, pass, flip, carousel, stack, wallet, arrival, page view): about 17 KB
gzipped (esbuild estimate; the whole tree including shared shell parts is
35 KB). Art downloads today: 0 KB (shader-painted). Stylesheet: 5.5 KB gzipped
for the identity family.

### Native plan

WALLET-3 builds the native wallet on the same `@duna/tideline-core` model
(`stackLayout`, `carouselScale`, `cardPassBack`, `measureCardContrast` for
uploads, `encodeQr`), playing posters and loops from the asset pipeline
(native does not run the shader), per §5.

## The ten decisions

1. **One card per club relationship, never per product.** A membership, a
   credit pack, a junior squad, a staff role or a day pass at the same club is
   one card; the plan and its live fact change, not the number of cards.
2. **The card is an ID-1 object (85.6 × 54 mm, ratio 1.586) with full-bleed
   club art**, a 1 px inset keyline, the club mark and name top left, one chip
   top right, the member bottom left and one live fact bottom right. Nothing
   else.
3. **The art is the club's content and stays full colour.** Legibility comes
   from a measured scrim made from the art's own darkest (or lightest) tone,
   strong only where the text sits, sized to reach 5:1. The art is never dimmed
   as a whole, never desaturated, and state never fades it (R13).
4. **State is a solid Salt chip in the top-right slot** (paused, pending,
   ended), so state shows even on a stacked strip. Active cards show the plan
   chip there instead.
5. **Three art sources, so no card is ever plain:** the club uploads a still or
   a 3–6 s loop; the club picks from the Duna art set; or Duna derives art from
   the club colour. Default for a new club: derived.
6. **The Duna art set is ten lush, luminous pieces spread across the colour
   wheel** (Golden Dune, Coral Dusk, Under Lights, Ocean Teal, Sea Glass, Noon
   Net, Storm Swell, Ember Net, First Light, Marram Gold) plus Club Colour, so
   a wallet of five reads as five different clubs. Our subjects (sand, water,
   light, net, sky, night under lights) rendered with depth and light; no
   people, no balls, no logos, no text.
7. **Two presentations of the same wallet.** Carousel (neighbours peeking,
   snap, dots) up to six cards; vertical stack (strips you draw a card out of)
   at seven or more. The person can switch either way; the choice is remembered
   per device.
8. **Tap the card to turn it over; the back is the check-in pass**: a code that
   changes every 30 seconds, the member, the status in words, valid-through and
   what the front desk needs. Brightness rises while it shows. Pending and
   ended cards have an honest back with no code.
9. **The selected card drives everything beneath it**: four actions (Show pass,
   Book, Benefits, Activity), then that club's plan, credits, next bookings,
   benefits and activity.
10. **The card a person buys is the card they see.** The club page and checkout
    show the real card face with the person's name; purchase ends with the card
    rising out of the Dune line and landing in the wallet.

## 1. The card object

### Proportions and geometry

| Property   | Value                                                                                                                                                                                                     |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ratio      | 1.586 (ISO/IEC 7810 ID-1), height = width ÷ 1.586                                                                                                                                                         |
| Width      | Phone up to 372 pt (pane width − 52: the card nearly fills the width, neighbours peek about 14 pt); regular panes 396 pt; Duo half-open top pane and checkout 420 pt                                      |
| Radius     | 5.2 % of width (about 19 pt at 372)                                                                                                                                                                       |
| Keyline    | 1 px, inset 7 pt, white at 30 % in screen blend (a translucent light tone on any art)                                                                                                                     |
| Glass edge | Inner top highlight (white 42 %), 1 px inner rim (white 12 %), inner bottom shade (black 22 %)                                                                                                            |
| Safe area  | 5 % of width left/right, 8.5 % of height top/bottom                                                                                                                                                       |
| Shadow     | Three layers: contact `0 1 2 / 35 %`, lift `0 10 22 −6 / 50 %` (Night Court near-black), and a coloured glow `0 30 60 −20` in the art's own average tone at 85 %, so each card lights the ground under it |
| Sheen      | Soft-light radial highlight plus a faint diagonal band that follow the pointer (iPad, web) or device tilt (iOS, opt-in). It moves only when the person moves; it never loops                              |

### What is on the face

| Slot         | Content                                                                                        | Type                                                         |
| ------------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Top left     | `ClubMark` 30 pt (logo on its colour, uploaded tile, or Jost monogram) + club display name     | Geist 600 13.5                                               |
| Top right    | Plan chip (glass, e.g. "Annual", "Junior", "Family", "Staff", "Day", "Pack") **or** state chip | Geist 500 10.5; state chip Geist 600 11                      |
| Bottom left  | Member name; for a junior "Held by {guardian}, guardian"; then `No. 0412 · Since Mar 2024`     | Geist 600 20 (confident); Geist Mono 10.5                    |
| Bottom right | One live fact: credits left, valid-through, next booking, "Today", "Staff", or nothing         | Geist Mono 11, tabular, glass chip on the scrim tone at 50 % |

**Deliberately not on the face:** price, the code (it is on the back), the
Duna logo (the club owns the face; Duna signs the back), more than one number,
benefits, tier progress bars, a photo of the member, Solar (nothing on a card is
live).

### Legibility over any art (automatic contrast)

Measured once per art and colour (on the poster frame), stored with the card
design, recomputed in HQ when the club changes anything:

1. Sample the two text footprints only: top left (0–68 % wide, 4–24 % high:
   mark and club name) and bottom left (0–64 % wide, 66–95 % high: member and
   number). The chips carry their own glass backgrounds.
2. Take the 90th percentile luminance (for Salt text) and the 10th percentile
   (for Night Court text) of each footprint, not the average, so a bright
   streak under a letter counts.
3. Text is **Salt by default**. Night Court is chosen only on genuinely light
   art (average luminance above 0.38 and Night Court needs at least 20 points
   less scrim).
4. The scrim is local: a radial field anchored at the top-left and bottom-left
   corners, coloured from the art's own average mixed 80 % toward Night Court
   (or toward Salt for dark text), alpha = the smallest value that brings the
   90th-percentile pixel to 5:1, capped at 93 % at the corner and falling to
   zero by 62–66 % of the card. The rest of the art keeps full colour.
5. Minimum scrim 12 % top, 18 % bottom, so loops that brighten later still read.
6. HQ shows the result ("Salt on the art · 5.0:1 · scrim top 76 %"). If the cap
   cannot reach 5:1, HQ blocks the design and says why.

Every piece of the art set and the derived art passes 5:1 in the prototype
(checked on all twelve demo cards).

Text also carries a soft text-shadow in the scrim colour (25–30 %), never a
hard outline.

### States (R13: the brand is never faded)

| State   | Face                                                                                  | Back                                                                         | Sheet                                       |
| ------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------- |
| Active  | Plan chip; live fact                                                                  | Code, "Active member" with check icon                                        | Plan, credits, next, benefits, activity     |
| Paused  | Salt chip, pause icon, "Paused to 4 Jan"; live fact stays                             | Code still shown, "Paused until 4 Jan 2027" (booked sessions still check in) | Banner with "Resume now"                    |
| Pending | Salt chip, clock icon, "Pending approval"; no live fact; number "—"                   | "No pass yet" and what happens next, no code                                 | Banner: the club is reviewing, typical wait |
| Ended   | Salt chip, alert icon, "Ended 31 Oct"                                                 | "This membership ended 31 Oct 2026", no code                                 | Banner with "Renew membership"              |
| Loading | The same card shape with the Sand shimmer skeleton; the art poster fades in at 200 ms | —                                                                            | Skeleton rows                               |
| Offline | Unchanged                                                                             | Code still works from the cached seed; "Works offline · synced 2 min ago"    | A one-line offline notice                   |

### Card kinds

| Kind          | Face difference                                                                                                                                                       | Data today                                                 |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Member        | Plan chip from the tier name                                                                                                                                          | `memberships` + `membershipTiers`                          |
| Junior        | The junior's name; "Held by {guardian}, guardian"; chip "Junior". It lives in the guardian's wallet and moves to the junior's own app when they get one               | `walletAccounts.custodialGuardianPersonId`, family records |
| Family plan   | Chip "Family"; the holder's name; the sheet lists who is covered. Each covered person gets their own card in their own wallet                                         | **Needs API**: membership seats                            |
| Coach / staff | Chip "Staff"; live fact "Staff"; issued by the club, not bought                                                                                                       | `organizationMemberships` role                             |
| Guest / day   | Chip "Day"; live fact "Today"; back says valid until closing; card leaves the wallet the next day (kept in Activity)                                                  | **Needs API**: day pass as an entitlement                  |
| Credit pack   | If the person has a membership at that club, the pack is the card's live fact ("8 credits"). With no membership the pack is the card (chip "Pack", fact "3 sessions") | `organizationCreditGrants`                                 |

## 2. Card art

### Sources

1. **Club upload**: a still (JPEG/PNG, at least 1012 × 638, any larger ratio is
   cropped to 1.586 with a focal point) or a loop (3–6 s, seamless, no sound,
   ≤ 2.5 MB source). Duna transcodes and makes the poster.
2. **Duna art set**: the club picks one of ten pieces and optionally tints
   it toward its colour (hue shift only, never desaturation).
3. **Derived from club colour** (the default until the club chooses): a
   domain-warped light field in the club's hue family, four tones from the
   club colour (deep shadow at 10 % lightness, body at 30 %, a lit tone shifted
   5° warmer at 42 %, a highlight shifted 8° at 70 %), with an inner glow,
   a light source upper right and film grain. It reads as a painted field in
   that colour, never a flat tint.

### The Duna art set

Our world (sand, water, light, net, sky, night under lights) rendered lush:
macro and aerial abstractions with depth, volumetric light, saturated natural
colour and painterly softness. The set spans the colour wheel so neighbouring
cards never look alike. Each piece is composed with calmer tone at top left and
along the bottom (where type sits) and its light upper right.

| Piece        | Subject and light                                                        | What moves (one seamless loop)       | Period | Palette (shadow → highlight)      |
| ------------ | ------------------------------------------------------------------------ | ------------------------------------ | ------ | --------------------------------- |
| Golden Dune  | A dune ridge at golden hour, lit face and slip-face shadow, wind ripples | The light crosses the ridge and back | 6 s    | `#2A1006 #7E3A10 #E0892E #FFD98C` |
| Coral Dusk   | Dusk sky reflected in wet sand, clouds lit from within                   | Cloud drifts and folds               | 6 s    | `#2B0F2E #9C2F5E #F2735A #FFD6B8` |
| Under Lights | Night court: floodlight bloom through sea haze, bokeh                    | Haze breathes, bokeh drifts          | 6 s    | `#050A22 #1B2470 #5565E0 #FFE9C2` |
| Ocean Teal   | Deep teal shallows from above, sunlit caustic net                        | Caustics drift                       | 5 s    | `#03222B #0B5563 #1FA3A6 #C8FFF2` |
| Sea Glass    | Pale sea-glass shallows over white sand                                  | Caustics drift                       | 5 s    | `#14544F #3E9C8A #9FDCC8 #EFFFF8` |
| Noon Net     | White-hot noon sand with the long shadow of the net mesh                 | The net shadow sways                 | 6 s    | `#8C6A3C #CFAF78 #F0DDB6 #FFFBF0` |
| Storm Swell  | Storm-blue swell, silver light on the faces                              | The swell rolls                      | 5 s    | `#040B14 #132C46 #365E82 #A9C2D6` |
| Ember Net    | Ember sunset glowing through an out-of-focus net                         | Bokeh drifts behind the mesh         | 6 s    | `#180403 #7A1408 #EA5A1C #FFC86E` |
| First Light  | A cloudscape at first light, lit from within                             | Cloud drifts                         | 6 s    | `#2E2C5C #8C5C94 #E98F79 #FFDCC0` |
| Marram Gold  | Dune grass backlit by low sun, gold haze, deep green                     | Grass sways, light motes drift       | 6 s    | `#0B1A0B #2E4A1C #C9992F #FFF1BA` |
| Club Colour  | Derived (above)                                                          | The light field folds                | 6 s    | From the club colour              |

**How the prototype renders them.** Every piece is a GPU-painted field (one
WebGL fragment shader with five recipes: warped light field, caustics, lit dune
ridges, night bokeh, backlit grass), seamless because time enters only as a
point moving round a circle. One shared renderer draws the selected card at
30 fps and paints a still poster for every other card. All motion in the
prototype is this real-time procedural motion; there is no video file in it.

**Generated art (Higgsfield).** The owner authorised generation. The prompts
below were prepared and priced (GPT Image 2.6, 3:2, high quality, 1k: 1.25
credits each; Seedance 2.5, 5 s, 480p, no audio, start frame = end frame for a
seamless loop: 15 credits each; balance 2,323 credits). The generation call was
**refused by this environment's permission check**, so nothing was generated and
**0 credits were spent**. When a person allows it, run these, pick by eye, and
replace the shader posters with the stills (keeping the shader for derived
art):

| #   | Piece        | Prompt (all end with: "painterly softness, real depth, volumetric light, saturated natural colour; calm tone top left and along the bottom; no people, no text, no letters, no logos") |
| --- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Ocean Teal   | Aerial macro looking straight down into deep ocean-teal shallow water, sunlit caustic light nets over rippled sand, turquoise highlights to deep teal shadow                           |
| 2   | Golden Dune  | Molten golden-hour dune ridges, low raking sun, glowing amber and honey crests, long umber shadows, fine wind ripples                                                                  |
| 3   | Coral Dusk   | Coral, magenta and violet dusk sky reflected on glassy wet sand at low tide, clouds lit from within                                                                                    |
| 4   | Under Lights | Deep indigo night, floodlight bloom through sea haze over a beach court, volumetric cones, heavy bokeh                                                                                 |
| 5   | Sea Glass    | Aerial pale sea-glass green shallows, translucent mint water over white sand, soft haze                                                                                                |
| 6   | Noon Net     | White-hot noon sand with the long crisp diagonal shadow of a volleyball net mesh, bleached warm light                                                                                  |
| 7   | Storm Swell  | Aerial storm-blue ocean swell, slate and steel blue, silver light on wave faces, white foam lace                                                                                       |
| 8   | Ember Net    | Out-of-focus ember-orange and deep red sunset glowing through the dark mesh of a beach volleyball net, molten bokeh                                                                    |
| 9   | First Light  | First light over a calm sea, cloudscape lit from within in peach, apricot, lilac and salt-white                                                                                        |
| 10  | Marram Gold  | Dune grass backlit by low sun, blades blurred into gold haze with deep green shadows, sparkling bokeh                                                                                  |
| L1  | Ocean Teal   | Loop from still 1: "caustic light drifts slowly over the sand, almost breathing, locked-off camera" (start and end frame = still)                                                      |
| L2  | Golden Dune  | Loop from still 2: "the low sun moves slowly across the ridges, shadows shift, locked-off camera"                                                                                      |
| L3  | Coral Dusk   | Loop from still 3: "clouds pass slowly, reflections shimmer, locked-off camera"                                                                                                        |

Estimated total: 10 × 1.25 + 3 × 15 = **57.5 credits**. Each generated asset
is logged in `apps/web/public/media/brand/imagery-log.json` (model, prompt,
provenance) per `AGENTS.md`.

### Motion rules for art

- Loops are 3–6 s, seamless (every moving term is periodic in the loop), slow
  and almost breathing (nothing crosses more than 4 % of the card per second),
  and never cut.
- Only the **selected** card moves. Neighbours, strips and lists show the
  poster. A card that leaves the screen pauses and returns to its poster.
- A still poster is always shown first; the loop fades in over 200 ms once
  it can play through.
- Reduce Motion, Low Power Mode, Low Data Mode, and "Card motion: still" in the
  person's settings show the poster only.
- On cellular, loops download only when the person has opened the wallet before
  on Wi-Fi (cached) or allows "Play card motion on cellular" (default off).
- The card back never moves.
- The sheen follows the pointer or tilt and never animates on its own. The
  card itself never tilts.

### Asset pipeline

1. **Source.** Art set: rendered from the shader recipes (or the generated
   stills and loops above) at 2024 × 1276. Club upload: still or loop, cropped
   to 1.586 with a focal point. Derived: rendered server-side from the club
   colour whenever it changes.
2. **Encode.** Poster, strip and Wallet strip images; loops in HEVC, AV1 and
   H.264 (table below). Loops are checked for a seamless seam (first and last
   frame difference below a threshold) and rejected otherwise.
3. **Measure.** The contrast pass above runs on the poster and on frames at
   25 %, 50 % and 75 % of the loop; the strongest scrim wins and is stored with
   the design.
4. **Deliver.** Duna Hosting, cached on device; posters ship with the wallet
   response, loops load only for the selected card.
5. **Web fallback.** Where a loop cannot load (data saver, slow link), the web
   component can run the same shader recipe live for art-set and derived cards
   (about 6 KB of shader, no file).

### Formats and sizes

| Asset                 | Native (iOS)                                                             | Web                                                   | Budget            |
| --------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------- | ----------------- |
| Poster                | HEIC 1116 × 704 (@3x for 372 pt) + JPEG fallback                         | AVIF + JPEG, 1116 and 744 widths, `srcset`            | ≤ 140 KB each     |
| Loop                  | HEVC (H.265) 1116 × 704, 30 fps, no audio, `.mp4`                        | AV1 `.mp4` and H.264 `.mp4`, 744 × 470 and 1116 × 704 | ≤ 900 KB per file |
| Stack strip / list    | Poster only, 372 × 234                                                   | Poster only                                           | ≤ 35 KB           |
| Apple / Google Wallet | `strip.png` 1125 × 432 (cropped from the poster), `logo.png`, `icon.png` | —                                                     | PassKit limits    |
| Art set masters       | 2024 × 1276 still, 6 s loop at 30 fps                                    | same                                                  | —                 |

Video is stored and delivered by Duna Hosting (the video provider already used
for recordings); the poster comes from the same pipeline.

## 3. The wallet

### Carousel (1–6 cards, and always on the Duo half-open top pane)

- Horizontal, one card centred, neighbours peek about 14 pt each side and are
  scaled to 94 % from their inner edge (they do not dim).
- Snaps per card; a selection haptic on each snap; page dots under it (the
  current dot is an 18 pt Dune pill).
- Caption under the dots in Geist Mono: "Tap the card to show your pass";
  while the pass shows, "Brightness up · tap again for the card".
- One card: no dots, no stack switch. Two cards: carousel only.
- Web: scroll-snap, mouse drag, arrow keys, trackpad swipe.

### Stack (7 or more, or by choice)

- Each card shows a strip 36 % of its height, tall enough that each card's art reads as its own colour (mark, name, plan or state chip).
  The last card shows in full.
- Tap a strip or drag it up 30 pt to **draw it out**: it Rises to the top
  (480 ms), the others collapse into a pile beneath it with their top edges
  showing 11 pt each (at most five edges).
- Tap the drawn card to turn it over; drag it down 60 pt, tap the pile, or
  "Back to stack" to return.
- A footer under the stack: "12 cards · draw one out" and, when drawn, "Back to
  stack".

### Ordering

Default "Pinned first": pinned cards (the person pins up to three), then the
nearest club (device location if granted, else the home club), then most used.
The order button in the app bar cycles Pinned first / Nearest / Most used.
Ended cards always sort last; pending cards after active ones. The newest card
is placed first for 7 days after it arrives.

### Beneath the selected card

Four actions, each 48 pt circles with a label, on the dark band:

| Action    | What it does                                               | Disabled when             |
| --------- | ---------------------------------------------------------- | ------------------------- |
| Show pass | Turns the card over (same as tapping it)                   | Pending, ended (explains) |
| Book      | Opens booking at that club with member prices applied      | Ended                     |
| Benefits  | Scrolls to the club's benefits (tier `benefits`)           | Never                     |
| Activity  | Scrolls to check-ins, credit use and renewals at that club | Never                     |

Then the sheet: club mark and name, plan · price · renewal line, state banner,
credits (big tabular number, unit, next expiry, a meter that Rises), up next
here, member benefits, activity, then "Manage membership" and "Club page".

### Layouts by device

| Device                         | Layout                                                                                                                                                                                        |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| iPhone, Duo closed (466 × 678) | Dark band (title, notice, wallet, actions) over the sheet, system tab bar                                                                                                                     |
| Duo open (951 × 669)           | Left pane = band (475 pt, the fold is the seam); right pane = sheet. Nothing straddles the fold                                                                                               |
| Duo half-open (669 × 951)      | Top region: the card at 400 pt (or the pass when shown), dots, caption. Bottom region: actions and sheet. Showing the pass keeps the pass on top, so the phone can be propped facing the desk |
| iPad (expanded)                | Sidebar (Wallet selected), band at 440 pt with the stack by default, sheet beside                                                                                                             |
| iPad narrow / slide-over       | As iPhone                                                                                                                                                                                     |
| Web ≥ 860 px                   | Side nav, sticky left band, sheet to the right                                                                                                                                                |
| Web < 860 px                   | As iPhone, no tab bar (the web header)                                                                                                                                                        |

## 4. The pass

- **Front desk sees**: club band (mark, name, "Check-in pass"), the code (QR,
  60 % of card height, white tile), member name, status in words with an icon,
  plan, member number, valid-through, guardian for a junior.
- **Changing code**: the payload is `pass id + time window`, signed, new every
  30 s, with "New code in 0:24" on the back. A screenshot stops working within
  a minute.
- **Offline**: the device holds a pass seed valid for 24 h and derives the code
  locally (TOTP-style); the scanner (Duna Pro or HQ front desk) verifies offline
  with the club's key and syncs later.
- **Brightness**: on iOS raise screen brightness to full while the back shows
  and restore on flip back or leaving; on web, a white back is the most we can
  do and the caption still says "Brightness up" only where we actually raised it
  (native).
- **Honest states**: pending = "No pass yet" with what happens next; ended =
  "This membership ended" with Renew; not configured (no pass keys for the
  environment) = "Passes are not set up for {club} yet" and no code.
- **Apple Wallet**: "Add to Apple Wallet" on the sheet while the pass shows and
  on the arrival screen. One Duna pass type (`pass.duna.member`) signed by Duna,
  so **a club sets up nothing**. The pass is a store card: strip image from the
  card poster, club logo, primary field member name, secondary plan and status,
  auxiliary valid-through and credits, back fields with the club's address and
  desk instructions. `locations` = the club's venues and `relevantDate` = the
  next booking, so it appears on the Lock Screen near the club. Updates (status,
  credits, art) push through the PassKit web service (`webServiceURL`,
  `authenticationToken`, APNs) when the membership changes.
- **Google Wallet**: "Add to Google Wallet" on web and Android, a Generic pass
  object with the same fields, updated through the Google Wallet API.
- **Web**: the same flip (CSS 3D), the same code; both wallet links shown where
  supported (Apple on iOS/macOS Safari, Google on Chrome/Android, both on
  desktop).

## 5. Native capabilities

| Capability                        | Decision                                                                                                                                                                                                                      |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Haptics (`expo-haptics`, present) | Selection on each snap; medium impact on flip and on draw; light on flip back and restack; success notification on arrival                                                                                                    |
| Shared element                    | A card anywhere in the app (club page, checkout, profile row) grows into its wallet slot: measure both frames, animate a snapshot with built-in `Animated` (transform + opacity, native driver), cross-fade 120 ms at the end |
| Lock Screen widget                | Yes, small: the pinned card's poster, club name, next booking. Tapping opens the pass. No code on the widget                                                                                                                  |
| Live Activity                     | Only for a booked session at the club: from 60 min before start until check-in, shows the pass shortcut and court. Ends on check-in. Not for the membership itself                                                            |
| App Intents / Shortcuts           | "Show my {club} pass" opens straight to the flipped card                                                                                                                                                                      |
| NFC                               | Not now. NFC check-in needs Apple's NFC pass entitlement and a reader at every desk; clubs scan with a phone today. Revisit when a club has readers                                                                           |
| Duo half-open                     | Card or pass on the top region, actions on the bottom; the hinge angle changes nothing in the layout                                                                                                                          |
| iPad and web pointer              | Hover sheen follows the pointer; the cursor is a hand on cards; drag to scroll the carousel                                                                                                                                   |
| Keyboard                          | Carousel is a `tablist` (arrows, Home, End move; Enter or Space turns over); stack is a `listbox` (arrows move, Enter draws or turns over, Escape steps back)                                                                 |
| Screen reader                     | Each card is named "{club}, {plan}, {state}, {live fact}. Card 2 of 5"; the flip announces "Showing {club} pass. {member}, {status}, number {no}"; the pass is text plus the code image named "Check-in code for {member}"    |
| Dynamic Type                      | The card face is fixed-size artwork; larger text sizes enlarge the sheet and the pass's text fields, never the face                                                                                                           |

### Gesture and animation approach (no new dependency)

React Native's built-in pieces are enough:

- **Carousel**: horizontal `ScrollView` (or `FlatList` when > 6) with
  `snapToInterval = cardWidth + gap`, `decelerationRate="fast"`,
  `contentInset` for the peek; neighbour scale via
  `Animated.event(onScroll, { useNativeDriver: true })` and `interpolate`.
  Selection on `onMomentumScrollEnd`.
- **Flip**: `Animated.timing` on a 0→1 value with the native driver, mapped to
  `rotateY` 0→180° with `perspective: 1400` and `backfaceVisibility: "hidden"`
  on both faces. Reduced motion: cross-fade 200 ms.
- **Stack**: `PanResponder` for the drag (JS thread is fine: one view moves),
  `Animated.spring` is not used (nothing bounces): release animations are
  `Animated.timing` 480 ms with the Rise curve `Easing.bezier(.2,.8,.2,1)`.
- **Art**: `expo-video` `VideoView` (present) with `nativeControls={false}`,
  `loop`, muted, paused when not selected; `Image` poster underneath.
- **Scrim and derived art**: `react-native-svg` (present) linear and radial
  gradients; derived art is rendered server-side to a poster and loop like the
  art set, so the device only ever plays files.
- **Brightness**: `expo-brightness` is the one new dependency (its own pull
  request, WALLET-3). Without it the pass works; only the brightness boost is
  missing.
- Reanimated is not needed: every moving value is a transform or opacity on the
  native driver, and the only gesture-driven view is one card at a time.

## 6. The club side in HQ: the card designer

Lives in HQ under the club's identity settings (`S-Club-Identity`, canvas C2)
and is reachable from every membership offering (`S-Offer-Membership`).

- **Art**: three tabs, Duna art set (8 swatches), From club colour (colour
  picker, uses the theme's primary by default), Upload (still or loop, with the
  rules above and a focal-point picker).
- **Motion**: Slow loop or Still.
- **Face**: plan chip on/off, member number on/off, member since on/off, live
  fact (credits left, valid-through, next booking, nothing). Chip labels come
  from the tier name and can be shortened per tier.
- **Preview**: on a phone frame, in the stack beside three other (sample)
  clubs' cards, in light and dark, front and back, in every state, and the
  contrast readout. Ask Duna can propose a design from the club's logo and
  photos.
- **Publish**: one confirmation ("Update the card for 214 members? Wallet
  passes update too."), then the design versions; members see it on next open
  and in Apple/Google Wallet through a push update.

### The purchase moment

The card a person is buying is shown on the club page and at checkout with
their name on it. When payment succeeds:

1. Night Court screen; a Dune line draws from the centre (450 ms).
2. The card Rises out of the line (clip from the line upward + 22 pt lift,
   700 ms), its loop already playing.
3. "Welcome to {club}" (the screen's one Jost title), "Your annual card is in
   your wallet. Your pass works from today.", then "Open my wallet" and "Add to
   Apple Wallet" (Rally, 120 ms apart). Success haptic.
4. "Open my wallet" Crosses the card into the first wallet slot (shared
   element) and selects it.
5. Pending approval: the same moment, the chip says "Pending approval" and the
   text says when the pass arrives. Reduced motion: the finished frame with a
   200 ms fade.

## 7. Selling

- **Club page (Player app, web, public club site)**: the membership block leads
  with the card (the club's art, "Your name" or the signed-in name), then plans
  as two or three radio cards, then three benefits, then one button "Join for
  $45 a month".
- **Checkout**: the card stays at the top through payment so the thing bought
  is always in view; the plan chip on the card follows the plan chosen.
- **Public site / share link**: an Open Graph image rendered from the card
  poster with the club name and plan (no member name).

## Component API changes

### `MembershipCard` (replaces today's band + face card)

```ts
export interface MembershipCardProps {
  id: string;
  club: MembershipCardClub; // unchanged (ClubMark props)
  member: string;
  heldBy?: string; // guardian name for a junior
  plan: string; // "Annual member"
  chip: string; // "Annual", "Junior", "Staff"…
  kind?: "member" | "junior" | "family" | "staff" | "day" | "pack";
  status: MembershipStatus; // unchanged: active | paused | pending | expired
  statusText?: string; // overrides the chip words
  number?: string | null; // member number; null hides it
  since?: string;
  validThrough?: string;
  fact?: {
    kind: "credits" | "valid" | "next" | "today" | "staff";
    text: string;
  } | null;
  art: CardArt;
  contrast?: CardContrast; // stored with the design; computed when absent
  face?: { chip?: boolean; number?: boolean; since?: boolean };
  pass?: MembershipPass | null; // the back; null = honest no-pass back
  flipped?: boolean; // controlled flip
  onFlip?: (flipped: boolean) => void;
  size?: "card" | "strip" | "hero"; // strip replaces `compact`
  motion?: "auto" | "still"; // auto = loop only when selected and allowed
  className?: string;
}
export type CardArt =
  | { source: "set"; key: DunaArtKey; tint?: string }
  | { source: "colour"; color: string }
  | { source: "upload"; poster: string; loop?: { mp4: string; av1?: string } };
export interface CardContrast {
  text: "salt" | "night";
  scrim: string;
  top: number;
  bottom: number;
  ratio: number;
}
export interface MembershipPass {
  code: string;
  refreshesAt: string;
  validThrough?: string;
  offline?: boolean;
}
```

Removed: `image` (now `art`), `line` (now `fact`), `compact` (now
`size="strip"`), `rise` (entrance belongs to the wallet), `qr` node (the card
draws the code from `pass.code`). The "no tilt, no shine" comment changes to
"no tilt; pointer sheen only".

### `Wallet` (replaces `WalletStack`)

```ts
export interface WalletProps {
  cards: ReadonlyArray<MembershipCardProps>;
  value?: string;
  defaultValue?: string;
  onChange?: (id: string) => void;
  presentation?: "auto" | "carousel" | "stack"; // auto: carousel ≤ 6
  order?: "pinned" | "nearest" | "used";
  onOrderChange?: (o: string) => void;
  flipped?: boolean;
  onFlip?: (flipped: boolean) => void;
  actions?: ReactNode; // the four actions slot
  children?: ReactNode; // the sheet for the selected card
  notice?: ReactNode;
  empty?: ReactNode; // title, one line, one action ("Find a club")
  layout?: "compact" | "split" | "half"; // from the width class
}
```

`WalletStack` stays as a deprecated alias for one release.

### Motion tokens (added to `motion/verbs`)

| Token                 | Value                                             |
| --------------------- | ------------------------------------------------- |
| `wallet.flip`         | 620 ms, `cubic-bezier(.2,.8,.2,1)`, rotateY 180°  |
| `wallet.draw`         | 480 ms Rise curve, translateY                     |
| `wallet.snapScale`    | neighbours 0.94, origin = inner edge              |
| `wallet.arrival.line` | 450 ms Rise, scaleX from centre                   |
| `wallet.arrival.card` | 700 ms Rise, clip-path from the line + 22 pt lift |
| `wallet.reduced`      | 200 ms opacity                                    |
| `art.loop`            | 3–6 s seamless; poster first; fade-in 200 ms      |

## Needs API

| Need                            | Procedure / data                                                                                                                                                                                                                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One list of wallet cards        | `player.walletCards` → per club relationship: club identity (theme mark, colour, display name), card design, membership (tier, status, dates), credits summary, staff role, guardian context, pinned flag, last used, distance key. Built on `organizationWalletSummarySchema` and `organizationThemes` |
| Card design per club            | New `organization_card_designs` (organizationId, version, art source, set key, tint, colour, poster/loop asset ids, face toggles, chip overrides, measured contrast, publishedAt); `hq.cardDesign.get/save/publish`                                                                                     |
| Art pipeline                    | Upload → transcode (HEVC, AV1, H.264), poster, strip, crop to 1.586, size limits; render the Duna art set and derived art server-side                                                                                                                                                                   |
| Per-club rotating pass          | `player.cardPass({ organizationId })` → `{ code, refreshesAt, seed, seedExpiresAt }`; today's credential is one static Duna-wide token (`people.membershipQrToken`)                                                                                                                                     |
| Membership-based check-in       | The scan accepts only registered activities today; a membership card needs a "member entry" path at the club (with the club's rule: members may enter without a booking, or not)                                                                                                                        |
| Offline verification            | Club scanning key distribution to Pro/HQ, replay window, later sync                                                                                                                                                                                                                                     |
| Per-club Apple Wallet pass      | Extend the member pass route to a per-club store card; PassKit web service (register, unregister, list updated passes, latest pass) and APNs push on change                                                                                                                                             |
| Google Wallet                   | Issuer account, Generic class per club, object per member, update on change (not configured state until the owner sets it up)                                                                                                                                                                           |
| Pins and order                  | `player.walletPreferences` (pinned ids, presentation, order)                                                                                                                                                                                                                                            |
| Family seats                    | Who a family plan covers, a card per covered person                                                                                                                                                                                                                                                     |
| Day pass entitlement            | A dated entitlement that produces a card for one day                                                                                                                                                                                                                                                    |
| Club activity feed for one card | Check-ins, credit ledger, renewals filtered to one organisation                                                                                                                                                                                                                                         |
| Upcoming at this club           | `memberCard.upcoming` filtered by organisation                                                                                                                                                                                                                                                          |
| Purchase → card                 | Checkout success returns the new card id so the client can run the arrival moment and the shared-element landing                                                                                                                                                                                        |

## Accessibility

- 44 pt minimum targets (actions 48 pt, app bar 40 pt circles with 44 pt hit
  area, notice close 32 pt visual / 44 pt hit).
- Every text on the face meets 4.5:1 by the measured scrim; HQ blocks a design
  that cannot.
- The pass is text first; the code image has a name; the member number is
  selectable.
- State is a word plus an icon, never colour alone, never fading.
- Reduced motion: no flip rotation (cross-fade), no loops, no snap scaling, the
  arrival is its last frame.
- Focus is visible on cards (a 2 pt ring outside the radius on the band).

## Performance budgets

| Budget                                | Target                                                              |
| ------------------------------------- | ------------------------------------------------------------------- |
| Wallet first paint (12 cards, cached) | < 400 ms on iPhone 15; posters only                                 |
| Loop start after selection            | < 250 ms from cache; poster until then                              |
| Concurrent playing videos             | 1 (the selected card)                                               |
| Frame rate while swiping              | 60 fps (120 on ProMotion) with native-driver transforms             |
| Memory for art                        | ≤ 12 decoded posters at strip size + 1 full + 1 video               |
| Data for a first open on cellular     | Posters only, ≤ 400 KB for 12 cards                                 |
| Web JavaScript for the wallet route   | ≤ 35 KB gzipped beyond the shared bundle (no 3D or video libraries) |

## Build packages

Each is one pull request.

| Package  | Scope                                                                                                                                                                                                                                       | Depends on         |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| WALLET-1 | Web `MembershipCard` and `Wallet` in `@duna/ui/tideline` (art, scrim, flip, carousel, stack, keyboard, reduced motion), gallery section, art set posters and loops as static assets, Player web `/app/wallet` (next) screen on today's data | —                  |
| WALLET-2 | API: `player.walletCards`, `walletPreferences`, card design table and HQ procedures, activity and upcoming by organisation                                                                                                                  | —                  |
| WALLET-3 | Native Player wallet: carousel, stack, flip, haptics, video art, Duo and iPad layouts, shared-element landing; `expo-brightness` dependency                                                                                                 | WALLET-2           |
| WALLET-4 | Pass: per-club rotating code, offline seed, member-entry check-in, per-club Apple Wallet store card with PassKit web service, Google Wallet (not configured state)                                                                          | WALLET-2           |
| WALLET-5 | HQ card designer: art tabs, upload pipeline, face fields, previews, contrast readout, publish with confirmation                                                                                                                             | WALLET-1, WALLET-2 |
| WALLET-6 | Selling and the purchase moment: card on club page and checkout (web and native), arrival screen, Open Graph image                                                                                                                          | WALLET-1, WALLET-3 |
| WALLET-7 | Lock Screen widget and the booked-session Live Activity                                                                                                                                                                                     | WALLET-3, WALLET-4 |

## Open questions for the owner

- Does a membership by itself admit a member at the desk (no booking), per club?
  Today it does not.
- Should Duna Plus have its own card in the wallet, or only a mark on the
  member's profile?
- May the Duna art set be generated imagery as well as procedural (for richer
  texture), or stay procedural?
