/**
 * The stack (spec §3, seven cards or more, or by choice): every card shows a
 * strip (36 % of its height) and the last shows in full. Tap a strip or
 * drag it up 30 pt to draw it out: it Rises to the top (480 ms) and the
 * others tuck into a pile beneath it (11 pt edges, at most five). Tap the
 * drawn card to turn it over; drag it down 60 pt, tap the pile or "Back to
 * stack" to return. Positions come from the shared `stackLayout`; moves are
 * `Animated.timing` on the native driver (nothing springs). The drag itself
 * follows the finger on one view at a time.
 */
import {
  Animated,
  Easing,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { stackLayout, type StackSlot } from "@duna/tideline-core";
import { useEffect, useMemo, useRef } from "react";
import { useHaptics, useReducedMotion } from "../motion";
import { runWithWatchdog, settleValues } from "../motion/watchdog";
import { nativeTokens } from "../tokens";
import { Text } from "../type";
import { MembershipCard } from "./MembershipCard";
import { cardGeometry, cardLabel, type NativeWalletCard } from "./model";

export const DRAW_MS = 480;
const RISE = Easing.bezier(0.2, 0.8, 0.2, 1);
const SALT = nativeTokens.brand.salt;

export interface WalletStackProps {
  readonly cards: readonly NativeWalletCard[];
  readonly value: string;
  readonly onChange: (id: string) => void;
  /** A card is drawn out (controlled). */
  readonly drawn: boolean;
  readonly onDrawnChange: (drawn: boolean) => void;
  readonly flipped: boolean;
  readonly onFlip: (flipped: boolean) => void;
  readonly onLongPress?: (id: string) => void;
  readonly width: number;
  readonly label: string;
}

function StackCard({
  card,
  index,
  count,
  slot,
  width,
  drawnHere,
  anyDrawn,
  flipped,
  onTap,
  onDraw,
  onReturn,
  onLongPress,
}: {
  readonly card: NativeWalletCard;
  readonly index: number;
  readonly count: number;
  readonly slot: StackSlot;
  readonly width: number;
  readonly drawnHere: boolean;
  readonly anyDrawn: boolean;
  readonly flipped: boolean;
  readonly onTap: () => void;
  readonly onDraw: () => void;
  readonly onReturn: () => void;
  readonly onLongPress?: () => void;
}) {
  const reduced = useReducedMotion();
  const y = useRef(new Animated.Value(slot.y)).current;
  const scale = useRef(new Animated.Value(slot.scale)).current;
  const drag = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.parallel([
      Animated.timing(y, {
        toValue: slot.y,
        duration: reduced ? 0 : DRAW_MS,
        easing: RISE,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: slot.scale,
        duration: reduced ? 0 : DRAW_MS,
        easing: RISE,
        useNativeDriver: true,
      }),
    ]);
    return runWithWatchdog(animation, {
      timeline: reduced ? 0 : DRAW_MS,
      settle: settleValues([
        [y, slot.y],
        [scale, slot.scale],
      ]),
    });
  }, [reduced, scale, slot.scale, slot.y, y]);

  // The latest handlers, so the responder (made once) never goes stale.
  const latest = useRef({ drawnHere, anyDrawn, onDraw, onReturn });
  latest.current = { drawnHere, anyDrawn, onDraw, onReturn };
  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dy) > 6 &&
          Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderMove: (_event, gesture) => {
          const { drawnHere: drawnNow, anyDrawn: pile } = latest.current;
          // Drawn: it follows a pull down. At rest: a strip follows a pull up.
          if (drawnNow) drag.setValue(Math.max(0, gesture.dy));
          else if (!pile) drag.setValue(Math.min(0, gesture.dy));
        },
        onPanResponderRelease: (_event, gesture) => {
          const now = latest.current;
          if (now.drawnHere && gesture.dy > 60) now.onReturn();
          else if (!now.anyDrawn && gesture.dy < -30) now.onDraw();
          runWithWatchdog(
            Animated.timing(drag, {
              toValue: 0,
              duration: 200,
              easing: RISE,
              useNativeDriver: true,
            }),
            { timeline: 200, settle: settleValues([[drag, 0]]) },
          );
        },
        onPanResponderTerminate: () => drag.setValue(0),
      }),
    [drag],
  );

  const inPile = anyDrawn && !drawnHere;
  return (
    <Animated.View
      {...responder.panHandlers}
      style={[
        styles.slot,
        {
          zIndex: slot.z,
          transform: [{ translateY: Animated.add(y, drag) }, { scale }],
        },
      ]}
    >
      <MembershipCard
        accessibilityHint={
          drawnHere
            ? flipped
              ? "Turns back to the card"
              : "Turns over to show your pass"
            : "Draws this card out of the stack"
        }
        accessibilityLabel={`${cardLabel(card)}. Card ${index + 1} of ${count}`}
        animate={drawnHere}
        card={card}
        decorative={inPile}
        flipped={drawnHere && flipped}
        onLongPress={drawnHere ? onLongPress : undefined}
        onPress={onTap}
        shadow={drawnHere || index === count - 1}
        testID={`stack-card-${index}`}
        width={width}
      />
    </Animated.View>
  );
}

export function WalletStack({
  cards,
  value,
  onChange,
  drawn,
  onDrawnChange,
  flipped,
  onFlip,
  onLongPress,
  width,
  label,
}: WalletStackProps) {
  const haptics = useHaptics();
  const card = cardGeometry(width);
  const selected = Math.max(
    0,
    cards.findIndex((item) => item.id === value),
  );
  const layout = stackLayout({
    count: cards.length,
    cardHeight: card.height,
    drawn: drawn ? selected : null,
  });
  const draw = (index: number) => {
    haptics.confirmed(1);
    onChange(cards[index]!.id);
    onDrawnChange(true);
  };
  const restack = () => {
    haptics.selection();
    if (flipped) onFlip(false);
    onDrawnChange(false);
  };
  return (
    <View accessibilityLabel={label} testID="wallet-stack">
      <View
        style={{
          height: layout.height,
          width: card.width,
          alignSelf: "center",
        }}
      >
        {cards.map((item, index) => (
          <StackCard
            anyDrawn={drawn}
            card={item}
            count={cards.length}
            drawnHere={drawn && index === selected}
            flipped={flipped}
            index={index}
            key={item.id}
            onDraw={() => draw(index)}
            onLongPress={onLongPress ? () => onLongPress(item.id) : undefined}
            onReturn={restack}
            onTap={() => {
              if (!drawn) draw(index);
              else if (index === selected) onFlip(!flipped);
              else restack();
            }}
            slot={layout.slots[index]!}
            width={card.width}
          />
        ))}
      </View>
      <View style={styles.footer}>
        <Text family="mono" style={styles.caption} variant="phone-meta">
          {drawn
            ? flipped
              ? "Tap again for the card"
              : "Tap the card for your pass"
            : `${cards.length} cards · draw one out`}
        </Text>
        {drawn ? (
          <Pressable
            accessibilityRole="button"
            hitSlop={10}
            onPress={restack}
            style={styles.back}
            testID="stack-back"
          >
            <Text style={styles.backText} variant="phone-meta" weight={600}>
              Back to stack
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  slot: { position: "absolute", top: 0, left: 0 },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 12,
    paddingTop: 14,
  },
  caption: { color: SALT, opacity: 0.82 },
  back: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(244,242,236,0.32)",
  },
  backText: { color: SALT },
});
