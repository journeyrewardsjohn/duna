/**
 * The session's decisions (participation.md §6) as confirmation sheets, at
 * the tier each one carries: extend the deadline and run anyway (confirm),
 * request to cancel (confirm, reason required), cancel and refund, cancel a
 * calendar session and stop play (strong, restating people, money and the
 * consequence). Nudge drafts the shared reminder for the coach to review and
 * send themselves; Score hands off to Courtside. Nothing here sends a
 * message or confirms on a person's behalf.
 */
import { Pressable, ScrollView, Share, StyleSheet, View } from "react-native";
import {
  AdaptiveSheet,
  EmptyState,
  Icon,
  Text,
  useHaptics,
  useTheme,
} from "@duna/ui/native";
import {
  formatParticipationTime,
  participationToken,
  renderParticipationCopy,
  validateLockExtension,
} from "@duna/core";
import { useEffect, useMemo, useState } from "react";
import { IconButton } from "../../app/ui";
import type { CourtMatch } from "../today/day-model";
import { CourtMatchRow } from "../today/parts";
import { ConfirmSheet } from "./ConfirmSheet";
import { DunaTextInput } from "./duna-text";
import { ActionButton } from "./parts";
import {
  bookedPlaces,
  sessionDisplay,
  sessionWhen,
  sessionWhere,
  type SessionDetail,
} from "./session-model";

export type CancelReason = "coach" | "weather" | "venue" | "other";
export type StopReason = "lightning" | "weather" | "maintenance" | "other";

export const CANCEL_REASONS: readonly {
  readonly value: CancelReason;
  readonly label: string;
}[] = [
  { value: "coach", label: "The coach can't run it" },
  { value: "weather", label: "Weather" },
  { value: "venue", label: "A problem with the venue or court" },
  { value: "other", label: "Something else" },
];

export const STOP_REASONS: readonly {
  readonly value: StopReason;
  readonly label: string;
}[] = [
  { value: "lightning", label: "Lightning" },
  { value: "weather", label: "Rain, wind or heat" },
  { value: "maintenance", label: "Court maintenance" },
  { value: "other", label: "Something else" },
];

/** A list of radio rows, 52 pt each. */
export function ChoiceList<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  readonly label: string;
  readonly options: readonly { readonly value: T; readonly label: string }[];
  readonly value: T | null;
  readonly onChange: (value: T) => void;
}) {
  const { colors, tokens } = useTheme();
  const haptics = useHaptics();
  return (
    <View
      accessibilityLabel={label}
      accessibilityRole="radiogroup"
      style={styles.choices}
    >
      <Text tone="text-2" variant="phone-meta" weight={600}>
        {label}
      </Text>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            key={option.value}
            onPress={() => {
              haptics.selection();
              onChange(option.value);
            }}
            style={[
              styles.choice,
              {
                borderColor: selected ? colors.action : colors.line,
                backgroundColor: selected ? colors.selected : colors.surface,
                borderRadius: tokens.radius.lg,
              },
            ]}
            testID={`choice-${option.value}`}
          >
            <Icon
              name={selected ? "check" : "minus"}
              size="inline"
              tone={selected ? "text" : "text-3"}
            />
            <Text
              style={styles.flex}
              variant="phone-body"
              weight={selected ? 600 : 400}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

interface SheetBase {
  readonly detail: SessionDetail;
  readonly visible: boolean;
  readonly onClose: () => void;
}

function people(count: number): string {
  return `${count} ${count === 1 ? "person" : "people"}`;
}

function bookedPlayers(detail: SessionDetail): string {
  const count = bookedPlaces(detail);
  return `${count} booked player${count === 1 ? "" : "s"}`;
}

/** Extend the deadline (director, `confirm`). */
export function ExtendSheet({
  detail,
  visible,
  onClose,
  now,
  extend,
  onDone,
}: SheetBase & {
  readonly now: number;
  readonly extend: (lockAt: string, idempotencyKey: string) => Promise<void>;
  readonly onDone: (lockLabel: string) => void;
}) {
  const lockAt = detail.group?.lockAt ?? detail.startsAt;
  const options = useMemo(
    () =>
      [2, 6, 12, 24]
        .map((hours) => new Date(lockAt + hours * 3_600_000))
        .filter(
          (candidate) =>
            validateLockExtension({
              currentLockAt: new Date(lockAt),
              requestedLockAt: candidate,
              startsAt: new Date(detail.startsAt),
              now: new Date(now),
            }) === undefined,
        )
        .map((candidate) => ({
          value: candidate.toISOString(),
          label: formatParticipationTime({
            at: candidate,
            now: new Date(now),
            timeZone: detail.timeZone,
          }).label,
        })),
    [detail.startsAt, detail.timeZone, lockAt, now],
  );
  const [choice, setChoice] = useState<string | null>(null);
  useEffect(() => {
    if (visible) setChoice(options[0]?.value ?? null);
  }, [options, visible]);
  const label = options.find((option) => option.value === choice)?.label ?? "";
  return (
    <ConfirmSheet
      description={
        options.length
          ? `Free cancellation moves with it. ${bookedPlayers(detail)} will be told.`
          : "There is no later time before the session starts. Run it anyway or cancel instead."
      }
      event="pro.session.extend_failed"
      notReadyHint="Choose a new decision time."
      onClose={onClose}
      onDone={() => onDone(label)}
      perform={(key) => extend(choice!, key)}
      ready={Boolean(choice)}
      testID="sheet-extend"
      tier={1}
      title={`Move ${detail.title}'s decision?`}
      verb={choice ? `Move to ${label}` : "Move the decision"}
      visible={visible}
    >
      {options.length ? (
        <ChoiceList
          label="New decision time"
          onChange={setChoice}
          options={options}
          value={choice}
        />
      ) : null}
    </ConfirmSheet>
  );
}

/** Run it anyway (director, `confirm`). */
export function RunAnywaySheet({
  detail,
  visible,
  onClose,
  run,
  onDone,
}: SheetBase & {
  readonly run: (idempotencyKey: string) => Promise<void>;
  readonly onDone: () => void;
}) {
  return (
    <ConfirmSheet
      description={`It runs even if it stays under its minimum of ${detail.group?.minimum ?? 1}. Nobody pays more than they agreed. ${bookedPlayers(detail)} will be told it's on.`}
      event="pro.session.run_anyway_failed"
      onClose={onClose}
      onDone={onDone}
      perform={run}
      testID="sheet-run-anyway"
      tier={1}
      title={`Run ${detail.title} anyway?`}
      verb="Run it anyway"
      visible={visible}
    />
  );
}

/** A coach asks a director to cancel (`confirm`, reason required). */
export function RequestCancelSheet({
  detail,
  visible,
  onClose,
  request,
  onDone,
}: SheetBase & {
  readonly request: (reason: CancelReason, key: string) => Promise<void>;
  readonly onDone: () => void;
}) {
  const [reason, setReason] = useState<CancelReason | null>(null);
  useEffect(() => {
    if (visible) setReason(null);
  }, [visible]);
  return (
    <ConfirmSheet
      description="A director decides. Until then nothing changes for the players."
      event="pro.session.request_cancel_failed"
      notReadyHint="Choose a reason first."
      onClose={onClose}
      onDone={onDone}
      perform={(key) => request(reason!, key)}
      ready={reason !== null}
      testID="sheet-request-cancel"
      tier={1}
      title={`Ask to cancel ${detail.title}?`}
      verb="Send the request"
      visible={visible}
    >
      <ChoiceList
        label="Why"
        onChange={setReason}
        options={CANCEL_REASONS}
        value={reason}
      />
    </ConfirmSheet>
  );
}

/** Cancel and refund (director, `strong`). */
export function CancelRefundSheet({
  detail,
  visible,
  onClose,
  summary,
  cancel,
  onDone,
}: SheetBase & {
  readonly summary: string;
  readonly cancel: (reason: CancelReason, key: string) => Promise<void>;
  readonly onDone: () => void;
}) {
  const [reason, setReason] = useState<CancelReason | null>(null);
  useEffect(() => {
    if (visible) setReason(null);
  }, [visible]);
  return (
    <ConfirmSheet
      cancelLabel="Keep the session"
      description="The session is cancelled and every booking is refunded in full, including the service fee."
      destructive
      event="pro.session.cancel_failed"
      notReadyHint="Choose a reason first."
      onClose={onClose}
      onDone={onDone}
      perform={(key) => cancel(reason!, key)}
      ready={reason !== null}
      rows={[
        { label: "Who gets what back", value: summary },
        {
          label: "What happens",
          value:
            "Everyone booked is told. A cancellation cannot be undone; card refunds can take 5–10 business days.",
        },
        { label: "Session", value: `${detail.title} · ${sessionWhen(detail)}` },
      ]}
      testID="sheet-cancel-refund"
      tier={2}
      title={`Cancel ${detail.title}?`}
      verb="Cancel and refund"
      visible={visible}
    >
      <ChoiceList
        label="Why"
        onChange={setReason}
        options={CANCEL_REASONS}
        value={reason}
      />
    </ConfirmSheet>
  );
}

/** Cancel a calendar session (director, `strong`, reason in words). */
export function CancelSessionSheet({
  detail,
  visible,
  onClose,
  cancel,
  onDone,
}: SheetBase & {
  readonly cancel: (reason: string, key: string) => Promise<void>;
  readonly onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (visible) setReason("");
  }, [visible]);
  const roster = detail.people.filter((person) => person.active).length;
  return (
    <ConfirmSheet
      cancelLabel="Keep the session"
      description="The court and coach are released and everyone booked is told, with your reason."
      destructive
      event="pro.session.cancel_calendar_failed"
      notReadyHint="Say why in a few words; players see it."
      onClose={onClose}
      onDone={onDone}
      perform={(key) => cancel(reason.trim(), key)}
      ready={reason.trim().length >= 3}
      rows={[
        { label: "Who is told", value: people(roster) },
        { label: "Session", value: `${detail.title} · ${sessionWhen(detail)}` },
        { label: "What happens", value: "A cancellation cannot be undone." },
      ]}
      testID="sheet-cancel-session"
      tier={2}
      title={`Cancel ${detail.title}?`}
      verb="Cancel and tell everyone"
      visible={visible}
    >
      <Text tone="text-2" variant="phone-meta" weight={600}>
        Reason players will see
      </Text>
      <DunaTextInput
        accessibilityLabel="Reason players will see"
        maxLength={500}
        multiline
        onChangeText={setReason}
        placeholder="Weather, coach unavailable, venue closed…"
        testID="cancel-reason"
        value={reason}
      />
    </ConfirmSheet>
  );
}

/** Stop play on this court (FO-3.n, `strong`). */
export function StopPlaySheet({
  detail,
  visible,
  onClose,
  stop,
  onDone,
}: SheetBase & {
  readonly stop: (reason: StopReason, key: string) => Promise<void>;
  readonly onDone: () => void;
}) {
  const [reason, setReason] = useState<StopReason | null>(null);
  useEffect(() => {
    if (visible) setReason(null);
  }, [visible]);
  const courts = detail.courtId
    ? (sessionWhere(detail) ?? "This court")
    : `Every court at ${detail.venueName ?? "this venue"}`;
  const roster = detail.people.filter((person) => person.active).length;
  return (
    <ConfirmSheet
      cancelLabel="Keep playing"
      description="Play stops now. You lift it from Duna HQ when it is safe."
      destructive
      event="pro.session.stop_play_failed"
      notReadyHint="Choose why play is stopping."
      onClose={onClose}
      onDone={onDone}
      perform={(key) => stop(reason!, key)}
      ready={reason !== null}
      rows={[
        { label: "Courts", value: courts },
        {
          label: "People affected",
          value: `${people(roster)} in this session, and anyone booked on ${detail.courtId ? "this court" : "these courts"}`,
        },
        {
          label: "What happens",
          value:
            "Bookings on these courts are paused. You review the message to the group before it sends.",
        },
      ]}
      testID="sheet-stop-play"
      tier={2}
      title="Stop play now?"
      verb="Stop play"
      visible={visible}
    >
      <ChoiceList
        label="Why"
        onChange={setReason}
        options={STOP_REASONS}
        value={reason}
      />
    </ConfirmSheet>
  );
}

/** The shared reminder ("needs 2 more"), drafted for the coach to send. */
export function nudgeDraft(detail: SessionDetail, now: number): string {
  const display = sessionDisplay(detail, now);
  const params = {
    title: detail.title,
    n: display.numbers.needed,
    lock: display.lock?.label ?? "",
  };
  return [
    renderParticipationCopy(
      participationToken("notice.needs-players-reminder.title", params),
    ),
    renderParticipationCopy(
      participationToken("notice.needs-players-reminder.body", params),
    ),
  ].join(". ");
}

/**
 * Nudge the group: the draft is the shared reminder, editable. The coach
 * reviews it and sends it themselves, from the group conversation or the
 * system share sheet. Duna sends nothing from here.
 */
export function NudgeSheet({
  detail,
  visible,
  onClose,
  now,
  onOpenConversation,
}: SheetBase & {
  readonly now: number;
  readonly onOpenConversation: () => void;
}) {
  const { tokens } = useTheme();
  const [draft, setDraft] = useState("");
  useEffect(() => {
    if (visible) setDraft(nudgeDraft(detail, now));
    // The draft is written once per opening; edits are the coach's.
  }, [visible]);
  return (
    <AdaptiveSheet
      accessibilityLabel="Nudge the group"
      kind="dialog"
      onClose={onClose}
      testID="sheet-nudge"
      visible={visible}
    >
      <View style={[styles.head, { paddingHorizontal: tokens.space["4"] }]}>
        <Text
          accessibilityRole="header"
          style={styles.flex}
          variant="phone-heading"
        >
          Nudge the group
        </Text>
        <IconButton icon="close" label="Close" onPress={onClose} />
      </View>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: tokens.space["4"],
          paddingBottom: tokens.space["6"],
          gap: tokens.space["4"],
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Text tone="text-2" variant="phone-body">
          {`For the ${bookedPlayers(detail)} (and the guardians of juniors). Review it, change anything, then send it yourself.`}
        </Text>
        <DunaTextInput
          accessibilityLabel="Message draft"
          maxLength={1000}
          multiline
          onChangeText={setDraft}
          style={styles.draft}
          testID="nudge-draft"
          value={draft}
        />
        <ActionButton
          hint="Opens the group conversation; nothing sends until you press Send there"
          icon="message"
          kind="primary"
          label="Open the group conversation"
          onPress={() => {
            onClose();
            setTimeout(onOpenConversation, 240);
          }}
          testID="nudge-open-conversation"
        />
        <ActionButton
          hint="Opens the share sheet with this draft; you choose where it goes"
          icon="send"
          label="Share the draft…"
          onPress={() => void Share.share({ message: draft })}
          testID="nudge-share"
        />
      </ScrollView>
    </AdaptiveSheet>
  );
}

/**
 * Score from the session: the session's matches with their teams already
 * set, handed to Courtside (the Live zone). Courtside itself is unchanged.
 */
export function ScoreSheet({
  visible,
  onClose,
  matches,
  onScore,
}: {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly matches: readonly CourtMatch[];
  readonly onScore: (matchId?: string) => void;
}) {
  const { tokens } = useTheme();
  const go = (matchId?: string) => {
    onClose();
    setTimeout(() => onScore(matchId), 240);
  };
  return (
    <AdaptiveSheet
      accessibilityLabel="Score a match"
      kind="dialog"
      onClose={onClose}
      testID="sheet-score"
      visible={visible}
    >
      <View style={[styles.head, { paddingHorizontal: tokens.space["4"] }]}>
        <Text
          accessibilityRole="header"
          style={styles.flex}
          variant="phone-heading"
        >
          Score a match
        </Text>
        <IconButton icon="close" label="Close" onPress={onClose} />
      </View>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: tokens.space["4"],
          paddingBottom: tokens.space["6"],
          gap: tokens.space["3"],
        }}
      >
        {matches.length ? (
          <>
            <Text tone="text-2" variant="phone-body">
              This session's matches, with their teams set. Scoring opens in
              Courtside.
            </Text>
            {matches.map((match) => (
              <CourtMatchRow
                key={match.id}
                match={match}
                onPress={() => go(match.id)}
              />
            ))}
          </>
        ) : (
          <EmptyState
            compact
            text="Courtside can score any match on your courts. A match made from this roster needs to be set up in Duna HQ first."
            title="No match set up for this session"
          />
        )}
        <ActionButton
          icon="score"
          label="Open Courtside"
          onPress={() => go()}
          testID="score-open-courtside"
        />
      </ScrollView>
    </AdaptiveSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
  },
  choices: { gap: 8 },
  choice: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
  },
  draft: { minHeight: 140 },
});
