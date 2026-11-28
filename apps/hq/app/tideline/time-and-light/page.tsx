import "@duna/ui/tideline/styles.css";
import "@duna/ui/tideline/legacy-bridge.css";

import { buttonClassName, Card, Tideline } from "@duna/ui/tideline";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import styles from "../gallery.module.css";
import { isTidelineGalleryEnabled } from "../gallery-guard";
import {
  ConditionsLines,
  ConditionsPanels,
  DaypartsDemo,
  DayStripDemo,
  DurationDemo,
  LightMarks,
  ScheduleHeader,
  SunArcs,
  TimeRailDemo,
  TimeSlotsDemo,
  TimeSlotsDst,
  TimeSlotsLongest,
  TimeSlotsStates,
  WindDemo,
} from "./examples";
import local from "./time-and-light.module.css";

// Read the flag per request, so one build serves both answers.
export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return {
    title: isTidelineGalleryEnabled()
      ? "Time and light · Tideline gallery"
      : "Not found",
    robots: { index: false, follow: false },
  };
}

const themes = ["light", "dark", "live"] as const;
type GalleryTheme = (typeof themes)[number];

function Example({
  title,
  wide,
  id,
  children,
}: {
  title: string;
  wide?: boolean;
  id?: string;
  children: ReactNode;
}) {
  return (
    <Card
      className={wide ? `${local.card} ${local.wide}` : local.card}
      data-example={id}
    >
      <h3 className="td-heading">{title}</h3>
      {children}
    </Card>
  );
}

/** Every state of the time and conditions families, for review and for the layout tests. */
export default async function TimeAndLightPage({
  searchParams,
}: {
  searchParams: Promise<{ theme?: string; zone?: string }>;
}) {
  if (!isTidelineGalleryEnabled()) notFound();
  const params = await searchParams;
  const theme: GalleryTheme = themes.includes(params.theme as GalleryTheme)
    ? (params.theme as GalleryTheme)
    : "light";

  return (
    <Tideline
      className={styles.page}
      ground
      theme={theme === "dark" ? "dark" : undefined}
      zone={theme === "live" ? "live" : params.zone === "hq" ? "hq" : undefined}
    >
      <header className={styles.top}>
        <a
          className={buttonClassName({ size: "sm", variant: "ghost" })}
          href={`/tideline?theme=${theme}`}
        >
          Tideline gallery
        </a>
        <nav aria-label="Theme" className={styles.themes}>
          {themes.map((name) => (
            <a
              aria-current={name === theme ? "page" : undefined}
              className={buttonClassName({
                size: "sm",
                variant: name === theme ? "secondary" : "ghost",
              })}
              href={`/tideline/time-and-light?theme=${name}`}
              key={name}
            >
              {name === "live"
                ? "Live zone"
                : name === "dark"
                  ? "Dark"
                  : "Light"}
            </a>
          ))}
        </nav>
      </header>
      <main className={local.main} id="time-and-light">
        <div className={local.stack}>
          <h1 className="td-display">Time and light</h1>
          <p className="td-body">
            Santa Monica, Saturday 28 November 2026: sunrise 6:38 AM, golden
            hour from 3:45 PM, sunset 4:45 PM, now 3:10 PM. Windy, hot, cold,
            rain, lightning and night readings are synthetic. Times are on the
            club&rsquo;s clock (Pacific); the &ldquo;away&rdquo; examples assume
            a viewer in New York.
          </p>
        </div>

        <section className={local.section} aria-labelledby="sec-time">
          <h2 className="td-headline" id="sec-time">
            Time
          </h2>
          <div className={local.grid}>
            <Example
              id="daystrip"
              title="DayStrip · counts, today, faded, disabled, month boundary"
              wide
            >
              <DayStripDemo />
            </Example>
            <Example
              id="slots"
              title="TimeSlots · lit court, few left, full, stale"
              wide
            >
              <TimeSlotsDemo />
            </Example>
            <Example id="slots-unlit" title="TimeSlots · unlit court">
              <TimeSlotsDemo lit={false} title="Court 7 · no lights" />
            </Example>
            <Example
              id="slots-longest"
              title="TimeSlots · longest labels, other time zone"
            >
              <TimeSlotsLongest />
            </Example>
            <Example
              id="slots-states"
              title="TimeSlots · loading, empty, indoor"
            >
              <TimeSlotsStates />
            </Example>
            <Example id="slots-dst" title="TimeSlots · daylight-saving days">
              <TimeSlotsDst />
            </Example>
            <Example id="duration" title="DurationCrests">
              <DurationDemo />
            </Example>
            <Example id="dayparts" title="Dayparts">
              <DaypartsDemo />
            </Example>
            <Example
              id="rail"
              title="TimeRail · court day, now, sun, free windows"
            >
              <TimeRailDemo />
            </Example>
            <Example id="rail-dst" title="TimeRail · 25-hour day">
              <TimeRailDemo dst />
            </Example>
          </div>
        </section>

        <section className={local.section} aria-labelledby="sec-conditions">
          <h2 className="td-headline" id="sec-conditions">
            Conditions
          </h2>
          <div className={local.grid}>
            <Example id="schedule" title="Schedule header with ConditionsLine">
              <ScheduleHeader />
            </Example>
            <Example id="lines" title="ConditionsLine · every state" wide>
              <ConditionsLines />
            </Example>
            <Example id="lightmarks" title="LightMark">
              <LightMarks />
            </Example>
            <Example id="wind" title="WindOnCourt · calm, windy, crosswind">
              <WindDemo />
            </Example>
            <Example id="sunarc" title="SunArc · day, golden hour, night" wide>
              <SunArcs />
            </Example>
            <Example id="conditions" title="Conditions · every state" wide>
              <ConditionsPanels />
            </Example>
          </div>
        </section>
      </main>
    </Tideline>
  );
}
