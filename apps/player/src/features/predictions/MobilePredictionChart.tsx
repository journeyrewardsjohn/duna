import { runWithWatchdog, settleValues } from "@duna/ui/native";
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, useWindowDimensions, View } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";
import { SatoshiText as Text } from "../../../satoshi-text";
import type { MobilePredictionMarket } from "./prediction-types";
import { colors, rgba } from "../../shared/palette";
import { mobilePredictionPercent } from "./prediction-format";
import { styles } from "../../legacy/styles";

export function MobilePredictionChart({
  market,
}: {
  readonly market: MobilePredictionMarket;
}) {
  const { width } = useWindowDimensions();
  const reveal = useRef(new Animated.Value(0)).current;
  const [selectedIndex, setSelectedIndex] = useState(
    Math.max(0, market.history.length - 1),
  );
  const data = useMemo(() => {
    const points = market.history.length
      ? [...market.history]
      : [
          {
            recordedAt: new Date().toISOString(),
            yesPriceBps: market.yesPriceBps,
            volumeCredits: market.volumeCredits,
            source: "model" as const,
          },
        ];
    return points.length === 1 ? [points[0]!, points[0]!] : points;
  }, [market]);
  const chartWidth = Math.max(260, Math.min(700, width - 46));
  const chartHeight = 190;
  const padX = 9;
  const padY = 18;
  const xFor = (index: number) =>
    padX + (index / Math.max(1, data.length - 1)) * (chartWidth - padX * 2);
  const yFor = (priceBps: number) =>
    padY + ((10_000 - priceBps) / 10_000) * (chartHeight - padY * 2);
  const pathFor = (side: "yes" | "no") =>
    data
      .map((point, index) => {
        const price =
          side === "yes" ? point.yesPriceBps : 10_000 - point.yesPriceBps;
        return `${index === 0 ? "M" : "L"}${xFor(index).toFixed(1)},${yFor(price).toFixed(1)}`;
      })
      .join(" ");
  const selected = data[Math.min(selectedIndex, data.length - 1)] ?? data[0]!;
  const selectedX = xFor(Math.min(selectedIndex, data.length - 1));

  useEffect(() => {
    reveal.setValue(0);
    return runWithWatchdog(
      Animated.timing(reveal, {
        duration: 460,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver: true,
      }),
      { timeline: 460, settle: settleValues([[reveal, 1]]) },
    );
  }, [market.id, reveal]);

  const selectFromTouch = (locationX: number) => {
    const ratio = Math.max(0, Math.min(1, locationX / chartWidth));
    setSelectedIndex(Math.round(ratio * (data.length - 1)));
  };

  return (
    <Animated.View
      accessibilityLabel={`Crowd prediction history for ${market.title}`}
      style={[
        styles.mobilePredictionChart,
        {
          opacity: reveal,
          transform: [
            {
              translateY: reveal.interpolate({
                inputRange: [0, 1],
                outputRange: [8, 0],
              }),
            },
          ],
        },
      ]}
    >
      <View style={styles.mobilePredictionChartLegend}>
        <View style={styles.mobilePredictionChartLegendItem}>
          <View style={styles.mobilePredictionChartDotYes} />
          <Text
            numberOfLines={1}
            style={styles.mobilePredictionChartLegendText}
          >
            {market.yesLabel}
          </Text>
          <Text style={styles.mobilePredictionChartLegendValue}>
            {mobilePredictionPercent(selected.yesPriceBps)}
          </Text>
        </View>
        <View style={styles.mobilePredictionChartLegendItem}>
          <View style={styles.mobilePredictionChartDotNo} />
          <Text
            numberOfLines={1}
            style={styles.mobilePredictionChartLegendText}
          >
            {market.noLabel}
          </Text>
          <Text style={styles.mobilePredictionChartLegendValue}>
            {mobilePredictionPercent(10_000 - selected.yesPriceBps)}
          </Text>
        </View>
      </View>
      <View
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(event) =>
          selectFromTouch(event.nativeEvent.locationX)
        }
        onResponderMove={(event) =>
          selectFromTouch(event.nativeEvent.locationX)
        }
        onStartShouldSetResponder={() => true}
      >
        <Svg
          height={chartHeight}
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          width={chartWidth}
        >
          {[2_500, 5_000, 7_500].map((price) => (
            <Line
              key={price}
              stroke={rgba(colors.overlayRgb, 0.08)}
              strokeDasharray="3 5"
              x1={padX}
              x2={chartWidth - padX}
              y1={yFor(price)}
              y2={yFor(price)}
            />
          ))}
          <Path
            d={pathFor("yes")}
            fill="none"
            stroke={colors.aqua}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={3}
          />
          <Path
            d={pathFor("no")}
            fill="none"
            stroke={colors.sand}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={3}
          />
          <Line
            stroke={rgba(colors.overlayRgb, 0.22)}
            strokeWidth={1}
            x1={selectedX}
            x2={selectedX}
            y1={padY}
            y2={chartHeight - padY}
          />
          <Circle
            cx={selectedX}
            cy={yFor(selected.yesPriceBps)}
            fill={colors.aqua}
            r={5}
            stroke={colors.depth}
            strokeWidth={2}
          />
          <Circle
            cx={selectedX}
            cy={yFor(10_000 - selected.yesPriceBps)}
            fill={colors.sand}
            r={5}
            stroke={colors.depth}
            strokeWidth={2}
          />
        </Svg>
      </View>
      <View style={styles.mobilePredictionChartFooter}>
        <Text style={styles.mobilePredictionChartTime}>
          {new Intl.DateTimeFormat("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          }).format(new Date(selected.recordedAt))}
        </Text>
        <Text style={styles.mobilePredictionChartVolume}>
          {Math.round(market.volumeCredits).toLocaleString("en-US")} matched ·{" "}
          {market.participantCount} people
        </Text>
      </View>
    </Animated.View>
  );
}
