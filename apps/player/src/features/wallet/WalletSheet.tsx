/**
 * The selected club's sheet (spec §3, the web wallet's words): plan · price ·
 * renewal, the state banner, credits with expiry, up next here, member
 * benefits, activity, manage (end, cancel or resume through
 * `player.changeOrganizationMembership`, a person confirms; tier 2 when
 * money comes back) and the club page. Then "Your Duna balance": money,
 * payment schedules, Duna Plus and prediction credits.
 */
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from "react-native";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { formatMoney } from "@duna/core";
import { log, report } from "@duna/observability";
import {
  ButtonLoader,
  ErrorState,
  Icon,
  NotConfiguredState,
  Numerals,
  Text,
  useHaptics,
  useTheme,
  type GlyphName,
  type NativeColorRole,
} from "@duna/ui/native";
import { CardClubMark, type NativeWalletCard } from "@duna/ui/native/identity";
import { useState } from "react";
import { dunaWebUrl } from "../../../mobile-api";
import { usePlayerRuntime } from "../../../runtime";
import { useShell } from "../../app/ShellContext";
import { Card } from "../../app/ui";
import {
  refundLine,
  type ClubSheet,
  type MembershipManage,
  type SheetRow,
  type WalletModel,
} from "./wallet-model";

const BANNER: Record<
  NonNullable<ClubSheet["banner"]>["tone"],
  { readonly wash: NativeColorRole; readonly icon: GlyphName }
> = {
  paused: { wash: "warning-wash", icon: "timeout" },
  pending: { wash: "info-wash", icon: "clock" },
  expired: { wash: "danger-wash", icon: "alert" },
  ending: { wash: "attention-wash", icon: "info" },
  held: { wash: "info-wash", icon: "junior-guardian" },
};

function Label({ children }: { readonly children: string }) {
  return (
    <Text
      accessibilityRole="header"
      tone="text-2"
      variant="phone-meta"
      weight={600}
    >
      {children}
    </Text>
  );
}

function Rows({
  rows,
  empty,
  icon,
}: {
  readonly rows: readonly SheetRow[];
  readonly empty: string;
  readonly icon: GlyphName;
}) {
  const { tokens } = useTheme();
  if (rows.length === 0)
    return (
      <Text tone="text-2" variant="phone-meta">
        {empty}
      </Text>
    );
  return (
    <View style={{ gap: tokens.space["3"] }}>
      {rows.map((row) => (
        <View
          accessible
          accessibilityLabel={[row.title, row.detail, row.amount]
            .filter(Boolean)
            .join(", ")}
          key={row.id}
          style={styles.row}
        >
          <Icon name={icon} size="inline" tone="text-2" />
          <View style={styles.flex}>
            <Text variant="phone-body" weight={600}>
              {row.title}
            </Text>
            <Text tone="text-2" variant="phone-meta">
              {row.detail}
            </Text>
          </View>
          {row.amount ? (
            <Numerals family="ui" variant="phone-body" weight={600}>
              {row.amount}
            </Numerals>
          ) : null}
        </View>
      ))}
    </View>
  );
}

export function SheetButton({
  label,
  onPress,
  kind = "secondary",
  busy,
  icon,
  testID,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly kind?: "primary" | "secondary";
  readonly busy?: boolean;
  readonly icon?: GlyphName;
  readonly testID?: string;
}) {
  const { colors, tokens } = useTheme();
  const primary = kind === "primary";
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ busy: busy === true, disabled: busy === true }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          borderRadius: tokens.radius.lg,
          backgroundColor: primary ? colors.action : colors.surface,
          borderColor: primary ? colors.action : colors["line-strong"],
          opacity: pressed ? 0.86 : 1,
        },
      ]}
      testID={testID}
    >
      {busy ? (
        <ButtonLoader />
      ) : (
        <>
          {icon ? (
            <Icon
              name={icon}
              size="control"
              tone={primary ? "on-action" : "text"}
            />
          ) : null}
          <Text
            tone={primary ? "on-action" : "text"}
            variant="phone-body"
            weight={600}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

function ManageMembership({
  manage,
  clubName,
  onChanged,
}: {
  readonly manage: MembershipManage;
  readonly clubName: string;
  readonly onChanged: () => void;
}) {
  const { client } = usePlayerRuntime();
  const haptics = useHaptics();
  const [busy, setBusy] = useState(false);
  // One key per decision: a retry after a failure reuses it.
  const [key] = useState(() => Crypto.randomUUID());
  const perform = async (action: "cancel" | "resume", tier: 1 | 2) => {
    if (!client) return;
    setBusy(true);
    try {
      const result = await client.player.changeOrganizationMembership.mutate({
        membershipId: manage.membershipId,
        action,
        idempotencyKey: key,
      });
      log.info("player.wallet.membership_changed", { action });
      haptics.confirmed(tier);
      Alert.alert(
        action === "resume"
          ? "Automatic renewal resumed"
          : result.refundAmountMinor
            ? `Cancelled. A refund of ${formatMoney(result.refundAmountMinor, "USD")} was sent.`
            : manage.cancellationTiming === "period-end" && manage.periodEnd
              ? `Your membership ends ${manage.periodEnd}`
              : "Membership cancelled",
      );
      onChanged();
    } catch (error) {
      haptics.refused();
      const reference = report(error, {
        event: "player.wallet.membership_change_failed",
        tags: { action },
      });
      Alert.alert(
        action === "cancel"
          ? "The membership could not be cancelled. Nothing changed."
          : "The membership could not be resumed. Nothing changed.",
        `Reference ${reference}`,
      );
    } finally {
      setBusy(false);
    }
  };
  const cancel = () => {
    const now = manage.cancellationTiming === "immediate";
    const money = now && manage.refundBehavior !== "none";
    Alert.alert(
      now
        ? `Cancel your ${clubName} membership now?`
        : `End your ${clubName} membership?`,
      [
        now
          ? "Your membership and its pass end today."
          : manage.periodEnd
            ? `It stays active until ${manage.periodEnd}, then it does not renew.`
            : "It stays active until the end of the paid period, then it does not renew.",
        refundLine(manage),
      ].join("\n\n"),
      [
        { text: "Keep membership", style: "cancel" },
        {
          text: now ? "Cancel membership now" : "End membership at renewal",
          style: "destructive",
          onPress: () => void perform("cancel", money ? 2 : 1),
        },
      ],
    );
  };
  const resume = () =>
    Alert.alert(
      `Keep your ${clubName} membership?`,
      "It renews automatically again at the end of this period.",
      [
        { text: "Not now", style: "cancel" },
        { text: "Resume renewal", onPress: () => void perform("resume", 1) },
      ],
    );
  return manage.ending ? (
    <SheetButton
      busy={busy}
      label="Resume membership"
      onPress={resume}
      testID="wallet-resume"
    />
  ) : (
    <SheetButton
      busy={busy}
      label={
        manage.cancellationTiming === "immediate"
          ? "Cancel membership"
          : "End membership"
      }
      onPress={cancel}
      testID="wallet-cancel"
    />
  );
}

/** The Duna member credential's Apple Wallet pass (a real, signed endpoint). */
function AddToAppleWallet() {
  const { client } = usePlayerRuntime();
  const [busy, setBusy] = useState(false);
  if (Platform.OS !== "ios" || !client) return null;
  return (
    <SheetButton
      busy={busy}
      icon="wallet"
      label="Add Duna member pass to Apple Wallet"
      onPress={() => {
        setBusy(true);
        void client.player.memberCard
          .query()
          .then((fresh) =>
            fresh.walletPassPath
              ? Linking.openURL(`${dunaWebUrl}${fresh.walletPassPath}`)
              : Alert.alert(
                  "Apple Wallet is not set up yet",
                  "Your pass still works from this card.",
                ),
          )
          .catch((error: unknown) =>
            Alert.alert(
              "The pass could not be prepared",
              `Reference ${report(error, { event: "player.wallet.apple_pass_failed" })}`,
            ),
          )
          .finally(() => setBusy(false));
      }}
      testID="wallet-apple"
    />
  );
}

export function WalletSheet({
  card,
  sheet,
  flipped,
  appleWallet,
  onSection,
  onChanged,
}: {
  readonly card: NativeWalletCard;
  readonly sheet: ClubSheet;
  readonly flipped: boolean;
  readonly appleWallet: boolean;
  /** Where Benefits and Activity are, for the actions to scroll to. */
  readonly onSection: (section: "benefits" | "activity", y: number) => void;
  readonly onChanged: () => void;
}) {
  const shell = useShell();
  const { colors, tokens } = useTheme();
  const at = (section: "benefits" | "activity") => (event: LayoutChangeEvent) =>
    onSection(section, event.nativeEvent.layout.y);
  const banner = sheet.banner ? BANNER[sheet.banner.tone] : null;
  const showing =
    flipped && card.status !== "pending" && card.status !== "expired";
  return (
    <View style={{ gap: tokens.space["6"] }} testID="wallet-sheet">
      <View style={styles.head}>
        <CardClubMark club={card.club} size={40} />
        <View style={styles.flex}>
          <Text accessibilityRole="header" variant="phone-heading">
            {sheet.clubName}
          </Text>
          <Text tone="text-2" variant="phone-meta">
            {sheet.planLine}
          </Text>
        </View>
      </View>
      {showing ? (
        <Card>
          <Text variant="phone-body" weight={600}>
            Show this at the front desk
          </Text>
          <Text tone="text-2" variant="phone-meta">
            {card.pass?.code
              ? "The desk scans the code on the back of your card. It is your Duna member credential today; a code that changes every 30 seconds comes with club passes."
              : "This card has no code yet. The front desk can find you by name."}
          </Text>
          {appleWallet && card.pass?.code ? <AddToAppleWallet /> : null}
        </Card>
      ) : null}
      {sheet.banner && banner ? (
        <View
          style={[
            styles.banner,
            {
              backgroundColor: colors[banner.wash],
              borderRadius: tokens.radius.lg,
            },
          ]}
        >
          <View style={styles.row}>
            <Icon name={banner.icon} size="inline" />
            <Text style={styles.flex} variant="phone-meta">
              {sheet.banner.text}
            </Text>
          </View>
          {sheet.banner.action === "renew" ? (
            <SheetButton
              kind="primary"
              label="Renew membership"
              onPress={() => shell.openOrganization(sheet.clubSlug)}
            />
          ) : null}
        </View>
      ) : null}
      {sheet.credits ? (
        <View style={styles.section}>
          <Label>Credits here</Label>
          <View style={styles.credits}>
            <Numerals variant="figure-sm">
              {String(sheet.credits.count)}
            </Numerals>
            <Text style={styles.flex} tone="text-2" variant="phone-meta">
              {`credit${sheet.credits.count === 1 ? "" : "s"}${
                sheet.credits.expiry ? ` · ${sheet.credits.expiry}` : ""
              }`}
            </Text>
          </View>
        </View>
      ) : null}
      <View style={styles.section}>
        <Label>Up next here</Label>
        <Rows
          empty="Nothing booked here yet."
          icon="calendar"
          rows={sheet.upcoming}
        />
      </View>
      <View onLayout={at("benefits")} style={styles.section}>
        <Label>Member benefits</Label>
        <Text tone="text-2" variant="phone-meta">
          {`Your plan's benefits are on ${sheet.clubName}'s page.`}
        </Text>
        <Pressable
          accessibilityRole="link"
          hitSlop={10}
          onPress={() => shell.openOrganization(sheet.clubSlug)}
          style={styles.link}
        >
          <Text tone="link" variant="phone-meta" weight={600}>
            See benefits
          </Text>
        </Pressable>
      </View>
      <View onLayout={at("activity")} style={styles.section}>
        <Label>Activity</Label>
        <Rows empty="No sessions here yet." icon="check" rows={sheet.recent} />
      </View>
      <View style={styles.links}>
        {sheet.manage ? (
          <ManageMembership
            clubName={sheet.clubName}
            manage={sheet.manage}
            onChanged={onChanged}
          />
        ) : null}
        <SheetButton
          icon="venue"
          label="Club page"
          onPress={() => shell.openOrganization(sheet.clubSlug)}
        />
      </View>
    </View>
  );
}

/** "Your Duna balance": money (held by the payment provider), plans and credits. */
export function WalletBalance({ model }: { readonly model: WalletModel }) {
  const shell = useShell();
  const { tokens } = useTheme();
  const openWeb = () =>
    void WebBrowser.openBrowserAsync(`${dunaWebUrl}/app/wallet`);
  if (!model.money && !model.predictions && !model.dunaPlus) return null;
  return (
    <View style={{ gap: tokens.space["3"] }} testID="wallet-balance">
      <Text accessibilityRole="header" variant="phone-heading">
        Your Duna balance
      </Text>
      {model.money ? (
        <Card>
          {model.money.state === "ok" ? (
            <>
              <Label>Available</Label>
              <Numerals family="ui" variant="figure-sm">
                {model.money.data.available}
              </Numerals>
              <Text tone="text-2" variant="phone-meta">
                {`${model.money.data.pending} pending · the payment provider holds and moves it; Duna never holds your money`}
              </Text>
              <View style={styles.links}>
                <SheetButton label="Add money" onPress={openWeb} />
                <SheetButton label="Withdraw" onPress={openWeb} />
              </View>
              {model.money.data.schedules.length ? (
                <View style={styles.section}>
                  <Label>Payment plans</Label>
                  <Rows
                    empty=""
                    icon="schedule"
                    rows={model.money.data.schedules}
                  />
                </View>
              ) : null}
              <View style={styles.section}>
                <Label>Recent</Label>
                <Rows
                  empty="No money movement yet."
                  icon="pay"
                  rows={model.money.data.entries}
                />
              </View>
            </>
          ) : model.money.state === "error" ? (
            <ErrorState
              compact
              reference={model.money.reference}
              text="Your balance didn't load. Your money is safe."
              title="Balance didn't load"
            />
          ) : (
            <NotConfiguredState compact feature="Your Duna balance" />
          )}
        </Card>
      ) : null}
      {model.dunaPlus ? (
        <Card>
          <Label>Duna membership</Label>
          <Text variant="phone-body" weight={600}>
            {model.dunaPlus}
          </Text>
        </Card>
      ) : null}
      {model.predictions ? (
        <Card
          accessibilityHint="Opens your picks and markets"
          onPress={
            model.predictions.state === "ok"
              ? () => shell.open("predictions")
              : undefined
          }
        >
          {model.predictions.state === "ok" ? (
            <>
              <Label>Prediction credits</Label>
              <Numerals family="ui" variant="figure-sm">
                {model.predictions.data.credits}
              </Numerals>
              <Text tone="link" variant="phone-meta" weight={600}>
                Open your picks and markets
              </Text>
            </>
          ) : model.predictions.state === "error" ? (
            <ErrorState
              compact
              reference={model.predictions.reference}
              text="Your prediction credits didn't load."
              title="Predictions didn't load"
            />
          ) : (
            <NotConfiguredState compact feature="Prediction credits" />
          )}
        </Card>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, flexShrink: 1 },
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  section: { gap: 8 },
  banner: { padding: 14, gap: 12 },
  credits: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  link: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
  links: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  button: {
    minHeight: 48,
    paddingHorizontal: 16,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
});
