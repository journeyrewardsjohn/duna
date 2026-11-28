import { foregroundFor, monogramFor } from "@duna/tideline-core";
import type { ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { Icon, type GlyphName } from "../icons/Icon";
import { RallyLoader } from "../loaders/loaders";
import { useHaptics } from "../motion/haptics";
import { StateAction } from "../states/StateAction";
import { useTheme } from "../theme/ThemeProvider";
import { LARGEST_ACCESSIBILITY_SCALE } from "../type/scale";
import { Text, textStyleFor } from "../type/Text";
import {
  DEFAULT_WHERE_MESSAGES,
  whereMessage,
  type WhereMessages,
  type WhereStatus,
} from "./logic";

export interface WhereOption {
  readonly id: string;
  readonly kind: "club" | "venue" | "place" | "recent" | "current";
  readonly title: string;
  readonly subtitle?: string;
  /** The club's colour for its small mark. */
  readonly markColor?: string;
  /** The club's initials; default from the title. */
  readonly markInitials?: string;
  /** The player's own club. */
  readonly yours?: boolean;
}

export interface WherePickerProps {
  readonly query: string;
  readonly onQueryChange: (q: string) => void;
  readonly status: WhereStatus;
  readonly nearMe: {
    readonly label: string;
    readonly subtitle?: string;
    readonly denied?: boolean;
    readonly onPress: () => void;
  };
  readonly clubs: ReadonlyArray<WhereOption>;
  readonly places: ReadonlyArray<WhereOption>;
  readonly recents: ReadonlyArray<WhereOption>;
  readonly onSelect: (option: WhereOption) => void;
  readonly onRemoveRecent?: (option: WhereOption) => void;
  /** Offered in the empty state as a secondary button. */
  readonly emptyAction?: {
    readonly label: string;
    readonly onPress: () => void;
  };
  readonly messages?: Partial<WhereMessages>;
  readonly testID?: string;
}

export const WHERE_PLACEHOLDER = "City, state, club or courts";
export const WHERE_CLEAR_LABEL = "Clear where";
export const WHERE_GROUP_LABELS = {
  near: "Near you",
  clubs: "On Duna",
  places: "Places",
  recent: "Recent",
} as const;
export const YOUR_CLUB_TAG = "Your club";

/** The spoken name of a row. Pure. */
export function whereOptionLabel(option: WhereOption): string {
  return [option.title, option.yours ? YOUR_CLUB_TAG : null, option.subtitle]
    .filter(Boolean)
    .join(", ");
}

/** The small club mark: the club's colour (Night Court without one) and its initials. */
export function ClubMark({
  color,
  initials,
  title,
  size = 28,
}: {
  readonly color?: string;
  readonly initials?: string;
  readonly title: string;
  readonly size?: number;
}) {
  const { colors, tokens } = useTheme();
  const { fontScale } = useWindowDimensions();
  // The square grows with the text so the initials never clip.
  const px = Math.ceil(
    size * Math.min(Math.max(fontScale, 1), LARGEST_ACCESSIBILITY_SCALE),
  );
  const fill = color ?? colors["club-core"];
  const ink = foregroundFor(fill).foreground;
  const text = initials ?? monogramFor(title).text ?? "";
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.mark,
        {
          width: px,
          height: px,
          borderRadius: tokens.radius.sm,
          backgroundColor: fill,
        },
      ]}
    >
      <Text style={{ color: ink }} variant="micro" weight={600}>
        {text}
      </Text>
    </View>
  );
}

function Group({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  const { tokens } = useTheme();
  return (
    <View style={{ gap: tokens.space["1"] }}>
      <Text
        accessibilityRole="header"
        tone="text-2"
        variant="phone-meta"
        weight={600}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

function Row({
  option,
  lead,
  onPress,
  trailing,
  testID,
}: {
  readonly option: WhereOption;
  readonly lead: ReactNode;
  readonly onPress: () => void;
  readonly trailing?: ReactNode;
  readonly testID?: string;
}) {
  const { colors, tokens } = useTheme();
  return (
    <View style={styles.rowWrap}>
      <Pressable
        accessibilityLabel={whereOptionLabel(option)}
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [
          styles.row,
          {
            minHeight: tokens.size.row,
            gap: tokens.space["3"],
            paddingVertical: tokens.space["2"],
            opacity: pressed ? 0.7 : 1,
          },
        ]}
        testID={testID}
      >
        {lead}
        <View style={styles.rowText}>
          <View style={styles.titleLine}>
            <Text
              accessible={false}
              style={styles.shrink}
              variant="phone-body"
              weight={600}
            >
              {option.title}
            </Text>
            {option.yours ? (
              <View
                style={[
                  styles.tag,
                  {
                    backgroundColor: colors.selected,
                    borderRadius: tokens.radius.pill,
                  },
                ]}
              >
                <Text
                  accessible={false}
                  tone="on-selected"
                  variant="micro"
                  weight={600}
                >
                  {YOUR_CLUB_TAG}
                </Text>
              </View>
            ) : null}
          </View>
          {option.subtitle ? (
            <Text accessible={false} tone="text-2" variant="phone-meta">
              {option.subtitle}
            </Text>
          ) : null}
        </View>
      </Pressable>
      {trailing}
    </View>
  );
}

const lead = (name: GlyphName) => (
  <View style={styles.lead}>
    <Icon name={name} size="control" tone="text-2" />
  </View>
);

/**
 * Where step: a place field with every state drawn (loading with a small
 * Rally loader, empty with an optional action, error, offline, not set up),
 * then "Near you" (location, or why it is off), clubs "On Duna" with their
 * marks and "Your club", places, and recent searches that can be removed.
 */
export function WherePicker({
  query,
  onQueryChange,
  status,
  nearMe,
  clubs,
  places,
  recents,
  onSelect,
  onRemoveRecent,
  emptyAction,
  messages,
  testID,
}: WherePickerProps) {
  const { colors, tokens } = useTheme();
  const haptics = useHaptics();
  const message = whereMessage(status, query, messages);
  const denied = messages?.denied ?? DEFAULT_WHERE_MESSAGES.denied;
  const input = textStyleFor("phone-body", { color: colors.text });
  const pick = (option: WhereOption) => {
    haptics.selection();
    onSelect(option);
  };

  return (
    <View style={{ gap: tokens.space["4"] }} testID={testID}>
      <View
        style={[
          styles.field,
          {
            minHeight: tokens.size.target,
            borderRadius: tokens.radius.lg,
            borderColor: colors["border-control"],
            backgroundColor: colors.surface,
            paddingLeft: tokens.space["3"],
            gap: tokens.space["2"],
          },
        ]}
      >
        <Icon name="search" size="control" tone="text-2" />
        <TextInput
          accessibilityLabel={WHERE_PLACEHOLDER}
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={onQueryChange}
          placeholder={WHERE_PLACEHOLDER}
          placeholderTextColor={colors["text-3"]}
          returnKeyType="search"
          style={[input, styles.input]}
          testID={testID ? `${testID}-input` : undefined}
          value={query}
        />
        {status === "loading" ? <RallyLoader size={20} /> : null}
        {query.length > 0 ? (
          <Pressable
            accessibilityLabel={WHERE_CLEAR_LABEL}
            accessibilityRole="button"
            onPress={() => onQueryChange("")}
            style={styles.clear}
            testID={testID ? `${testID}-clear` : undefined}
          >
            <Icon name="close" size="inline" tone="text-2" />
          </Pressable>
        ) : null}
      </View>

      {message ? (
        <View
          accessibilityLiveRegion="polite"
          style={{ gap: tokens.space["2"] }}
        >
          <Text
            tone={status === "error" ? "danger" : "text-2"}
            variant="phone-meta"
          >
            {message}
          </Text>
          {status === "empty" && emptyAction ? (
            <StateAction
              kind="quiet"
              label={emptyAction.label}
              onPress={emptyAction.onPress}
            />
          ) : null}
        </View>
      ) : null}

      <Group title={WHERE_GROUP_LABELS.near}>
        <Row
          lead={lead("locate")}
          onPress={() => {
            haptics.selection();
            nearMe.onPress();
          }}
          option={{
            id: "near-me",
            kind: "current",
            title: nearMe.label,
            subtitle: nearMe.subtitle,
          }}
          testID={testID ? `${testID}-near-me` : undefined}
        />
        {nearMe.denied ? (
          <Text tone="text-2" variant="phone-meta">
            {denied}
          </Text>
        ) : null}
      </Group>

      {clubs.length > 0 ? (
        <Group title={WHERE_GROUP_LABELS.clubs}>
          {clubs.map((club) => (
            <Row
              key={club.id}
              lead={
                <View style={styles.lead}>
                  <ClubMark
                    color={club.markColor}
                    initials={club.markInitials}
                    title={club.title}
                  />
                </View>
              }
              onPress={() => pick(club)}
              option={club}
              testID={testID ? `${testID}-club-${club.id}` : undefined}
            />
          ))}
        </Group>
      ) : null}

      {places.length > 0 ? (
        <Group title={WHERE_GROUP_LABELS.places}>
          {places.map((place) => (
            <Row
              key={place.id}
              lead={lead(place.kind === "venue" ? "venue" : "pin")}
              onPress={() => pick(place)}
              option={place}
              testID={testID ? `${testID}-place-${place.id}` : undefined}
            />
          ))}
        </Group>
      ) : null}

      {recents.length > 0 ? (
        <Group title={WHERE_GROUP_LABELS.recent}>
          {recents.map((recent) => (
            <Row
              key={recent.id}
              lead={lead("clock")}
              onPress={() => pick(recent)}
              option={recent}
              testID={testID ? `${testID}-recent-${recent.id}` : undefined}
              trailing={
                onRemoveRecent ? (
                  <Pressable
                    accessibilityLabel={`Remove ${recent.title} from recent`}
                    accessibilityRole="button"
                    onPress={() => onRemoveRecent(recent)}
                    style={styles.clear}
                  >
                    <Icon name="close" size="inline" tone="text-3" />
                  </Pressable>
                ) : null
              }
            />
          ))}
        </Group>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: "row", alignItems: "center", borderWidth: 1 },
  input: { flex: 1, minHeight: 44, paddingVertical: 8 },
  clear: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  rowWrap: { flexDirection: "row", alignItems: "center" },
  row: { flex: 1, flexDirection: "row", alignItems: "center" },
  rowText: { flex: 1, gap: 2 },
  titleLine: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  shrink: { flexShrink: 1 },
  tag: { paddingHorizontal: 8, paddingVertical: 2 },
  lead: { width: 32, alignItems: "center" },
  mark: { alignItems: "center", justifyContent: "center" },
});
