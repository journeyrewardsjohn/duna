import { Pressable, View } from "react-native";
import { SatoshiText as Text } from "../../../satoshi-text";
import type { ProMatch } from "./pro-tour-types";
import { styles } from "../../legacy/styles";

export function ProTourMatchCard({
  match,
  followed,
  onFollow,
  onOpen,
}: {
  readonly match: ProMatch;
  readonly followed: boolean;
  readonly onFollow?: () => void;
  readonly onOpen?: () => void;
}) {
  const live = match.status === "live";
  const time =
    match.time ??
    (match.playedAt
      ? new Intl.DateTimeFormat("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }).format(new Date(match.playedAt))
      : "Time pending");
  const scores = (side: "a" | "b") =>
    match.sets.map((set) => set[side]).join("  ") || "—";
  return (
    <Pressable
      accessibilityHint="Opens scores, history, and the crowd market"
      accessibilityLabel={`Open ${match.teamA.label} versus ${match.teamB.label}`}
      disabled={!onOpen}
      onPress={onOpen}
      style={({ pressed }) => [
        styles.proMobileMatchCard,
        live && styles.proMobileMatchCardLive,
        pressed && styles.proMobilePressed,
      ]}
    >
      <View style={styles.proMobileMatchHeader}>
        <Text
          style={[
            styles.proMobileMatchStatus,
            live && styles.proMobileMatchStatusLive,
          ]}
        >
          {live
            ? "● LIVE"
            : match.status === "completed"
              ? "FINAL"
              : "UPCOMING"}
        </Text>
        <Text numberOfLines={1} style={styles.proMobileMatchMeta}>
          {match.roundLabel} · {time}
          {match.court ? ` · ${match.court}` : ""}
        </Text>
      </View>
      <View style={styles.proMobileMatchTeamRow}>
        <Text
          numberOfLines={1}
          style={[
            styles.proMobileMatchTeam,
            match.winnerSide === "A" && styles.proMobileMatchWinner,
          ]}
        >
          {match.teamA.label}
        </Text>
        <Text style={styles.proMobileMatchScore}>{scores("a")}</Text>
      </View>
      <View style={styles.proMobileMatchTeamRow}>
        <Text
          numberOfLines={1}
          style={[
            styles.proMobileMatchTeam,
            match.winnerSide === "B" && styles.proMobileMatchWinner,
          ]}
        >
          {match.teamB.label}
        </Text>
        <Text style={styles.proMobileMatchScore}>{scores("b")}</Text>
      </View>
      <View style={styles.proMobileMatchFooter}>
        <View style={styles.proMobileMatchPrediction}>
          <View style={styles.proMobileMatchPredictionLabels}>
            <Text style={styles.proMobileMatchPredictionValue}>
              {match.prediction.teamA.toFixed(0)}%
            </Text>
            <Text style={styles.proMobileMatchPredictionCaption}>
              DUNA FORECAST
            </Text>
            <Text style={styles.proMobileMatchPredictionValue}>
              {match.prediction.teamB.toFixed(0)}%
            </Text>
          </View>
          <View style={styles.proMobileMatchPredictionTrack}>
            <View
              style={[
                styles.proMobileMatchPredictionFill,
                { width: `${match.prediction.teamA}%` },
              ]}
            />
          </View>
        </View>
        {onFollow && (
          <Pressable
            accessibilityLabel={
              followed ? "Following match on Lock Screen" : "Follow match"
            }
            onPress={(event) => {
              event.stopPropagation();
              onFollow();
            }}
            style={[
              styles.proMobileFollowButton,
              followed && styles.proMobileFollowButtonActive,
            ]}
          >
            <Text
              style={[
                styles.proMobileFollowButtonText,
                followed && styles.proMobileFollowButtonTextActive,
              ]}
            >
              {followed ? "Following" : live ? "Follow live" : "Follow"}
            </Text>
          </Pressable>
        )}
        {onOpen && !onFollow && (
          <Text style={styles.proMobileMatchOpenArrow}>›</Text>
        )}
      </View>
    </Pressable>
  );
}
