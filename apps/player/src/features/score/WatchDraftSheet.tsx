/**
 * A score kept on the Apple Watch alone arrives here (M-P4a; replaces the
 * legacy `WatchScoreInbox`, same bridge, same behaviour): review it, which
 * opens "Add a result" filled in, or discard it.
 */
import { ScrollView, StyleSheet, View } from "react-native";
import { netScoreState } from "@duna/tideline-core";
import { AdaptiveSheet, Icon, Text, Title, useTheme } from "@duna/ui/native";
import { useEffect, useState } from "react";
import {
  clearPendingWatchScoreDraft,
  getPendingWatchScoreDraft,
  subscribeToWatchScoreDraft,
  type WatchScoreDraft,
} from "../../../watch-scoring";
import { Card } from "../../app/ui";
import { ActionButton } from "../find/parts";
import { NetScoreCard } from "./NetScoreCard";

export function WatchDraftSheet({
  onReview,
}: {
  readonly onReview: (draft: WatchScoreDraft) => void;
}) {
  const { tokens } = useTheme();
  const [draft, setDraft] = useState<WatchScoreDraft | null>(null);
  useEffect(() => {
    try {
      setDraft(getPendingWatchScoreDraft());
      return subscribeToWatchScoreDraft(setDraft);
    } catch {
      return undefined;
    }
  }, []);
  if (!draft) return null;
  const names = { home: draft.teamA, away: draft.teamB };
  const state = netScoreState({
    status: "pending-verification",
    sets: draft.sets
      .filter((set) => set.a + set.b > 0)
      .map((set) => ({ home: set.a, away: set.b })),
    names,
  });
  return (
    <AdaptiveSheet
      accessibilityLabel="Score from your Apple Watch"
      kind="dialog"
      onClose={() => setDraft(null)}
      visible
    >
      <ScrollView
        contentContainerStyle={{
          padding: tokens.space["5"],
          gap: tokens.space["4"],
        }}
      >
        <View style={styles.mark}>
          <Icon name="watch" size="nav" />
          <Text family="mono" tone="text-2" variant="phone-meta">
            SCORED ON APPLE WATCH
          </Text>
        </View>
        <Title size={24}>Your score is ready</Title>
        <Text tone="text-2" variant="phone-body">
          Add where and who played, confirm everyone agreed to record it, then
          save it from your Duna account.
        </Text>
        <Card>
          <NetScoreCard names={names} showStatus={false} state={state} />
        </Card>
        <ActionButton
          label="Review and save"
          onPress={() => {
            onReview(draft);
            clearPendingWatchScoreDraft();
            setDraft(null);
          }}
          testID="watch-review"
        />
        <ActionButton
          kind="quiet"
          label="Discard this score"
          onPress={() => {
            clearPendingWatchScoreDraft();
            setDraft(null);
          }}
        />
      </ScrollView>
    </AdaptiveSheet>
  );
}

const styles = StyleSheet.create({
  mark: { flexDirection: "row", alignItems: "center", gap: 8 },
});
