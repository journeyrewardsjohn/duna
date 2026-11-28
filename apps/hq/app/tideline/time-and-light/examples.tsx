"use client";

import {
  dayLightMinutes,
  dayStrip,
  fahrenheitToCelsius,
  mphToKph,
  sunTimes,
  timeSlots,
  zonedTimeToInstant,
  type CivilDate,
  type HourlyConditions,
} from "@duna/tideline-core";
import {
  Button,
  Conditions,
  ConditionsLine,
  Dayparts,
  DayStrip,
  DurationCrests,
  LightMark,
  SunArc,
  TimeRail,
  TimeSlots,
  WindOnCourt,
  type TimeSlotItem,
} from "@duna/ui/tideline";
import { useState } from "react";
import styles from "./time-and-light.module.css";

/**
 * Sample data from the brand book: Santa Monica, Saturday 28 November 2026.
 * Sunrise 6:38 AM, golden hour from 3:45 PM, sunset 4:45 PM (computed by
 * `sunTimes`, not typed in). "Now" is fixed at 3:10 PM so the server and the
 * browser render the same page. The windy, hot, cold, rain and night cases
 * are synthetic, labelled as such.
 */
export const ZONE = "America/Los_Angeles";
export const VIEWER_AWAY = "America/New_York";
export const DAY: CivilDate = { year: 2026, month: 11, day: 28 };
export const SANTA_MONICA = { lat: 34.0195, lon: -118.4912 };
export const SUN = sunTimes(SANTA_MONICA.lat, SANTA_MONICA.lon, DAY);
export const NEXT_SUN = sunTimes(SANTA_MONICA.lat, SANTA_MONICA.lon, {
  ...DAY,
  day: 29,
});
export const LIGHT = dayLightMinutes(SUN, DAY, ZONE);
export const at = (minute: number, date: CivilDate = DAY) =>
  zonedTimeToInstant(date, minute, ZONE);
export const NOW = at(15 * 60 + 10);

const f = fahrenheitToCelsius;
const mph = mphToKph;

export const WEATHER = {
  calm: {
    at: at(15 * 60),
    temperatureC: f(68),
    windSpeedKph: mph(9),
    windGustKph: mph(11),
    windFromDeg: 250,
    precipChancePct: 0,
    uvIndex: 3,
  },
  windy: {
    at: at(15 * 60),
    temperatureC: f(64),
    windSpeedKph: mph(22),
    windGustKph: mph(32),
    windFromDeg: 260,
    precipChancePct: 10,
    uvIndex: 3,
  },
  hot: {
    at: at(14 * 60),
    temperatureC: f(101),
    windSpeedKph: mph(5),
    windFromDeg: 200,
    precipChancePct: 0,
    uvIndex: 9,
  },
  cold: {
    at: at(8 * 60),
    temperatureC: f(38),
    windSpeedKph: mph(7),
    windFromDeg: 20,
    precipChancePct: 10,
    uvIndex: 1,
  },
  rain: {
    at: at(15 * 60),
    temperatureC: f(58),
    windSpeedKph: mph(13),
    windGustKph: mph(19),
    windFromDeg: 200,
    precipChancePct: 85,
    uvIndex: 1,
  },
  night: {
    at: at(19 * 60 + 30),
    temperatureC: f(57),
    windSpeedKph: mph(4),
    windFromDeg: 90,
    precipChancePct: 0,
    uvIndex: 0,
  },
} satisfies Record<string, HourlyConditions>;

export const HOURLY: HourlyConditions[] = [15, 16, 17, 18, 19, 20].map(
  (h, i) => ({
    at: at(h * 60),
    temperatureC: f(67 - i),
    windSpeedKph: mph([14, 10, 9, 7, 6, 5][i] ?? 5),
  }),
);

/** Court 3 runs along the beach, its west end towards the ocean. */
export const COURT = {
  axisDeg: 270,
  endNames: { W: "Ocean end", E: "Street end" },
} as const;

// ---------- Time ----------

export function DayStripDemo({ start = DAY }: { start?: CivilDate }) {
  const now = zonedTimeToInstant(start, 15 * 60, ZONE);
  const strip = dayStrip({
    items: [3, 5, 8, 6, 0, 2, 4, 5, 7, 9].flatMap((count, day) =>
      Array.from({ length: count }, () => ({
        startsAt: now + day * 86_400_000,
      })),
    ),
    timeZone: ZONE,
    now,
    days: 10,
  });
  // A day with no games is faded (nothing to book); the ninth is outside the window.
  const days = strip.days.map((day, index) =>
    index === 8
      ? { ...day, disabled: true }
      : day.isEmpty
        ? { ...day, faded: true }
        : day,
  );
  const [value, setValue] = useState<string | null>(
    strip.days[0]?.date ?? null,
  );
  return (
    <div className={styles.stack}>
      <DayStrip
        aria-label="Day"
        caption="Faded days have no games. The ninth day is outside the booking window."
        days={days}
        onValueChange={setValue}
        value={value}
      />
      <p className="td-meta" data-testid="daystrip-value">
        Day: {value ?? "none"}
      </p>
    </div>
  );
}

function slotsFor(
  open: number,
  close: number,
  blocks: Parameters<typeof timeSlots>[0]["availability"]["blocks"],
  nowMinute?: number,
): TimeSlotItem[] {
  return timeSlots({
    availability: { openMinute: open, closeMinute: close, blocks, nowMinute },
    duration: 60,
    locale: "en-US",
  }).slots.map((slot) => ({ ...slot }));
}

export function TimeSlotsDemo({
  lit = true,
  title = "Court 3 · lit",
}: {
  lit?: boolean;
  title?: string;
}) {
  const base = slotsFor(
    9 * 60,
    23 * 60 + 30,
    [
      { startMinute: 11 * 60, endMinute: 12 * 60, reason: "booked" },
      { startMinute: 17 * 60 + 30, endMinute: 18 * 60 + 30, reason: "booked" },
    ],
    9 * 60 + 30,
  ).map((slot) =>
    slot.startMinute === 15 * 60 + 30
      ? { ...slot, remaining: 1 }
      : slot.startMinute === 19 * 60
        ? { ...slot, remaining: 2 }
        : slot,
  );
  const [slots, setSlots] = useState(base);
  const [value, setValue] = useState<number | null>(16 * 60);
  const [lost, setLost] = useState<string>("");
  const taken =
    slots.find((s) => s.startMinute === 16 * 60)?.available === false;
  return (
    <div className={styles.stack}>
      <TimeSlots
        courtIsLit={lit}
        date={DAY}
        label={`${title} start times`}
        onStale={(starts) => setLost(starts.join(","))}
        onValueChange={setValue}
        slots={slots}
        sun={SUN}
        timeZone={ZONE}
        title={title}
        value={value}
      />
      <div className={styles.row}>
        <Button
          onClick={() =>
            setSlots((current) =>
              current.map((s) =>
                s.startMinute === 16 * 60
                  ? { ...s, available: false, reason: "booked" }
                  : s,
              ),
            )
          }
          disabled={taken}
          size="sm"
          variant="secondary"
        >
          Someone else books 4:00 PM
        </Button>
        <Button
          onClick={() => {
            setSlots(base);
            setLost("");
            setValue(16 * 60);
          }}
          size="sm"
          variant="ghost"
        >
          Reset
        </Button>
      </div>
      <p className="td-meta" data-testid="slot-value">
        Start: {value ?? "none"}
        {lost ? ` · just taken: ${lost}` : ""}
      </p>
    </div>
  );
}

export function TimeSlotsLongest() {
  // Every chip carries a mark (golden hour or under lights), and the longest
  // labels: "10:30 PM", "11:45 PM".
  const slots: TimeSlotItem[] = [
    15 * 60 + 45,
    16 * 60,
    16 * 60 + 30,
    20 * 60 + 30,
    22 * 60 + 30,
    23 * 60 + 45,
  ].map((startMinute) => ({ startMinute, available: true }));
  return (
    <TimeSlots
      date={DAY}
      defaultValue={22 * 60 + 30}
      label="Longest labels"
      slots={slots}
      sun={SUN}
      timeZone={ZONE}
      title="Longest labels"
      viewerTimeZone={VIEWER_AWAY}
    />
  );
}

export function TimeSlotsStates() {
  const [loading, setLoading] = useState(true);
  return (
    <div className={styles.stack}>
      <TimeSlots
        date={DAY}
        label="Loading start times"
        loading={loading}
        slots={[]}
        timeZone={ZONE}
        title="Loading"
      />
      <Button onClick={() => setLoading((l) => !l)} size="sm" variant="ghost">
        {loading ? "Finish loading" : "Load again"}
      </Button>
      <TimeSlots
        date={DAY}
        empty={
          <span>
            Nothing open on Sunday. <a href="#time-and-light">Try Monday</a>
          </span>
        }
        label="Sunday start times"
        slots={[]}
        timeZone={ZONE}
        title="Sunday, Nov 29 · empty day"
      />
      <TimeSlots
        date={DAY}
        label="Indoor start times"
        slots={slotsFor(6 * 60, 9 * 60, [
          { startMinute: 7 * 60, endMinute: 8 * 60, reason: "maintenance" },
        ])}
        timeZone={ZONE}
        title="Indoor (no light marks)"
      />
    </div>
  );
}

export function TimeSlotsDst() {
  const spring = { year: 2026, month: 3, day: 8 };
  const fall = { year: 2026, month: 11, day: 1 };
  const springSun = sunTimes(SANTA_MONICA.lat, SANTA_MONICA.lon, spring);
  const fallSun = sunTimes(SANTA_MONICA.lat, SANTA_MONICA.lon, fall);
  return (
    <div className={styles.stack}>
      <TimeSlots
        date={spring}
        label="Spring forward start times"
        slots={slotsFor(17 * 60, 20 * 60, [])}
        sun={springSun}
        timeZone={ZONE}
        title="Sunday, Mar 8 · 23-hour day"
      />
      <TimeSlots
        date={fall}
        label="Fall back start times"
        slots={slotsFor(16 * 60, 19 * 60, [])}
        sun={fallSun}
        timeZone={ZONE}
        title="Sunday, Nov 1 · 25-hour day"
      />
    </div>
  );
}

export function TimeRailDemo({ dst = false }: { dst?: boolean }) {
  if (dst) {
    const fall = { year: 2026, month: 11, day: 1 };
    return (
      <TimeRail
        date={fall}
        endMinute={8 * 60}
        events={[
          {
            id: "early",
            startMinute: 6 * 60,
            endMinute: 7 * 60,
            title: "Sunrise session",
          },
        ]}
        hourHeight={40}
        label="Court 1, Sunday 1 November"
        startMinute={0}
        sun={sunTimes(SANTA_MONICA.lat, SANTA_MONICA.lon, fall)}
        timeZone={ZONE}
      />
    );
  }
  return (
    <TimeRail
      date={DAY}
      endMinute={22 * 60}
      events={[
        {
          id: "m1",
          startMinute: 7 * 60,
          endMinute: 9 * 60,
          title: "Maintenance",
          meta: "Sand grooming",
          kind: "blocked",
        },
        {
          id: "l1",
          startMinute: 9 * 60 + 30,
          endMinute: 11 * 60,
          title: "Private lesson",
          meta: "Theo Park",
          kind: "lesson",
        },
        {
          id: "c1",
          startMinute: 10 * 60 + 30,
          endMinute: 12 * 60,
          title: "Junior clinic",
          meta: "5 of 8",
          kind: "lesson",
        },
        {
          id: "e1",
          startMinute: 13 * 60,
          endMinute: 15 * 60,
          title: "Court hire",
          meta: "Mara Lewis",
        },
        {
          id: "e2",
          startMinute: 16 * 60 + 30,
          endMinute: 18 * 60,
          title: "Group clinic",
          meta: "7 of 9",
          kind: "event",
        },
      ]}
      label="Court 3, Saturday 28 November"
      now={NOW}
      onSelectFree={() => {}}
      startMinute={6 * 60}
      sun={SUN}
      timeZone={ZONE}
      viewerTimeZone={VIEWER_AWAY}
    />
  );
}

export function DurationDemo() {
  const [value, setValue] = useState<number | null>(90);
  return (
    <div className={styles.stack}>
      <DurationCrests
        label="Booking length"
        onValueChange={setValue}
        options={[60, 90, 120, 180]}
        value={value}
      />
      <DurationCrests
        label="Booking length, two hours sold out"
        notes={{ 60: "Quick game", 90: "Best of three", 120: "Full session" }}
        options={[60, 90, 120]}
        unavailable={[120]}
        defaultValue={60}
      />
      <DurationCrests
        defaultValue={90}
        label="Booking length, large"
        size="lg"
      />
      <p className="td-meta" data-testid="duration-value">
        Length: {value ?? "none"}
      </p>
    </div>
  );
}

export function DaypartsDemo() {
  return (
    <Dayparts
      courtIsLit
      defaultValue={["golden-hour", "evening"]}
      label="When do you play?"
      light={LIGHT}
    />
  );
}

// ---------- Conditions ----------

export function LightMarks() {
  return (
    <div className={styles.stack}>
      <div className={styles.row}>
        <LightMark state="first-light" time="6:38 AM" />
        <LightMark state="full-sun" label="Midday" />
        <LightMark state="golden-hour" time="3:45 PM" />
        <LightMark state="under-lights" time="4:45 PM" />
        <LightMark state="too-dark" label="Too dark" />
      </div>
      <div className={styles.row}>
        <LightMark state="golden-hour" variant="chip" />
        <LightMark state="under-lights" variant="chip" />
        <LightMark state="dark" variant="chip" />
        <LightMark state="golden-hour" variant="glyph" />
      </div>
    </div>
  );
}

export function SunArcs() {
  return (
    <div className={styles.columns}>
      <SunArc now={NOW} sun={SUN} timeZone={ZONE} />
      <SunArc now={at(16 * 60 + 5)} sun={SUN} timeZone={ZONE} />
      <SunArc
        nextSunrise={NEXT_SUN.sunrise}
        now={at(19 * 60 + 30)}
        sun={SUN}
        timeZone={ZONE}
      />
    </div>
  );
}

export function WindDemo() {
  return (
    <div className={styles.stack}>
      <WindOnCourt
        courtAxisDeg={COURT.axisDeg}
        endNames={COURT.endNames}
        gustKph={WEATHER.calm.windGustKph}
        speedKph={WEATHER.calm.windSpeedKph}
        windFromDeg={WEATHER.calm.windFromDeg}
      />
      <WindOnCourt
        courtAxisDeg={COURT.axisDeg}
        endNames={COURT.endNames}
        gustKph={WEATHER.windy.windGustKph}
        speedKph={WEATHER.windy.windSpeedKph}
        windFromDeg={WEATHER.windy.windFromDeg}
      />
      <WindOnCourt
        courtAxisDeg={COURT.axisDeg}
        endNames={COURT.endNames}
        speedKph={mph(13)}
        windFromDeg={0}
      />
    </div>
  );
}

export function ConditionsPanels() {
  return (
    <div className={styles.columns}>
      <Conditions
        callText="Light onshore wind and dry sand."
        conditions={WEATHER.calm}
        court={COURT}
        credit="Weather: example data"
        feelsLikeC={f(66)}
        hourly={HOURLY}
        label="Conditions, Santa Monica"
        now={NOW}
        readAt={NOW - 12 * 60_000}
        sky="Clear"
        sun={SUN}
        timeZone={ZONE}
      />
      <Conditions
        conditions={WEATHER.windy}
        label="Windy (synthetic)"
        now={NOW}
        readAt={NOW - 125 * 60_000}
        sky="Clear"
        sun={SUN}
        timeZone={ZONE}
      />
      <Conditions
        conditions={WEATHER.rain}
        label="Rain (synthetic)"
        sky="Rain"
        timeZone={ZONE}
      />
      <Conditions
        call="stop"
        conditions={WEATHER.calm}
        label="Lightning (synthetic)"
        reason="Lightning 8 mi away"
        callText="Play is paused."
        timeZone={ZONE}
      />
      <Conditions label="Loading" status="loading" timeZone={ZONE} />
      <Conditions label="No data" status="no-data" timeZone={ZONE} />
      <Conditions
        label="Not configured"
        status="not-configured"
        timeZone={ZONE}
      />
    </div>
  );
}

const LINE_CASES: Array<{
  name: string;
  props: Parameters<typeof ConditionsLine>[0];
}> = [
  {
    name: "Santa Monica",
    props: {
      conditions: WEATHER.calm,
      now: NOW,
      readAt: NOW - 10 * 60_000,
      sun: SUN,
      courtIsLit: true,
      timeZone: ZONE,
    },
  },
  {
    name: "Windy (synthetic)",
    props: { conditions: WEATHER.windy, now: NOW, sun: SUN, timeZone: ZONE },
  },
  {
    name: "Hot (synthetic)",
    props: { conditions: WEATHER.hot, sun: SUN, timeZone: ZONE },
  },
  {
    name: "Cold (synthetic)",
    props: { conditions: WEATHER.cold, sun: SUN, timeZone: ZONE },
  },
  {
    name: "Rain (synthetic)",
    props: { conditions: WEATHER.rain, sun: SUN, timeZone: ZONE },
  },
  {
    name: "Night (synthetic)",
    props: {
      conditions: WEATHER.night,
      sun: SUN,
      courtIsLit: true,
      timeZone: ZONE,
    },
  },
  {
    name: "Lightning (synthetic)",
    props: {
      conditions: WEATHER.calm,
      call: "stop",
      reason: "Lightning 8 mi away",
      sun: SUN,
      timeZone: ZONE,
    },
  },
  {
    name: "Stale",
    props: {
      conditions: WEATHER.calm,
      now: NOW,
      readAt: NOW - 125 * 60_000,
      sun: SUN,
      timeZone: ZONE,
    },
  },
  { name: "Loading", props: { status: "loading", timeZone: ZONE } },
  { name: "No data", props: { status: "no-data", timeZone: ZONE } },
  {
    name: "Not configured",
    props: { status: "not-configured", timeZone: ZONE },
  },
];

export function ConditionsLines() {
  return (
    <ul className={styles.lines}>
      {LINE_CASES.map(({ name, props }) => (
        <li data-testid="condline-case" key={name}>
          <span className="td-meta">{name}</span>
          <ConditionsLine
            {...props}
            panel={
              props.conditions ? (
                <Conditions
                  call={props.call}
                  conditions={props.conditions}
                  court={COURT}
                  now={props.now ?? NOW}
                  readAt={props.readAt}
                  reason={props.reason}
                  sky="Clear"
                  sun={SUN}
                  timeZone={ZONE}
                />
              ) : undefined
            }
            panelTitle={`Conditions · ${name}`}
          />
        </li>
      ))}
    </ul>
  );
}

/** A schedule header and list rows, as on the coach's schedule. */
export function ScheduleHeader() {
  return (
    <div className={styles.schedule}>
      <div className={styles.scheduleHead}>
        <b>Saturday, Nov 28</b>
        <span className="td-meta">4 on your day</span>
      </div>
      <ConditionsLine
        conditions={WEATHER.calm}
        courtIsLit
        now={NOW}
        panel={
          <Conditions
            conditions={WEATHER.calm}
            court={COURT}
            hourly={HOURLY}
            now={NOW}
            sky="Clear"
            sun={SUN}
            timeZone={ZONE}
          />
        }
        panelTitle="Conditions · Sat, Nov 28"
        sun={SUN}
        timeZone={ZONE}
      />
      {(
        [
          {
            time: "4:30 PM",
            title: "Group clinic · Serve receive",
            light: "golden-hour",
          },
          {
            time: "6:00 PM",
            title: "Private · Noa Williams",
            light: "under-lights",
          },
        ] as const
      ).map(({ time, title, light }) => (
        <div className={styles.scheduleRow} key={time}>
          <span className={styles.scheduleTime}>
            <b>{time}</b>
            <LightMark state={light} variant="glyph" />
          </span>
          <span>{title}</span>
        </div>
      ))}
    </div>
  );
}
