import { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SatoshiText as Text } from "../../../satoshi-text";
import type { CourtAvailability } from "./court-types";
import { selectionHaptic } from "../../shared/haptics";
import {
  localDateValue,
  localDateAnchor,
  addLocalDateDays,
  startOfLocalMonth,
  addLocalMonths,
  localMonthCells,
  localMonthLabel,
  localSlotTime,
} from "./local-dates";
import { styles } from "../../legacy/styles";

export type MobileCalendarMarker = {
  readonly booking: boolean;
  readonly event: boolean;
  readonly count: number;
};

export function BookingCalendarModal({
  availability,
  availabilityLoading,
  markers,
  maxDate,
  minDate,
  onClose,
  onExtendRange,
  onSelect,
  selectedDate,
  visible,
}: {
  readonly availability?: CourtAvailability;
  readonly availabilityLoading: boolean;
  readonly markers: ReadonlyMap<string, MobileCalendarMarker>;
  readonly maxDate: string;
  readonly minDate: string;
  readonly onClose: () => void;
  readonly onExtendRange: (requiredEnd?: string) => void;
  readonly onSelect: (date: string) => void;
  readonly selectedDate: string;
  readonly visible: boolean;
}) {
  const { width } = useWindowDimensions();
  const [visibleMonth, setVisibleMonth] = useState(() =>
    startOfLocalMonth(selectedDate),
  );
  const today = localDateValue(new Date());
  const months = [visibleMonth, addLocalMonths(visibleMonth, 1)] as const;
  const selectedAvailability =
    availability?.date === selectedDate ? availability : undefined;
  const openCourtCount = new Set(
    selectedAvailability?.slots.map((slot) => slot.courtId) ?? [],
  ).size;
  const openStartCount = new Set(
    selectedAvailability?.slots.map((slot) => slot.localStartsAt) ?? [],
  ).size;
  const openMatchCount = selectedAvailability?.openMatches.length ?? 0;
  const openOptionCount = openStartCount + openMatchCount;
  const firstOpenAt = [
    ...(selectedAvailability?.slots.map((slot) => slot.localStartsAt) ?? []),
    ...(selectedAvailability?.openMatches.map((match) => match.localStartsAt) ??
      []),
  ].sort()[0];
  const selectedDateLabel = localDateAnchor(selectedDate).toLocaleDateString(
    "en-US",
    { weekday: "long", month: "long", day: "numeric" },
  );

  useEffect(() => {
    if (!visible) return;
    setVisibleMonth((current) =>
      selectedDate >= current && selectedDate < addLocalMonths(current, 2)
        ? current
        : startOfLocalMonth(selectedDate),
    );
  }, [selectedDate, visible]);

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={visible}
    >
      <SafeAreaView
        edges={["top", "bottom"]}
        style={styles.bookingCalendarSafe}
      >
        <View style={styles.bookingCalendarHeader}>
          <View style={styles.flex}>
            <Text style={styles.bookingCalendarEyebrow}>
              COURT AVAILABILITY
            </Text>
            <Text style={styles.bookingCalendarTitle}>
              When do you want to play?
            </Text>
            <Text style={styles.bookingCalendarInstruction}>
              Tap a day to preview live court openings.
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Close full calendar"
            hitSlop={3}
            onPress={onClose}
            style={styles.bookingCalendarClose}
          >
            <Text style={styles.bookingCalendarCloseText}>×</Text>
          </Pressable>
        </View>
        <View style={styles.bookingCalendarToolbar}>
          <Pressable
            accessibilityLabel="Previous month"
            disabled={visibleMonth <= startOfLocalMonth(minDate)}
            hitSlop={4}
            onPress={() =>
              setVisibleMonth((current) => addLocalMonths(current, -1))
            }
            style={styles.bookingCalendarNav}
          >
            <Text style={styles.bookingCalendarNavText}>‹</Text>
          </Pressable>
          <Text style={styles.bookingCalendarRange}>
            {localMonthLabel(visibleMonth)} – {localMonthLabel(months[1])}
          </Text>
          <Pressable
            accessibilityLabel="Next month"
            hitSlop={4}
            onPress={() => {
              const nextMonth = addLocalMonths(visibleMonth, 1);
              const endOfSecondMonth = addLocalDateDays(
                addLocalMonths(nextMonth, 2),
                -1,
              );
              onExtendRange(endOfSecondMonth);
              setVisibleMonth(nextMonth);
            }}
            style={styles.bookingCalendarNav}
          >
            <Text style={styles.bookingCalendarNavText}>›</Text>
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={styles.bookingCalendarScroll}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.bookingCalendarAvailability}>
            <Text style={styles.bookingCalendarAvailabilityEyebrow}>
              {selectedDateLabel.toUpperCase()}
            </Text>
            <Text
              accessibilityLiveRegion="polite"
              style={styles.bookingCalendarAvailabilityTitle}
            >
              {availabilityLoading
                ? "Checking live availability…"
                : openCourtCount > 0
                  ? `${openCourtCount} ${openCourtCount === 1 ? "court" : "courts"} with open times`
                  : openMatchCount > 0
                    ? `${openMatchCount} open ${openMatchCount === 1 ? "match" : "matches"}`
                    : "No open court times yet"}
            </Text>
            {!availabilityLoading && openOptionCount > 0 ? (
              <View style={styles.bookingCalendarAvailabilityFacts}>
                {openStartCount > 0 ? (
                  <Text style={styles.bookingCalendarAvailabilityFact}>
                    {openStartCount} {openStartCount === 1 ? "start" : "starts"}
                  </Text>
                ) : null}
                {openMatchCount > 0 ? (
                  <Text style={styles.bookingCalendarAvailabilityFact}>
                    {openMatchCount} open{" "}
                    {openMatchCount === 1 ? "match" : "matches"}
                  </Text>
                ) : null}
                {firstOpenAt ? (
                  <Text style={styles.bookingCalendarAvailabilityFact}>
                    From {localSlotTime(firstOpenAt)}
                  </Text>
                ) : null}
              </View>
            ) : null}
            <Pressable
              accessibilityRole="button"
              disabled={availabilityLoading || openOptionCount === 0}
              onPress={onClose}
              style={[
                styles.bookingCalendarAvailabilityButton,
                (availabilityLoading || openOptionCount === 0) &&
                  styles.bookingCalendarAvailabilityButtonDisabled,
              ]}
            >
              <Text style={styles.bookingCalendarAvailabilityButtonText}>
                {availabilityLoading
                  ? "Checking…"
                  : openOptionCount > 0
                    ? `See ${openOptionCount} open ${openOptionCount === 1 ? "option" : "options"}`
                    : "No times available"}
              </Text>
            </Pressable>
          </View>
          <View
            style={[
              styles.bookingCalendarMonths,
              width >= 720 && styles.bookingCalendarMonthsWide,
            ]}
          >
            {months.map((month) => (
              <View
                key={month}
                style={[
                  styles.bookingCalendarMonth,
                  width >= 720 && styles.bookingCalendarMonthWide,
                ]}
              >
                <Text style={styles.bookingCalendarMonthTitle}>
                  {localMonthLabel(month)}
                </Text>
                <View style={styles.bookingCalendarWeekdayRow}>
                  {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map(
                    (weekday) => (
                      <Text key={weekday} style={styles.bookingCalendarWeekday}>
                        {weekday}
                      </Text>
                    ),
                  )}
                </View>
                <View style={styles.bookingCalendarGrid}>
                  {localMonthCells(month).map((date, index) => {
                    if (!date) {
                      return (
                        <View
                          key={`blank-${month}-${index}`}
                          style={styles.bookingCalendarBlank}
                        />
                      );
                    }
                    const marker = markers.get(date);
                    const disabled = date < minDate || date > maxDate;
                    const selected = date === selectedDate;
                    return (
                      <View key={date} style={styles.bookingCalendarCell}>
                        <Pressable
                          accessibilityLabel={`${localDateAnchor(
                            date,
                          ).toLocaleDateString("en-US", {
                            weekday: "long",
                            month: "long",
                            day: "numeric",
                            year: "numeric",
                          })}${marker ? `, ${marker.count} scheduled` : ""}`}
                          disabled={disabled}
                          hitSlop={6}
                          onPress={() => {
                            selectionHaptic();
                            onSelect(date);
                          }}
                          style={[
                            styles.bookingCalendarDay,
                            date === today && styles.bookingCalendarDayToday,
                            selected && styles.bookingCalendarDaySelected,
                            disabled && styles.bookingCalendarDayDisabled,
                          ]}
                        >
                          <Text
                            style={[
                              styles.bookingCalendarDayText,
                              selected && styles.bookingCalendarDayTextSelected,
                            ]}
                          >
                            {localDateAnchor(date).getDate()}
                          </Text>
                          {marker && (
                            <View style={styles.bookingCalendarMarkers}>
                              {marker.booking && (
                                <View
                                  style={[
                                    styles.bookingCalendarMarker,
                                    styles.bookingCalendarMarkerBooking,
                                  ]}
                                />
                              )}
                              {marker.event && (
                                <View
                                  style={[
                                    styles.bookingCalendarMarker,
                                    styles.bookingCalendarMarkerEvent,
                                  ]}
                                />
                              )}
                            </View>
                          )}
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
          <View style={styles.bookingCalendarLegend}>
            <View style={styles.bookingCalendarLegendItem}>
              <View
                style={[
                  styles.bookingCalendarMarker,
                  styles.bookingCalendarMarkerBooking,
                ]}
              />
              <Text style={styles.bookingCalendarLegendText}>Your plans</Text>
            </View>
            <View style={styles.bookingCalendarLegendItem}>
              <View
                style={[
                  styles.bookingCalendarMarker,
                  styles.bookingCalendarMarkerEvent,
                ]}
              />
              <Text style={styles.bookingCalendarLegendText}>
                Events to explore
              </Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
