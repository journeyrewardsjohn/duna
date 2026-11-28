/**
 * The small map on the confirmed screen (M-P3), as the design system draws
 * maps: the street style at this zoom, the venue's Duna pin "yours"
 * (inverted, it is your booking), attribution always visible. It does not
 * pan; a tap opens Directions. No map token: nothing is drawn and the
 * address and Directions still work (the honest "not set up" state lives in
 * Find).
 */
import { Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "@duna/ui/native";
import { MapPin, mapStyleForZoom } from "@duna/ui/native/map";
import Mapbox from "@rnmapbox/maps";
import { useMapboxTokenState } from "../../find/mapbox-token";

const ZOOM = 15;
const STYLE_URL = {
  standard: "mapbox://styles/mapbox/standard",
  satellite: "mapbox://styles/mapbox/satellite-streets-v12",
} as const;

export function VenueMap({
  name,
  latitude,
  longitude,
  onPress,
}: {
  readonly name: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly onPress?: () => void;
}) {
  const { colors, tokens } = useTheme();
  const map = useMapboxTokenState();
  if (map.state !== "ready") return null;
  return (
    <Pressable
      accessibilityHint="Opens directions in your maps app"
      accessibilityLabel={`Map of ${name}`}
      accessibilityRole="button"
      disabled={!onPress}
      onPress={onPress}
      style={[
        styles.frame,
        {
          borderRadius: tokens.radius.xl,
          borderColor: colors.line,
        },
      ]}
      testID="venue-map"
    >
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Mapbox.MapView
          attributionPosition={{ bottom: 6, left: 6 }}
          logoPosition={{ bottom: 6, left: 86 }}
          pitchEnabled={false}
          rotateEnabled={false}
          scaleBarEnabled={false}
          scrollEnabled={false}
          style={StyleSheet.absoluteFill}
          styleURL={STYLE_URL[mapStyleForZoom(ZOOM)]}
          zoomEnabled={false}
        >
          <Mapbox.Camera
            animationDuration={0}
            centerCoordinate={[longitude, latitude]}
            zoomLevel={ZOOM}
          />
          <Mapbox.MarkerView
            allowOverlap
            coordinate={[longitude, latitude]}
            id="venue"
          >
            <MapPin accessibilityLabel={name} kind="court" yours zoom={ZOOM} />
          </Mapbox.MarkerView>
        </Mapbox.MapView>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  frame: {
    height: 160,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
});
