import { demoEvents } from "@duna/core/demo";
import * as Location from "expo-location";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import { Image, Pressable, ScrollView, View } from "react-native";
import { dunaWebUrl } from "../../../mobile-api";
import { usePlayerRuntime } from "../../../runtime";
import type { DiscoveryCoordinates } from "../../../discovery-search";
import {
  SatoshiText as Text,
  SatoshiTextInput as TextInput,
} from "../../../satoshi-text";
import {
  type MobileCoach,
  coachInitials,
  coachExperienceLabel,
  coachServicePrice,
  coachSupportsVirtual,
} from "./coach-format";
import { discoveryDistance } from "../find/discovery-distance";
import { colors } from "../../shared/palette";
import { CoachProfileModal } from "./CoachProfileModal";
import { styles } from "../../legacy/styles";

export function FindCoachScreen({
  onOpenEvent,
}: {
  readonly onOpenEvent: (eventIndex: number) => void;
}) {
  const { coaches = [], dashboard, venues = [] } = usePlayerRuntime();
  const [mode, setMode] = useState<"near" | "virtual">("near");
  const [query, setQuery] = useState("");
  const [gender, setGender] = useState("all");
  const [experience, setExperience] = useState("all");
  const [organizationId, setOrganizationId] = useState("all");
  const [origin, setOrigin] = useState<DiscoveryCoordinates>();
  const [selectedCoach, setSelectedCoach] = useState<MobileCoach>();

  useEffect(() => {
    let mounted = true;
    void Location.requestForegroundPermissionsAsync()
      .then(async (permission) => {
        if (!permission.granted) return undefined;
        return Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
      })
      .then((position) => {
        if (mounted && position) {
          setOrigin({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        }
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  const genders = [
    ...new Set(
      coaches.flatMap((coach) =>
        coach.genderCategory ? [coach.genderCategory] : [],
      ),
    ),
  ];
  const experiences = [
    ...new Set(
      coaches.flatMap((coach) =>
        coach.playingExperience && coach.playingExperience !== "not-set"
          ? [coach.playingExperience]
          : [],
      ),
    ),
  ];
  const organizations = [
    ...new Map(
      coaches.map((coach) => [
        coach.organizationId,
        { id: coach.organizationId, name: coach.organizationName },
      ]),
    ).values(),
  ];
  const coachVenue = (coach: MobileCoach) =>
    venues.find((venue) => venue.organizationId === coach.organizationId);
  const visibleCoaches = [...coaches]
    .filter((coach) => {
      const normalizedQuery = query.trim().toLowerCase();
      if (
        normalizedQuery &&
        ![
          coach.displayName,
          coach.organizationName,
          coach.homeMarket ?? "",
          coach.bio ?? "",
          ...coach.services.map((service) => service.title),
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery)
      ) {
        return false;
      }
      if (mode === "virtual" && !coachSupportsVirtual(coach)) return false;
      if (gender !== "all" && coach.genderCategory !== gender) return false;
      if (experience !== "all" && coach.playingExperience !== experience) {
        return false;
      }
      return (
        organizationId === "all" || coach.organizationId === organizationId
      );
    })
    .sort((left, right) => {
      const leftVenue = coachVenue(left);
      const rightVenue = coachVenue(right);
      return (
        discoveryDistance(origin, leftVenue ?? {}) -
        discoveryDistance(origin, rightVenue ?? {})
      );
    });

  const filterChip = (label: string, active: boolean, onPress: () => void) => (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      key={label}
      onPress={onPress}
      style={[
        styles.coachFinderFilterChip,
        active && styles.coachFinderFilterChipActive,
      ]}
    >
      <Text
        style={[
          styles.coachFinderFilterText,
          active && styles.coachFinderFilterTextActive,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );

  return (
    <>
      <ScrollView
        contentContainerStyle={styles.screenContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.eyebrow, styles.coachFinderEyebrow]}>
          COACHES ON DUNA
        </Text>
        <Text style={styles.displayTitle}>Find your next level.</Text>
        <Text style={styles.coachFinderIntro}>
          Compare real profiles, experience, programs, availability, and price
          before you book.
        </Text>

        <View style={styles.coachFinderModeRow}>
          {(["near", "virtual"] as const).map((option) => (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: mode === option }}
              key={option}
              onPress={() => setMode(option)}
              style={[
                styles.coachFinderMode,
                mode === option && styles.coachFinderModeActive,
              ]}
            >
              <Text
                style={[
                  styles.coachFinderModeEyebrow,
                  mode === option && styles.coachFinderModeEyebrowActive,
                ]}
              >
                {option === "near" ? "⌖ LOCAL" : "◉ ONLINE"}
              </Text>
              <Text
                style={[
                  styles.coachFinderModeTitle,
                  mode === option && styles.coachFinderModeTitleActive,
                ]}
              >
                {option === "near" ? "Near me" : "Virtual"}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.coachFinderSearch}>
          <Text style={styles.coachFinderSearchIcon}>⌕</Text>
          <TextInput
            autoCapitalize="none"
            onChangeText={setQuery}
            placeholder="Coach, skill, program, or organization"
            placeholderTextColor={colors.muted}
            style={styles.coachFinderSearchInput}
            value={query}
          />
        </View>

        {genders.length > 0 ? (
          <>
            <Text style={styles.coachFinderFilterLabel}>GENDER</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.coachFinderFilterRow}>
                {filterChip("All", gender === "all", () => setGender("all"))}
                {genders.map((value) =>
                  filterChip(value, gender === value, () => setGender(value)),
                )}
              </View>
            </ScrollView>
          </>
        ) : null}

        {experiences.length > 0 ? (
          <>
            <Text style={styles.coachFinderFilterLabel}>
              PLAYING EXPERIENCE
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.coachFinderFilterRow}>
                {filterChip("All", experience === "all", () =>
                  setExperience("all"),
                )}
                {experiences.map((value) =>
                  filterChip(
                    coachExperienceLabel(value).replace(" experience", ""),
                    experience === value,
                    () => setExperience(value),
                  ),
                )}
              </View>
            </ScrollView>
          </>
        ) : null}

        {organizations.length > 1 ? (
          <>
            <Text style={styles.coachFinderFilterLabel}>ORGANIZATION</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.coachFinderFilterRow}>
                {filterChip("All", organizationId === "all", () =>
                  setOrganizationId("all"),
                )}
                {organizations.map((organization) =>
                  filterChip(
                    organization.name,
                    organizationId === organization.id,
                    () => setOrganizationId(organization.id),
                  ),
                )}
              </View>
            </ScrollView>
          </>
        ) : null}

        <View style={styles.coachFinderResultsHeader}>
          <Text style={styles.sectionTitle}>
            {mode === "near" ? "Coaches near you." : "Train from anywhere."}
          </Text>
          <Text style={styles.sectionAction}>
            {visibleCoaches.length} found
          </Text>
        </View>

        <View style={styles.coachFinderResults}>
          {visibleCoaches.map((coach) => {
            const venue = coachVenue(coach);
            const miles = discoveryDistance(origin, venue ?? {});
            const firstService = coach.services[0];
            const price = firstService
              ? coachServicePrice(firstService)
              : undefined;
            return (
              <Pressable
                accessibilityLabel={`View ${coach.displayName}`}
                accessibilityRole="button"
                key={`${coach.organizationId}:${coach.personId}`}
                onPress={() => setSelectedCoach(coach)}
                style={({ pressed }) => [
                  styles.coachFinderCard,
                  pressed && styles.homeQuickActionPressed,
                ]}
              >
                <View style={styles.coachFinderCardTop}>
                  {coach.avatarUrl ? (
                    <Image
                      source={{ uri: coach.avatarUrl }}
                      style={styles.coachFinderAvatar}
                    />
                  ) : (
                    <View style={styles.coachFinderAvatarFallback}>
                      <Text style={styles.coachFinderAvatarText}>
                        {coachInitials(coach.displayName)}
                      </Text>
                    </View>
                  )}
                  <View style={styles.flex}>
                    <Text style={styles.coachFinderName}>
                      {coach.displayName}
                    </Text>
                    <Text style={styles.coachFinderOrganization}>
                      {coach.organizationName}
                    </Text>
                    <Text style={styles.coachFinderLocation}>
                      {mode === "virtual" && coachSupportsVirtual(coach)
                        ? "Virtual coaching available"
                        : Number.isFinite(miles)
                          ? `${miles.toFixed(miles < 10 ? 1 : 0)} mi away`
                          : (coach.homeMarket ?? "Location on profile")}
                    </Text>
                  </View>
                  <Text style={styles.coachFinderArrow}>›</Text>
                </View>
                <Text numberOfLines={3} style={styles.coachFinderBio}>
                  {coach.bio ??
                    `${coach.displayName} offers bookable coaching through ${coach.organizationName}.`}
                </Text>
                <View style={styles.coachFinderFacts}>
                  <Text style={styles.coachFinderFact}>
                    {coachExperienceLabel(coach.playingExperience)}
                  </Text>
                  <Text style={styles.coachFinderFact}>
                    {coach.services.length} bookable
                  </Text>
                  {coach.upcomingSessions.length > 0 ? (
                    <Text style={styles.coachFinderFact}>
                      {coach.upcomingSessions.length} upcoming
                    </Text>
                  ) : null}
                </View>
                <View style={styles.coachFinderCardFooter}>
                  <Text style={styles.coachFinderServicePreview}>
                    {firstService?.title ?? "View coaching profile"}
                  </Text>
                  <Text style={styles.coachFinderPrice}>
                    {price ?? "See options"}
                  </Text>
                </View>
              </Pressable>
            );
          })}
          {visibleCoaches.length === 0 ? (
            <View style={styles.coachFinderEmpty}>
              <Text style={styles.coachFinderEmptyTitle}>
                No coaches match those filters yet.
              </Text>
              <Text style={styles.coachFinderEmptyBody}>
                Try Near me, clear a profile filter, or search a broader skill.
              </Text>
              <Pressable
                onPress={() => {
                  setMode("near");
                  setQuery("");
                  setGender("all");
                  setExperience("all");
                  setOrganizationId("all");
                }}
                style={styles.coachFinderClear}
              >
                <Text style={styles.coachFinderClearText}>Clear filters</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </ScrollView>
      <CoachProfileModal
        coach={selectedCoach}
        onClose={() => setSelectedCoach(undefined)}
        onOpenSession={(session) => {
          const events = dashboard?.events ?? demoEvents;
          const index = events.findIndex((event) => event.id === session.id);
          if (index >= 0) {
            onOpenEvent(index);
            return;
          }
          void WebBrowser.openBrowserAsync(
            `${dunaWebUrl}/events/${encodeURIComponent(session.slug)}`,
          );
        }}
      />
    </>
  );
}
