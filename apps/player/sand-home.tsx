/* eslint-disable @typescript-eslint/no-require-imports */
import { sandColors as c } from "@duna/ui/sand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Image,
  ImageBackground,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DunaIcon } from "./duna-icon";
import { dunaWebUrl } from "./mobile-api";
import {
  MatchCard,
  OpenGameCard,
  type HomeV3Props,
  UpcomingCard,
} from "./home-v3";
import {
  SatoshiText as Text,
  SatoshiTextInput as TextInput,
} from "./satoshi-text";

const destinationImages: Record<string, string> = {
  "find-coach": "/media/product-library/duna-product-private-lesson.webp",
  "record-video": "/media/brand/duna-home-rally-v3.webp",
  "create-match": "/media/product-library/duna-product-club-community.webp",
  "upload-score": "/media/event-library/duna-event-coed-social.webp",
  "find-match": "/media/event-library/duna-event-coed-social.webp",
  "book-court": "/media/product-library/duna-product-member-courts.webp",
};

const photos = [
  require("./assets/duna-campaign-rally.jpg"),
  require("./assets/duna-hero-poster.jpg"),
];
type Club = { readonly id: string; readonly name: string };
type Feature = {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly image: string;
  readonly onPress: () => void;
};

export function SandHomeScreen(
  props: HomeV3Props & {
    readonly playerId: string;
    readonly clubs: readonly Club[];
    readonly selectedClub?: string;
    readonly onSelectClub: (id: string | undefined) => void;
    readonly onProfile: () => void;
    readonly features: readonly Feature[];
  },
) {
  const insets = useSafeAreaInsets();
  const [width, setWidth] = useState(390);
  const [reducedMotion, setReducedMotion] = useState(true);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted) setReducedMotion(value);
    });
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReducedMotion,
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);
  const [slide, setSlide] = useState(0);
  const [clubSheet, setClubSheet] = useState(false);
  const [query, setQuery] = useState("");
  const [visited, setVisited] = useState<string[]>([]);
  const scrollY = useRef(new Animated.Value(0)).current;
  const carousel = useRef<ScrollView>(null);
  const activeClub = props.clubs.find((club) => club.id === props.selectedClub);
  const heroHeight = Math.min(560, Math.max(440, width * 1.2));
  const slides = [
    {
      title: "Your place in the sand.",
      detail: "Good people. More play. A game that feels like you.",
      action: props.onOpenMoreGames,
    },
    {
      title: "Make time for your game.",
      detail: "Find a court, a coach, and your next favorite session.",
      action: props.onSearch,
    },
  ];
  useEffect(() => {
    let current = true;
    setVisited([]);
    void AsyncStorage.getItem(`duna:recent-destinations:${props.playerId}`)
      .then((value) => {
        if (!current || !value) return;
        try {
          const keys: unknown = JSON.parse(value);
          if (Array.isArray(keys))
            setVisited(
              keys
                .filter((key): key is string => typeof key === "string")
                .slice(0, 4),
            );
        } catch {
          /* Discard malformed local history. */
        }
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [props.playerId]);
  const open = (key: string, action: () => void) => {
    const next = [key, ...visited.filter((entry) => entry !== key)].slice(0, 4);
    setVisited(next);
    void AsyncStorage.setItem(
      `duna:recent-destinations:${props.playerId}`,
      JSON.stringify(next),
    ).catch(() => undefined);
    action();
  };
  const recent = visited.flatMap((key) =>
    props.quickActions.filter((action) => action.key === key),
  );
  const activities = props.upcoming.filter((item) => item.status === "going");
  const filteredClubs = props.clubs.filter((club) =>
    club.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <View
      style={s.screen}
      onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)}
    >
      <Animated.ScrollView
        style={s.scroll}
        contentContainerStyle={{ paddingBottom: 110 + insets.bottom }}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true },
        )}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          style={[
            s.hero,
            {
              height: heroHeight,
              transform: [
                {
                  translateY: reducedMotion
                    ? 0
                    : scrollY.interpolate({
                        inputRange: [0, heroHeight],
                        outputRange: [0, heroHeight * 0.78],
                        extrapolate: "clamp",
                      }),
                },
              ],
            },
          ]}
        >
          <ScrollView
            ref={carousel}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={({ nativeEvent }) =>
              setSlide(Math.round(nativeEvent.contentOffset.x / width))
            }
          >
            {slides.map((item, index) => (
              <ImageBackground
                key={item.title}
                source={photos[index]}
                style={[s.slide, { width, height: heroHeight }]}
              >
                <View style={s.veil} />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={item.title}
                  onPress={item.action}
                  style={s.heroCopy}
                >
                  <Text style={s.heroTitle}>{item.title}</Text>
                  <Text style={s.heroDetail}>{item.detail}</Text>
                </Pressable>
              </ImageBackground>
            ))}
          </ScrollView>
          <View style={[s.heroTop, { top: insets.top + 10 }]}>
            <Pressable
              accessibilityLabel="Your profile"
              accessibilityRole="button"
              onPress={props.onProfile}
              style={s.heroIcon}
            >
              <DunaIcon name="user" color={c.white} size={20} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="My Clubs"
              onPress={() => setClubSheet(true)}
              style={s.clubTrigger}
            >
              <DunaIcon name="court" color={c.white} size={17} />
              <Text numberOfLines={1} style={s.clubTriggerText}>
                {activeClub?.name ?? "My Clubs"}
              </Text>
              <Text style={s.clubTriggerText}>⌄</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Notifications and messages"
              accessibilityRole="button"
              onPress={props.onNotifications}
              style={s.heroIcon}
            >
              <DunaIcon name="message" color={c.white} size={20} />
              {props.notificationCount > 0 ? (
                <View style={s.notification} />
              ) : null}
            </Pressable>
          </View>
          <View style={s.pagination}>
            {slides.map((item, index) => (
              <Pressable
                key={item.title}
                accessibilityRole="button"
                accessibilityLabel={`Show ${item.title}`}
                accessibilityState={{ selected: slide === index }}
                onPress={() => {
                  carousel.current?.scrollTo({
                    x: index * width,
                    animated: false,
                  });
                  setSlide(index);
                }}
                style={s.dotTarget}
              >
                <View style={[s.dot, slide === index && s.dotActive]} />
              </Pressable>
            ))}
          </View>
        </Animated.View>

        <View style={s.sheet}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Search with Duna AI"
            onPress={props.onOpenInsight}
            style={s.search}
          >
            <DunaIcon name="sparkles" color={c.ink} size={21} />
            <Text style={s.searchText}>Search with Duna</Text>
            <DunaIcon name="arrow-right" color={c.muted} size={20} />
          </Pressable>
          <View style={s.heading}>
            <Text style={s.sectionTitle}>Up next</Text>
            <Pressable
              accessibilityRole="button"
              onPress={props.onOpenSchedule}
              style={s.textTarget}
            >
              <Text style={s.link}>My schedule</Text>
            </Pressable>
          </View>
          <View style={s.activityCard}>
            <Text style={s.cardTitle}>My activities</Text>
            <Text style={s.muted}>
              {activities.length
                ? `${activities.length} upcoming ${activities.length === 1 ? "plan" : "plans"}`
                : "A little space for your next game."}
            </Text>
            {activities.slice(0, 1).map((item) => (
              <UpcomingCard key={item.id} item={item} />
            ))}
            <View style={s.actions}>
              {props.quickActions.slice(0, 4).map((action) => (
                <Pressable
                  accessibilityRole="button"
                  key={action.key}
                  onPress={() => open(action.key, action.onPress)}
                  style={s.action}
                >
                  <View style={s.actionIcon}>
                    <DunaIcon name={action.icon} size={23} color={c.ink} />
                  </View>
                  <Text style={s.actionLabel}>
                    {action.label
                      .replace("Find a ", "")
                      .replace("Book a ", "")
                      .replace("Record video", "Record")}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <Text style={s.sectionTitle}>
            {recent.length ? "Recently visited" : "Explore Duna"}
          </Text>
          <View style={s.recentGrid}>
            {(recent.length ? recent : props.quickActions.slice(2, 6)).map(
              (action, index) => (
                <Pressable
                  accessibilityRole="button"
                  key={action.key}
                  onPress={() => open(action.key, action.onPress)}
                  style={s.recent}
                >
                  <Image
                    source={
                      destinationImages[action.key]
                        ? {
                            uri: `${dunaWebUrl}${destinationImages[action.key]}`,
                          }
                        : photos[index % photos.length]
                    }
                    style={s.thumb}
                  />
                  <Text style={s.recentLabel}>{action.label}</Text>
                </Pressable>
              ),
            )}
          </View>

          <View style={s.heading}>
            <Text style={s.sectionTitle}>
              {activeClub ? `At ${activeClub.name}` : "Find your next game"}
            </Text>
            <Pressable
              onPress={props.onSearch}
              accessibilityRole="button"
              accessibilityLabel="Explore all games"
              style={s.roundButton}
            >
              <DunaIcon name="arrow-right" color={c.ink} size={20} />
            </Pressable>
          </View>
          {props.features.length ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.featureRail}
            >
              {props.features.map((item) => (
                <Pressable
                  accessibilityRole="button"
                  key={item.id}
                  onPress={item.onPress}
                  style={[s.feature, { width: Math.min(width * 0.78, 360) }]}
                >
                  <Image source={{ uri: item.image }} style={s.featureImage} />
                  <Text style={s.featureTitle}>{item.title}</Text>
                  <Text style={s.muted}>{item.detail}</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <View style={s.empty}>
              <Text style={s.cardTitle}>More play is on the way.</Text>
              <Text style={s.muted}>
                Browse all clubs or check back for new sessions.
              </Text>
              <Pressable
                onPress={() => props.onSelectClub(undefined)}
                style={s.textTarget}
              >
                <Text style={s.link}>Explore all clubs</Text>
              </Pressable>
            </View>
          )}
          {props.openGames.length > 0 ? (
            <>
              <Text style={s.sectionTitle}>Open games</Text>
              {props.openGames.slice(0, 2).map((game) => (
                <OpenGameCard key={game.id} game={game} />
              ))}
            </>
          ) : null}
          {props.crew ? (
            <Pressable
              accessibilityRole="button"
              onPress={props.crew.onPress}
              style={s.activityCard}
            >
              <Text style={s.cardTitle}>Better with your people.</Text>
              <Text style={s.muted}>{props.crew.message}</Text>
              <Text style={s.link}>Start a game →</Text>
            </Pressable>
          ) : null}
          <View style={s.heading}>
            <Text style={s.sectionTitle}>Your game</Text>
            <Pressable onPress={props.onOpenMatches} style={s.textTarget}>
              <Text style={s.link}>Sand Rating {props.rating}</Text>
            </Pressable>
          </View>
          {props.recentMatches.slice(0, 2).map((match) => (
            <MatchCard key={match.id} match={match} />
          ))}
          <Pressable
            accessibilityRole="button"
            onPress={props.onOpenInsight}
            style={s.activityCard}
          >
            <Text style={s.cardTitle}>A little insight goes a long way.</Text>
            <Text style={s.muted}>{props.insight}</Text>
            <Text style={s.link}>Ask Duna →</Text>
          </Pressable>
        </View>
      </Animated.ScrollView>

      <Modal
        transparent
        animationType="slide"
        visible={clubSheet}
        onRequestClose={() => setClubSheet(false)}
      >
        <View style={s.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityLabel="Close My Clubs"
            onPress={() => setClubSheet(false)}
          />
          <View
            accessibilityViewIsModal
            style={[s.clubSheet, { paddingBottom: insets.bottom + 25 }]}
          >
            <View style={s.handle} />
            <View style={s.sheetHeading}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close My Clubs"
                onPress={() => setClubSheet(false)}
                style={s.roundButton}
              >
                <DunaIcon name="close" color={c.ink} size={22} />
              </Pressable>
              <Text style={s.cardTitle}>My Clubs</Text>
              <View style={s.roundButton} />
            </View>
            <View style={s.clubSearch}>
              <DunaIcon name="search" color={c.ink} size={20} />
              <TextInput
                accessibilityLabel="Search your clubs"
                placeholder="Search your clubs"
                placeholderTextColor={c.muted}
                value={query}
                onChangeText={setQuery}
                style={s.input}
              />
            </View>
            <ScrollView>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: !props.selectedClub }}
                onPress={() => {
                  props.onSelectClub(undefined);
                  setClubSheet(false);
                }}
                style={s.clubRow}
              >
                <View style={s.clubMark}>
                  <DunaIcon name="court" color={c.ink} size={24} />
                </View>
                <View style={s.flex}>
                  <Text style={s.cardTitle}>All clubs</Text>
                  <Text style={s.muted}>Explore every opportunity to play</Text>
                </View>
                {!props.selectedClub ? (
                  <DunaIcon name="check" color={c.ink} size={22} />
                ) : null}
              </Pressable>
              {filteredClubs.map((club) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{
                    selected: props.selectedClub === club.id,
                  }}
                  key={club.id}
                  onPress={() => {
                    props.onSelectClub(club.id);
                    setClubSheet(false);
                  }}
                  style={s.clubRow}
                >
                  <View style={s.clubMark}>
                    <Text style={s.cardTitle}>
                      {club.name.slice(0, 2).toUpperCase()}
                    </Text>
                  </View>
                  <View style={s.flex}>
                    <Text style={s.cardTitle}>{club.name}</Text>
                    <Text style={s.muted}>Your club</Text>
                  </View>
                  {props.selectedClub === club.id ? (
                    <DunaIcon name="check" color={c.ink} size={22} />
                  ) : null}
                </Pressable>
              ))}
              {!filteredClubs.length ? (
                <Text style={s.muted}>
                  {props.clubs.length
                    ? "No clubs match your search."
                    : "Your connected clubs will appear here."}
                </Text>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.canvas },
  hero: { position: "relative" },
  slide: { justifyContent: "flex-end" },
  veil: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: c.veil,
  },
  heroCopy: { paddingHorizontal: 30, paddingBottom: 115, paddingTop: 60 },
  heroTitle: {
    color: c.white,
    textAlign: "center",
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "400",
  },
  heroDetail: {
    color: c.white,
    textAlign: "center",
    fontSize: 16,
    lineHeight: 24,
    marginTop: 15,
  },
  heroTop: {
    position: "absolute",
    left: 20,
    right: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  heroIcon: {
    width: 50,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.glass,
    borderRadius: 25,
  },
  clubTrigger: {
    minHeight: 50,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: c.glass,
    borderRadius: 25,
    paddingHorizontal: 15,
  },
  clubTriggerText: { color: c.white, fontSize: 14, flexShrink: 1 },
  notification: {
    position: "absolute",
    right: 10,
    top: 10,
    width: 7,
    height: 7,
    borderRadius: 5,
    backgroundColor: c.white,
  },
  pagination: {
    position: "absolute",
    bottom: 45,
    flexDirection: "row",
    alignSelf: "center",
  },
  dotTarget: {
    minWidth: 50,
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    height: 6,
    width: 6,
    borderRadius: 3,
    backgroundColor: c.white,
    opacity: 0.5,
  },
  dotActive: { width: 25, opacity: 1 },
  scroll: { flex: 1 },
  sheet: {
    marginTop: -35,
    padding: 20,
    gap: 20,
    borderTopLeftRadius: 35,
    borderTopRightRadius: 35,
    backgroundColor: c.canvas,
    minHeight: 600,
  },
  search: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: c.surface,
    minHeight: 55,
    paddingHorizontal: 20,
    gap: 12,
    borderRadius: 30,
  },
  searchText: { flex: 1, color: c.ink, fontSize: 17 },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 5,
  },
  sectionTitle: {
    fontSize: 20,
    lineHeight: 27,
    color: c.ink,
    fontWeight: "700",
    flexShrink: 1,
  },
  cardTitle: { fontSize: 18, lineHeight: 25, color: c.ink, fontWeight: "700" },
  muted: { fontSize: 15, lineHeight: 22, color: c.muted },
  activityCard: {
    backgroundColor: c.surface,
    borderRadius: 25,
    padding: 20,
    gap: 10,
  },
  actions: { flexDirection: "row", gap: 5, marginTop: 10 },
  action: { flex: 1, alignItems: "center", gap: 10, minHeight: 90 },
  actionIcon: {
    backgroundColor: c.inset,
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: {
    fontSize: 13,
    lineHeight: 18,
    color: c.ink,
    textAlign: "center",
    textTransform: "capitalize",
  },
  recentGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  recent: {
    flexBasis: "47%",
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: c.surface,
    padding: 10,
    gap: 10,
    borderRadius: 18,
    minHeight: 70,
  },
  thumb: { width: 40, height: 45, borderRadius: 10 },
  recentLabel: { flex: 1, fontSize: 14, lineHeight: 20, color: c.ink },
  featureRail: { gap: 15 },
  feature: { gap: 8 },
  featureImage: {
    width: "100%",
    height: 185,
    borderRadius: 25,
    backgroundColor: c.inset,
  },
  featureTitle: { fontSize: 21, lineHeight: 27, color: c.ink },
  roundButton: {
    minHeight: 50,
    minWidth: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  link: { fontSize: 14, color: c.ink, fontWeight: "500" },
  textTarget: { minHeight: 50, justifyContent: "center" },
  empty: { padding: 20, gap: 8, borderRadius: 20, backgroundColor: c.surface },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: c.scrim,
  },
  clubSheet: {
    minHeight: "55%",
    maxHeight: "85%",
    padding: 20,
    backgroundColor: c.surface,
    borderTopLeftRadius: 35,
    borderTopRightRadius: 35,
    gap: 15,
  },
  handle: {
    width: 40,
    height: 5,
    borderRadius: 5,
    backgroundColor: c.line,
    alignSelf: "center",
  },
  sheetHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  clubSearch: {
    flexDirection: "row",
    borderColor: c.line,
    borderWidth: 1,
    borderRadius: 15,
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 15,
    minHeight: 50,
  },
  input: { flex: 1, fontSize: 16, color: c.ink, minHeight: 50 },
  clubRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 15,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: c.line,
  },
  clubMark: {
    width: 60,
    height: 65,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.inset,
    borderRadius: 15,
  },
  flex: { flex: 1 },
});
