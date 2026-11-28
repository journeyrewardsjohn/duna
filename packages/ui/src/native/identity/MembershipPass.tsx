/**
 * The back of a card: the check-in pass (spec §4). Text first (member,
 * status in words with an icon, plan, number or reference, valid-to,
 * guardian), the code drawn from exactly what the server sent through the
 * shared encoder (`encodeQr`). Pending, ended and passless cards say why,
 * with no code. Every line wraps; nothing on the pass truncates, and the
 * pass grows with Dynamic Type (the code moves above the text when large).
 */
import { StyleSheet, View, useWindowDimensions } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import {
  clubMarkModel,
  encodeQr,
  passSecondsLeft,
  qrPath,
} from "@duna/tideline-core";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "../icons";
import { nativeTokens } from "../tokens";
import { Text } from "../type";
import { CardClubMark } from "./ClubMark";
import { passText, type NativeWalletCard } from "./model";

const NIGHT = nativeTokens.brand["night-court"];
/** The pass is a scanning surface: one light ground in every theme. */
const PASS_GROUND = nativeTokens.color.light.surface;

/** A QR Code drawn as one path from the exact payload (no dependency). */
export function QrCode({
  value,
  label,
  size,
}: {
  readonly value: string;
  /** "Check-in code for Noa Williams". */
  readonly label: string;
  readonly size: number;
}) {
  const drawn = useMemo(() => {
    try {
      const matrix = encodeQr(value, "M");
      return { modules: matrix.size + 8, path: qrPath(matrix) };
    } catch {
      return null;
    }
  }, [value]);
  if (!drawn) return null;
  return (
    <View
      accessibilityLabel={label}
      accessibilityRole="image"
      accessible
      style={{ width: size, height: size }}
    >
      <Svg
        height={size}
        viewBox={`0 0 ${drawn.modules} ${drawn.modules}`}
        width={size}
      >
        <Rect fill={PASS_GROUND} height={drawn.modules} width={drawn.modules} />
        <Path d={drawn.path} fill={NIGHT} />
      </Svg>
    </View>
  );
}

function useCountdown(refreshesAt: string | undefined): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!refreshesAt) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [refreshesAt]);
  return refreshesAt && now !== null ? passSecondsLeft(refreshesAt, now) : null;
}

export interface MembershipPassProps {
  readonly card: NativeWalletCard;
  /** The card's width; the pass is at least the card's height. */
  readonly width: number;
  readonly minHeight: number;
  readonly radius: number;
}

export function MembershipPass({
  card,
  width,
  minHeight,
  radius,
}: MembershipPassProps) {
  const { fontScale } = useWindowDimensions();
  const text = passText(card);
  const brand = clubMarkModel({ ...card.club, size: 24 });
  const seconds = useCountdown(
    text.back.kind === "code" ? text.back.refreshesAt : undefined,
  );
  // Large text: the code sits above the words so neither is squeezed.
  const tall = fontScale > 1.35;
  const qr = Math.round(tall ? Math.min(width * 0.62, 240) : minHeight * 0.6);
  const ink = { color: NIGHT };
  return (
    <View
      style={[
        styles.pass,
        {
          width,
          minHeight,
          borderRadius: radius,
          backgroundColor: PASS_GROUND,
        },
      ]}
      testID="membership-pass"
    >
      <View
        style={[
          styles.band,
          tall ? styles.bandTall : null,
          {
            backgroundColor: brand.background,
            borderTopLeftRadius: radius,
            borderTopRightRadius: radius,
          },
        ]}
      >
        <CardClubMark club={card.club} size={24} />
        <Text
          maxFontSizeMultiplier={2}
          style={[tall ? null : styles.club, { color: brand.foreground }]}
          variant="phone-meta"
          weight={600}
        >
          {card.club.name}
        </Text>
        <Text
          family="mono"
          maxFontSizeMultiplier={1.4}
          style={{ color: brand.foreground }}
          variant="micro"
        >
          CHECK-IN PASS
        </Text>
      </View>
      {text.back.kind === "code" ? (
        <View style={[styles.body, tall ? styles.bodyTall : null]}>
          <QrCode label={text.codeLabel} size={qr} value={text.back.code} />
          <View style={[styles.info, tall ? null : styles.flex]}>
            <Text selectable style={ink} variant="phone-body" weight={600}>
              {card.member}
            </Text>
            <View style={styles.status}>
              <Icon
                color={NIGHT}
                name={text.back.statusIcon === "pause" ? "timeout" : "check"}
                size="chip"
              />
              <Text
                style={[styles.flex, ink]}
                variant="phone-meta"
                weight={600}
              >
                {text.back.statusLine}
              </Text>
            </View>
            {text.lines.map((line) => (
              <Text
                key={line}
                selectable
                style={ink}
                tabular
                variant="phone-meta"
              >
                {line}
              </Text>
            ))}
            {text.note ? (
              <Text style={styles.note} variant="micro">
                {text.back.rotation === "rotating" && seconds !== null
                  ? `New code in 0:${String(seconds).padStart(2, "0")}`
                  : text.note}
              </Text>
            ) : null}
          </View>
        </View>
      ) : (
        <View style={styles.none}>
          <Text style={ink} variant="phone-heading">
            {text.back.title}
          </Text>
          <Text style={ink} variant="phone-meta">
            {text.back.text}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pass: { overflow: "hidden" },
  band: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  flex: { flex: 1, flexShrink: 1 },
  bandTall: { flexDirection: "column", alignItems: "flex-start" },
  club: { flexGrow: 1, flexShrink: 1, flexBasis: "55%" },
  body: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    padding: 14,
  },
  bodyTall: { flexDirection: "column", alignItems: "center" },
  info: { gap: 4, alignSelf: "stretch" },
  status: { flexDirection: "row", alignItems: "center", gap: 6 },
  note: { color: NIGHT, opacity: 0.78, marginTop: 2 },
  none: { padding: 18, gap: 8 },
});
