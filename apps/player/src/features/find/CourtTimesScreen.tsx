/**
 * A venue's open court times (M-P1; board P-Book-Court): one Jost title,
 * the day strip, the length, and the start times grouped by daypart with
 * their light marks. Availability refreshes every 30 seconds and when the
 * day or length changes; a time taken while the person was looking turns
 * "just taken" and is never booked (`TimeSlots`' stale-slot behaviour).
 * "Continue" opens checkout (the court checkout sheet: policy, split pay,
 * hosting a match and payment, unchanged).
 */
import {
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { formatMoney } from "@duna/core";
import { report } from "@duna/observability";
import { sunTimes } from "@duna/tideline-core";
import {
  ErrorState,
  LoadingState,
  Text,
  Title,
  useTheme,
} from "@duna/ui/native";
import { DayStrip, DurationCrests, TimeSlots } from "@duna/ui/native/time";
import { useContext, useEffect, useMemo, useState } from "react";
import { usePlayerRuntime } from "../../../runtime";
import { RouteEntryContext, useShell } from "../../app/ShellContext";
import { usePaneEdges } from "../../app/ui";
import type { CourtAvailability, CourtInventory } from "../courts/court-types";
import { isoDate } from "./find-search";
import { ActionButton } from "./parts";

const REFRESH_MS = 30_000;

/** "2026-12-01T18:30:00" or "18:30" → minutes after midnight. Pure. */
export function localMinute(local: string): number | null {
  const match = local.match(/(?:T|^)(\d{2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Courts at each start time: one chip per start, with how many courts are open. */
export function courtSlots(
  availability: Pick<CourtAvailability, "slots">,
): readonly {
  readonly startMinute: number;
  readonly available: boolean;
  readonly remaining: number;
  readonly fromMinor?: number;
  readonly currency?: string;
}[] {
  const byStart = new Map<
    number,
    { remaining: number; fromMinor?: number; currency?: string }
  >();
  for (const slot of availability.slots) {
    const minute = localMinute(slot.localStartsAt);
    if (minute === null) continue;
    const current = byStart.get(minute) ?? { remaining: 0 };
    current.remaining += 1;
    if (slot.price) {
      if (
        current.fromMinor === undefined ||
        slot.price.amountMinor < current.fromMinor
      ) {
        current.fromMinor = slot.price.amountMinor;
        current.currency = slot.price.currency;
      }
    }
    byStart.set(minute, current);
  }
  return [...byStart.entries()]
    .sort(([left], [right]) => left - right)
    .map(([startMinute, value]) => ({
      startMinute,
      available: value.remaining > 0,
      ...value,
    }));
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return isoDate(new Date(year!, month! - 1, day! + days));
}

export function CourtTimesScreen() {
  const entry = useContext(RouteEntryContext);
  const shell = useShell();
  const runtime = usePlayerRuntime();
  const edges = usePaneEdges();
  const { colors, tokens } = useTheme();
  const { fontScale } = useWindowDimensions();
  const venueId = entry?.targetId;
  const client = runtime.publicClient ?? runtime.client;
  const today = isoDate(new Date());
  const [date, setDate] = useState(today);
  const [duration, setDuration] = useState<number | null>(null);
  const [start, setStart] = useState<number | null>(null);
  const [inventory, setInventory] = useState<CourtInventory>();
  const [availability, setAvailability] = useState<CourtAvailability>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!client || !venueId) return;
    let active = true;
    setLoading(true);
    setError(undefined);
    void client.public.courtBookingInventory
      .query({ venueId })
      .then((next) => {
        if (!active) return;
        setInventory(next);
        const options = [
          ...new Set(
            next.courts.flatMap((court) => court.durationOptionsMinutes),
          ),
        ];
        setDuration(
          (current) =>
            current ?? (options.includes(90) ? 90 : (options[0] ?? 60)),
        );
      })
      .catch((reason: unknown) => {
        if (active)
          setError(report(reason, { event: "player.court.inventory_failed" }));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, venueId]);

  // Availability for the day and length, refreshed so a taken time shows.
  useEffect(() => {
    if (!client || !venueId || !inventory || !duration) return;
    let active = true;
    void client.public.courtAvailability
      .query({ venueId, date, durationMinutes: duration })
      .then((next) => {
        if (active) setAvailability(next);
      })
      .catch((reason: unknown) => {
        if (active)
          setError(
            report(reason, { event: "player.court.availability_failed" }),
          );
      });
    const timer = setTimeout(() => setTick((count) => count + 1), REFRESH_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [client, date, duration, inventory, tick, venueId]);

  const durations = useMemo(
    () =>
      [
        ...new Set(
          inventory?.courts.flatMap((court) => court.durationOptionsMinutes) ??
            [],
        ),
      ].sort((left, right) => left - right),
    [inventory],
  );
  const slots = useMemo(
    () => (availability ? courtSlots(availability) : []),
    [availability],
  );
  const venue = inventory?.venue;
  const sun = useMemo(() => {
    if (venue?.latitude === undefined || venue.longitude === undefined)
      return null;
    const [year, month, day] = date.split("-").map(Number);
    return sunTimes(venue.latitude, venue.longitude, {
      year: year!,
      month: month!,
      day: day!,
    });
  }, [date, venue?.latitude, venue?.longitude]);
  const lit = inventory?.courts.some((court) => court.lit) ?? false;
  const chosen = slots.find((slot) => slot.startMinute === start);
  // At the largest text sizes the action scrolls with the times instead of
  // covering half the screen.
  const largeText = fontScale >= 1.6;

  if (!venueId) return null;
  if (loading && !inventory) {
    return (
      <View
        style={[
          styles.fill,
          { backgroundColor: colors.ground, padding: tokens.space["4"] },
        ]}
      >
        <LoadingState label="Loading court times" loading skeleton="card" />
      </View>
    );
  }
  if (error && !inventory) {
    return (
      <View
        style={[
          styles.fill,
          { backgroundColor: colors.ground, padding: tokens.space["4"] },
        ]}
      >
        <ErrorState
          onRetry={() => setTick((count) => count + 1)}
          reference={error}
          text="Check your connection and try again."
          title="Couldn't load courts"
        />
      </View>
    );
  }

  const footer = (
    <View
      style={{
        paddingHorizontal: edges.left + tokens.space["4"],
        paddingTop: tokens.space["3"],
        paddingBottom: edges.bottom + tokens.space["3"],
        borderTopColor: colors.line,
        borderTopWidth: StyleSheet.hairlineWidth,
        backgroundColor: colors.surface,
        gap: tokens.space["1"],
      }}
    >
      {chosen?.fromMinor !== undefined && chosen.currency ? (
        <Text tabular variant="phone-body" weight={600}>
          {`From ${formatMoney(chosen.fromMinor, chosen.currency)} · ${chosen.remaining} court${chosen.remaining === 1 ? "" : "s"} open`}
        </Text>
      ) : null}
      <ActionButton
        disabled={start === null || !duration}
        label={start === null ? "Choose a time to continue" : "Continue"}
        onPress={() => {
          if (!duration) return;
          shell.openCourtBooking({
            venueId,
            date,
            durationMinutes: duration,
          });
        }}
        testID="court-continue"
      />
    </View>
  );

  return (
    <View
      style={[styles.fill, { backgroundColor: colors.ground }]}
      testID="court-times"
    >
      <ScrollView
        contentContainerStyle={{
          paddingTop: tokens.space["4"],
          paddingBottom: edges.bottom + tokens.space["8"],
          paddingLeft: edges.left + tokens.space["4"],
          paddingRight: edges.right + tokens.space["4"],
          gap: tokens.space["4"],
        }}
      >
        <View style={{ gap: tokens.space["1"] }}>
          <Title>{venue?.name ?? "Book a court"}</Title>
          {venue ? (
            <Text tone="text-2" variant="phone-meta">
              {[
                `${venue.city}, ${venue.region}`,
                `${inventory?.courts.length ?? 0} courts`,
                lit ? "lit" : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          ) : null}
        </View>
        <DayStrip
          count={14}
          label="Day"
          onValueChange={(next) => {
            setDate(next);
            setStart(null);
          }}
          start={today}
          today={today}
          value={date}
        />
        {durations.length > 0 ? (
          <DurationCrests
            label="Length"
            onValueChange={(next) => {
              setDuration(next);
              setStart(null);
            }}
            options={durations}
            value={duration}
          />
        ) : null}
        <TimeSlots
          courtIsLit={lit}
          date={date}
          empty={`No open courts on this day. Try ${new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(new Date(`${addDays(date, 1)}T12:00:00`))}.`}
          groupByDaypart
          label="Start time"
          loading={!availability}
          onValueChange={setStart}
          slots={slots}
          sun={sun}
          timeZone={venue?.timezone ?? "UTC"}
          value={start}
        />
        {availability && availability.excludedAfterDarkCount > 0 ? (
          <Text tone="text-2" variant="phone-meta">
            {`${availability.excludedAfterDarkCount} later time${availability.excludedAfterDarkCount === 1 ? " is" : "s are"} hidden because these courts aren't lit after dark.`}
          </Text>
        ) : null}
        {error && inventory ? (
          <ErrorState
            onRetry={() => setTick((count) => count + 1)}
            reference={error}
            title="Times didn't refresh"
          />
        ) : null}
        {largeText ? footer : null}
      </ScrollView>
      {largeText ? null : footer}
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
