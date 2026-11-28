/**
 * Pick a time and a court (M-P3, step one of "Book a court"; owner feedback
 * image 37). One picker for the court-times screen and the flow's first
 * step, so the choice is made once and carried forward:
 *
 * - the day strip (the venue's whole booking window, with the days already
 *   in the person's plans counted), the length, the conditions for the
 *   chosen time from the design system's `ConditionsLine` (no emoji sun);
 * - the start times by daypart with their light marks (`TimeSlots`;
 *   refreshed every 30 seconds, a time taken meanwhile turns "just taken");
 * - the courts open at that time, each with its list price, to choose one;
 * - open matches at that time (people with avatars and open seats) to join;
 * - "I'm looking to play" and a priority alert when nothing suits.
 */
import { Pressable, StyleSheet, View } from "react-native";
import { formatMoney } from "@duna/core";
import { report } from "@duna/observability";
import { sunTimes } from "@duna/tideline-core";
import {
  ErrorState,
  Icon,
  Rally,
  Text,
  useHaptics,
  useTheme,
} from "@duna/ui/native";
import { ConditionsLine } from "@duna/ui/native/conditions";
import { DayStrip, DurationCrests, TimeSlots } from "@duna/ui/native/time";
import * as Crypto from "expo-crypto";
import { useEffect, useMemo, useState } from "react";
import { usePlayerRuntime } from "../../../../runtime";
import { PersonAvatar } from "../../../shared/PersonAvatar";
import type {
  CourtAvailability,
  CourtInventory,
} from "../../courts/court-types";
import { ActionRow, SectionLabel } from "./parts";
import {
  conditionsAt,
  courtSlots,
  localMinute,
  localStart,
  openMatchesAt,
  slotsAt,
} from "./court-times";
import type { CourtSelection } from "./court-flow";
import { useCourtAvailability } from "./use-court-data";

/** "YYYY-MM-DD" of an instant in a zone. Pure. */
export function dateInZone(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
  return parts.slice(0, 10);
}

export function todayIn(timeZone: string | undefined): string {
  return dateInZone(new Date().toISOString(), timeZone ?? "UTC");
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year!, month! - 1, day! + days));
  return next.toISOString().slice(0, 10);
}

export function CourtTimePicker({
  inventory,
  selection,
  onDate,
  onDuration,
  onTime,
  onCourt,
  onOpenMatch,
}: {
  readonly inventory: CourtInventory;
  readonly selection: CourtSelection;
  readonly onDate: (date: string) => void;
  readonly onDuration: (minutes: number) => void;
  readonly onTime: (
    localStartsAt: string,
    openCourtIds: readonly string[],
  ) => void;
  readonly onCourt: (courtId: string) => void;
  readonly onOpenMatch?: (matchId: string, matchSlug: string) => void;
}) {
  const runtime = usePlayerRuntime();
  const haptics = useHaptics();
  const { colors, tokens } = useTheme();
  const venue = inventory.venue;
  const today = todayIn(venue.timezone);
  const { availability, error, refresh } = useCourtAvailability({
    venueId: venue.id,
    date: selection.date,
    durationMinutes: selection.durationMinutes,
    enabled: true,
  });

  const durations = useMemo(
    () =>
      [
        ...new Set(
          inventory.courts.flatMap((court) => court.durationOptionsMinutes),
        ),
      ].sort((left, right) => left - right),
    [inventory],
  );
  const windowDays = Math.min(
    90,
    Math.max(14, ...inventory.courts.map((court) => court.maximumAdvanceDays)),
  );
  const planCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const booking of runtime.dashboard?.bookings ?? []) {
      const day = dateInZone(booking.startsAt, venue.timezone);
      counts.set(day, (counts.get(day) ?? 0) + 1);
    }
    return counts;
  }, [runtime.dashboard?.bookings, venue.timezone]);
  const days = useMemo(
    () =>
      Array.from({ length: windowDays }, (_, index) => {
        const date = addDays(today, index);
        const count = planCounts.get(date);
        return {
          date,
          isToday: index === 0,
          ...(count ? { count } : {}),
        };
      }),
    [planCounts, today, windowDays],
  );

  const slots = useMemo(
    () => (availability ? courtSlots(availability) : []),
    [availability],
  );
  const startMinute = selection.localStartsAt
    ? localMinute(selection.localStartsAt)
    : null;
  const courtsNow = slotsAt(availability, startMinute);
  const matchesNow = openMatchesAt(availability, startMinute);
  const chosenSlot =
    courtsNow.find((slot) => slot.courtId === selection.courtId) ??
    courtsNow[0];
  const lit = inventory.courts.some((court) => court.lit);
  const sun = useMemo(() => {
    if (venue.latitude === undefined || venue.longitude === undefined)
      return null;
    const [year, month, day] = selection.date.split("-").map(Number);
    return sunTimes(venue.latitude, venue.longitude, {
      year: year!,
      month: month!,
      day: day!,
    });
  }, [selection.date, venue.latitude, venue.longitude]);
  // Before a time is chosen, the day's first open time stands in.
  const conditions = conditionsAt(
    availability,
    chosenSlot ?? availability?.slots[0],
  );

  return (
    <View style={{ gap: tokens.space["5"] }} testID="court-time-picker">
      <DayStrip
        countLabel={(count) => `${count} in your plans`}
        days={days}
        label="Day"
        onValueChange={onDate}
        today={today}
        value={selection.date}
      />
      {durations.length > 1 ? (
        <DurationCrests
          label="Length"
          onValueChange={onDuration}
          options={durations}
          value={selection.durationMinutes}
        />
      ) : null}
      <ConditionsLine
        conditions={conditions ?? null}
        courtIsLit={lit}
        readAt={
          availability?.forecast
            ? Date.parse(availability.forecast.updatedAt)
            : undefined
        }
        now={Date.now()}
        status={
          !availability
            ? "loading"
            : conditions
              ? "ready"
              : availability.forecast
                ? "no-data"
                : "not-configured"
        }
        sun={sun}
        timeZone={venue.timezone}
      />
      <TimeSlots
        courtIsLit={lit}
        date={selection.date}
        empty={`No open courts on this day. Try ${new Intl.DateTimeFormat(
          "en-US",
          {
            weekday: "long",
            timeZone: "UTC",
          },
        ).format(new Date(`${addDays(selection.date, 1)}T12:00:00Z`))}.`}
        groupByDaypart
        label="Start time"
        loading={!availability && !error}
        onStale={() => haptics.refused()}
        onValueChange={(minute) => {
          if (minute === null) return;
          const open = slotsAt(availability, minute).map(
            (slot) => slot.courtId,
          );
          onTime(localStart(selection.date, minute), open);
        }}
        slots={slots}
        sun={sun}
        timeZone={venue.timezone}
        value={startMinute}
      />
      {availability && availability.excludedAfterDarkCount > 0 ? (
        <View style={[styles.row, { gap: tokens.space["2"] }]}>
          <Icon color={colors["text-2"]} name="too-dark" size="inline" />
          <Text style={styles.fill} tone="text-2" variant="phone-meta">
            {`${availability.excludedAfterDarkCount} later time${availability.excludedAfterDarkCount === 1 ? " is" : "s are"} hidden because these courts aren't lit after dark.`}
          </Text>
        </View>
      ) : null}
      {error ? (
        <ErrorState
          onRetry={refresh}
          reference={error}
          text="Check your connection and try again."
          title="Times didn't refresh"
        />
      ) : null}

      {courtsNow.length > 0 ? (
        <View style={{ gap: tokens.space["2"] }}>
          <SectionLabel>
            {matchesNow.length
              ? "Or reserve your own court"
              : "Choose your court"}
          </SectionLabel>
          <Rally trigger={selection.localStartsAt}>
            {courtsNow.map((slot) => {
              const court = inventory.courts.find(
                (entry) => entry.id === slot.courtId,
              );
              const selected = slot.courtId === selection.courtId;
              const price = slot.price
                ? formatMoney(slot.price.amountMinor, slot.price.currency)
                : "Free";
              return (
                <Pressable
                  accessibilityHint="Your own price, with any member rate, comes next"
                  accessibilityLabel={`${slot.courtName}, ${price}${court?.lit ? ", lit" : ""}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  key={slot.courtId}
                  onPress={() => {
                    haptics.selection();
                    onCourt(slot.courtId);
                  }}
                  style={({ pressed }) => [
                    styles.court,
                    {
                      gap: tokens.space["3"],
                      padding: tokens.space["3"],
                      marginBottom: tokens.space["2"],
                      borderRadius: tokens.radius.xl,
                      borderWidth: selected ? 2 : StyleSheet.hairlineWidth,
                      borderColor: selected ? colors.action : colors.line,
                      backgroundColor: selected
                        ? colors["surface-raised"]
                        : colors.surface,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                  testID={`court-choice-${slot.courtName}`}
                >
                  <View
                    style={[
                      styles.courtMark,
                      {
                        backgroundColor: selected
                          ? colors.action
                          : colors["surface-sunken"],
                        borderRadius: tokens.radius.lg,
                      },
                    ]}
                  >
                    <Icon
                      color={selected ? colors["on-action"] : colors.text}
                      name={court?.lit ? "lit-court" : "court"}
                      size="control"
                    />
                  </View>
                  <View style={styles.fill}>
                    <Text variant="phone-body" weight={600}>
                      {slot.courtName}
                    </Text>
                    <Text tone="text-2" variant="phone-meta">
                      {[
                        court?.surface,
                        court?.lit ? "Lit" : null,
                        `${selection.durationMinutes} min`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  </View>
                  <Text tabular variant="phone-body" weight={600}>
                    {price}
                  </Text>
                  <Icon
                    color={selected ? colors.action : colors["line-strong"]}
                    name={selected ? "success" : "plus"}
                    size="control"
                  />
                </Pressable>
              );
            })}
          </Rally>
        </View>
      ) : null}

      {matchesNow.length > 0 ? (
        <View style={{ gap: tokens.space["2"] }}>
          <SectionLabel>Join a match at this time</SectionLabel>
          {matchesNow.map((match) => (
            <OpenMatchCard
              alreadyIn={Boolean(
                runtime.dashboard?.player.id &&
                [match.host, ...match.attendees].some(
                  (player) => player.id === runtime.dashboard?.player.id,
                ),
              )}
              key={match.id}
              match={match}
              onJoin={
                onOpenMatch
                  ? () => onOpenMatch(match.id, match.slug)
                  : undefined
              }
            />
          ))}
        </View>
      ) : null}

      {selection.localStartsAt ? (
        <LookingToPlay
          availability={availability}
          localStartsAt={selection.localStartsAt}
          venueId={venue.id}
        />
      ) : null}
      <PriorityAlert
        date={selection.date}
        durationMinutes={selection.durationMinutes}
        venueId={venue.id}
      />
    </View>
  );
}

function OpenMatchCard({
  match,
  alreadyIn,
  onJoin,
}: {
  readonly match: CourtAvailability["openMatches"][number];
  readonly alreadyIn: boolean;
  readonly onJoin?: () => void;
}) {
  const { colors, tokens } = useTheme();
  const haptics = useHaptics();
  const roster = [
    match.host,
    ...match.attendees.filter((player) => player.id !== match.host.id),
  ];
  const minutes = Math.round(
    (Date.parse(match.endsAt) - Date.parse(match.startsAt)) / 60_000,
  );
  return (
    <View
      style={{
        gap: tokens.space["3"],
        padding: tokens.space["4"],
        borderRadius: tokens.radius.xl,
        backgroundColor: colors.surface,
        borderColor: colors.line,
        borderWidth: StyleSheet.hairlineWidth,
      }}
    >
      <View style={[styles.row, { gap: tokens.space["3"] }]}>
        <View style={styles.fill}>
          <Text variant="phone-body" weight={600}>
            {match.title}
          </Text>
          <Text tone="text-2" variant="phone-meta">
            {`${match.matchType === "competitive" ? "Competitive" : "Casual"} · ${match.format} · ${minutes} min · hosted by ${match.host.displayName}`}
          </Text>
        </View>
        <Text tabular variant="phone-body" weight={600}>
          {match.price.amountMinor
            ? formatMoney(match.price.amountMinor, match.price.currency)
            : "Free"}
        </Text>
      </View>
      <View style={[styles.row, { gap: tokens.space["2"], flexWrap: "wrap" }]}>
        {roster.slice(0, 6).map((player) => (
          <PersonAvatar
            key={player.id}
            label={player.displayName}
            name={player.displayName}
            photoUrl={player.avatarUrl}
            size={36}
          />
        ))}
        {Array.from(
          { length: Math.min(3, match.spotsRemaining) },
          (_, index) => (
            <View
              key={`open-${index}`}
              style={[
                styles.openDot,
                {
                  borderColor: colors["line-strong"],
                  backgroundColor: colors["surface-sunken"],
                },
              ]}
            >
              <Icon color={colors["text-2"]} name="plus" size="chip" />
            </View>
          ),
        )}
        <Text tone="text-2" variant="phone-meta">
          {`${match.spotsRemaining} open`}
        </Text>
      </View>
      {onJoin ? (
        <Pressable
          accessibilityLabel={
            alreadyIn ? "You're already in this match" : `Join ${match.title}`
          }
          accessibilityRole="button"
          accessibilityState={{ disabled: alreadyIn }}
          disabled={alreadyIn}
          onPress={() => {
            haptics.selection();
            onJoin();
          }}
          style={({ pressed }) => [
            styles.join,
            {
              borderRadius: tokens.radius.lg,
              backgroundColor: alreadyIn
                ? colors["action-disabled"]
                : colors.action,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Text
            style={{
              color: alreadyIn ? colors["text-disabled"] : colors["on-action"],
            }}
            variant="phone-body"
            weight={600}
          >
            {alreadyIn ? "You're in" : "Join this match"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Visible to match creators for this time, without reserving or paying. */
function LookingToPlay({
  venueId,
  localStartsAt,
  availability,
}: {
  readonly venueId: string;
  readonly localStartsAt: string;
  readonly availability?: CourtAvailability;
}) {
  const runtime = usePlayerRuntime();
  const haptics = useHaptics();
  const client = runtime.mode === "live" ? runtime.client : undefined;
  const minute = localMinute(localStartsAt);
  const window =
    openMatchesAt(availability, minute)[0] ?? slotsAt(availability, minute)[0];
  const [postId, setPostId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string>();

  useEffect(() => {
    if (!client || !window) {
      setPostId(undefined);
      return;
    }
    let active = true;
    void client.player.matchAvailability
      .query()
      .then((posts) => {
        if (!active) return;
        setPostId(
          posts.find(
            (post) =>
              post.venueId === venueId &&
              post.startsAt === window.startsAt &&
              post.endsAt === window.endsAt,
          )?.id,
        );
      })
      .catch(() => {
        if (active) setPostId(undefined);
      });
    return () => {
      active = false;
    };
  }, [client, venueId, window?.endsAt, window?.startsAt]);

  if (!window) return null;
  return (
    <View>
      <ActionRow
        detail={
          note ??
          (client
            ? postId
              ? "Match creators can invite you for this time. Tap to stop."
              : "Let match creators invite you for this time. Nothing is booked or charged."
            : "Sign in to let match creators invite you.")
        }
        disabled={!client || busy}
        icon={postId ? "success" : "partner"}
        onPress={() => {
          if (!client) return;
          setBusy(true);
          const request = postId
            ? client.player.cancelMatchAvailability
                .mutate({ postId, idempotencyKey: Crypto.randomUUID() })
                .then(() => {
                  setPostId(undefined);
                  setNote(
                    "You're no longer shown as looking to play at this time.",
                  );
                })
            : client.player.createMatchAvailability
                .mutate({
                  venueId,
                  startsAt: window.startsAt,
                  endsAt: window.endsAt,
                  matchType: "either",
                  genderPreference: "open",
                  formatPreferences: [],
                  note: "Open to an invitation for this time.",
                  idempotencyKey: Crypto.randomUUID(),
                })
                .then((post) => {
                  setPostId(post.id);
                  haptics.confirmed(1);
                  setNote(
                    "You're visible to match creators. You choose whether to accept.",
                  );
                });
          void request
            .catch((reason: unknown) => {
              haptics.refused();
              setNote(
                `That didn't go through. Reference ${report(reason, { event: "player.court.looking_failed" })}.`,
              );
            })
            .finally(() => setBusy(false));
        }}
        selected={Boolean(postId)}
        testID="looking-to-play"
        title={postId ? "You're looking to play" : "I'm looking to play"}
      />
    </View>
  );
}

/** Watch cancellations and new courts for this day and length. */
function PriorityAlert({
  venueId,
  date,
  durationMinutes,
}: {
  readonly venueId: string;
  readonly date: string;
  readonly durationMinutes: number;
}) {
  const runtime = usePlayerRuntime();
  const haptics = useHaptics();
  const client = runtime.mode === "live" ? runtime.client : undefined;
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string>();
  const [created, setCreated] = useState<string>();
  const key = `${date}-${durationMinutes}`;
  return (
    <ActionRow
      detail={
        created === key
          ? note
          : (note ??
            (client
              ? "Duna tells you when a court opens on this day. One alert is included; Duna Plus adds more."
              : "Sign in to set an alert."))
      }
      disabled={!client || busy || created === key}
      icon={created === key ? "success" : "signal-ball"}
      onPress={() => {
        if (!client) return;
        setBusy(true);
        void client.player.createAvailabilityAlert
          .mutate({
            venueId,
            targetDate: date,
            durationMinutes,
            earliestMinute: 0,
            latestMinute: 1_440,
            channel: "push",
          })
          .then((result) => {
            haptics.confirmed(1);
            setCreated(key);
            setNote(
              result.premiumRequired
                ? "Your free alert is on. Duna Plus adds more alerts at once."
                : "Alert on. Duna tells you when a matching court opens.",
            );
          })
          .catch((reason: unknown) => {
            haptics.refused();
            setNote(
              `The alert didn't save. Reference ${report(reason, { event: "player.court.alert_failed" })}.`,
            );
          })
          .finally(() => setBusy(false));
      }}
      testID="priority-alert"
      title={created === key ? "Alert on" : "Tell me when a court opens"}
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center" },
  court: { flexDirection: "row", alignItems: "center", minHeight: 64 },
  courtMark: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  openDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  join: { minHeight: 48, alignItems: "center", justifyContent: "center" },
});
