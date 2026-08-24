# Duna Mobile Interface v4

**Status:** current direction for Duna Player and Duna Pro application chrome,
navigation, messaging, video, and recording. It supersedes conflicting mobile
navigation, typography, color-density, and recorder UI guidance in
`duna-mobile-design-guide.md`. The privacy, data-truth, theme, zone, and
accessibility contracts remain in force.

**Player implementation:** the shared Satoshi and mobile-token foundations,
Video Library, recording setup, camera guide, Home, glass navigation,
quick-action sheet, and unified Duna AI / Messages entry shell are implemented
on the current Player redesign branch. Calendar, profile, and remaining
secondary screens migrate next without changing their routes or business
handlers.

## Direction

Duna mobile is a familiar, quiet utility product. White and black do most of
the work. Duna blue and sand add identity beneath glass, around selected
context, and in small moments of guidance. Flare remains reserved for live or
time-sensitive state. A user should understand the primary action without
learning Duna's visual language first.

The product should feel:

- simple enough to use with one hand at a court;
- precise enough to trust with schedules, scoring, and recordings;
- warm through spacing and small Duna color fields, not decorative chrome;
- native to iOS without depending on an effect unavailable to React Native;
- consistent across Player and Pro while respecting their different jobs.

## Foundations

### Five-point rhythm

All native layout spacing is composed from `5, 10, 15, 20, 25, 30, 40, 50,
60`. A 1pt hairline and a 2.5pt optical inset are the only exceptions. The
default page inset is 20pt. Minimum controls are 50pt; primary actions are
60pt. Cards use 20pt radii, nested surfaces 15pt, and sheets 30pt.

The executable source is `packages/ui/src/mobile.ts`. A screen must consume
those values rather than creating a second spacing system.

### Typography

Satoshi is used for every word and number in Player and Pro. Native weights
map to the five bundled static faces:

| Requested weight | Loaded face     | Use                              |
| ---------------- | --------------- | -------------------------------- |
| 300              | Satoshi Light   | Rare editorial display           |
| 400              | Satoshi Regular | Body and supporting copy         |
| 500              | Satoshi Medium  | Labels, navigation, and controls |
| 600–700          | Satoshi Bold    | Titles and actions               |
| 800–900          | Satoshi Black   | Large metrics and live emphasis  |

Never synthesize semibold. Updating or aligned numbers use tabular figures.
Native body copy is at least 15pt, inputs 16pt, and compact metadata 12pt.

Every Player and Pro `Text` and `TextInput` is routed through each app's
`satoshi-text.tsx`. This is the compatibility layer for existing screens: it
translates their legacy font weights to installed Satoshi faces without
requiring a simultaneous rewrite of every style object. `verify:readable-type`
fails when either mobile app bypasses this layer.

### Color

Use semantic tokens, never screen-local hex values.

- Light planning and setup: near-white ground, white surfaces, black text.
- Live camera and scoring: near-black ground, white text.
- Duna blue: glass underlay, linked context, and quiet selected state.
- Duna sand: tiny identity and AI guidance moments.
- Flare: recording/live dots, active scarcity, and exceptions only.
- Gain/loss: verified directional data only.

One screen gets one Duna color family at a time. A setting screen does not need
blue buttons, sand cards, coral icons, and green toggles together.

Player has one calm light interface shell. There is no global light/dark mode
preference or appearance toggle. Dark remains a task-specific environment for
camera capture, live scoring, and other situations where the activity benefits
from it; it is not a second skin for Home, Calendar, discovery, or messaging.

### Icons

Use the Duna 24×24 line set: 1.5pt stroke, round caps and joins, no decorative
fills. Active state may use 1.75pt stroke and one low-opacity fill. Icons and
their labels share one baseline; do not use emoji or text glyphs as interface
icons. An icon-only control always has a 50pt target and an accessibility
label.

## Navigation and sheets

The bottom bar is one translucent glass dock with a restrained light-blue tint,
not a black slab or a stack of decorative color blobs. It is icon-only in every
state. The selected destination gets a quiet translucent plate and a stronger
Duna-navy icon; it does not add a label or change the dock's geometry. Calendar
replaces search. Messages opens the unified chat shell. The center Duna mark is
intentionally smaller than the surrounding target and opens the full-screen
Duna AI copilot. The plus button opens contextual quick actions in a sheet.

On iOS 26+, use Expo UI's native SwiftUI Liquid Glass modifier for the dock.
Keep the center Duna action as a stable React Native layer above that glass so
the brand mark does not depend on nested native compositing. Other iOS versions
and Android use the same React Native layout with a translucent, bordered
fallback. Glass is atmosphere, never the only source of contrast or selection
state.

Sheets own short choices, filters, quick actions, and secondary configuration.
They use a visible handle, one clear title, 50pt option rows, a checked selected
state, and a 60pt primary action when confirmation is needed. Do not put an
entire multi-step workflow into one sheet.

## Player Home

Home uses a true white canvas. Warm tan is an accent under glass or inside a
small identity mark; it is not the page background. The first viewport follows
this hierarchy:

1. Duna wordmark, notification bell, and high-contrast profile avatar.
2. Day and place context, a personal greeting, and one quiet supporting line.
3. One black primary discovery action: `Find your next game`.
4. Three equal quick actions: `Record game`, `Book court`, and `Messages`.
5. One real `Next up` booking drawn from the existing schedule data.
6. A compact `Your game` row for rating and home organization.
7. One contextual Duna Insight that opens Duna AI.

Do not restore dense charts, prediction rails, repeated event stacks, or tan
feature panels to this first viewport. Those capabilities remain reachable
through their existing destinations and handlers. The Home components are a
presentation layer over current runtime data, not a parallel demo model.

## Duna AI and Messages

Duna AI and Messages share a simple chat shell inspired by ordinary messaging
products. A top toggle switches between `Duna AI` and `Messages`. The composer
stays at the bottom. A hamburger opens only the chat-history drawer for the
current AI or message mode; it is not a second app-navigation menu.

Because this shell replaces the bottom dock, a 50pt close control is always
visible at the top right and returns to Player Home. Duna AI keeps its hamburger
at top left. Messages uses that position only for a thread-level Back action;
the inbox puts `New conversation` beside its `Recent chats` heading.

Duna context is always used within the user's permissions. Do not expose a
`Use my Duna context` toggle. Suggested prompts use small line icons and direct
language: `Find a match`, `Find a coach`, `Show my schedule`.

## Video Library

Video Library is a browsing screen, not a marketing hero. Lead with one primary
action, `Record a game`, and one secondary action, `Upload`. Follow with recent
recordings and compact status. Thumbnails carry duration, privacy, and
processing state without covering the image in badges. Filters and sort live in
a sheet.

Empty state explains what happens next: practice starts private, uploads remain
available after leaving the screen, and the user decides what becomes public.

## Record a game

### Step 1: setup

The setup screen answers five questions in order:

1. What is being captured: Practice, Event, Match, or Social?
2. Which event or match owns it?
3. What should the recording be called?
4. What are the four camera essentials: orientation, court, visibility, audio?
5. Are any secondary details different: venue, net height, live visibility, or
   per-video Vision learning consent?

The four essentials are two-column setting tiles with a line icon, uppercase
label, and plain-language value. Tapping one opens a choice sheet. Secondary
details share one `Recording details` sheet. Nothing is removed: the layer
changes how existing form state is edited, not what the typed capture contract
can represent.

The primary action is black on light and reads `Continue to camera guide`.
When disabled, explain the one missing requirement immediately above it.

### Step 2: camera guide

The camera is a dark live surface. The top row has a 50pt close control, a
centered recording/live status with a `00:00:00` tabular timer, and a 50pt
remote control. Before recording, show only the next useful court-alignment
instruction and the evidence checklist. Guidance remains advisory.

During recording:

- the stop action is always visible;
- Favorite, Hide preview, and Remote remain reachable with one hand;
- Hide preview blacks out the display while capture, Watch scoring, and remote
  control continue;
- a hidden preview clearly states that recording is still in progress;
- recording time uses a clock, never a rounded `0m` duration;
- leaving or interruption follows the existing safe-finalization path.

## Translation and migration contract

The redesign must not fork business behavior. Migrate screens through four
shared layers:

1. `@duna/ui/mobile` translates theme, zone, contrast, the five-point grid,
   control sizes, and glass fallbacks.
2. `satoshi-text.tsx` translates legacy native text weights to bundled Satoshi
   faces.
3. `duna-icon.tsx` provides the React Native-safe icon set.
4. Existing typed screen state and API mutations remain authoritative. New UI
   components edit the same state and call the same handlers.

For every migrated screen, inventory every state first: loading, empty, error,
permission denied, offline, selected, active, completed, interrupted, and
recovery. A visual replacement is incomplete if one of those paths becomes
unreachable.

## Implementation order

1. Player Video Library and Record a Game.
2. Player home and contextual quick-action sheet.
3. Glass navigation and Duna AI center action.
4. Unified Duna AI / Messages chat shell.
5. Calendar, plans, profile, and secondary Player screens.
6. Apply the same primitives to Pro, preserving operator-specific information
   density and privacy boundaries.

Each pass must run Player lint, typecheck, tests, the readable-type guard, and a
native bundle export. Camera behavior, orientation, interruption finalization,
and preview hiding still require a physical iPhone before release claims.
