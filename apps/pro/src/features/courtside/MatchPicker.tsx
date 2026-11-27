import { type OperatorMatches } from "../../../runtime";
import { ScrollView, Pressable, View } from "react-native";
import { SatoshiText as Text } from "../../../satoshi-text";
import { type OperatorMatch } from "./scoring-types";
import { styles } from "../../legacy/styles";
import { Header } from "../../shared/Header";
import { PageTitle } from "../../shared/PageTitle";
import { Pill } from "../../shared/Pill";

export function MatchPicker({
  matches,
  deviceId,
  busy,
  error,
  onExit,
  onOpen,
}: {
  readonly matches: OperatorMatches;
  readonly deviceId?: string;
  readonly busy: boolean;
  readonly error?: string;
  readonly onExit: () => void;
  readonly onOpen: (match: OperatorMatch) => void;
}) {
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Pressable
        accessibilityLabel="Exit live scoring"
        accessibilityRole="button"
        hitSlop={8}
        onPress={onExit}
        style={[styles.scorerExitButton, styles.matchPickerExit]}
      >
        <Text style={styles.scorerExitIcon}>‹</Text>
        <View>
          <Text style={styles.scorerExitText}>Exit scoring</Text>
          <Text style={styles.scorerExitMeta}>Back to schedule</Text>
        </View>
      </Pressable>
      <Header />
      <PageTitle eyebrow="SELECT A MATCH" title="Score." />
      <Text style={styles.subhead}>
        Scheduled matches can be claimed by one device. Live matches remain
        locked to the device that started them.
      </Text>
      {error && <Text style={styles.formError}>{error}</Text>}
      <View style={styles.matchPickerList}>
        {matches.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.sectionHeading}>No scorable matches.</Text>
            <Text style={styles.metaText}>
              Create the event and teams from the native schedule, then return
              here to begin live scoring.
            </Text>
            <Pressable onPress={onExit}>
              <Text style={styles.linkText}>Back to schedule →</Text>
            </Pressable>
          </View>
        )}
        {matches.map((match) => {
          const controlledElsewhere =
            match.status === "live" &&
            Boolean(match.authoritativeDeviceId) &&
            match.authoritativeDeviceId !== deviceId;
          return (
            <View key={match.id} style={styles.matchPickerCard}>
              <View style={styles.cardTop}>
                <Pill tone={match.status === "live" ? "live" : "neutral"}>
                  {match.status}
                </Pill>
                <Text style={styles.metaText}>
                  {match.scheduledAt
                    ? new Date(match.scheduledAt).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })
                    : "Time not assigned"}
                </Text>
              </View>
              <Text style={styles.matchPickerTeams}>
                {match.teamA.name} vs {match.teamB.name}
              </Text>
              <Text style={styles.metaText}>
                {match.venueName}
                {match.courtName ? ` · ${match.courtName}` : ""}
              </Text>
              <Pressable
                disabled={busy || controlledElsewhere || !deviceId}
                onPress={() => onOpen(match)}
                style={[
                  styles.primaryAction,
                  (busy || controlledElsewhere || !deviceId) &&
                    styles.buttonDisabled,
                ]}
              >
                <Text style={styles.primaryActionText}>
                  {controlledElsewhere
                    ? "Controlled on another device"
                    : match.status === "live"
                      ? "Resume scoring"
                      : "Begin scoring"}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}
