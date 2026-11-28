import { Pressable, ScrollView, View } from "react-native";
import { SatoshiText as Text } from "../../../satoshi-text";
import type { MobilePredictionDiscoveryItem } from "./prediction-types";
import { SectionHeader } from "../../shared/SectionHeader";
import { openPredictionMarket } from "./prediction-format";
import { styles } from "../../legacy/styles";

export function MobilePredictionDiscoveryRail({
  items,
  onOpenPortfolio,
}: {
  readonly items: readonly MobilePredictionDiscoveryItem[];
  readonly onOpenPortfolio: () => void;
}) {
  if (!items.length) return null;
  return (
    <>
      <SectionHeader
        action="Your portfolio"
        eyebrow="PREDICTIONS"
        onAction={onOpenPortfolio}
        title="What happens next?"
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.horizontalBleed}
      >
        <View style={styles.predictionDiscoveryRail}>
          {items.slice(0, 6).map((item) => {
            const market = item.market;
            const determined = market.status === "settled";
            return (
              <Pressable
                accessibilityHint="Opens the prediction market"
                accessibilityLabel={`${item.competition}: ${market.title}`}
                accessibilityRole="button"
                key={`${market.subjectType}-${market.subjectId}`}
                onPress={() => openPredictionMarket(item.marketPath)}
                style={({ pressed }) => [
                  styles.predictionDiscoveryCard,
                  pressed && styles.predictionDiscoveryCardPressed,
                ]}
              >
                <View style={styles.predictionDiscoveryTopline}>
                  <Text
                    numberOfLines={1}
                    style={styles.predictionDiscoveryCompetition}
                  >
                    {item.competition.toUpperCase()}
                  </Text>
                  <Text
                    style={[
                      styles.predictionDiscoveryState,
                      determined && styles.predictionDiscoveryStateDetermined,
                    ]}
                  >
                    {determined
                      ? "DETERMINED"
                      : item.relevance === "live-pro"
                        ? "LIVE"
                        : "OPEN"}
                  </Text>
                </View>
                <Text numberOfLines={2} style={styles.predictionDiscoveryTitle}>
                  {market.title}
                </Text>
                <Text
                  numberOfLines={1}
                  style={styles.predictionDiscoveryReason}
                >
                  {item.reason}
                </Text>
                <View style={styles.predictionDiscoveryOdds}>
                  <View style={styles.predictionDiscoveryOutcome}>
                    <Text
                      numberOfLines={1}
                      style={styles.predictionDiscoveryOutcomeLabel}
                    >
                      {market.yesLabel}
                    </Text>
                    <Text style={styles.predictionDiscoveryOutcomeValue}>
                      {(market.yesPriceBps / 100).toFixed(0)}%
                    </Text>
                  </View>
                  <View style={styles.predictionDiscoveryOutcome}>
                    <Text
                      numberOfLines={1}
                      style={styles.predictionDiscoveryOutcomeLabel}
                    >
                      {market.noLabel}
                    </Text>
                    <Text style={styles.predictionDiscoveryOutcomeValueMuted}>
                      {(market.noPriceBps / 100).toFixed(0)}%
                    </Text>
                  </View>
                </View>
                <View style={styles.predictionDiscoveryFooter}>
                  <Text
                    numberOfLines={1}
                    style={styles.predictionDiscoveryHandles}
                  >
                    {market.predictors.length
                      ? market.predictors
                          .slice(0, 3)
                          .map((predictor) => `@${predictor.handle}`)
                          .join("  ")
                      : "Be first to predict"}
                  </Text>
                  <Text style={styles.predictionDiscoveryArrow}>→</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </>
  );
}
