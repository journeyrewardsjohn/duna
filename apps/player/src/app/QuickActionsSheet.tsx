import { mobileGrid } from "@duna/ui/mobile";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DunaIcon, type DunaIconName } from "../../duna-icon";
import { SatoshiText as Text } from "../../satoshi-text";
import { colors } from "../shared/palette";
import { selectionHaptic } from "../shared/haptics";
import type { HomeQuickAction } from "../features/home/home-quick-action";
import { styles } from "../legacy/styles";

export function QuickActionsSheet({
  onAction,
  onClose,
  visible,
}: {
  readonly onAction: (action: HomeQuickAction) => void;
  readonly onClose: () => void;
  readonly visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const actions: readonly {
    readonly detail: string;
    readonly icon: DunaIconName;
    readonly key: HomeQuickAction;
    readonly label: string;
  }[] = [
    {
      detail: "Capture with Duna Vision",
      icon: "camera",
      key: "record-video",
      label: "Record a game",
    },
    {
      detail: "Add a completed result",
      icon: "score",
      key: "upload-score",
      label: "Upload a score",
    },
    {
      detail: "See open play nearby",
      icon: "search",
      key: "find-match",
      label: "Find a match",
    },
    {
      detail: "Invite players and open spots",
      icon: "plus",
      key: "create-match",
      label: "Create a match",
    },
    {
      detail: "View live availability",
      icon: "calendar",
      key: "book-court",
      label: "Book a court",
    },
    {
      detail: "Profiles and training sessions",
      icon: "user",
      key: "find-coach",
      label: "Find a coach",
    },
    {
      detail: "Tournaments, clinics, and play",
      icon: "sparkles",
      key: "join-event",
      label: "Join an event",
    },
    {
      detail: "Live coverage and matches",
      icon: "video",
      key: "watch-pros",
      label: "Watch the pros",
    },
    {
      detail: "Search all of Duna",
      icon: "search",
      key: "search",
      label: "Search",
    },
  ];

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <Pressable onPress={onClose} style={styles.quickSheetBackdrop}>
        <Pressable
          accessibilityViewIsModal
          onPress={(event) => event.stopPropagation()}
          style={[
            styles.quickSheet,
            { paddingBottom: Math.max(mobileGrid[6], insets.bottom) },
          ]}
        >
          <View style={styles.quickSheetHandle} />
          <View style={styles.quickSheetHeader}>
            <View style={styles.flex}>
              <Text style={styles.quickSheetEyebrow}>QUICK ACTIONS</Text>
              <Text style={styles.quickSheetTitle}>What do you need?</Text>
              <Text style={styles.quickSheetBody}>
                Start the job here. Duna keeps the full workflow and review
                steps behind each action.
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Close quick actions"
              onPress={onClose}
              style={styles.quickSheetClose}
            >
              <DunaIcon color={colors.bone} name="close" size={20} />
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={styles.quickSheetList}
            showsVerticalScrollIndicator={false}
          >
            {actions.map((action) => (
              <Pressable
                accessibilityHint={action.detail}
                accessibilityRole="button"
                key={action.key}
                onPress={() => {
                  selectionHaptic();
                  onClose();
                  setTimeout(() => onAction(action.key), 180);
                }}
                style={({ pressed }) => [
                  styles.quickSheetAction,
                  pressed && styles.homeQuickActionPressed,
                ]}
              >
                <View style={styles.quickSheetActionIcon}>
                  <DunaIcon color={colors.aqua} name={action.icon} size={22} />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.quickSheetActionTitle}>
                    {action.label}
                  </Text>
                  <Text style={styles.quickSheetActionDetail}>
                    {action.detail}
                  </Text>
                </View>
                <DunaIcon color={colors.muted} name="chevron-right" size={18} />
              </Pressable>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
