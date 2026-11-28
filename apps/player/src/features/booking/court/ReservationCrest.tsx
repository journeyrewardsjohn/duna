/**
 * "Confirming reservation" as the Crest builds itself (M-P3; owner feedback
 * image 40: "a much more on-brand animation ... no stock icons"). The
 * language of `LaunchSequence` and `SetBySetLoader`: the net stands up from
 * the line, then each real step of the checkout grows one crest out of the
 * line, inner first: payment received, court secured, match and
 * invitations. The crest still to come breathes (the one loop a loader may
 * have). Every animation runs through `runWithWatchdog` and only decorates:
 * the step list beside it carries the words, so motion never gates content.
 * Reduced motion: each crest is simply there when its step is done.
 */
import { Animated, Easing, View } from "react-native";
import {
  CrestLayers,
  runWithWatchdog,
  settleValues,
  useReducedMotion,
  useTheme,
} from "@duna/ui/native";
import { useEffect, useRef, useState } from "react";

const RISE_MS = 600;
const BREATH_MS = 1_200;

export function ReservationCrest({
  done,
  failed = false,
  size = 112,
}: {
  /** Completed steps, 0 to 3. */
  readonly done: number;
  readonly failed?: boolean;
  readonly size?: number;
}) {
  const reduceMotion = useReducedMotion();
  const { tokens, colors } = useTheme();
  const net = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  // Outer, middle, inner (the brand book order); steps fill inner first.
  const crests = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  const breath = useRef(new Animated.Value(1)).current;
  const shown = useRef(0);
  const [cycle, setCycle] = useState(0);

  // The net stands up once.
  useEffect(() => {
    if (reduceMotion) {
      net.setValue(1);
      return;
    }
    return runWithWatchdog(
      Animated.timing(net, {
        toValue: 1,
        duration: 300,
        easing: Easing.bezier(0.2, 0.8, 0.2, 1),
        useNativeDriver: true,
      }),
      { timeline: 300, settle: settleValues([[net, 1]]) },
    );
  }, [net, reduceMotion]);

  // Each completed step grows its crest from the line.
  useEffect(() => {
    const cancels: (() => void)[] = [];
    const target = Math.min(3, Math.max(0, done));
    for (let step = 0; step < 3; step += 1) {
      const crest = crests[2 - step]!;
      if (step >= target) {
        crest.setValue(1);
        continue;
      }
      if (reduceMotion || step < shown.current) {
        crest.setValue(1);
        continue;
      }
      crest.setValue(0);
      cancels.push(
        runWithWatchdog(
          Animated.timing(crest, {
            toValue: 1,
            duration: RISE_MS,
            delay: (step - shown.current) * 140,
            easing: Easing.bezier(0.2, 0.8, 0.2, 1),
            useNativeDriver: true,
          }),
          {
            timeline: RISE_MS + (step - shown.current) * 140,
            settle: settleValues([[crest, 1]]),
          },
        ),
      );
    }
    shown.current = target;
    return () => {
      for (const cancel of cancels) cancel();
    };
  }, [crests, done, failed, reduceMotion]);

  // The pending crest breathes: one finite breath at a time, re-armed.
  useEffect(() => {
    if (reduceMotion || failed || done >= 3) {
      breath.setValue(1);
      return;
    }
    breath.setValue(0.25);
    return runWithWatchdog(
      Animated.sequence([
        Animated.timing(breath, {
          toValue: 0.9,
          duration: BREATH_MS / 2,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(breath, {
          toValue: 0.25,
          duration: BREATH_MS / 2,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
      {
        timeline: BREATH_MS,
        settle: settleValues([[breath, 1]]),
        onFinish: () => setCycle((count) => count + 1),
      },
    );
  }, [breath, cycle, done, failed, reduceMotion]);

  const ink = failed ? colors["text-3"] : tokens.brand.dune;
  const pending = colors["line-strong"];
  const target = Math.min(3, Math.max(0, done));
  const crestColors = [0, 1, 2].map((crest) => {
    const step = 2 - crest;
    return step < target ? ink : pending;
  }) as [string, string, string];

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        alignItems: "center",
        justifyContent: "center",
        height: size + 8,
      }}
    >
      <View>
        <CrestLayers
          color={ink}
          crestColors={crestColors}
          crests={[crests[0]!, crests[1]!, crests[2]!]}
          height={size}
          net={net}
        />
        {target < 3 && !failed ? (
          <Animated.View
            pointerEvents="none"
            style={{ position: "absolute", inset: 0, opacity: breath }}
          >
            <CrestLayers
              color={pending}
              crestColors={
                [0, 1, 2].map((crest) =>
                  2 - crest === target ? tokens.brand.dune : "transparent",
                ) as [string, string, string]
              }
              height={size}
              net={0}
            />
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}
