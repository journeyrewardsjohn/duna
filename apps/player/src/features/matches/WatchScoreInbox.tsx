import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  clearPendingWatchScoreDraft,
  getPendingWatchScoreDraft,
  subscribeToWatchScoreDraft,
  type WatchScoreDraft,
} from "../../../watch-scoring";
import { SatoshiText as Text } from "../../../satoshi-text";
import { selectionHaptic } from "../../shared/haptics";
import { styles } from "../../legacy/styles";

export function WatchScoreInbox({
  onReview,
}: {
  readonly onReview: (draft: WatchScoreDraft) => void;
}) {
  const [draft, setDraft] = useState<WatchScoreDraft | null>(null);

  useEffect(() => {
    setDraft(getPendingWatchScoreDraft());
    return subscribeToWatchScoreDraft(setDraft);
  }, []);

  if (!draft) return null;

  const review = () => {
    selectionHaptic();
    onReview(draft);
    clearPendingWatchScoreDraft();
    setDraft(null);
  };

  return (
    <Modal
      animationType="slide"
      onRequestClose={() => setDraft(null)}
      presentationStyle="pageSheet"
      visible
    >
      <SafeAreaView edges={["top", "bottom"]} style={styles.modalSafe}>
        <ScrollView contentContainerStyle={styles.watchDraftContent}>
          <View style={styles.watchDraftMark}>
            <Text style={styles.watchDraftMarkText}>⌚</Text>
          </View>
          <Text style={styles.eyebrow}>CAPTURED ON APPLE WATCH</Text>
          <Text style={styles.watchDraftTitle}>Your score is ready.</Text>
          <Text style={styles.watchDraftBody}>
            Add the players, confirm everyone agreed to record it, then submit
            from your signed-in Duna account.
          </Text>
          <View style={styles.watchDraftScore}>
            <View>
              <Text style={styles.rowTitle}>{draft.teamA}</Text>
              <Text style={styles.rowMeta}>Team A</Text>
            </View>
            <Text style={styles.watchDraftSets}>
              {draft.sets.map((set) => `${set.a}–${set.b}`).join("  ")}
            </Text>
            <View>
              <Text style={[styles.rowTitle, styles.watchDraftTeamB]}>
                {draft.teamB}
              </Text>
              <Text style={[styles.rowMeta, styles.watchDraftTeamB]}>
                Team B
              </Text>
            </View>
          </View>
          <View style={styles.watchDraftTrust}>
            <Text style={styles.mobilePolicyIcon}>✓</Text>
            <Text style={[styles.rowMeta, styles.flex]}>
              Duna records who submits the result. Only event participants,
              assigned scorers, match players, and organization staff can report
              an existing event match.
            </Text>
          </View>
          <Pressable onPress={() => void review()} style={styles.payButton}>
            <Text style={styles.payButtonText}>Review and submit</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              clearPendingWatchScoreDraft();
              setDraft(null);
            }}
            style={styles.watchDraftDiscard}
          >
            <Text style={styles.watchDraftDiscardText}>Discard draft</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
