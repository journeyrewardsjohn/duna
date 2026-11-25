import { Pressable, View } from "react-native";
import { usePlayerRuntime } from "../../../runtime";
import { SatoshiText as Text } from "../../../satoshi-text";
import { selectionHaptic } from "../../shared/haptics";
import { formatPredictionCredits } from "./prediction-format";
import { styles } from "../../legacy/styles";

export function PredictionWalletSummaryCard({
  onPress,
}: {
  readonly onPress: () => void;
}) {
  const { predictionWallet } = usePlayerRuntime();
  const portfolio = predictionWallet?.portfolio;
  return (
    <Pressable
      accessibilityHint="Opens your prediction portfolio and history"
      accessibilityLabel="Open prediction credits"
      accessibilityRole="button"
      onPress={() => {
        selectionHaptic();
        onPress();
      }}
      style={({ pressed }) => [
        styles.predictionWalletCard,
        pressed && styles.predictionDiscoveryCardPressed,
      ]}
    >
      <View style={styles.predictionWalletHeader}>
        <View>
          <Text style={styles.eyebrow}>WALLET · PREDICTIONS</Text>
          <Text style={styles.predictionWalletBalance}>
            {Math.floor(
              predictionWallet?.availableCredits ?? 1_000,
            ).toLocaleString("en-US")}
          </Text>
          <Text style={styles.predictionWalletCreditLabel}>
            FREE CREDITS AVAILABLE
          </Text>
        </View>
        <View style={styles.predictionWalletCoin}>
          <Text style={styles.predictionWalletCoinText}>◇</Text>
        </View>
      </View>
      <Text style={styles.predictionWalletBody}>
        Build a portfolio around matches and teams you care about. Credits are
        free, non-cash, and never redeemable.
      </Text>
      <View style={styles.predictionWalletFacts}>
        <View>
          <Text style={styles.predictionWalletFactValue}>
            {portfolio?.openPositions ?? 0}
          </Text>
          <Text style={styles.predictionWalletFactLabel}>OPEN</Text>
        </View>
        <View>
          <Text style={styles.predictionWalletFactValue}>
            {portfolio?.wins ?? 0}–{portfolio?.losses ?? 0}
          </Text>
          <Text style={styles.predictionWalletFactLabel}>RECORD</Text>
        </View>
        <View>
          <Text
            style={[
              styles.predictionWalletFactValue,
              (portfolio?.netSettledCredits ?? 0) >= 0
                ? styles.positiveText
                : styles.negativeText,
            ]}
          >
            {formatPredictionCredits(portfolio?.netSettledCredits ?? 0, true)}
          </Text>
          <Text style={styles.predictionWalletFactLabel}>SETTLED</Text>
        </View>
        <Text style={styles.predictionWalletOpen}>OPEN →</Text>
      </View>
    </Pressable>
  );
}
