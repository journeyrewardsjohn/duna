/**
 * Where you played (M-P4a): the Find Where picker in a sheet. Duna's own
 * courts first (a venue id the match keeps), then places from the maps
 * search ("Places"), which a finished result keeps as a location. A live
 * match can only name a Duna venue today (`player.startMatch` takes a venue
 * id, not a place: listed under "Needs API").
 */
import { StyleSheet, View } from "react-native";
import { AdaptiveSheet, Text, useTheme } from "@duna/ui/native";
import { WherePicker, type WhereOption } from "@duna/ui/native/search";
import { useMemo, useState } from "react";
import { usePlayerRuntime } from "../../../runtime";
import { IconButton, Row } from "../../app/ui";
import { usePlaces } from "../find/use-places";
import type { ChosenPlace } from "./where-types";

export type { ChosenPlace } from "./where-types";

function initials(title: string): string {
  return title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join("");
}

export function WhereField({
  value,
  onChange,
  venuesOnly = false,
}: {
  readonly value: ChosenPlace | null;
  readonly onChange: (place: ChosenPlace | null) => void;
  readonly venuesOnly?: boolean;
}) {
  const runtime = usePlayerRuntime();
  const { tokens } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const places = usePlaces(venuesOnly ? "" : query);
  const venues = useMemo(() => {
    const text = query.trim().toLowerCase();
    return (runtime.discoveryMap?.items ?? [])
      .filter((item) => item.entityType === "venue")
      .filter(
        (item) =>
          !text ||
          item.title.toLowerCase().includes(text) ||
          item.subtitle.toLowerCase().includes(text),
      )
      .slice(0, 8);
  }, [query, runtime.discoveryMap?.items]);
  const close = () => {
    setOpen(false);
    setQuery("");
  };
  const onSelect = (option: WhereOption) => {
    const venue = venues.find((item) => `venue:${item.id}` === option.id);
    if (venue) {
      onChange({ venueId: venue.id, label: venue.title });
      close();
      return;
    }
    const suggestion = places.suggestions.find(
      (candidate) => candidate.placeId === option.id,
    );
    if (!suggestion) return;
    void places.resolve(suggestion).then((where) => {
      if (!where) return;
      onChange({
        label: where.label,
        location: {
          label: [suggestion.mainText, suggestion.secondaryText]
            .filter(Boolean)
            .join(", "),
          name: where.label,
          googlePlaceId: suggestion.placeId,
          latitude: where.latitude,
          longitude: where.longitude,
        },
      });
      close();
    });
  };
  return (
    <>
      <Row
        icon="pin"
        onPress={() => setOpen(true)}
        summary={value ? value.label : "Optional"}
        testID="where-field"
        title={value ? "Where" : "Where did you play?"}
        trailing={
          value ? (
            <IconButton
              icon="close"
              label="Clear where"
              onPress={() => onChange(null)}
            />
          ) : undefined
        }
      />
      <AdaptiveSheet
        accessibilityLabel="Where"
        kind="dialog"
        onClose={close}
        visible={open}
      >
        <View style={[styles.head, { paddingHorizontal: tokens.space["4"] }]}>
          <Text accessibilityRole="header" variant="phone-heading">
            Where did you play?
          </Text>
          <IconButton icon="close" label="Close" onPress={close} />
        </View>
        <View style={{ padding: tokens.space["4"], flex: 1 }}>
          <WherePicker
            clubs={venues.map((item) => ({
              id: `venue:${item.id}`,
              kind: "venue",
              title: item.title,
              subtitle: item.subtitle,
              markInitials: initials(item.title),
            }))}
            messages={
              venuesOnly
                ? {
                    empty: () =>
                      "Live scoring can name a court on Duna for now. Score without one, or add the result afterwards with any place.",
                  }
                : undefined
            }
            nearMe={{
              label: "No court",
              subtitle: "Skip where for now",
              onPress: () => {
                onChange(null);
                close();
              },
            }}
            onQueryChange={setQuery}
            onSelect={onSelect}
            places={
              venuesOnly
                ? []
                : places.suggestions.map((suggestion) => ({
                    id: suggestion.placeId,
                    kind: "place",
                    title: suggestion.mainText,
                    subtitle: suggestion.secondaryText,
                  }))
            }
            query={query}
            recents={[]}
            status={
              venuesOnly
                ? venues.length > 0 || !query.trim()
                  ? "idle"
                  : "empty"
                : places.status === "empty" && venues.length > 0
                  ? "ready"
                  : places.status
            }
          />
        </View>
      </AdaptiveSheet>
    </>
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
