import { formatMoney } from "@duna/core";
import { demoWalletEntries } from "@duna/core/demo";
import * as WebBrowser from "expo-web-browser";
import { Linking, Platform, Pressable, ScrollView, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { dunaWebUrl } from "../../../mobile-api";
import { usePlayerRuntime } from "../../../runtime";
import { DunaIcon } from "../../../duna-icon";
import { SatoshiText as Text } from "../../../satoshi-text";
import { DunaWordmark } from "../../app/brand";
import { colors, rgba } from "../../shared/palette";
import { Pill } from "../../shared/Pill";
import { SectionHeader } from "../../shared/SectionHeader";
import { styles } from "../../legacy/styles";

export function WalletScreen({ onClose }: { readonly onClose: () => void }) {
  const {
    client,
    memberCard,
    mode,
    organizationWallets,
    paymentSchedules,
    settings,
    wallet,
  } = usePlayerRuntime();
  const entries = wallet?.entries ?? demoWalletEntries;
  const balance =
    wallet?.availableMinor ??
    entries.reduce((sum, entry) => sum + entry.amount.amountMinor, 0);
  const appleWalletReady =
    Platform.OS === "ios" &&
    mode === "live" &&
    Boolean(client) &&
    memberCard?.walletStatus === "available";
  return (
    <ScrollView
      contentContainerStyle={styles.screenContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.walletBackRow}>
        <Pressable
          accessibilityLabel="Back to profile"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.walletBackButton}
        >
          <DunaIcon color={colors.aqua} name="arrow-left" size={20} />
          <Text style={styles.walletBackText}>Back</Text>
        </Pressable>
      </View>
      <Text style={styles.walletEyebrow}>
        MEMBERSHIP + STRIPE-MANAGED BALANCE
      </Text>
      <Text style={styles.displayTitle}>Wallet.</Text>
      {memberCard && (
        <View style={styles.memberCard}>
          <View pointerEvents="none" style={styles.memberCardGlowOne} />
          <View pointerEvents="none" style={styles.memberCardGlowTwo} />
          <View pointerEvents="none" style={styles.memberCardTexture} />
          <View style={styles.walletTop}>
            <DunaWordmark tone="light" />
            <Pill tone="positive">Member</Pill>
          </View>
          <Text style={styles.memberCardLabel}>DUNA MEMBERSHIP</Text>
          <Text style={styles.memberCardName}>{memberCard.holderName}</Text>
          <View style={styles.memberCardBody}>
            <View style={styles.memberCardQr}>
              <QRCode
                backgroundColor="#ffffff"
                color="#123640"
                quietZone={5}
                size={118}
                value={memberCard.credentialPayload}
              />
            </View>
            <View style={styles.memberCardDetails}>
              <Text style={styles.memberCardDetailLabel}>MEMBER ID</Text>
              <Text selectable style={styles.memberCardId}>
                {memberCard.memberId}
              </Text>
              <Text style={styles.memberCardDetailLabel}>
                UNIVERSAL CHECK-IN
              </Text>
              <Text style={styles.memberCardMeta}>
                Use this QR for any event, match, or court reservation where you
                are confirmed.
              </Text>
            </View>
          </View>
          {memberCard.upcoming[0] && (
            <View style={styles.memberCardUpcoming}>
              <View style={styles.flex}>
                <Text style={styles.memberCardDetailLabel}>UP NEXT</Text>
                <Text style={styles.memberCardUpcomingTitle}>
                  {memberCard.upcoming[0].title}
                </Text>
                <Text style={styles.memberCardMeta}>
                  {new Date(memberCard.upcoming[0].startsAt).toLocaleString(
                    "en-US",
                    {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    },
                  )}{" "}
                  · {memberCard.upcoming[0].venueName}
                </Text>
              </View>
              <Text style={styles.memberCardUpcomingArrow}>›</Text>
            </View>
          )}
          <Pressable
            disabled={!appleWalletReady}
            onPress={() => {
              if (!client) return;
              void client.player.memberCard
                .query()
                .then((fresh) =>
                  fresh.walletPassPath
                    ? Linking.openURL(`${dunaWebUrl}${fresh.walletPassPath}`)
                    : undefined,
                );
            }}
            style={[
              styles.memberCardWalletButton,
              !appleWalletReady && styles.buttonDisabled,
            ]}
          >
            <Text style={styles.memberCardWalletButtonText}>
              {Platform.OS !== "ios"
                ? "Open Duna on iPhone to add to Apple Wallet"
                : memberCard.walletStatus === "available"
                  ? "Add Duna Membership to Apple Wallet"
                  : "Apple Wallet setup is being completed"}
            </Text>
          </Pressable>
          <View style={styles.walletWave} />
        </View>
      )}
      <View style={styles.walletCard}>
        <View style={styles.walletTop}>
          <DunaWordmark />
          <Pill tone={wallet?.pendingMinor ? "warning" : "positive"}>
            {wallet?.pendingMinor ? "Pending" : "Ready"}
          </Pill>
        </View>
        <Text style={styles.walletLabel}>AVAILABLE BALANCE</Text>
        <Text style={styles.walletBalance}>
          {formatMoney(balance, wallet?.currency ?? "USD")}
        </Text>
        <Text style={styles.walletMeta}>
          Held and moved by Stripe · Duna is not a bank
        </Text>
        <View style={styles.walletActions}>
          <Pressable
            disabled={mode === "preview"}
            onPress={() =>
              void WebBrowser.openBrowserAsync(`${dunaWebUrl}/app/wallet`)
            }
          >
            <Text style={styles.walletActionText}>Add money</Text>
          </Pressable>
          <Pressable
            disabled={mode === "preview"}
            onPress={() =>
              void WebBrowser.openBrowserAsync(`${dunaWebUrl}/app/wallet`)
            }
          >
            <Text style={styles.walletActionText}>Withdraw</Text>
          </Pressable>
        </View>
        <View style={styles.walletWave} />
      </View>
      <View style={styles.walletInfoGrid}>
        <View>
          <Text style={styles.eyebrow}>MEMBERSHIP</Text>
          <Text style={styles.cardTitle}>
            {settings?.membership?.tierName ?? "Premium"}
          </Text>
          <Text style={styles.bodyText}>
            {settings?.membership
              ? `${settings.membership.status} · ${settings.membership.interval}`
              : "No active membership"}
          </Text>
        </View>
        <View>
          <Text style={styles.eyebrow}>PENDING</Text>
          <Text style={styles.cardTitle}>
            {formatMoney(wallet?.pendingMinor ?? 0, wallet?.currency ?? "USD")}
          </Text>
          <Text style={styles.bodyText}>Payment is still processing</Text>
        </View>
      </View>
      {organizationWallets && organizationWallets.length > 0 && (
        <>
          <SectionHeader
            action={`${organizationWallets.length} relationships`}
            eyebrow="CLUBS + COACHES"
            title="Memberships + credits."
          />
          <View style={styles.listCard}>
            {organizationWallets.map((organization) => (
              <View key={organization.organizationId} style={styles.walletRow}>
                <View style={styles.moneyDirection}>
                  <Text style={{ color: colors.aqua }}>
                    {organization.organizationName.slice(0, 1).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.flex}>
                  <Text style={styles.rowTitle}>
                    {organization.organizationName}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {organization.membershipName ??
                      organization.membershipStatus ??
                      "Player relationship"}
                  </Text>
                </View>
                <Text style={styles.moneyAmount}>
                  {organization.credits.toLocaleString("en-US")} credits
                </Text>
              </View>
            ))}
          </View>
        </>
      )}
      {paymentSchedules && paymentSchedules.length > 0 && (
        <>
          <SectionHeader
            action={`${paymentSchedules.length} active`}
            eyebrow="AUTOMATIC PAYMENTS"
            title="Payment schedules."
          />
          {paymentSchedules.map((schedule) => (
            <View key={schedule.id} style={styles.paymentScheduleCard}>
              <View style={styles.paymentScheduleHeader}>
                <View style={styles.flex}>
                  <Text style={styles.cardTitle}>{schedule.title}</Text>
                  <Text style={styles.rowMeta}>
                    {schedule.installmentCount} monthly payments ·{" "}
                    {schedule.status.replace("-", " ")}
                  </Text>
                </View>
                <Pill
                  tone={schedule.status === "past-due" ? "warning" : "positive"}
                >
                  {`${formatMoney(schedule.paidMinor, schedule.currency)} paid`}
                </Pill>
              </View>
              <View style={styles.paymentScheduleRows}>
                {schedule.installments.map((installment) => (
                  <View key={installment.id} style={styles.paymentScheduleRow}>
                    <View style={styles.flex}>
                      <Text style={styles.rowTitle}>
                        Payment {installment.sequence}
                      </Text>
                      <Text style={styles.rowMeta}>
                        {new Date(installment.dueAt).toLocaleDateString(
                          "en-US",
                          {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          },
                        )}
                      </Text>
                    </View>
                    <Text style={styles.paymentScheduleAmount}>
                      {formatMoney(installment.amountMinor, schedule.currency)}
                    </Text>
                    <Text
                      style={[
                        styles.paymentScheduleStatus,
                        installment.status === "paid" &&
                          styles.paymentScheduleStatusPaid,
                        installment.status === "failed" &&
                          styles.paymentScheduleStatusFailed,
                      ]}
                    >
                      {installment.status === "scheduled"
                        ? "Upcoming"
                        : installment.status}
                    </Text>
                  </View>
                ))}
              </View>
              <Text style={styles.paymentScheduleTotal}>
                {formatMoney(schedule.paidMinor, schedule.currency)} of{" "}
                {formatMoney(schedule.totalMinor, schedule.currency)} paid
              </Text>
            </View>
          ))}
        </>
      )}
      <SectionHeader
        eyebrow="YOUR MONEY ON SAND"
        title="Activity."
        action="View full"
        onAction={() =>
          void WebBrowser.openBrowserAsync(`${dunaWebUrl}/app/wallet`)
        }
      />
      <View style={styles.listCard}>
        {entries.slice(0, 10).map((entry) => (
          <View style={styles.walletRow} key={entry.id}>
            <View
              style={[
                styles.moneyDirection,
                {
                  backgroundColor:
                    entry.amount.amountMinor > 0
                      ? rgba(colors.positiveRgb, 0.1)
                      : rgba(colors.overlayRgb, 0.06),
                },
              ]}
            >
              <Text
                style={{
                  color:
                    entry.amount.amountMinor > 0
                      ? colors.positive
                      : colors.muted,
                }}
              >
                {entry.amount.amountMinor > 0 ? "↓" : "↑"}
              </Text>
            </View>
            <View style={styles.flex}>
              <Text style={styles.rowTitle}>{entry.description}</Text>
              <Text style={styles.rowMeta}>
                {new Date(entry.occurredAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}{" "}
                · {entry.status}
              </Text>
            </View>
            <Text
              style={[
                styles.moneyAmount,
                entry.amount.amountMinor > 0 && { color: colors.positive },
              ]}
            >
              {entry.amount.amountMinor > 0 ? "+" : ""}
              {formatMoney(entry.amount.amountMinor, entry.amount.currency)}
            </Text>
          </View>
        ))}
      </View>
      <View style={styles.trustNote}>
        <Text style={styles.trustIcon}>◇</Text>
        <Text style={styles.bodyText}>
          Your wallet is a Stripe-managed financial account. Duna shows the
          ledger and gives you clear controls; funds never sit on Duna’s balance
          sheet.
        </Text>
      </View>
    </ScrollView>
  );
}
