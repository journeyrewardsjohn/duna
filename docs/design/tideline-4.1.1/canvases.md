# Canvases

The design canvases are private artifacts owned by the Duna owner. Coding
agents read them; nobody publishes to them or edits them from this programme.

| Surface          | Canvas                                                                                  | Boards (on 27 Nov 2026)          |
| ---------------- | --------------------------------------------------------------------------------------- | -------------------------------- |
| Design system    | [Tideline](https://claude.ai/artifact/EnNwtph9e7ioe2Xh4LrA5z) ("Design System" type)    | component cards, not boards      |
| Website (public) | [Duna Website — Pages](https://claude.ai/artifact/LHCEnK9TVCxXBhXAKiuKxi)               | 40 (14 Current, 26 Proposed 4.0) |
| HQ               | [Duna HQ — Screens](https://claude.ai/artifact/PPeoEv59z8Nsq3u7NVuxhE)                  | 161 (20 Current, 6 Superseded)   |
| Player native    | [Duna Player (native) — Screens](https://claude.ai/artifact/9cMgz4aR5N39agjZ2zXvxd)     | 132 (21 Current)                 |
| Pro (native)     | [Duna Pro (native) — Screens](https://claude.ai/artifact/LfEixBjuh2kLpe6o3J5f5p)        | 51 (19 Current, 1 Before)        |
| Player web       | [Duna Player (web) — Screens](https://claude.ai/artifact/DWfyLEfEPwz5fU8vgb3sdx)        | 69 (16 Current)                  |
| Drill Studio     | [Drill Studio prototype](https://claude.ai/artifact/A5b46Qna8GawkAMa6qV1D1) (plain app) | `index.html`, `src/*.js`         |

Do not use the unrelated artifact "Duna Design System".

## How to read a board

1. List files: Artifact tool, `action: "list"`, `scope: "files"`, the canvas
   `url`. Boards are `project/<Name>.dc.html`; `project/canvas.json` holds
   every board's title (Current / Proposed 4.0 / 4.1 / 4.1.1 / Superseded).
2. Read a board: `action: "read"`, the canvas `url`, `path:
"project/<Name>.dc.html"` (or `paths` for several). Shared canvas CSS is in
   `project/*.css` (`hq.css`, `t3.css`, `craft.css`, `adapt.css`, `pw3.css`,
   `pro3.css`, ...); the copied design system is under `project/ds/duna/`.
3. A board's markup is the spec for layout, copy, hierarchy and states. Its
   inline styles and example data are not code to paste (contract step 3).
4. Not specs: boards titled **Current** (what ships today; useful for
   behaviour you must keep), **Superseded by 4.1** (HQ: `A-Dock`,
   `W-Website`, `W-Website-Start`, `W-Website-Capabilities`,
   `W-Website-Connectors`, `W-Website-Infrastructure`, `W-Website-Publish`),
   **Before** (Pro `P04z-ScheduleBefore`), pointers (Player web `P-Wallet` →
   `W-Web-Wallet`, `P-Messages` → Concierge), and the alternative
   `P-Home-Alt` (Player native).
5. Boards built on older Tideline (3.1 notes on Player web) are restyled by the
   4.0 pass ("Brand Book 2.0 on every Proposed board"); when a board and the
   contract disagree, the contract wins (for example left-edge stripes on
   `IA-Map`, a five-item dock on `P-Shell-MobileBar`, Satoshi/Figtree in
   Current boards).

## Rulings recorded for the canvases

- **Native tab bar.** Duna Player and Duna Pro use the system's own tab bar.
  It becomes the iPhone Duo's vertical bar and the iPad sidebar. Tideline's
  `TabBar` component is for web (Player web phone dock).
- **One function, every size.** No function exists on only one size; surfaces
  may (a three-column iPad Concierge is a surface; replying in a thread is a
  function that also exists on the phone).
- **Identity chrome.** Every shell keeps sign-in, sign-up, the organisation
  switcher with "Create new organisation", and the personal account.
- `A-Adaptive-Rules` (Player native) is the adaptive spec for both native apps
  together with [`adaptive.md`](adaptive.md).

## Work package → boards

Work-package ids come from [`docs/plan/web-hq-backend.md`](../../plan/web-hq-backend.md)
(unprefixed) and [`docs/plan/mobile.md`](../../plan/mobile.md) (prefixed
`M-` here, because both plans reuse letters such as F1, C1, P1, R1). Canvas
abbreviations: Web, HQ, PN (Player native), PW (Player web), Pro, DS (the
system artifact's component cards, `project/components/<Name>/`).

### Wave 0 and foundations (web / HQ / backend plan)

| WP           | Boards that are its spec                                                                                  |
| ------------ | --------------------------------------------------------------------------------------------------------- |
| R1, R3, R4   | no board: follow the contract                                                                             |
| R2           | this folder                                                                                               |
| F1           | DS: every component card (visual reference for the coded library)                                         |
| F2a/F2b      | DS: `BrandColour`, `TypeRamps`, `Elevation`, `Motion`, `LiveZone`; tokens in [`tokens.json`](tokens.json) |
| F3           | DS: `LogoSystem`, `LogoUsage`, `BrandType`; assets in [`assets/`](assets/)                                |
| F4           | DS: `IconFamily`, `IconRules`, `Icons`, `SportIcons`                                                      |
| F5a–e, F6a–d | no board: follow the contract (cascade and dead-CSS work must not change visuals)                         |

### Wave 2: shell, IA, components

| WP  | Boards                                                                                                                                                                                                                                                                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S2  | HQ `IA-Map`; see [`ia-hq.md`](ia-hq.md)                                                                                                                                                                                                                                                                   |
| S1  | HQ `HqSide`, `HqTop`; DS `HQShell`, `Sidebar`; (`A-Dock` is superseded)                                                                                                                                                                                                                                   |
| S3  | DS `ObjectNav`, `SectionNav`; HQ `S-Offer-Lesson`, `TM-Availability` (object header + SubNav in use)                                                                                                                                                                                                      |
| S4  | HQ `A-Fill`, `A-Proposal`, `A-Sensitive`, `A-Plan`, `A-Fix`, `A-Remove`, `A-Rules`, `CS-Hours`                                                                                                                                                                                                            |
| C1  | HQ `NetScore`; PN `P-MatchStatus`, `P-Result-Rating`; PW `P-Match-Confirmed`; DS `NetScoreStates`, `RatingRing`, `MatchResult`                                                                                                                                                                            |
| C2  | HQ `S-Club-Identity`; PW `W-Web-Card`, `W-Web-Wallet`; DS `ClubLogo`, `MembershipCard`, `Wallet`                                                                                                                                                                                                          |
| C3  | PW `D-Web-Zoom`, `D-Web-Clubs`; HQ `S-Layout`, `F-Today`; DS `MapPin`, `MapZoomLadder`, `MapParts`, `DiscoverMap`                                                                                                                                                                                         |
| C4  | PW `P-Court-Booking`, `P-Book-Lesson`; DS `DayStrip`, `TimeAndDay`, `TimeSlotsFit`, `SlotPicker`                                                                                                                                                                                                          |
| C5  | Pro `P04c-ScheduleConditions`; HQ `W-Schedule-Stop`; DS `LightAndWeather`, `Daylight`, `WeatherHQ`                                                                                                                                                                                                        |
| C6  | PW `F-Web-Search`, `F-Web-Search-Panels`, `F-390-Search`; DS `SearchBar`, `WherePicker`, `WhenPicker`, `WhatPicker`, `SearchSheet`, `SearchResults`, `SearchHero`                                                                                                                                         |
| C7  | PW `C-Concierge`, `C-Web-Match`; DS `ConciergeParts`, `SendReview`, `FourChannels`, `ConciergeRules`                                                                                                                                                                                                      |
| P1  | PW `P-Shell-Sidebar`, `P-Shell-Topbar`, `P-Shell-MobileBar` (four verbs, see contract), `P-Home`, `M-Home-390`                                                                                                                                                                                            |
| P2  | Web `PRules`, `PSiteHeader`, `PSiteFooter`, `PHome`, `PHomeMobile`, `PRunYourClub`, `PPricing`, `PFeatures`, `PPlayers`, `PPlayersMobile`, `PGetApp`, `PForCoaches`, `PForFacilities`, `PSignIn`, `P404`, `POnboarding`, `PRankings`, `PPro`, `PPlayerProfile`, `PCoach`, `PEventUpcoming`, `PEventEnded` |

### Wave 3: backends (contract-first; boards show the data they must serve)

| WP    | Boards                                                                                                                                                                                     |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| B1    | HQ `CS-Start`, `CS-Reading`, `CS-Found`, `CS-States`, `CS-Home`                                                                                                                            |
| B2    | HQ `DP-Intro`, `DP-Business`, `DP-Verify`, `DP-Status`, `DP-Payouts`, `DP-Policies`, `DP-Gate`, `MN-Home`                                                                                  |
| B3a   | HQ `TM-Availability`, `TM-Coverage`                                                                                                                                                        |
| B3b   | HQ `TM-Compensation`, `TM-PayRun`                                                                                                                                                          |
| B3c   | no board: follow the contract (`TM-PayRun` shows where contractor payouts surface)                                                                                                         |
| B4    | HQ `TR-New`, `TR-Program`, `TR-Schedule`, `TR-After`                                                                                                                                       |
| B5    | HQ `DL-Library`, `DL-Detail`, `DL-Share`, `DL-Store`                                                                                                                                       |
| B6a–d | Drill Studio prototype (`src/model.js`, `layout.js`, `physics.js`, `resolve.js`, `validator.js`, `timeline.js`, `render2d.js`, `render3d.js`, `pipeline.js`); HQ `DL-Studio`, `PP-Builder` |
| B7    | PW `C-Web-*`, `C-390-*`; PN `C-*`; Pro `C-Pro-*`; HQ `W-Inbox`                                                                                                                             |
| B8a   | HQ `WS-HowLive`, `WS-Lanes`, `WS-Changes`, `WS-Rest`, `WS-Select`, `WS-Working`, `WS-Review`, `WS-Review-Stale`                                                                            |
| B8b   | HQ `WT-Templates`, `WN-1-Pick`, `WN-2-Rest`, `WO-1-Site` … `WO-8-First`                                                                                                                    |
| B9    | HQ `F-Onboarding`, `F-Access`, `F-Approvals`, `F-Policies`, `F-Money`, `F-Listing`; PW `B-Web-Facility`, `B-Web-Request`; PN `B-Public-Beach`                                              |
| B10   | PW `F-Web-Search`, `F-Web-Search-Panels`; PN `F-Search-Results`                                                                                                                            |
| B11   | no board: follow the contract (C5 boards show what it feeds)                                                                                                                               |

### Wave 4: feature UIs (web / HQ)

| WP  | Boards                                                                                                                                                                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1  | HQ `W-Today`, `W-Today-Loading`, `P-C7-Today`, `P-K7-Today`, `M-07-Today`                                                                                                                                       |
| H2  | HQ `W-Schedule`, `W-Schedule-Stop`                                                                                                                                                                              |
| H3  | HQ `W-Inbox`                                                                                                                                                                                                    |
| H4  | HQ `W-People`, `W-People-Loading`, `W-Member`                                                                                                                                                                   |
| H5  | HQ `TM-List`, `TM-Add`, `TM-Availability`, `TM-Compensation`, `TM-Coverage`, `TM-PayRun`                                                                                                                        |
| H6  | HQ `TR-New`, `TR-Program`, `TR-Schedule`, `TR-After`                                                                                                                                                            |
| H7  | HQ `PP-Builder`, `PP-Coach`, `PP-Print`                                                                                                                                                                         |
| H8  | HQ `DL-Library`, `DL-Detail`, `DL-Share`, `DL-Store`, `DL-Studio`                                                                                                                                               |
| H9  | HQ `W-Offerings`, `W-Event`, `S-Offer-New`, `S-Offer-Lesson`, `S-Offer-Membership`, `S-Offer-Pack`, `S-Event`, `S-Tickets`, `S-Pricing-Policies`                                                                |
| H10 | HQ `W-Money`, `W-Money-Loading`, `MN-Home`, `DP-*`                                                                                                                                                              |
| H11 | HQ `S-Setup-Home`, `S-Facility`, `S-Layout`, `S-Club-Identity`, `CS-*`, onboarding `P-00-Welcome` … `P-U3-Confirmed`, `P-S-States`, `M-00-Welcome` … `M-09-Upgrade`, `OnbRail`, `OnbPreview`; Web `POnboarding` |
| H12 | HQ `WS-*`, `WO-*`, `WN-*`, `WT-Templates`, `WC-Capabilities`, `WX-Connectors`, `WI-Insights`, `WD-Domain`                                                                                                       |
| H13 | no board: follow the contract (Marketing and Reports keep today's function; `IA-Map` gives the SubNav)                                                                                                          |
| H14 | HQ `F-*`                                                                                                                                                                                                        |
| —   | HQ `W-Settings`, `W-States`, `W-Rules`: shared by every H package (Settings, states, interaction rules)                                                                                                         |
| P3  | PW `F-Web-Search`, `F-Web-Search-Panels`, `F-390-Search`, `D-Web-Clubs`, `D-Web-Tournaments`, `D-Web-Leagues`, `D-Web-Zoom`, `D-390-Map`, `D-Discover`, `P-Play`, `P-Map`; Web `PDiscover`                      |
| P4  | PW `P-Club`; Web `PClub`, `PClubMobile`                                                                                                                                                                         |
| P5  | PW `P-Court-Booking`, `P-Court-Review`, `P-Book-Lesson`, `P-Checkout`, `M-Booking-390`, `P-Invite-Booking`, `P-Invite-Booking-Paid`; Web `PCheckout`                                                            |
| P6  | PW `W-Web-Wallet`, `W-Web-Card`                                                                                                                                                                                 |
| P7  | PW `C-Web-Inbox`, `C-Web-Lesson`, `C-Web-Match`, `C-Web-Tournament`, `C-Web-Duna`, `C-Web-Guardian`, `C-Web-Reach`, `C-390-Inbox`, `C-390-Thread`                                                               |
| P8  | PW `P-Match-Awaiting`, `P-Match-Confirmed`, `P-Match-Disputed`, `P-Add-Result`, `P-Matches`, `M-Match-390`                                                                                                      |
| P9  | no web board: follow the contract; PN `P-Video-*` and `P-Health-*` show the native equivalent                                                                                                                   |
| —   | PW `P-Onboarding`, `P-You-Settings`, `P-Invites-Other`, `P-Calendar`, `P-Event`, `P-States`, `M-Invite-390`: not assigned by the plan; the orchestrator assigns them (P1 or a new P package)                    |

### Mobile plan (prefixed `M-`)

| WP                                       | Boards                                                                                                                                                                                                                               |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M-G0, M-F0, M-F4, M-F5, M-C7, M-X1, M-X2 | no board: follow the contract                                                                                                                                                                                                        |
| M-G1                                     | this folder (done by R2)                                                                                                                                                                                                             |
| M-F1                                     | DS `Motion`, `Loaders`, `LoadingStates`, `TypeRamps`, `IconFamily`; PN `P-FirstOpen`                                                                                                                                                 |
| M-F2                                     | PN `A-Adaptive-Rules`, `IPAD-Split`; [`adaptive.md`](adaptive.md)                                                                                                                                                                    |
| M-F3                                     | PN `DUO-Closed`, `DUO-Half-Live`, `DUO-Half-Score`, `DUO-Half-Film`, `DUO-Half-Lesson`, `DUO-Accessory`                                                                                                                              |
| M-N1                                     | DS `LogoSystem` (app icon); PN `P-FirstOpen`, `IOS-SystemLook`                                                                                                                                                                       |
| M-C1                                     | PN `P-MatchStatus`, `P-Result-Score`, `P-Result-Rating`, `P-Live`; DS `NetScoreStates`, `RatingRing`                                                                                                                                 |
| M-C2                                     | PN `P-Book-Court`, `P-Lesson-Time`; DS `TimeAndDay`, `TimeSlotsFit`, `LightAndWeather`                                                                                                                                               |
| M-C3                                     | PN `W-Card`, `W-Card-Pending`, `P-Club`; DS `ClubLogo`, `MembershipCard`                                                                                                                                                             |
| M-C4                                     | PN `C-Inbox`, `C-Thread-*`, `C-Reach`, `C-Guardian`; DS `ConciergeParts`, `SendReview`                                                                                                                                               |
| M-C5                                     | PN `F-Search-Sheet`, `F-Search-Results`, `D-Map-Clubs`, `D-Map-Tournaments`, `D-Map-Leagues`, `D-Map-Dark`, `D-List`                                                                                                                 |
| M-C6                                     | PN `P-IA`, `P-Add`, `P-Interactions`, `A-Adaptive-Rules`, `IOS-SystemLook`, `P-FirstOpen` (system tab bar ruling applies)                                                                                                            |
| M-P0                                     | PN `P-IA`, `P-Interactions`, `A-Adaptive-Rules`, `IOS-SystemLook`, `DUO-Closed`                                                                                                                                                      |
| M-P1                                     | PN `P-Home`, `P-Home-Dark`, `DUO-Open-Home`, `IPAD-Home`                                                                                                                                                                             |
| M-P2                                     | PN `F-Search-Sheet`, `F-Search-Results`, `P-Play-Courts`, `P-Play-Matches`, `P-Play-Clubs`, `P-Play-Map`, `P-Play-Events`, `P-Play-Coaches`, `D-*`, `DUO-Open-Find`, `IPAD-Find`                                                     |
| M-P3a                                    | PN `P-Book-Court`, `P-Book-Review`, `P-Book-Done`, `B-Public-Beach`, `DUO-Open-Book`, `IPAD-Book`                                                                                                                                    |
| M-P3b                                    | PN `P-Lesson`, `P-Lesson-Time`, `P-Lesson-Review`, `P-Lesson-Done`, `P-Event`, `P-Match-Open`, `P-Match-Joined`, `DUO-Half-Lesson`                                                                                                   |
| M-P4a                                    | PN `P-Result-Players`, `P-Result-Score`, `P-Result-Sent`, `P-Result-Confirm`, `P-Result-Rating`, `P-MatchStatus`, `P-Live`, `DUO-Half-Live`, `DUO-Half-Score`                                                                        |
| M-P4b                                    | PN `P-Video-Library`, `P-Video-Player`, `P-Video-Share`, `P-Video-Shared`, `P-Video-Record`, `DUO-Half-Film`, `DUO-Open-Improve`, `DUO-Accessory`, `IPAD-Improve`, `IOS-HealthZones` (capture code belongs to the video work stream) |
| M-P4c                                    | PN `P-Health-Home`, `P-Health-MatchDay`, `P-Health-Rally`, `P-Health-Season`, `P-Health-Sharing`, `P-Health-Connect` (health gating: see the 2026-11-27 note in `AGENTS.md`)                                                         |
| M-P5a                                    | PN `C-Inbox`, `C-Thread-*`, `C-Reach`, `C-Guardian`, `DUO-Open-Concierge`, `IPAD-Concierge`                                                                                                                                          |
| M-P5b                                    | PN `W-Wallet`, `W-Card`, `W-Card-Pending`, `P-Wallet`, `DUO-Open-Wallet`                                                                                                                                                             |
| M-P6                                     | PN `P-You`, `P-MyClubs`, `P-Club`, `P-Club-Join`, `P-Club-Joined`, `P-Club-Invite`, `P-Calendar`, `P-FR1` … `P-FR5`, `P-AI`, `P-Messages`, `P-States`                                                                                |
| M-P7                                     | PN `WT-Scorer`, `WT-Gestures`, `WT-Glance`, `WT-States`, `WT-Switch`, `WT-Review`, `WT-Controls`, `WT-Camera`, `P-Watch-Handoff` (restyle only: interaction unchanged)                                                               |
| M-K1                                     | PN `IPAD-Pointer`, `IPAD-Split`                                                                                                                                                                                                      |
| M-K2                                     | PN `IOS-Widgets`, `IOS-LiveActivity` (Live Activity and Dynamic Island)                                                                                                                                                              |
| M-K3                                     | PN `IOS-Intents`                                                                                                                                                                                                                     |
| M-R0                                     | Pro `P00-NavMap`, `P01-FirstRun`, `P16-Interactions`                                                                                                                                                                                 |
| M-R1                                     | Pro `P02-Today`, `P03-TodayDark`, `P04-Schedule`, `P04b-ScheduleByCourt`, `P04c-ScheduleConditions`                                                                                                                                  |
| M-R2                                     | Pro `P05-Session`, `P06-Courtside`, `P07-CheckIn`                                                                                                                                                                                    |
| M-R3                                     | Pro `P08-People`, `P09-Inbox`, `P17-Student`, `C-Pro-Ask`, `C-Pro-Review`, `C-Pro-Sent`, `C-Pro-Thread`, `C-Pro-Threads`, `C-Pro-Draft`, `C-Pro-Rain`                                                                                |
| M-R4                                     | Pro `P10-Create`, `P11-GetPaid-Amount`, `P12-GetPaid-Method`, `P13-GetPaid-Result`, `P14-Money`, `P15-Account`                                                                                                                       |
| M-R5                                     | Pro `P18-Availability`, `P19-Event`                                                                                                                                                                                                  |
| M-R6                                     | Pro `P20-SharedFilm`, `P21-FilmVariants`; Drill Studio prototype                                                                                                                                                                     |
| on-device AI for video                   | no board: follow [`adaptive.md`](adaptive.md) (Owner requirement, needs a native Swift module)                                                                                                                                       |
