/**
 * Time away (M-R5; persona CH-1.n): the two things the backend tells apart.
 *
 * - "I can't work" is a blackout: no approval. Saving marks the days at
 *   once and Duna lists each booked session in them for the club's
 *   managers as needing cover.
 * - "Ask for time off" is a request a manager decides (asked → approved or
 *   declined with a note; cancelled by me). Sessions are listed for cover
 *   when it is approved, so each one can also be put up for cover now.
 *
 * Whole local days in the club's time zone (the API takes instants; a
 * daylight-saving day is 23 or 25 hours). Before sending, the booked
 * sessions in those days are listed. Edits need a connection.
 */
import { Pressable, StyleSheet, View } from "react-native";
import {
  Icon,
  LoadingState,
  Text,
  useHaptics,
  useTheme,
} from "@duna/ui/native";
import { useRegionLayout } from "@duna/ui/native/layout";
import { DayStrip } from "@duna/ui/native/time";
import { localDateOf } from "@duna/scheduling";
import { useMemo, useState } from "react";
import { Card, SectionHead } from "../../app/ui";
import { AskCoverSheet } from "../cover/AskCoverSheet";
import { ConfirmSheet } from "../session/ConfirmSheet";
import { DunaTextInput } from "../session/duna-text";
import { ActionButton, Notice } from "../session/parts";
import { NotOnTeam } from "./AvailabilityScreen";
import {
  FailureView,
  FreshLine,
  PaneScroll,
  ToneChip,
  UndoToast,
} from "./parts";
import { dateSpanWords, localSpan, timeOffStatusCopy } from "./team-words";
import {
  useAvailability,
  type AvailabilityData,
  type BlackoutOut,
  type StaffPage,
  type TimeOffOut,
} from "./use-availability";
import { MyTeamGate, useMySessions, type MyTeam } from "./use-my-team";
import {
  nextRange,
  sessionWhenWords,
  sessionsInSpan,
  wholeDaySpan,
  type MySession,
} from "./week-model";

type Kind = "cant-work" | "time-off";

export function TimeAwayScreen() {
  return (
    <MyTeamGate>
      {(state) =>
        state.status === "ready" ? (
          <TimeAwayLoader team={state.team} />
        ) : (
          <NotOnTeam />
        )
      }
    </MyTeamGate>
  );
}

function TimeAwayLoader({ team }: { readonly team: MyTeam }) {
  const data = useAvailability(team);
  const sessions = useMySessions(team);
  if (data.load.status === "loading" && !data.load.data) {
    return (
      <PaneScroll testID="time-away-loading">
        <LoadingState
          count={3}
          label="Loading your time away"
          loading
          skeleton="row"
        />
      </PaneScroll>
    );
  }
  if (!data.load.data) {
    return (
      <PaneScroll testID="time-away-failed">
        <FailureView
          failure={data.load.failure ?? { kind: "error" }}
          onRetry={() => void data.load.reload()}
          what="your time away"
        />
      </PaneScroll>
    );
  }
  return (
    <TimeAwayReady
      data={data}
      page={data.load.data}
      sessions={sessions}
      team={team}
    />
  );
}

function TimeAwayReady({
  team,
  page,
  data,
  sessions,
}: {
  readonly team: MyTeam;
  readonly page: StaffPage;
  readonly data: AvailabilityData;
  readonly sessions: readonly MySession[];
}) {
  const { colors, tokens } = useTheme();
  const haptics = useHaptics();
  const region = useRegionLayout();
  const today = localDateOf(Date.now(), team.timeZone);
  const [kind, setKind] = useState<Kind>("cant-work");
  const [range, setRange] = useState<{
    from: string | null;
    to: string | null;
  }>({ from: null, to: null });
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);
  const [asking, setAsking] = useState<MySession | null>(null);
  const [cancelling, setCancelling] = useState<TimeOffOut | null>(null);
  const [removing, setRemoving] = useState<BlackoutOut | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const offline = data.load.stale && data.load.failure?.kind === "offline";

  const span = range.from
    ? wholeDaySpan(range.from, range.to ?? range.from, team.timeZone)
    : null;
  const affected = useMemo(
    () =>
      span ? sessionsInSpan(sessions, span, new Date().toISOString()) : [],
    [sessions, span?.startsAt, span?.endsAt],
  );
  const days = range.from
    ? dateSpanWords(range.from, range.to ?? range.from)
    : null;

  const chooser = (
    <View
      accessibilityLabel="What kind of time away"
      accessibilityRole="radiogroup"
      style={styles.kinds}
    >
      {(
        [
          {
            key: "cant-work",
            title: "I can't work",
            text: "No approval. Your booked sessions are listed for cover at once.",
            icon: "block",
          },
          {
            key: "time-off",
            title: "Ask for time off",
            text: "A manager decides. Sessions are listed for cover when it's approved.",
            icon: "schedule",
          },
        ] as const
      ).map((option) => {
        const selected = kind === option.key;
        return (
          <Pressable
            accessibilityHint={option.text}
            accessibilityLabel={option.title}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            key={option.key}
            onPress={() => {
              haptics.confirmed(0);
              setKind(option.key);
            }}
            style={({ pressed }) => [
              styles.kind,
              {
                backgroundColor: selected
                  ? colors["action-soft"]
                  : colors.surface,
                borderColor: selected ? colors.action : colors.line,
                borderRadius: tokens.radius.lg,
                opacity: pressed ? 0.86 : 1,
              },
            ]}
            testID={`time-away-kind-${option.key}`}
          >
            <Icon
              name={option.icon}
              size="control"
              tone={selected ? "action" : "text-2"}
            />
            <View style={styles.flex}>
              <Text variant="phone-body" weight={600}>
                {option.title}
              </Text>
              <Text tone="text-2" variant="phone-meta">
                {option.text}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );

  const picker = (
    <View style={styles.block}>
      <Text variant="phone-body" weight={600}>
        {days ? `Days away: ${days}` : "Tap the first day, then the last"}
      </Text>
      <DayStrip
        count={120}
        countLabel={() => ""}
        label="Days away"
        onValueChange={(date) =>
          setRange((current) => nextRange(current, date))
        }
        rangeEnd={range.to}
        start={today}
        testID="time-away-days"
        today={today}
        value={range.from}
      />
      <Text tone="text-2" variant="phone-meta">
        Whole days, in your club's local time.
      </Text>
      <View style={styles.field}>
        <Text variant="phone-meta" weight={600}>
          Reason (optional)
        </Text>
        <DunaTextInput
          accessibilityLabel="Reason, optional"
          maxLength={500}
          onChangeText={setReason}
          placeholder={
            kind === "time-off"
              ? "For the manager who decides"
              : "Your team can see this"
          }
          testID="time-away-reason"
          value={reason}
        />
      </View>
    </View>
  );

  const affectedBlock = range.from ? (
    <View style={styles.block} testID="time-away-affected">
      <SectionHead title="Booked sessions in these days" />
      {affected.length === 0 ? (
        <Notice
          text="Nothing you're booked to coach falls in these days."
          title="No booked sessions"
          tone="positive"
        />
      ) : (
        <>
          <Notice
            text={
              kind === "cant-work"
                ? "When you save, each one is listed for your club's managers as needing cover. They stay yours until someone is assigned."
                : "If your time off is approved, each one is listed for cover. You can ask for cover for any of them now."
            }
            title={`${affected.length} booked ${affected.length === 1 ? "session" : "sessions"}`}
            tone="warning"
          />
          {affected.map((session) => (
            <Card key={session.id} testID={`time-away-session-${session.id}`}>
              <View accessible style={styles.flex}>
                <Text variant="phone-body" weight={600}>
                  {session.title}
                </Text>
                <Text tone="text-2" variant="phone-meta">
                  {[sessionWhenWords(session, team.timeZone), session.venueName]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
              </View>
              {kind === "time-off" ? (
                <ActionButton
                  disabled={offline}
                  hint="Reviews the ask before it is posted"
                  icon="users"
                  label="Ask for cover"
                  onPress={() => setAsking(session)}
                  testID={`time-away-ask-cover-${session.id}`}
                />
              ) : null}
            </Card>
          ))}
        </>
      )}
      {offline ? (
        <Notice
          text="Sending needs a connection. Nothing is saved on this phone to send later."
          title="You're offline"
          tone="warning"
        />
      ) : null}
      <ActionButton
        disabled={offline || !span}
        hint="Reviews it before it is sent"
        icon="check"
        kind="primary"
        label={kind === "time-off" ? "Review and ask" : "Review and mark days"}
        onPress={() => setSending(true)}
        testID="time-away-review"
      />
    </View>
  ) : null;

  const timeOff = page.timeOff
    .filter((row) => Date.parse(row.endsAt) > Date.now() - 30 * 86_400_000)
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
  const blackouts = page.blackouts
    .filter((row) => Date.parse(row.endsAt) > Date.now())
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
  const spanWords = (row: { startsAt: string; endsAt: string }) => {
    const local = localSpan(row.startsAt, row.endsAt, team.timeZone);
    return dateSpanWords(local.from, local.to);
  };

  const lists = (
    <View style={styles.block}>
      <SectionHead title="Time off you asked for" />
      {timeOff.length === 0 ? (
        <Text tone="text-2" variant="phone-body">
          Nothing asked for.
        </Text>
      ) : (
        timeOff.map((row) => {
          const status = timeOffStatusCopy(row.status);
          const decided =
            row.status === "declined"
              ? `Declined${row.decidedBy ? ` by ${row.decidedBy.displayName}` : ""}${row.decisionNote ? `: ${row.decisionNote}` : ""}`
              : row.status === "approved"
                ? `Approved${row.decidedBy ? ` by ${row.decidedBy.displayName}` : ""}`
                : row.status === "requested"
                  ? "Waiting for a manager"
                  : "You cancelled this";
          return (
            <Card key={row.id} testID={`time-off-${row.id}`}>
              <View style={styles.rowHead}>
                <View accessible style={styles.flex}>
                  <Text variant="phone-body" weight={600}>
                    {spanWords(row)}
                  </Text>
                  <Text tone="text-2" variant="phone-meta">
                    {[row.reason, decided].filter(Boolean).join(" · ")}
                  </Text>
                  {row.sessionsNeedingCover > 0 &&
                  (row.status === "approved" || row.status === "requested") ? (
                    <Text tone="text-2" variant="phone-meta">
                      {`${row.sessionsNeedingCover} booked ${row.sessionsNeedingCover === 1 ? "session" : "sessions"} in these days`}
                    </Text>
                  ) : null}
                </View>
                <ToneChip copy={status} />
              </View>
              {row.status === "requested" || row.status === "approved" ? (
                <ActionButton
                  disabled={offline}
                  label={
                    row.status === "approved"
                      ? "Cancel this time off"
                      : "Withdraw the ask"
                  }
                  onPress={() => setCancelling(row)}
                  testID={`time-off-cancel-${row.id}`}
                />
              ) : null}
            </Card>
          );
        })
      )}
      <SectionHead title="Days you can't work" />
      {blackouts.length === 0 ? (
        <Text tone="text-2" variant="phone-body">
          None coming up.
        </Text>
      ) : (
        blackouts.map((row) => (
          <Card key={row.id} testID={`blackout-${row.id}`}>
            <View accessible style={styles.flex}>
              <Text variant="phone-body" weight={600}>
                {spanWords(row)}
              </Text>
              <Text tone="text-2" variant="phone-meta">
                {[
                  row.reason,
                  row.sessionsNeedingCover > 0
                    ? `${row.sessionsNeedingCover} ${row.sessionsNeedingCover === 1 ? "session needs" : "sessions need"} cover`
                    : undefined,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            </View>
            <ActionButton
              disabled={offline}
              label="Remove"
              onPress={() => setRemoving(row)}
              testID={`blackout-remove-${row.id}`}
            />
          </Card>
        ))
      )}
    </View>
  );

  const twoColumns =
    region.layout.paneCount >= 2 && region.layout.mode !== "tabletop";
  const fresh = (
    <FreshLine
      failure={data.load.failure}
      lastFreshAt={data.load.lastFreshAt}
      onRetry={() => void data.load.reload()}
      stale={data.load.stale}
    />
  );

  return (
    <View
      onLayout={region.onLayout}
      ref={region.ref}
      style={[styles.fill, { backgroundColor: colors.ground }]}
      testID="time-away-screen"
    >
      {twoColumns ? (
        <View style={styles.columns}>
          <View style={styles.fill}>
            <PaneScroll testID="time-away-new">
              {fresh}
              {chooser}
              {picker}
              {affectedBlock}
            </PaneScroll>
          </View>
          <View style={[styles.divider, { backgroundColor: colors.line }]} />
          <View style={styles.fill}>
            <PaneScroll testID="time-away-lists">{lists}</PaneScroll>
          </View>
        </View>
      ) : (
        <PaneScroll testID="time-away-scroll">
          {fresh}
          {chooser}
          {picker}
          {affectedBlock}
          {lists}
        </PaneScroll>
      )}
      <ConfirmSheet
        description={
          kind === "time-off"
            ? "Your managers are asked to decide. You'll see their answer here."
            : "Duna marks these days at once. No one needs to approve it."
        }
        event={
          kind === "time-off"
            ? "pro.time_off.request_failed"
            : "pro.time_off.blackout_failed"
        }
        onClose={() => setSending(false)}
        onDone={() => {
          setToast(
            kind === "time-off"
              ? `Time off asked for ${days ?? ""}.`
              : `Marked: you can't work ${days ?? ""}.`,
          );
          setRange({ from: null, to: null });
          setReason("");
        }}
        perform={async () => {
          if (!span) return;
          const input = {
            startsAt: span.startsAt,
            endsAt: span.endsAt,
            ...(reason.trim() ? { reason: reason.trim() } : {}),
          };
          if (kind === "time-off") await data.writes.requestTimeOff(input);
          else await data.writes.addBlackout(input);
        }}
        rows={[
          { label: "Days", value: days ?? "" },
          {
            label: "Booked sessions",
            value:
              affected.length === 0
                ? "None"
                : kind === "time-off"
                  ? `${affected.length}: listed for cover if approved`
                  : `${affected.length}: listed for cover now`,
          },
          ...(reason.trim() ? [{ label: "Reason", value: reason.trim() }] : []),
        ]}
        testID="time-away-send-sheet"
        tier={2}
        title={
          kind === "time-off"
            ? "Ask for time off?"
            : "Mark days you can't work?"
        }
        verb={kind === "time-off" ? "Ask for time off" : "Mark days"}
        visible={sending}
      />
      <ConfirmSheet
        description={
          cancelling?.status === "approved"
            ? "You'll be available again on these days. Sessions already listed for cover stay listed until a manager closes them."
            : "Your managers won't need to decide it."
        }
        destructive
        event="pro.time_off.cancel_failed"
        onClose={() => setCancelling(null)}
        onDone={() => setToast("Time off cancelled.")}
        perform={async () => {
          if (cancelling) await data.writes.cancelTimeOff(cancelling.id);
        }}
        rows={
          cancelling ? [{ label: "Days", value: spanWords(cancelling) }] : []
        }
        testID="time-off-cancel-sheet"
        tier={1}
        title={
          cancelling?.status === "approved"
            ? "Cancel this time off?"
            : "Withdraw this ask?"
        }
        verb={
          cancelling?.status === "approved" ? "Cancel time off" : "Withdraw"
        }
        visible={cancelling !== null}
      />
      <ConfirmSheet
        description="You'll be available again on these days. Sessions already listed for cover stay listed until a manager closes them."
        destructive
        event="pro.time_off.blackout_remove_failed"
        onClose={() => setRemoving(null)}
        onDone={() => setToast("Removed.")}
        perform={async () => {
          if (removing) await data.writes.removeBlackout(removing.id);
        }}
        rows={removing ? [{ label: "Days", value: spanWords(removing) }] : []}
        testID="blackout-remove-sheet"
        tier={1}
        title="Remove these days?"
        verb="Remove"
        visible={removing !== null}
      />
      <AskCoverSheet
        onClose={() => setAsking(null)}
        onDone={(text) => setToast(text)}
        session={asking}
        timeZone={team.timeZone}
        writes={data.writes}
      />
      <UndoToast onDismiss={() => setToast(null)} text={toast} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1, gap: 2 },
  columns: { flex: 1, flexDirection: "row" },
  divider: { width: StyleSheet.hairlineWidth },
  block: { gap: 10 },
  kinds: { gap: 8 },
  kind: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 14,
    borderWidth: 1,
    minHeight: 56,
  },
  rowHead: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  field: { gap: 6 },
});
