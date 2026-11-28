import { runWithWatchdog, settleValues } from "@duna/ui/native";
import { demoPeople } from "@duna/core/demo";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, Pressable, View } from "react-native";
import { ResultPlayIcon } from "../../../result-play-icon";
import { SatoshiText as Text } from "../../../satoshi-text";
import type {
  MobilePerformanceMatch,
  MobilePerformanceParticipantProfile,
} from "./performance-types";
import { useReducedMotion } from "../../shared/use-reduced-motion";
import {
  resultRosterDensity,
  resultRosterWidth,
  resultRosterName,
} from "./result-roster";
import { styles } from "../../legacy/styles";

const demoSandRatingByPersonId = new Map(
  demoPeople.map((person) => [person.id, person.rating.display] as const),
);

export function matchSides(match: MobilePerformanceMatch, personId: string) {
  const ownSide = match.participants.find(
    (participant) => participant.personId === personId,
  )?.side;
  const names = (side: "A" | "B") =>
    match.participants
      .filter((participant) => participant.side === side)
      .map((participant) => participant.name)
      .join(" / ");
  return {
    own: ownSide ? names(ownSide) : "Duna player",
    opponent: ownSide ? names(ownSide === "A" ? "B" : "A") : match.matchTitle,
  };
}

export function MobileResultCard({
  match,
  personId,
  participantProfiles,
}: {
  readonly match: MobilePerformanceMatch;
  readonly personId: string;
  readonly participantProfiles: readonly MobilePerformanceParticipantProfile[];
}) {
  const [expanded, setExpanded] = useState(false);
  const reducedMotion = useReducedMotion();
  const reveal = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;
  useEffect(() => {
    if (reducedMotion) {
      reveal.setValue(1);
      return;
    }
    return runWithWatchdog(
      Animated.timing(reveal, {
        toValue: 1,
        duration: 620,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      { timeline: 620, settle: settleValues([[reveal, 1]]) },
    );
  }, [reducedMotion, reveal]);
  const result = match.actualResult >= 0.5 ? "W" : "L";
  const sides = matchSides(match, personId);
  const expected = Math.round(match.expectedWinProbability * 100);
  const ownSide = match.participants.find(
    (participant) => participant.personId === personId,
  )?.side;
  const profileById = new Map(
    participantProfiles.map((profile) => [profile.id, profile]),
  );
  const sidePlayers = (side: "A" | "B") =>
    match.participants.filter((participant) => participant.side === side);
  const winningSide = ownSide
    ? result === "W"
      ? ownSide
      : ownSide === "A"
        ? "B"
        : "A"
    : undefined;
  return (
    <Pressable
      accessibilityHint="Expands the native match breakdown"
      accessibilityLabel={`${result === "W" ? "Win" : "Loss"} versus ${sides.opponent}`}
      onPress={() => setExpanded((value) => !value)}
      style={[
        styles.athleteResultCard,
        result === "W"
          ? styles.athleteResultCardWin
          : styles.athleteResultCardLoss,
      ]}
    >
      <View style={styles.athleteResultHero}>
        <Animated.View
          style={[
            styles.athleteResultHeroCopy,
            {
              opacity: reveal,
              transform: [
                {
                  translateY: reveal.interpolate({
                    inputRange: [0, 1],
                    outputRange: [10, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <Text style={styles.athleteResultOutcome}>
            {result === "W" ? "Match won" : "Match lost"}
          </Text>
          <Text style={styles.athleteResultStory}>
            {match.resultStory.summary}
          </Text>
          <Text style={styles.athleteResultStorySource}>
            {match.resultStory.source === "ai" ? "DUNA AI RECAP" : "DUNA RECAP"}
          </Text>
        </Animated.View>
        <View pointerEvents="none" style={styles.athleteResultPlayIcon}>
          <ResultPlayIcon
            outcome={result === "W" ? "won" : "lost"}
            playersPerSide={Math.max(
              sidePlayers("A").length,
              sidePlayers("B").length,
            )}
            size={138}
          />
        </View>
      </View>

      <View style={styles.athleteResultScoreCard}>
        <View style={styles.athleteResultScoreMeta}>
          <View style={styles.flex}>
            <Text numberOfLines={1} style={styles.athleteResultOpponent}>
              {match.matchTitle}
            </Text>
            <Text numberOfLines={1} style={styles.athleteResultMeta}>
              {new Intl.DateTimeFormat("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              }).format(new Date(match.occurredAt))}
              {` · ${expected}% pre-match`}
            </Text>
          </View>
          <View style={styles.athleteResultDelta}>
            <Text
              style={[
                styles.athleteResultDeltaValue,
                match.delta >= 0 ? styles.positiveText : styles.negativeText,
              ]}
            >
              {match.delta >= 0 ? "+" : ""}
              {match.delta.toFixed(2)}
            </Text>
            <Text style={styles.athleteResultExpected}>SAND RATING</Text>
          </View>
        </View>

        {(["A", "B"] as const).map((side, sideIndex) => {
          const team = sidePlayers(side);
          const density = resultRosterDensity(team.length);
          const rosterWidth = resultRosterWidth(team.length);
          return (
            <View
              key={side}
              style={[
                styles.athleteResultTeamRow,
                density === "compact" && styles.athleteResultTeamRowCompact,
                density === "dense" && styles.athleteResultTeamRowDense,
                team.length > 6 && styles.athleteResultTeamRowWrapped,
                sideIndex > 0 && styles.athleteResultTeamRowDivider,
              ]}
            >
              <View style={styles.athleteResultPeople}>
                {team.map((participant) => {
                  const profile = participant.personId
                    ? profileById.get(participant.personId)
                    : undefined;
                  const sandRating =
                    participant.personId === personId
                      ? match.beforeDisplay
                      : (profile?.sandRating ??
                        (participant.personId
                          ? demoSandRatingByPersonId.get(participant.personId)
                          : undefined));
                  return (
                    <View
                      key={participant.personId ?? participant.externalPersonId}
                      style={[
                        styles.athleteResultPerson,
                        density === "compact" &&
                          styles.athleteResultPersonCompact,
                        density === "dense" && styles.athleteResultPersonDense,
                        { width: rosterWidth },
                      ]}
                    >
                      {profile?.avatarUrl ? (
                        <Image
                          accessibilityLabel=""
                          source={{ uri: profile.avatarUrl }}
                          style={[
                            styles.athleteResultAvatar,
                            density === "compact" &&
                              styles.athleteResultAvatarCompact,
                            density === "dense" &&
                              styles.athleteResultAvatarDense,
                          ]}
                        />
                      ) : (
                        <View
                          style={[
                            styles.athleteResultAvatarFallback,
                            density === "compact" &&
                              styles.athleteResultAvatarFallbackCompact,
                            density === "dense" &&
                              styles.athleteResultAvatarFallbackDense,
                          ]}
                        >
                          <Text
                            style={[
                              styles.athleteResultAvatarText,
                              density === "dense" &&
                                styles.athleteResultAvatarTextDense,
                            ]}
                          >
                            {participant.name
                              .split(/\s+/)
                              .slice(0, 2)
                              .map((part) => part[0])
                              .join("")}
                          </Text>
                        </View>
                      )}
                      <Text
                        accessibilityLabel={participant.name}
                        numberOfLines={1}
                        style={[
                          styles.athleteResultPersonName,
                          density === "compact" &&
                            styles.athleteResultPersonNameCompact,
                          density === "dense" &&
                            styles.athleteResultPersonNameDense,
                        ]}
                      >
                        {resultRosterName(participant.name)}
                      </Text>
                      <View
                        style={[
                          styles.athleteResultRatingPill,
                          density === "dense" &&
                            styles.athleteResultRatingPillDense,
                        ]}
                      >
                        <Text
                          style={[
                            styles.athleteResultRatingText,
                            density === "dense" &&
                              styles.athleteResultRatingTextDense,
                          ]}
                        >
                          {sandRating?.toFixed(2) ?? "—"}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
              <View style={styles.athleteResultSetScores}>
                {match.sets.map((set, index) => {
                  const score = side === "A" ? set.a : set.b;
                  const wonSet =
                    (side === "A" && set.a > set.b) ||
                    (side === "B" && set.b > set.a);
                  return (
                    <Text
                      key={`${side}:${index}`}
                      style={[
                        styles.athleteResultSetScore,
                        wonSet && styles.athleteResultSetScoreWon,
                      ]}
                    >
                      {score}
                    </Text>
                  );
                })}
                {winningSide === side && (
                  <Text
                    accessibilityLabel="Winning side"
                    style={styles.athleteResultWinnerMark}
                  >
                    ✦
                  </Text>
                )}
              </View>
            </View>
          );
        })}
      </View>
      {expanded && (
        <View style={styles.athleteResultBreakdown}>
          <View>
            <Text style={styles.athleteResultBreakdownLabel}>SAND RATING</Text>
            <Text style={styles.athleteResultBreakdownValue}>
              {match.beforeDisplay.toFixed(2)} → {match.afterDisplay.toFixed(2)}
            </Text>
          </View>
          <View>
            <Text style={styles.athleteResultBreakdownLabel}>VERIFIED</Text>
            <Text style={styles.athleteResultBreakdownValue}>
              {Math.round(match.verificationWeightBps / 100)}%
            </Text>
          </View>
          <View>
            <Text style={styles.athleteResultBreakdownLabel}>POINT SHARE</Text>
            <Text style={styles.athleteResultBreakdownValue}>
              {Math.round(match.pointShare * 100)}%
            </Text>
          </View>
          <View>
            <Text style={styles.athleteResultBreakdownLabel}>OPPONENT</Text>
            <Text numberOfLines={1} style={styles.athleteResultBreakdownValue}>
              {sides.opponent || "Opponent"}
            </Text>
          </View>
        </View>
      )}
    </Pressable>
  );
}
