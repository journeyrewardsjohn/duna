import { Pressable, View } from "react-native";
import { SatoshiText as Text } from "../../../satoshi-text";
import type { MobilePredictionPosition } from "./prediction-types";
import {
  formatPredictionCredits,
  openPredictionMarket,
} from "./prediction-format";
import { styles } from "../../legacy/styles";

export function PredictionPositionRow({
  position,
}: {
  readonly position: MobilePredictionPosition;
}) {
  const determined = position.status !== "open";
  const statusLabel =
    position.status === "open"
      ? position.marketStatus === "locked"
        ? "Locked"
        : "Open"
      : position.status === "won"
        ? "Won"
        : position.status === "lost"
          ? "Lost"
          : "Void";
  return (
    <Pressable
      accessibilityHint="Opens the market detail"
      accessibilityLabel={`${position.title}, ${statusLabel}`}
      accessibilityRole="button"
      onPress={() => openPredictionMarket(position.marketPath)}
      style={({ pressed }) => [
        styles.predictionPortfolioRow,
        pressed && styles.predictionDiscoveryCardPressed,
      ]}
    >
      <View style={styles.flex}>
        <View style={styles.predictionPortfolioRowTopline}>
          <Text numberOfLines={1} style={styles.predictionPortfolioRowTitle}>
            {position.title}
          </Text>
          <Text
            style={[
              styles.predictionPortfolioStatus,
              position.status === "won" && styles.predictionPortfolioStatusWon,
              position.status === "lost" &&
                styles.predictionPortfolioStatusLost,
            ]}
          >
            {determined
              ? `DETERMINED · ${statusLabel.toUpperCase()}`
              : statusLabel.toUpperCase()}
          </Text>
        </View>
        <Text numberOfLines={1} style={styles.predictionPortfolioSelection}>
          {position.selectedLabel} · {formatPredictionCredits(position.shares)}{" "}
          shares
        </Text>
        <View style={styles.predictionPortfolioNumbers}>
          <View>
            <Text style={styles.predictionPortfolioNumberLabel}>COMMITTED</Text>
            <Text style={styles.predictionPortfolioNumberValue}>
              {formatPredictionCredits(position.costCredits)}
            </Text>
          </View>
          <View>
            <Text style={styles.predictionPortfolioNumberLabel}>
              {determined ? "PAYOUT" : "VALUE"}
            </Text>
            <Text style={styles.predictionPortfolioNumberValue}>
              {formatPredictionCredits(
                determined
                  ? position.payoutCredits
                  : position.currentValueCredits,
              )}
            </Text>
          </View>
          <View>
            <Text style={styles.predictionPortfolioNumberLabel}>NET</Text>
            <Text
              style={[
                styles.predictionPortfolioNumberValue,
                position.netCredits >= 0
                  ? styles.positiveText
                  : styles.negativeText,
              ]}
            >
              {formatPredictionCredits(position.netCredits, true)}
            </Text>
          </View>
        </View>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}
