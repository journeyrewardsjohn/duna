/**
 * The centre "+" (board P-Add): every create action in one sheet, opened
 * from any tab. A bottom sheet on iPhone and the closed Duo, a centred
 * sheet on the open Duo and iPad (AdaptiveSheet decides by width class).
 */
import { ScrollView, StyleSheet, View } from "react-native";
import { AdaptiveSheet, Text, useTheme } from "@duna/ui/native";
import type { HomeQuickAction } from "../features/home/home-quick-action";
import type { GlyphName } from "@duna/ui/native";
import { IconButton, Row } from "./ui";

export const NEW_ACTIONS: readonly {
  readonly key: HomeQuickAction;
  readonly title: string;
  readonly summary: string;
  readonly icon: GlyphName;
}[] = [
  {
    key: "book-court",
    title: "Book a court",
    summary: "Open times across your beaches and clubs",
    icon: "court",
  },
  {
    key: "find-coach",
    title: "Book a lesson",
    summary: "Choose a format and a coach",
    icon: "lesson",
  },
  {
    key: "find-match",
    title: "Find a match",
    summary: "Open matches at your level",
    icon: "ball",
  },
  {
    key: "create-match",
    title: "Create a match",
    summary: "Book a court and leave spots open",
    icon: "users",
  },
  {
    key: "score-match",
    title: "Score a match",
    summary: "Keep score point by point, then see your Sand Rating",
    icon: "score",
  },
  {
    key: "upload-score",
    title: "Add a result",
    summary: "Your opponents confirm it",
    icon: "trophy",
  },
  {
    key: "record-video",
    title: "Record a game",
    summary: "Film with Duna Vision and keep score",
    icon: "film",
  },
  {
    key: "join-event",
    title: "Join an event",
    summary: "Tournaments, clinics and leagues",
    icon: "tournament",
  },
];

export function NewSheet({
  visible,
  onClose,
  onAction,
}: {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly onAction: (action: HomeQuickAction) => void;
}) {
  const { tokens } = useTheme();
  return (
    <AdaptiveSheet
      accessibilityLabel="New"
      kind="dialog"
      onClose={onClose}
      visible={visible}
    >
      <View style={[styles.head, { paddingHorizontal: tokens.space["4"] }]}>
        <Text accessibilityRole="header" variant="phone-heading">
          New
        </Text>
        <IconButton icon="close" label="Close" onPress={onClose} />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: tokens.space["6"] }}>
        {NEW_ACTIONS.map((action) => (
          <Row
            icon={action.icon}
            key={action.key}
            onPress={() => {
              onClose();
              // Let the sheet leave before the next one arrives.
              setTimeout(() => onAction(action.key), 240);
            }}
            summary={action.summary}
            testID={`new-${action.key}`}
            title={action.title}
          />
        ))}
      </ScrollView>
    </AdaptiveSheet>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
});
