/**
 * Earnings, the money tab's root (M-R5; persona CH-6.n): what I earn, as
 * the backend says it.
 *
 * - How I'm paid, in the sentence HQ uses ("$40.00 per session"), with the
 *   worker classification exactly as the club set it (no commentary).
 * - This period so far: the income goal's `earned`, which the backend
 *   computes from delivered sessions (the phone computes no pay).
 * - My income goal with honest progress (the backend's figure, which may
 *   pass 100%); the owner may change it here.
 * - Past pay: my own line of each pay run, its sessions and hours, when
 *   the club lets me read runs; otherwise said plainly.
 * - The plain statement that Duna works pay out for the club's payroll and
 *   pays no one, and "Duna Pay payouts: not configured yet".
 * - The money tools the old Money tab had stay one tap away: Get paid
 *   (Tap to Pay for a lesson, payment links) and Club money (sales,
 *   payouts, refunds); and, for owners and managers, the club's pulse.
 *
 * On the open Duo and iPad the past pay runs sit in the second pane.
 */
import { createContext, useContext, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import {
  AdaptiveScaffold,
  LoadingState,
  Rise,
  Text,
  Title,
  useTheme,
} from "@duna/ui/native";
import type { ResolvedLayout } from "@duna/ui/native/layout";
import { useProRuntime } from "../../../runtime";
import { useShell } from "../../app/ShellContext";
import { PreviewNotice, TopBar } from "../../app/TopBar";
import { Card, Row, SectionHead } from "../../app/ui";
import { tabTitle } from "../../app/router";
import { NotOnTeam } from "../availability/AvailabilityScreen";
import {
  ChoiceChip,
  FailureView,
  FreshLine,
  PaneScroll,
  ToneChip,
  UndoToast,
} from "../availability/parts";
import { goalPeriods, type GoalPeriod } from "../availability/team-words";
import { MyTeamGate, type MyTeam } from "../availability/use-my-team";
import { ConfirmSheet } from "../session/ConfirmSheet";
import { DunaTextInput } from "../session/duna-text";
import { ActionButton, Notice } from "../session/parts";
import {
  DUNA_PAY_PAYOUTS,
  PAYROLL_STATEMENT,
  goalView,
  myPayLines,
  payHeadline,
  soFarLabel,
} from "./earnings-model";
import { useEarnings, type EarningsData } from "./use-earnings";

interface EarningsContextValue {
  readonly team: MyTeam | null;
  readonly data: EarningsData;
}

const EarningsContext = createContext<EarningsContextValue | null>(null);

function useEarningsContext(): EarningsContextValue {
  const value = useContext(EarningsContext);
  if (!value) throw new Error("Earnings parts need EarningsTabRoot");
  return value;
}

function EarningsProvider({
  team,
  children,
}: {
  readonly team: MyTeam | null;
  readonly children: ReactNode;
}) {
  const data = useEarnings(team);
  return (
    <EarningsContext.Provider value={{ team, data }}>
      {children}
    </EarningsContext.Provider>
  );
}

/**
 * The money tab's root: Earnings beside the selected route (or, with room
 * and nothing chosen, the past pay runs).
 */
export function EarningsTabRoot({
  layout,
  detail,
  sideBySide,
}: {
  readonly layout: ResolvedLayout;
  readonly detail: ReactNode;
  readonly sideBySide: boolean;
}) {
  return (
    <MyTeamGate>
      {(state) => (
        <EarningsProvider team={state.status === "ready" ? state.team : null}>
          <AdaptiveScaffold
            detail={detail}
            emptyDetail={sideBySide ? <EarningsSecondary /> : null}
            layout={layout}
            primary={<EarningsPrimary withPast={!sideBySide} />}
          />
        </EarningsProvider>
      )}
    </MyTeamGate>
  );
}

function EarningsPrimary({ withPast }: { readonly withPast: boolean }) {
  const shell = useShell();
  const { team, data } = useEarningsContext();
  const [toast, setToast] = useState<string | null>(null);
  return (
    <View style={styles.fill}>
      <PaneScroll gap={20} root testID="earnings-primary">
        <TopBar />
        <View style={styles.head}>
          <Title>{tabTitle("money", shell.audience)}</Title>
          <Text tone="text-2" variant="phone-meta">
            What you earn, and the money tools for lessons
          </Text>
          <PreviewNotice />
        </View>
        {team ? (
          <MyPay data={data} onToast={setToast} team={team} />
        ) : (
          <NotOnTeamInline />
        )}
        {team && withPast ? <PastPay data={data} team={team} /> : null}
        <Statement />
        <MoneyTools />
      </PaneScroll>
      <UndoToast onDismiss={() => setToast(null)} text={toast} />
    </View>
  );
}

function EarningsSecondary() {
  const { team, data } = useEarningsContext();
  return (
    <PaneScroll gap={16} root testID="earnings-secondary">
      {team ? <PastPay data={data} team={team} /> : <NotOnTeam />}
    </PaneScroll>
  );
}

function NotOnTeamInline() {
  return (
    <Notice
      text="Pay shows here for members of the club's team. Ask the owner or a manager to add you in Duna HQ with the email you sign in with."
      title="You're not on this club's team"
      tone="info"
      testID="earnings-not-on-team"
    />
  );
}

function MyPay({
  team,
  data,
  onToast,
}: {
  readonly team: MyTeam;
  readonly data: EarningsData;
  readonly onToast: (text: string) => void;
}) {
  const { colors, tokens } = useTheme();
  const [editing, setEditing] = useState(false);
  const load = data.compensation;
  if (load.status === "loading" && !load.data) {
    return (
      <LoadingState
        count={2}
        label="Loading your pay"
        loading
        skeleton="card"
      />
    );
  }
  if (!load.data) {
    return (
      <FailureView
        failure={load.failure ?? { kind: "error" }}
        onRetry={() => void load.reload()}
        what="your pay"
      />
    );
  }
  const page = load.data;
  const headline = payHeadline(page.current);
  const goal = page.goal ? goalView(page.goal) : null;
  return (
    <View style={styles.block} testID="earnings-my-pay">
      <FreshLine
        failure={load.failure}
        lastFreshAt={load.lastFreshAt}
        onRetry={() => void load.reload()}
        stale={load.stale}
      />
      <Card testID="earnings-pay-card">
        <Text tone="text-2" variant="phone-meta" weight={600}>
          How you're paid
        </Text>
        {headline.sentence ? (
          <Text testID="earnings-pay-sentence" variant="phone-title">
            {headline.sentence}
          </Text>
        ) : (
          <Text variant="phone-body">
            Your club hasn't set your pay in Duna yet.
          </Text>
        )}
        <Text tone="text-2" variant="phone-meta">
          {[headline.classification, headline.since]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      </Card>
      <Card testID="earnings-so-far">
        <Text tone="text-2" variant="phone-meta" weight={600}>
          {page.goal ? soFarLabel(page.goal.period) : "This period so far"}
        </Text>
        {goal ? (
          <Text
            tabular
            testID="earnings-so-far-amount"
            variant="display-sm"
            weight={600}
          >
            {goal.earned}
          </Text>
        ) : (
          <Text variant="phone-body">
            Your club's pay run shows what you earned each pay period.
          </Text>
        )}
        <Text tone="text-2" variant="phone-meta">
          {goal
            ? "Worked out by Duna from the sessions you've delivered so far. Your club's approved pay run is the final figure."
            : "Duna doesn't estimate pay on the phone. Your club's approved pay run is the final figure."}
        </Text>
      </Card>
      <Card testID="earnings-goal">
        <Text tone="text-2" variant="phone-meta" weight={600}>
          Income goal
        </Text>
        {goal ? (
          <>
            <View
              accessibilityLabel={goal.spoken}
              accessibilityRole="progressbar"
              accessibilityValue={{
                min: 0,
                max: 100,
                now: Math.round(goal.barPercent),
              }}
              accessible
              style={styles.block}
            >
              <Text variant="phone-body" weight={600}>
                {goal.line}
              </Text>
              <View
                style={[
                  styles.track,
                  {
                    backgroundColor: colors["surface-sunken"],
                    borderRadius: tokens.radius.sm,
                  },
                ]}
              >
                <Rise from="left" mode="grow" trigger={goal.barPercent}>
                  <View
                    style={[
                      styles.bar,
                      {
                        width: `${goal.barPercent}%`,
                        backgroundColor: colors.positive,
                        borderRadius: tokens.radius.sm,
                      },
                    ]}
                  />
                </Rise>
              </View>
              <Text tone="text-2" variant="phone-meta">
                {goal.progress}
              </Text>
            </View>
          </>
        ) : (
          <Text variant="phone-body">No income goal set.</Text>
        )}
        {team.ownsPay ? (
          <ActionButton
            icon="improve"
            label={goal ? "Change goal" : "Set a goal"}
            onPress={() => setEditing(true)}
            testID="earnings-goal-edit"
          />
        ) : (
          <Text tone="text-2" variant="phone-meta">
            Your club's owner sets income goals.
          </Text>
        )}
      </Card>
      <GoalSheet
        currency={
          page.goal?.target.currency ??
          page.current?.hourlyRate?.currency ??
          page.current?.perSessionRate?.currency ??
          "USD"
        }
        data={data}
        initialPeriod={page.goal?.period ?? "month"}
        onClose={() => setEditing(false)}
        onDone={() => onToast("Goal saved.")}
        visible={editing}
      />
    </View>
  );
}

function PastPay({
  team,
  data,
}: {
  readonly team: MyTeam;
  readonly data: EarningsData;
}) {
  const load = data.runs;
  const content = (() => {
    if (load.status === "loading" && !load.data) {
      return (
        <LoadingState
          count={2}
          label="Loading your pay runs"
          loading
          skeleton="row"
        />
      );
    }
    if (!load.data) {
      if (load.failure?.kind === "denied") {
        return (
          <Notice
            text="Today pay runs are shown to your club's managers. Ask them for your pay statement."
            title="Your pay runs aren't shown to you yet"
            tone="info"
            testID="earnings-runs-denied"
          />
        );
      }
      return (
        <FailureView
          failure={load.failure ?? { kind: "error" }}
          onRetry={() => void load.reload()}
          what="your pay runs"
        />
      );
    }
    const lines = myPayLines(load.data.runs, team.me.staffProfileId);
    if (lines.length === 0) {
      return (
        <Text tone="text-2" variant="phone-body">
          No pay runs with your sessions yet.
        </Text>
      );
    }
    return lines.slice(0, 12).map((line) => (
      <Card key={line.runId} testID={`earnings-line-${line.runId}`}>
        <View
          accessibilityLabel={line.spoken}
          accessible
          style={styles.lineHead}
        >
          <View style={styles.flex}>
            <Text variant="phone-body" weight={600}>
              {line.revision > 1
                ? `${line.period} · correction ${line.revision - 1}`
                : line.period}
            </Text>
            <Text tone="text-2" variant="phone-meta">
              {`${line.sessions} · ${line.hours} · ${line.method}`}
            </Text>
          </View>
          <Text tabular variant="phone-heading">
            {line.total}
          </Text>
        </View>
        <ToneChip copy={line.status} />
        {line.adjustments.length > 0 ? (
          <View style={styles.adjustments}>
            <Text tone="text-2" variant="phone-meta">
              {`Earned ${line.earnings}`}
            </Text>
            {line.adjustments.map((adjustment) => (
              <Text key={adjustment.label} tone="text-2" variant="phone-meta">
                {`${adjustment.label}: ${adjustment.amount}`}
              </Text>
            ))}
          </View>
        ) : null}
      </Card>
    ));
  })();
  return (
    <View style={styles.block} testID="earnings-past">
      <SectionHead title="Past pay" />
      {load.data ? (
        <FreshLine
          failure={load.failure}
          lastFreshAt={load.lastFreshAt}
          onRetry={() => void load.reload()}
          stale={load.stale}
        />
      ) : null}
      {content}
    </View>
  );
}

function Statement() {
  return (
    <Card testID="earnings-statement">
      <Text variant="phone-body">{PAYROLL_STATEMENT}</Text>
      <Text tone="text-2" variant="phone-meta" weight={600}>
        {DUNA_PAY_PAYOUTS}
      </Text>
    </Card>
  );
}

function MoneyTools() {
  const shell = useShell();
  const { dashboard } = useProRuntime();
  return (
    <View style={styles.block} testID="earnings-tools">
      <SectionHead title="Money tools" />
      <Row
        icon="tap-to-pay"
        onPress={() => shell.open("getPaid")}
        summary="Collect in person with Tap to Pay, or send a payment link"
        testID="earnings-get-paid"
        title="Get paid for a lesson"
      />
      <Row
        icon="wallet"
        onPress={() => shell.open("money")}
        summary="Sales, payouts, refunds and what is owed"
        testID="earnings-club-money"
        title="Club money"
      />
      {shell.audience === "owner" && dashboard?.metrics.length ? (
        <>
          <SectionHead title="Club pulse" />
          {dashboard.metrics.slice(0, 3).map((metric) => (
            <Row
              icon="improve"
              key={metric.label}
              summary={[metric.label, metric.change]
                .filter(Boolean)
                .join(" · ")}
              title={metric.value}
            />
          ))}
        </>
      ) : null}
    </View>
  );
}

/** The owner changes a goal: amount and period, reviewed first. */
function GoalSheet({
  visible,
  onClose,
  onDone,
  data,
  currency,
  initialPeriod,
}: {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly onDone: () => void;
  readonly data: EarningsData;
  readonly currency: string;
  readonly initialPeriod: GoalPeriod;
}) {
  const [amount, setAmount] = useState("");
  const [period, setPeriod] = useState<GoalPeriod>(initialPeriod);
  const minor = Math.round(Number(amount.replace(/[^\d.]/g, "")) * 100);
  const ready = Number.isFinite(minor) && minor > 0;
  return (
    <ConfirmSheet
      description="Progress counts the sessions you deliver in each period."
      event="pro.earnings.goal_failed"
      notReadyHint="Enter an amount above zero."
      onClose={onClose}
      onDone={onDone}
      perform={() => data.setGoal({ amountMinor: minor, currency, period })}
      ready={ready}
      testID="earnings-goal-sheet"
      tier={1}
      title="Income goal"
      verb="Save goal"
      visible={visible}
    >
      <View style={styles.block}>
        <Text variant="phone-meta" weight={600}>
          {`Amount (${currency})`}
        </Text>
        <DunaTextInput
          accessibilityLabel={`Goal amount in ${currency}`}
          inputMode="decimal"
          keyboardType="decimal-pad"
          onChangeText={setAmount}
          placeholder="1200"
          testID="earnings-goal-amount"
          value={amount}
        />
        <View style={styles.chips}>
          {goalPeriods.map((item) => (
            <ChoiceChip
              key={item.value}
              label={item.label}
              onPress={() => setPeriod(item.value)}
              selected={period === item.value}
            />
          ))}
        </View>
      </View>
    </ConfirmSheet>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1, gap: 2 },
  head: { gap: 4, paddingTop: 4 },
  block: { gap: 10 },
  track: { height: 10, overflow: "hidden" },
  bar: { height: 10 },
  lineHead: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  adjustments: { gap: 2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
