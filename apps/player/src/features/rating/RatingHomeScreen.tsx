/**
 * Improve → Sand Rating (M-P4a): the ring (provisional and established
 * exactly per the brand book), the trend, recent matches and what each did,
 * what counts in two sentences, ways to add a score, and the rankings and
 * the deeper performance analysis (both still the earlier screens).
 *
 * The trend is a list, not a chart: the design system has no native chart
 * part yet, and a chart is drawn only once there is data. The list is the
 * accessible form either way.
 */
import { ScrollView, StyleSheet, View } from "react-native";
import { demoMatches } from "@duna/core/demo";
import {
  EmptyState,
  Numerals,
  OfflineState,
  Rally,
  Text,
  useTheme,
} from "@duna/ui/native";
import { usePane } from "@duna/ui/native/layout";
import { RatingRing } from "@duna/ui/native/score";
import * as WebBrowser from "expo-web-browser";
import { useMemo } from "react";
import { dunaWebUrl } from "../../../mobile-api";
import { usePlayerRuntime } from "../../../runtime";
import { useShell } from "../../app/ShellContext";
import { Card, Row, SectionHead, usePaneEdges } from "../../app/ui";
import { rememberSummary } from "../score/match-cache";
import { useReadableInset } from "../score/parts";
import {
  isProvisional,
  movements,
  ratingRingProps,
  trendPoints,
  trendSummary,
  WHAT_COUNTS,
} from "./rating-model";

export function RatingHomeScreen() {
  const runtime = usePlayerRuntime();
  const shell = useShell();
  const edges = usePaneEdges();
  const inset = useReadableInset();
  const pane = usePane();
  // The hero ring (260) shrinks only in a narrow pane; never below the
  // size that still shows its label.
  const ringSize = Math.max(240, Math.min(260, pane.width - 64));
  const { colors, tokens } = useTheme();
  const player = runtime.dashboard?.player;
  const matches =
    runtime.dashboard?.recentMatches ??
    (runtime.mode === "preview" ? demoMatches : []);
  const list = useMemo(
    () => movements(matches, player?.id),
    [matches, player?.id],
  );
  const points = trendPoints(list);
  const summary = trendSummary(points);
  const provisional = isProvisional(player?.rating);

  return (
    <ScrollView
      contentContainerStyle={{
        paddingTop: tokens.space["4"],
        paddingBottom: edges.bottom + tokens.space["8"],
        paddingLeft: edges.left + inset,
        paddingRight: edges.right + inset,
        gap: tokens.space["5"],
      }}
      testID="rating-home"
    >
      {runtime.isOffline ? (
        <OfflineState
          compact
          lastFreshAt={
            runtime.lastSuccessfulSyncAt
              ? new Date(runtime.lastSuccessfulSyncAt)
              : null
          }
        />
      ) : null}
      <View style={[styles.hero, { gap: tokens.space["3"] }]}>
        <RatingRing
          size={ringSize}
          {...ratingRingProps({ rating: player?.rating })}
        />
        <Text style={styles.center} tone="text-2" variant="phone-meta">
          {provisional
            ? "Your Sand Rating shows as a dash until a few confirmed matches give it enough to go on."
            : `${player?.rating.confidence ?? ""} · beach doubles`}
        </Text>
      </View>

      <View style={{ gap: tokens.space["2"] }}>
        <Row
          icon="score"
          onPress={() => shell.open("live")}
          summary="Keep score point by point, on your phone or Watch"
          testID="rating-score-match"
          title="Score a match"
        />
        <Row
          icon="trophy"
          onPress={() => shell.open("score")}
          summary="Your opponents confirm it"
          testID="rating-add-result"
          title="Add a result"
        />
      </View>

      <View style={{ gap: tokens.space["2"] }}>
        <SectionHead title="Trend" />
        {summary ? (
          <Text variant="phone-body">{summary}</Text>
        ) : (
          <Text tone="text-2" variant="phone-meta">
            No trend yet. It starts with your first confirmed competitive match
            that moves your Sand Rating.
          </Text>
        )}
        {points.length >= 2 ? (
          <Text tone="text-2" variant="phone-meta">
            Shown as a list of each change below; a chart comes with the design
            system's chart part.
          </Text>
        ) : null}
      </View>

      <View style={{ gap: tokens.space["2"] }}>
        <SectionHead title="Recent matches" />
        {list.length === 0 ? (
          <EmptyState
            action={{
              label: "Add a result",
              onPress: () => shell.open("score"),
            }}
            compact
            text="Matches you play and confirm appear here with what each did to your Sand Rating."
            title="No matches yet"
          />
        ) : (
          <Rally>
            {list.map((movement) => {
              const match = matches.find((m) => m.id === movement.matchId);
              return (
                <Card
                  accessibilityLabel={`${movement.won ? "Won" : "Lost"} against ${movement.opponents}. ${movement.change ? `Sand Rating ${movement.change}` : (movement.note ?? "")}`}
                  key={movement.matchId}
                  onPress={() => {
                    if (match) rememberSummary(match);
                    shell.open("result", { targetId: movement.matchId });
                  }}
                  style={styles.movement}
                >
                  <View style={styles.flex}>
                    <Text variant="phone-body" weight={600}>
                      {`${movement.won ? "Won" : "Lost"} against ${movement.opponents}`}
                    </Text>
                    <Text tone="text-2" variant="phone-meta">
                      {new Intl.DateTimeFormat("en-US", {
                        month: "short",
                        day: "numeric",
                      }).format(new Date(movement.playedAt))}
                      {movement.note ? ` · ${movement.note}` : ""}
                    </Text>
                  </View>
                  {movement.change ? (
                    <Numerals
                      family="ui"
                      style={{
                        color: movement.change.startsWith("+")
                          ? colors.positive
                          : colors.danger,
                      }}
                      variant="phone-body"
                      weight={600}
                    >
                      {`${movement.change.startsWith("+") ? "▲" : "▼"} ${movement.change}`}
                    </Numerals>
                  ) : null}
                </Card>
              );
            })}
          </Rally>
        )}
      </View>

      <View style={{ gap: tokens.space["2"] }}>
        <SectionHead title="What counts" />
        {WHAT_COUNTS.map((sentence) => (
          <Text key={sentence} tone="text-2" variant="phone-body">
            {sentence}
          </Text>
        ))}
      </View>

      <View style={{ gap: tokens.space["1"] }}>
        <Row
          icon="podium"
          onPress={() =>
            void WebBrowser.openBrowserAsync(`${dunaWebUrl}/rankings`)
          }
          summary="Players and teams by Sand Rating"
          title="Rankings"
        />
        <Row
          icon="rating"
          onPress={() => shell.open("insights")}
          summary="Form, partners, upsets and every rated match"
          title="Performance in depth"
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center" },
  center: { textAlign: "center", paddingHorizontal: 24 },
  flex: { flex: 1, gap: 2 },
  movement: { flexDirection: "row", alignItems: "center", gap: 12 },
});
