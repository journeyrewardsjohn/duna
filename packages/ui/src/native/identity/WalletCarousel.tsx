/**
 * The carousel (spec §3): one card centred, neighbours peeking about 14 pt
 * and scaled to 94 % from their inner edge, snapping per card with the
 * platform's own scroll physics (`snapToInterval`, fast deceleration, one
 * card per swipe; no custom spring). A selection haptic when it settles on
 * a new card; page dots under it. Only the selected card's art moves, and
 * not while a swipe is in flight. For VoiceOver the carousel is one
 * adjustable element: swipe up or down to move, double-tap to turn over.
 */
import { Animated, Pressable, StyleSheet, View } from "react-native";
import { useEffect, useRef, useState } from "react";
import { useHaptics, useReducedMotion } from "../motion";
import { nativeTokens } from "../tokens";
import { MembershipCard } from "./MembershipCard";
import {
  carouselGeometry,
  carouselIndexAt,
  carouselInterpolation,
  carouselValue,
  CAROUSEL_GAP,
  type NativeWalletCard,
} from "./model";

const DUNE = nativeTokens.brand.dune;

export interface WalletCarouselProps {
  readonly cards: readonly NativeWalletCard[];
  readonly value: string;
  readonly onChange: (id: string) => void;
  readonly flipped: boolean;
  readonly onFlip: (flipped: boolean) => void;
  /** Long press on the selected card: the quick actions. */
  readonly onLongPress?: (id: string) => void;
  /** The width the carousel has (its pane's band). */
  readonly width: number;
  /** "Your club cards". */
  readonly label: string;
}

export function WalletCarousel({
  cards,
  value,
  onChange,
  flipped,
  onFlip,
  onLongPress,
  width,
  label,
}: WalletCarouselProps) {
  const geometry = carouselGeometry(width);
  const haptics = useHaptics();
  const reduced = useReducedMotion();
  const selected = Math.max(
    0,
    cards.findIndex((card) => card.id === value),
  );
  const scrollX = useRef(
    new Animated.Value(selected * geometry.interval),
  ).current;
  const scrollRef = useRef<{
    scrollTo: (options: { x: number; animated: boolean }) => void;
  } | null>(null);
  const settled = useRef(selected);
  const [swiping, setSwiping] = useState(false);

  // Follow a selection made elsewhere (VoiceOver, a Home link, Show pass).
  useEffect(() => {
    if (settled.current === selected) return;
    settled.current = selected;
    scrollRef.current?.scrollTo({
      x: selected * geometry.interval,
      animated: !reduced,
    });
  }, [geometry.interval, reduced, selected]);

  // The pane's width settles after the first layout: keep the card centred.
  useEffect(() => {
    scrollRef.current?.scrollTo({
      x: settled.current * geometry.interval,
      animated: false,
    });
  }, [geometry.interval]);

  const settle = (offset: number) => {
    setSwiping(false);
    const index = carouselIndexAt(offset, geometry.interval, cards.length);
    if (index === settled.current) return;
    settled.current = index;
    haptics.selection();
    onChange(cards[index]!.id);
  };
  /** Selects a card by tap or VoiceOver, then scrolls to it. */
  const goTo = (index: number) => {
    const next = Math.max(0, Math.min(cards.length - 1, index));
    if (next === selected) return;
    settled.current = next;
    haptics.selection();
    onChange(cards[next]!.id);
    scrollRef.current?.scrollTo({
      x: next * geometry.interval,
      animated: !reduced,
    });
  };

  return (
    <View
      accessibilityActions={[
        { name: "increment" },
        { name: "decrement" },
        { name: "activate" },
        ...(onLongPress ? [{ name: "longpress", label: "Quick actions" }] : []),
      ]}
      accessibilityHint={
        flipped
          ? "Double-tap to turn back to the card. Swipe up or down for another card."
          : "Double-tap to show your pass. Swipe up or down for another card."
      }
      accessibilityLabel={label}
      accessibilityRole="adjustable"
      accessibilityValue={{ text: carouselValue(cards, selected) }}
      accessible
      onAccessibilityAction={(event) => {
        const action = event.nativeEvent.actionName;
        if (action === "increment") goTo(selected + 1);
        else if (action === "decrement") goTo(selected - 1);
        else if (action === "activate") onFlip(!flipped);
        else if (action === "longpress") onLongPress?.(cards[selected]!.id);
      }}
      testID="wallet-carousel"
    >
      <Animated.ScrollView
        contentContainerStyle={{ paddingHorizontal: geometry.inset }}
        contentOffset={{ x: selected * geometry.interval, y: 0 }}
        decelerationRate="fast"
        disableIntervalMomentum
        horizontal
        onMomentumScrollEnd={(event) =>
          settle(event.nativeEvent.contentOffset.x)
        }
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: true },
        )}
        onScrollBeginDrag={() => setSwiping(true)}
        ref={(node) => {
          scrollRef.current = node as typeof scrollRef.current;
        }}
        scrollEventThrottle={16}
        showsHorizontalScrollIndicator={false}
        snapToAlignment="start"
        snapToInterval={geometry.interval}
        style={styles.scroll}
      >
        {cards.map((card, index) => {
          const motion = carouselInterpolation(
            index,
            geometry.interval,
            geometry.card.width,
          );
          const isSelected = index === selected;
          return (
            <Animated.View
              key={card.id}
              style={[
                {
                  width: geometry.card.width,
                  marginRight: index === cards.length - 1 ? 0 : CAROUSEL_GAP,
                },
                reduced
                  ? null
                  : {
                      transform: [
                        {
                          translateX: scrollX.interpolate({
                            inputRange: motion.inputRange,
                            outputRange: motion.translateX,
                            extrapolate: "clamp",
                          }),
                        },
                        {
                          scale: scrollX.interpolate({
                            inputRange: motion.inputRange,
                            outputRange: motion.scale,
                            extrapolate: "clamp",
                          }),
                        },
                      ],
                    },
              ]}
            >
              <MembershipCard
                animate={isSelected && !swiping}
                card={card}
                flipped={isSelected && flipped}
                onLongPress={
                  isSelected && onLongPress
                    ? () => onLongPress(card.id)
                    : undefined
                }
                onPress={() => {
                  if (isSelected) onFlip(!flipped);
                  else goTo(index);
                }}
                testID={`wallet-card-${index}`}
                width={geometry.card.width}
              />
            </Animated.View>
          );
        })}
      </Animated.ScrollView>
      {cards.length > 1 ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.dots}
        >
          {cards.map((card, index) => (
            <Pressable
              hitSlop={8}
              key={card.id}
              onPress={() => goTo(index)}
              style={[styles.dot, index === selected ? styles.current : null]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { overflow: "visible", flexGrow: 0 },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    paddingTop: 16,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(244,242,236,0.38)",
  },
  current: { width: 18, backgroundColor: DUNE },
});
