import type { OrganizationMoneyWorkspace } from "@duna/api";
import * as Crypto from "expo-crypto";
import * as Haptics from "expo-haptics";
import { useMemo, useState } from "react";
import {
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { useProRuntime } from "./runtime";
import { SatoshiText as Text } from "./satoshi-text";

export interface MoneyScreenPalette {
  readonly canvas: string;
  readonly surface: string;
  readonly surfaceAlt: string;
  readonly border: string;
  readonly text: string;
  readonly muted: string;
  readonly accent: string;
  readonly onAccent: string;
  readonly positive: string;
  readonly warning: string;
  readonly danger: string;
  readonly navy: string;
}

function previewMoney(): OrganizationMoneyWorkspace {
  const now = new Date();
  const day = (offset: number) =>
    new Date(now.getTime() + offset * 86_400_000).toISOString();
  return {
    generatedAt: now.toISOString(),
    currency: "USD",
    balance: {
      totalMinor: 55_670,
      availableMinor: 17_910,
      heldMinor: 8_695,
      pendingMinor: 29_065,
      inTransitMinor: 24_800,
      nextReleaseAt: day(1),
      nextReleaseMinor: 8_695,
    },
    earnings: {
      grossMinor: 60_425,
      netMinor: 55_670,
      feesMinor: 4_755,
      refundsMinor: 0,
      points: Array.from({ length: 14 }, (_, index) => ({
        date: day(index - 13).slice(0, 10),
        grossMinor: index % 3 === 0 ? 8_000 + index * 100 : 2_500,
        netMinor: index % 3 === 0 ? 7_300 + index * 90 : 2_200,
      })),
    },
    connect: {
      accountId: "acct_preview",
      connected: true,
      chargesEnabled: true,
      payoutsEnabled: true,
      bankStatus: "connected",
      bankName: "First Sand Bank",
      bankLast4: "1842",
      stripeAvailableMinor: 26_605,
      stripePendingMinor: 29_065,
      stripeInstantAvailableMinor: 17_910,
      stripeReservedMinor: 0,
      stripePayoutInterval: "manual",
      earnings30d: {
        grossMinor: 60_425,
        netMinor: 55_670,
        feesMinor: 4_755,
        payoutsMinor: 24_800,
        points: Array.from({ length: 14 }, (_, index) => ({
          date: day(index - 13).slice(0, 10),
          grossMinor: index % 3 === 0 ? 8_000 + index * 100 : 2_500,
          netMinor: index % 3 === 0 ? 7_300 + index * 90 : 2_200,
        })),
      },
      bankAccounts: [
        {
          id: "ba_preview",
          type: "bank-account",
          name: "First Sand Bank",
          last4: "1842",
          currency: "USD",
          status: "connected",
          defaultForCurrency: true,
        },
      ],
      activity: [],
      disputes: [],
      requirementsDue: [],
      liveData: false,
      livemode: false,
    },
    settings: {
      payoutInterval: "weekly",
      weeklyPayoutDay: "friday",
      monthlyPayoutDay: 1,
      minimumPayoutMinor: 5_000,
      statementDescriptor: "BEACH ELITE",
      payoutStatementDescriptor: "DUNA BEACH ELITE",
      stripeSettingsStatus: "synced",
    },
    refundPolicies: [],
    transactions: [
      {
        id: "fund_preview_1",
        orderId: "91000000-0000-4000-8000-000000000001",
        description: "Performance membership",
        customerName: "Jordan Smith",
        grossMinor: 18_500,
        consumerFeeMinor: 0,
        processingFeeMinor: 590,
        organizationFeeMinor: 0,
        taxMinor: 0,
        netMinor: 17_910,
        refundedMinor: 0,
        currency: "USD",
        status: "available",
        policyName: "Non-refundable",
        availableAt: day(-1),
        occurredAt: day(-4),
        reconciled: true,
      },
      {
        id: "fund_preview_2",
        orderId: "91000000-0000-4000-8000-000000000002",
        description: "Sunset doubles training",
        customerName: "Maya Chen",
        grossMinor: 9_675,
        consumerFeeMinor: 675,
        processingFeeMinor: 305,
        organizationFeeMinor: 0,
        taxMinor: 0,
        netMinor: 8_695,
        refundedMinor: 0,
        currency: "USD",
        status: "held",
        policyName: "Flexible · 24 hours",
        availableAt: day(1),
        occurredAt: day(-2),
        reconciled: true,
      },
    ],
    payouts: [
      {
        id: "93000000-0000-4000-8000-000000000001",
        stripePayoutId: "po_preview",
        amountMinor: 24_800,
        currency: "USD",
        status: "in_transit",
        method: "standard",
        destinationName: "First Sand Bank",
        destinationLast4: "1842",
        expectedArrivalAt: day(1),
        createdAt: day(-1),
      },
    ],
    disputes: [],
  };
}

function money(value: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value / 100);
}

function when(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function graphPath(
  points: OrganizationMoneyWorkspace["earnings"]["points"],
): string {
  const maximum = Math.max(1, ...points.map((point) => point.netMinor));
  return points
    .map((point, index) => {
      const x = 8 + (index / Math.max(1, points.length - 1)) * 304;
      const y = 91 - (point.netMinor / maximum) * 76;
      return `${index ? "L" : "M"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

export function MoneyScreen({
  onClose,
  onCollect,
  palette,
}: {
  readonly onClose: () => void;
  readonly onCollect: () => void;
  readonly palette: MoneyScreenPalette;
}) {
  const {
    client,
    dashboard,
    mode,
    money: liveMoney,
    refresh,
  } = useProRuntime();
  const workspace = liveMoney ?? previewMoney();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string>();
  const account =
    workspace.connect.bankAccounts.find((item) => item.defaultForCurrency) ??
    workspace.connect.bankAccounts[0];
  const path = graphPath(workspace.earnings.points);

  const payout = async () => {
    if (mode !== "live" || !client) {
      setMessage("Preview mode cannot move money.");
      return;
    }
    setSubmitting(true);
    setMessage(undefined);
    try {
      await client.operator.createManualPayout.mutate({
        confirmed: true,
        idempotencyKey: Crypto.randomUUID(),
      });
      if (Platform.OS !== "web") {
        void Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        );
      }
      setMessage("Payout requested. Refund-protected funds stayed in Duna.");
      await refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Duna could not request this payout.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Close Money"
            onPress={onClose}
            style={styles.close}
          >
            <Text style={styles.closeText}>×</Text>
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>DUNA MONEY</Text>
            <Text style={styles.title}>Earned here. Ready when you are.</Text>
            <Text style={styles.subtitle}>
              {dashboard?.organization.name ?? "Your organization"} · balances,
              holds, payouts, and disputes
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Refresh Money"
            onPress={() => void refresh()}
            style={styles.refresh}
          >
            <Text style={styles.refreshText}>↻</Text>
          </Pressable>
        </View>

        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <Text style={styles.heroLabel}>AVAILABLE TO PAY OUT</Text>
            <View style={styles.livePill}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>
                {workspace.connect.liveData ? "LIVE" : "PREVIEW"}
              </Text>
            </View>
          </View>
          <Text style={styles.balance}>
            {money(workspace.balance.availableMinor, workspace.currency)}
          </Text>
          <Text style={styles.heroBody}>
            Cleared by Stripe and outside every refund or cancellation window.
          </Text>
          {workspace.balance.nextReleaseAt && (
            <View style={styles.release}>
              <Text style={styles.releaseIcon}>◷</Text>
              <Text style={styles.releaseText}>
                {money(workspace.balance.nextReleaseMinor, workspace.currency)}{" "}
                frees up {when(workspace.balance.nextReleaseAt)}
              </Text>
            </View>
          )}
          <Svg height="102" viewBox="0 0 320 100" width="100%">
            <Path
              d={path}
              fill="none"
              stroke={palette.positive}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="4"
            />
          </Svg>
          <View style={styles.heroFooter}>
            <View>
              <Text style={styles.metricLabel}>30-DAY NET</Text>
              <Text style={styles.metricValue}>
                {money(workspace.earnings.netMinor, workspace.currency)}
              </Text>
            </View>
            <View>
              <Text style={styles.metricLabel}>AT STRIPE</Text>
              <Text style={styles.metricValue}>
                {money(
                  workspace.connect.stripeAvailableMinor ?? 0,
                  workspace.currency,
                )}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable
            disabled={
              !workspace.connect.payoutsEnabled ||
              workspace.balance.availableMinor <= 0
            }
            onPress={() => setPayoutOpen(true)}
            style={({ pressed }) => [
              styles.actionPrimary,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.actionPrimaryIcon}>⇩</Text>
            <Text style={styles.actionPrimaryText}>Transfer to bank</Text>
          </Pressable>
          <Pressable
            onPress={onCollect}
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}
          >
            <Text style={styles.actionIcon}>)))</Text>
            <Text style={styles.actionText}>Collect payment</Text>
          </Pressable>
          <Pressable
            onPress={() => setCardOpen(true)}
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}
          >
            <Text style={styles.actionIcon}>▱</Text>
            <Text style={styles.actionText}>Virtual card</Text>
            <Text style={styles.soon}>SOON</Text>
          </Pressable>
        </View>

        <View style={styles.balanceGrid}>
          <View style={styles.balanceTile}>
            <Text style={styles.tileLabel}>DUNA BALANCE</Text>
            <Text style={styles.tileValue}>
              {money(workspace.balance.totalMinor, workspace.currency)}
            </Text>
            <Text style={styles.tileMeta}>All unpaid earnings</Text>
          </View>
          <View style={styles.balanceTile}>
            <Text style={styles.tileLabel}>REFUND HOLD</Text>
            <Text style={styles.tileValue}>
              {money(workspace.balance.heldMinor, workspace.currency)}
            </Text>
            <Text style={styles.tileMeta}>Protected until cutoff</Text>
          </View>
          <View style={styles.balanceTile}>
            <Text style={styles.tileLabel}>CLEARING</Text>
            <Text style={styles.tileValue}>
              {money(workspace.balance.pendingMinor, workspace.currency)}
            </Text>
            <Text style={styles.tileMeta}>Pending at Stripe</Text>
          </View>
          <View style={styles.balanceTile}>
            <Text style={styles.tileLabel}>TO BANK</Text>
            <Text style={styles.tileValue}>
              {money(workspace.balance.inTransitMinor, workspace.currency)}
            </Text>
            <Text style={styles.tileMeta}>Currently in transit</Text>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.eyebrow}>PAYOUT ACCOUNT</Text>
            <Text style={styles.sectionTitle}>
              {account ? "Your bank is connected." : "Connect a payout bank."}
            </Text>
          </View>
          <View
            style={[
              styles.status,
              workspace.connect.payoutsEnabled
                ? styles.statusReady
                : styles.statusWarning,
            ]}
          >
            <Text style={styles.statusText}>
              {workspace.connect.payoutsEnabled ? "READY" : "ACTION"}
            </Text>
          </View>
        </View>
        <View style={styles.bankCard}>
          <View style={styles.bankIcon}>
            <Text style={styles.bankIconText}>▰</Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.bankName}>
              {account
                ? `${account.name} •••• ${account.last4}`
                : "No payout destination"}
            </Text>
            <Text style={styles.bankMeta}>
              {account
                ? `${account.status} · ${account.currency ?? workspace.currency}`
                : "Stripe securely collects and verifies bank details"}
            </Text>
          </View>
          <Pressable
            disabled={!workspace.connect.settingsUrl}
            onPress={() =>
              workspace.connect.settingsUrl &&
              void Linking.openURL(workspace.connect.settingsUrl)
            }
          >
            <Text style={styles.manage}>MANAGE ↗</Text>
          </Pressable>
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.eyebrow}>RECENT ACTIVITY</Text>
            <Text style={styles.sectionTitle}>Every dollar has a story.</Text>
          </View>
          <Text style={styles.count}>{workspace.transactions.length}</Text>
        </View>
        <View style={styles.list}>
          {workspace.transactions.slice(0, 12).map((transaction) => (
            <View key={transaction.id} style={styles.row}>
              <View
                style={[
                  styles.rowIcon,
                  transaction.status === "held" && styles.rowIconHold,
                ]}
              >
                <Text style={styles.rowIconText}>
                  {transaction.status === "held" ? "◷" : "↓"}
                </Text>
              </View>
              <View style={styles.flex}>
                <Text numberOfLines={1} style={styles.rowTitle}>
                  {transaction.description}
                </Text>
                <Text numberOfLines={1} style={styles.rowMeta}>
                  {transaction.customerName} · {when(transaction.occurredAt)}
                </Text>
                <Text style={styles.rowFee}>
                  Fees + tax{" "}
                  {money(
                    transaction.processingFeeMinor +
                      transaction.organizationFeeMinor +
                      transaction.taxMinor,
                    transaction.currency,
                  )}
                </Text>
              </View>
              <View style={styles.rowAmount}>
                <Text style={styles.rowValue}>
                  +
                  {money(
                    Math.max(
                      0,
                      transaction.netMinor - transaction.refundedMinor,
                    ),
                    transaction.currency,
                  )}
                </Text>
                <Text
                  style={[
                    styles.rowStatus,
                    transaction.status === "held" && styles.rowStatusHold,
                  ]}
                >
                  {transaction.status.replaceAll("-", " ").toUpperCase()}
                </Text>
              </View>
            </View>
          ))}
          {!workspace.transactions.length && (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No transactions yet.</Text>
              <Text style={styles.emptyBody}>
                Stripe payments will appear with their fees, holds, and release
                timing.
              </Text>
            </View>
          )}
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.eyebrow}>TRUST + SAFETY</Text>
            <Text style={styles.sectionTitle}>
              {workspace.disputes.length
                ? `${workspace.disputes.length} disputes need review.`
                : "No open disputes."}
            </Text>
          </View>
          <Text style={styles.shield}>◇</Text>
        </View>
        <View style={styles.safetyCard}>
          <View>
            <Text style={styles.safetyLabel}>CARD CHARGES</Text>
            <Text style={styles.safetyValue}>
              {workspace.connect.chargesEnabled ? "Enabled" : "Action needed"}
            </Text>
          </View>
          <View>
            <Text style={styles.safetyLabel}>PAYOUTS</Text>
            <Text style={styles.safetyValue}>
              {workspace.connect.payoutsEnabled ? "Enabled" : "Action needed"}
            </Text>
          </View>
          <View>
            <Text style={styles.safetyLabel}>VERIFICATION</Text>
            <Text style={styles.safetyValue}>
              {workspace.connect.requirementsDue.length
                ? `${workspace.connect.requirementsDue.length} due`
                : "Current"}
            </Text>
          </View>
        </View>
      </ScrollView>

      <Modal
        animationType="slide"
        onRequestClose={() => setPayoutOpen(false)}
        presentationStyle="pageSheet"
        visible={payoutOpen}
      >
        <SafeAreaView edges={["top", "bottom"]} style={styles.modalSafe}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.eyebrow}>MOVE AVAILABLE FUNDS</Text>
              <Text style={styles.modalTitle}>Transfer to your bank.</Text>
            </View>
            <Pressable
              onPress={() => setPayoutOpen(false)}
              style={styles.close}
            >
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>
          <View style={styles.modalContent}>
            <Text style={styles.modalBody}>
              Only cleared, payout-eligible funds move. Refund holds and pending
              Stripe funds stay protected.
            </Text>
            <View style={styles.modalBank}>
              <Text style={styles.modalBankIcon}>▰</Text>
              <View style={styles.flex}>
                <Text style={styles.bankName}>
                  {account
                    ? `${account.name} •••• ${account.last4}`
                    : "No connected bank"}
                </Text>
                <Text style={styles.bankMeta}>Verified payout destination</Text>
              </View>
              <Text style={styles.check}>✓</Text>
            </View>
            <View style={styles.modalAmount}>
              <Text style={styles.tileLabel}>AVAILABLE NOW</Text>
              <Text style={styles.modalAmountValue}>
                {money(workspace.balance.availableMinor, workspace.currency)}
              </Text>
              <Text style={styles.tileMeta}>
                {money(
                  workspace.balance.heldMinor + workspace.balance.pendingMinor,
                  workspace.currency,
                )}{" "}
                remains held or clearing
              </Text>
            </View>
            {message && <Text style={styles.message}>{message}</Text>}
            <Pressable
              disabled={submitting || mode !== "live" || !account}
              onPress={() => void payout()}
              style={[
                styles.submit,
                (submitting || mode !== "live" || !account) && styles.disabled,
              ]}
            >
              <Text style={styles.submitText}>
                {submitting
                  ? "Requesting…"
                  : mode === "live"
                    ? "Confirm payout"
                    : "Preview only"}
              </Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>

      <Modal
        animationType="slide"
        onRequestClose={() => setCardOpen(false)}
        presentationStyle="pageSheet"
        visible={cardOpen}
      >
        <SafeAreaView edges={["top", "bottom"]} style={styles.modalSafe}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.eyebrow}>COMING SOON</Text>
              <Text style={styles.modalTitle}>
                A Duna balance you can spend.
              </Text>
            </View>
            <Pressable onPress={() => setCardOpen(false)} style={styles.close}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>
          <View style={styles.modalContent}>
            <View style={styles.virtualCard}>
              <Text style={styles.virtualBrand}>DUNA</Text>
              <Text style={styles.virtualNumber}>•••• •••• •••• 2028</Text>
              <Text style={styles.virtualName}>
                {(
                  dashboard?.organization.name ?? "DUNA ORGANIZATION"
                ).toUpperCase()}
              </Text>
            </View>
            <Text style={styles.modalBody}>
              This planned card will use only money actually held by Duna. It
              will not use or move the organization’s Stripe Connect balance.
            </Text>
            <View style={styles.notice}>
              <Text style={styles.noticeIcon}>◇</Text>
              <View style={styles.flex}>
                <Text style={styles.noticeTitle}>
                  No Stripe Issuing connection is active.
                </Text>
                <Text style={styles.noticeBody}>
                  This is a preview, not an application or usable card.
                </Text>
              </View>
            </View>
            <Pressable onPress={() => setCardOpen(false)} style={styles.submit}>
              <Text style={styles.submitText}>Got it</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function createStyles(colors: MoneyScreenPalette) {
  return StyleSheet.create({
    safe: { backgroundColor: colors.canvas, flex: 1 },
    content: { gap: 18, paddingBottom: 44, paddingHorizontal: 18 },
    header: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: 12,
      paddingTop: 8,
    },
    close: {
      alignItems: "center",
      borderColor: colors.border,
      borderRadius: 12,
      borderWidth: 1,
      height: 40,
      justifyContent: "center",
      width: 40,
    },
    closeText: { color: colors.text, fontSize: 25, lineHeight: 27 },
    headerCopy: { flex: 1, minWidth: 0 },
    eyebrow: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 1.35,
    },
    title: {
      color: colors.text,
      fontSize: 27,
      fontWeight: "900",
      letterSpacing: -0.9,
      lineHeight: 30,
      marginTop: 5,
    },
    subtitle: {
      color: colors.muted,
      fontSize: 12,
      lineHeight: 17,
      marginTop: 5,
    },
    refresh: {
      alignItems: "center",
      height: 40,
      justifyContent: "center",
      width: 36,
    },
    refreshText: { color: colors.accent, fontSize: 22 },
    hero: {
      backgroundColor: colors.navy,
      borderColor: colors.border,
      borderRadius: 22,
      borderWidth: 1,
      overflow: "hidden",
      padding: 20,
    },
    heroTop: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    heroLabel: {
      color: "#b6c8d2",
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 1.4,
    },
    livePill: {
      alignItems: "center",
      backgroundColor: "rgba(105,220,158,0.12)",
      borderRadius: 999,
      flexDirection: "row",
      gap: 6,
      paddingHorizontal: 9,
      paddingVertical: 6,
    },
    liveDot: {
      backgroundColor: colors.positive,
      borderRadius: 4,
      height: 6,
      width: 6,
    },
    liveText: {
      color: colors.positive,
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 1,
    },
    balance: {
      color: "#f7faf8",
      fontSize: 48,
      fontWeight: "900",
      letterSpacing: -2.2,
      lineHeight: 55,
      marginTop: 14,
    },
    heroBody: { color: "#b6c8d2", fontSize: 12, lineHeight: 17, maxWidth: 320 },
    release: {
      alignItems: "center",
      flexDirection: "row",
      gap: 7,
      marginTop: 12,
    },
    releaseIcon: { color: colors.positive, fontSize: 15 },
    releaseText: { color: "#c4ead5", flex: 1, fontSize: 12 },
    heroFooter: {
      borderTopColor: "rgba(255,255,255,0.1)",
      borderTopWidth: 1,
      flexDirection: "row",
      gap: 32,
      paddingTop: 14,
    },
    metricLabel: {
      color: "#91a8b5",
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 1.1,
    },
    metricValue: {
      color: "#f7faf8",
      fontSize: 15,
      fontWeight: "900",
      marginTop: 3,
    },
    actions: { flexDirection: "row", gap: 8 },
    actionPrimary: {
      alignItems: "center",
      backgroundColor: colors.accent,
      borderRadius: 14,
      flex: 1.25,
      gap: 5,
      justifyContent: "center",
      minHeight: 78,
      padding: 10,
    },
    action: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 14,
      borderWidth: 1,
      flex: 1,
      gap: 4,
      justifyContent: "center",
      minHeight: 78,
      padding: 8,
    },
    actionPrimaryIcon: {
      color: colors.onAccent,
      fontSize: 20,
      fontWeight: "900",
    },
    actionPrimaryText: {
      color: colors.onAccent,
      fontSize: 12,
      fontWeight: "900",
      textAlign: "center",
    },
    actionIcon: { color: colors.accent, fontSize: 18, fontWeight: "900" },
    actionText: {
      color: colors.text,
      fontSize: 12,
      fontWeight: "800",
      textAlign: "center",
    },
    soon: {
      color: colors.warning,
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 1,
    },
    pressed: { opacity: 0.72 },
    balanceGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    balanceTile: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 14,
      borderWidth: 1,
      minHeight: 94,
      padding: 12,
      width: "48.7%",
    },
    tileLabel: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 1,
    },
    tileValue: {
      color: colors.text,
      fontSize: 18,
      fontWeight: "900",
      marginTop: 8,
    },
    tileMeta: {
      color: colors.muted,
      fontSize: 12,
      lineHeight: 14,
      marginTop: 3,
    },
    sectionHeader: {
      alignItems: "flex-start",
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 5,
    },
    sectionTitle: {
      color: colors.text,
      fontSize: 20,
      fontWeight: "900",
      letterSpacing: -0.5,
      marginTop: 4,
    },
    status: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6 },
    statusReady: { backgroundColor: `${colors.positive}20` },
    statusWarning: { backgroundColor: `${colors.warning}20` },
    statusText: {
      color: colors.positive,
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 1,
    },
    bankCard: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 15,
      borderWidth: 1,
      flexDirection: "row",
      gap: 11,
      padding: 13,
    },
    bankIcon: {
      alignItems: "center",
      backgroundColor: colors.surfaceAlt,
      borderRadius: 11,
      height: 40,
      justifyContent: "center",
      width: 40,
    },
    bankIconText: { color: colors.accent, fontSize: 18 },
    bankName: { color: colors.text, fontSize: 13, fontWeight: "900" },
    bankMeta: { color: colors.muted, fontSize: 12, marginTop: 3 },
    manage: {
      color: colors.accent,
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 0.6,
    },
    flex: { flex: 1, minWidth: 0 },
    count: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: 999,
      color: colors.text,
      fontSize: 12,
      fontWeight: "900",
      minWidth: 28,
      paddingHorizontal: 8,
      paddingVertical: 6,
      textAlign: "center",
    },
    list: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 16,
      borderWidth: 1,
      overflow: "hidden",
    },
    row: {
      alignItems: "center",
      borderBottomColor: colors.border,
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 10,
      padding: 13,
    },
    rowIcon: {
      alignItems: "center",
      backgroundColor: `${colors.positive}18`,
      borderRadius: 10,
      height: 36,
      justifyContent: "center",
      width: 36,
    },
    rowIconHold: { backgroundColor: `${colors.warning}18` },
    rowIconText: { color: colors.accent, fontSize: 16, fontWeight: "900" },
    rowTitle: { color: colors.text, fontSize: 12, fontWeight: "900" },
    rowMeta: { color: colors.muted, fontSize: 12, marginTop: 3 },
    rowFee: { color: colors.muted, fontSize: 12, marginTop: 3 },
    rowAmount: { alignItems: "flex-end", maxWidth: 110 },
    rowValue: { color: colors.positive, fontSize: 12, fontWeight: "900" },
    rowStatus: {
      color: colors.positive,
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 0.7,
      marginTop: 5,
    },
    rowStatusHold: { color: colors.warning },
    empty: { padding: 20 },
    emptyTitle: { color: colors.text, fontSize: 13, fontWeight: "900" },
    emptyBody: {
      color: colors.muted,
      fontSize: 12,
      lineHeight: 16,
      marginTop: 4,
    },
    shield: { color: colors.positive, fontSize: 22 },
    safetyCard: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 15,
      borderWidth: 1,
      flexDirection: "row",
      justifyContent: "space-between",
      padding: 14,
    },
    safetyLabel: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 0.8,
    },
    safetyValue: {
      color: colors.text,
      fontSize: 12,
      fontWeight: "900",
      marginTop: 5,
    },
    modalSafe: { backgroundColor: colors.canvas, flex: 1 },
    modalHeader: {
      alignItems: "flex-start",
      borderBottomColor: colors.border,
      borderBottomWidth: 1,
      flexDirection: "row",
      justifyContent: "space-between",
      padding: 20,
    },
    modalTitle: {
      color: colors.text,
      fontSize: 25,
      fontWeight: "900",
      letterSpacing: -0.8,
      marginTop: 5,
    },
    modalContent: { gap: 18, padding: 20 },
    modalBody: { color: colors.muted, fontSize: 13, lineHeight: 19 },
    modalBank: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 15,
      borderWidth: 1,
      flexDirection: "row",
      gap: 11,
      padding: 15,
    },
    modalBankIcon: { color: colors.accent, fontSize: 20 },
    check: { color: colors.positive, fontSize: 18, fontWeight: "900" },
    modalAmount: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: 16,
      padding: 18,
    },
    modalAmountValue: {
      color: colors.text,
      fontSize: 38,
      fontWeight: "900",
      letterSpacing: -1.5,
      marginVertical: 7,
    },
    submit: {
      alignItems: "center",
      backgroundColor: colors.accent,
      borderRadius: 14,
      minHeight: 52,
      justifyContent: "center",
      padding: 14,
    },
    submitText: { color: colors.onAccent, fontSize: 13, fontWeight: "900" },
    disabled: { opacity: 0.45 },
    message: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: 12,
      color: colors.text,
      fontSize: 12,
      lineHeight: 16,
      padding: 12,
    },
    virtualCard: {
      backgroundColor: colors.navy,
      borderColor: "rgba(255,255,255,0.12)",
      borderRadius: 20,
      borderWidth: 1,
      height: 215,
      justifyContent: "space-between",
      padding: 20,
    },
    virtualBrand: {
      color: "#f7faf8",
      fontSize: 18,
      fontWeight: "900",
      letterSpacing: 2.5,
    },
    virtualNumber: {
      color: "#f7faf8",
      fontSize: 16,
      fontWeight: "800",
      letterSpacing: 2,
    },
    virtualName: {
      color: "#b6c8d2",
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 1.2,
    },
    notice: {
      alignItems: "flex-start",
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 14,
      borderWidth: 1,
      flexDirection: "row",
      gap: 10,
      padding: 14,
    },
    noticeIcon: { color: colors.positive, fontSize: 19 },
    noticeTitle: { color: colors.text, fontSize: 12, fontWeight: "900" },
    noticeBody: {
      color: colors.muted,
      fontSize: 12,
      lineHeight: 15,
      marginTop: 3,
    },
  });
}
