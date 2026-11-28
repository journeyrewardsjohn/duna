/**
 * The search sheet (board F-Search-Sheet): Where · When · What as three
 * sections, one open at a time, and "Show N results". Every choice applies
 * at once (the results behind update live); the sheet is an
 * `AdaptiveSheet`, a bottom sheet on phones and a panel on wider windows.
 */
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { AdaptiveSheet } from "@duna/ui/native/layout";
import { IconButton } from "../../app/ui";
import { Text, useHaptics, useTheme } from "@duna/ui/native";
import {
  SearchSection,
  WhatPicker,
  WhenPicker,
  WherePicker,
  type WhereOption,
} from "@duna/ui/native/search";
import { useMemo, useState } from "react";
import { useShell } from "../../app/ShellContext";
import { usePlayerRuntime } from "../../../runtime";
import { useFind, type FindStep } from "./FindContext";
import {
  FIND_WHAT_OPTIONS,
  WHEN_PRESETS,
  dunaPlacesMatching,
  isoDate,
  whatLabel,
  whenForPreset,
  whenForRange,
  whenLabel,
  type FindWhat,
  type FindWhere,
  type WhenPresetKey,
} from "./find-search";
import { ActionButton } from "./parts";
import { usePlaces } from "./use-places";

const QUESTIONS: Readonly<Record<FindStep, string>> = {
  where: "Where are you looking?",
  when: "When do you want to play?",
  what: "What are you looking for?",
};

function initials(title: string): string {
  return title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join("");
}

export function SearchSheet() {
  const find = useFind();
  const shell = useShell();
  const runtime = usePlayerRuntime();
  const haptics = useHaptics();
  const { colors, tokens } = useTheme();
  const [query, setQuery] = useState("");
  const places = usePlaces(query);
  const step = find.searchStep;
  const items = runtime.discoveryMap?.items;

  const clubs = useMemo(
    () =>
      dunaPlacesMatching(items ?? [], query, find.yourOrganizationIds).map(
        (item): WhereOption => ({
          id: `club:${item.entityType}:${item.id}`,
          kind: item.entityType === "venue" ? "venue" : "club",
          title: item.title,
          subtitle: item.subtitle,
          markInitials: initials(item.title),
          yours: Boolean(
            item.organizationId &&
            find.yourOrganizationIds.has(item.organizationId),
          ),
        }),
      ),
    [find.yourOrganizationIds, items, query],
  );

  const choose = (where: FindWhere) => {
    haptics.selection();
    find.rememberPlace(where);
    find.setCriteria({ ...find.criteria, where });
    setQuery("");
    find.openSearch("when");
  };

  const onSelect = (option: WhereOption) => {
    if (option.kind === "club" || option.kind === "venue") {
      const item = (items ?? []).find(
        (candidate) =>
          `club:${candidate.entityType}:${candidate.id}` === option.id,
      );
      if (item?.latitude === undefined || item.longitude === undefined) return;
      choose({
        kind: "club",
        label: item.title,
        latitude: item.latitude,
        longitude: item.longitude,
        ...(item.organizationId ? { organizationId: item.organizationId } : {}),
      });
      return;
    }
    if (option.kind === "recent") {
      const recent = find.recents.find(
        (candidate) => `recent:${candidate.label}` === option.id,
      );
      if (recent) choose(recent);
      return;
    }
    const suggestion = places.suggestions.find(
      (candidate) => candidate.placeId === option.id,
    );
    if (!suggestion) return;
    void places.resolve(suggestion).then((where) => {
      if (where) choose(where);
    });
  };

  const now = new Date();
  const when = find.criteria.when;
  const whatValue = find.criteria.what;
  const counts = new Map(
    find.outcome.groups.map((group) => [group.key, group.results.length]),
  );

  const sections: readonly {
    readonly key: FindStep;
    readonly label: string;
    readonly value: string;
  }[] = [
    {
      key: "where",
      label: "Where",
      value: find.criteria.where?.label ?? "Anywhere",
    },
    { key: "when", label: "When", value: whenLabel(when) ?? "Any time" },
    { key: "what", label: "What", value: whatLabel(whatValue) ?? "For you" },
  ];

  return (
    <AdaptiveSheet
      accessibilityLabel="Search"
      onClose={find.closeSearch}
      testID="find-search-sheet"
      visible={step !== null}
    >
      <View style={[styles.header, { paddingHorizontal: tokens.space["4"] }]}>
        <IconButton
          icon="close"
          label="Close search"
          onPress={find.closeSearch}
        />
        <Text accessibilityRole="header" variant="phone-heading">
          Search
        </Text>
        <Pressable
          accessibilityRole="button"
          hitSlop={12}
          onPress={() => {
            haptics.selection();
            find.setCriteria({
              where: null,
              when: { preset: "any-time" },
              what: ["for-you"],
            });
            setQuery("");
          }}
          style={styles.clear}
        >
          <Text tone="link" variant="phone-body" weight={600}>
            Clear all
          </Text>
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: tokens.space["4"],
          paddingBottom: tokens.space["4"],
          gap: tokens.space["2"],
        }}
        keyboardShouldPersistTaps="handled"
        style={styles.fill}
      >
        {sections.map((section) => (
          <SearchSection
            key={section.key}
            label={section.label}
            onToggle={() => find.openSearch(section.key)}
            open={step === section.key}
            question={QUESTIONS[section.key]}
            step={section.key}
            value={section.value}
          >
            {section.key === "where" ? (
              <WherePicker
                clubs={clubs}
                emptyAction={{
                  label: "Add this place and your score",
                  onPress: () => {
                    find.closeSearch();
                    shell.open("score");
                  },
                }}
                nearMe={{
                  label: "Use my location",
                  ...(find.criteria.where?.kind === "current"
                    ? { subtitle: find.criteria.where.label }
                    : {}),
                  denied: find.location === "denied",
                  onPress: () => {
                    void find.locate().then((where) => {
                      if (where) choose(where);
                    });
                  },
                }}
                onQueryChange={setQuery}
                onRemoveRecent={(option) => {
                  const recent = find.recents.find(
                    (candidate) => `recent:${candidate.label}` === option.id,
                  );
                  if (recent) find.forgetPlace(recent);
                }}
                onSelect={onSelect}
                places={places.suggestions.map((suggestion) => ({
                  id: suggestion.placeId,
                  kind: "place",
                  title: suggestion.mainText,
                  subtitle: suggestion.secondaryText,
                }))}
                query={query}
                recents={find.recents.map((recent) => ({
                  id: `recent:${recent.label}`,
                  kind: "recent",
                  title: recent.label,
                }))}
                status={
                  places.status === "empty" && clubs.length > 0
                    ? "ready"
                    : places.status
                }
              />
            ) : section.key === "when" ? (
              <WhenPicker
                label={whenLabel(when) ?? "Any time"}
                onClear={() =>
                  find.setCriteria({
                    ...find.criteria,
                    when: { preset: "any-time" },
                  })
                }
                onDone={() => find.openSearch("what")}
                onPreset={(key) =>
                  find.setCriteria({
                    ...find.criteria,
                    when: whenForPreset(
                      key as Exclude<WhenPresetKey, "custom">,
                      now,
                    ),
                  })
                }
                onRange={(start, end) =>
                  find.setCriteria({
                    ...find.criteria,
                    when: whenForRange(start, end, now),
                  })
                }
                presets={WHEN_PRESETS}
                today={isoDate(now)}
                value={{
                  preset: when.preset,
                  ...(when.from ? { startsAt: when.from } : {}),
                  ...(when.to ? { endsAt: when.to } : {}),
                }}
              />
            ) : (
              <WhatPicker
                onChange={(next) =>
                  find.setCriteria({
                    ...find.criteria,
                    what: next as readonly FindWhat[],
                  })
                }
                options={FIND_WHAT_OPTIONS.map((option) => ({
                  value: option.value,
                  label: option.label,
                  detail: option.detail,
                  icon: option.icon,
                  count:
                    option.value === "for-you"
                      ? null
                      : (counts.get(option.value) ?? null),
                }))}
                value={whatValue}
              />
            )}
          </SearchSection>
        ))}
      </ScrollView>
      <View
        style={{
          padding: tokens.space["4"],
          borderTopColor: colors.line,
          borderTopWidth: StyleSheet.hairlineWidth,
        }}
      >
        <ActionButton
          label={`Show ${find.outcome.total} result${find.outcome.total === 1 ? "" : "s"}`}
          onPress={() => {
            haptics.confirmed(0);
            find.closeSearch();
          }}
          testID="find-show-results"
        />
      </View>
    </AdaptiveSheet>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 56,
    gap: 8,
  },
  clear: { minHeight: 44, justifyContent: "center" },
});
