import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { dunaWebUrl, type DunaApiClient } from "../../../mobile-api";
import type { PlayerRuntime } from "../../../runtime";
import {
  SatoshiText as Text,
  SatoshiTextInput as TextInput,
} from "../../../satoshi-text";
import type {
  MobilePredictionMarket,
  MobilePredictionTarget,
} from "./prediction-types";
import { displayError } from "../../shared/display-error";
import { selectionHaptic, successHaptic } from "../../shared/haptics";
import { mobilePredictionPercent } from "./prediction-format";
import { MobilePredictionChart } from "./MobilePredictionChart";
import { styles } from "../../legacy/styles";

export function MobilePredictionMarketSheet({
  client,
  market: initialMarket,
  onClose,
  onPlaced,
  target,
  wallet,
}: {
  readonly client?: DunaApiClient;
  readonly market: MobilePredictionMarket;
  readonly onClose: () => void;
  readonly onPlaced: () => Promise<void>;
  readonly target: MobilePredictionTarget;
  readonly wallet?: PlayerRuntime["predictionWallet"];
}) {
  const [market, setMarket] = useState(initialMarket);
  const [side, setSide] = useState<"yes" | "no">("yes");
  const [credits, setCredits] = useState("1");
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const available = Math.floor(wallet?.availableCredits ?? 0);
  const amount = Math.max(0, Number.parseInt(credits || "0", 10) || 0);
  const priceBps = side === "yes" ? market.yesPriceBps : market.noPriceBps;
  const selectedLabel = side === "yes" ? market.yesLabel : market.noLabel;
  const estimatedShares = amount / (priceBps / 10_000);
  const canSubmit =
    Boolean(client) &&
    market.status === "open" &&
    amount >= 1 &&
    amount <= available &&
    !busy;

  const reloadMarket = async () => {
    if (!client) return;
    const next =
      target.kind === "pro-match"
        ? await client.public.proMatchPredictionMarket.query({
            eventSlug: target.eventSlug,
            matchId: target.matchId,
          })
        : (
            await client.public.proEventPredictionMarkets.query({
              eventSlug: target.eventSlug,
            })
          ).find((candidate) => candidate.id === market.id);
    if (next) setMarket(next);
  };

  const placeOrder = async () => {
    if (!client || !canSubmit) return;
    setBusy(true);
    setMessage(undefined);
    try {
      const shared = {
        credits: amount,
        idempotencyKey: Crypto.randomUUID(),
        limitPriceBps: priceBps,
      };
      const result =
        target.kind === "pro-match"
          ? await client.player.placeProMatchPredictionOrder.mutate({
              ...shared,
              eventSlug: target.eventSlug,
              matchId: target.matchId,
              side: side === "yes" ? "A" : "B",
            })
          : await client.player.placeProEventTeamPredictionOrder.mutate({
              ...shared,
              eventSlug: target.eventSlug,
              externalTeamId: target.externalTeamId,
              side,
            });
      await Promise.all([onPlaced(), reloadMarket()]);
      setReviewing(false);
      setMessage(
        result.status === "filled"
          ? "Matched. Your immutable position is in the ledger."
          : "Placed in the order book. Unmatched credits stay reserved.",
      );
      successHaptic();
    } catch (reason) {
      setMessage(displayError(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible
    >
      <SafeAreaView edges={["top", "bottom"]} style={styles.modalSafe}>
        <View style={styles.mobilePredictionSheetHeader}>
          <View style={styles.flex}>
            <Text style={styles.mobilePredictionSheetEyebrow}>
              CROWD PREDICTION · NO CASH VALUE
            </Text>
            <Text numberOfLines={2} style={styles.mobilePredictionSheetTitle}>
              {market.title}
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Close prediction market"
            onPress={onClose}
            style={styles.proMobileHeaderButton}
          >
            <Text style={styles.proMobileHeaderCloseText}>×</Text>
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={styles.mobilePredictionSheetContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <MobilePredictionChart market={market} />
          <View style={styles.mobilePredictionTradeCard}>
            <View style={styles.mobilePredictionTradeBalanceRow}>
              <View>
                <Text style={styles.mobilePredictionTradeEyebrow}>
                  AVAILABLE
                </Text>
                <Text style={styles.mobilePredictionTradeBalance}>
                  {available.toLocaleString("en-US")} credits
                </Text>
              </View>
              <View
                style={[
                  styles.mobilePredictionStatusPill,
                  market.status !== "open" &&
                    styles.mobilePredictionStatusPillClosed,
                ]}
              >
                <Text style={styles.mobilePredictionStatusPillText}>
                  {market.status === "open"
                    ? "OPEN"
                    : market.status.toUpperCase()}
                </Text>
              </View>
            </View>
            <Text style={styles.mobilePredictionTradeLabel}>
              What do you think happens?
            </Text>
            <View style={styles.mobilePredictionSideGrid}>
              {(["yes", "no"] as const).map((option) => {
                const selected = side === option;
                const optionPrice =
                  option === "yes" ? market.yesPriceBps : market.noPriceBps;
                return (
                  <Pressable
                    accessibilityState={{ selected }}
                    key={option}
                    onPress={() => {
                      selectionHaptic();
                      setSide(option);
                      setReviewing(false);
                    }}
                    style={[
                      styles.mobilePredictionSideButton,
                      selected && styles.mobilePredictionSideButtonSelected,
                      selected &&
                        option === "no" &&
                        styles.mobilePredictionSideButtonSelectedNo,
                    ]}
                  >
                    <Text
                      numberOfLines={2}
                      style={[
                        styles.mobilePredictionSideLabel,
                        selected && styles.mobilePredictionSideLabelSelected,
                      ]}
                    >
                      {option === "yes" ? market.yesLabel : market.noLabel}
                    </Text>
                    <Text
                      style={[
                        styles.mobilePredictionSidePrice,
                        selected && styles.mobilePredictionSidePriceSelected,
                      ]}
                    >
                      {mobilePredictionPercent(optionPrice)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.mobilePredictionAmountHeader}>
              <Text style={styles.mobilePredictionTradeLabel}>Credits</Text>
              <Text style={styles.mobilePredictionAmountHint}>
                ≈{" "}
                {estimatedShares.toLocaleString("en-US", {
                  maximumFractionDigits: 1,
                })}{" "}
                shares if matched
              </Text>
            </View>
            <TextInput
              accessibilityLabel="Prediction credits to allocate"
              keyboardType="number-pad"
              onChangeText={(value) => {
                setCredits(value.replace(/[^0-9]/g, ""));
                setReviewing(false);
              }}
              style={styles.mobilePredictionAmountInput}
              value={credits}
            />
            <View style={styles.mobilePredictionQuickRow}>
              {[1, 5, 25].map((quickAmount) => (
                <Pressable
                  key={quickAmount}
                  onPress={() => {
                    selectionHaptic();
                    setCredits(String(Math.min(available, quickAmount)));
                    setReviewing(false);
                  }}
                  style={styles.mobilePredictionQuickButton}
                >
                  <Text style={styles.mobilePredictionQuickButtonText}>
                    +{quickAmount}
                  </Text>
                </Pressable>
              ))}
              <Pressable
                onPress={() => {
                  selectionHaptic();
                  setCredits(String(available));
                  setReviewing(false);
                }}
                style={styles.mobilePredictionQuickButton}
              >
                <Text style={styles.mobilePredictionQuickButtonText}>ALL</Text>
              </Pressable>
            </View>
            {amount > available && (
              <Text style={styles.formError}>
                You only have {available.toLocaleString("en-US")} credits
                available.
              </Text>
            )}
            {reviewing && (
              <View style={styles.mobilePredictionReviewCard}>
                <Text style={styles.mobilePredictionReviewEyebrow}>
                  FINAL REVIEW
                </Text>
                <Text style={styles.mobilePredictionReviewTitle}>
                  Allocate {amount.toLocaleString("en-US")} credits to{" "}
                  {selectedLabel}?
                </Text>
                <Text style={styles.mobilePredictionReviewBody}>
                  This order cannot be edited or withdrawn after confirmation.
                  It may fill immediately, partially, or remain open in the
                  order book.
                </Text>
              </View>
            )}
            {message && (
              <Text style={styles.mobilePredictionMessage}>{message}</Text>
            )}
            {!client || !market.viewer.authenticated ? (
              <Pressable
                onPress={() =>
                  void WebBrowser.openBrowserAsync(
                    `${dunaWebUrl}/sign-in?returnTo=${encodeURIComponent(`/events/${target.eventSlug}`)}`,
                  )
                }
                style={styles.mobilePredictionTradeButton}
              >
                <Text style={styles.mobilePredictionTradeButtonText}>
                  Sign in to predict
                </Text>
              </Pressable>
            ) : reviewing ? (
              <Pressable
                disabled={!canSubmit}
                onPress={() => void placeOrder()}
                style={[
                  styles.mobilePredictionTradeButton,
                  !canSubmit && styles.buttonDisabled,
                ]}
              >
                <Text style={styles.mobilePredictionTradeButtonText}>
                  {busy ? "Recording…" : "Confirm immutable position"}
                </Text>
              </Pressable>
            ) : (
              <Pressable
                disabled={!canSubmit}
                onPress={() => {
                  selectionHaptic();
                  setReviewing(true);
                }}
                style={[
                  styles.mobilePredictionTradeButton,
                  !canSubmit && styles.buttonDisabled,
                ]}
              >
                <Text style={styles.mobilePredictionTradeButtonText}>
                  Review position
                </Text>
              </Pressable>
            )}
            <Text style={styles.mobilePredictionTradeFootnote}>
              Prediction credits cannot be bought, transferred, redeemed, cashed
              out, or exchanged for prizes. Market prices are crowd signals, not
              odds.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
