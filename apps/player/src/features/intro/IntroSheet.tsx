/**
 * The intro to a section, and "What's in Duna" (every intro, one page each).
 * A page sheet on the section's brand ground: swipe it down, tap Close (top
 * right, where iOS puts it) or Skip, or tap the primary action, at any
 * moment. Nothing waits on the animation: the words are on the page from the
 * first frame and the art decorates beside them.
 *
 * Haptics: a selection tick when a page changes, a light confirm on the
 * primary action, success when the tour is finished.
 */
import { useEffect, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type ScrollViewInstance,
  type NativeSyntheticEvent,
} from "react-native";
import {
  Icon,
  Rally,
  Text,
  ThemeOverride,
  Title,
  TitleRegion,
  useHaptics,
  useTheme,
} from "@duna/ui/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { IntroArt, useGroundColors } from "./IntroArt";
import { INTROS, introFor, type Intro, type IntroKey } from "./intro-content";

export type IntroRequest =
  | { readonly kind: "section"; readonly key: IntroKey }
  | { readonly kind: "tour"; readonly start?: IntroKey };

function IntroPage({
  intro,
  width,
  active,
}: {
  readonly intro: Intro;
  readonly width: number;
  readonly active: boolean;
}) {
  const ground = useGroundColors(intro.ground);
  const { tokens } = useTheme();
  return (
    <View
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? "auto" : "no-hide-descendants"}
      style={[styles.page, { width, paddingHorizontal: tokens.space["6"] }]}
      testID={`intro-page-${intro.key}`}
    >
      <IntroArt
        ground={intro.ground}
        intro={intro.key}
        trigger={active ? intro.key : null}
      />
      <View style={{ gap: tokens.space["2"] }}>
        {active ? (
          <Title style={{ color: ground.ink }}>{intro.title}</Title>
        ) : (
          <Text style={{ color: ground.ink }} variant="phone-heading">
            {intro.title}
          </Text>
        )}
        <Text style={{ color: ground.ink }} variant="phone-body">
          {intro.lead}
        </Text>
      </View>
      <View style={{ gap: tokens.space["3"] }}>
        <Rally trigger={active ? intro.key : null}>
          {intro.points.map((point, index) => (
            <View key={point.title} style={styles.point}>
              <View
                style={[styles.pointMark, { backgroundColor: ground.soft }]}
              >
                <Text
                  family="mono"
                  style={{ color: ground.ink }}
                  tabular
                  variant="phone-meta"
                  weight={600}
                >
                  {String(index + 1)}
                </Text>
              </View>
              <View style={styles.flex}>
                <Text
                  style={{ color: ground.ink }}
                  variant="phone-body"
                  weight={600}
                >
                  {point.title}
                </Text>
                <Text
                  style={{ color: ground.ink, opacity: 0.82 }}
                  variant="phone-meta"
                >
                  {point.body}
                </Text>
              </View>
            </View>
          ))}
        </Rally>
      </View>
    </View>
  );
}

export function IntroSheet({
  request,
  onClose,
  onGo,
}: {
  readonly request: IntroRequest | null;
  /** Every way out: close, skip, swipe down, the primary action. */
  readonly onClose: (shown: readonly IntroKey[]) => void;
  /** "Take me there" from the tour. */
  readonly onGo: (intro: Intro) => void;
}) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const haptics = useHaptics();
  const { tokens } = useTheme();
  const tour = request?.kind === "tour";
  const pages: readonly Intro[] = request
    ? request.kind === "tour"
      ? INTROS
      : [introFor(request.key)]
    : [];
  const startIndex =
    request?.kind === "tour" && request.start
      ? Math.max(
          0,
          INTROS.findIndex((intro) => intro.key === request.start),
        )
      : 0;
  const [index, setIndex] = useState(startIndex);
  const scroller = useRef<ScrollViewInstance | null>(null);
  const seen = useRef(new Set<IntroKey>());
  // The sheet is never wider than a readable column on iPad.
  const pageWidth = Math.min(width, 560);

  useEffect(() => {
    setIndex(startIndex);
    seen.current = new Set();
    if (request) {
      requestAnimationFrame(() =>
        scroller.current?.scrollTo({
          x: startIndex * pageWidth,
          animated: false,
        }),
      );
    }
    // A new request starts at its own first page.
  }, [request, startIndex, pageWidth]);

  const current = pages[index] ?? pages[0];
  if (current) seen.current.add(current.key);
  const ground = useGroundColors(current?.ground ?? "night-court");
  const dark =
    current?.ground === "night-court" || current?.ground === "tidewater";
  const last = index >= pages.length - 1;

  const close = () => onClose([...seen.current]);

  const goTo = (next: number) => {
    const clamped = Math.max(0, Math.min(pages.length - 1, next));
    scroller.current?.scrollTo({ x: clamped * pageWidth, animated: true });
    if (clamped !== index) {
      haptics.selection();
      setIndex(clamped);
    }
  };

  const onScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
    if (next !== index && next >= 0 && next < pages.length) {
      haptics.selection();
      setIndex(next);
    }
  };

  const primary = () => {
    if (tour && !last) {
      haptics.confirmed(0);
      goTo(index + 1);
      return;
    }
    haptics.confirmed(tour ? 2 : 0);
    close();
  };

  return (
    <Modal
      animationType="slide"
      onRequestClose={close}
      presentationStyle="pageSheet"
      visible={Boolean(request)}
    >
      <ThemeOverride theme={dark ? "dark" : "light"}>
        <TitleRegion name="intro">
          <View
            style={[styles.fill, { backgroundColor: ground.fill }]}
            testID="intro-sheet"
          >
            <View
              style={[
                styles.bar,
                {
                  paddingHorizontal: tokens.space["4"],
                  paddingTop: tokens.space["3"],
                },
              ]}
            >
              <Pressable
                accessibilityLabel="Skip the intro"
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => {
                  haptics.selection();
                  close();
                }}
                style={styles.barAction}
                testID="intro-skip"
              >
                <Text
                  style={{ color: ground.ink }}
                  variant="phone-body"
                  weight={600}
                >
                  Skip
                </Text>
              </Pressable>
              {tour ? (
                <Text
                  style={{ color: ground.ink, opacity: 0.8 }}
                  variant="phone-meta"
                  weight={600}
                >
                  What's in Duna
                </Text>
              ) : null}
              <Pressable
                accessibilityLabel="Close"
                accessibilityRole="button"
                hitSlop={8}
                onPress={close}
                style={[styles.close, { backgroundColor: ground.soft }]}
                testID="intro-close"
              >
                <Icon color={ground.ink} name="close" size="control" />
              </Pressable>
            </View>
            <ScrollView
              horizontal
              onMomentumScrollEnd={onScrollEnd}
              pagingEnabled
              ref={scroller}
              scrollEnabled={pages.length > 1}
              showsHorizontalScrollIndicator={false}
              style={[
                styles.fill,
                { alignSelf: "center", maxWidth: pageWidth },
              ]}
            >
              {pages.map((intro, pageIndex) => (
                <IntroPage
                  active={pageIndex === index}
                  intro={intro}
                  key={intro.key}
                  width={pageWidth}
                />
              ))}
            </ScrollView>
            <View
              style={[
                styles.footer,
                {
                  paddingHorizontal: tokens.space["6"],
                  paddingBottom: Math.max(insets.bottom, tokens.space["4"]),
                  gap: tokens.space["3"],
                },
              ]}
            >
              {pages.length > 1 ? (
                <View
                  accessibilityLabel={`Page ${index + 1} of ${pages.length}`}
                  accessible
                  style={styles.dots}
                >
                  {pages.map((intro, dot) => (
                    <Pressable
                      accessibilityElementsHidden
                      hitSlop={6}
                      importantForAccessibility="no"
                      key={intro.key}
                      onPress={() => goTo(dot)}
                      style={[
                        styles.dot,
                        {
                          width: dot === index ? 22 : 8,
                          backgroundColor:
                            dot === index ? ground.ink : ground.soft,
                        },
                      ]}
                    />
                  ))}
                </View>
              ) : null}
              <Pressable
                accessibilityRole="button"
                onPress={primary}
                style={({ pressed }) => [
                  styles.primary,
                  {
                    backgroundColor: ground.ink,
                    borderRadius: tokens.radius.pill,
                    opacity: pressed ? 0.86 : 1,
                    transform: [{ scale: pressed ? 0.98 : 1 }],
                  },
                ]}
                testID="intro-primary"
              >
                <Text
                  style={{ color: ground.fill }}
                  variant="phone-body"
                  weight={600}
                >
                  {tour ? (last ? "Done" : "Next") : "Got it"}
                </Text>
              </Pressable>
              {tour && current ? (
                <Pressable
                  accessibilityRole="button"
                  hitSlop={6}
                  onPress={() => {
                    haptics.confirmed(0);
                    onClose([...seen.current]);
                    onGo(current);
                  }}
                  style={styles.secondary}
                  testID="intro-go"
                >
                  <Text
                    style={{ color: ground.ink }}
                    variant="phone-body"
                    weight={600}
                  >
                    {current.goLabel}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </TitleRegion>
      </ThemeOverride>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1, minWidth: 0 },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  barAction: { minHeight: 44, minWidth: 44, justifyContent: "center" },
  close: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  page: { flex: 1, justifyContent: "center", gap: 28 },
  point: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  pointMark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  footer: { paddingTop: 12 },
  dots: { flexDirection: "row", gap: 6, alignSelf: "center" },
  dot: { height: 8, borderRadius: 4 },
  primary: { minHeight: 56, alignItems: "center", justifyContent: "center" },
  secondary: { minHeight: 44, alignItems: "center", justifyContent: "center" },
});
