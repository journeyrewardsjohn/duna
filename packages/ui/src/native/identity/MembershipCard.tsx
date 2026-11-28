/**
 * A club's membership card on native (docs/design/wallet.md §1): an ID-1
 * object with full-bleed club art, a measured local scrim so the type keeps
 * 5:1 on any art, a keyline and a glass edge; the club mark and name top
 * left, one chip top right (the plan, or the solid Salt state chip), the
 * member bottom left and one live fact bottom right. The art keeps full
 * colour in every state (R13). The face is fixed-size artwork (Dynamic Type
 * enlarges the pass, never the face); the back is the pass.
 */
import { Pressable, StyleSheet, Text as NativeText, View } from "react-native";
import Svg, {
  Defs,
  LinearGradient,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";
import type { ReactNode } from "react";
import { Icon } from "../icons";
import { nativeTokens } from "../tokens";
import { fontFace } from "../type";
import { CardArt } from "./CardArt";
import { CardClubMark } from "./ClubMark";
import { CardFlip } from "./CardFlip";
import { MembershipPass } from "./MembershipPass";
import { STACK_STRIP_RATIO } from "@duna/tideline-core";
import {
  CHIP_BACKING,
  alphaHex,
  cardContrast,
  cardFaceParts,
  cardLabel,
  geometryForWidth,
  stateIconName,
  type CardSize,
  type NativeWalletCard,
} from "./model";

const SALT = nativeTokens.brand.salt;
const NIGHT = nativeTokens.brand["night-court"];

/** A face size scaled from the 372 pt card, never under the 12 pt floor. */
const faceSize = (base: number, width: number) =>
  Math.max(12, Math.round(base * (width / 372) * 2) / 2);

export interface MembershipCardProps {
  readonly card: NativeWalletCard;
  readonly width: number;
  /** `card` (default) or `strip` (the top 36 %, for lists). */
  readonly size?: CardSize;
  readonly flipped?: boolean;
  /** The selected card: its art may move. */
  readonly animate?: boolean;
  /** Makes the card a button (tap turns it over). */
  readonly onPress?: () => void;
  /** The quick actions (Show pass, Book). */
  readonly onLongPress?: () => void;
  /** Overrides the spoken name (a carousel slot says its position). */
  readonly accessibilityLabel?: string;
  readonly accessibilityHint?: string;
  /** Hidden from VoiceOver (the carousel speaks for its cards). */
  readonly decorative?: boolean;
  /** Draws the three-layer shadow (off in dense stacks). */
  readonly shadow?: boolean;
  readonly testID?: string;
}

function Chip({
  children,
  tone,
  ink,
  scrim,
  width,
}: {
  readonly children: ReactNode;
  readonly tone: "glass" | "salt" | "fact";
  readonly ink: string;
  readonly scrim: string;
  readonly width: number;
}) {
  const solid = tone === "salt";
  const backing = alphaHex(scrim, CHIP_BACKING);
  return (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: solid ? SALT : backing,
          borderColor: solid ? "transparent" : "rgba(255,255,255,0.3)",
          paddingHorizontal: Math.round(width * 0.024),
        },
      ]}
    >
      {typeof children === "string" ? (
        <NativeText
          allowFontScaling={false}
          numberOfLines={1}
          style={{
            color: solid ? NIGHT : ink,
            fontFamily:
              tone === "fact"
                ? fontFace("mono", 500)
                : fontFace("ui", solid ? 600 : 500),
            fontSize: 12,
            lineHeight: 16,
            fontVariant: tone === "fact" ? ["tabular-nums"] : undefined,
          }}
        >
          {children}
        </NativeText>
      ) : (
        children
      )}
    </View>
  );
}

/** The scrim, the glass edge and the keyline over the art. */
function Finish({
  id,
  width,
  height,
  radius,
  scrim,
  top,
  bottom,
}: {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly radius: number;
  readonly scrim: string;
  readonly top: number;
  readonly bottom: number;
}) {
  const key = id.replace(/[^a-zA-Z0-9-]/g, "");
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg height={height} width={width}>
        <Defs>
          {/* Local scrim: strong only where the text sits, zero by ~64 %. */}
          <RadialGradient
            cx={0}
            cy={0}
            fx={0}
            fy={0}
            gradientUnits="userSpaceOnUse"
            id={`${key}-st`}
            rx={width * 0.7}
            ry={height * 0.62}
          >
            <Stop offset={0} stopColor={scrim} stopOpacity={top} />
            <Stop offset={0.45} stopColor={scrim} stopOpacity={top * 0.82} />
            <Stop offset={1} stopColor={scrim} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient
            cx={0}
            cy={height}
            fx={0}
            fy={height}
            gradientUnits="userSpaceOnUse"
            id={`${key}-sb`}
            rx={width * 0.68}
            ry={height * 0.7}
          >
            <Stop offset={0} stopColor={scrim} stopOpacity={bottom} />
            <Stop offset={0.5} stopColor={scrim} stopOpacity={bottom * 0.8} />
            <Stop offset={1} stopColor={scrim} stopOpacity={0} />
          </RadialGradient>
          {/* Glass: a top highlight and a bottom shade. */}
          <LinearGradient id={`${key}-glass`} x1={0} x2={0} y1={0} y2={1}>
            <Stop offset={0} stopColor="#ffffff" stopOpacity={0.24} />
            <Stop offset={0.1} stopColor="#ffffff" stopOpacity={0} />
            <Stop offset={0.86} stopColor="#000000" stopOpacity={0} />
            <Stop offset={1} stopColor="#000000" stopOpacity={0.22} />
          </LinearGradient>
        </Defs>
        <Rect fill={`url(#${key}-st)`} height={height} width={width} />
        <Rect fill={`url(#${key}-sb)`} height={height} width={width} />
        <Rect fill={`url(#${key}-glass)`} height={height} width={width} />
      </Svg>
      <View
        style={[StyleSheet.absoluteFill, styles.rim, { borderRadius: radius }]}
      />
      <View
        style={[
          styles.keyline,
          {
            top: 7,
            left: 7,
            right: 7,
            bottom: 7,
            borderRadius: Math.max(4, radius - 6),
          },
        ]}
      />
    </View>
  );
}

/** The front of the card. */
export function CardFace({
  card,
  width,
  animate,
  strip,
}: {
  readonly card: NativeWalletCard;
  readonly width: number;
  readonly animate?: boolean;
  readonly strip?: boolean;
}) {
  const geometry = geometryForWidth(width);
  const contrast = cardContrast(card);
  const parts = cardFaceParts(card);
  const ink = contrast.text === "salt" ? SALT : NIGHT;
  const shadowText = {
    textShadowColor: alphaHex(contrast.scrim, 0.3),
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 1 },
  };
  const height = strip
    ? Math.round(geometry.height * STACK_STRIP_RATIO)
    : geometry.height;
  return (
    <View
      style={[styles.face, { width, height, borderRadius: geometry.radius }]}
    >
      <View style={{ width, height: geometry.height }}>
        <CardArt
          animate={animate && !strip}
          art={card.art}
          height={geometry.height}
          id={card.id}
          width={width}
        />
        <Finish
          bottom={contrast.bottom}
          height={geometry.height}
          id={card.id}
          radius={geometry.radius}
          scrim={contrast.scrim}
          top={contrast.top}
          width={width}
        />
        <View
          style={[
            styles.top,
            {
              paddingTop: geometry.padY,
              paddingHorizontal: geometry.padX,
            },
          ]}
        >
          <CardClubMark club={card.club} size={strip ? 26 : 30} />
          <NativeText
            allowFontScaling={false}
            numberOfLines={2}
            style={[
              styles.flex,
              shadowText,
              {
                color: ink,
                fontFamily: fontFace("ui", 600),
                fontSize: faceSize(13.5, width),
                lineHeight: Math.round(faceSize(13.5, width) * 1.25),
              },
            ]}
          >
            {card.club.name}
          </NativeText>
          {parts.corner?.kind === "state" ? (
            <Chip ink={ink} scrim={contrast.scrim} tone="salt" width={width}>
              <View style={styles.stateRow}>
                <Icon
                  color={NIGHT}
                  name={stateIconName(parts.corner.icon)}
                  size="chip"
                />
                <NativeText
                  allowFontScaling={false}
                  numberOfLines={1}
                  style={{
                    color: NIGHT,
                    fontFamily: fontFace("ui", 600),
                    fontSize: 12,
                    lineHeight: 16,
                  }}
                >
                  {parts.corner.text}
                </NativeText>
              </View>
            </Chip>
          ) : parts.corner ? (
            <Chip ink={ink} scrim={contrast.scrim} tone="glass" width={width}>
              {parts.corner.text}
            </Chip>
          ) : null}
        </View>
        {strip ? null : (
          <View
            style={[
              styles.bottom,
              {
                paddingBottom: geometry.padY,
                paddingHorizontal: geometry.padX,
              },
            ]}
          >
            <View style={styles.flex}>
              <NativeText
                allowFontScaling={false}
                numberOfLines={2}
                style={[
                  shadowText,
                  {
                    color: ink,
                    fontFamily: fontFace("ui", 600),
                    fontSize: faceSize(20, width),
                    lineHeight: Math.round(faceSize(20, width) * 1.2),
                  },
                ]}
              >
                {card.member}
              </NativeText>
              {parts.held ? (
                <NativeText
                  allowFontScaling={false}
                  numberOfLines={1}
                  style={[
                    shadowText,
                    {
                      color: ink,
                      fontFamily: fontFace("ui", 500),
                      fontSize: 12,
                      lineHeight: 16,
                    },
                  ]}
                >
                  {parts.held}
                </NativeText>
              ) : null}
              {parts.meta ? (
                <NativeText
                  allowFontScaling={false}
                  numberOfLines={1}
                  style={[
                    shadowText,
                    {
                      color: ink,
                      fontFamily: fontFace("mono", 400),
                      fontSize: 12,
                      lineHeight: 16,
                      fontVariant: ["tabular-nums"],
                    },
                  ]}
                >
                  {parts.meta}
                </NativeText>
              ) : null}
            </View>
            {parts.fact ? (
              <Chip ink={ink} scrim={contrast.scrim} tone="fact" width={width}>
                {parts.fact.text}
              </Chip>
            ) : null}
          </View>
        )}
      </View>
    </View>
  );
}

/**
 * The card, front and back. Tap turns it over (when `onPress` is given);
 * long press offers the quick actions.
 */
export function MembershipCard({
  card,
  width,
  size = "card",
  flipped = false,
  animate,
  onPress,
  onLongPress,
  accessibilityLabel,
  accessibilityHint,
  decorative,
  shadow = true,
  testID,
}: MembershipCardProps) {
  const geometry = geometryForWidth(width);
  const contrast = cardContrast(card);
  const strip = size === "strip";
  const label = accessibilityLabel ?? cardLabel(card);
  const body = strip ? (
    <CardFace card={card} strip width={width} />
  ) : (
    <CardFlip
      back={
        <MembershipPass
          card={card}
          minHeight={geometry.height}
          radius={geometry.radius}
          width={width}
        />
      }
      flipped={flipped}
      front={
        <CardFace animate={animate && !flipped} card={card} width={width} />
      }
      height={geometry.height}
    />
  );
  const frame = [
    { width, borderRadius: geometry.radius },
    shadow
      ? {
          boxShadow: [
            {
              offsetX: 0,
              offsetY: 1,
              blurRadius: 2,
              color: "rgba(0,0,0,0.35)",
            },
            {
              offsetX: 0,
              offsetY: 10,
              blurRadius: 22,
              spreadDistance: -6,
              color: alphaHex(NIGHT, 0.5),
            },
            {
              offsetX: 0,
              offsetY: 30,
              blurRadius: 60,
              spreadDistance: -20,
              color: alphaHex(contrast.glow, 0.85),
            },
          ],
        }
      : null,
  ];
  if (decorative) {
    return (
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={frame}
        testID={testID}
      >
        {body}
      </View>
    );
  }
  if (!onPress && !onLongPress) {
    return (
      <View
        accessibilityLabel={label}
        accessibilityRole="image"
        accessible
        style={frame}
        testID={testID}
      >
        {body}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityActions={
        onLongPress
          ? [{ name: "longpress", label: "Quick actions" }]
          : undefined
      }
      accessibilityHint={
        accessibilityHint ??
        (flipped ? "Turns back to the card" : "Turns over to show your pass")
      }
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ expanded: flipped }}
      delayLongPress={420}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === "longpress") onLongPress?.();
      }}
      onLongPress={onLongPress}
      onPress={onPress}
      style={({ pressed }) => [
        frame,
        pressed && !flipped ? { transform: [{ scale: 0.99 }] } : null,
      ]}
      testID={testID}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  face: { overflow: "hidden" },
  flex: { flex: 1, flexShrink: 1 },
  top: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  bottom: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
  },
  chip: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 4,
    flexShrink: 0,
    maxWidth: "55%",
  },
  stateRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  rim: { borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  keyline: {
    position: "absolute",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
});
