import { Pressable, ScrollView, View } from "react-native";
import { SatoshiText as Text } from "../../../satoshi-text";
import { selectionHaptic } from "../../shared/haptics";
import { AppHeader } from "../../app/AppHeader";
import type { HomeQuickAction } from "../home/home-quick-action";
import { styles } from "../../legacy/styles";

export function PlayLauncherScreen({
  onAction,
}: {
  readonly onAction: (action: HomeQuickAction) => void;
}) {
  const actions: readonly {
    readonly key: HomeQuickAction;
    readonly icon: string;
    readonly title: string;
    readonly detail: string;
  }[] = [
    {
      key: "upload-score",
      icon: "✓",
      title: "Report a Score",
      detail: "Add a result and update your record",
    },
    {
      key: "find-match",
      icon: "⌖",
      title: "Find a Match",
      detail: "See every open match around you",
    },
    {
      key: "create-match",
      icon: "＋",
      title: "Create a Match",
      detail: "Pick a place, invite players, and open spots",
    },
    {
      key: "join-event",
      icon: "✦",
      title: "Join an Event",
      detail: "Tournaments, clinics, and community play",
    },
    {
      key: "book-court",
      icon: "▦",
      title: "Book a Court",
      detail: "Find live court availability",
    },
    {
      key: "find-coach",
      icon: "◇",
      title: "Find a Coach",
      detail: "Profiles, programs, sessions, and virtual training",
    },
    {
      key: "record-video",
      icon: "●",
      title: "Record a Video",
      detail: "Open Duna Vision",
    },
    {
      key: "watch-pros",
      icon: "▶",
      title: "Watch the Pros",
      detail: "Live coverage, events, and matches",
    },
    {
      key: "search",
      icon: "⌕",
      title: "Search",
      detail: "Choose where, when, and what",
    },
  ];
  return (
    <ScrollView
      contentContainerStyle={styles.screenContent}
      showsVerticalScrollIndicator={false}
    >
      <AppHeader eyebrow="QUICK ACTIONS" />
      <Text style={styles.displayTitle}>What do you want to play?</Text>
      <Text style={styles.playLauncherIntro}>
        Start a score, find something nearby, book a court, or jump into Duna
        Vision and Pro coverage.
      </Text>
      <View style={styles.playLauncherGrid}>
        {actions.map((action) => (
          <Pressable
            accessibilityHint={action.detail}
            accessibilityRole="button"
            key={action.key}
            onPress={() => {
              selectionHaptic();
              onAction(action.key);
            }}
            style={({ pressed }) => [
              styles.playLauncherAction,
              pressed && styles.homeQuickActionPressed,
            ]}
          >
            <View style={styles.playLauncherIcon}>
              <Text style={styles.playLauncherIconText}>{action.icon}</Text>
            </View>
            <View style={styles.flex}>
              <Text style={styles.playLauncherTitle}>{action.title}</Text>
              <Text style={styles.playLauncherDetail}>{action.detail}</Text>
            </View>
            <Text style={styles.playLauncherArrow}>›</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}
