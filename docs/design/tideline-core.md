# Tideline core: shared pure logic

Package: [`packages/tideline-core`](../../packages/tideline-core) (`@duna/tideline-core`).
Work package M-F4. Plan: [`docs/plan/mobile.md`](../plan/mobile.md) section 3.
Contract: [`tideline-4.1.1/README.md`](tideline-4.1.1/README.md) (R13, R14, R16),
[`components.md`](tideline-4.1.1/components.md), [`brand-book.md`](tideline-4.1.1/brand-book.md).

The package holds the rules behind components, not the components. Web
(`packages/ui`) and native (`apps/player`, `apps/pro`) render what it returns.
It has no React, DOM, React Native, dependency, clock or network access; "now",
locale and time zone are always arguments.

## Rules as implemented

**Score state (R16).** Only finished sets count. In a live match the last set
is in progress: its points are the headline, sets won are small. A winner is
known only in `verified`, `complete` and `forfeit`; in `pending-verification` it
is provisional (no badge); `disputed`, `cancelled`, `scheduled`, `warmup`,
`live` and `not-finished` have none. Scheduled, warmup and cancelled show no
numbers ("Pending", never `0-0`). Best-of-one shows the set's points as the
headline. Check badge for a winner, trophy for a title match. `not-finished` is
**proposed** and not in the `match_status` enum.

**Rating ring.** Geometry constants from brand book section 4 (r 96 track,
r 84 three-segment band with an 8-unit gap, tick y 2 to 20). The arc is
progress through the half point that ends at the goal (default: next half
point). Returns end values; the 900 ms Rise is the renderer's.

**Time slots.** Wall-clock minutes after the venue's midnight; a start is
offered only if start + duration fits before closing and misses every block.
Unavailable slots are returned with a reason (`in-the-past`, the block's own
reason, or `runs-past-closing`), never hidden.

**Light.** NOAA solar calculator (Meeus). Verified against published values for
Santa Monica, London, New York (spring-forward day), Sydney (fall-back day),
Tromso (69.6 N, with and without polar day / night) and Reykjavik (white
night). The only other sun code in the repo is the private sunrise / sunset
approximation in `packages/api/src/weather.ts`; it can switch to this later.

**Map (R14).** Street map to zoom 16, satellite above 16 (levels 17 to 19).
Pins: dot below 11, icon 11, icon + label from 13, club mark from 15 (clubs
only), individual courts from 18, clusters up to zoom 14.

## Decisions on ambiguous points

| Question                                                                                            | Resolved as                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Golden hour start. The brand sample (Santa Monica, 28 Nov) shows 3:45 PM, 60 minutes before sunset. | Sun 6 degrees above the horizon (about 38 minutes before sunset there, 4:07 PM). `sunTimes(..., { goldenHourElevationDeg })` changes it. **Owner to confirm.**                                    |
| Satellite from which zoom: `mobile.md` says "max zoom minus 3", R14 says 17 to 19.                  | Same thing: satellite when zoom is above `maxZoom - 3` (so 16.1 and up), which keeps fractional zoom consistent.                                                                                  |
| Pin thresholds and what "cluster" means in the ladder.                                              | The renderer says how many pins a cluster holds; clustering is allowed up to zoom 14. Dot / icon / label / mark thresholds are defaults (11 / 13 / 15).                                           |
| Unlit court after sunset.                                                                           | `dark`: the contract has no evening twilight state. Civil dusk is returned separately as "last light" for the day line. A lit court is `under-lights` whenever the sun is down.                   |
| Morning golden hour.                                                                                | Not modelled: the contract names one golden-hour state, used in the evening.                                                                                                                      |
| "Which end is the good side".                                                                       | The end the wind comes from: a player there has the wind at their back. Only given when the wind is mostly along the court (not calm, not a crosswind).                                           |
| Court orientation.                                                                                  | Bearing of the long axis, either direction (0 and 180 are the same court).                                                                                                                        |
| UV and wind direction are not in `WeatherForecastPoint` today.                                      | Both are optional inputs; a missing value never triggers a call, chip or line part.                                                                                                               |
| Week start for the day strip.                                                                       | Parameter, default Sunday (US).                                                                                                                                                                   |
| Daylight-saving days in time slots.                                                                 | Slots use the wall-clock times printed on the venue's clock. The day strip reports the day's real length (1380 / 1500 minutes) so a renderer can warn.                                            |
| Monogram "brand rule".                                                                              | The brand book only says "two-character". Rule: first letter of the first two words (skipping "the / of / and / at / &"), or the first two characters of a single word; letters and numbers only. |
| Weather "play call" wording.                                                                        | Not agreed (README open questions). The code uses good / caution / stop; wording is the renderer's.                                                                                               |

## Default condition thresholds (a club may change them)

| Signal         | Caution      | Stop          |
| -------------- | ------------ | ------------- |
| Sustained wind | 30 km/h      | 50 km/h       |
| Gusts          | 45 km/h      | 65 km/h       |
| Chance of rain | 40 %         | 80 %          |
| Heat           | 32 C         | 38 C          |
| Cold           | 5 C or below | -2 C or below |
| UV index       | 8            | 11            |

A good-weather row still gets a chip from 20 km/h wind. The conditions line
mentions rain from 20 % and UV from 6. Priority when space is short (first
dropped last): reason, wind, temperature, rain, UV, sunset; the reason is never
dropped.

## Existing helpers that should move here later (not moved now)

In `packages/ui/src/tideline`:

- `calendar/date-utils.ts`: `IsoDate`, `parseIsoDate`, `addDays`, `weekdayOf`,
  `daysBetween`, `dayRange`, `isoDateOf`, `parseTime`, `formatTime`,
  `timeSlots` (the older range-based slot list). Overlaps `zoned-time.ts` and
  `time-slots.ts`; it works on ISO strings where this package uses
  `CivilDate`, so migrate callers deliberately. Names `timeSlots` and
  `formatTime` collide in meaning.
- `booking/booking-state.ts`: `formatMoney` (takes cents; replace with
  `moneyParts`) and `formatTimeRange` (takes "HH:MM" strings). The reducer and
  catalogue selectors stay in the UI package.
- `add-players/add-players-logic.ts` and `interactions/interaction-core.ts`
  (delayed loading, async search): pure and framework-free, useful to native,
  so they are candidates once a native consumer needs them.
- `time/day-strip.tsx` keeps rendering; its date math should come from
  `dayStrip`.

Also from the plan, not built here: the drill scene model taken out of
`apps/hq/components/training-court-animation.tsx` and the `TrainingDrill`
contract.

`packages/api/src/weather.ts` (`calculatedSunTime`) should call `sunTimes`.
