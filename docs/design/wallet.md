# Wallet and membership card (WALLET-0)

Design specification for the Duna wallet: the membership card a club sells, the
wallet that holds it on iPhone, iPhone Duo, iPad and the web, the pass on its
back, the card designer in HQ and the moment a purchase lands. Status:
**proposed, waiting for the owner's approval.** Nothing here is built yet.

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
6. **The Duna art set is a family of seven light-on-sand-and-water pieces**
   (Sand Ripple, Shore Water, Net Shadow, Under Lights, Golden Hour, First
   Light, Tideline) plus Club Colour. Abstract and textural; no people, no
   balls, no logos.
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

| Property  | Value                                                                                                                    |
| --------- | ------------------------------------------------------------------------------------------------------------------------ |
| Ratio     | 1.586 (ISO/IEC 7810 ID-1), height = width ÷ 1.586                                                                        |
| Width     | Phone 316–340 pt (pane width − 76, so neighbours peek about 26 pt); Duo half-open top pane 400 pt; checkout up to 400 pt |
| Radius    | 5.2 % of width (about 17.5 pt at 340)                                                                                    |
| Keyline   | 1 px, inset 7 pt, colour = text colour at 30 %                                                                           |
| Safe area | 5 % of width left/right, 8.5 % of height top/bottom                                                                      |
| Shadow    | Two layers (`0 16 34 / 42 %`, `0 2 6 / 30 %` of a Night Court near-black); none in the stack strips                      |

### What is on the face

| Slot         | Content                                                                                           | Type                                    |
| ------------ | ------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Top left     | `ClubMark` 30 pt (logo on its colour, uploaded tile, or Jost monogram) + club display name        | Geist 600 13                            |
| Top right    | Plan chip (outlined, e.g. "Annual", "Junior", "Family", "Staff", "Day", "Pack") **or** state chip | Geist 500 10.5; state chip Geist 600 11 |
| Bottom left  | Member name; for a junior "Held by {guardian}, guardian"; then `No. 0412 · Since Mar 2024`        | Geist 600 16.5; Geist Mono 10.5         |
| Bottom right | One live fact: credits left, valid-through, next booking, "Today", "Staff", or nothing            | Geist Mono 11, tabular, glass chip      |

**Deliberately not on the face:** price, the code (it is on the back), the
Duna logo (the club owns the face; Duna signs the back), more than one number,
benefits, tier progress bars, a photo of the member, Solar (nothing on a card is
live).

### Legibility over any art (automatic contrast)

Measured once per art and colour (on the poster frame), stored with the card
design, recomputed in HQ when the club changes anything:

1. Average the top 32 % and the bottom 38 % of the poster.
2. Pick the text colour (Salt or Night Court) with the better contrast against
   the worse region.
3. If the ratio is under 5:1, add a scrim gradient in that region only: colour
   = the art's own average mixed 72 % toward Night Court (or 70 % toward Salt for
   dark text), alpha = the smallest value that reaches 5:1, capped at 75 %.
4. Minimum scrim 8 % top, 12 % bottom, so loops that brighten later still read.
5. HQ shows the result ("Salt on the art · 6.8:1 · scrim 22 %"). If the cap
   cannot reach 4.5:1, HQ blocks the design and says why.

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
2. **Duna art set**: the club picks one of seven pieces and optionally tints
   it toward its colour (hue shift only, never desaturation).
3. **Derived from club colour**: three soft fields of the club colour, a
   lighter tone and a Dune-warmed tone drifting slowly, with faint court-line
   contours so it is never flat. Used automatically until the club chooses.

### The Duna art set

Each piece is light on a beach court, abstracted. Palettes stay inside the brand
(Night Court, Salt, Dune, Hardwood) plus sea greens for water.

| Piece        | What moves (one seamless loop)                    | Period | Palette                        |
| ------------ | ------------------------------------------------- | ------ | ------------------------------ |
| Sand Ripple  | Ripples drift one wavelength; light from top left | 6 s    | Dune, Salt, Hardwood shadow    |
| Shore Water  | Caustic net shimmers over shallow water           | 5 s    | Night Court to sea green       |
| Net Shadow   | The shadow of the net mesh sways on sand          | 6 s    | Sand, warm umber shadow        |
| Under Lights | Two floodlight cones breathe; haze drifts         | 6 s    | Night Court, Salt, Dune line   |
| Golden Hour  | Low shafts of light sway; dust motes              | 5 s    | Hardwood to Dune               |
| First Light  | Sun low over a haze line; reflection shimmers     | 6 s    | Salt, peach, Dune              |
| Tideline     | Foam edge washes in and out over wet sand         | 6 s    | Wet sand, sea glass, Salt foam |
| Club Colour  | Derived (above)                                   | 6 s    | The club colour                |

The prototype draws all eight procedurally (canvas) so the loops are real.
Production ships them as rendered files (below), generated from the same
recipes, so the set looks identical on every platform.

### Motion rules for art

- Loops are 3–6 s, seamless (every moving term is periodic in the loop), slow
  (nothing crosses more than 4 % of the card per second), and never cut.
- Only the **selected** card moves. Neighbours, strips and lists show the
  poster. A card that leaves the screen pauses and returns to its poster.
- A still poster is always shown first; the loop fades in over 200 ms once
  it can play through.
- Reduce Motion, Low Power Mode, Low Data Mode, and "Card motion: still" in the
  person's settings show the poster only.
- On cellular, loops download only when the person has opened the wallet before
  on Wi-Fi (cached) or allows "Play card motion on cellular" (default off).
- The card back never moves.
- **Lighter alternative (default on web, opt-in on iOS)**: a pointer or tilt
  sheen, a soft-light radial highlight that follows the pointer. No tilt of
  the card itself (the card stays flat; motion is in the light).

### Formats and sizes

| Asset                 | Native (iOS)                                                             | Web                                                   | Budget            |
| --------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------- | ----------------- |
| Poster                | HEIC 1012 × 638 (@3x for 340 pt) + JPEG fallback                         | AVIF + JPEG, 1012 and 680 widths, `srcset`            | ≤ 120 KB each     |
| Loop                  | HEVC (H.265) 1012 × 638, 30 fps, no audio, `.mp4`                        | AV1 `.mp4` and H.264 `.mp4`, 680 × 428 and 1012 × 638 | ≤ 900 KB per file |
| Stack strip / list    | Poster only, 340 × 214                                                   | Poster only                                           | ≤ 30 KB           |
| Apple / Google Wallet | `strip.png` 1125 × 432 (cropped from the poster), `logo.png`, `icon.png` | —                                                     | PassKit limits    |
| Art set masters       | Rendered from the recipes at 2024 × 1276, 6 s, then encoded as above     | same                                                  | —                 |

Video is stored and delivered by Duna Hosting (the video provider already used
for recordings); the poster comes from the same pipeline.

## 3. The wallet

### Carousel (1–6 cards, and always on the Duo half-open top pane)

- Horizontal, one card centred, neighbours peek about 26 pt each side and are
  scaled to 94 % from their inner edge (they do not dim).
- Snaps per card; a selection haptic on each snap; page dots under it (the
  current dot is an 18 pt Dune pill).
- Caption under the dots in Geist Mono: "Tap the card to show your pass";
  while the pass shows, "Brightness up · tap again for the card".
- One card: no dots, no stack switch. Two cards: carousel only.
- Web: scroll-snap, mouse drag, arrow keys, trackpad swipe.

### Stack (7 or more, or by choice)

- Each card shows a strip 27 % of its height (mark, name, plan or state chip).
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
