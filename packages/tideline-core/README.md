# @duna/tideline-core

Pure Tideline logic shared by the web component library and the React Native
apps, so a score, a rating ring, a day strip or a light mark means the same
thing on every surface.

- No React, DOM or React Native. No dependencies.
- No clock, network or locale guessing: **time, "now", locale and time zone are
  arguments.** Nothing calls `new Date()` with no argument or `Date.now()`.
- Uses only `Intl.DateTimeFormat` / `Intl.NumberFormat`, which Node, browsers
  and Hermes provide.
- Strict TypeScript, ESM, `sideEffects: false`. The package exports its
  TypeScript source (like the other `@duna/*` packages), which Next.js
  (`transpilePackages`) and Metro both compile.

Design rules and decisions: [`docs/design/tideline-core.md`](../../docs/design/tideline-core.md).

```ts
import { netScoreState } from "@duna/tideline-core"; // or "@duna/tideline-core/score"
```

## Modules

| Subpath        | What it gives you                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------- |
| `/score`       | `netScoreState(match)`: headline, set rows, sets won, winner, label parts, accessible summary     |
| `/rating-ring` | `ratingRingModel`, `ratingRingLayout`, `reliabilityBand`, `RATING_RING_GEOMETRY`                  |
| `/day-strip`   | `dayStrip({ items, timeZone, now })`: days, counts, today, empty days, week and DST flags         |
| `/time-slots`  | `timeSlots(...)`, `DEFAULT_DURATIONS`, duration choices and why a start is unavailable            |
| `/light`       | `sunTimes`, `lightMarkFor`, `dayLineParts`                                                        |
| `/conditions`  | `playCall`, `windOnCourt`, `needsWeatherChip`, `conditionsLine`, `fitConditionsLine`, thresholds  |
| `/map-pins`    | `mapStyleForZoom`, `pinModel`, zoom constants                                                     |
| `/club-mark`   | `monogramFor`, `foregroundFor` (contrast-safe ink), colour maths                                  |
| `/concierge`   | `ThreadContext` union, `threadContextParts`                                                       |
| `/format`      | `formatTime`, `formatTimeRange`, `countdownParts`, `formatCountdown`, `formatMoney`, `moneyParts` |
| `/zoned-time`  | Civil dates and IANA-zone helpers the other modules share                                         |

## Examples

### Score

```ts
const state = netScoreState({
  status: "live",
  sets: [
    { home: 21, away: 18 },
    { home: 17, away: 14 }, // the last set of a live match is in progress
  ],
  serving: "home",
});
state.headline; // { kind: "points", home: 17, away: 14 }
state.setsWon; // { home: 1, away: 0 }
state.liveLabel; // { kind: "live", setNumber: 2, points: { home: 17, away: 14 } }
state.winner; // null: a winner is known only in verified / complete / forfeit
```

Only finished sets count. `not-finished` is a proposed status that is not in
the `match_status` enum yet.

### Rating ring

```ts
const ring = ratingRingModel({
  value: 3.42,
  delta: 0.08,
  reliability: 2,
  locale: "en-US",
});
ring.progress.sweepDeg; // 302.4 degrees clockwise from 12 o'clock (end value)
ring.progressFrom.fraction; // where the arc started, if you animate
ring.band; // three segments, `filled` for the first two
ring.label; // { number: "3.42", chip: { kind: "delta", text: "+0.08", ... } }
```

### Day strip and time slots

```ts
const strip = dayStrip({
  items: bookings.map((b) => ({ startsAt: b.startsAtMs })),
  timeZone: "America/Los_Angeles",
  now: nowMs, // from the caller
});
strip.days[0]; // { date: "2026-11-28", count: 2, isToday: true, isEmpty: false, ... }

const slots = timeSlots({
  availability: {
    openMinute: 480,
    closeMinute: 1320,
    blocks: [{ startMinute: 600, endMinute: 660, reason: "booked" }],
  },
  duration: 90,
  enabledDurations: [60, 90, 120], // default is 60 / 90 / 120 / 180
  locale: "en-US",
});
slots.selectableStarts; // never runs past closing or across a block
slots.slots[0].start.text; // "8:00 AM"
```

### Light and conditions

```ts
const sun = sunTimes(34.0195, -118.4912, { year: 2026, month: 11, day: 28 });
lightMarkFor(nowMs, { sun, courtIsLit: false }); // "daylight" | "golden-hour" | ...

const hour = {
  at: nowMs,
  temperatureC: 21,
  windSpeedKph: 34,
  windFromDeg: 280,
  precipChancePct: 10,
};
playCall(hour); // { call: "caution", reason: "wind", reasons: ["wind"] }
windOnCourt(34, 280, 0); // court runs north-south: wind is across it
fitConditionsLine(conditionsLine(hour, { sunsetAt: sun.sunset }), 2); // keeps the reason and wind
```

### Formatting

```ts
formatTime(ms, { locale: "en-US", timeZone: "America/Los_Angeles" }); // "3:45 PM"
formatCountdown(countdownParts(targetMs, nowMs)); // "in 2h 05m"
formatMoney(4500, { currency: "USD", locale: "en-US" }); // "$45.00"
```

## Tests

`pnpm --filter @duna/tideline-core test` runs Vitest with coverage. Branch
coverage is enforced at 100% for `score`, `light` and `time-slots`.
