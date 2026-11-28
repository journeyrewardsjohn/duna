/**
 * The device's attendance queue for the whole app (M-R2): one queue per
 * organisation, kept in AsyncStorage, flushed when the app comes back to the
 * foreground and on the queue's own timer. Screens enqueue, undo and read
 * what is still "saved on this phone"; nothing here renders.
 *
 * Logs carry counts and outcomes only: never names, booking ids or marks.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { log } from "@duna/observability";
import * as Crypto from "expo-crypto";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AppState } from "react-native";
import type { DunaApiClient } from "../../../mobile-api";
import { useProRuntime } from "../../../runtime";
import {
  AttendanceQueue,
  EMPTY_ATTENDANCE_QUEUE,
  pendingForSession,
  type AttendanceMark,
  type AttendanceQueueState,
  type AttendanceSendResult,
  type AttendanceSender,
  type AttendanceStatus,
  type AttendanceTarget,
} from "./attendance-queue";
import { errorCode, errorMessage, isRetryable } from "./failure";

const STORAGE_PREFIX = "duna-pro.attendance-queue.v1";

/** Sends one mark to Duna; the queue's `AttendanceSender`. */
export function liveAttendanceSender(client: DunaApiClient): AttendanceSender {
  return async (mark: AttendanceMark): Promise<AttendanceSendResult> => {
    try {
      if (mark.target === "participation") {
        if (mark.status === "unmarked") return { kind: "sent" };
        const result =
          await client.operator.participation.recordAttendance.mutate({
            subjectType: "catalog-session-occurrence",
            subjectId: mark.sessionId,
            marks: [
              {
                bookingId: mark.bookingId,
                status: mark.status,
                deviceMarkedAt: mark.deviceMarkedAt,
              },
            ],
            idempotencyKey: mark.id,
          });
        const ignored = result.ignored[0];
        return ignored
          ? { kind: "ignored", reason: ignored.reason }
          : { kind: "sent" };
      }
      await client.operator.recordSessionAttendance.mutate({
        registrationId: mark.bookingId,
        status:
          mark.status === "attended"
            ? "attended"
            : mark.status === "absent"
              ? "no-show"
              : "scheduled",
        note: "Marked courtside in Duna Pro.",
        idempotencyKey: mark.id,
      });
      return { kind: "sent" };
    } catch (error) {
      if (isRetryable(error)) return { kind: "retry" };
      const code = errorCode(error);
      return {
        kind: "rejected",
        message:
          code === "FORBIDDEN"
            ? `You can't mark attendance for this session, so ${mark.personName}'s mark was not saved.`
            : (errorMessage(error) ??
              `Duna did not save the mark for ${mark.personName}.`),
      };
    }
  };
}

/** Preview builds: marks "send" after a short pause; nothing leaves the phone. */
const previewSender: AttendanceSender = () =>
  new Promise((resolve) => setTimeout(() => resolve({ kind: "sent" }), 700));

export interface AttendanceApi {
  readonly state: AttendanceQueueState;
  /**
   * Marks Duna accepted in this run of the app ("session:booking" → status):
   * shown until the roster reloads with them.
   */
  readonly applied: ReadonlyMap<string, AttendanceStatus>;
  /** The mark being sent now. */
  readonly sending: string | null;
  readonly mark: (input: {
    readonly target: AttendanceTarget;
    readonly sessionId: string;
    readonly bookingId: string;
    readonly personName: string;
    readonly status: AttendanceStatus;
  }) => string;
  readonly undo: (id: string) => boolean;
  readonly dismiss: (id: string) => void;
  readonly flush: () => Promise<void>;
}

const AttendanceContext = createContext<AttendanceApi | null>(null);

export function AttendanceProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const runtime = useProRuntime();
  const preview = runtime.mode === "preview";
  const client = runtime.client;
  const organization =
    runtime.activeAuthOrganizationId ??
    runtime.dashboard?.organization.id ??
    (preview ? "preview" : "signed-out");
  const [applied, setApplied] = useState<ReadonlyMap<string, AttendanceStatus>>(
    () => new Map(),
  );
  const queue = useMemo(() => {
    const key = `${STORAGE_PREFIX}:${organization}`;
    const base: AttendanceSender = preview
      ? previewSender
      : client
        ? liveAttendanceSender(client)
        : async () => ({ kind: "retry" });
    // Outcome, attempts and delay only: never names, ids or the mark itself.
    const send: AttendanceSender = async (mark) => {
      const result = await base(mark);
      log.info("pro.attendance.send", {
        outcome: result.kind,
        attempts: mark.attempts + 1,
        offlineQueued: mark.attempts > 0,
        delaySeconds: Math.max(
          0,
          Math.round((Date.now() - Date.parse(mark.deviceMarkedAt)) / 1000),
        ),
      });
      if (result.kind === "sent")
        setApplied((current) =>
          new Map(current).set(
            `${mark.sessionId}:${mark.bookingId}`,
            mark.status,
          ),
        );
      return result;
    };
    return new AttendanceQueue({
      storage: {
        read: () => AsyncStorage.getItem(key),
        write: (value) => AsyncStorage.setItem(key, value),
      },
      send,
    });
  }, [client, organization, preview]);
  const [state, setState] = useState<AttendanceQueueState>(
    EMPTY_ATTENDANCE_QUEUE,
  );
  const [sending, setSending] = useState<string | null>(null);

  useEffect(() => {
    let previous = queue.snapshot();
    const unsubscribe = queue.subscribe((next) => {
      // Counts only: Duna answered a mark but kept something else.
      const conflicts = next.conflicts.length - previous.conflicts.length;
      if (conflicts > 0)
        log.warn("pro.attendance.conflict", {
          conflicts,
          queued: next.marks.length,
        });
      previous = next;
      setState(next);
      setSending(queue.sending());
    });
    void queue.load().then(() => queue.flush());
    const appState = AppState.addEventListener("change", (status) => {
      if (status === "active") void queue.flush();
    });
    return () => {
      unsubscribe();
      appState.remove();
      queue.dispose();
    };
  }, [queue]);

  const api = useMemo<AttendanceApi>(
    () => ({
      state,
      applied,
      sending,
      mark: (input) => {
        const id = Crypto.randomUUID();
        queue.enqueue({ id, ...input, at: Date.now() });
        return id;
      },
      undo: (id) => queue.undo(id),
      dismiss: (id) => queue.dismiss(id),
      flush: () => queue.flush(),
    }),
    [applied, queue, sending, state],
  );

  return (
    <AttendanceContext.Provider value={api}>
      {children}
    </AttendanceContext.Provider>
  );
}

/**
 * One session's marks as the phone knows them: `effective` (accepted this
 * run, then still on the phone, newest wins) for display; `onPhone` for the
 * "saved on this phone" sign.
 */
export function sessionMarks(
  api: Pick<AttendanceApi, "applied" | "state">,
  sessionId: string,
): {
  readonly effective: ReadonlyMap<string, AttendanceStatus>;
  readonly onPhone: ReadonlySet<string>;
  readonly pending: number;
} {
  const effective = new Map<string, AttendanceStatus>();
  const prefix = `${sessionId}:`;
  for (const [key, status] of api.applied) {
    if (key.startsWith(prefix)) effective.set(key.slice(prefix.length), status);
  }
  const pending = pendingForSession(api.state, sessionId);
  for (const mark of pending) effective.set(mark.bookingId, mark.status);
  return {
    effective,
    onPhone: new Set(pending.map((mark) => mark.bookingId)),
    pending: pending.length,
  };
}

export function useAttendance(): AttendanceApi {
  const value = useContext(AttendanceContext);
  if (!value)
    throw new Error("useAttendance must be used inside AttendanceProvider");
  return value;
}
