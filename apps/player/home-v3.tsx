/* eslint-disable @typescript-eslint/no-require-imports */
import { dunaAppColors, dunaAppShape, mobileGrid } from "@duna/ui/mobile";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type ImageSourcePropType,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { DunaIcon, type DunaIconName } from "./duna-icon";
import { FellixText as Text } from "./satoshi-text";

const dunaMark = require("./assets/duna-mark.png") as ImageSourcePropType;
const c = dunaAppColors;

export type HomeV3Tab = "all" | "open" | "training" | "circles";

export interface HomeV3Avatar {
  readonly id: string;
  readonly initials: string;
  readonly name?: string;
  readonly rating?: string;
  readonly uri?: string;
}

export interface HomeV3QuickAction {
  readonly key: string;
  readonly label: string;
  readonly icon: DunaIconName;
  readonly color: string;
  readonly recording?: boolean;
  readonly onPress: () => void;
}

export interface HomeV3UpcomingItem {
  readonly id: string;
  readonly category: "match" | "training" | "tournament";
  readonly day: string;
  readonly time: string;
  readonly title: string;
  readonly meta: string;
  readonly recurrence?: string;
  readonly status: "going" | "action" | "detail";
  readonly statusLabel?: string;
  readonly onPress: () => void;
}

export interface HomeV3GameSlot extends HomeV3Avatar {
  readonly open?: false;
}

export interface HomeV3OpenSlot {
  readonly id: string;
  readonly open: true;
}

export interface HomeV3OpenGame {
  readonly id: string;
  readonly time: string;
  readonly booked: boolean;
  readonly location: string;
  readonly teamA: readonly (HomeV3GameSlot | HomeV3OpenSlot)[];
  readonly teamB: readonly (HomeV3GameSlot | HomeV3OpenSlot)[];
  readonly level: string;
  readonly mode: string;
  readonly price: string;
  readonly duration: string;
  readonly tint: string;
  readonly onPress: () => void;
}

export interface HomeV3MatchTeam {
  readonly id: string;
  readonly avatars: readonly HomeV3Avatar[];
  readonly total: number;
  readonly name: string;
  readonly rating?: string;
  readonly winner: boolean;
  readonly sets: readonly {
    readonly value: number;
    readonly won: boolean;
  }[];
}

export interface HomeV3Match {
  readonly id: string;
  readonly kicker: string;
  readonly weather?: string;
  readonly delta: string;
  readonly deltaTone: "positive" | "neutral";
  readonly teams: readonly HomeV3MatchTeam[];
  readonly onPress: () => void;
}

export interface HomeV3Props {
  readonly firstName: string;
  readonly contextLine: string;
  readonly notificationCount: number;
  readonly quickActions: readonly HomeV3QuickAction[];
  readonly crew?: {
    readonly avatars: readonly HomeV3Avatar[];
    readonly overflowCount: number;
    readonly message: string;
    readonly onPress: () => void;
  };
  readonly upcoming: readonly HomeV3UpcomingItem[];
  readonly openGames: readonly HomeV3OpenGame[];
  readonly moreOpenGamesCount: number;
  readonly recentMatches: readonly HomeV3Match[];
  readonly rating: string;
  readonly ratingDelta: string;
  readonly ratingHistory: readonly number[];
  readonly insight: string;
  readonly onSearch: () => void;
  readonly onNotifications: () => void;
  readonly onOpenSchedule: () => void;
  readonly onOpenMap: () => void;
  readonly onOpenMoreGames: () => void;
  readonly onOpenMatches: () => void;
  readonly onOpenInsight: () => void;
}

function Avatar({
  avatar,
  size = 44,
}: {
  avatar: HomeV3Avatar;
  size?: number;
}) {
  const palette = [c.navy, c.sand, c.sky, c.blush] as const;
  const backgroundColor =
    palette[
      Math.abs(
        avatar.id
          .split("")
          .reduce((sum, character) => sum + character.charCodeAt(0), 0),
      ) % palette.length
    ];
  const darkText = backgroundColor !== c.navy;
  return (
    <View
      style={[styles.avatar, { backgroundColor, height: size, width: size }]}
    >
      {avatar.uri ? (
        <Image source={{ uri: avatar.uri }} style={styles.avatarImage} />
      ) : (
        <Text style={[styles.avatarText, darkText && styles.avatarTextDark]}>
          {avatar.initials}
        </Text>
      )}
    </View>
  );
}

function AvatarStack({
  avatars,
  overflowCount = 0,
  size = 32,
}: {
  readonly avatars: readonly HomeV3Avatar[];
  readonly overflowCount?: number;
  readonly size?: number;
}) {
  return (
    <View style={styles.avatarStack}>
      {avatars.slice(0, 2).map((avatar, index) => (
        <View
          key={avatar.id}
          style={{ marginLeft: index === 0 ? 0 : -mobileGrid[2] }}
        >
          <Avatar avatar={avatar} size={size} />
        </View>
      ))}
      {overflowCount > 0 ? (
        <View
          style={[
            styles.avatarOverflow,
            {
              height: size,
              marginLeft: -mobileGrid[2],
              width: size,
            },
          ]}
        >
          <Text style={styles.avatarOverflowText}>+{overflowCount}</Text>
        </View>
      ) : null}
    </View>
  );
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduced,
    );
    return () => subscription.remove();
  }, []);
  return reduced;
}

function QuickAction({
  action,
  reduceMotion,
}: {
  readonly action: HomeV3QuickAction;
  readonly reduceMotion: boolean;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    progress.stopAnimation();
    progress.setValue(0);
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.timing(progress, {
        duration: 2_400,
        easing: Easing.linear,
        toValue: 1,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [progress, reduceMotion]);

  const iconMotion =
    action.key === "find-match"
      ? {
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 0.25, 0.5, 0.75, 1],
                outputRange: [0, -1, -3.5, -1, 0],
              }),
            },
          ],
        }
      : action.key === "find-coach"
        ? {
            transform: [
              {
                rotate: progress.interpolate({
                  inputRange: [0, 0.25, 0.5, 0.75, 1],
                  outputRange: ["0deg", "-5deg", "0deg", "5deg", "0deg"],
                }),
              },
            ],
          }
        : action.key === "create-match"
          ? {
              transform: [
                {
                  scale: progress.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [1, 1.12, 1],
                  }),
                },
              ],
            }
          : undefined;

  return (
    <Pressable
      accessibilityLabel={action.label}
      accessibilityRole="button"
      onPress={action.onPress}
      style={({ pressed }) => [styles.quickAction, pressed && styles.pressed]}
    >
      <View style={styles.quickActionTile}>
        <Animated.View style={iconMotion}>
          <DunaIcon
            color={action.color}
            name={action.icon}
            size={action.icon === "ball" ? 27 : 26}
            strokeWidth={action.icon === "ball" ? 1.35 : 1.55}
          />
        </Animated.View>
        {action.key === "book-court" ? (
          <Animated.View
            style={[
              styles.courtBall,
              {
                transform: [
                  {
                    translateX: progress.interpolate({
                      inputRange: [0, 0.5, 1],
                      outputRange: [-8, 0, 8],
                    }),
                  },
                  {
                    translateY: progress.interpolate({
                      inputRange: [0, 0.5, 1],
                      outputRange: [2, -7, 2],
                    }),
                  },
                ],
              },
            ]}
          />
        ) : null}
        {action.key === "upload-score" ? (
          <Animated.View
            style={[
              styles.scoreDigit,
              {
                transform: [
                  {
                    scaleY: progress.interpolate({
                      inputRange: [0, 0.42, 0.5, 0.58, 1],
                      outputRange: [1, 1, 0.08, 1, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <Text style={styles.scoreDigitText}>2</Text>
          </Animated.View>
        ) : null}
        {action.recording ? (
          <Animated.View
            style={[
              styles.recordingDot,
              {
                opacity: progress.interpolate({
                  inputRange: [0, 0.5, 1],
                  outputRange: [0.55, 1, 0.55],
                }),
                transform: [
                  {
                    scale: progress.interpolate({
                      inputRange: [0, 0.5, 1],
                      outputRange: [0.85, 1.2, 0.85],
                    }),
                  },
                ],
              },
            ]}
          />
        ) : null}
      </View>
      <Text numberOfLines={2} style={styles.quickActionLabel}>
        {action.label}
      </Text>
    </Pressable>
  );
}

function SectionHeader({
  action,
  onAction,
  title,
}: {
  readonly action: string;
  readonly onAction: () => void;
  readonly title: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Pressable hitSlop={10} onPress={onAction}>
        <Text style={styles.sectionAction}>{action}</Text>
      </Pressable>
    </View>
  );
}

function UpcomingCard({ item }: { readonly item: HomeV3UpcomingItem }) {
  return (
    <Pressable
      accessibilityLabel={`${item.title}, ${item.day} at ${item.time}`}
      accessibilityRole="button"
      onPress={item.onPress}
      style={({ pressed }) => [styles.upcomingCard, pressed && styles.pressed]}
    >
      <View style={styles.upcomingDate}>
        <Text style={styles.upcomingDay}>{item.day}</Text>
        <Text style={styles.upcomingTime}>{item.time}</Text>
      </View>
      <View style={styles.upcomingCopy}>
        <Text numberOfLines={1} style={styles.upcomingTitle}>
          {item.title}
        </Text>
        <Text numberOfLines={1} style={styles.upcomingMeta}>
          {item.meta}
        </Text>
        {item.recurrence ? (
          <View style={styles.recurrencePill}>
            <Text style={styles.recurrenceText}>{item.recurrence}</Text>
          </View>
        ) : null}
      </View>
      {item.status === "going" ? (
        <View style={styles.goingStatus}>
          <DunaIcon
            color={c.positive}
            name="check"
            size={12}
            strokeWidth={1.8}
          />
        </View>
      ) : item.status === "action" ? (
        <View style={styles.actionStatus}>
          <Text style={styles.actionStatusText}>
            {item.statusLabel ?? "View"}
          </Text>
        </View>
      ) : (
        <DunaIcon color={c.textTertiary} name="chevron-right" size={18} />
      )}
    </Pressable>
  );
}

function OpenGamePlayer({ slot }: { slot: HomeV3GameSlot | HomeV3OpenSlot }) {
  if (slot.open) {
    return (
      <View style={styles.openPlayer}>
        <View style={styles.openPlayerSlot}>
          <DunaIcon color={c.navyLift} name="plus" size={15} />
        </View>
        <Text style={styles.openPlayerName}>Open</Text>
        <Text style={styles.openPlayerRating}> </Text>
      </View>
    );
  }
  return (
    <View style={styles.openPlayer}>
      <Avatar avatar={slot} size={44} />
      <Text numberOfLines={1} style={styles.openPlayerName}>
        {slot.name?.split(" ")[0] ?? slot.initials}
      </Text>
      <Text style={styles.openPlayerRating}>{slot.rating ?? " "}</Text>
    </View>
  );
}

function OpenGameCard({ game }: { readonly game: HomeV3OpenGame }) {
  return (
    <Pressable
      accessibilityLabel={`${game.time}, ${game.location}, ${game.level}`}
      accessibilityRole="button"
      onPress={game.onPress}
      style={({ pressed }) => [styles.openGameCard, pressed && styles.pressed]}
    >
      <View style={styles.openGameHeader}>
        <Text style={styles.openGameTime}>{game.time}</Text>
        {game.booked ? (
          <View style={styles.bookedStatus}>
            <View style={styles.bookedCheck}>
              <DunaIcon
                color={c.positive}
                name="check"
                size={10}
                strokeWidth={2}
              />
            </View>
            <Text style={styles.bookedText}>Court booked</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.openGameLocationRow}>
        <View style={styles.locationPin}>
          <View style={styles.locationPinCenter} />
        </View>
        <Text numberOfLines={1} style={styles.openGameLocation}>
          {game.location}
        </Text>
      </View>
      <View style={styles.roster}>
        {game.teamA.slice(0, 2).map((slot) => (
          <OpenGamePlayer key={slot.id} slot={slot} />
        ))}
        <View style={styles.rosterDivider} />
        {game.teamB.slice(0, 2).map((slot) => (
          <OpenGamePlayer key={slot.id} slot={slot} />
        ))}
      </View>
      <View style={styles.openGameFooter}>
        <View style={styles.openGameDetails}>
          <Text style={styles.openGameLevel}>{game.level}</Text>
          <Text style={styles.openGameMode}>{game.mode}</Text>
        </View>
        <View style={[styles.openGamePrice, { backgroundColor: game.tint }]}>
          <Text style={styles.openGamePriceValue}>{game.price}</Text>
          <Text style={styles.openGameDuration}>{game.duration}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function MatchTeamRow({ team }: { readonly team: HomeV3MatchTeam }) {
  return (
    <View style={styles.matchTeamRow}>
      <AvatarStack
        avatars={team.avatars}
        overflowCount={Math.max(0, team.total - team.avatars.length)}
        size={28}
      />
      <View style={styles.matchTeamCopy}>
        <Text numberOfLines={1} style={styles.matchTeamName}>
          {team.name}
        </Text>
        {team.rating ? (
          <Text numberOfLines={1} style={styles.matchTeamRating}>
            {team.rating}
          </Text>
        ) : null}
      </View>
      <View
        style={[styles.matchWinner, !team.winner && styles.matchWinnerEmpty]}
      >
        {team.winner ? (
          <DunaIcon color={c.navy} name="check" size={10} strokeWidth={2} />
        ) : null}
      </View>
      {team.sets.map((set, index) => (
        <Text
          key={`${team.id}-set-${index}`}
          style={[styles.setScore, set.won && styles.setScoreWon]}
        >
          {set.value}
        </Text>
      ))}
    </View>
  );
}

function MatchCard({ match }: { readonly match: HomeV3Match }) {
  return (
    <Pressable
      accessibilityLabel={`${match.kicker}${match.weather ? `, ${match.weather}` : ""}, rating ${match.delta}`}
      accessibilityRole="button"
      onPress={match.onPress}
      style={({ pressed }) => [styles.matchCard, pressed && styles.pressed]}
    >
      <View style={styles.matchCardHeader}>
        <Text numberOfLines={1} style={styles.matchKicker}>
          {match.kicker}
        </Text>
        <Text
          style={[
            styles.matchDelta,
            match.deltaTone === "positive" && styles.matchDeltaPositive,
          ]}
        >
          {match.delta}
        </Text>
      </View>
      {match.weather ? (
        <Text numberOfLines={1} style={styles.matchWeather}>
          {match.weather}
        </Text>
      ) : null}
      <View style={styles.matchTeams}>
        {match.teams.map((team) => (
          <MatchTeamRow key={team.id} team={team} />
        ))}
      </View>
    </Pressable>
  );
}

function RatingSparkline({ data }: { readonly data: readonly number[] }) {
  const points = useMemo(() => {
    if (data.length < 2) return "";
    const minimum = Math.min(...data);
    const span = Math.max(0.01, Math.max(...data) - minimum);
    return data
      .map((value, index) => {
        const x = (index / (data.length - 1)) * 88 + 2;
        const y = 25 - ((value - minimum) / span) * 20;
        return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  }, [data]);
  if (!points) return <View style={styles.sparklinePlaceholder} />;
  return (
    <Svg height={30} viewBox="0 0 92 30" width={92}>
      <Path
        d={points}
        fill="none"
        stroke={c.navy}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
      />
    </Svg>
  );
}

export function HomeV3Screen(props: HomeV3Props) {
  const [activeTab, setActiveTab] = useState<HomeV3Tab>("all");
  const reduceMotion = useReducedMotion();
  const tabs: readonly { key: HomeV3Tab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "open", label: "Open games" },
    { key: "training", label: "Training" },
    { key: "circles", label: "My circles" },
  ];
  const visibleUpcoming =
    activeTab === "training"
      ? props.upcoming.filter((item) => item.category === "training")
      : props.upcoming;
  const showCrew =
    (activeTab === "all" || activeTab === "circles") && props.crew;
  const showUpcoming = activeTab === "all" || activeTab === "training";
  const showOpen = activeTab === "all" || activeTab === "open";
  const showMatches = activeTab === "all" || activeTab === "circles";
  const showInsight = activeTab === "all" || activeTab === "training";

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.greeting}>Good morning, {props.firstName}.</Text>
          <Text style={styles.context}>{props.contextLine}</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityLabel="Search Duna"
            accessibilityRole="button"
            onPress={props.onSearch}
            style={({ pressed }) => [
              styles.iconButton,
              pressed && styles.pressed,
            ]}
          >
            <DunaIcon
              color={c.ink}
              name="search"
              size={21}
              strokeWidth={1.45}
            />
          </Pressable>
          <Pressable
            accessibilityLabel="Notifications"
            accessibilityRole="button"
            onPress={props.onNotifications}
            style={({ pressed }) => [
              styles.iconButton,
              pressed && styles.pressed,
            ]}
          >
            <DunaIcon color={c.ink} name="bell" size={21} strokeWidth={1.4} />
            {props.notificationCount > 0 ? (
              <View style={styles.notificationDot} />
            ) : null}
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.quickActions}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {props.quickActions.map((action) => (
          <QuickAction
            action={action}
            key={action.key}
            reduceMotion={reduceMotion}
          />
        ))}
      </ScrollView>

      <View style={styles.tabs}>
        {tabs.map((tab) => {
          const active = tab.key === activeTab;
          return (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={styles.tab}
            >
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                {tab.label}
              </Text>
              <View
                style={[
                  styles.tabIndicator,
                  active && styles.tabIndicatorActive,
                ]}
              />
            </Pressable>
          );
        })}
      </View>

      {showCrew ? (
        <View style={styles.sectionInset}>
          <Pressable
            accessibilityLabel={showCrew.message}
            accessibilityRole="button"
            onPress={showCrew.onPress}
            style={({ pressed }) => [
              styles.crewCard,
              pressed && styles.pressed,
            ]}
          >
            <AvatarStack
              avatars={showCrew.avatars}
              overflowCount={showCrew.overflowCount}
              size={32}
            />
            <Text style={styles.crewMessage}>{showCrew.message}</Text>
            <DunaIcon
              color={c.ink}
              name="arrow-right"
              size={18}
              strokeWidth={1.4}
            />
          </Pressable>
        </View>
      ) : null}

      {showUpcoming ? (
        <View style={styles.sectionInset}>
          <SectionHeader
            action="See schedule"
            onAction={props.onOpenSchedule}
            title="Next up"
          />
          <View style={styles.cardList}>
            {visibleUpcoming.length > 0 ? (
              visibleUpcoming
                .slice(0, 3)
                .map((item) => <UpcomingCard item={item} key={item.id} />)
            ) : (
              <Pressable
                onPress={props.onSearch}
                style={({ pressed }) => [
                  styles.emptyCard,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.emptyTitle}>Your schedule is open.</Text>
                <Text style={styles.emptyBody}>
                  Find a game, court, or training session nearby.
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      ) : null}

      {showOpen ? (
        <View style={styles.openSection}>
          <View style={styles.openSectionHeading}>
            <View style={styles.openSectionCopy}>
              <Text style={styles.openSectionTitle}>Open games tonight</Text>
              <Text style={styles.openSectionMeta}>
                Matched to your {props.rating} · nearby
              </Text>
            </View>
            <Pressable hitSlop={10} onPress={props.onOpenMap}>
              <Text style={styles.openSectionMap}>Map</Text>
            </Pressable>
          </View>
          <View style={styles.openGamesList}>
            {props.openGames.length > 0 ? (
              props.openGames
                .slice(0, 2)
                .map((game) => <OpenGameCard game={game} key={game.id} />)
            ) : (
              <Pressable
                onPress={props.onOpenMoreGames}
                style={styles.openEmpty}
              >
                <Text style={styles.openEmptyTitle}>
                  No open runs tonight yet.
                </Text>
                <Text style={styles.openEmptyBody}>
                  See nearby games or start one for your circle.
                </Text>
              </Pressable>
            )}
          </View>
          <Pressable
            onPress={props.onOpenMoreGames}
            style={styles.moreOpenGames}
          >
            <Text style={styles.moreOpenGamesText}>
              {props.moreOpenGamesCount > 0
                ? `${props.moreOpenGamesCount} more open tonight →`
                : "See all open games →"}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {showMatches ? (
        <View style={styles.sectionInset}>
          <SectionHeader
            action="See all"
            onAction={props.onOpenMatches}
            title="Recent matches"
          />
          <View style={styles.cardList}>
            {props.recentMatches.length > 0 ? (
              props.recentMatches
                .slice(0, 3)
                .map((match) => <MatchCard key={match.id} match={match} />)
            ) : (
              <Pressable onPress={props.onOpenMatches} style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No verified matches yet.</Text>
                <Text style={styles.emptyBody}>
                  Completed results and rating changes will appear here.
                </Text>
              </Pressable>
            )}
          </View>
          <Pressable onPress={props.onOpenMatches} style={styles.ratingStrip}>
            <Text style={styles.ratingLabel}>SAND RATING</Text>
            <RatingSparkline data={props.ratingHistory} />
            <View style={styles.ratingValues}>
              <Text style={styles.ratingValue}>{props.rating}</Text>
              <Text
                style={[
                  styles.ratingDelta,
                  props.ratingDelta.startsWith("-") &&
                    styles.ratingDeltaNegative,
                ]}
              >
                {props.ratingDelta}
              </Text>
            </View>
          </Pressable>
        </View>
      ) : null}

      {showInsight ? (
        <View style={styles.insightInset}>
          <Pressable
            accessibilityLabel="Open this insight in Duna AI"
            accessibilityRole="button"
            onPress={props.onOpenInsight}
            style={({ pressed }) => [
              styles.insightCard,
              pressed && styles.pressed,
            ]}
          >
            <Image source={dunaMark} style={styles.insightMark} />
            <View style={styles.insightCopy}>
              <Text style={styles.insightEyebrow}>DUNA INSIGHT</Text>
              <Text numberOfLines={2} style={styles.insightText}>
                {props.insight}
              </Text>
            </View>
            <DunaIcon color={c.navyLift} name="arrow-right" size={18} />
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    backgroundColor: c.page,
    paddingBottom: 138,
  },
  pressed: { opacity: 0.76, transform: [{ scale: 0.988 }] },
  header: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: mobileGrid[2],
    justifyContent: "space-between",
    paddingHorizontal: mobileGrid[3] + 1,
    paddingTop: mobileGrid[4] + 2,
  },
  headerCopy: { flex: 1, minWidth: 0 },
  greeting: {
    color: c.ink,
    fontSize: 28,
    fontWeight: "600",
    letterSpacing: -0.6,
    lineHeight: 31,
    maxWidth: 245,
  },
  context: {
    color: c.textTertiary,
    fontSize: 14,
    lineHeight: 19,
    marginTop: mobileGrid[1],
  },
  headerActions: { flexDirection: "row", gap: mobileGrid[2] - 2 },
  iconButton: {
    alignItems: "center",
    backgroundColor: c.card,
    borderColor: c.hairline,
    borderRadius: dunaAppShape.pillRadius,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    position: "relative",
    width: 42,
  },
  notificationDot: {
    backgroundColor: c.navyLift,
    borderColor: c.card,
    borderRadius: 5,
    borderWidth: 1.5,
    height: 8,
    position: "absolute",
    right: 5,
    top: 5,
    width: 8,
  },
  quickActions: {
    gap: mobileGrid[2],
    paddingHorizontal: mobileGrid[3] + 1,
    paddingTop: mobileGrid[6],
  },
  quickAction: { alignItems: "center", width: 82 },
  quickActionTile: {
    alignItems: "center",
    backgroundColor: c.subtle,
    borderRadius: dunaAppShape.actionTileRadius,
    height: 64,
    justifyContent: "center",
    position: "relative",
    width: 82,
  },
  quickActionLabel: {
    color: c.ink,
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 15,
    marginTop: 7,
    textAlign: "center",
  },
  courtBall: {
    backgroundColor: c.gold,
    borderRadius: 3,
    height: 5,
    left: 39,
    position: "absolute",
    top: 28,
    width: 5,
  },
  scoreDigit: {
    alignItems: "center",
    backgroundColor: c.subtle,
    height: 12,
    justifyContent: "center",
    left: 29,
    position: "absolute",
    top: 26,
    width: 10,
  },
  scoreDigitText: {
    color: c.navy,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 10,
  },
  recordingDot: {
    backgroundColor: c.danger,
    borderColor: c.subtle,
    borderRadius: 5,
    borderWidth: 1.5,
    height: 8,
    position: "absolute",
    right: 24,
    top: 19,
    width: 8,
  },
  tabs: {
    borderBottomColor: c.subtleStrong,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: mobileGrid[5],
    paddingHorizontal: mobileGrid[3] + 1,
  },
  tab: { alignItems: "center", paddingHorizontal: 1 },
  tabLabel: {
    color: c.textTertiary,
    fontSize: 15,
    fontWeight: "500",
    lineHeight: 20,
    paddingBottom: mobileGrid[2],
  },
  tabLabelActive: { color: c.ink, fontWeight: "600" },
  tabIndicator: { backgroundColor: "transparent", height: 2, width: "100%" },
  tabIndicatorActive: { backgroundColor: c.ink },
  sectionInset: {
    paddingHorizontal: mobileGrid[3] + 1,
    paddingTop: mobileGrid[5],
  },
  insightInset: {
    paddingHorizontal: mobileGrid[3] + 1,
    paddingTop: mobileGrid[3],
  },
  crewCard: {
    alignItems: "center",
    backgroundColor: c.card,
    borderColor: c.hairline,
    borderRadius: dunaAppShape.actionTileRadius,
    borderWidth: 1,
    flexDirection: "row",
    gap: mobileGrid[3],
    minHeight: 82,
    padding: mobileGrid[3],
  },
  avatarStack: { alignItems: "center", flexDirection: "row" },
  avatar: {
    alignItems: "center",
    borderColor: c.card,
    borderRadius: dunaAppShape.pillRadius,
    borderWidth: 2,
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: { height: "100%", width: "100%" },
  avatarText: { color: c.page, fontSize: 12, fontWeight: "600" },
  avatarTextDark: { color: c.navy },
  avatarOverflow: {
    alignItems: "center",
    backgroundColor: c.sky,
    borderColor: c.card,
    borderRadius: dunaAppShape.pillRadius,
    borderWidth: 2,
    justifyContent: "center",
  },
  avatarOverflowText: { color: c.navy, fontSize: 12, fontWeight: "600" },
  crewMessage: {
    color: c.ink,
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    lineHeight: 20,
  },
  sectionHeader: {
    alignItems: "baseline",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: mobileGrid[2] + 2,
  },
  sectionTitle: {
    color: c.ink,
    fontSize: 20,
    fontWeight: "600",
    letterSpacing: -0.2,
    lineHeight: 26,
  },
  sectionAction: { color: c.textSecondary, fontSize: 14, fontWeight: "500" },
  cardList: { gap: mobileGrid[2] },
  upcomingCard: {
    alignItems: "center",
    backgroundColor: c.card,
    borderColor: c.hairline,
    borderRadius: dunaAppShape.cardRadius,
    borderWidth: 1,
    flexDirection: "row",
    gap: mobileGrid[3],
    minHeight: 92,
    padding: mobileGrid[3],
  },
  upcomingDate: {
    alignItems: "center",
    backgroundColor: c.cream,
    borderRadius: dunaAppShape.compactRadius,
    height: 56,
    justifyContent: "center",
    width: 54,
  },
  upcomingDay: {
    color: c.textTertiary,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.6,
    lineHeight: 13,
  },
  upcomingTime: {
    color: c.navy,
    fontSize: 16,
    fontVariant: ["tabular-nums"],
    fontWeight: "600",
    lineHeight: 20,
    marginTop: 1,
  },
  upcomingCopy: { flex: 1, minWidth: 0 },
  upcomingTitle: {
    color: c.ink,
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 20,
  },
  upcomingMeta: {
    color: c.textTertiary,
    fontSize: 13,
    lineHeight: 17,
    marginTop: 2,
  },
  recurrencePill: {
    alignSelf: "flex-start",
    backgroundColor: c.subtleStrong,
    borderRadius: dunaAppShape.pillRadius,
    marginTop: 6,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  recurrenceText: {
    color: c.navyLift,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.45,
  },
  goingStatus: {
    alignItems: "center",
    backgroundColor: c.positiveWash,
    borderRadius: 12,
    height: 24,
    justifyContent: "center",
    width: 24,
  },
  actionStatus: {
    backgroundColor: c.blush,
    borderRadius: dunaAppShape.pillRadius,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  actionStatusText: { color: c.navy, fontSize: 12.5, fontWeight: "600" },
  emptyCard: {
    backgroundColor: c.card,
    borderColor: c.hairline,
    borderRadius: dunaAppShape.cardRadius,
    borderWidth: 1,
    padding: mobileGrid[4],
  },
  emptyTitle: { color: c.ink, fontSize: 15, fontWeight: "600" },
  emptyBody: {
    color: c.textTertiary,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  openSection: {
    backgroundColor: c.navy,
    borderRadius: dunaAppShape.sectionRadius,
    marginHorizontal: mobileGrid[2] + 2,
    marginTop: mobileGrid[5],
    padding: mobileGrid[2] + 2,
    paddingTop: mobileGrid[4],
  },
  openSectionHeading: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: mobileGrid[2],
    justifyContent: "space-between",
    paddingHorizontal: mobileGrid[2] - 2,
  },
  openSectionCopy: { flex: 1, minWidth: 0 },
  openSectionTitle: {
    color: c.page,
    fontSize: 20,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  openSectionMeta: {
    color: c.mist,
    fontSize: 13,
    lineHeight: 17,
    marginTop: 5,
  },
  openSectionMap: { color: c.mist, fontSize: 14, fontWeight: "500" },
  openGamesList: { gap: mobileGrid[2], marginTop: mobileGrid[3] },
  openGameCard: {
    backgroundColor: c.page,
    borderRadius: dunaAppShape.cardRadius,
    overflow: "hidden",
  },
  openGameHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: mobileGrid[3],
    paddingTop: mobileGrid[3],
  },
  openGameTime: {
    color: c.ink,
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: -0.15,
  },
  bookedStatus: { alignItems: "center", flexDirection: "row", gap: 6 },
  bookedCheck: {
    alignItems: "center",
    backgroundColor: c.positiveWash,
    borderRadius: 10,
    height: 20,
    justifyContent: "center",
    width: 20,
  },
  bookedText: { color: c.positive, fontSize: 12.5, fontWeight: "500" },
  openGameLocationRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: mobileGrid[2] - 2,
    paddingHorizontal: mobileGrid[3],
    paddingTop: mobileGrid[2],
  },
  locationPin: {
    alignItems: "center",
    backgroundColor: c.gold,
    borderRadius: 11,
    height: 22,
    justifyContent: "center",
    width: 22,
  },
  locationPinCenter: {
    borderColor: c.navy,
    borderRadius: 3,
    borderWidth: 1.3,
    height: 6,
    width: 6,
  },
  openGameLocation: { color: c.textSecondary, flex: 1, fontSize: 13.5 },
  roster: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-around",
    paddingHorizontal: mobileGrid[2],
    paddingVertical: mobileGrid[3],
  },
  rosterDivider: {
    alignSelf: "center",
    backgroundColor: c.hairline,
    height: 64,
    width: 1,
  },
  openPlayer: { alignItems: "center", minWidth: 56 },
  openPlayerSlot: {
    alignItems: "center",
    borderColor: c.mist,
    borderRadius: 22,
    borderStyle: "dashed",
    borderWidth: 1.4,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  openPlayerName: {
    color: c.navyLift,
    fontSize: 12,
    fontWeight: "500",
    marginTop: 4,
    maxWidth: 62,
  },
  openPlayerRating: {
    color: c.textTertiary,
    fontSize: 12,
    lineHeight: 14,
    marginTop: 1,
  },
  openGameFooter: {
    borderTopColor: c.subtleStrong,
    borderTopWidth: 1,
    flexDirection: "row",
  },
  openGameDetails: {
    flex: 1,
    paddingHorizontal: mobileGrid[3],
    paddingVertical: 13,
  },
  openGameLevel: { color: c.ink, fontSize: 14, fontWeight: "600" },
  openGameMode: { color: c.textTertiary, fontSize: 13, marginTop: 2 },
  openGamePrice: { alignItems: "center", justifyContent: "center", width: 104 },
  openGamePriceValue: { color: c.navy, fontSize: 17, fontWeight: "600" },
  openGameDuration: { color: c.navy, fontSize: 12.5, marginTop: 1 },
  openEmpty: {
    backgroundColor: c.page,
    borderRadius: dunaAppShape.cardRadius,
    padding: mobileGrid[4],
  },
  openEmptyTitle: { color: c.ink, fontSize: 15, fontWeight: "600" },
  openEmptyBody: {
    color: c.textTertiary,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  moreOpenGames: { alignItems: "center", paddingBottom: 7, paddingTop: 14 },
  moreOpenGamesText: { color: c.page, fontSize: 14, fontWeight: "500" },
  matchCard: {
    backgroundColor: c.card,
    borderColor: c.hairline,
    borderRadius: dunaAppShape.cardRadius,
    borderWidth: 1,
    padding: mobileGrid[3],
  },
  matchCardHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: mobileGrid[2],
    justifyContent: "space-between",
  },
  matchKicker: {
    color: c.textTertiary,
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.6,
  },
  matchDelta: {
    color: c.textTertiary,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
    fontWeight: "500",
  },
  matchDeltaPositive: { color: c.positive },
  matchWeather: {
    color: c.textSecondary,
    fontSize: 12,
    lineHeight: 16,
    marginTop: mobileGrid[1],
  },
  matchTeams: { gap: mobileGrid[2], marginTop: mobileGrid[2] + 2 },
  matchTeamRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: mobileGrid[2],
  },
  matchTeamCopy: { flex: 1, minWidth: 0 },
  matchTeamName: { color: c.ink, fontSize: 13.5, fontWeight: "500" },
  matchTeamRating: { color: c.textTertiary, fontSize: 12, marginTop: 1 },
  matchWinner: {
    alignItems: "center",
    backgroundColor: c.gold,
    borderRadius: 9,
    height: 18,
    justifyContent: "center",
    width: 18,
  },
  matchWinnerEmpty: { backgroundColor: "transparent" },
  setScore: {
    color: c.textFaint,
    fontSize: 15,
    fontVariant: ["tabular-nums"],
    minWidth: 24,
    textAlign: "center",
  },
  setScoreWon: { color: c.navy, fontWeight: "600" },
  ratingStrip: {
    alignItems: "center",
    backgroundColor: c.cream,
    borderRadius: dunaAppShape.actionTileRadius,
    flexDirection: "row",
    gap: mobileGrid[2],
    marginTop: mobileGrid[2],
    minHeight: 62,
    paddingHorizontal: mobileGrid[3],
  },
  ratingLabel: {
    color: c.textTertiary,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.8,
  },
  sparklinePlaceholder: { flex: 1, height: 30 },
  ratingValues: {
    alignItems: "baseline",
    flexDirection: "row",
    gap: 7,
    marginLeft: "auto",
  },
  ratingValue: {
    color: c.navy,
    fontSize: 22,
    fontVariant: ["tabular-nums"],
    fontWeight: "600",
  },
  ratingDelta: {
    color: c.positive,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
    fontWeight: "500",
  },
  ratingDeltaNegative: { color: c.danger },
  insightCard: {
    alignItems: "center",
    backgroundColor: c.sky,
    borderRadius: dunaAppShape.actionTileRadius,
    flexDirection: "row",
    gap: mobileGrid[2] + 2,
    minHeight: 72,
    padding: mobileGrid[3],
  },
  insightMark: { borderRadius: 7, height: 30, width: 30 },
  insightCopy: { flex: 1, minWidth: 0 },
  insightEyebrow: {
    color: c.navyLift,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.8,
  },
  insightText: {
    color: c.navy,
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 18,
    marginTop: 3,
  },
});
