/**
 * Find's map (boards D-Map-*, F-Search-Results): the same results as the
 * list, drawn as Duna pins whose size follows the zoom, "yours" inverted,
 * Solar only on a live result. The look follows the zoom (satellite at the
 * last three levels) until the person picks one with the single toggle;
 * their pick is remembered. No map token: the honest "not set up" state,
 * and the list keeps working.
 */
import { Pressable, StyleSheet, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NotConfiguredState, Text, useTheme } from "@duna/ui/native";
import {
  MapControls,
  MapLocateButton,
  MapPin,
  MapStyleToggle,
  mapStyleForZoom,
  type MapStyle,
} from "@duna/ui/native/map";
import Mapbox, { type MapState } from "@rnmapbox/maps";
import { useEffect, useMemo, useState } from "react";
import { useFind } from "./FindContext";
import type { FindResult } from "./find-search";
import { useMapboxTokenState } from "./mapbox-token";

const LOOK_KEY = "duna.find.map-look";
const STYLE_URL: Readonly<Record<MapStyle, string>> = {
  standard: "mapbox://styles/mapbox/standard",
  satellite: "mapbox://styles/mapbox/satellite-streets-v12",
};
/** Markers drawn at once; brand pins (the largest) at most two on a phone. */
const PIN_CAP = 60;
const BRAND_CAP = 2;

/** The pins to draw, selected first, then live, yours, the rest. Pure. */
export function pinsToDraw(
  results: readonly FindResult[],
  selectedId: string | null,
  cap = PIN_CAP,
): readonly FindResult[] {
  return results
    .filter(
      (result) =>
        result.latitude !== undefined && result.longitude !== undefined,
    )
    .sort(
      (left, right) =>
        Number(right.id === selectedId) - Number(left.id === selectedId) ||
        Number(right.live) - Number(left.live) ||
        Number(right.yours) - Number(left.yours),
    )
    .slice(0, cap);
}

function bounds(results: readonly FindResult[]) {
  const points = results.filter(
    (result) => result.latitude !== undefined && result.longitude !== undefined,
  );
  if (points.length === 0) return null;
  const lats = points.map((point) => point.latitude!);
  const lngs = points.map((point) => point.longitude!);
  return {
    ne: [Math.max(...lngs), Math.max(...lats)] as [number, number],
    sw: [Math.min(...lngs), Math.min(...lats)] as [number, number],
  };
}

export function FindMap({
  compact = false,
}: {
  /** Phones: fewer brand pins, controls tucked in. */
  readonly compact?: boolean;
}) {
  const find = useFind();
  const { colors, tokens } = useTheme();
  const map = useMapboxTokenState();
  const [zoom, setZoom] = useState(11);
  const [chosenLook, setChosenLook] = useState<MapStyle | null>(null);
  useEffect(() => {
    void AsyncStorage.getItem(LOOK_KEY)
      .then((value) => {
        if (value === "standard" || value === "satellite") setChosenLook(value);
      })
      .catch(() => undefined);
  }, []);
  const look = chosenLook ?? mapStyleForZoom(zoom);
  const pins = useMemo(
    () => pinsToDraw(find.results, find.selectedId),
    [find.results, find.selectedId],
  );
  const frame = useMemo(() => bounds(pins), [pins]);
  const where = find.criteria.where;

  if (map.state === "not-configured") {
    return (
      <View
        style={[
          styles.fill,
          { backgroundColor: colors.ground, padding: tokens.space["4"] },
        ]}
      >
        <NotConfiguredState
          compact
          feature="The map"
          text="The map isn't set up in this build yet. Every result is in the list."
        />
      </View>
    );
  }
  if (find.offline) {
    return (
      <View
        style={[
          styles.fill,
          styles.centre,
          { backgroundColor: colors.ground, padding: tokens.space["4"] },
        ]}
      >
        <Text variant="phone-heading">Map unavailable offline</Text>
        <Text tone="text-2" variant="phone-meta">
          The list is saved. The map returns when you're back online.
        </Text>
      </View>
    );
  }
  if (map.state === "loading") {
    return (
      <View
        style={[styles.fill, { backgroundColor: colors["surface-sunken"] }]}
      />
    );
  }

  let brandShown = 0;
  return (
    <View style={styles.fill} testID="find-map">
      <Mapbox.MapView
        attributionPosition={{ bottom: 8, left: 8 }}
        logoPosition={{ bottom: 8, left: 92 }}
        onCameraChanged={(state: MapState) => {
          const next = state.properties.zoom;
          if (Math.abs(next - zoom) >= 0.25) setZoom(next);
        }}
        scaleBarEnabled={false}
        style={styles.fill}
        styleURL={STYLE_URL[look]}
      >
        <Mapbox.Camera
          animationDuration={320}
          {...(where
            ? {
                centerCoordinate: [where.longitude, where.latitude],
                zoomLevel: 11,
              }
            : frame
              ? {
                  bounds: {
                    ...frame,
                    paddingTop: 64,
                    paddingBottom: 64,
                    paddingLeft: 48,
                    paddingRight: 48,
                  },
                }
              : { centerCoordinate: [-118.4, 33.86], zoomLevel: 9 })}
        />
        {find.location === "granted" ? <Mapbox.UserLocation visible /> : null}
        {pins.map((result) => {
          const brand = zoom >= 13.5 && brandShown < (compact ? BRAND_CAP : 3);
          if (brand) brandShown += 1;
          return (
            <Mapbox.MarkerView
              allowOverlap
              coordinate={[result.longitude!, result.latitude!]}
              id={`pin-${result.id}`}
              key={result.id}
            >
              <Pressable
                accessibilityHint="Selects this result in the list"
                accessibilityRole="button"
                onPress={() => {
                  find.select(result.id);
                }}
              >
                <MapPin
                  accessibilityLabel={`${result.title}. ${result.meta}`}
                  kind={result.pin}
                  label={result.price ?? undefined}
                  live={result.live}
                  selected={result.id === find.selectedId}
                  yours={result.yours}
                  zoom={brand ? zoom : Math.min(zoom, 13.4)}
                  {...(result.session
                    ? {
                        brandName: result.session.club.name,
                        markColor: result.session.club.color,
                      }
                    : {})}
                />
              </Pressable>
            </Mapbox.MarkerView>
          );
        })}
      </Mapbox.MapView>
      <View
        style={[
          styles.controls,
          { top: tokens.space["3"], right: tokens.space["3"] },
        ]}
      >
        <MapControls>
          <MapLocateButton
            denied={find.location === "denied"}
            onPress={() => {
              void find.locate().then((here) => {
                if (here) find.setCriteria({ ...find.criteria, where: here });
              });
            }}
            overSatellite={look === "satellite"}
          />
          <MapStyleToggle
            onToggle={() => {
              const next: MapStyle =
                look === "standard" ? "satellite" : "standard";
              setChosenLook(next);
              void AsyncStorage.setItem(LOOK_KEY, next).catch(() => undefined);
            }}
            overSatellite={look === "satellite"}
            style={look}
          />
        </MapControls>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  centre: { alignItems: "center", justifyContent: "center", gap: 4 },
  controls: { position: "absolute" },
});
