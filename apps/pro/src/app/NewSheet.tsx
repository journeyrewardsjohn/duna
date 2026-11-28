/**
 * Create (+) in the top bar of every tab (board P00-NavMap: "One + in the
 * top bar"): every create and courtside action a coach reaches for, in one
 * sheet. A bottom sheet on iPhone and the closed Duo, a centred sheet on the
 * open Duo and iPad (AdaptiveSheet decides by width class).
 */
import { ScrollView, StyleSheet, View } from "react-native";
import { AdaptiveSheet, Text, useTheme, type GlyphName } from "@duna/ui/native";
import type { RouteKey } from "./router";
import { IconButton, Row } from "./ui";

export const NEW_ACTIONS: readonly {
  readonly route: RouteKey;
  readonly title: string;
  readonly summary: string;
  readonly icon: GlyphName;
}[] = [
  {
    route: "create",
    title: "New session or offer",
    summary: "A lesson, clinic, program, service or product",
    icon: "lesson",
  },
  {
    route: "getPaid",
    title: "Get paid",
    summary: "Collect in person or send a payment link",
    icon: "tap-to-pay",
  },
  {
    route: "checkin",
    title: "Check in players",
    summary: "Scan passes and tickets at the court",
    icon: "pass",
  },
  {
    route: "courtside",
    title: "Score a match",
    summary: "Courtside scoring on your courts",
    icon: "score",
  },
  {
    route: "messages",
    title: "Message players",
    summary: "A player, a guardian or a whole group",
    icon: "message",
  },
  {
    route: "film",
    title: "Review film",
    summary: "Clips and coach video for your players",
    icon: "film",
  },
];

export function NewSheet({
  visible,
  onClose,
  onOpen,
}: {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly onOpen: (route: RouteKey) => void;
}) {
  const { tokens } = useTheme();
  return (
    <AdaptiveSheet
      accessibilityLabel="Create"
      kind="dialog"
      onClose={onClose}
      visible={visible}
    >
      <View style={[styles.head, { paddingHorizontal: tokens.space["4"] }]}>
        <Text accessibilityRole="header" variant="phone-heading">
          Create
        </Text>
        <IconButton icon="close" label="Close" onPress={onClose} />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: tokens.space["6"] }}>
        {NEW_ACTIONS.map((action) => (
          <Row
            icon={action.icon}
            key={action.route}
            onPress={() => {
              onClose();
              // Let the sheet leave before the next surface arrives.
              setTimeout(() => onOpen(action.route), 240);
            }}
            summary={action.summary}
            testID={`new-${action.route}`}
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
