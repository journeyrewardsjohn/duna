import { Pressable, View } from "react-native";
import { SatoshiText as Text } from "../../../satoshi-text";
import type { MobilePredictionMarket } from "./prediction-types";
import type { ResolvedProEvent } from "../pro-tour/pro-tour-types";
import { countryFlag } from "../pro-tour/pro-tour-format";
import { mobilePredictionPercent } from "./prediction-format";
import { styles } from "../../legacy/styles";

export function MobileTournamentMarkets({
  event,
  markets,
  onOpen,
}: {
  readonly event: ResolvedProEvent;
  readonly markets: readonly MobilePredictionMarket[];
  readonly onOpen: (
    market: MobilePredictionMarket,
    externalTeamId: string,
  ) => void;
}) {
  if (!markets.length) return null;
  return (
    <View style={styles.mobileTournamentMarkets}>
      <View style={styles.mobileTournamentMarketsHeader}>
        <View>
          <Text style={styles.proMobileSectionEyebrow}>TOURNAMENT MARKET</Text>
          <Text style={styles.mobileTournamentMarketsTitle}>
            Who wins it all?
          </Text>
        </View>
        <Text style={styles.mobileTournamentMarketsBadge}>FREE CREDITS</Text>
      </View>
      {markets.slice(0, 12).map((market, index) => {
        const entry = event.winnerPrediction.entries[index];
        if (!entry) return null;
        const first = market.history[0]?.yesPriceBps ?? market.yesPriceBps;
        const change = (market.yesPriceBps - first) / 100;
        return (
          <Pressable
            key={market.id}
            onPress={() => onOpen(market, entry.externalTeamId)}
            style={({ pressed }) => [
              styles.mobileTournamentMarketRow,
              pressed && styles.proMobilePressed,
            ]}
          >
            <View style={styles.mobileTournamentMarketCopy}>
              <Text numberOfLines={1} style={styles.mobileTournamentMarketName}>
                {countryFlag(entry.countryCode)} {entry.label}
              </Text>
              <View style={styles.mobileTournamentMarketTrack}>
                <View
                  style={[
                    styles.mobileTournamentMarketFill,
                    { width: `${market.yesPriceBps / 100}%` },
                  ]}
                />
              </View>
            </View>
            <View style={styles.mobileTournamentMarketPriceBlock}>
              <Text style={styles.mobileTournamentMarketPrice}>
                {mobilePredictionPercent(market.yesPriceBps)}
              </Text>
              <Text
                style={[
                  styles.mobileTournamentMarketChange,
                  change < 0 && styles.mobileTournamentMarketChangeDown,
                ]}
              >
                {change === 0
                  ? "—"
                  : `${change > 0 ? "+" : ""}${change.toFixed(1)}`}
              </Text>
            </View>
            <Text style={styles.mobileTournamentMarketArrow}>›</Text>
          </Pressable>
        );
      })}
      <Text style={styles.mobileTournamentMarketsFootnote}>
        Buy a team to win or not win. One credit-funded order book per team.
      </Text>
    </View>
  );
}
