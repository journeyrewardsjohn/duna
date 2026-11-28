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
  const queue = useMemo(() => {
    const key = `${STORAGE_PREFIX}:${organization}`;
    return new AttendanceQueue({
      storage: {
        read: () => AsyncStorage.getItem(key),
        write: (value) => AsyncStorage.setItem(key, value),
      },
      send: preview
        ? previewSender
        : client
          ? liveAttendanceSender(client)
          : async () => ({ kind: "retry" }),
    });
  }, [client, organization, preview]);
  const [state, setState] = useState<AttendanceQueueState>(
    EMPTY_ATTENDANCE_QUEUE,
  );
  const [sending, setSending] = useState<string | null>(null);

  useEffect(() => {
    let previous = queue.snapshot();
    const unsubscribe = queue.subscribe((next) => {
      // Counts only: a mark left the phone, or Duna did not apply one.
      const sent = previous.marks.length - next.marks.length;
      const conflicts = next.conflicts.length - previous.conflicts.length;
      if (conflicts > 0)
        log.warn("pro.attendance.conflict", {
          conflicts,
          queued: next.marks.length,
        });
      else if (sent > 0)
        log.info("pro.attendance.sent", { sent, queued: next.marks.length });
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
    [queue, sending, state],
  );

  return (
    <AttendanceContext.Provider value={api}>
      {children}
    </AttendanceContext.Provider>
  );
}

export function useAttendance(): AttendanceApi {
  const value = useContext(AttendanceContext);
  if (!value)
    throw new Error("useAttendance must be used inside AttendanceProvider");
  return value;
}
