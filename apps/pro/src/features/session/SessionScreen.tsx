/**
 * The session a coach runs at the court (M-R2, PART-12; participation.md
 * §7.4; persona rows CH-3.n, CH-4.n, CO-7.n, FO-3.n): what, when, where and
 * who coaches it; one line of conditions where the venue has a forecast; the
 * group's state from the shared core with a countdown to the decision; the
 * roster (juniors carry the guardian note; health details never appear);
 * and the actions this person may take now, by role.
 *
 * Arrangement by the space the screen has (never by device):
 * - one column (iPhone, the closed Duo, a half-width pane);
 * - two columns when the screen's own region is regular or wider (the open
 *   Duo with the session full width, iPad): the session left, the roster right;
 * - the Duo propped half-open: the group status and roster count on the top
 *   pane, read at a distance, the actions on the bottom pane.
 */
import { ScrollView, StyleSheet, View } from "react-native";
import {
  EmptyState,
  ErrorState,
  FoldScaffold,
  LoadingState,
  NotConfiguredState,
  OfflineState,
  PermissionDeniedState,
  Rally,
  Rise,
  Text,
  useHaptics,
  useTheme,
  type GlyphName,
} from "@duna/ui/native";
import { useRegionLayout } from "@duna/ui/native/layout";
import * as Crypto from "expo-crypto";
import { useMemo, useState, type ReactNode } from "react";
import { useProRuntime } from "../../../runtime";
import { useShell } from "../../app/ShellContext";
import { Card, SectionHead, usePaneEdges } from "../../app/ui";
import { previewOperatorMatches } from "../../shared/preview-operator-matches";
import { conditionsAt, dateKeyOf, type CourtMatch } from "../today/day-model";
import { DayConditionsLine } from "../today/parts";
import { useDay } from "../today/use-day";
import { ArrivalsCard } from "./ArrivalsCard";
import { pendingForSession } from "./attendance-queue";
import { ConfirmSheet } from "./ConfirmSheet";
import type { Failure } from "./failure";
import {
  ActionButton,
  GroupStatus,
  Notice,
  PersonRow,
  useMinuteClock,
} from "./parts";
import {
  cancelSummary,
  effectiveAttendance,
  matchesForSession,
  rosterOrder,
  rosterSummary,
  sessionActions,
  sessionCopy,
  sessionDisplay,
  sessionPhase,
  sessionWhen,
  sessionWhere,
  type SessionAction,
  type SessionActionKey,
  type SessionDetail,
  type SessionPerson,
} from "./session-model";
import type { CourtBookingCapability } from "./cancel-plan";
import {
  CancelCalendarSessionSheet,
  CancelCourtBookingSheet,
  GroupCancelPreview,
} from "./CancelSheets";
import {
  CancelRefundSheet,
  ExtendSheet,
  NudgeSheet,
  RequestCancelSheet,
  RunAnywaySheet,
  ScoreSheet,
  StopPlaySheet,
} from "./SessionSheets";
import { sessionMarks, useAttendance } from "./use-attendance";
import { useSession, type SessionLoad } from "./use-session";

const ACTION_ICONS: Readonly<Record<SessionActionKey, GlyphName>> = {
  "check-in": "check",
  attendance: "check",
  message: "message",
  nudge: "send",
  score: "score",
  notes: "lesson",
  "stop-play": "lightning",
  "request-cancel": "close",
  extend: "clock",
  "run-anyway": "play",
  "cancel-refund": "close",
  "cancel-session": "close",
  "cancel-booking": "close",
};

const SCORING_KINDS = new Set(["tournament", "league", "pickup"]);

type Sheet =
  | "nudge"
  | "score"
  | "stop-play"
  | "request-cancel"
  | "extend"
  | "run-anyway"
  | "cancel-refund"
  | "cancel-session"
  | "cancel-booking"
  | null;

interface Feedback {
  readonly tone: "positive" | "info" | "warning";
  readonly title: string;
  readonly text?: string;
  readonly action?: { readonly label: string; readonly onPress: () => void };
}

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export function SessionScreen({
  sessionId,
}: {
  readonly sessionId: string | undefined;
}) {
  const { load, reload, preview } = useSession(sessionId);
  const shell = useShell();
  const attendance = useAttendance();
  const edges = usePaneEdges();
  const { colors, tokens } = useTheme();
  const queued = sessionId
    ? pendingForSession(attendance.state, sessionId).length
    : 0;

  const frame = (children: ReactNode) => (
    <ScrollView
      contentContainerStyle={{
        paddingTop: tokens.space["4"],
        paddingBottom: edges.bottom + tokens.space["8"],
        paddingHorizontal: tokens.space["4"],
        gap: tokens.space["4"],
      }}
      style={{ backgroundColor: colors.ground }}
      testID="session-state"
    >
      {children}
    </ScrollView>
  );

  if (load.status === "loading")
    return frame(
      <LoadingState
        count={3}
        label="Loading the session"
        loading
        skeleton="card"
      />,
    );
  if (load.status === "not-found")
    return frame(
      <EmptyState
        action={{
          label: "Open Schedule",
          onPress: () =>
            shell.dispatch({ type: "select-tab", tab: "schedule" }),
        }}
        text="It may have been moved, cancelled or belong to another club."
        title="This session isn't on your schedule"
      />,
    );
  if (load.status === "failed")
    return frame(
      <FailureState
        failure={load.failure}
        onRetry={() => void reload()}
        queued={queued}
      />,
    );
  return <ReadySession load={load} preview={preview} reload={reload} />;
}

/** A failure as its shared state. */
function FailureState({
  failure,
  onRetry,
  queued,
}: {
  readonly failure: Failure;
  readonly onRetry: () => void;
  readonly queued: number;
}) {
  switch (failure.kind) {
    case "offline":
      return <OfflineState onRetry={onRetry} queued={queued} />;
    case "denied":
      return (
        <PermissionDeniedState
          what="this session"
          who="a director at your club"
        />
      );
    case "not-configured":
      return (
        <NotConfiguredState
          feature="Group sessions"
          text="Group sessions need Duna Database connected for your club. Nothing is sent or charged until it is."
        />
      );
    default:
      return (
        <ErrorState
          onRetry={onRetry}
          reference={failure.reference}
          text="The session could not load."
          title="Couldn't open this session"
        />
      );
  }
}

function ReadySession({
  load,
  preview,
  reload,
}: {
  readonly load: Extract<SessionLoad, { status: "ready" }>;
  readonly preview: boolean;
  readonly reload: () => Promise<void>;
}) {
  const detail = load.detail;
  const runtime = useProRuntime();
  const client = runtime.client;
  const shell = useShell();
  const day = useDay();
  const attendance = useAttendance();
  const haptics = useHaptics();
  const now = useMinuteClock();
  const region = useRegionLayout();
  const edges = usePaneEdges();
  const { colors, tokens } = useTheme();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [removing, setRemoving] = useState<SessionPerson | null>(null);
  const [courtBooking, setCourtBooking] =
    useState<CourtBookingCapability>("unknown");

  const display = useMemo(() => sessionDisplay(detail, now), [detail, now]);
  const copy = sessionCopy(display);
  const phase = sessionPhase(detail, now);
  const matches = useMemo(() => {
    const source = preview ? previewOperatorMatches() : (runtime.matches ?? []);
    return matchesForSession(detail, source);
  }, [detail, preview, runtime.matches]);
  const rosterCount = detail.people.filter((person) => person.active).length;
  const actions = sessionActions(detail, {
    audience: shell.audience,
    now,
    courtBooking,
    hasMatches:
      matches.length > 0 ||
      SCORING_KINDS.has(detail.kind ?? "") ||
      rosterCount >= 2,
  });
  const pending = pendingForSession(attendance.state, detail.id);
  const marks = useMemo(
    () => sessionMarks(attendance, detail.id),
    [attendance, detail.id],
  );
  const queuedMarks = marks.effective;
  const summary = rosterSummary(detail.people, queuedMarks);
  const venue = day.venues.find((candidate) => candidate.id === detail.venueId);
  const conditions =
    venue && phase !== "closed" && phase !== "cancelled"
      ? conditionsAt(venue, Math.max(now, detail.startsAt), detail.timeZone)
      : null;

  /** Live: the call. Preview: a pause, and nothing changes. */
  const call = async (live: () => Promise<unknown>) => {
    if (preview) {
      await wait(500);
      return;
    }
    if (!client) throw new Error("Network request failed");
    await live();
  };
  const done = (next: Feedback) => {
    setFeedback(
      preview
        ? {
            ...next,
            text: [next.text, "Preview: nothing was sent or changed."]
              .filter(Boolean)
              .join(" "),
          }
        : next,
    );
    void reload();
  };
  const openMessages = () =>
    detail.audienceKey
      ? shell.open("messages", { audienceKey: detail.audienceKey })
      : shell.open("messages");

  const onAction = (action: SessionAction) => {
    switch (action.key) {
      case "check-in":
      case "attendance":
        shell.open("attendance", { entryId: detail.id });
        return;
      case "message":
        openMessages();
        return;
      case "notes":
        shell.open("notes", { entryId: detail.id });
        return;
      default:
        setSheet(action.key);
    }
  };

  const matchRows: readonly CourtMatch[] = matches.map((match) => ({
    id: match.id,
    live: match.status === "live",
    title: `${match.teamA.name} vs ${match.teamB.name}`,
    court: match.courtName ?? detail.courtName ?? "Court",
    when: match.status === "live" ? "Live" : "Next",
    context: match.sessionTitle ?? detail.title,
  }));

  const header = (
    <View style={styles.header} testID="session-header">
      <Text accessibilityRole="header" variant="phone-title">
        {detail.title}
      </Text>
      <Text tone="text" variant="phone-body" weight={600}>
        {sessionWhen(detail)}
      </Text>
      <Text tone="text-2" variant="phone-meta">
        {[
          sessionWhere(detail) ?? "No court assigned",
          detail.coachName ? `Coach ${detail.coachName}` : "No coach assigned",
        ].join(" · ")}
      </Text>
      {conditions?.configured ? (
        <DayConditionsLine
          conditions={conditions}
          now={now}
          onPress={() =>
            shell.openConditions(dateKeyOf(detail.startsAt, detail.timeZone))
          }
        />
      ) : null}
    </View>
  );

  const notices = (
    <>
      {load.failure?.kind === "offline" ? (
        <OfflineState
          compact
          onRetry={() => void reload()}
          queued={pending.length}
        />
      ) : load.failure?.kind === "error" ? (
        <ErrorState
          compact
          onRetry={() => void reload()}
          reference={load.failure.reference}
          text="What you see may be out of date."
          title="Couldn't refresh this session"
        />
      ) : null}
      {feedback ? (
        <Rise trigger={feedback.title}>
          <Notice
            action={feedback.action?.label}
            onAction={feedback.action?.onPress}
            testID="session-feedback"
            text={feedback.text}
            title={feedback.title}
            tone={feedback.tone}
          />
        </Rise>
      ) : null}
    </>
  );

  const status = (large = false) => (
    <GroupStatus
      accessibilityLabel={copy.a11y}
      booked={display.numbers.booked}
      capacity={display.numbers.capacity}
      large={large}
      line={copy.line}
      lockAt={
        display.state === "needs-players" && detail.group
          ? detail.group.lockAt
          : undefined
      }
      minimum={display.hasGroupRule ? display.numbers.minimum : null}
      now={now}
      staff={copy.staff}
      status={copy.status}
      tone={display.tone}
    />
  );

  const actionList = (
    <View style={styles.block} testID="session-actions">
      {actions.length ? <SectionHead title="Actions" /> : null}
      {actions.map((action, index) => (
        <ActionButton
          hint={action.hint}
          icon={ACTION_ICONS[action.key]}
          key={action.key}
          kind={
            action.destructive
              ? "danger"
              : index === 0
                ? "primary"
                : "secondary"
          }
          label={action.label}
          onPress={() => onAction(action)}
          testID={`session-action-${action.key}`}
        />
      ))}
    </View>
  );

  const roster = (
    <View style={styles.block} testID="session-roster">
      <SectionHead title={`Roster · ${summary.booked} of ${detail.capacity}`} />
      {pending.length ? (
        <Notice
          testID="session-saved-on-phone"
          text="They send when you're back online, in the order you made them."
          title={`${pending.length} mark${pending.length === 1 ? "" : "s"} saved on this phone`}
          tone="info"
        />
      ) : null}
      {load.rosterLoading ? (
        <LoadingState
          count={3}
          label="Loading the roster"
          loading
          skeleton="row"
        />
      ) : detail.people.length ? (
        <View role="list">
          <Rally>
            {rosterOrder(detail.people).map((person) => {
              const mark = effectiveAttendance(person, queuedMarks);
              const local = person.bookingId
                ? marks.onPhone.has(person.bookingId)
                : false;
              return (
                <View key={person.key} role="listitem">
                  <PersonRow
                    dim={!person.active}
                    junior={person.junior}
                    name={person.displayName}
                    note={person.waitlisted ? "Waitlist" : person.guardianNote}
                    payment={person.payment}
                    testID={`roster-${person.key}`}
                    trailing={
                      mark ? (
                        <Text
                          tone={mark === "attended" ? "positive" : "danger"}
                          variant="phone-meta"
                          weight={600}
                        >
                          {`${mark === "attended" ? "Here" : "Absent"}${local ? " · on this phone" : ""}`}
                        </Text>
                      ) : undefined
                    }
                  />
                </View>
              );
            })}
          </Rally>
        </View>
      ) : (
        <EmptyState
          compact
          action={
            detail.audienceKey && display.state === "needs-players"
              ? { label: "Nudge the group", onPress: () => setSheet("nudge") }
              : undefined
          }
          text="People who book show up here."
          title="No one booked yet"
        />
      )}
    </View>
  );

  const arrivals =
    detail.source === "calendar" &&
    (phase === "soon" || phase === "live") &&
    rosterCount > 0 ? (
      <ArrivalsCard
        expectedPlayers={rosterCount}
        sessionId={detail.id}
        startsAt={new Date(detail.startsAt).toISOString()}
        title={detail.title}
        venueName={detail.venueName}
      />
    ) : null;

  const manage =
    detail.source === "calendar" ? (
      <ManageBlock
        call={call}
        detail={detail}
        onDone={done}
        onRemove={setRemoving}
      />
    ) : null;

  const subject = detail.subject;
  const occurrenceSummary = cancelSummary(detail, load.occurrence);
  const sheets = (
    <>
      <NudgeSheet
        detail={detail}
        now={now}
        onClose={() => setSheet(null)}
        onOpenConversation={openMessages}
        visible={sheet === "nudge"}
      />
      <ScoreSheet
        matches={matchRows}
        onClose={() => setSheet(null)}
        onScore={(matchId) =>
          shell.open("courtside", matchId ? { matchId } : {})
        }
        visible={sheet === "score"}
      />
      <ExtendSheet
        detail={detail}
        extend={(lockAt, key) =>
          call(() =>
            client!.operator.participation.extendLock.mutate({
              subjectType: "catalog-session-occurrence",
              subjectId: subject!.subjectId,
              lockAt,
              confirmed: true,
              idempotencyKey: key,
            }),
          )
        }
        now={now}
        onClose={() => setSheet(null)}
        onDone={(label) =>
          done({
            tone: "positive",
            title: `Decision moved to ${label}`,
            text: "Booked players are being told. Free cancellation moved with it.",
          })
        }
        visible={sheet === "extend"}
      />
      <RunAnywaySheet
        detail={detail}
        onClose={() => setSheet(null)}
        onDone={() =>
          done({
            tone: "positive",
            title: `${detail.title} is on`,
            text: "It runs whatever the final group size. Booked players are being told.",
          })
        }
        run={(key) =>
          call(() =>
            client!.operator.participation.runAnyway.mutate({
              subjectType: "catalog-session-occurrence",
              subjectId: subject!.subjectId,
              confirmed: true,
              idempotencyKey: key,
            }),
          )
        }
        visible={sheet === "run-anyway"}
      />
      <RequestCancelSheet
        detail={detail}
        onClose={() => setSheet(null)}
        onDone={() =>
          done({
            tone: "info",
            title: "Your directors have the request",
            text: "Nothing changes for the players until a director decides.",
          })
        }
        request={(reason, key) =>
          call(() =>
            client!.operator.participation.requestCancel.mutate({
              subjectType: "catalog-session-occurrence",
              subjectId: subject!.subjectId,
              reason,
              idempotencyKey: key,
            }),
          )
        }
        visible={sheet === "request-cancel"}
      />
      <CancelRefundSheet
        cancel={(reason, key) =>
          call(() =>
            client!.operator.participation.cancelSession.mutate({
              subjectType: "catalog-session-occurrence",
              subjectId: subject!.subjectId,
              reason,
              confirmed: true,
              idempotencyKey: key,
            }),
          )
        }
        detail={detail}
        onClose={() => setSheet(null)}
        onDone={() =>
          done({
            tone: "positive",
            title: `${detail.title} is cancelled`,
            text: "Everyone booked is being told and refunded.",
            action: detail.audienceKey
              ? { label: "Add a personal message", onPress: openMessages }
              : undefined,
          })
        }
        preview={
          <GroupCancelPreview
            detail={detail}
            visible={sheet === "cancel-refund"}
          />
        }
        summary={occurrenceSummary.line}
        visible={sheet === "cancel-refund"}
      />
      <CancelCalendarSessionSheet
        detail={detail}
        onClose={() => setSheet(null)}
        onDone={() =>
          done({
            tone: "positive",
            title: `${detail.title} is cancelled`,
            text: "Everyone booked is being told, with your reason. Paid orders are refunded the way they paid.",
          })
        }
        visible={sheet === "cancel-session"}
      />
      <CancelCourtBookingSheet
        detail={detail}
        onCapability={setCourtBooking}
        onClose={() => setSheet(null)}
        onDone={({ toTell }) =>
          done({
            tone: "positive",
            title: `${detail.title} is cancelled`,
            text: toTell
              ? `A message draft is ready for ${toTell} ${toTell === 1 ? "person" : "people"}. Nothing is sent until you review it.`
              : "The court is released. Refunds go back the way each person paid.",
            action: detail.audienceKey
              ? { label: "Review the message", onPress: openMessages }
              : undefined,
          })
        }
        visible={sheet === "cancel-booking"}
      />
      <StopPlaySheet
        detail={detail}
        onClose={() => setSheet(null)}
        onDone={() => {
          haptics.confirmed(2);
          done({
            tone: "warning",
            title: "Play is stopped",
            text: "Review a message to the group before it sends.",
            action: detail.audienceKey
              ? { label: "Message the group", onPress: openMessages }
              : undefined,
          });
        }}
        stop={(reason, key) =>
          call(() =>
            client!.operator.facility.startPlayStop.mutate({
              venueId: detail.venueId!,
              courtIds: detail.courtId ? [detail.courtId] : [],
              reason,
              idempotencyKey: key,
            }),
          )
        }
        visible={sheet === "stop-play"}
      />
      <ConfirmSheet
        description="They are taken off the roster and told. Their place opens for someone else."
        destructive
        event="pro.session.remove_person_failed"
        onClose={() => setRemoving(null)}
        onDone={() =>
          done({
            tone: "positive",
            title: `${removing?.displayName ?? "They"} left the session`,
          })
        }
        perform={(key) =>
          call(() =>
            client!.operator.removeCalendarParticipant.mutate({
              registrationId: removing!.bookingId!,
              reason: "Removed from the session by a coach in Duna Pro.",
              idempotencyKey: key,
            }),
          )
        }
        testID="sheet-remove-person"
        tier={1}
        title={`Remove ${removing?.displayName ?? "this person"}?`}
        verb="Remove from session"
        visible={removing !== null}
      />
    </>
  );

  const scrollStyle = {
    paddingTop: tokens.space["4"],
    paddingBottom: edges.bottom + tokens.space["8"],
    paddingHorizontal: tokens.space["4"],
    gap: tokens.space["5"],
  };

  let body: ReactNode;
  if (region.layout.mode === "tabletop") {
    body = (
      <FoldScaffold
        layout={region.layout}
        primary={
          <View style={[styles.tabletopTop, { padding: tokens.space["6"] }]}>
            <Text accessibilityRole="header" variant="phone-heading">
              {detail.title}
            </Text>
            {status(true)}
            <Text tabular variant="figure-sm" weight={600}>
              {`${summary.booked} booked · ${summary.here} marked here`}
            </Text>
          </View>
        }
        secondary={
          <ScrollView contentContainerStyle={scrollStyle}>
            {notices}
            {actionList}
          </ScrollView>
        }
        tabletop="auto"
      />
    );
  } else if (region.layout.paneCount >= 2) {
    body = (
      <View style={styles.columns}>
        <ScrollView contentContainerStyle={scrollStyle} style={styles.column}>
          {header}
          {notices}
          {status()}
          {actionList}
          {arrivals}
          {manage}
        </ScrollView>
        <View style={[styles.divider, { backgroundColor: colors.line }]} />
        <ScrollView contentContainerStyle={scrollStyle} style={styles.column}>
          {roster}
        </ScrollView>
      </View>
    );
  } else {
    body = (
      <ScrollView contentContainerStyle={scrollStyle}>
        {header}
        {notices}
        {status()}
        {actionList}
        {roster}
        {arrivals}
        {manage}
      </ScrollView>
    );
  }

  return (
    <View
      onLayout={region.onLayout}
      ref={region.ref}
      style={[styles.fill, { backgroundColor: colors.ground }]}
      testID="session-screen"
    >
      {body}
      {sheets}
    </View>
  );
}

/**
 * Players and equipment for a calendar session (kept from the legacy
 * calendar sheet): remove a player, add a connected player, reserve or
 * release equipment. Collapsed by default so the court view stays short.
 */
function ManageBlock({
  detail,
  call,
  onDone,
  onRemove,
}: {
  readonly detail: SessionDetail;
  readonly call: (live: () => Promise<unknown>) => Promise<void>;
  readonly onDone: (feedback: Feedback) => void;
  readonly onRemove: (person: SessionPerson) => void;
}) {
  const runtime = useProRuntime();
  const client = runtime.client;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const onRoster = new Set(
    detail.people.map((person) => person.personId).filter(Boolean),
  );
  const candidates = (runtime.workspace?.people ?? [])
    .filter(
      (person) =>
        person.status === "active" &&
        person.roles.includes("player") &&
        !onRoster.has(person.personId),
    )
    .slice(0, 8);
  const reserved = new Set(detail.equipment.map((item) => item.label));
  const equipment = (runtime.workspace?.inventory ?? [])
    .filter(
      (item) =>
        item.purpose !== "sale" &&
        item.quantityOnHand > item.quantityReserved &&
        !reserved.has(item.itemTitle),
    )
    .slice(0, 8);

  const run = async (
    key: string,
    live: () => Promise<unknown>,
    title: string,
  ) => {
    setBusy(key);
    setFailure(null);
    try {
      await call(live);
      onDone({ tone: "positive", title });
    } catch {
      setFailure("That didn't save. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.block} testID="session-manage">
      <SectionHead
        action={open ? "Done" : "Edit"}
        onAction={() => setOpen((value) => !value)}
        title="Players and equipment"
      />
      {!open ? (
        <Text tone="text-2" variant="phone-meta">
          {detail.equipment.length
            ? detail.equipment
                .map((item) => `${item.label} × ${item.quantity}`)
                .join(" · ")
            : "No equipment reserved."}
        </Text>
      ) : (
        <Card>
          {failure ? <Notice title={failure} tone="danger" /> : null}
          {detail.people
            .filter((person) => person.active && person.bookingId)
            .map((person) => (
              <PersonRow
                key={person.key}
                name={person.displayName}
                trailing={
                  <ActionButton
                    label="Remove"
                    onPress={() => onRemove(person)}
                    testID={`remove-${person.key}`}
                  />
                }
              />
            ))}
          {candidates.length ? (
            <Text tone="text-2" variant="phone-meta" weight={600}>
              Add a player
            </Text>
          ) : null}
          {candidates.map((person) => (
            <PersonRow
              key={person.personId}
              name={person.displayName}
              trailing={
                <ActionButton
                  busy={busy === person.personId}
                  icon="user-plus"
                  label="Add"
                  onPress={() =>
                    void run(
                      person.personId,
                      () =>
                        client!.operator.addCalendarParticipant.mutate({
                          sessionId: detail.id,
                          personId: person.personId,
                          reason:
                            "Added to the session by a coach in Duna Pro.",
                          idempotencyKey: Crypto.randomUUID(),
                        }),
                      `${person.displayName} is in the session`,
                    )
                  }
                />
              }
            />
          ))}
          <Text tone="text-2" variant="phone-meta" weight={600}>
            Equipment
          </Text>
          {detail.equipment.map((item) => (
            <PersonRow
              key={item.reservationId}
              name={item.label}
              note={`${item.quantity} reserved`}
              trailing={
                <ActionButton
                  busy={busy === item.reservationId}
                  label="Release"
                  onPress={() =>
                    void run(
                      item.reservationId,
                      () =>
                        client!.operator.removeCalendarEquipment.mutate({
                          reservationId: item.reservationId,
                          reason: "Equipment released in Duna Pro.",
                          idempotencyKey: Crypto.randomUUID(),
                        }),
                      `${item.label} released`,
                    )
                  }
                />
              }
            />
          ))}
          {equipment.map((item) => (
            <PersonRow
              key={item.id}
              name={item.itemTitle}
              note={`${item.quantityOnHand - item.quantityReserved} available`}
              trailing={
                <ActionButton
                  busy={busy === item.id}
                  label="Reserve one"
                  onPress={() =>
                    void run(
                      item.id,
                      () =>
                        client!.operator.addCalendarEquipment.mutate({
                          sessionId: detail.id,
                          inventoryStockItemId: item.id,
                          quantity: 1,
                          reason: "Reserved for the session in Duna Pro.",
                          idempotencyKey: Crypto.randomUUID(),
                        }),
                      `${item.itemTitle} reserved`,
                    )
                  }
                />
              }
            />
          ))}
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { gap: 4 },
  block: { gap: 8 },
  columns: { flex: 1, flexDirection: "row" },
  column: { flex: 1 },
  divider: { width: StyleSheet.hairlineWidth },
  tabletopTop: { flex: 1, justifyContent: "center", gap: 12 },
});
