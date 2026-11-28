/**
 * The top bar of every Pro tab root (board P00-NavMap: "Top bar on every
 * tab: organization switcher · Duna AI · Create · account") and the quiet
 * preview notice under a tab's title.
 */
import { Pressable, StyleSheet, View } from "react-native";
import { demoOrganization } from "@duna/core/demo";
import { DunaMark, Icon, Text, useTheme } from "@duna/ui/native";
import { useProRuntime } from "../../runtime";
import { useShell } from "./ShellContext";
import { IconButton } from "./ui";

/** "Sunset Beach Club" → "SB". */
export function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "D"
  );
}

/** The organisation you are working in, for the top bar and the account. */
export function useOrganizationName(): string {
  const { authOrganizations, activeAuthOrganizationId, dashboard } =
    useProRuntime();
  return (
    dashboard?.organization.name ??
    authOrganizations?.find(
      (organization) => organization.id === activeAuthOrganizationId,
    )?.name ??
    demoOrganization.name
  );
}

export function TopBar() {
  const shell = useShell();
  const { colors, tokens } = useTheme();
  const name = useOrganizationName();
  return (
    <View style={styles.bar} testID="pro-top-bar">
      <Pressable
        accessibilityHint="Opens your account and the organisation switcher"
        accessibilityLabel={`Organisation: ${name}. Switch organisation`}
        accessibilityRole="button"
        hitSlop={4}
        onPress={() => shell.open("account")}
        style={({ pressed }) => [
          styles.org,
          { borderRadius: tokens.radius.lg, opacity: pressed ? 0.7 : 1 },
        ]}
        testID="top-bar-organization"
      >
        <View style={[styles.clubMark, { backgroundColor: colors.action }]}>
          <Text
            maxFontSizeMultiplier={1.2}
            style={{ color: colors["on-action"] }}
            variant="micro"
            weight={600}
          >
            {initialsOf(name)}
          </Text>
        </View>
        <Text
          numberOfLines={1}
          style={styles.orgName}
          variant="phone-body"
          weight={600}
        >
          {name}
        </Text>
        <Icon name="chevron-down" size="inline" tone="text-2" />
      </Pressable>
      <View style={styles.actions}>
        <IconButton
          label="Ask Duna"
          onPress={() => shell.open("ai")}
          testID="top-bar-ask-duna"
        >
          <DunaMark decorative size={20} />
        </IconButton>
        <IconButton
          icon="plus"
          label="Create"
          onPress={shell.openCreate}
          testID="top-bar-create"
        />
        <IconButton
          icon="you"
          label="Account"
          onPress={() => shell.open("account")}
          testID="top-bar-account"
        />
      </View>
    </View>
  );
}

/**
 * The preview build's notice: one quiet line in sentence case under a tab's
 * title (it replaces the old full-width capitals banner). A long press opens
 * the development Layout lab. Live builds show nothing.
 */
export function PreviewNotice() {
  const { mode } = useProRuntime();
  const shell = useShell();
  if (mode !== "preview") return null;
  return (
    <Pressable
      accessibilityHint="Long press opens the development Layout lab"
      accessibilityLabel="Preview data. Live operations and money actions are off."
      delayLongPress={600}
      onLongPress={shell.openLayoutLab}
      style={styles.notice}
      testID="preview-notice"
    >
      <Icon name="info" size="chip" tone="text-2" />
      <Text style={styles.noticeText} tone="text-2" variant="phone-meta">
        Preview data · live operations and money actions are off
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    minHeight: 48,
  },
  org: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
    flexShrink: 1,
    paddingRight: 4,
  },
  clubMark: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  orgName: { flexShrink: 1 },
  actions: { flexDirection: "row", gap: 8 },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 24,
  },
  noticeText: { flexShrink: 1 },
});
