/**
 * Club money (M-R4, owner's point 11): what the club can pay out now, what
 * frees up and when, the 30-day net and its trend, then the money tools.
 *
 * The summary sits on Night Court in both themes (a money moment, the
 * owner's "grounds beyond Salt"), so every figure has real contrast
 * (`money-model.test.ts` checks the roles). Figures are Geist Mono. The
 * trend is one line on a baseline with its words for VoiceOver. Payout
 * keeps `operator.createManualPayout` behind the strong confirmation;
 * nothing here names the payment processor.
 */
import { useState } from "react";
import { Linking, StyleSheet, View } from "react-native";
import Svg, { Line, Path } from "react-native-svg";
import {
  Icon,
  Numerals,
  Rise,
  Text,
  ThemeOverride,
  useTheme,
} from "@duna/ui/native";
import { useLayout } from "@duna/ui/native/layout";
import type { OrganizationMoneyWorkspace } from "@duna/api";
import { useProRuntime } from "../../../runtime";
import { useShell } from "../../app/ShellContext";
import { SectionHead } from "../../app/ui";
import { formatMoney, formatMoneyDate } from "../../shared/money-format";
import { PaneScroll } from "../availability/parts";
import { ConfirmSheet } from "../session/ConfirmSheet";
import { ActionButton, Notice } from "../session/parts";
import {
  SALE_WORDS,
  moneySummary,
  netTrend,
  trendPath,
  type MoneySummary,
} from "./money-model";
import { previewMoney } from "./preview-money";

const TONE_ROLES = {
  neutral: { fill: "surface-sunken", ink: "text-2" },
  info: { fill: "info-wash", ink: "info" },
  positive: { fill: "positive-wash", ink: "positive" },
  warning: { fill: "warning-wash", ink: "warning" },
  attention: { fill: "attention-wash", ink: "attention" },
} as const;

export function ClubMoneyScreen() {
  const runtime = useProRuntime();
  const shell = useShell();
  const { tokens } = useTheme();
  const workspace: OrganizationMoneyWorkspace = runtime.money ?? previewMoney();
  const live = runtime.mode === "live" && Boolean(runtime.client);
  const timeZone = runtime.workspace?.organization.timezone;
  const summary = moneySummary(workspace, timeZone);
  const [payout, setPayout] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  return (
    <View style={styles.fill}>
      <PaneScroll gap={20} testID="club-money">
        <Rise>
          <ThemeOverride theme="dark">
            <SummaryCard summary={summary} workspace={workspace} />
          </ThemeOverride>
        </Rise>
        {done ? (
          <Rise trigger={done}>
            <Notice
              testID="money-payout-done"
              text="It usually reaches your bank in one to two business days."
              title={done}
              tone="positive"
            />
          </Rise>
        ) : null}
        <View style={styles.actions}>
          <ActionButton
            disabled={!summary.canPayOut}
            hint={!summary.canPayOut ? summary.availableNote : undefined}
            icon="wallet"
            kind="primary"
            label="Transfer to bank"
            onPress={() => setPayout(true)}
            style={styles.grow}
            testID="money-transfer"
          />
          <ActionButton
            icon="tap-to-pay"
            label="Collect a payment"
            onPress={() => shell.open("getPaid")}
            style={styles.grow}
            testID="money-collect"
          />
        </View>
        {summary.state !== "ready" ? (
          <Notice
            testID="money-duna-pay"
            text={
              summary.state === "not-set-up"
                ? "An owner sets it up in Duna HQ → Money → Duna Pay."
                : "An owner can see what's needed in Duna HQ → Money → Duna Pay."
            }
            title={summary.stateSentence}
            tone="warning"
          />
        ) : null}
        {!live ? (
          <Text tone="text-2" variant="phone-meta">
            Preview figures. Signed in, this shows your club's own money.
          </Text>
        ) : null}

        <View style={styles.section}>
          <SectionHead title="Where the rest is" />
          <Figures
            items={[
              { label: "On the way to your bank", value: summary.onTheWay },
              { label: "Held for refunds and disputes", value: summary.held },
              {
                label: "Clearing or waiting for sessions",
                value: summary.clearing,
              },
            ]}
          />
          <PayoutBank workspace={workspace} summary={summary} />
        </View>

        <View style={styles.section}>
          <SectionHead title="Recent sales" />
          {workspace.transactions.length ? (
            workspace.transactions.slice(0, 12).map((sale) => {
              const words = SALE_WORDS[sale.status];
              const tone = TONE_ROLES[words.tone];
              return (
                <View
                  accessibilityLabel={`${sale.description}, ${sale.customerName}, ${formatMoney(Math.max(0, sale.netMinor - sale.refundedMinor), sale.currency)} to the club, ${words.label}`}
                  accessible
                  key={sale.id}
                  style={styles.sale}
                >
                  <View style={styles.grow}>
                    <Text numberOfLines={1} variant="phone-body" weight={600}>
                      {sale.description}
                    </Text>
                    <Text numberOfLines={1} tone="text-2" variant="phone-meta">
                      {`${sale.customerName} · ${formatMoneyDate(sale.occurredAt, timeZone)}`}
                    </Text>
                  </View>
                  <View style={styles.saleEnd}>
                    <Numerals family="mono" variant="phone-body" weight={600}>
                      {formatMoney(
                        Math.max(0, sale.netMinor - sale.refundedMinor),
                        sale.currency,
                      )}
                    </Numerals>
                    <SaleChip
                      fill={tone.fill}
                      ink={tone.ink}
                      label={words.label}
                    />
                  </View>
                </View>
              );
            })
          ) : (
            <Text tone="text-2" variant="phone-meta">
              No sales yet. Payments show here with their fees and when they pay
              out.
            </Text>
          )}
        </View>

        {workspace.disputes.length ? (
          <Notice
            testID="money-disputes"
            text="Respond in Duna HQ → Money → Disputes before the deadline."
            title={`${workspace.disputes.length} ${workspace.disputes.length === 1 ? "dispute needs" : "disputes need"} a response`}
            tone="danger"
          />
        ) : null}
        <View style={{ height: tokens.space["4"] }} />
      </PaneScroll>
      <ConfirmSheet
        cancelLabel="Not now"
        description="Only money that has cleared and is outside every refund window moves. Held and clearing money stays with Duna Pay."
        event="pro.money.payout_failed"
        onClose={() => setPayout(false)}
        onDone={() =>
          setDone(`${summary.available} is on its way to ${summary.bank}`)
        }
        perform={async (key) => {
          if (!live || !runtime.client)
            throw Object.assign(new Error("Preview builds can't move money."), {
              data: { code: "PRECONDITION_FAILED" },
            });
          await runtime.client.operator.createManualPayout.mutate({
            confirmed: true,
            idempotencyKey: key,
          });
          await runtime.refresh();
        }}
        rows={[
          { label: "Amount", value: summary.available },
          { label: "To", value: summary.bank },
          {
            label: "Stays with Duna Pay",
            value: `${summary.held} held · ${summary.clearing} clearing`,
          },
        ]}
        testID="sheet-payout"
        tier={2}
        title="Transfer to your bank?"
        verb={`Transfer ${summary.available}`}
        visible={payout}
      />
    </View>
  );
}

function SummaryCard({
  summary,
  workspace,
}: {
  readonly summary: MoneySummary;
  readonly workspace: OrganizationMoneyWorkspace;
}) {
  const { colors, tokens } = useTheme();
  const layout = useLayout();
  const trend = netTrend(workspace.earnings.points, workspace.currency);
  const chartWidth = 280;
  const chartHeight = layout.widthClass === "compact" ? 56 : 72;
  return (
    <View
      style={[
        styles.summary,
        {
          backgroundColor: tokens.brand["night-court"],
          borderColor: colors.line,
          borderRadius: tokens.radius["2xl"],
        },
      ]}
      testID="money-summary"
    >
      <Text tone="text-2" variant="phone-meta" weight={600}>
        Ready to pay out
      </Text>
      <Numerals
        accessibilityLabel={`Ready to pay out: ${summary.available}`}
        adjustsFontSizeToFit
        numberOfLines={1}
        tone="text"
        variant="figure-xl"
      >
        {summary.available}
      </Numerals>
      <Text tone="text-2" variant="phone-meta">
        {summary.availableNote}
      </Text>
      {summary.freesUp ? (
        <View style={styles.inline}>
          <Icon name="clock" size="inline" tone="sun" />
          <Text
            style={{ color: tokens.brand.dune }}
            variant="phone-meta"
            weight={600}
          >
            {summary.freesUp}
          </Text>
        </View>
      ) : null}
      <View accessibilityLabel={trend.summary} accessible style={styles.chart}>
        {trend.empty ? (
          <Text tone="text-3" variant="phone-meta">
            {trend.summary}
          </Text>
        ) : (
          <Svg
            height={chartHeight}
            preserveAspectRatio="none"
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            width="100%"
          >
            <Line
              stroke={colors.line}
              strokeWidth={1}
              x1={0}
              x2={chartWidth}
              y1={chartHeight - 1}
              y2={chartHeight - 1}
            />
            <Path
              d={trendPath(trend, chartWidth, chartHeight)}
              fill="none"
              stroke={tokens.brand.dune}
              strokeLinejoin="round"
              strokeWidth={2}
            />
          </Svg>
        )}
      </View>
      <View
        style={[
          styles.summaryFoot,
          layout.fontScale >= 1.5 ? { flexDirection: "column" } : null,
        ]}
      >
        <View style={styles.grow}>
          <Text tone="text-2" variant="phone-meta">
            Net, last 30 days
          </Text>
          <Numerals tone="text" variant="figure-sm">
            {summary.net30}
          </Numerals>
        </View>
        <View style={styles.grow}>
          <Text tone="text-2" variant="phone-meta">
            On the way to your bank
          </Text>
          <Numerals tone="text" variant="figure-sm">
            {summary.onTheWay}
          </Numerals>
        </View>
      </View>
    </View>
  );
}

function Figures({
  items,
}: {
  readonly items: readonly { readonly label: string; readonly value: string }[];
}) {
  const { colors, tokens } = useTheme();
  return (
    <View
      style={[
        styles.figures,
        {
          backgroundColor: colors.surface,
          borderColor: colors.line,
          borderRadius: tokens.radius.xl,
        },
      ]}
    >
      {items.map((item) => (
        <View
          accessibilityLabel={`${item.label}: ${item.value}`}
          accessible
          key={item.label}
          style={styles.figureRow}
        >
          <Text style={styles.grow} tone="text-2" variant="phone-meta">
            {item.label}
          </Text>
          <Numerals variant="phone-body" weight={600}>
            {item.value}
          </Numerals>
        </View>
      ))}
    </View>
  );
}

function PayoutBank({
  workspace,
  summary,
}: {
  readonly workspace: OrganizationMoneyWorkspace;
  readonly summary: MoneySummary;
}) {
  const url = workspace.connect.settingsUrl;
  return (
    <View style={styles.sale}>
      <Icon name="wallet" size="control" tone="text-2" />
      <View style={styles.grow}>
        <Text numberOfLines={1} variant="phone-body" weight={600}>
          {workspace.connect.bankLast4 ? summary.bank : "No payout bank yet"}
        </Text>
        <Text numberOfLines={2} tone="text-2" variant="phone-meta">
          {workspace.connect.bankLast4
            ? workspace.connect.payoutsEnabled
              ? "Payouts are on"
              : "Payouts are paused"
            : "Add one in Duna HQ → Money → Duna Pay."}
        </Text>
      </View>
      {url ? (
        <ActionButton
          label="Manage"
          onPress={() => void Linking.openURL(url)}
          testID="money-manage-bank"
        />
      ) : null}
    </View>
  );
}

function SaleChip({
  label,
  fill,
  ink,
}: {
  readonly label: string;
  readonly fill: (typeof TONE_ROLES)[keyof typeof TONE_ROLES]["fill"];
  readonly ink: (typeof TONE_ROLES)[keyof typeof TONE_ROLES]["ink"];
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.chip, { backgroundColor: colors[fill] }]}>
      <Text
        maxFontSizeMultiplier={1.3}
        numberOfLines={1}
        tone={ink}
        variant="micro"
        weight={600}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flexGrow: 1, flexShrink: 1, minWidth: 0 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  section: { gap: 10 },
  summary: { padding: 20, gap: 8, borderWidth: StyleSheet.hairlineWidth },
  inline: { flexDirection: "row", alignItems: "center", gap: 6 },
  chart: { marginTop: 8, minHeight: 40, justifyContent: "center" },
  summaryFoot: { flexDirection: "row", gap: 16, marginTop: 8 },
  figures: { padding: 16, gap: 12, borderWidth: StyleSheet.hairlineWidth },
  figureRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  sale: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56 },
  saleEnd: { alignItems: "flex-end", gap: 4 },
  chip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
});
