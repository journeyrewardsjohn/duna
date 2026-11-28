/**
 * The three cancellations a director can make from a session screen (M-R4),
 * each with the backend's own preview of who gets what back, shown BEFORE
 * the verb (interaction kit `strong` tier):
 *
 * - a calendar session: `operator.sessionDetail` → `cancellationPreview`,
 *   then `operator.cancelCalendarSession` (refunds paid orders, tells
 *   everyone booked with the reason);
 * - a group session: `operator.participation.cancelPreview`, then
 *   `operator.participation.cancelSession` (the shared sheet in
 *   `SessionSheets.tsx` takes this preview);
 * - a player's court booking: `operator.schedule.cancelCourtBookingPreview`,
 *   then `operator.schedule.cancelCourtBooking` (SCHED-API). While the
 *   server has no such procedure the sheet says exactly that and the verb
 *   stays off: nothing is faked.
 */
import { StyleSheet, View } from "react-native";
import { Skeleton, Text, useTheme } from "@duna/ui/native";
import { useCallback, useEffect, useRef, useState } from "react";
import { useProRuntime } from "../../../runtime";
import { peekDevParam } from "../dev/dev-params";
import type { DunaApiClient } from "../../../mobile-api";
import {
  COURT_BOOKING_MISSING,
  isMissingProcedure,
  type CourtBookingCapability,
} from "./cancel-plan";
import {
  previewFromCourtBooking,
  previewFromGroup,
  previewFromSession,
  type CancelPreview,
  type CourtBookingPreviewInput,
} from "./cancel-preview";
import { ConfirmSheet } from "./ConfirmSheet";
import { DunaTextInput } from "./duna-text";
import { classifyFailure, type Failure } from "./failure";
import { Notice } from "./parts";
import { ChoiceList } from "./SessionSheets";
import { sessionWhen, type SessionDetail } from "./session-model";

type PreviewState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly preview: CancelPreview }
  | { readonly status: "missing" }
  | { readonly status: "failed"; readonly failure: Failure };

/** Loads a preview each time the sheet opens (and when its inputs change). */
function usePreview(
  visible: boolean,
  load: () => Promise<CancelPreview>,
  event: string,
  deps: readonly unknown[],
): PreviewState {
  const [state, setState] = useState<PreviewState>({ status: "loading" });
  const generation = useRef(0);
  useEffect(() => {
    if (!visible) return;
    const current = ++generation.current;
    setState({ status: "loading" });
    load().then(
      (preview) => {
        if (current === generation.current)
          setState({ status: "ready", preview });
      },
      (error: unknown) => {
        if (current !== generation.current) return;
        setState(
          isMissingProcedure(error)
            ? { status: "missing" }
            : { status: "failed", failure: classifyFailure(error, event) },
        );
      },
    );
  }, [visible, ...deps]);
  return state;
}

/** Who gets what back, one person per line, and the total. */
export function PreviewBlock({
  state,
  testID = "cancel-preview",
}: {
  readonly state: PreviewState;
  readonly testID?: string;
}) {
  const { colors, tokens } = useTheme();
  if (state.status === "loading")
    return (
      <View testID={testID}>
        <Skeleton count={2} kind="row" label="Working out who gets what back" />
      </View>
    );
  if (state.status === "missing")
    return (
      <Notice
        testID={`${testID}-missing`}
        text={COURT_BOOKING_MISSING}
        title="Pro can't cancel this booking yet"
        tone="warning"
      />
    );
  if (state.status === "failed")
    return (
      <Notice
        testID={`${testID}-failed`}
        text={[
          "Duna couldn't work out the refunds, so you can't cancel from here right now. Nothing was changed.",
          state.failure.reference
            ? `Reference ${state.failure.reference}`
            : undefined,
        ]
          .filter(Boolean)
          .join(" ")}
        title="No refund preview"
        tone="danger"
      />
    );
  const { preview } = state;
  return (
    <View
      style={[
        styles.preview,
        {
          backgroundColor: colors["surface-sunken"],
          borderRadius: tokens.radius.lg,
        },
      ]}
      testID={testID}
    >
      <Text tone="text-2" variant="phone-meta" weight={600}>
        Who gets what back
      </Text>
      {preview.lines.length ? (
        preview.lines.map((line) => (
          <View
            accessibilityLabel={`${line.name}: ${line.outcome}`}
            accessible
            key={line.key}
            style={styles.line}
          >
            <Text numberOfLines={1} style={styles.name} variant="phone-body">
              {line.name}
            </Text>
            <Text
              style={styles.outcome}
              tabular
              tone="text-2"
              variant="phone-meta"
            >
              {line.outcome}
            </Text>
          </View>
        ))
      ) : (
        <Text tone="text-2" variant="phone-meta">
          No one has paid for this.
        </Text>
      )}
      <Text tabular variant="phone-body" weight={600}>
        {preview.total}
      </Text>
      {preview.policy ? (
        <Text tone="text-2" variant="phone-meta">
          {preview.policy}
        </Text>
      ) : null}
    </View>
  );
}

function ReasonField({
  value,
  onChange,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  return (
    <>
      <Text tone="text-2" variant="phone-meta" weight={600}>
        Reason players will see
      </Text>
      <DunaTextInput
        accessibilityLabel="Reason players will see"
        maxLength={500}
        multiline
        onChangeText={onChange}
        placeholder="Weather, coach unavailable, court closed…"
        testID="cancel-reason"
        value={value}
      />
    </>
  );
}

/** A preview build: what the roster on screen says, nothing loaded. */
function previewFromRoster(detail: SessionDetail): CancelPreview {
  return {
    lines: detail.people
      .filter((person) => person.active)
      .map((person) => ({
        key: person.key,
        name: person.displayName,
        outcome: person.payment === "Paid" ? "Card refund" : "Nothing paid",
      })),
    total: "Preview: amounts come from Duna when you're signed in",
    refundChoice: false,
  };
}

type Client = DunaApiClient;

/** The group session's refund preview, inside the cancel-and-refund sheet. */
export function GroupCancelPreview({
  detail,
  visible,
}: {
  readonly detail: SessionDetail;
  readonly visible: boolean;
}) {
  const { client, mode } = useProRuntime();
  const subject = detail.subject;
  const load = useCallback(async (): Promise<CancelPreview> => {
    if (mode !== "live" || !client || !subject)
      return previewFromRoster(detail);
    return previewFromGroup(
      await client.operator.participation.cancelPreview.query(subject),
    );
  }, [client, detail, mode, subject]);
  const state = usePreview(visible, load, "pro.session.cancel_preview_failed", [
    subject?.subjectId,
  ]);
  return <PreviewBlock state={state} />;
}

/** Cancel a calendar session (director, strong tier). */
export function CancelCalendarSessionSheet({
  detail,
  visible,
  onClose,
  onDone,
}: {
  readonly detail: SessionDetail;
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly onDone: () => void;
}) {
  const { client, mode } = useProRuntime();
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (visible) setReason("");
  }, [visible]);
  const load = useCallback(async (): Promise<CancelPreview> => {
    if (mode !== "live" || !client) return previewFromRoster(detail);
    const result = await client.operator.sessionDetail.query({
      sessionId: detail.id,
    });
    return previewFromSession(result.cancellationPreview);
  }, [client, detail, mode]);
  const preview = usePreview(
    visible,
    load,
    "pro.session.cancel_preview_failed",
    [detail.id],
  );
  const roster = detail.people.filter((person) => person.active).length;
  return (
    <ConfirmSheet
      cancelLabel="Keep the session"
      description="The court and coach are released. Duna tells everyone booked, with your reason, and returns their money the way they paid."
      destructive
      event="pro.session.cancel_calendar_failed"
      notReadyHint={
        preview.status !== "ready"
          ? "Wait for the refund preview."
          : "Say why in a few words; players see it."
      }
      onClose={onClose}
      onDone={onDone}
      perform={async (key) => {
        if (mode !== "live" || !client) return;
        await cancelCalendarSession(client, detail.id, reason.trim(), key);
      }}
      ready={preview.status === "ready" && reason.trim().length >= 3}
      rows={[
        {
          label: "Who is told",
          value: `${roster} ${roster === 1 ? "person" : "people"}`,
        },
        { label: "Session", value: `${detail.title} · ${sessionWhen(detail)}` },
        { label: "What happens", value: "A cancellation cannot be undone." },
      ]}
      testID="sheet-cancel-session"
      tier={2}
      title={`Cancel ${detail.title}?`}
      verb="Cancel and refund"
      visible={visible}
    >
      <PreviewBlock state={preview} />
      <ReasonField onChange={setReason} value={reason} />
    </ConfirmSheet>
  );
}

function cancelCalendarSession(
  client: Client,
  sessionId: string,
  reason: string,
  idempotencyKey: string,
) {
  return client.operator.cancelCalendarSession.mutate({
    sessionId,
    reason,
    confirmed: true,
    idempotencyKey,
  });
}

/* ---------------------------------------------------------------- court */

type RefundChoice = "by-policy" | "full" | "none";
type Cause = "club" | "player-asked";

interface CourtBookingCancelResult {
  readonly status: "cancelled";
  readonly toTell: number;
  readonly sent: 0;
}

/**
 * The SCHED-API procedures, typed here from their contract
 * (`packages/api/src/contracts/schedule.ts`) so this screen builds before
 * and after they land. The preview call is the capability check: a router
 * without them answers "No procedure found" and the sheet says so.
 */
interface ScheduleCancelProcedures {
  readonly schedule: {
    readonly cancelCourtBookingPreview: {
      readonly query: (input: {
        readonly bookingId: string;
        readonly refund: RefundChoice;
        readonly cause: Cause;
      }) => Promise<
        CourtBookingPreviewInput & {
          readonly previewToken: string;
          readonly needsMoneyPermission: boolean;
        }
      >;
    };
    readonly cancelCourtBooking: {
      readonly mutate: (input: {
        readonly bookingId: string;
        readonly reason: string;
        readonly refund: RefundChoice;
        readonly cause: Cause;
        readonly confirmed: true;
        readonly previewToken?: string;
        readonly idempotencyKey: string;
      }) => Promise<CourtBookingCancelResult>;
    };
  };
}

function scheduleProcedures(client: Client): ScheduleCancelProcedures {
  return client.operator as unknown as ScheduleCancelProcedures;
}

const CAUSES: readonly { readonly value: Cause; readonly label: string }[] = [
  {
    value: "club",
    label: "The club is cancelling (weather, closure, our mistake)",
  },
  { value: "player-asked", label: "The player asked to cancel" },
];

const REFUNDS: readonly {
  readonly value: RefundChoice;
  readonly label: string;
}[] = [
  { value: "by-policy", label: "As the reservation policy says" },
  { value: "full", label: "A full refund" },
  { value: "none", label: "No refund" },
];

/** Cancel a player's court booking (director, strong tier). */
export function CancelCourtBookingSheet({
  detail,
  visible,
  onClose,
  onDone,
  onCapability,
}: {
  readonly detail: SessionDetail;
  readonly visible: boolean;
  readonly onClose: () => void;
  /** After it is cancelled: how many people a message draft is ready for. */
  readonly onDone: (result: { readonly toTell: number }) => void;
  readonly onCapability?: (capability: CourtBookingCapability) => void;
}) {
  const { client, mode } = useProRuntime();
  const [reason, setReason] = useState("");
  const [cause, setCause] = useState<Cause>("club");
  const [refund, setRefund] = useState<RefundChoice>("by-policy");
  const token = useRef<string | undefined>(undefined);
  const result = useRef<CourtBookingCancelResult | null>(null);
  useEffect(() => {
    if (!visible) return;
    setReason("");
    setCause("club");
    setRefund("by-policy");
  }, [visible]);
  const live = mode === "live" && Boolean(client);
  const load = useCallback(async (): Promise<CancelPreview> => {
    if (!live || !client) {
      // Preview builds: `court=missing` shows the state before SCHED-API lands.
      if (peekDevParam("court") === "missing")
        throw Object.assign(
          new Error(
            'No procedure found on path "operator.schedule.cancelCourtBookingPreview"',
          ),
          { data: { code: "NOT_FOUND" } },
        );
      return previewFromRoster(detail);
    }
    const preview = await scheduleProcedures(
      client,
    ).schedule.cancelCourtBookingPreview.query({
      bookingId: detail.id,
      refund: cause === "club" ? "full" : refund,
      cause,
    });
    token.current = preview.previewToken;
    return previewFromCourtBooking(preview);
  }, [cause, client, detail, live, refund]);
  const preview = usePreview(
    visible,
    load,
    "pro.booking.cancel_preview_failed",
    [detail.id, cause, refund],
  );
  useEffect(() => {
    if (preview.status === "missing") onCapability?.("missing");
    if (preview.status === "ready") onCapability?.("available");
  }, [onCapability, preview.status]);
  const missing = preview.status === "missing";
  return (
    <ConfirmSheet
      cancelLabel="Keep the booking"
      description={
        missing
          ? "The court stays booked and nobody's money changes."
          : "The court is released and the match and its invitations are cancelled. Money goes back the way each person paid, as shown below. Duna drafts a message for the players; you review it before it sends."
      }
      destructive
      event="pro.booking.cancel_failed"
      notReadyHint={
        missing
          ? "This needs the staff cancellation on Duna's server."
          : preview.status !== "ready"
            ? "Wait for the refund preview."
            : "Say why in a few words; players see it."
      }
      onClose={onClose}
      onDone={() => onDone({ toTell: result.current?.toTell ?? 0 })}
      perform={async (key) => {
        if (!live || !client) return;
        result.current = await scheduleProcedures(
          client,
        ).schedule.cancelCourtBooking.mutate({
          bookingId: detail.id,
          reason: reason.trim(),
          refund: cause === "club" ? "full" : refund,
          cause,
          confirmed: true,
          ...(token.current ? { previewToken: token.current } : {}),
          idempotencyKey: key,
        });
      }}
      ready={preview.status === "ready" && reason.trim().length >= 3}
      rows={[
        { label: "Booking", value: `${detail.title} · ${sessionWhen(detail)}` },
        {
          label: "What happens",
          value:
            "A cancellation cannot be undone; card refunds can take 5–10 business days.",
        },
      ]}
      testID="sheet-cancel-booking"
      tier={2}
      title={`Cancel ${detail.title}?`}
      verb="Cancel booking"
      visible={visible}
    >
      {missing ? null : (
        <>
          <ChoiceList
            label="Who is cancelling"
            onChange={setCause}
            options={CAUSES}
            value={cause}
          />
          {cause === "player-asked" ? (
            <ChoiceList
              label="Refund"
              onChange={setRefund}
              options={REFUNDS}
              value={refund}
            />
          ) : null}
        </>
      )}
      <PreviewBlock state={preview} />
      {missing ? null : <ReasonField onChange={setReason} value={reason} />}
    </ConfirmSheet>
  );
}

const styles = StyleSheet.create({
  preview: { padding: 14, gap: 10 },
  line: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12,
  },
  name: { flexShrink: 1 },
  outcome: { flexShrink: 0, maxWidth: "60%", textAlign: "right" },
});
