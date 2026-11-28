/**
 * Player Home (M-P0, boards P-Home, P-Home-Dark, DUO-Open-Home, IPAD-Home,
 * DUO-Closed): the greeting and one-line conditions, what is next for this
 * player with its state, the primary actions, your game (the two-ring Sand
 * Rating), this week and anything that needs you. Data is the dashboard the
 * runtime already loads; nothing is invented (an empty block says so).
 *
 * Arrangements come from `layout-plan.ts`: one column on iPhone and the
 * closed Duo; "what now" beside "what's coming" on the open Duo and iPad at
 * half width; plus a third column for your game on a full iPad; and on the
 * Duo propped half-open, next up on the top pane with the actions on the
 * bottom pane.
 */
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import {
  demoBookings,
  demoEvents,
  demoMatches,
  demoPlayer,
} from "@duna/core/demo";
import {
  DunaMark,
  EmptyState,
  ErrorState,
  Icon,
  LoadingState,
  OfflineState,
  Rally,
  Rise,
  Text,
  Title,
  useHaptics,
  useTheme,
} from "@duna/ui/native";
import { ConditionsLine } from "@duna/ui/native/conditions";
import { usePane } from "@duna/ui/native/layout";
import { RatingRing } from "@duna/ui/native/score";
import { report } from "@duna/observability";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePlayerRuntime } from "../../../runtime";
import { useShell } from "../../app/ShellContext";
import { ShellStatus } from "../../app/ShellStatus";
import {
  Card,
  IconButton,
  Row,
  SectionHead,
  StatusChip,
  usePaneEdges,
} from "../../app/ui";
import type { HomeArrangement } from "../../app/layout-plan";
import {
  buildHomeModel,
  shiftPreviewSchedule,
  type HomeModel,
  type HomeNextUp,
} from "./home-model";
import type { HomeQuickAction } from "./home-quick-action";

const deviceTimeZone =
  Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

/** The four primary actions, in the board's order (P-Home quick actions). */
export const HOME_ACTIONS: readonly {
  readonly key: HomeQuickAction;
  readonly label: string;
  readonly icon: "court" | "ball" | "coach" | "film";
  readonly hint: string;
}[] = [
  {
    key: "book-court",
    label: "Book a court",
    icon: "court",
    hint: "Open times at your clubs and beaches",
  },
  {
    key: "find-match",
    label: "Find a game",
    icon: "ball",
    hint: "Open matches at your level",
  },
  {
    key: "find-coach",
    label: "Find a coach",
    icon: "coach",
    hint: "Lessons, clinics and coaches",
  },
  {
    key: "record-video",
    label: "Record",
    icon: "film",
    hint: "Film a game with Duna Vision",
  },
];

/** Home's data from the runtime, refreshed every minute for the countdown. */
export function useHomeModel(): {
  readonly model: HomeModel | null;
  readonly loading: boolean;
} {
  const { dashboard, mode, organizationWallets } = usePlayerRuntime();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const model = useMemo(() => {
    const preview = mode === "preview";
    if (!preview && !dashboard) return null;
    const player = dashboard?.player ?? demoPlayer;
    const bookings = preview
      ? shiftPreviewSchedule(demoBookings, now)
      : (dashboard?.bookings ?? []);
    const events = preview
      ? shiftPreviewSchedule(demoEvents, now)
      : (dashboard?.events ?? []);
    const club =
      organizationWallets?.find(
        (organization) =>
          organization.membershipStatus === "active" &&
          organization.status === "active",
      ) ?? organizationWallets?.[0];
    return buildHomeModel({
      player,
      bookings,
      events,
      recentMatches: preview ? demoMatches : (dashboard?.recentMatches ?? []),
      region:
        club?.organizationName ??
        bookings[0]?.venueName.split(/[—·]/)[0]?.trim(),
      now,
      timeZone: deviceTimeZone,
    });
  }, [dashboard, mode, now, organizationWallets]);
  return { model, loading: mode === "live" && !dashboard };
}

function HomeHeader({ model }: { readonly model: HomeModel }) {
  const shell = useShell();
  const { colors } = useTheme();
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityHint="Opens your profile"
        accessibilityLabel={`Your profile, ${model.firstName}`}
        accessibilityRole="button"
        onPress={() => shell.open("you")}
        style={[styles.avatar, { backgroundColor: colors.action }]}
      >
        <Text
          style={{ color: colors["on-action"] }}
          variant="phone-body"
          weight={600}
        >
          {model.initials}
        </Text>
      </Pressable>
      <View style={styles.headerActions}>
        <IconButton
          label="Ask Duna"
          onPress={() => shell.askDuna()}
          testID="home-ask-duna"
        >
          <DunaMark decorative size={20} />
        </IconButton>
        <IconButton
          badge={shell.unreadMessages}
          icon="message"
          label="Messages"
          onPress={() => shell.open("messages")}
        />
      </View>
    </View>
  );
}

function NextUpCard({
  nextUp,
  conditions,
  large = false,
}: {
  readonly nextUp: HomeNextUp;
  readonly conditions: HomeModel["conditions"];
  readonly large?: boolean;
}) {
  const shell = useShell();
  const { colors } = useTheme();
  const stateTone =
    nextUp.state === "confirmed"
      ? ({ tone: "positive", wash: "positive-wash", icon: "check" } as const)
      : nextUp.state === "waitlisted"
        ? ({ tone: "warning", wash: "warning-wash", icon: "clock" } as const)
        : ({
            tone: "attention",
            wash: "attention-wash",
            icon: "alert",
          } as const);
  const open = () =>
    nextUp.event
      ? shell.openEvent(nextUp.event)
      : shell.openBooking(nextUp.bookingId);
  return (
    <Card
      accessibilityHint="Opens the booking"
      accessibilityLabel={`Next up: ${nextUp.title}, ${nextUp.day}, ${nextUp.timeRange}, ${nextUp.place}. ${nextUp.stateLabel}. ${nextUp.countdown}.`}
      onPress={open}
      style={[styles.nextCard, { borderColor: colors["line-strong"] }]}
      testID="home-next-up"
    >
      <View style={styles.nextTop}>
        <StatusChip
          icon={stateTone.icon}
          label={nextUp.stateLabel}
          tone={stateTone.tone}
          wash={stateTone.wash}
        />
        <Text tabular tone="text-2" variant="phone-meta" weight={600}>
          {nextUp.countdown}
        </Text>
      </View>
      <View style={styles.nextBody}>
        <Text tone="text-2" variant="phone-meta">
          {nextUp.day}
        </Text>
        <Text
          family="ui"
          tabular
          variant={large ? "display-sm" : "figure-sm"}
          weight={600}
        >
          {nextUp.timeRange}
        </Text>
        <Text variant="phone-body" weight={600}>
          {nextUp.title}
        </Text>
        {nextUp.place ? (
          <Text tone="text-2" variant="phone-meta">
            {nextUp.place}
          </Text>
        ) : null}
      </View>
      {conditions ? (
        <View style={[styles.divider, { borderTopColor: colors.line }]}>
          <ConditionsLine
            conditions={conditions.hour}
            label={conditions.label}
            now={Date.now()}
            readAt={conditions.readAt}
            sun={conditions.sun}
            timeZone={conditions.timeZone}
          />
        </View>
      ) : null}
      {nextUp.people.length ? (
        <Text numberOfLines={2} tone="text-2" variant="phone-meta">
          {`With ${nextUp.people.slice(0, 4).join(", ")}`}
        </Text>
      ) : null}
    </Card>
  );
}

export function HomeActions({ columns }: { readonly columns?: 2 | 4 }) {
  const shell = useShell();
  // Four across when the pane has room (the open Duo, iPad), else two.
  const pane = usePane();
  const across = columns ?? (pane.width >= 560 ? 4 : 2);
  const haptics = useHaptics();
  const { colors, tokens } = useTheme();
  return (
    <View
      accessibilityLabel="Primary actions"
      accessibilityRole="menu"
      style={styles.actions}
    >
      <Rally>
        {HOME_ACTIONS.map((action) => (
          <Pressable
            accessibilityHint={action.hint}
            accessibilityLabel={action.label}
            accessibilityRole="button"
            key={action.key}
            onPress={() => {
              haptics.confirmed(1);
              shell.action(action.key);
            }}
            style={({ pressed }) => [
              styles.action,
              {
                flexBasis: across === 4 ? "22%" : "46%",
                backgroundColor: colors.surface,
                borderColor: colors.line,
                borderRadius: tokens.radius.xl,
              },
              pressed ? styles.pressed : null,
            ]}
          >
            <View
              style={[
                styles.actionIcon,
                { backgroundColor: colors["surface-sunken"] },
              ]}
            >
              <Icon name={action.icon} size="nav" />
            </View>
            <Text variant="phone-body" weight={600}>
              {action.label}
            </Text>
          </Pressable>
        ))}
      </Rally>
    </View>
  );
}

function NextUpBlock({
  model,
  large,
}: {
  readonly model: HomeModel;
  readonly large?: boolean;
}) {
  const shell = useShell();
  return (
    <View style={styles.block}>
      <SectionHead
        action="All plans"
        onAction={() => shell.open("plans")}
        title="Next up"
      />
      {model.nextUp ? (
        <Rise>
          <NextUpCard
            conditions={model.conditions}
            large={large}
            nextUp={model.nextUp}
          />
        </Rise>
      ) : (
        <EmptyState
          action={{
            label: "Find a game",
            onPress: () => shell.action("find-match"),
          }}
          compact
          text="Book a court or join a match and it shows up here."
          title="Nothing booked yet"
        />
      )}
    </View>
  );
}

/** Greeting, conditions, next up and the actions: "what now". */
export function HomeNow({
  model,
  withActions = true,
}: {
  readonly model: HomeModel;
  readonly withActions?: boolean;
}) {
  return (
    <View style={styles.column}>
      <HomeHeader model={model} />
      <View style={styles.greeting}>
        <Title>{model.greeting}</Title>
        <Text tone="text-2" variant="phone-meta">
          {model.dateLine}
        </Text>
        <ShellStatus />
      </View>
      <NextUpBlock model={model} />
      {withActions ? <HomeActions /> : null}
    </View>
  );
}

export function HomeGame({ model }: { readonly model: HomeModel }) {
  const shell = useShell();
  const { rating } = model;
  return (
    <View style={styles.block}>
      <SectionHead
        action="Results"
        onAction={() => shell.open("performance")}
        title="Your game"
      />
      <Card
        accessibilityHint="Opens your Sand Rating and results"
        onPress={() => shell.open("performance")}
        style={styles.gameCard}
      >
        <RatingRing
          delta={rating.delta}
          reliability={rating.reliability}
          size={96}
          value={rating.value}
        />
        <View style={styles.gameText}>
          <Text variant="phone-body" weight={600}>
            {rating.summary}
          </Text>
          {rating.form.length ? (
            <View
              accessibilityLabel={`Last ${rating.form.length}: ${rating.form
                .map((result) => (result === "W" ? "won" : "lost"))
                .join(", ")}`}
              accessible
              style={styles.form}
            >
              {rating.form.map((result, index) => (
                <StatusChip
                  key={index}
                  label={result}
                  tone={result === "W" ? "positive" : "text-2"}
                  wash={result === "W" ? "positive-wash" : "surface-sunken"}
                />
              ))}
            </View>
          ) : (
            <Text tone="text-2" variant="phone-meta">
              Confirmed results build your rating.
            </Text>
          )}
        </View>
      </Card>
    </View>
  );
}

/** Needs you and this week: "what's coming". */
export function HomeWeek({
  model,
  withGame = true,
}: {
  readonly model: HomeModel;
  readonly withGame?: boolean;
}) {
  const shell = useShell();
  const openItem = (item: HomeModel["week"][number]) => {
    if (item.event) shell.openEvent(item.event);
    else if (item.bookingId) shell.openBooking(item.bookingId);
  };
  return (
    <View style={styles.column}>
      {model.needsYou.length ? (
        <View style={styles.block}>
          <SectionHead title="Needs you" />
          {model.needsYou.map((item) => (
            <Row
              icon="alert"
              key={item.id}
              onPress={() => openItem(item)}
              summary={`${item.when} · ${item.meta}`}
              title={item.title}
            />
          ))}
        </View>
      ) : null}
      {withGame ? <HomeGame model={model} /> : null}
      <View style={styles.block}>
        <SectionHead
          action="Calendar"
          onAction={() => shell.open("plans")}
          title="This week"
        />
        {model.week.length ? (
          model.week.map((item) => (
            <Row
              icon={item.kind === "booking" ? "schedule" : "league"}
              key={item.id}
              onPress={() => openItem(item)}
              summary={[item.when, item.meta].filter(Boolean).join(" · ")}
              title={item.title}
              trailing={
                <StatusChip
                  label={item.badge}
                  tone={item.badge === "Register" ? "text" : "text-2"}
                />
              }
            />
          ))
        ) : (
          <EmptyState
            compact
            text="Clinics, leagues and events from your clubs show up here."
            title="A quiet week"
          />
        )}
      </View>
    </View>
  );
}

/** Pull to refresh with an honest error: Try again and a reference. */
function useHomeRefresh() {
  const runtime = usePlayerRuntime();
  const [refreshing, setRefreshing] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await runtime.refresh();
      setFailure(null);
    } catch (error) {
      setFailure(report(error, { event: "player.home.refresh_failed" }));
    } finally {
      setRefreshing(false);
    }
  }, [runtime]);
  return { refreshing, failure, refresh };
}

function HomeScroll({
  children,
  testID,
}: {
  readonly children: ReactNode;
  readonly testID?: string;
}) {
  const edges = usePaneEdges();
  const { colors, tokens } = useTheme();
  const runtime = usePlayerRuntime();
  const { refreshing, failure, refresh } = useHomeRefresh();
  return (
    <ScrollView
      contentContainerStyle={{
        paddingTop: edges.top + tokens.space["2"],
        paddingBottom: edges.bottom + tokens.space["8"],
        paddingLeft: edges.left + tokens.space["4"],
        paddingRight: edges.right + tokens.space["4"],
        gap: tokens.space["6"],
      }}
      refreshControl={
        <RefreshControl
          onRefresh={() => void refresh()}
          refreshing={refreshing}
          tintColor={colors["text-2"]}
        />
      }
      style={{ backgroundColor: colors.ground }}
      testID={testID}
    >
      {runtime.isOffline ? (
        <OfflineState
          compact
          lastFreshAt={
            runtime.lastSuccessfulSyncAt
              ? new Date(runtime.lastSuccessfulSyncAt)
              : null
          }
          onRetry={() => void refresh()}
        />
      ) : null}
      {failure ? (
        <ErrorState
          compact
          onRetry={() => void refresh()}
          reference={failure}
          text="Home could not refresh. What you see may be out of date."
          title="Couldn't refresh"
        />
      ) : null}
      {children}
    </ScrollView>
  );
}

/** Home as one pane's content for an arrangement. */
export function HomePrimary({
  arrangement,
}: {
  readonly arrangement: HomeArrangement;
}) {
  const { model, loading } = useHomeModel();
  return (
    <HomeScroll testID="home-primary">
      <LoadingState loading={loading} skeleton="card" count={2}>
        {model ? (
          arrangement === "stack" ? (
            <>
              <HomeNow model={model} />
              <HomeWeek model={model} />
            </>
          ) : (
            <HomeNow model={model} />
          )
        ) : null}
      </LoadingState>
    </HomeScroll>
  );
}

/** The second column: this week (and your game unless it has its own column). */
export function HomeSecondary({ withGame }: { readonly withGame: boolean }) {
  const { model, loading } = useHomeModel();
  return (
    <HomeScroll testID="home-secondary">
      <LoadingState loading={loading} skeleton="row" count={4}>
        {model ? <HomeWeek model={model} withGame={withGame} /> : null}
      </LoadingState>
    </HomeScroll>
  );
}

/** The third column on a full iPad: your game. */
export function HomeInspector() {
  const { model } = useHomeModel();
  return (
    <HomeScroll testID="home-inspector">
      {model ? <HomeGame model={model} /> : null}
    </HomeScroll>
  );
}

/** Half-open Duo, top pane: next up and its conditions, watched at a distance. */
export function HomeTabletopTop() {
  const { model } = useHomeModel();
  const edges = usePaneEdges();
  const { tokens } = useTheme();
  if (!model) return null;
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        paddingTop: edges.top,
        paddingHorizontal: tokens.space["6"],
        gap: tokens.space["3"],
      }}
    >
      <Title>{model.greeting}</Title>
      {model.nextUp ? (
        <NextUpCard conditions={model.conditions} large nextUp={model.nextUp} />
      ) : (
        <Text tone="text-2" variant="phone-body">
          Nothing booked yet.
        </Text>
      )}
    </View>
  );
}

/** Half-open Duo, bottom pane: the actions, for touch. */
export function HomeTabletopBottom() {
  const edges = usePaneEdges();
  const { tokens } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        paddingBottom: edges.bottom + tokens.space["10"],
        paddingHorizontal: tokens.space["6"],
      }}
    >
      <HomeActions columns={4} />
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: 24 },
  block: { gap: 8 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 48,
  },
  headerActions: { flexDirection: "row", gap: 8 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  greeting: { gap: 4 },
  nextCard: { borderWidth: 1 },
  nextTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    flexWrap: "wrap",
  },
  nextBody: { gap: 2 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  action: {
    flexGrow: 1,
    minHeight: 88,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 10,
    justifyContent: "space-between",
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { transform: [{ scale: 0.98 }], opacity: 0.86 },
  gameCard: { flexDirection: "row", alignItems: "center", gap: 16 },
  gameText: { flex: 1, gap: 8 },
  form: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
});
