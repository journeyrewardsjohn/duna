/**
 * People (Students for coaches), the tab's root (M-R4, owner's point 10).
 *
 * A real list: avatar (photo or a designed initials mark), the name on one
 * line, the one fact that matters next on the second (needs attention, the
 * next session, the plan and credits), a small status chip only when it
 * says something, and the Sand Rating as the kit's inline ring (a dash
 * while provisional). "Add person" sits top right under the top bar; search
 * and the segments scroll edge to edge without clipping.
 *
 * iPhone and the closed Duo: tap a person to push their page. Open Duo and
 * iPad: the list beside the person (AdaptiveScaffold), the first person
 * shown until one is chosen.
 */
import { useState, type ReactNode } from "react";
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import {
  AdaptiveScaffold,
  EmptyState,
  Icon,
  Text,
  Title,
  useHaptics,
  useTheme,
} from "@duna/ui/native";
import { RatingRing } from "@duna/ui/native/score";
import type { ResolvedLayout } from "@duna/ui/native/layout";
import { dunaApiBaseUrl } from "../../../mobile-api";
import { useShell } from "../../app/ShellContext";
import { PreviewNotice, TopBar } from "../../app/TopBar";
import { tabTitle } from "../../app/router";
import { Row, usePaneEdges } from "../../app/ui";
import { Avatar } from "../../shared/Avatar";
import { DunaTextInput } from "../session/duna-text";
import { AddPersonSheet } from "./AddPersonSheet";
import {
  SEGMENTS,
  filterRoster,
  segmentCounts,
  type RosterRow,
  type Segment,
} from "./people-model";
import { PersonScreen } from "./PersonScreen";
import { useRoster } from "./use-roster";

const PRESSED: ViewStyle = { opacity: 0.86, transform: [{ scale: 0.99 }] };

export function PeopleTabRoot({
  layout,
  detail,
  sideBySide,
  selectedPersonId,
}: {
  readonly layout: ResolvedLayout;
  readonly detail: ReactNode;
  readonly sideBySide: boolean;
  readonly selectedPersonId?: string;
}) {
  const roster = useRoster();
  const first = filterRoster(roster.rows, "all", "")[0];
  return (
    <AdaptiveScaffold
      detail={detail}
      emptyDetail={
        sideBySide && first ? <PersonScreen personId={first.id} /> : null
      }
      layout={layout}
      primary={
        <PeopleList
          selectedId={selectedPersonId ?? (sideBySide ? first?.id : undefined)}
        />
      }
    />
  );
}

export function PeopleList({ selectedId }: { readonly selectedId?: string }) {
  const shell = useShell();
  const roster = useRoster();
  const edges = usePaneEdges();
  const { colors, tokens } = useTheme();
  const haptics = useHaptics();
  const [segment, setSegment] = useState<Segment>("all");
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const counts = segmentCounts(roster.rows);
  const rows = filterRoster(roster.rows, segment, query);
  const gutter = tokens.space["4"];

  const header = (
    <View style={{ gap: tokens.space["3"], paddingBottom: tokens.space["2"] }}>
      <TopBar />
      <View style={styles.titleRow}>
        <View style={styles.flex}>
          <Title>{tabTitle("people", shell.audience)}</Title>
          <Text tone="text-2" variant="phone-meta">
            {`${roster.rows.length} ${roster.rows.length === 1 ? "person" : "people"} at your club`}
          </Text>
        </View>
        <Pressable
          accessibilityHint="Invites a player or a junior with their guardian"
          accessibilityRole="button"
          onPress={() => {
            haptics.confirmed(0);
            setAdding(true);
          }}
          style={({ pressed }) => [
            styles.add,
            {
              backgroundColor: colors.action,
              borderRadius: tokens.radius.pill,
            },
            pressed ? PRESSED : null,
          ]}
          testID="people-add"
        >
          <Icon name="user-plus" size="inline" tone="on-action" />
          <Text
            maxFontSizeMultiplier={1.4}
            numberOfLines={1}
            tone="on-action"
            variant="phone-meta"
            weight={600}
          >
            Add person
          </Text>
        </Pressable>
      </View>
      <PreviewNotice />
      <View
        style={[
          styles.search,
          {
            backgroundColor: colors.surface,
            borderColor: colors.line,
            borderRadius: tokens.radius.lg,
          },
        ]}
      >
        <Icon name="search" size="inline" tone="text-3" />
        <DunaTextInput
          accessibilityLabel="Search people"
          autoCorrect={false}
          clearButtonMode="while-editing"
          onChangeText={setQuery}
          placeholder={`Search ${roster.rows.length} people`}
          returnKeyType="search"
          style={styles.searchInput}
          testID="people-search"
          value={query}
        />
      </View>
      <ScrollView
        accessibilityRole="tablist"
        contentContainerStyle={{ gap: 8, paddingHorizontal: gutter }}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -gutter }}
        testID="people-segments"
      >
        {SEGMENTS.filter(
          (item) => item.key === "all" || counts[item.key] > 0,
        ).map((item) => {
          const on = segment === item.key;
          return (
            <Pressable
              accessibilityLabel={`${item.label}, ${counts[item.key]}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              key={item.key}
              onPress={() => {
                haptics.selection();
                setSegment(item.key);
              }}
              style={({ pressed }) => [
                styles.segment,
                {
                  backgroundColor: on ? colors.action : colors.surface,
                  borderColor: on ? colors.action : colors.line,
                  borderRadius: tokens.radius.pill,
                },
                pressed ? PRESSED : null,
              ]}
              testID={`people-segment-${item.key}`}
            >
              <Text
                maxFontSizeMultiplier={1.6}
                numberOfLines={1}
                tone={on ? "on-action" : "text"}
                variant="phone-meta"
                weight={600}
              >
                {item.label}
              </Text>
              <Text
                family="mono"
                maxFontSizeMultiplier={1.6}
                numberOfLines={1}
                tabular
                tone={on ? "on-action" : "text-3"}
                variant="phone-meta"
              >
                {String(counts[item.key])}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );

  const footer = (
    <View style={{ gap: tokens.space["2"], paddingTop: tokens.space["6"] }}>
      <Text tone="text-2" variant="phone-meta" weight={600}>
        Also in {tabTitle("people", shell.audience)}
      </Text>
      <Row
        icon="film"
        onPress={() => shell.open("film")}
        summary="Coach video and clips for your players"
        testID="people-film"
        title="Film review"
      />
      <Row
        icon="film"
        onPress={() =>
          void WebBrowser.openBrowserAsync(`${dunaApiBaseUrl}/app/video`)
        }
        summary="Review clips beside the source video (opens the web)"
        testID="hub-row-player-studio"
        title="Duna Vision Player Studio"
      />
    </View>
  );

  return (
    <View style={[styles.flex, { backgroundColor: colors.ground }]}>
      <FlatList
        ItemSeparatorComponent={() => (
          <View
            style={{
              height: StyleSheet.hairlineWidth,
              backgroundColor: colors.line,
              marginLeft: 44 + 12,
            }}
          />
        )}
        ListEmptyComponent={
          roster.rows.length ? (
            <EmptyState
              compact
              text="Try another name, or clear the filter."
              title="No one matches"
            />
          ) : (
            <EmptyState
              action={{ label: "Add person", onPress: () => setAdding(true) }}
              compact
              text="Players, juniors and guardians you add or who book show up here."
              title="No people yet"
            />
          )
        }
        ListFooterComponent={footer}
        ListHeaderComponent={header}
        contentContainerStyle={{
          paddingTop: edges.top + tokens.space["2"],
          paddingBottom: edges.bottom + tokens.space["8"],
          paddingLeft: edges.left + gutter,
          paddingRight: edges.right + gutter,
        }}
        data={rows}
        keyExtractor={(row) => row.id}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <PersonListRow
            onPress={() => shell.open("people", { personId: item.id })}
            row={item}
            selected={item.id === selectedId}
          />
        )}
        testID="people-list"
      />
      <AddPersonSheet onClose={() => setAdding(false)} visible={adding} />
    </View>
  );
}

const CHIP_TONES = {
  attention: { fill: "attention-wash", ink: "attention" },
  info: { fill: "info-wash", ink: "info" },
  neutral: { fill: "surface-sunken", ink: "text-2" },
} as const;

export function PersonListRow({
  row,
  onPress,
  selected,
}: {
  readonly row: RosterRow;
  readonly onPress: () => void;
  readonly selected?: boolean;
}) {
  const { colors, tokens } = useTheme();
  const haptics = useHaptics();
  const chip = row.chip ? CHIP_TONES[row.chip.tone] : null;
  return (
    <Pressable
      accessibilityHint="Opens their plan, bookings, family and notes"
      accessibilityLabel={row.accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: selected ? colors.selected : "transparent",
          borderRadius: tokens.radius.lg,
        },
        pressed ? { backgroundColor: colors["surface-sunken"] } : null,
      ]}
      testID={`person-row-${row.id}`}
    >
      <Avatar id={row.id} initials={row.initials} url={row.avatarUrl} />
      <View style={styles.rowText}>
        <View style={styles.nameLine}>
          <Text
            numberOfLines={1}
            style={styles.name}
            variant="phone-body"
            weight={600}
          >
            {row.name}
          </Text>
          {row.chip && chip ? (
            <View
              style={[
                styles.chip,
                { backgroundColor: colors[chip.fill], borderRadius: 10 },
              ]}
            >
              <Text
                maxFontSizeMultiplier={1.3}
                numberOfLines={1}
                tone={chip.ink}
                variant="micro"
                weight={600}
              >
                {row.chip.label}
              </Text>
            </View>
          ) : null}
        </View>
        <Text numberOfLines={1} tone={row.factTone} variant="phone-meta">
          {row.fact}
        </Text>
      </View>
      <RatingRing
        animate={false}
        reliability={row.rating.reliability}
        size="inline"
        value={row.rating.value}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  titleRow: { flexDirection: "row", alignItems: "flex-end", gap: 12 },
  add: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 16,
  },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchInput: {
    flex: 1,
    minHeight: 44,
    borderWidth: 0,
    backgroundColor: "transparent",
    paddingHorizontal: 0,
  },
  segment: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 68,
    paddingVertical: 10,
    paddingHorizontal: 0,
  },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  nameLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { flexShrink: 1 },
  chip: { flexShrink: 0, paddingHorizontal: 8, paddingVertical: 2 },
});
