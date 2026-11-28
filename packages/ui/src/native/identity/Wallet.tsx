/**
 * The wallet on native (spec §3): the dark band (title, notice, the cards as
 * a carousel or a stack, the caption, the four actions) over or beside the
 * selected club's sheet. The shared rule picks the presentation
 * (`walletPresentation`: carousel up to six, stack from seven); from three
 * cards the person can switch, and the app remembers the choice. Turning a
 * card over is announced to VoiceOver.
 */
import { AccessibilityInfo, Pressable, StyleSheet, View } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import {
  walletPresentation,
  type WalletPresentation,
} from "@duna/tideline-core";
import { useState, type ReactNode } from "react";
import { Icon } from "../icons";
import { useHaptics } from "../motion";
import { nativeTokens } from "../tokens";
import { Text } from "../type";
import { flipAnnouncement, type NativeWalletCard } from "./model";
import { WalletCarousel } from "./WalletCarousel";
import { WalletStack } from "./WalletStack";

const NIGHT = nativeTokens.brand["night-court"];
const SALT = nativeTokens.brand.salt;
const DUNE = nativeTokens.brand.dune;
const HARDWOOD = nativeTokens.brand.hardwood;

/** The band's faint texture: two low glows of Dune and Hardwood on Night Court. */
function BandTexture({
  width,
  height,
}: {
  readonly width: number;
  readonly height: number;
}) {
  if (width <= 0 || height <= 0) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg height={height} width={width}>
        <Defs>
          <RadialGradient
            cx={width * 0.85}
            cy={0}
            gradientUnits="userSpaceOnUse"
            id="band-dune"
            rx={width * 0.8}
            ry={height * 0.55}
          >
            <Stop offset={0} stopColor={DUNE} stopOpacity={0.16} />
            <Stop offset={1} stopColor={DUNE} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient
            cx={0}
            cy={height}
            gradientUnits="userSpaceOnUse"
            id="band-hardwood"
            rx={width * 0.7}
            ry={height * 0.5}
          >
            <Stop offset={0} stopColor={HARDWOOD} stopOpacity={0.12} />
            <Stop offset={1} stopColor={HARDWOOD} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect fill="url(#band-dune)" height={height} width={width} />
        <Rect fill="url(#band-hardwood)" height={height} width={width} />
      </Svg>
    </View>
  );
}

export interface WalletBandProps {
  readonly cards: readonly NativeWalletCard[];
  readonly value: string | undefined;
  readonly onChange: (id: string) => void;
  readonly flipped: boolean;
  readonly onFlip: (flipped: boolean) => void;
  /** The width the band has (its pane, or its half of a split). */
  readonly width: number;
  /** The screen's one Jost title, and anything beside it. */
  readonly title?: ReactNode;
  readonly toolbar?: ReactNode;
  readonly notice?: ReactNode;
  /** The four actions; omitted when they sit elsewhere (tabletop). */
  readonly actions?: ReactNode;
  /** No cards: what a card is and where to find a club. */
  readonly empty?: ReactNode;
  /** The person's saved choice; `auto` follows the shared rule. */
  readonly presentation?: "auto" | WalletPresentation;
  readonly onPresentationChange?: (presentation: WalletPresentation) => void;
  readonly onLongPress?: (id: string) => void;
  /** "Your club cards". */
  readonly label?: string;
  readonly paddingTop?: number;
  /** False hides the title row and the notice (the Duo's top pane). */
  readonly chrome?: boolean;
}

export function WalletBand({
  cards,
  value,
  onChange,
  flipped,
  onFlip,
  width,
  title,
  toolbar,
  notice,
  actions,
  empty,
  presentation: preference = "auto",
  onPresentationChange,
  onLongPress,
  label = "Your club cards",
  paddingTop = 0,
  chrome = true,
}: WalletBandProps) {
  const haptics = useHaptics();
  const [drawn, setDrawn] = useState(false);
  const [height, setHeight] = useState(0);
  const { presentation, canSwitch } = walletPresentation(
    cards.length,
    preference,
  );
  const selected = cards.find((card) => card.id === value) ?? cards[0];
  const flip = (next: boolean) => {
    if (!selected) return;
    if (next) haptics.confirmed(1);
    else haptics.selection();
    onFlip(next);
    AccessibilityInfo.announceForAccessibility(
      flipAnnouncement(selected, next),
    );
  };
  const choose = (id: string) => {
    if (id === selected?.id) return;
    if (flipped) onFlip(false);
    onChange(id);
  };
  const switchTo = (next: WalletPresentation) => {
    haptics.selection();
    if (flipped) onFlip(false);
    setDrawn(false);
    onPresentationChange?.(next);
  };
  return (
    <View
      onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
      style={[styles.band, { paddingTop: paddingTop + 12 }]}
      testID="wallet-band"
    >
      <BandTexture height={height} width={width} />
      {chrome && (title || toolbar || canSwitch) ? (
        <View style={styles.bar}>
          <View style={styles.title}>{title}</View>
          {canSwitch ? (
            <Pressable
              accessibilityLabel={
                presentation === "stack"
                  ? "Show the cards side by side"
                  : "Stack the cards"
              }
              accessibilityRole="button"
              hitSlop={4}
              onPress={() =>
                switchTo(presentation === "stack" ? "carousel" : "stack")
              }
              style={styles.icon}
              testID="wallet-switch"
            >
              <Icon
                color={SALT}
                name={presentation === "stack" ? "member-card" : "layout"}
                size="control"
              />
            </Pressable>
          ) : null}
          {toolbar}
        </View>
      ) : null}
      {chrome && notice ? <View style={styles.notice}>{notice}</View> : null}
      {cards.length === 0 || !selected ? (
        <View style={styles.empty}>{empty}</View>
      ) : presentation === "carousel" ? (
        <>
          <WalletCarousel
            cards={cards}
            flipped={flipped}
            label={label}
            onChange={choose}
            onFlip={flip}
            onLongPress={onLongPress}
            value={selected.id}
            width={width}
          />
          <Text
            family="mono"
            style={styles.caption}
            testID="wallet-caption"
            variant="phone-meta"
          >
            {flipped
              ? "Tap again for the card"
              : "Tap the card to show your pass"}
          </Text>
        </>
      ) : (
        <WalletStack
          cards={cards}
          drawn={drawn}
          flipped={flipped}
          label={`${label}, stacked`}
          onChange={choose}
          onDrawnChange={setDrawn}
          onFlip={flip}
          onLongPress={onLongPress}
          value={selected.id}
          width={width}
        />
      )}
      {actions && cards.length > 0 ? (
        <View style={styles.actions}>{actions}</View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    backgroundColor: NIGHT,
    paddingBottom: 20,
    gap: 14,
    overflow: "hidden",
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    minHeight: 44,
  },
  title: { flex: 1 },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(244,242,236,0.1)",
  },
  notice: { paddingHorizontal: 20 },
  empty: { paddingHorizontal: 20, gap: 16 },
  caption: { color: SALT, opacity: 0.82, textAlign: "center" },
  actions: { paddingHorizontal: 16, paddingTop: 4 },
});
