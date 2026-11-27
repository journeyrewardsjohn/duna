import { Pressable, ScrollView, View } from "react-native";
import { usePlayerRuntime } from "../../../runtime";
import { SatoshiText as Text } from "../../../satoshi-text";
import { selectionHaptic } from "../../shared/haptics";
import { AppHeader } from "../../app/AppHeader";
import { SectionHeader } from "../../shared/SectionHeader";
import {
  formatPredictionCredits,
  openPredictionMarket,
} from "./prediction-format";
import { MobilePredictionDiscoveryRail } from "./MobilePredictionDiscoveryRail";
import { PredictionPositionRow } from "./PredictionPositionRow";
import { styles } from "../../legacy/styles";

export function PredictionPortfolioScreen({
  onBack,
}: {
  readonly onBack: () => void;
}) {
  const { predictionDiscovery, predictionWallet } = usePlayerRuntime();
  const positions = predictionWallet?.positions ?? [];
  const openPositions = positions.filter(
    (position) => position.status === "open",
  );
  const determinedPositions = positions.filter(
    (position) => position.status !== "open",
  );
  const portfolio = predictionWallet?.portfolio;
  return (
    <ScrollView
      contentContainerStyle={styles.screenContent}
      showsVerticalScrollIndicator={false}
    >
      <AppHeader eyebrow="WALLET · PREDICTIONS" />
      <Pressable
        accessibilityLabel="Back to wallet"
        accessibilityRole="button"
        onPress={() => {
          selectionHaptic();
          onBack();
        }}
        style={styles.predictionPortfolioBack}
      >
        <Text style={styles.predictionPortfolioBackText}>← Wallet</Text>
      </Pressable>
      <Text style={styles.displayTitle}>Your calls.</Text>
      <Text style={styles.predictionPortfolioIntro}>
        Follow every open position, closed order, win, and loss. Your handle is
        visible in each market because prediction credits have no cash value.
      </Text>

      <View style={styles.predictionPortfolioHero}>
        <View style={styles.predictionPortfolioHeroTop}>
          <View>
            <Text style={styles.predictionPortfolioHeroLabel}>AVAILABLE</Text>
            <Text style={styles.predictionPortfolioHeroValue}>
              {Math.floor(
                predictionWallet?.availableCredits ?? 1_000,
              ).toLocaleString("en-US")}
            </Text>
            <Text style={styles.predictionPortfolioHeroUnit}>
              prediction credits
            </Text>
          </View>
          <View style={styles.predictionWalletCoin}>
            <Text style={styles.predictionWalletCoinText}>◇</Text>
          </View>
        </View>
        <View style={styles.predictionPortfolioMetrics}>
          <View style={styles.predictionPortfolioMetric}>
            <Text style={styles.predictionPortfolioMetricValue}>
              {formatPredictionCredits(portfolio?.currentValueCredits ?? 0)}
            </Text>
            <Text style={styles.predictionPortfolioMetricLabel}>
              OPEN VALUE
            </Text>
          </View>
          <View style={styles.predictionPortfolioMetric}>
            <Text
              style={[
                styles.predictionPortfolioMetricValue,
                (portfolio?.unrealizedCredits ?? 0) >= 0
                  ? styles.positiveText
                  : styles.negativeText,
              ]}
            >
              {formatPredictionCredits(portfolio?.unrealizedCredits ?? 0, true)}
            </Text>
            <Text style={styles.predictionPortfolioMetricLabel}>OPEN NET</Text>
          </View>
          <View style={styles.predictionPortfolioMetric}>
            <Text
              style={[
                styles.predictionPortfolioMetricValue,
                (portfolio?.netSettledCredits ?? 0) >= 0
                  ? styles.positiveText
                  : styles.negativeText,
              ]}
            >
              {formatPredictionCredits(portfolio?.netSettledCredits ?? 0, true)}
            </Text>
            <Text style={styles.predictionPortfolioMetricLabel}>
              SETTLED NET
            </Text>
          </View>
        </View>
        <Text style={styles.predictionPortfolioGrant}>
          +{predictionWallet?.nextMonthlyGrantCredits ?? 100} monthly grant ·
          free play only
        </Text>
      </View>

      <MobilePredictionDiscoveryRail
        items={predictionDiscovery?.items ?? []}
        onOpenPortfolio={() => undefined}
      />

      <SectionHeader
        action={`${openPositions.length} positions`}
        eyebrow="PORTFOLIO"
        title="Still in play."
      />
      <View style={styles.predictionPortfolioList}>
        {openPositions.length ? (
          openPositions.map((position) => (
            <PredictionPositionRow key={position.id} position={position} />
          ))
        ) : (
          <View style={styles.predictionPortfolioEmpty}>
            <Text style={styles.predictionPortfolioEmptyMark}>◇</Text>
            <Text style={styles.predictionPortfolioEmptyTitle}>
              No open positions yet.
            </Text>
            <Text style={styles.predictionPortfolioEmptyBody}>
              Choose an open market above and make a call with free credits.
            </Text>
          </View>
        )}
      </View>

      <SectionHeader
        action={`${portfolio?.wins ?? 0}W · ${portfolio?.losses ?? 0}L`}
        eyebrow="DETERMINED"
        title="Wins + losses."
      />
      <View style={styles.predictionPortfolioList}>
        {determinedPositions.length ? (
          determinedPositions.map((position) => (
            <PredictionPositionRow key={position.id} position={position} />
          ))
        ) : (
          <View style={styles.predictionPortfolioEmptyCompact}>
            <Text style={styles.predictionPortfolioEmptyBody}>
              Completed markets will land here with their final payout and net
              credit result.
            </Text>
          </View>
        )}
      </View>

      {(predictionWallet?.openOrders.length ?? 0) > 0 && (
        <>
          <SectionHeader
            eyebrow="ORDER BOOK"
            title="Waiting to fill."
            action={`${predictionWallet?.openOrders.length ?? 0} open`}
          />
          <View style={styles.predictionPortfolioList}>
            {predictionWallet?.openOrders.map((order) => (
              <Pressable
                key={order.id}
                onPress={() => openPredictionMarket(order.marketPath)}
                style={styles.predictionPortfolioLedgerRow}
              >
                <View style={styles.flex}>
                  <Text numberOfLines={1} style={styles.rowTitle}>
                    {order.title}
                  </Text>
                  <Text numberOfLines={1} style={styles.rowMeta}>
                    {order.intent.toUpperCase()} {order.selectedLabel} ·{" "}
                    {formatPredictionCredits(order.openShares)} shares open
                  </Text>
                </View>
                <Text style={styles.predictionPortfolioLedgerValue}>
                  {(order.limitPriceBps / 100).toFixed(0)}%
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      )}

      <SectionHeader eyebrow="CREDIT LEDGER" title="Every movement." />
      <View style={styles.predictionPortfolioList}>
        {(predictionWallet?.activity.length ?? 0) ? (
          predictionWallet?.activity.slice(0, 30).map((entry) => (
            <Pressable
              disabled={!entry.marketPath}
              key={entry.id}
              onPress={() =>
                entry.marketPath && openPredictionMarket(entry.marketPath)
              }
              style={styles.predictionPortfolioLedgerRow}
            >
              <View style={styles.flex}>
                <Text numberOfLines={2} style={styles.rowTitle}>
                  {entry.note}
                </Text>
                <Text style={styles.rowMeta}>
                  {new Date(entry.occurredAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}{" "}
                  · {entry.kind.replaceAll("-", " ")}
                </Text>
              </View>
              <Text
                style={[
                  styles.predictionPortfolioLedgerValue,
                  entry.deltaCredits >= 0
                    ? styles.positiveText
                    : styles.negativeText,
                ]}
              >
                {formatPredictionCredits(entry.deltaCredits, true)}
              </Text>
            </Pressable>
          ))
        ) : (
          <View style={styles.predictionPortfolioEmptyCompact}>
            <Text style={styles.predictionPortfolioEmptyBody}>
              Your immutable credit ledger will appear here.
            </Text>
          </View>
        )}
      </View>

      <View style={styles.predictionPortfolioTrust}>
        <Text style={styles.predictionPortfolioTrustMark}>✓</Text>
        <View style={styles.flex}>
          <Text style={styles.predictionPortfolioTrustTitle}>
            Free play, transparent by design.
          </Text>
          <Text style={styles.predictionPortfolioTrustBody}>
            Credits cannot be bought, transferred, redeemed, or exchanged for
            cash or prizes. Determined markets close all remaining orders before
            payouts are posted to the ledger.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}
