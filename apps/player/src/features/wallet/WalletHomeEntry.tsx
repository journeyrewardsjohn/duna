/**
 * Home's way into the wallet (WALLET-2): the first club card as a strip
 * (its art, mark, name and chip) and how many cards there are. Tapping the
 * strip opens the wallet on that card. Nothing shows until the person has
 * a club card: Home never nags.
 */
import { StyleSheet, View } from "react-native";
import { Text } from "@duna/ui/native";
import {
  MembershipCard,
  cardGeometry,
  type NativeWalletCard,
} from "@duna/ui/native/identity";
import { usePane } from "@duna/ui/native/layout";
import {
  assignWalletArt,
  clubSummaryCard,
  orderWalletCards,
} from "@duna/tideline-core";
import { useMemo } from "react";
import { usePlayerRuntime } from "../../../runtime";
import { useShell } from "../../app/ShellContext";
import { SectionHead } from "../../app/ui";
import { demoWallet } from "./wallet-demo";

export function WalletHomeEntry() {
  const shell = useShell();
  const pane = usePane();
  const { mode, organizationWallets, dashboard } = usePlayerRuntime();
  const cards = useMemo((): NativeWalletCard[] => {
    const summaries =
      mode === "preview"
        ? demoWallet(5, new Date()).clubs
        : (organizationWallets ?? []);
    const art = assignWalletArt(
      summaries.map((summary) => ({ id: summary.organizationId })),
    );
    return orderWalletCards(
      summaries.map((summary, index) => ({
        ...clubSummaryCard(summary),
        club: { name: summary.organizationName },
        art: art[index]!,
        member: dashboard?.player.displayName ?? "Noa Williams",
      })),
    );
  }, [dashboard?.player.displayName, mode, organizationWallets]);
  const first = cards[0];
  if (!first) return null;
  const width = cardGeometry(Math.max(320, pane.width || 0)).width;
  return (
    <View style={styles.block} testID="home-wallet">
      <SectionHead
        action="Wallet"
        onAction={() => shell.open("wallet")}
        title="Your cards"
      />
      <View style={styles.card}>
        <MembershipCard
          accessibilityHint="Opens your wallet on this card"
          accessibilityLabel={`${first.club.name} card. ${cards.length} card${cards.length === 1 ? "" : "s"} in your wallet`}
          card={first}
          onPress={() => shell.open("wallet", { targetId: first.id })}
          shadow={false}
          size="strip"
          width={width}
        />
      </View>
      {cards.length > 1 ? (
        <Text tone="text-2" variant="phone-meta">
          {`${cards.length} club cards · tap to show your pass`}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 8 },
  card: { alignItems: "center" },
});
