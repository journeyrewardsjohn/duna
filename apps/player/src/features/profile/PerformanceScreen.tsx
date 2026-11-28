import { demoMatches, demoPlayer } from "@duna/core/demo";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Image,
  ImageBackground,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";
import { dunaWebUrl } from "../../../mobile-api";
import { usePlayerRuntime } from "../../../runtime";
import { PlayerCalendarSettings } from "../../../calendar-settings";
import { TournamentPasses } from "../../../tournament-passes";
import { SatoshiText as Text } from "../../../satoshi-text";
import type {
  MobilePlayerIntelligence,
  MobilePlayerPerformance,
  MobilePerformanceMatch,
} from "../matches/performance-types";
import { matchSides, MobileResultCard } from "../matches/MobileResultCard";
import { colors, rgba } from "../../shared/palette";
import { useReducedMotion } from "../../shared/use-reduced-motion";
import { selectionHaptic } from "../../shared/haptics";
import { Pill } from "../../shared/Pill";
import { AppHeader } from "../../app/AppHeader";
import { MemberOrganizationCard } from "../clubs/MemberOrganizationCard";
import { SectionHeader } from "../../shared/SectionHeader";
import { PredictionWalletSummaryCard } from "../predictions/PredictionWalletSummaryCard";
import { styles } from "../../legacy/styles";

const demoPerformanceSnapshots = [
  {
    beforeDisplay: 4.54,
    afterDisplay: 4.62,
    expectedWinProbability: 0.43,
    actualResult: 1,
    pointShare: 0.519,
    verificationWeightBps: 10_000,
  },
  {
    beforeDisplay: 4.58,
    afterDisplay: 4.54,
    expectedWinProbability: 0.61,
    actualResult: 0,
    pointShare: 0.455,
    verificationWeightBps: 9_600,
  },
  {
    beforeDisplay: 4.53,
    afterDisplay: 4.58,
    expectedWinProbability: 0.55,
    actualResult: 1,
    pointShare: 0.592,
    verificationWeightBps: 9_200,
  },
] as const;

const demoPerformanceHistory = demoMatches.map((match, index) => {
  const snapshot =
    demoPerformanceSnapshots[index] ??
    demoPerformanceSnapshots[demoPerformanceSnapshots.length - 1]!;
  return {
    id: `demo-rating-${match.id}`,
    matchId: match.id,
    beforeDisplay: snapshot.beforeDisplay,
    afterDisplay: snapshot.afterDisplay,
    delta: match.ratingDelta,
    expectedWinProbability: snapshot.expectedWinProbability,
    actualResult: snapshot.actualResult,
    pointShare: snapshot.pointShare,
    verificationWeightBps: snapshot.verificationWeightBps,
    occurredAt: match.playedAt,
    matchTitle: `${match.venueName} match`,
    sourceUrl: undefined,
    sets: match.score.map(([a, b]) => ({ a, b })),
    participants: [
      ...match.teamA.map((person) => ({
        externalPersonId: `demo:${person.id}`,
        personId: person.id,
        name: person.displayName,
        side: "A" as const,
      })),
      ...match.teamB.map((person) => ({
        externalPersonId: `demo:${person.id}`,
        personId: person.id,
        name: person.displayName,
        side: "B" as const,
      })),
    ],
    resultStory: {
      summary:
        snapshot.actualResult >= 0.5
          ? "Held the line when it tightened and carried the result home."
          : "Made the margins meaningful—clear evidence, reset, next serve ahead.",
      source: "computed" as const,
    },
  };
}) satisfies readonly MobilePerformanceMatch[];

export function PerformanceScreen({
  onArtwork,
  onEditProfile,
  onHealth,
  onPredictions,
  onWallet,
}: {
  readonly onArtwork: () => void;
  readonly onEditProfile: () => void;
  readonly onHealth: () => void;
  readonly onPredictions: () => void;
  readonly onWallet: () => void;
}) {
  const { client, dashboard, mode, settings, signOut } = usePlayerRuntime();
  const player = dashboard?.player ?? demoPlayer;
  const fallbackMatches = dashboard?.recentMatches ?? demoMatches;
  const [intelligence, setIntelligence] = useState<MobilePlayerIntelligence>();
  const [performance, setPerformance] = useState<MobilePlayerPerformance>();
  const [resultRange, setResultRange] = useState<12 | 30 | "all">(12);
  const reducedMotion = useReducedMotion();
  const performanceScrollY = useRef(new Animated.Value(0)).current;
  const { width: viewportWidth } = useWindowDimensions();

  useEffect(() => {
    if (!client || mode === "preview") return;
    let active = true;
    void Promise.all([
      client.public.playerIntelligence
        .query({ handle: player.handle })
        .catch(() => undefined),
      client.public.playerPerformance
        .query({ handle: player.handle })
        .catch(() => undefined),
    ]).then(([nextIntelligence, nextPerformance]) => {
      if (!active) return;
      setIntelligence(nextIntelligence);
      setPerformance(nextPerformance);
    });
    return () => {
      active = false;
    };
  }, [client, mode, player.handle]);

  const profile = intelligence?.profile;
  const history =
    performance?.history ?? (mode === "preview" ? demoPerformanceHistory : []);
  const chronological = [...history].reverse();
  const recentForm = history.slice(0, 10);
  const wins = history.filter((match) => match.actualResult >= 0.5).length;
  const losses = Math.max(0, history.length - wins);
  const winRate = history.length
    ? Math.round((wins / history.length) * 100)
    : 0;
  const lastTenWins = recentForm.filter(
    (match) => match.actualResult >= 0.5,
  ).length;
  const startRating = chronological[0]?.beforeDisplay;
  const currentRating =
    chronological.at(-1)?.afterDisplay ?? player.rating.display;
  const netMovement =
    startRating === undefined
      ? (player.rating.delta ?? 0)
      : currentRating - startRating;
  const biggestUpset = history
    .filter((match) => match.actualResult >= 0.5)
    .sort(
      (left, right) =>
        left.expectedWinProbability - right.expectedWinProbability,
    )[0];
  const toughestLoss = history
    .filter((match) => match.actualResult < 0.5)
    .sort(
      (left, right) =>
        right.expectedWinProbability - left.expectedWinProbability,
    )[0];
  const chartMatches = chronological.slice(-18);
  const chartWidth = Math.max(248, viewportWidth - 72);
  const chartHeight = 132;
  const pulseMatches = history.slice(0, 12).reverse();
  const positiveDeltas = history
    .filter((match) => match.delta > 0)
    .map((match) => match.delta);
  const negativeDeltas = history
    .filter((match) => match.delta < 0)
    .map((match) => Math.abs(match.delta));
  const averagePositiveDelta = positiveDeltas.length
    ? positiveDeltas.reduce((total, value) => total + value, 0) /
      positiveDeltas.length
    : 0;
  const averageNegativeDelta = negativeDeltas.length
    ? negativeDeltas.reduce((total, value) => total + value, 0) /
      negativeDeltas.length
    : 0;
  const upsetWins = history.filter(
    (match) => match.actualResult >= 0.5 && match.expectedWinProbability < 0.5,
  ).length;
  const favoriteWins = history.filter(
    (match) => match.actualResult >= 0.5 && match.expectedWinProbability >= 0.5,
  ).length;
  const favoriteLosses = history.filter(
    (match) => match.actualResult < 0.5 && match.expectedWinProbability >= 0.5,
  ).length;
  const ratingValues = chartMatches.flatMap((match) => [
    match.beforeDisplay,
    match.afterDisplay,
  ]);
  const minimumRating = ratingValues.length
    ? Math.min(...ratingValues)
    : currentRating - 0.12;
  const maximumRating = ratingValues.length
    ? Math.max(...ratingValues)
    : currentRating + 0.12;
  const chartRange = Math.max(0.01, maximumRating - minimumRating);
  const chartPoints = chartMatches.map((match, index) => ({
    match,
    x:
      chartMatches.length <= 1
        ? chartWidth / 2
        : (index / (chartMatches.length - 1)) * chartWidth,
    y:
      chartHeight -
      10 -
      ((match.afterDisplay - minimumRating) / chartRange) * (chartHeight - 20),
  }));
  const chartPath = chartPoints
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`)
    .join(" ");
  const participantProfileById = new Map(
    (performance?.participantProfiles ?? []).map((profile) => [
      profile.id,
      profile,
    ]),
  );
  let setsWon = 0;
  let setsLost = 0;
  let decidingSetWins = 0;
  let decidingSetMatches = 0;
  const opponentRatings: number[] = [];
  const partnerRecords = new Map<
    string,
    { name: string; wins: number; matches: number }
  >();
  for (const match of history) {
    const ownSide = match.participants.find(
      (participant) => participant.personId === player.id,
    )?.side;
    if (!ownSide) continue;
    for (const set of match.sets) {
      const ownScore = ownSide === "A" ? set.a : set.b;
      const opponentScore = ownSide === "A" ? set.b : set.a;
      if (ownScore > opponentScore) setsWon += 1;
      if (ownScore < opponentScore) setsLost += 1;
    }
    if (match.sets.length >= 3) {
      decidingSetMatches += 1;
      if (match.actualResult >= 0.5) decidingSetWins += 1;
    }
    for (const participant of match.participants) {
      if (!participant.personId || participant.personId === player.id) continue;
      if (participant.side === ownSide) {
        const record = partnerRecords.get(participant.personId) ?? {
          name: participant.name,
          wins: 0,
          matches: 0,
        };
        record.matches += 1;
        if (match.actualResult >= 0.5) record.wins += 1;
        partnerRecords.set(participant.personId, record);
      } else {
        const rating = participantProfileById.get(
          participant.personId,
        )?.sandRating;
        if (rating !== undefined) opponentRatings.push(rating);
      }
    }
  }
  const averagePointShare = history.length
    ? history.reduce((total, match) => total + match.pointShare, 0) /
      history.length
    : 0;
  const averageOpponentRating = opponentRatings.length
    ? opponentRatings.reduce((total, rating) => total + rating, 0) /
      opponentRatings.length
    : undefined;
  const bestPartners = [...partnerRecords.values()]
    .sort(
      (left, right) =>
        right.matches - left.matches ||
        right.wins / right.matches - left.wins / left.matches,
    )
    .slice(0, 3);
  const visibleResults =
    resultRange === "all" ? history : history.slice(0, resultRange);
  const worldRank = performance?.worldRanking;
  const professionalStatistics = performance?.professionalStatistics;
  const worldMovement = worldRank?.previousRank
    ? worldRank.previousRank - worldRank.rank
    : undefined;
  const fallbackProfileMetrics = [
    {
      label: "Record",
      value: history.length ? `${wins}–${losses}` : `${fallbackMatches.length}`,
    },
    { label: "Win rate", value: history.length ? `${winRate}%` : "Pending" },
    {
      label: "Last 10",
      value: recentForm.length
        ? `${lastTenWins}–${recentForm.length - lastTenWins}`
        : "Pending",
    },
    {
      label: "World rank",
      value: worldRank ? `#${worldRank.rank}` : "—",
    },
  ];
  const heroSource = profile?.heroImageUrl
    ? { uri: profile.heroImageUrl }
    : undefined;
  const hasPersonalHero = Boolean(heroSource || profile?.cutoutImageUrl);

  const heroGhostMotion = reducedMotion
    ? undefined
    : {
        opacity: performanceScrollY.interpolate({
          inputRange: [0, 260],
          outputRange: [0.12, 0.025],
          extrapolate: "clamp",
        }),
        transform: [
          {
            translateY: performanceScrollY.interpolate({
              inputRange: [0, 260],
              outputRange: [0, 62],
              extrapolate: "clamp",
            }),
          },
        ],
      };
  const heroContentMotion = reducedMotion
    ? undefined
    : {
        transform: [
          {
            translateY: performanceScrollY.interpolate({
              inputRange: [0, 220],
              outputRange: [0, 22],
              extrapolate: "clamp",
            }),
          },
        ],
      };
  const heroRatingMotion = reducedMotion
    ? undefined
    : {
        transform: [
          {
            translateY: performanceScrollY.interpolate({
              inputRange: [0, 220],
              outputRange: [0, 38],
              extrapolate: "clamp",
            }),
          },
        ],
      };
  const heroCutoutMotion = reducedMotion
    ? undefined
    : {
        transform: [
          {
            translateY: performanceScrollY.interpolate({
              inputRange: [0, 260],
              outputRange: [0, 28],
              extrapolate: "clamp",
            }),
          },
        ],
      };
  const ghostName =
    player.displayName.trim().split(/\s+/).at(-1)?.toUpperCase() ?? "PLAYER";

  return (
    <Animated.ScrollView
      contentContainerStyle={styles.screenContent}
      onScroll={
        reducedMotion
          ? undefined
          : Animated.event(
              [
                {
                  nativeEvent: {
                    contentOffset: { y: performanceScrollY },
                  },
                },
              ],
              { useNativeDriver: true },
            )
      }
      scrollEventThrottle={16}
      showsVerticalScrollIndicator={false}
    >
      <AppHeader eyebrow="YOUR PLAYER STORY" />
      <ImageBackground
        imageStyle={styles.athleteHeroImage}
        source={heroSource}
        style={[
          styles.athleteHero,
          !hasPersonalHero && styles.athleteHeroCompact,
        ]}
      >
        <View
          style={[
            styles.athleteHeroWash,
            !hasPersonalHero && styles.athleteHeroWashCompact,
          ]}
        />
        <View style={styles.athleteHeroAtmosphere} />
        <Animated.View
          pointerEvents="none"
          style={[styles.athleteHeroGhost, heroGhostMotion]}
        >
          <Text numberOfLines={1} style={styles.athleteHeroGhostText}>
            {ghostName}
          </Text>
        </Animated.View>
        <View style={styles.athleteHeroHorizon} />
        <View style={styles.athleteHeroGeometry} />
        <Animated.View
          style={[
            styles.athleteHeroContent,
            !hasPersonalHero && styles.athleteHeroContentCompact,
            heroContentMotion,
          ]}
        >
          <View style={styles.athleteHeroPills}>
            <Pill
              tone={player.roles.includes("player") ? "positive" : "neutral"}
            >
              {player.roles.includes("player") ? "Player" : "Member"}
            </Pill>
            {settings?.dunaPlus.kind === "complimentary" && (
              <Pill tone="positive">Complimentary Premium+</Pill>
            )}
            {worldRank && (
              <Pill tone="warning">{`World #${worldRank.rank}`}</Pill>
            )}
          </View>
          <Text style={styles.athleteHeroName}>{player.displayName}</Text>
          <Text style={styles.athleteHeroMeta}>
            {profile?.countryCode ? `${profile.countryCode} · ` : ""}
            {profile?.playingRole ? `${profile.playingRole} · ` : ""}@
            {player.handle}
          </Text>
          <View style={styles.athleteHeroActions}>
            <Pressable
              onPress={() =>
                void WebBrowser.openBrowserAsync(
                  `${dunaWebUrl}/players/${player.handle}`,
                )
              }
              style={styles.athleteHeroPrimaryAction}
            >
              <Text style={styles.athleteHeroPrimaryActionText}>
                View public page
              </Text>
            </Pressable>
            <Pressable
              onPress={onArtwork}
              style={styles.athleteHeroSecondaryAction}
            >
              <Text style={styles.athleteHeroSecondaryActionText}>
                Create artwork
              </Text>
            </Pressable>
          </View>
        </Animated.View>
        {profile?.cutoutImageUrl && (
          <Animated.View style={[styles.athleteHeroCutout, heroCutoutMotion]}>
            <Image
              accessibilityLabel={profile.imageAlt ?? player.displayName}
              resizeMode="contain"
              source={{ uri: profile.cutoutImageUrl }}
              style={styles.athleteHeroCutoutImage}
            />
          </Animated.View>
        )}
        <Animated.View style={[styles.athleteHeroRating, heroRatingMotion]}>
          <Text style={styles.athleteHeroRatingLabel}>SAND RATING</Text>
          <Text style={styles.athleteHeroRatingValue}>
            {currentRating.toFixed(2)}
          </Text>
          <View style={styles.athleteHeroRatingMetaRow}>
            <Text
              style={[
                styles.athleteHeroRatingDelta,
                netMovement >= 0 ? styles.positiveText : styles.negativeText,
              ]}
            >
              {netMovement >= 0 ? "▲" : "▼"} {Math.abs(netMovement).toFixed(2)}
            </Text>
            <Text style={styles.athleteHeroRatingMeta}>
              {player.rating.confidence}
            </Text>
          </View>
        </Animated.View>
      </ImageBackground>

      <ScrollView
        contentContainerStyle={styles.athleteMetricShelfContent}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.athleteMetricShelf}
      >
        <View style={styles.athleteMetricRow}>
          {fallbackProfileMetrics.map((metric, index) => (
            <View
              key={metric.label}
              style={[
                styles.athleteMetricCard,
                index === 0 && styles.athleteMetricCardAccent,
              ]}
            >
              <Text style={styles.athleteMetricLabel}>{metric.label}</Text>
              <Text style={styles.athleteMetricValue}>{metric.value}</Text>
              {metric.label === "World rank" && worldMovement !== undefined ? (
                <Text
                  style={[
                    styles.athleteMetricChange,
                    worldMovement >= 0
                      ? styles.positiveText
                      : styles.negativeText,
                  ]}
                >
                  {worldMovement >= 0 ? "↑" : "↓"} {Math.abs(worldMovement)}{" "}
                  places
                </Text>
              ) : (
                <Text style={styles.athleteMetricChange}>
                  {metric.label === "Record"
                    ? `${history.length} rated matches`
                    : metric.label === "Last 10"
                      ? "Current form"
                      : metric.label === "Win rate"
                        ? "Verified results"
                        : "Official signal"}
                </Text>
              )}
            </View>
          ))}
        </View>
      </ScrollView>

      <MemberOrganizationCard />

      <PredictionWalletSummaryCard onPress={onPredictions} />

      <View style={styles.athleteNarrativeCard}>
        <View style={styles.athleteNarrativeHeading}>
          <View style={styles.athleteNarrativeMark}>
            <Text style={styles.athleteNarrativeMarkText}>✦</Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.eyebrow}>DUNA FORM REPORT</Text>
            <Text style={styles.athleteNarrativeTitle}>
              The story in the results.
            </Text>
          </View>
        </View>
        <Text style={styles.athleteNarrativeBody}>
          {profile?.shortBio ??
            (history.length
              ? `${player.displayName} is ${wins}–${losses} across ${history.length} verified matches, with a ${currentRating.toFixed(2)} Sand Rating and ${lastTenWins} wins in the last ${recentForm.length}.`
              : `${player.displayName}'s verified performance story will sharpen as connected results arrive.`)}
        </Text>
        {profile?.sourceLabel && (
          <Text style={styles.athleteNarrativeSource}>
            {profile.sourceLabel} · {profile.evidenceCount} evidence sources
          </Text>
        )}
      </View>

      <View style={styles.athleteChartCard}>
        <View style={styles.cardTitleRow}>
          <View>
            <Text style={styles.eyebrow}>RATING HISTORY</Text>
            <Text style={styles.athleteChartTitle}>Form over time.</Text>
          </View>
          <Pill tone={netMovement >= 0 ? "positive" : "warning"}>
            {`${netMovement >= 0 ? "+" : ""}${netMovement.toFixed(2)}`}
          </Pill>
        </View>
        <View style={styles.athleteChartSummary}>
          <View>
            <Text style={styles.athleteChartSummaryValue}>
              {startRating?.toFixed(2) ?? "—"}
            </Text>
            <Text style={styles.athleteChartSummaryLabel}>First connected</Text>
          </View>
          <Text style={styles.athleteChartArrow}>→</Text>
          <View>
            <Text style={styles.athleteChartSummaryValue}>
              {currentRating.toFixed(2)}
            </Text>
            <Text style={styles.athleteChartSummaryLabel}>Current</Text>
          </View>
          <View style={styles.athleteChartRange}>
            <Text style={styles.athleteChartSummaryValue}>
              {(maximumRating - minimumRating).toFixed(2)}
            </Text>
            <Text style={styles.athleteChartSummaryLabel}>Range</Text>
          </View>
        </View>
        {chartMatches.length ? (
          <View style={styles.athleteLineChart}>
            <Svg
              accessibilityLabel={`Sand Rating changed from ${startRating?.toFixed(2) ?? currentRating.toFixed(2)} to ${currentRating.toFixed(2)} across ${chartMatches.length} recent results.`}
              height={chartHeight}
              width={chartWidth}
            >
              {[0.25, 0.5, 0.75].map((ratio) => (
                <Line
                  key={ratio}
                  stroke={rgba(colors.overlayRgb, 0.1)}
                  strokeDasharray="4 5"
                  x1={0}
                  x2={chartWidth}
                  y1={chartHeight * ratio}
                  y2={chartHeight * ratio}
                />
              ))}
              <Path
                d={chartPath}
                fill="none"
                stroke={colors.aqua}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={3}
              />
              {chartPoints.map(({ match, x, y }) => (
                <Circle
                  cx={x}
                  cy={y}
                  fill={
                    match.actualResult >= 0.5
                      ? colors.positive
                      : colors.resultLossBorder
                  }
                  key={match.id}
                  r={4.5}
                  stroke={colors.depth}
                  strokeWidth={2}
                />
              ))}
            </Svg>
            <View style={styles.athleteLineChartAxis}>
              <Text>{minimumRating.toFixed(2)}</Text>
              <Text>{maximumRating.toFixed(2)}</Text>
            </View>
          </View>
        ) : (
          <View style={styles.athleteChartEmpty}>
            <Text style={styles.athleteChartEmptyMark}>↗</Text>
            <Text style={styles.athleteChartEmptyText}>
              Connect verified match sources to unlock the rating waveform.
            </Text>
          </View>
        )}
        <View style={styles.athleteChartLegend}>
          <Text>● Win</Text>
          <Text style={styles.athleteChartLegendLoss}>● Loss</Text>
          <Text>{chartMatches.length} recent rated results</Text>
        </View>
      </View>

      {history.length ? (
        <View style={styles.performanceEvidenceCard}>
          <Text style={styles.eyebrow}>COMPETITIVE PROFILE</Text>
          <Text style={styles.performancePulseTitle}>
            More than wins and losses.
          </Text>
          <View style={styles.performanceEvidenceGrid}>
            {[
              ["Set record", `${setsWon}–${setsLost}`],
              ["Point share", `${Math.round(averagePointShare * 100)}%`],
              ["Opp. rating", averageOpponentRating?.toFixed(2) ?? "Building"],
              [
                "Deciders",
                decidingSetMatches
                  ? `${decidingSetWins}–${decidingSetMatches - decidingSetWins}`
                  : "—",
              ],
            ].map(([label, value]) => (
              <View key={label} style={styles.performanceEvidenceMetric}>
                <Text style={styles.performanceEvidenceValue}>{value}</Text>
                <Text style={styles.performanceEvidenceLabel}>{label}</Text>
              </View>
            ))}
          </View>
          {bestPartners.length > 0 && (
            <View style={styles.performancePartnerList}>
              <Text style={styles.performancePartnerHeading}>
                PARTNER CHEMISTRY
              </Text>
              {bestPartners.map((partner) => (
                <View key={partner.name} style={styles.performancePartnerRow}>
                  <Text numberOfLines={1} style={styles.performancePartnerName}>
                    {partner.name}
                  </Text>
                  <View style={styles.performancePartnerTrack}>
                    <View
                      style={[
                        styles.performancePartnerFill,
                        {
                          width: `${Math.round((partner.wins / partner.matches) * 100)}%`,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.performancePartnerRecord}>
                    {partner.wins}–{partner.matches - partner.wins}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      ) : null}

      {pulseMatches.length ? (
        <View
          accessibilityLabel={`Recent form: ${pulseMatches.map((match) => (match.actualResult >= 0.5 ? "win" : "loss")).join(", ")}`}
          style={styles.performancePulseCard}
        >
          <View style={styles.cardTitleRow}>
            <View>
              <Text style={styles.eyebrow}>MATCH PULSE</Text>
              <Text style={styles.performancePulseTitle}>Your last 12.</Text>
            </View>
            <Text style={styles.performancePulseRecord}>
              {lastTenWins}–{recentForm.length - lastTenWins}
            </Text>
          </View>
          <View style={styles.performancePulseTrack}>
            {pulseMatches.map((match) => (
              <View
                key={match.id}
                style={[
                  styles.performancePulsePoint,
                  match.actualResult >= 0.5
                    ? styles.performancePulsePointWin
                    : styles.performancePulsePointLoss,
                ]}
              >
                <Text style={styles.performancePulsePointText}>
                  {match.actualResult >= 0.5 ? "W" : "L"}
                </Text>
              </View>
            ))}
          </View>
          <Text style={styles.performancePulseSummary}>
            {upsetWins} upset {upsetWins === 1 ? "win" : "wins"} ·{" "}
            {favoriteWins} wins as favorite · {favoriteLosses} favored{" "}
            {favoriteLosses === 1 ? "loss" : "losses"}
          </Text>
        </View>
      ) : null}

      {history.length ? (
        <View
          accessibilityLabel={`Average rating gain ${averagePositiveDelta.toFixed(2)}. Average rating loss ${averageNegativeDelta.toFixed(2)}.`}
          style={styles.performanceImpactCard}
        >
          <Text style={styles.eyebrow}>RATING IMPACT</Text>
          <Text style={styles.performancePulseTitle}>What results move.</Text>
          <View style={styles.performanceImpactRows}>
            <View style={styles.performanceImpactRow}>
              <Text style={styles.performanceImpactLabel}>Average win</Text>
              <View style={styles.performanceImpactTrack}>
                <View
                  style={[
                    styles.performanceImpactFill,
                    styles.performanceImpactFillWin,
                    {
                      width: `${Math.max(8, Math.min(100, averagePositiveDelta * 1_000))}%`,
                    },
                  ]}
                />
              </View>
              <Text style={styles.performanceImpactValue}>
                +{averagePositiveDelta.toFixed(2)}
              </Text>
            </View>
            <View style={styles.performanceImpactRow}>
              <Text style={styles.performanceImpactLabel}>Average loss</Text>
              <View style={styles.performanceImpactTrack}>
                <View
                  style={[
                    styles.performanceImpactFill,
                    styles.performanceImpactFillLoss,
                    {
                      width: `${Math.max(8, Math.min(100, averageNegativeDelta * 1_000))}%`,
                    },
                  ]}
                />
              </View>
              <Text style={styles.performanceImpactValue}>
                −{averageNegativeDelta.toFixed(2)}
              </Text>
            </View>
          </View>
          <Text style={styles.performancePulseSummary}>
            Rating movement blends opponent strength, score shape,
            responsibility, and verification confidence.
          </Text>
        </View>
      ) : null}

      {professionalStatistics ? (
        <View style={styles.performanceStatsCard}>
          <Text style={styles.eyebrow}>PRO MATCH SIGNALS</Text>
          <Text style={styles.performancePulseTitle}>Tracked per set.</Text>
          <View style={styles.performanceStatsGrid}>
            {[
              ["Aces", professionalStatistics.acesPerSet],
              ["Blocks", professionalStatistics.blocksPerSet],
              ["Digs", professionalStatistics.digsPerSet],
              ["Hit eff.", professionalStatistics.hittingEfficiency],
            ].map(([label, value]) => (
              <View key={String(label)} style={styles.performanceStat}>
                <Text style={styles.performanceStatValue}>
                  {typeof value === "number" ? value.toFixed(2) : "—"}
                </Text>
                <Text style={styles.performanceStatLabel}>{label}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.performancePulseSummary}>
            Based on {professionalStatistics.matches} tracked professional{" "}
            {professionalStatistics.matches === 1 ? "match" : "matches"}.
          </Text>
        </View>
      ) : null}

      {(biggestUpset || toughestLoss) && (
        <>
          <SectionHeader
            eyebrow="MATCH INTELLIGENCE"
            title="Results that moved the story."
          />
          <View style={styles.athleteMomentGrid}>
            {biggestUpset && (
              <View style={styles.athleteMomentCard}>
                <Text style={styles.athleteMomentEyebrow}>BIGGEST UPSET</Text>
                <Text style={styles.athleteMomentValue}>
                  {Math.round(biggestUpset.expectedWinProbability * 100)}%
                </Text>
                <Text numberOfLines={2} style={styles.athleteMomentTitle}>
                  vs. {matchSides(biggestUpset, player.id).opponent}
                </Text>
                <Text style={styles.athleteMomentMeta}>
                  Won from the lower pre-match probability
                </Text>
              </View>
            )}
            {toughestLoss && (
              <View
                style={[
                  styles.athleteMomentCard,
                  styles.athleteMomentCardMuted,
                ]}
              >
                <Text style={styles.athleteMomentEyebrow}>TOUGHEST LOSS</Text>
                <Text style={styles.athleteMomentValue}>
                  {Math.round(toughestLoss.expectedWinProbability * 100)}%
                </Text>
                <Text numberOfLines={2} style={styles.athleteMomentTitle}>
                  vs. {matchSides(toughestLoss, player.id).opponent}
                </Text>
                <Text style={styles.athleteMomentMeta}>
                  Favored before the opening serve
                </Text>
              </View>
            )}
          </View>
        </>
      )}

      {intelligence?.upcomingEvents.length ? (
        <>
          <SectionHeader eyebrow="NEXT ON TOUR" title="Where to watch." />
          <View style={styles.athleteUpcomingList}>
            {intelligence.upcomingEvents.map((event) => (
              <Pressable
                key={event.id}
                onPress={() =>
                  void WebBrowser.openBrowserAsync(
                    `${dunaWebUrl}/events/${event.slug}`,
                  )
                }
                style={styles.athleteUpcomingCard}
              >
                <View style={styles.athleteUpcomingDate}>
                  <Text style={styles.athleteUpcomingMonth}>
                    {event.startsOn
                      ? new Intl.DateTimeFormat("en-US", { month: "short" })
                          .format(new Date(`${event.startsOn}T12:00:00`))
                          .toUpperCase()
                      : "TBD"}
                  </Text>
                  <Text style={styles.athleteUpcomingDay}>
                    {event.startsOn
                      ? new Intl.DateTimeFormat("en-US", {
                          day: "numeric",
                        }).format(new Date(`${event.startsOn}T12:00:00`))
                      : "—"}
                  </Text>
                </View>
                <View style={styles.flex}>
                  <Text style={styles.athleteUpcomingName}>{event.name}</Text>
                  <Text style={styles.athleteUpcomingMeta}>
                    {[event.location, event.countryCode]
                      .filter(Boolean)
                      .join(", ") || "Location pending"}
                  </Text>
                  <Text style={styles.athleteUpcomingWatch}>
                    {event.watchOptions.length
                      ? `Watch on ${event.watchOptions.map((option) => option.label).join(" + ")}`
                      : "Broadcast details coming soon"}
                  </Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      {history.length ? (
        <>
          <SectionHeader
            eyebrow="FULL BREAKDOWN"
            title="Recent rated matches."
          />
          <View style={styles.performanceResultFilters}>
            {([12, 30, "all"] as const).map((range) => (
              <Pressable
                accessibilityState={{ selected: resultRange === range }}
                key={range}
                onPress={() => setResultRange(range)}
                style={[
                  styles.performanceResultFilter,
                  resultRange === range && styles.performanceResultFilterActive,
                ]}
              >
                <Text
                  style={[
                    styles.performanceResultFilterText,
                    resultRange === range &&
                      styles.performanceResultFilterTextActive,
                  ]}
                >
                  {range === "all" ? `All ${history.length}` : `Last ${range}`}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.athleteResultsList}>
            {visibleResults.map((match) => (
              <MobileResultCard
                key={match.id}
                match={match}
                participantProfiles={performance?.participantProfiles ?? []}
                personId={player.id}
              />
            ))}
          </View>
        </>
      ) : null}

      {(profile?.biography || profile?.collegeName || profile?.hometown) && (
        <View style={styles.athleteBioCard}>
          <Text style={styles.eyebrow}>PLAYER BIO</Text>
          <Text style={styles.athleteBioTitle}>Beyond the rating.</Text>
          {profile.biography && (
            <Text style={styles.athleteBioBody}>{profile.biography}</Text>
          )}
          <View style={styles.athleteBioFacts}>
            {profile.hometown && (
              <View>
                <Text style={styles.athleteBioFactLabel}>Hometown</Text>
                <Text style={styles.athleteBioFactValue}>
                  {profile.hometown}
                </Text>
              </View>
            )}
            {profile.collegeName && (
              <View>
                <Text style={styles.athleteBioFactLabel}>College</Text>
                <Text style={styles.athleteBioFactValue}>
                  {profile.collegeName}
                </Text>
              </View>
            )}
          </View>
        </View>
      )}

      <View style={styles.profileSetupCard}>
        <View style={styles.profileSetupTop}>
          <View style={styles.profileSetupMark}>
            <Text style={styles.profileSetupMarkText}>✦</Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.eyebrow}>YOUR PROFILE STUDIO</Text>
            <Text style={styles.cardTitle}>
              {settings?.profile.onboardingStatus === "complete"
                ? "Keep your story and artwork current."
                : "Tell Duna how you play."}
            </Text>
          </View>
        </View>
        <Text style={styles.bodyText}>
          Add playing details, connect match sources, and submit two to five
          high-resolution playing photos for your reviewable Duna artwork
          package.
        </Text>
        <View style={styles.profileSetupStatus}>
          <Text style={styles.rowMeta}>
            Profile:{" "}
            {settings?.profile.onboardingStatus.replaceAll("-", " ") ??
              "not started"}
          </Text>
          <Text style={styles.rowMeta}>
            Sources: {settings?.sourceConnections.length ?? 0}
          </Text>
        </View>
        <View style={styles.athleteStudioActions}>
          <Pressable
            onPress={onEditProfile}
            style={[styles.primaryButton, styles.flex]}
          >
            <Text style={styles.primaryButtonText}>Edit player details</Text>
          </Pressable>
          <Pressable onPress={onArtwork} style={styles.athleteStudioSecondary}>
            <Text style={styles.athleteStudioSecondaryText}>Artwork</Text>
          </Pressable>
        </View>
      </View>

      <PlayerCalendarSettings
        bookings={dashboard?.bookings ?? []}
        palette={{
          surface: colors.depth,
          border: rgba(colors.overlayRgb, 0.1),
          accentSurface: colors.navyLift,
          accent: colors.aqua,
          text: colors.bone,
          muted: colors.muted,
          positive: colors.positive,
          warningSurface: rgba(colors.warningRgb, 0.12),
          warning: colors.warning,
          onWarning: colors.onAccent,
          primary: colors.aqua,
          onPrimary: colors.onAccent,
        }}
      />

      <TournamentPasses
        palette={{
          surface: colors.depth,
          surfaceAlt: colors.navyLift,
          border: rgba(colors.overlayRgb, 0.1),
          text: colors.bone,
          muted: colors.muted,
          playerAccent: colors.aqua,
          fanAccent: colors.warning,
          positive: colors.positive,
          warning: colors.warning,
          button: colors.bone,
          onButton: colors.depth,
          qrBackground: colors.bone,
          qrForeground: colors.depth,
        }}
      />

      <Pressable
        accessibilityHint="Opens your private Apple Health performance timeline"
        accessibilityLabel="Open Duna Health"
        onPress={() => {
          selectionHaptic();
          onHealth();
        }}
        style={styles.healthProfileCard}
      >
        <View style={styles.healthProfileTop}>
          <View style={styles.healthProfileMark}>
            <Text style={styles.healthProfileMarkText}>♥</Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.eyebrow}>PRIVATE PERFORMANCE CONTEXT</Text>
            <Text style={styles.healthProfileTitle}>Health</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </View>
        <Text style={styles.bodyText}>
          Compare private recovery context with your matches and Duna Vision
          without exposing health data on your public profile.
        </Text>
      </Pressable>

      <View style={styles.profileMenu}>
        <Pressable onPress={onWallet} style={styles.profileMenuRow}>
          <Text style={styles.rowTitle}>Wallet + payments</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
        <Pressable onPress={onPredictions} style={styles.profileMenuRow}>
          <Text style={styles.rowTitle}>Prediction portfolio</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
        <Pressable onPress={onEditProfile} style={styles.profileMenuRow}>
          <Text style={styles.rowTitle}>Player details + identity</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
        <Pressable onPress={onArtwork} style={styles.profileMenuRow}>
          <Text style={styles.rowTitle}>Player artwork</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
        {[
          ["Notifications", "#notifications"],
          ["Privacy + safety", "#privacy"],
          ["Language + units", "#profile"],
          ["Manage Duna+", "#membership"],
          ["Delete my account", "#privacy"],
        ].map(([item, anchor]) => (
          <Pressable
            disabled={mode === "preview"}
            key={item}
            onPress={() =>
              void WebBrowser.openBrowserAsync(
                `${dunaWebUrl}/app/settings${anchor}`,
              )
            }
            style={styles.profileMenuRow}
          >
            <Text style={styles.rowTitle}>{item}</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        ))}
        {signOut && (
          <Pressable
            onPress={() => void signOut()}
            style={styles.profileMenuRow}
          >
            <Text style={[styles.rowTitle, { color: colors.danger }]}>
              Sign out
            </Text>
          </Pressable>
        )}
      </View>
    </Animated.ScrollView>
  );
}
