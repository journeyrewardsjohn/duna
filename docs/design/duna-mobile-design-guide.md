# Duna Mobile — Design Guide for Duna Players and Duna Pro

**Companion to:** `duna-design-system.md` (v2, "Golden Hour Performance"). Everything there applies. This document covers what changes when the system moves onto a phone, and how two apps stay unmistakably one product while doing opposite jobs.

**Stack assumption:** Expo / React Native, shared token package, shared primitive components, separate app shells.

---

# PART A — SHARED MOBILE FOUNDATIONS

## 1. Two apps, one system

|                    | **Duna Players**                              | **Duna Pro**                                        |
| ------------------ | --------------------------------------------- | --------------------------------------------------- |
| Who                | Players, from first-timers to world tour      | Club owners, facility managers, independent coaches |
| Job                | Find a game. Know my level. Follow the sport. | Run today without anything breaking.                |
| Emotional register | Anticipation and identity                     | Control and calm                                    |
| Default ground     | Dusk wash → fog (light, warm)                 | Fog → ink (neutral, cool)                           |
| Density            | Generous. One decision per screen.            | Dense. Many facts per screen.                       |
| Atmosphere budget  | High — imagery, gradients, motion             | Low — imagery almost never                          |
| Fellix display     | Expressive (headers, rating, event names)     | Restrained (page titles and hierarchy)              |
| Archivo usage      | Moderate (scores, rating)                     | Constant (every table, every figure)                |
| Persistent element | **The Strand** — docked bottom                | **The Watch** — docked top                          |
| Used               | At the beach, in sun, one hand, sandy         | Courtside or office, two hands, focused             |

**What is identical across both, non-negotiable:** the token file, the type roles, the radii scale, the chip and status-pill system, the flare rule, the empty-state philosophy, iconography, motion curves, and the voice.

**What diverges:** ground color, density, atmosphere, navigation anchor, and notification tone. That's it. A coach who plays should feel the two apps are siblings, not cousins.

---

## 2. The sunlight problem — solve this first

This is the single biggest risk to the aesthetic on mobile, and it deserves an honest answer rather than a hope.

Our system leans on translucency, muted contrast, and soft neutrals. **In direct beach sun (50,000–100,000 lux against a phone's ~1,200 nits), glassmorphism is functionally invisible.** A white card at 68% opacity over a photograph might reach 2:1 contrast. WCAG AA asks 4.5:1. Outdoors you want 7:1 or better. A player standing on hot sand with a match starting will not squint at our beautiful frosted card — they will close the app.

**Ship an adaptive contrast mode.** Not a user setting buried in preferences — an automatic, three-state response.

| State       | Trigger                                                                    | Behavior                                                                                                                                                               |
| ----------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ambient** | Indoors, normal light                                                      | Full system: glass, imagery, gradients, atmosphere                                                                                                                     |
| **Bright**  | Screen brightness > 80% sustained, or ambient light sensor above threshold | Glass → solid fills. Imagery opacity → 15%. Body text → `--ink` at 100%. Borders → 1px `rgba(27,27,25,.18)`. Chips gain solid fills. Nothing else changes.             |
| **Glare**   | Brightness pinned at max, or user taps the sun toggle                      | Near-monochrome: `--fog-50` or `--ink` grounds only, no imagery, no gradients, type weights bump one step, minimum 17px body, flare replaced by `--flare-deep #B84A20` |

Implementation: `expo-brightness` plus a light sensor read where available, with a manual sun toggle in the header of both apps that a user can pin. Persist the choice for the session. Animate the transition over 240ms so it doesn't feel like a bug.

**Contrast floors to enforce in code (approximate ratios on white):**

- `--flare #E8683A` ≈ 3.2:1 — **legal for icons, dots, borders, and large numerals only. Never for body text.**
- `--flare-deep #B84A20` ≈ 5.4:1 — the text variant. Use this for any flare-colored word.
- `--signal #C9E265` — dots and fills only, never text on any ground.
- `--pending #8A8578` ≈ 3.9:1 — acceptable for 16px+ secondary text, never for anything actionable.

**Corollary:** dark grounds win outdoors. This is a second, independent reason the live match view goes full ink — it's not only dramatic, it's the most legible surface we ship.

---

## 3. Hands, thumbs, and sand

Design for someone holding a phone with one sandy hand while carrying a ball bag.

- **Touch targets: 48×48pt minimum, 56pt for anything primary.** Our Class B and C chips are 20–24pt tall — they are **labels, not buttons**. If a chip must be tappable, wrap it in a 48pt row.
- **Thumb zone.** Everything a user does more than twice per session lives in the bottom third. Both apps put primary actions there. Destructive or rare actions go top-right, deliberately out of reach.
- **No small close buttons.** Sheets dismiss by swipe-down first, X second.
- **Swipe over tap** for repeated actions: swipe a session card to book, swipe a match row to score, swipe a roster row to message.
- **Scoring must survive wet fingers.** Point buttons in the Players scoring view are full half-screen tap zones — left half scores left team, right half scores right. Undo is a persistent 56pt pill. No small increment steppers.
- **Never require a long-press to reach a primary path.** Long-press is for shortcuts only.

---

## 4. Type on mobile

The apps ship the same two families as every Duna surface, with a tighter scale
and heavier minimums.

| Role                   | Mobile use                                                     | Sizes                                                                                                                          |
| ---------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Fellix**             | Every word, title, label, control, and empty-state headline    | Display 28 / 34 / 44 · body 16/24 · secondary 14.5/21 · caption 13/18 · micro 11.5/15 · tab label 10.5                         |
| **Archivo**, `tnum` on | Every meaningful number; Monument alone uses proportional nums | Live score `wdth 66 / wght 800` @ 56–72 · rating `wdth 112 / 800` @ 38–48 · table figures `wdth 78 / 700` @ 13–15 · chips 12.5 |

Rules:

- **Body text never below 15pt.** 16 is the target. Respect Dynamic Type up to at least 200%; test the scoreboard and the schedule at that size.
- Fellix display is a **moment**, not a texture. Use 700 for editorial emphasis
  and 800 for athletic/app display; hierarchy comes from weight, scale, and
  composition rather than another family.
- Line length caps at ~40 characters for display, ~60 for body.
- Never letter-space body copy. Only eyebrows and tabs get tracking.

---

## 5. Color and the temperature rule

The screen's temperature tells you what mode you're in before you read a word. This is the strongest cross-app idea we have — apply it literally.

**Duna Players**

- **Planning surfaces** (Today, Discover, Profile, Bookings): dusk wash `#FBF3F4 → #FFFFFF`, white cards, ink type. Warm, unhurried.
- **Competition surfaces** (live scoring, live match, active session): full `--ink` takeover. Cold, focused, legible in sun.
- The transition between them is a **deliberate 320ms cross-dissolve**, not a navigation push. Entering a live match should feel like the lights going down.

**Duna Pro**

- **Overview surfaces** (Today, Schedule, People, Performance): `--fog-50` ground, `--fog-100` cards. Neutral, calm, dense.
- **Console surfaces** (live day view, courtside mode, ledger detail): `--marine-900 #22343B` ground. Not ink — marine-900 is slightly warmer and reads better for long dwell time on data.
- **Exception surfaces** (payment failed, session under minimum, staffing gap): the card gains a flare left-border and a flare-tinted fill. The screen never turns red. One exception card should feel urgent; a screen full of them should still feel manageable.

**Sand-500 `#C9A96A`** is the celebration color on mobile: rating milestones, podium finishes, member tier badges, streaks. It never appears in Pro except on a revenue milestone.

---

## 6. Surfaces and depth on a phone

Glass is expensive on Android and fails in sun. Ration it.

**Glass is permitted in exactly four places:**

1. The tab bar and any bottom-docked bar
2. The Strand / the Watch
3. A sheet header while content scrolls under it
4. A card sitting directly on a photograph in the top 40% of a screen

**Everywhere else: solid `--fog-100`, white, or a dark surface with a 1px `rgba(255,255,255,.08)` border.** Depth in-app comes from a strict elevation ladder, not blur:

| Level      | Light ground                                                                 | Dark ground                                           |
| ---------- | ---------------------------------------------------------------------------- | ----------------------------------------------------- |
| 0 — page   | `--fog-50`                                                                   | `--ink` / `--marine-900`                              |
| 1 — card   | `#FFFFFF`                                                                    | `rgba(246,245,241,.05)` + 1px `rgba(246,245,241,.10)` |
| 2 — nested | `--fog-100`                                                                  | `rgba(246,245,241,.08)`                               |
| 3 — sheet  | `#FFFFFF`, 28px top radius, one soft shadow `0 -8px 40px rgba(27,27,25,.10)` | `#1F1F1D`, same                                       |

Radii on mobile: **28** bottom sheets · **24** cards · **18** nested and list rows · **12** chips and inputs · **full** pills, avatars, tab indicators.

**Performance floors:** no `backdrop-filter` on scrolling list items — ever. Lists are virtualized. Images ship as WebP with AVIF fallback, downscaled to 2× device width, blurhash placeholder on load. No hero video in either app; the ambient loop is web-only.

---

## 7. Motion and haptics

Motion budget on mobile is tighter than web: **one animated element per screen at a time.**

| Event                | Motion                                          | Haptic                      |
| -------------------- | ----------------------------------------------- | --------------------------- |
| Point scored         | Numeral slide-flip, 180ms ease-out              | Light impact                |
| Set won              | Set column locks in, 240ms, sand-500 flash      | Medium impact               |
| Match won            | Full-screen sand-gold wash sweep, 600ms, once   | Success notification        |
| Rating moved         | Value counts up over 800ms, delta chip fades in | Light impact                |
| Booking confirmed    | Card settles, checkmark draws, 320ms            | Success notification        |
| Payment failed (Pro) | Card border pulses flare twice, no bounce       | Warning notification        |
| Pull to refresh      | Sand grains drift, not a spinner                | Selection tick at threshold |
| Live dot             | 2s pulse, infinite                              | None                        |

Curves: `cubic-bezier(.2,.7,.3,1)` for entrances and settles; linear only for the Strand marquee. Never spring-bounce — bounce reads playful, and Duna is calm.

**Reduced motion:** every animation above degrades to a 120ms opacity fade. Haptics stay — they're an accessibility feature, not decoration.

---

## 8. Connectivity and empty states

Beaches have bad signal. Design for it as a normal condition, not an error.

- **Scoring is offline-first.** A match in progress writes to local storage and syncs when it can. The UI shows a small `--pending` cloud chip reading `Saved on device` — never a blocking modal, never a lost point.
- **Stale data gets a timestamp, not a spinner.** `Updated 4 min ago` in `--pending` micro type beats a skeleton that lies about freshness.
- **Three empty-state tiers**, all following the system's honesty rule:
  1. **Nothing yet, and that's fine** — Fellix 700 headline, one line of plain explanation, one action. _"No matches recorded. Your first verified result starts your rating."_ → `Record a match`
  2. **Nothing yet, and it's the sport's fault** — `--pending` chip and one sentence, no illustration. _"Broadcast not yet announced."_
  3. **Something is missing that we can name** — explain the mechanism. _"This player's tour profile isn't mapped to a Duna profile yet."_
- Use the `empty-generic` image (single ball at rest on sand, long shadow) for tier 1 only, at 30% opacity behind the text. Tiers 2 and 3 get no artwork.

---

## 9. Iconography

One set across both apps. **Draw them; don't install a library** — a default icon pack is the fastest way to make a distinctive system look generic.

Spec: 24×24 grid, 1.75px stroke, round caps, round joins, no fills except status dots, optically balanced rather than mathematically centered. Two weights: regular (1.75) and active (2.25 with a subtle fill at 8% opacity).

Draw icons from the sport's own objects wherever possible instead of generic metaphors: a net silhouette for courts, a ball for matches, a dune ridge for the Duna home, a whistle for coaching, a raked-line motif for schedule, a rising ridge line for rating. Avoid: trophies, medals, fire, lightning bolts, rocket ships, confetti.

---

## 10. Accessibility floor

Non-negotiable in both apps: Dynamic Type to 200% without clipping; VoiceOver labels on every control (a score reads "Lorenz and Rietschel, fourteen. Tiisaar and Korotkov, thirteen. Set three."); 48pt targets; visible focus rings for keyboard and switch control; reduced-motion respected; no information conveyed by color alone — the serving indicator carries a dot _and_ a position, the live pill carries a word _and_ a color.

---

# PART B — DUNA PLAYERS

## 11. What this app is for

Four moments, in frequency order:

1. **"What am I doing today?"** — glance, morning, 8 seconds.
2. **"Find me a game."** — browse and book, evening, 2 minutes.
3. **"Score this match."** — courtside, 45 minutes, sun, sand, one hand.
4. **"Where do I stand?"** — rating, history, tour, lean-back, 5 minutes.

Everything else is secondary. If a screen doesn't serve one of these four, question whether it belongs in v1.

## 12. Navigation

Five tabs, glass bar, thumb-anchored. Labels always visible — icon-only tab bars fail for infrequent users.

```
┌────────────────────────────────────────────────┐
│  [ ● Golden Hour 4s · Hermosa · in 2h    → ]   │  ← THE STRAND
├────────────────────────────────────────────────┤
│   Today     Play     Score     Rating    Tour  │
│    ▲                                           │
└────────────────────────────────────────────────┘
```

- **Today** — your day, your bookings, your people
- **Play** — discover courts, pickups, clinics, leagues (the current `/app/discover`)
- **Score** — center position, elevated. Record or resume a match. This is the app's verb.
- **Rating** — your Sand Rating, history, why it moved
- **Tour** — pro tour, live matches, rankings

**Score sits center and slightly raised** — a 56pt circle in `--ink` with a white net-line glyph. It's the one thing that produces data, and data is what makes the rating real. Everything else in the product is downstream of someone scoring a match.

## 13. The Strand — the app's signature element

The web homepage's signature is a live ticker on the fog line. The app's signature is the same idea made personal and persistent.

**The Strand is a 52pt pill docked directly above the tab bar**, present on every planning screen. It shows exactly one thing — the most relevant live or imminent item in your world, in this priority order:

1. A match you are currently scoring → `● Scoring · Set 2 · 14–11` (flare dot, tap to resume)
2. A session starting within 3 hours → `Golden Hour 4s · Hermosa Pier · in 2h 14m`
3. A pro match live involving a player you follow → `● Live · Åhman/Hellvig · 18–16`
4. Your most recent rating movement, for 24h after → `Sand Rating 3.14 · ▲ 0.14`
5. Nothing → the Strand hides entirely. It never shows filler.

Glass at 72%, full radius, one line, Archivo for the number, Fellix 500 for the label, a chevron at the right. **Tap expands it to full screen; the expansion is a shared-element transition, not a modal.** Swipe it down to dismiss for the session.

This one component gives the app a heartbeat, keeps the live product one thumb away from anywhere, and directly mirrors the web. It's the thing that makes the two feel like one brand.

## 14. Screen direction

**Today** — dusk wash. Header: avatar, `Hi, welcome back` / name, bell with flare badge. Then the week rail (7 date pills, active fill `--dusk-deep`). Then today's sessions as white cards with time in Archivo `wdth 74`, title Fellix 600, venue 400, and a `--signal` dot for confirmed. Below: `Sand Rating` compact card with the value in Archivo Expanded and its delta. Bottom: one contextual suggestion in a flare-bordered container when there's a real reason — _"Two courts are open at Hermosa at 6."_ No suggestion is better than a manufactured one.

**Play (Discover)** — fog ground. A filter row of Class B chips (`Pickup` `Clinic` `League` `Tournament` · `Tonight` `This week`), then a list of session cards using the strict card anatomy from the design system: `[Status] [Tier]` top-left, Fellix 600 title, venue line, then a footer with price left and a Class C metric chip right that turns flare at ≤3 spots. Map view is a toggle, not a separate tab.

**Score** — the app's most important surface, and a full dark takeover from the moment it opens.

- Setup: two team rows, tap to assign players from recents or search, court and format chips. One `Start match` pill.
- Live: `--ink` ground. Team names Fellix 500 at 18. Two enormous Archivo numerals, `wdth 66 / 800` at 72pt. **Left half of the screen scores left; right half scores right.** A persistent 56pt `Undo` pill bottom-center. Set strip along the top. Serving indicator as a `--signal` dot that moves. At 20 points, a `Match point` flare chip appears.
- Result: sand-gold wash sweep once, then the verified-result summary with the rating delta animating in. Then one action: `Confirm result`. Opponent verification is a push, not a blocker.

**Rating** — dusk wash, and the app's most editorial screen. The value in Archivo Expanded `wdth 112 / 800` at 48pt, delta beside it, a sparkline beneath with a flare endpoint dot. Then **"Why it moved"** — the three-row breakdown from the web card (`Beat a 3.4 pair, 21–19 / 15–12 → +0.09`), which is the most trust-building content in the product. Then match history as a compact list, then a link to methodology. Fellix 700 headline: _"A rating that moves when your game does."_

**Tour** — the only Players screen that inherits the web's dark performance treatment by default. Live matches at top with the two-line collapsed card, then today's schedule, then rankings. Event artwork appears only inside a contained card, never full-bleed. Following a player adds their live matches to your Strand priority.

## 15. Beyond the app shell

- **Live Activity / Dynamic Island** is the highest-leverage thing this app can ship. A live match on the lock screen: team abbreviations, set score in Archivo tabular, a flare dot, and set progress. In the compact Dynamic Island: `LOR 14 · TII 13`. This is a beach volleyball product's perfect use case and almost nobody in the sport has it.
- **Home screen widgets:** small — Sand Rating value and delta. Medium — next session with venue and countdown. Large — today's sessions plus one live pro match.
- **Watch:** score entry only. Two tap zones, undo via crown. Nothing else.
- **Notifications** (Players voice — warm, brief, never pushy): _"Golden Hour 4s starts in 1 hour. Hermosa Pier."_ · _"Your rating moved to 3.14 after last night's match."_ · _"Erik added you to Saturday's team."_ Never: streak guilt, "we miss you," or anything with an exclamation mark. Cap at two per day unless a match is live.

## 16. App icon

The Duna mark is a **dune ridge**: a single asymmetric curve rising left-to-right, with a thin horizon line behind it. Players' icon is that ridge in `--ink` on a `--sand-300 → --sand-100` golden-hour gradient. Warm, recognizable at 40pt, distinct on a beach-blue wallpaper.

Launch screen: `--sand-100`, the ridge mark centered, no wordmark, no spinner. It resolves into the Today screen's dusk wash — the launch is the first frame of the app, not a separate brand moment.

---

# PART C — DUNA PRO

## 17. What this app is for

An operator's phone app is not a smaller dashboard. The desktop console is for _building_ — creating offers, configuring rules, designing the theme. The phone is for _running and reacting._ Three moments:

1. **"Is today okay?"** — glance, morning and mid-afternoon, 10 seconds.
2. **"Something needs me."** — respond to an exception: a failed payment, a session under minimum, a coach out, a member message. 30 seconds, from a notification.
3. **"Do the small thing now."** — mark attendance, message a group, move a session, add a walk-in. 60 seconds, courtside.

**Explicitly out of scope on mobile:** building offers from scratch, theme kit editing, ledger reconciliation, campaign construction. Those get a graceful `Continue in Duna HQ` handoff with a deep link, not a cramped mobile port.

## 18. Navigation

Four tabs plus a persistent top element. Fewer tabs than Players, because operators go deep rather than wide.

```
┌────────────────────────────────────────────────┐
│ DUNA PRO      South Bay ▾            ☀  ⚙     │
│ ● 2 live · 1 needs attention · $840 today      │  ← THE WATCH
├────────────────────────────────────────────────┤
│                                                │
│                    content                     │
│                                                │
├────────────────────────────────────────────────┤
│   Today      People      Money      Inbox      │
└────────────────────────────────────────────────┘
```

- **Today** — the day as it stands
- **People** — members, staff, at-risk signals, rosters
- **Money** — takings, plans, failed payments, payouts
- **Inbox** — member messages and Duna AI suggestions

The **organization switcher** sits in the header — an operator with two locations switches constantly, and burying it in settings is a daily tax.

## 19. The Watch — Pro's signature element

Where Players gets a bottom-docked Strand, Pro gets a **top-docked Watch**: a persistent one-line status bar directly under the header, present on every screen.

It reports exactly three things, always in the same order and the same positions: **live count · exceptions · today's takings.**

`● 2 live · 1 needs attention · $840 today`

- The live count uses a `--signal` dot when sessions are running normally.
- The exception count turns `--flare-deep` and the dot turns flare when anything needs a human. Zero exceptions renders as `all clear` in `--pending` — a calm state should be visibly, satisfyingly calm.
- Takings in Archivo `wdth 78 / 700`, tabular so it doesn't jitter as it updates.

Tap the Watch to expand a sheet listing every exception with a one-tap resolution. **This is the whole app in one line.** An operator should be able to open Duna Pro, read one line, and close it.

The mirroring is deliberate: Players' signature docks at the bottom because it's about _your next move_; Pro's docks at the top because it's about _ambient status_. Same component family, opposite anchor, opposite job.

## 20. Screen direction

**Today** — fog ground. Below the Watch, the **day view as court lanes**: a horizontally scrolling hour axis with one lane per court, sessions as 18px-radius blocks. This is the single most operator-native view we can build — a facility manager thinks in courts and hours, not in a list. Blocks carry: title (Fellix 600 13), coach initials, attendance as `7/12` in Archivo tabular, and a flare left-border when under minimum. Tap a block for a sheet: attendance list, message the group, move, cancel.

Under the lanes: `Needs attention` as a stack of exception cards, then `Duna AI` suggestions in the flare-bordered container (_"Two courts are quiet after 4 PM. Publish a level-matched pickup?"_ → `Review` / `Dismiss`). AI suggestions cap at two visible; the rest collapse.

**People** — fog ground, dense list. Search pinned. Segment chips: `Members` `At risk` `New` `Staff`. Rows are compact: avatar, name Fellix 500, one line of context (`Last booked 24 days ago`), and a right-aligned state chip. **Retention signals must show their reason inline** — the web copy already promises _"Every reason is visible; no mystery score pretends to know more than the data."_ Honor that: `At risk · no booking in 24 days`, never a bare score. Swipe a row to message.

**Money** — this is a console surface: `--marine-900` ground. Today's takings in Archivo Expanded at the top, then a 7-day bar strip, then sections for `Failed payments` (flare-bordered, one-tap retry), `Upcoming payouts`, `Active plans`. All figures tabular, right-aligned, in a consistent column so the eye can scan a stack of numbers without re-anchoring. No charts beyond the bar strip — an operator on a phone wants amounts, not analytics.

**Inbox** — fog ground. Two streams in one list, distinguished by a leading identity chip: member messages (avatar) and Duna AI suggestions (flare dot + `DUNA AI`). Quick replies as chips. Consent and guardian routing state shows as a small `--pending` chip on any thread where it applies — never let an operator message a minor without seeing that.

**Courtside mode** — a full-screen, high-contrast utility reachable from any session block. Marine-900 ground, roster as huge 56pt tap rows, tap to toggle present/absent, running count in Archivo Expanded at the top. Works offline. Designed to be used standing in sun with a clipboard in the other hand. This mode ignores the ambient/bright/glare gradation and simply always renders at glare contrast.

## 21. Beyond the app shell

- **Widgets:** small — the Watch line itself. Medium — next three sessions with attendance. Large — court lanes for the next four hours. The Watch as a widget is the most useful thing on an operator's home screen.
- **Live Activity:** an in-progress session with a live attendance count and time remaining.
- **Notifications** (Pro voice — operational, specific, actionable, never alarming): _"Open play at 5:30 has 4 of 8. Auto-cancel triggers at 3 PM."_ · _"Payment retry failed for M. Sanchez. $95 membership."_ · _"Coach Rivera marked unavailable for Thursday."_ Every operational notification carries a one-tap action. Cap at three per day; batch the rest into a single evening digest. Never notify an operator about something they cannot act on from a phone.

## 22. App icon

Same dune ridge mark, **inverted**: the ridge in `--sand-500` on `--ink`. Instantly readable as the sibling app, instantly distinguishable on a home screen that has both. It also encodes the relationship correctly — Players is the daylight app, Pro is the back-of-house app.

Launch screen: `--ink`, gold ridge, no spinner.

---

# PART D — CROSS-APP

## 23. One person, two apps

A coach is also a player. Handle it explicitly rather than making them maintain two identities.

- **One Duna account, two app installs.** Same credentials, same profile, same Sand Rating.
- Duna Pro shows a `Your game` row in settings that deep-links into Duna Players, and Players shows `Duna Pro` in settings for anyone with an operator role.
- **Never mirror operator data into Players.** A coach's takings do not belong on a screen they might hand to a player at the net. Separation of the two apps is a privacy feature, and it's worth saying so in the settings copy.
- Deep-link scheme: `duna://player/...` and `dunapro://...`. Universal links from email and web must route to the correct app and fall back to web when the app isn't installed.

## 24. Shared component library

Build once in a shared package; theme per app. Naming:

`Token` · `StatusPill` (Class A) · `TaxonomyChip` (B) · `MetricChip` (C) · `IdentityChip` (D) · `Card` · `Sheet` · `ListRow` · `DateRail` · `Strand` (Players) / `Watch` (Pro) — same primitive, different anchor prop · `ScoreBoard` · `EmptyState` · `ExceptionCard` · `AiSuggestion` · `Console` · `Avatar` · `FlagChip` · `SunToggle`

Ship the token file as the only source of color, radius, and type values. If a hex code appears inline in a component, that's a bug.

## 25. Imagery in the apps — use less than you think

The design system's imagery doctrine is about atmosphere on the web, where a hero has room to breathe and a user is lean-back. **In-app, photography mostly gets in the way.** It slows launch, eats data on cellular at a beach, and fights legibility in sun.

Ration it to five places, and generate them from the same Higgsfield seeds as the web so everything matches:

| Slot                       | App     | Direction                                                                    |
| -------------------------- | ------- | ---------------------------------------------------------------------------- |
| Onboarding, 3 frames       | Both    | `app-onboard-{find,score,rate}` — golden hour, wide, athlete small in frame  |
| Empty states, tier 1 only  | Both    | `empty-generic` at 30% opacity                                               |
| Event and venue headers    | Players | Reuse web `event-venue-{slug}` plates, cropped 3:2, always fog-dissolved     |
| Behind the live scoreboard | Players | `match-court-{cc,c2}` at 12% opacity over ink                                |
| Club cover image           | Pro     | Operator-uploaded, auto-graded toward our palette on upload, never generated |

Everything else in both apps is typography, data, and color. That restraint is what makes the five images land.

## 26. Do and avoid — mobile specific

**Do**

- Ship adaptive contrast before ship, not after the first sunny-day complaint.
- Put the app's core verb in the center tab (Players: Score) or the top line (Pro: the Watch).
- Make the Strand and the Watch the first components you build — they define both apps.
- Keep score entry offline-first and gigantic.
- Use haptics as feedback for every state change that matters.
- Let a calm state look calm. `all clear` is a design deliverable.
- Ship Live Activities. In this sport, nobody else has.

**Avoid**

- Glass on scrolling lists, or anywhere in Pro's dense views.
- Any third type family or serif anywhere in either app.
- Porting desktop Duna HQ workflows into the phone app. Hand off instead.
- Any red. Exceptions use flare with a border, never a red fill.
- Streak mechanics, badges for showing up, or notification guilt. Duna's dignity is a feature.
- Mirroring operator financials into the Players app.
- Bounce animations, spinners where a timestamp would do, and skeleton screens that outlast 400ms.
- More than one animated element on screen at once.

## 27. Build order

1. Token package, type roles, adaptive-contrast provider, icon set.
2. Shared primitives: Card, ListRow, the four chip classes, EmptyState, Sheet.
3. **Players:** Score (dark, offline, huge) → Today + Strand → Play → Rating → Tour.
4. **Pro:** Today with court lanes + the Watch → exception cards and Inbox → People → Money.
5. Live Activities and widgets for both.
6. Watch app for score entry.

Score-first for Players and Watch-first for Pro is deliberate: those two surfaces prove the whole system. If they feel right in the sun, on sand, with one hand, everything else follows.
