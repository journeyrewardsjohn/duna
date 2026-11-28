/**
 * NetScore for React Native (M-P4a): two sides across a hairline net, the
 * score of every set in Geist Mono, a check beside the winner (a trophy only
 * for a title), the serve dot while live, and one sentence for VoiceOver
 * (`netScoreSentence`). Every `match_status` value draws from
 * `netScoreState` in `@duna/tideline-core`, so it says what the web card
 * says.
 *
 * Candidate to move into `@duna/ui/native/score` (it has no Player imports).
 */
import { StyleSheet, View } from "react-native";
import {
  NET_SCORE_STATUS_TEXT,
  netScoreSentence,
  type NetScoreState,
  type Side,
} from "@duna/tideline-core";
import { Icon, Numerals, Text, useTheme } from "@duna/ui/native";

export function NetScoreCard({
  state,
  names,
  showStatus = true,
  size = "card",
  testID,
}: {
  readonly state: NetScoreState;
  readonly names: { readonly home: string; readonly away: string };
  readonly showStatus?: boolean;
  /** `board` for the big live and confirmed moments. */
  readonly size?: "card" | "board";
  readonly testID?: string;
}) {
  const { colors, tokens } = useTheme();
  const sentence = netScoreSentence(state, { names });
  const big = size === "board";
  const row = (side: Side) => {
    const isWinner = state.winner === side;
    return (
      <View style={styles.side}>
        <View style={styles.name}>
          {state.serving === side ? (
            <View
              style={[styles.serve, { backgroundColor: colors.sun }]}
              testID={`serving-${side}`}
            />
          ) : null}
          <Text
            numberOfLines={2}
            style={styles.flex}
            variant={big ? "phone-heading" : "phone-body"}
            weight={isWinner ? 600 : 500}
          >
            {names[side]}
          </Text>
          {isWinner && state.winnerBadge ? (
            <Icon
              name={state.winnerBadge === "trophy" ? "trophy" : "check"}
              size="inline"
              tone="positive"
            />
          ) : null}
        </View>
        <View style={styles.numbers}>
          {state.rows.map((set) => {
            const won = set.winningSide === side;
            return (
              <Numerals
                key={set.number}
                style={[styles.cell, big ? styles.cellBig : null]}
                tone={
                  set.state === "in-progress" ? "text" : won ? "text" : "text-3"
                }
                variant={big ? "figure" : "phone-body"}
                weight={won || set.state === "in-progress" ? 600 : 400}
              >
                {set[side]}
              </Numerals>
            );
          })}
          {state.rows.length === 0 ? (
            <Text style={styles.cell} tone="text-3" variant="phone-meta">
              —
            </Text>
          ) : null}
        </View>
      </View>
    );
  };
  return (
    <View
      accessibilityLabel={sentence}
      accessibilityRole="summary"
      accessible
      style={{ gap: tokens.space["2"] }}
      testID={testID}
    >
      {showStatus ? (
        <Text family="mono" tone="text-2" variant="phone-meta">
          {NET_SCORE_STATUS_TEXT[state.status].toUpperCase()}
        </Text>
      ) : null}
      {row("home")}
      <View style={[styles.net, { backgroundColor: colors["line-strong"] }]} />
      {row("away")}
    </View>
  );
}

const styles = StyleSheet.create({
  side: { flexDirection: "row", alignItems: "center", gap: 12 },
  name: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  flex: { flexShrink: 1 },
  serve: { width: 8, height: 8, borderRadius: 4 },
  numbers: { flexDirection: "row", gap: 4 },
  cell: { minWidth: 32, textAlign: "right" },
  cellBig: { minWidth: 56 },
  net: { height: StyleSheet.hairlineWidth },
});
