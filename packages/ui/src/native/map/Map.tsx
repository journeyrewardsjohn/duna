import {
  foregroundFor,
  monogramFor,
  type MapStyle,
  type PinKind,
} from "@duna/tideline-core";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Icon } from "../icons/Icon";
import { useHaptics } from "../motion/haptics";
import { useTheme } from "../theme/ThemeProvider";
import type { NativeColorRole } from "../tokens";
import { Numerals } from "../type/Numerals";
import { Text } from "../type/Text";
import { PIN_KIND_GLYPH, pinVisual } from "./pin";

/** Solar, for a pin where play is happening now: the only live colour on a map. */

export interface MapPinProps {
  readonly kind: PinKind;
  readonly zoom: number;
  /** The short name shown from the label zoom. */
  readonly label?: string;
  /** The club's name, for its mark and label at the brand zoom. */
  readonly brandName?: string;
  readonly markColor?: string;
  readonly selected?: boolean;
  /** Already opened: drawn quieter. */
  readonly visited?: boolean;
  /** The player's own: the inverted pin. */
  readonly yours?: boolean;
  /** Play in progress here: a Solar ring. */
  readonly live?: boolean;
  /** Pins this one stands for (a cluster at low zoom). */
  readonly clusterCount?: number;
  readonly accessibilityLabel: string;
  readonly testID?: string;
}

/**
 * A map pin drawn from `pinModel` (the app owns the map view and places
 * this as a marker). Zoom tiers: dot, category icon, icon and short label,
 * then the club's mark and name. "Yours" is inverted (action fill,
 * on-action glyph); a live pin carries a Solar ring, the only live colour on
 * the map; a selected pin gets the selected ring.
 */
export function MapPin({
  kind,
  zoom,
  label,
  brandName,
  markColor,
  selected = false,
  visited = false,
  yours = false,
  live = false,
  clusterCount,
  accessibilityLabel,
  testID,
}: MapPinProps) {
  const { colors, tokens } = useTheme();
  const visual = pinVisual({ kind, zoom, selected, yours, live, clusterCount });
  if (visual.tier === "hidden") return null;

  const fill = visual.inverted ? colors.action : colors.surface;
  const ink: NativeColorRole = visual.inverted ? "on-action" : "text";
  const edge = visual.inverted ? colors.action : colors["line-strong"];
  const d = visual.diameter;
  const ringWidth = 2.5;
  const name = visual.showClubMark ? (brandName ?? label) : label;

  let disc: ReactNode;
  if (visual.tier === "dot") {
    disc = (
      <View
        style={{
          width: d,
          height: d,
          borderRadius: d / 2,
          backgroundColor: visual.inverted
            ? colors.action
            : colors["club-core"],
          borderWidth: 2,
          borderColor: colors.surface,
        }}
      />
    );
  } else if (visual.tier === "club-mark") {
    const mark = markColor ?? colors["club-core"];
    disc = (
      <View
        style={[
          styles.center,
          {
            width: d,
            height: d,
            borderRadius: tokens.radius.md,
            backgroundColor: mark,
            borderWidth: 2,
            borderColor: visual.inverted ? colors.action : colors.surface,
          },
        ]}
      >
        <Text
          style={{ color: foregroundFor(mark).foreground }}
          variant="micro"
          weight={600}
        >
          {monogramFor(brandName ?? label ?? "").text ?? ""}
        </Text>
      </View>
    );
  } else if (visual.tier === "cluster") {
    disc = (
      <View
        style={[
          styles.center,
          {
            minWidth: d,
            height: d,
            paddingHorizontal: 6,
            borderRadius: d / 2,
            backgroundColor: fill,
            borderWidth: 1.5,
            borderColor: edge,
          },
        ]}
      >
        <Numerals family="ui" tone={ink} variant="phone-meta" weight={600}>
          {visual.clusterCount ?? 0}
        </Numerals>
      </View>
    );
  } else {
    disc = (
      <View
        style={[
          styles.center,
          {
            width: d,
            height: d,
            borderRadius: d / 2,
            backgroundColor: fill,
            borderWidth: 1.5,
            borderColor: edge,
          },
        ]}
      >
        {visual.showIcon ? (
          <Icon
            name={PIN_KIND_GLYPH[kind]}
            size={d >= 28 ? "inline" : "chip"}
            tone={ink}
          />
        ) : null}
      </View>
    );
  }

  const ring = (child: ReactNode, color: string | null, round: boolean) =>
    color ? (
      <View
        style={[
          styles.center,
          {
            padding: 2,
            borderWidth: ringWidth,
            borderColor: color,
            borderRadius: round ? 999 : tokens.radius.lg,
          },
        ]}
      >
        {child}
      </View>
    ) : (
      child
    );
  const round = visual.tier !== "club-mark";
  // Live is the inner ring; a selected live pin also gets the selected ring outside.
  const withLive = ring(
    disc,
    visual.ring === "live" ? colors["live"] : null,
    round,
  );
  const withSelected = ring(
    withLive,
    selected ? colors["selected-ring"] : null,
    round,
  );

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessible
      style={[styles.pin, { opacity: visited && !selected ? 0.7 : 1 }]}
      testID={testID}
    >
      {withSelected}
      {visual.showLabel && name ? (
        <View
          style={[
            styles.label,
            {
              backgroundColor: visual.inverted ? colors.action : colors.surface,
              borderRadius: tokens.radius.sm,
              borderColor: colors.line,
            },
          ]}
        >
          <Text
            numberOfLines={1}
            tone={ink}
            variant="phone-meta"
            weight={selected ? 600 : undefined}
          >
            {name}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export interface MapStyleToggleProps {
  readonly style: MapStyle;
  readonly onToggle: () => void;
  /** The button sits over satellite imagery: glass look. */
  readonly overSatellite?: boolean;
  readonly testID?: string;
}

/** The toggle's icon and name: it shows the look you would switch TO. Pure. */
export function mapStyleToggleView(style: MapStyle): {
  readonly glyph: "satellite" | "map";
  readonly label: string;
} {
  return style === "standard"
    ? { glyph: "satellite", label: "Show satellite" }
    : { glyph: "map", label: "Show map" };
}

/** One 44 pt map button with the shared look (surface, or glass over satellite). */
function MapButton({
  label,
  onPress,
  glass,
  dimmed,
  children,
  testID,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly glass?: boolean;
  readonly dimmed?: boolean;
  readonly children: ReactNode;
  readonly testID?: string;
}) {
  const { colors, tokens } = useTheme();
  const haptics = useHaptics();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      style={({ pressed }) => [
        styles.button,
        {
          borderRadius: tokens.radius.lg,
          backgroundColor: glass ? colors["glass-fill"] : colors.surface,
          borderColor: glass ? colors["glass-edge"] : colors.line,
          opacity: pressed ? 0.75 : dimmed ? 0.6 : 1,
        },
      ]}
      testID={testID}
    >
      {children}
    </Pressable>
  );
}

/** Standard ⇄ satellite: one 44 pt icon button showing the look it switches to. */
export function MapStyleToggle({
  style,
  onToggle,
  overSatellite = false,
  testID,
}: MapStyleToggleProps) {
  const { colors } = useTheme();
  const view = mapStyleToggleView(style);
  return (
    <MapButton
      glass={overSatellite}
      label={view.label}
      onPress={onToggle}
      testID={testID}
    >
      <Icon
        color={overSatellite ? colors["on-mesh"] : undefined}
        name={view.glyph}
        size="control"
      />
    </MapButton>
  );
}

/** A vertical stack for the map's 44 pt controls. */
export function MapControls({ children }: { readonly children?: ReactNode }) {
  const { tokens } = useTheme();
  return (
    <View style={[styles.controls, { gap: tokens.space["2"] }]}>
      {children}
    </View>
  );
}

export const MAP_LOCATE_LABEL = "Show my location";

/** Centres the map on the player. Dimmed when location is off (the press still asks). */
export function MapLocateButton({
  onPress,
  denied = false,
  overSatellite = false,
  testID,
}: {
  readonly onPress: () => void;
  readonly denied?: boolean;
  readonly overSatellite?: boolean;
  readonly testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <MapButton
      dimmed={denied}
      glass={overSatellite}
      label={MAP_LOCATE_LABEL}
      onPress={onPress}
      testID={testID}
    >
      <Icon
        color={overSatellite ? colors["on-mesh"] : undefined}
        name="locate"
        size="control"
        tone={denied ? "text-3" : "text"}
      />
    </MapButton>
  );
}

const styles = StyleSheet.create({
  pin: { alignItems: "center", gap: 2 },
  center: { alignItems: "center", justifyContent: "center" },
  label: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 160,
  },
  button: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  controls: { alignItems: "center" },
});
