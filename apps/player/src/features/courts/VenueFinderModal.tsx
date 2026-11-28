import * as Location from "expo-location";
import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { usePlayerRuntime } from "../../../runtime";
import type { DiscoveryCoordinates } from "../../../discovery-search";
import {
  SatoshiText as Text,
  SatoshiTextInput as TextInput,
} from "../../../satoshi-text";
import { discoveryDistance } from "../discovery/discovery-distance";
import { colors } from "../../shared/palette";
import type { CourtBookingRequest } from "./court-types";
import {
  localDateValue,
  localDateAnchor,
  addLocalDateDays,
} from "./local-dates";
import { styles } from "../../legacy/styles";

export function VenueFinderModal({
  onClose,
  onSelect,
  visible,
}: {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly onSelect: (request: CourtBookingRequest) => void;
}) {
  const { venues } = usePlayerRuntime();
  const [query, setQuery] = useState("");
  const [origin, setOrigin] = useState<DiscoveryCoordinates>();
  const [locationStatus, setLocationStatus] = useState<
    "idle" | "finding" | "available" | "unavailable"
  >("idle");
  const [date, setDate] = useState(() => localDateValue(new Date()));
  const [durationMinutes, setDurationMinutes] = useState(90);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    setLocationStatus("finding");
    void Location.requestForegroundPermissionsAsync()
      .then(async (permission) => {
        if (!active) return;
        if (permission.status !== "granted") {
          setLocationStatus("unavailable");
          return;
        }
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!active) return;
        setOrigin({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setLocationStatus("available");
      })
      .catch(() => {
        if (active) setLocationStatus("unavailable");
      });
    return () => {
      active = false;
    };
  }, [visible]);

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) =>
        addLocalDateDays(localDateValue(new Date()), index),
      ),
    [],
  );
  const options = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return (venues ?? [])
      .filter((venue) => venue.courtCount > 0)
      .filter(
        (venue) =>
          !normalized ||
          [venue.name, venue.city, venue.region, ...venue.tags]
            .join(" ")
            .toLocaleLowerCase()
            .includes(normalized),
      )
      .map((venue) => ({
        venue,
        distanceMiles: origin ? discoveryDistance(origin, venue) : undefined,
      }))
      .sort((left, right) => {
        if (
          left.distanceMiles !== undefined &&
          right.distanceMiles !== undefined
        ) {
          return left.distanceMiles - right.distanceMiles;
        }
        if (left.distanceMiles !== undefined) return -1;
        if (right.distanceMiles !== undefined) return 1;
        return left.venue.name.localeCompare(right.venue.name);
      });
  }, [origin, query, venues]);

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={visible}
    >
      <SafeAreaView edges={["top", "bottom"]} style={styles.venueFinderSafe}>
        <View style={styles.venueFinderHeader}>
          <View style={styles.flex}>
            <Text style={styles.eyebrow}>LIVE COURT INVENTORY</Text>
            <Text style={styles.venueFinderTitle}>Find a court.</Text>
            <Text style={styles.venueFinderBody}>
              Choose a Duna venue first. We’ll show only courts and open matches
              available for the time you select.
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Close venue search"
            onPress={onClose}
            style={styles.venueFinderClose}
          >
            <Text style={styles.venueFinderCloseText}>×</Text>
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={styles.venueFinderContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.venueFinderLocationRow}>
            <Text style={styles.venueFinderLocationIcon}>⌖</Text>
            <View style={styles.flex}>
              <Text style={styles.venueFinderLocationTitle}>
                {locationStatus === "finding"
                  ? "Finding nearby venues…"
                  : locationStatus === "available"
                    ? "Nearby venues first"
                    : "Search Duna venues"}
              </Text>
              <Text style={styles.venueFinderLocationBody}>
                {locationStatus === "available"
                  ? "Your precise location stays on your device."
                  : "Location is optional—search by city, beach, or club."}
              </Text>
            </View>
          </View>
          <TextInput
            autoCapitalize="words"
            onChangeText={setQuery}
            placeholder="Search a venue, beach, or city"
            placeholderTextColor={colors.muted}
            style={styles.venueFinderSearch}
            value={query}
          />
          <Text style={styles.venueFinderLabel}>WHEN</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.horizontalBleed}
          >
            <View style={styles.venueFinderDayRow}>
              {days.map((value) => {
                const selected = value === date;
                const day = localDateAnchor(value);
                return (
                  <Pressable
                    key={value}
                    onPress={() => setDate(value)}
                    style={[
                      styles.venueFinderDay,
                      selected && styles.venueFinderDayActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.venueFinderDayName,
                        selected && styles.venueFinderDayTextActive,
                      ]}
                    >
                      {day
                        .toLocaleDateString("en-US", { weekday: "short" })
                        .toUpperCase()}
                    </Text>
                    <Text
                      style={[
                        styles.venueFinderDayNumber,
                        selected && styles.venueFinderDayTextActive,
                      ]}
                    >
                      {day.getDate()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
          <View style={styles.venueFinderDurationRow}>
            {[60, 90, 120].map((minutes) => (
              <Pressable
                key={minutes}
                onPress={() => setDurationMinutes(minutes)}
                style={[
                  styles.venueFinderDuration,
                  durationMinutes === minutes &&
                    styles.venueFinderDurationActive,
                ]}
              >
                <Text
                  style={[
                    styles.venueFinderDurationText,
                    durationMinutes === minutes &&
                      styles.venueFinderDurationTextActive,
                  ]}
                >
                  {minutes} min
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.venueFinderLabel}>
            {origin ? "NEARBY DUNA VENUES" : "DUNA VENUES"}
          </Text>
          <View style={styles.venueFinderResults}>
            {options.map(({ distanceMiles, venue }) => (
              <Pressable
                key={venue.id}
                onPress={() =>
                  onSelect({ venueId: venue.id, date, durationMinutes })
                }
                style={styles.venueFinderResult}
              >
                <View style={styles.venueFinderResultMark}>
                  <Text style={styles.venueFinderResultMarkText}>▦</Text>
                </View>
                <View style={styles.flex}>
                  <Text style={styles.venueFinderResultTitle}>
                    {venue.name}
                  </Text>
                  <Text style={styles.venueFinderResultMeta}>
                    {venue.city}, {venue.region} · {venue.courtCount}{" "}
                    {venue.courtCount === 1 ? "court" : "courts"}
                    {distanceMiles !== undefined
                      ? ` · ${distanceMiles < 10 ? distanceMiles.toFixed(1) : Math.round(distanceMiles)} mi`
                      : ""}
                  </Text>
                </View>
                <Text style={styles.venueFinderResultArrow}>›</Text>
              </Pressable>
            ))}
            {options.length === 0 && (
              <View style={styles.venueFinderEmpty}>
                <Text style={styles.venueFinderEmptyTitle}>
                  No Duna courts match that search.
                </Text>
                <Text style={styles.venueFinderEmptyBody}>
                  Creating a match at a beach or venue outside Duna is still
                  easy—use Create a Match from Play.
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
