/**
 * A venue's open court times (M-P1, rebuilt in M-P3; board P-Book-Court):
 * one Jost title, then the time and court picker (`CourtTimePicker`: day,
 * length, conditions, start times by daypart, the courts open then, open
 * matches, "looking to play" and a priority alert). "Continue" hands the
 * chosen venue, day, length, time and court to the booking flow, which opens
 * on "Who's playing" and never asks for the time again (owner feedback 28
 * Nov, point 2). Every way into court booking in the Player lands here.
 */
import {
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { formatMoney } from "@duna/core";
import {
  ErrorState,
  LoadingState,
  Text,
  Title,
  useTheme,
} from "@duna/ui/native";
import * as WebBrowser from "expo-web-browser";
import { useContext, useEffect, useMemo, useReducer, useState } from "react";
import { dunaWebUrl } from "../../../mobile-api";
import { usePlayerRuntime } from "../../../runtime";
import { RouteEntryContext, useShell } from "../../app/ShellContext";
import { usePaneEdges } from "../../app/ui";
import {
  CourtBookingFlow,
  type CourtFlowRequest,
} from "../booking/court/CourtBookingFlow";
import { CourtTimePicker, todayIn } from "../booking/court/CourtTimePicker";
import {
  courtFlowReducer,
  initialFlowState,
} from "../booking/court/court-flow";
import { localMinute, slotsAt } from "../booking/court/court-times";
import {
  courtFlowPreview,
  isPreviewStep,
} from "../booking/court/preview-fixtures";
import {
  useCourtAvailability,
  useCourtInventory,
} from "../booking/court/use-court-data";
import { ActionButton } from "./parts";

export { courtSlots, localMinute } from "../booking/court/court-times";

export function CourtTimesScreen() {
  const entry = useContext(RouteEntryContext);
  const venueId = entry?.targetId;
  if (!venueId) return null;
  return (
    <CourtTimes key={`${venueId}-${entry?.nonce ?? 0}`} venueId={venueId} />
  );
}

function CourtTimes({ venueId }: { readonly venueId: string }) {
  const entry = useContext(RouteEntryContext);
  const shell = useShell();
  const runtime = usePlayerRuntime();
  const edges = usePaneEdges();
  const { colors, tokens } = useTheme();
  const { fontScale } = useWindowDimensions();
  const { inventory, error, retry } = useCourtInventory(venueId);
  const [state, dispatch] = useReducer(
    courtFlowReducer,
    {
      selection: {
        venueId,
        date: entry?.court?.date ?? todayIn(undefined),
        durationMinutes: entry?.court?.durationMinutes ?? 90,
      },
      ...(entry?.court?.intent ? { intent: entry.court.intent } : {}),
    },
    (input) => initialFlowState(input),
  );
  const [flow, setFlow] = useState<CourtFlowRequest>();

  // Once the venue is known: its own today, and a length it offers.
  useEffect(() => {
    if (!inventory) return;
    const today = todayIn(inventory.venue.timezone);
    if (!entry?.court?.date || entry.court.date < today)
      dispatch({ type: "set-date", date: today });
    const options = [
      ...new Set(
        inventory.courts.flatMap((court) => court.durationOptionsMinutes),
      ),
    ];
    if (!options.includes(state.selection.durationMinutes))
      dispatch({
        type: "set-duration",
        durationMinutes: options.includes(90) ? 90 : (options[0] ?? 60),
      });
    // Only when the venue first loads.
  }, [inventory?.venue.id]);

  const { availability } = useCourtAvailability({
    venueId,
    date: state.selection.date,
    durationMinutes: state.selection.durationMinutes,
    enabled: Boolean(inventory),
  });
  const minute = state.selection.localStartsAt
    ? localMinute(state.selection.localStartsAt)
    : null;
  const slot = slotsAt(availability, minute).find(
    (entry) => entry.courtId === state.selection.courtId,
  );
  const largeText = fontScale >= 1.6;

  // Preview builds: open a step of the flow with fixtures, for screenshots.
  const previewStep = runtime.mode === "preview" ? entry?.prompt : undefined;
  const preview = useMemo(() => {
    if (!isPreviewStep(previewStep) || !slot || !state.selection.localStartsAt)
      return undefined;
    return courtFlowPreview({
      step: previewStep,
      date: state.selection.date,
      localStartsAt: state.selection.localStartsAt,
      courtId: slot.courtId,
      courtName: slot.courtName,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
    });
  }, [previewStep, slot, state.selection.date, state.selection.localStartsAt]);
  useEffect(() => {
    if (
      !isPreviewStep(previewStep) ||
      !availability ||
      state.selection.localStartsAt
    )
      return;
    const first = availability.slots[0];
    if (!first) return;
    dispatch({
      type: "choose-time",
      localStartsAt: first.localStartsAt.slice(0, 16),
      openCourtIds: [first.courtId],
    });
  }, [availability, previewStep, state.selection.localStartsAt]);
  useEffect(() => {
    if (preview && !flow) open();
  }, [preview]);

  const open = () => {
    if (!state.selection.localStartsAt || !state.selection.courtId) return;
    setFlow({
      venueId,
      date: state.selection.date,
      durationMinutes: state.selection.durationMinutes,
      localStartsAt: state.selection.localStartsAt,
      courtId: state.selection.courtId,
      intent: state.intent,
    });
  };

  const openMatch = (matchId: string, matchSlug: string) => {
    setFlow(undefined);
    const index = (runtime.dashboard?.events ?? []).findIndex(
      (event) => event.id === matchId,
    );
    setTimeout(() => {
      if (index >= 0) shell.registerForEvent(index);
      else
        void WebBrowser.openBrowserAsync(
          `${dunaWebUrl}/events/${encodeURIComponent(matchSlug)}`,
        );
    }, 280);
  };

  if (!inventory) {
    return (
      <View
        style={[
          styles.fill,
          { backgroundColor: colors.ground, padding: tokens.space["4"] },
        ]}
      >
        {error ? (
          <ErrorState
            onRetry={retry}
            reference={error}
            text="Check your connection and try again."
            title="Couldn't load courts"
          />
        ) : (
          <LoadingState label="Loading court times" loading skeleton="card" />
        )}
      </View>
    );
  }
  const venue = inventory.venue;

  const footer = (
    <View
      style={{
        paddingLeft: edges.left + tokens.space["4"],
        paddingRight: edges.right + tokens.space["4"],
        paddingTop: tokens.space["3"],
        paddingBottom: edges.bottom + tokens.space["3"],
        borderTopColor: colors.line,
        borderTopWidth: StyleSheet.hairlineWidth,
        backgroundColor: colors.surface,
        gap: tokens.space["1"],
      }}
    >
      {slot ? (
        <Text tabular variant="phone-body" weight={600}>
          {`${slot.courtName} · ${slot.price ? `listed ${formatMoney(slot.price.amountMinor, slot.price.currency)}` : "free"}`}
        </Text>
      ) : null}
      <ActionButton
        disabled={!slot}
        label={
          !state.selection.localStartsAt
            ? "Choose a time to continue"
            : !slot
              ? "Choose a court to continue"
              : "Continue"
        }
        onPress={open}
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
          <Title>{venue.name}</Title>
          <Text tone="text-2" variant="phone-meta">
            {[
              `${venue.city}, ${venue.region}`,
              venue.organizationName,
              `${inventory.courts.length} court${inventory.courts.length === 1 ? "" : "s"}`,
              inventory.courts.some((court) => court.lit) ? "lit" : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        </View>
        <CourtTimePicker
          inventory={inventory}
          onCourt={(courtId) => dispatch({ type: "choose-court", courtId })}
          onDate={(date) => dispatch({ type: "set-date", date })}
          onDuration={(minutes) =>
            dispatch({ type: "set-duration", durationMinutes: minutes })
          }
          onOpenMatch={openMatch}
          onTime={(localStartsAt, openCourtIds) =>
            dispatch({ type: "choose-time", localStartsAt, openCourtIds })
          }
          selection={state.selection}
        />
        {largeText ? footer : null}
      </ScrollView>
      {largeText ? null : footer}
      <CourtBookingFlow
        onClose={() => setFlow(undefined)}
        onOpenMatch={openMatch}
        onViewBooking={(bookingId) => {
          setFlow(undefined);
          setTimeout(() => shell.openBooking(bookingId), 280);
        }}
        preview={preview}
        request={flow}
      />
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
