/**
 * The purchase moment on native (spec §6): on Night Court a Dune line draws
 * from the centre (450 ms), the card Rises out of it (700 ms, revealed from
 * the line upward with a 22 pt lift), then the title, the line of text and
 * the actions Rally in, 120 ms apart; a success haptic. Reduce Motion: the
 * finished frame with a 200 ms fade. All on the native driver.
 */
import { Animated, Easing, StyleSheet, View } from "react-native";
import { useEffect, useRef, type ReactNode } from "react";
import { useHaptics, useReducedMotion } from "../motion";
import { ThemeOverride } from "../theme/ThemeProvider";
import { nativeTokens } from "../tokens";
import { Text, Title } from "../type";
import { MembershipCard } from "./MembershipCard";
import { geometryForWidth, type NativeWalletCard } from "./model";

const RISE = Easing.bezier(0.2, 0.8, 0.2, 1);
const NIGHT = nativeTokens.brand["night-court"];
const SALT = nativeTokens.brand.salt;
const DUNE = nativeTokens.brand.dune;

export interface CardArrivalProps {
  readonly card: NativeWalletCard;
  /** The card's width (the hero size on a phone: up to 420). */
  readonly width: number;
  /** "Welcome to Saltline Beach Club": the moment's one Jost title. */
  readonly title: string;
  /** "Your annual card is in your wallet. Your pass works from today." */
  readonly text: string;
  /** "Open my wallet". */
  readonly actions?: ReactNode;
  readonly paddingTop?: number;
}

export function CardArrival({
  card,
  width,
  title,
  text,
  actions,
  paddingTop = 0,
}: CardArrivalProps) {
  const reduced = useReducedMotion();
  const haptics = useHaptics();
  const geometry = geometryForWidth(width);
  const line = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const rise = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const words = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  const fade = useRef(new Animated.Value(reduced ? 0 : 1)).current;

  useEffect(() => {
    haptics.confirmed(2);
    const timing = (value: Animated.Value, duration: number, delay = 0) =>
      Animated.timing(value, {
        toValue: 1,
        duration,
        delay,
        easing: RISE,
        useNativeDriver: true,
      });
    const animation = reduced
      ? Animated.parallel([
          timing(fade, 200),
          ...words.map((value) => timing(value, 0)),
        ])
      : Animated.sequence([
          timing(line, 450),
          timing(rise, 700),
          Animated.stagger(
            120,
            words.map((value) => timing(value, 600)),
          ),
        ]);
    animation.start();
    return () => animation.stop();
    // The moment plays once per arrival.
  }, []);

  const word = (index: number) => ({
    opacity: words[index]!,
    transform: reduced
      ? []
      : [
          {
            translateY: words[index]!.interpolate({
              inputRange: [0, 1],
              outputRange: [12, 0],
            }),
          },
        ],
  });
  return (
    <ThemeOverride theme="dark">
      <Animated.View
        accessibilityViewIsModal
        style={[
          styles.root,
          { paddingTop: paddingTop + 32 },
          reduced ? { opacity: fade } : null,
        ]}
        testID="card-arrival"
      >
        <View style={[styles.stage, { height: geometry.height + 40 }]}>
          <View
            style={[styles.reveal, { width, height: geometry.height + 30 }]}
          >
            <Animated.View
              style={{
                opacity: rise,
                transform: [
                  {
                    translateY: rise.interpolate({
                      inputRange: [0, 1],
                      outputRange: [geometry.height + 22, 0],
                    }),
                  },
                ],
              }}
            >
              <MembershipCard animate card={card} width={width} />
            </Animated.View>
          </View>
          <Animated.View
            style={[styles.line, { width, transform: [{ scaleX: line }] }]}
          />
        </View>
        <View style={styles.words}>
          <Animated.View style={word(0)}>
            <Title>{title}</Title>
          </Animated.View>
          <Animated.View style={word(1)}>
            <Text style={styles.text} variant="phone-body">
              {text}
            </Text>
          </Animated.View>
          <Animated.View style={[styles.actions, word(2)]}>
            {actions}
          </Animated.View>
        </View>
      </Animated.View>
    </ThemeOverride>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: NIGHT,
    alignItems: "center",
    paddingHorizontal: 24,
    gap: 28,
  },
  stage: { alignItems: "center", justifyContent: "flex-end" },
  reveal: { overflow: "hidden", justifyContent: "flex-end", paddingBottom: 8 },
  line: { height: 2, borderRadius: 1, backgroundColor: DUNE },
  words: { alignSelf: "stretch", gap: 12 },
  text: { color: SALT },
  actions: { gap: 10, paddingTop: 8 },
});
