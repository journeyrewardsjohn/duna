import { demoBookings, demoEvents } from "@duna/core/demo";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { usePlayerRuntime } from "../../../runtime";
import { PlayerCalendarModal } from "../../../player-calendar";
import { SatoshiText as Text } from "../../../satoshi-text";
import { colors } from "../../shared/palette";
import type { CourtBookingRequest } from "../courts/court-types";
import { PickupModal } from "../pickup/PickupModal";
import { Pill } from "../../shared/Pill";
import { AppHeader } from "../../app/AppHeader";
import { SectionHeader } from "../../shared/SectionHeader";
import { styles } from "../../legacy/styles";

export function PlansScreen({
  onOpenBooking,
  onOpenEvent,
  onReserveCourtVenue,
  onTraining,
  onSeeAllMatches,
}: {
  readonly onOpenBooking: (bookingId: string) => void;
  readonly onOpenEvent: (eventIndex: number) => void;
  readonly onReserveCourtVenue: (request: CourtBookingRequest) => void;
  readonly onTraining: () => void;
  readonly onSeeAllMatches: () => void;
}) {
  const { dashboard, mode, training } = usePlayerRuntime();
  const bookings = dashboard?.bookings ?? demoBookings;
  const events = dashboard?.events ?? demoEvents;
  const [showHost, setShowHost] = useState(false);
  const [hostedTitle, setHostedTitle] = useState<string>();
  const [calendarDate, setCalendarDate] = useState<Date>();
  const [showCalendar, setShowCalendar] = useState(false);
  const today = new Date();
  return (
    <>
      <ScrollView
        contentContainerStyle={styles.screenContent}
        showsVerticalScrollIndicator={false}
      >
        <AppHeader eyebrow="YOUR CALENDAR + COMMUNITY" />
        <View style={styles.homeGreeting}>
          <Text style={styles.displayTitle}>Plans.</Text>
          <Pressable
            onPress={() => setShowHost(true)}
            style={styles.scoreAction}
          >
            <Text style={styles.scoreActionText}>＋ Create a Match</Text>
          </Pressable>
        </View>
        {hostedTitle && (
          <View style={styles.successBanner}>
            <Text style={styles.successIcon}>✓</Text>
            <View style={styles.flex}>
              <Text style={styles.rowTitle}>{hostedTitle} is live.</Text>
              <Text style={styles.rowMeta}>
                Eligible nearby players can now discover it.
              </Text>
            </View>
            <Pressable onPress={() => setHostedTitle(undefined)}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>
        )}
        {(mode === "preview" || training?.nextPractice) && (
          <Pressable
            accessibilityHint="Opens your assigned practice plan and Program"
            accessibilityRole="button"
            onPress={onTraining}
            style={styles.trainingPlanCard}
          >
            <View style={styles.trainingPlanTopline}>
              <Text style={styles.trainingPlanEyebrow}>YOUR TRAINING</Text>
              <Text style={styles.trainingPlanPhase}>
                {training?.programs[0]?.currentPhase ?? "Pressure + transfer"}
              </Text>
            </View>
            <Text style={styles.trainingPlanTitle}>
              {training?.nextPractice?.title ?? "Sideout Under Pressure"}
            </Text>
            <Text style={styles.trainingPlanBody}>
              {training?.nextPractice
                ? `${new Date(training.nextPractice.startsAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: training.nextPractice.timezone })} · ${new Date(training.nextPractice.startsAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: training.nextPractice.timezone })} · ${training.nextPractice.focusArea ?? "Training"} · load ${training.nextPractice.plannedLoad}`
                : "Today · 5:00 PM · Ball Control · planned load 68"}
            </Text>
            <View style={styles.trainingPlanFooter}>
              <View style={styles.trainingPlanProgress}>
                <View
                  style={[
                    styles.trainingPlanProgressFill,
                    {
                      width: `${Math.max(
                        4,
                        ((training?.programs[0]?.completedSessionCount ?? 7) /
                          Math.max(
                            1,
                            training?.programs[0]?.scheduledSessionCount ?? 16,
                          )) *
                          100,
                      )}%`,
                    },
                  ]}
                />
              </View>
              <Text style={styles.trainingPlanAction}>Open practice →</Text>
            </View>
          </Pressable>
        )}
        <View style={styles.weekCard}>
          <View style={styles.cardTitleRow}>
            <View>
              <Text style={styles.eyebrow}>ALL UPCOMING ACTIVITY</Text>
              <Text style={styles.cardTitle}>Your plans</Text>
            </View>
            <Pressable
              accessibilityLabel="Open full calendar"
              onPress={() => {
                setCalendarDate(today);
                setShowCalendar(true);
              }}
              style={styles.calendarOpenAction}
            >
              <Text style={styles.sectionAction}>See calendar →</Text>
            </Pressable>
          </View>
          {bookings.map((booking, index) => (
            <Pressable
              accessibilityLabel={"Open " + booking.title}
              key={booking.id}
              onPress={() => onOpenBooking(booking.id)}
              style={styles.bookingRow}
            >
              <View style={styles.bookingTime}>
                <Text style={styles.bookingDateLabel}>
                  {new Date(booking.startsAt)
                    .toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      ...(booking.venueTimezone
                        ? { timeZone: booking.venueTimezone }
                        : {}),
                    })
                    .toUpperCase()}
                </Text>
                <Text style={styles.bookingTimeMain}>
                  {new Date(booking.startsAt)
                    .toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                      hour12: true,
                      ...(booking.venueTimezone
                        ? { timeZone: booking.venueTimezone }
                        : {}),
                    })
                    .replace(/\s[AP]M$/, "")}
                </Text>
                <Text style={styles.bookingTimeSuffix}>
                  {new Date(booking.startsAt)
                    .toLocaleTimeString("en-US", {
                      hour: "numeric",
                      ...(booking.venueTimezone
                        ? { timeZone: booking.venueTimezone }
                        : {}),
                    })
                    .slice(-2)}
                </Text>
              </View>
              <View
                style={[
                  styles.bookingAccent,
                  {
                    backgroundColor:
                      index % 2 === 1 ? colors.flare : colors.aqua,
                  },
                ]}
              />
              <View style={styles.flex}>
                <Text style={styles.rowTitle}>{booking.title}</Text>
                <Text style={styles.rowMeta}>{booking.venueName}</Text>
              </View>
              <Pill
                tone={
                  booking.status === "needs-action" ? "warning" : "positive"
                }
              >
                {booking.status}
              </Pill>
            </Pressable>
          ))}
        </View>
        <SectionHeader
          action="See all"
          eyebrow="HOSTED MATCHES NEARBY"
          onAction={onSeeAllMatches}
          title="Jump into something."
        />
        <View style={styles.listCard}>
          {events
            .filter(
              (event) => event.kind === "pickup" || event.kind === "open-play",
            )
            .slice(0, 8)
            .map((event) => (
              <Pressable
                key={event.id}
                onPress={() => onOpenEvent(events.indexOf(event))}
                style={styles.pickupRow}
              >
                <View style={styles.pickupDate}>
                  <Text numberOfLines={1} style={styles.pickupDay}>
                    {new Date(event.startsAt)
                      .toLocaleDateString("en-US", { weekday: "short" })
                      .toUpperCase()}
                  </Text>
                  <Text style={styles.pickupNumber}>
                    {new Date(event.startsAt).getDate()}
                  </Text>
                </View>
                <View style={styles.flex}>
                  <Text style={styles.rowTitle}>{event.title}</Text>
                  <Text style={styles.rowMeta}>
                    {event.venueName} ·{" "}
                    {(event.ratingRange?.[0] ?? 1).toFixed(1)}–
                    {(event.ratingRange?.[1] ?? 7).toFixed(1)}
                  </Text>
                </View>
                <View>
                  <Text style={styles.pickupSpots}>{event.spotsRemaining}</Text>
                  <Text style={styles.rowMeta}>spots</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            ))}
        </View>
        <View style={styles.hostCard}>
          <View style={styles.hostMark}>
            <Text style={styles.hostMarkText}>＋</Text>
          </View>
          <Text style={styles.sectionTitle}>Your court. Your people.</Text>
          <Text style={styles.bodyText}>
            Create a match with a clear time, format, and level. Add your
            partner now or leave spots open for nearby players.
          </Text>
          <Pressable
            onPress={() => setShowHost(true)}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>Create a Match</Text>
          </Pressable>
        </View>
      </ScrollView>
      <PickupModal
        onClose={() => setShowHost(false)}
        onCreated={(title) => setHostedTitle(title)}
        onReserveCourtVenue={(request) => {
          setShowHost(false);
          onReserveCourtVenue(request);
        }}
        visible={showHost}
      />
      <PlayerCalendarModal
        bookings={bookings}
        initialDate={calendarDate}
        onClose={() => setShowCalendar(false)}
        onOpenBooking={(bookingId) => {
          setShowCalendar(false);
          onOpenBooking(bookingId);
        }}
        visible={showCalendar}
      />
    </>
  );
}
