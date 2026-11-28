/**
 * Loads one session for the session and attendance screens (M-R2).
 *
 * 1. A calendar session comes straight from the workspace the runtime
 *    already holds (no request), joined with the at-risk list.
 * 2. A group session known from the at-risk list shows at once from it,
 *    then its roster arrives from `operator.catalogSessionOccurrences`.
 * 3. Otherwise the occurrences around now are searched for the id.
 *
 * Preview builds read the preview day. Failures become the shared states
 * (offline, permission denied, not configured, error with a reference).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useProRuntime } from "../../../runtime";
import { useDay } from "../today/use-day";
import { classifyFailure, type Failure } from "./failure";
import { previewCalendarSession } from "./preview-session";
import {
  sessionFromAtRisk,
  sessionFromCalendar,
  sessionFromOccurrence,
  withAtRisk,
  type OccurrenceInput,
  type SessionDetail,
} from "./session-model";

export type SessionLoad =
  | { readonly status: "loading" }
  | {
      readonly status: "ready";
      readonly detail: SessionDetail;
      readonly occurrence?: OccurrenceInput;
      /** The roster is still loading (the at-risk row arrived first). */
      readonly rosterLoading: boolean;
      /** A refresh failed; what is shown may be out of date. */
      readonly failure?: Failure;
    }
  | { readonly status: "not-found" }
  | { readonly status: "failed"; readonly failure: Failure };

const DAY = 24 * 60 * 60_000;

export function useSession(sessionId: string | undefined): {
  readonly load: SessionLoad;
  readonly reload: () => Promise<void>;
  readonly preview: boolean;
} {
  const runtime = useProRuntime();
  const day = useDay();
  const preview = runtime.mode === "preview";
  const client = runtime.client;
  const [occurrence, setOccurrence] = useState<OccurrenceInput | undefined>();
  const [failure, setFailure] = useState<Failure | undefined>();
  const [fetching, setFetching] = useState(false);
  const [searched, setSearched] = useState(false);
  const generation = useRef(0);

  const calendarEntry = useMemo(() => {
    if (!sessionId) return undefined;
    if (preview) {
      const entry = day.entries.find((candidate) => candidate.id === sessionId);
      return entry ? previewCalendarSession(entry) : undefined;
    }
    return runtime.workspace?.calendar.entries.find(
      (candidate) => candidate.id === sessionId,
    );
  }, [day.entries, preview, runtime.workspace, sessionId]);
  const risk = useMemo(
    () => day.atRisk.find((candidate) => candidate.subjectId === sessionId),
    [day.atRisk, sessionId],
  );

  const fetchOccurrence = useCallback(async () => {
    if (preview || !client || !sessionId || calendarEntry) return;
    const current = ++generation.current;
    setFetching(true);
    try {
      const anchor = risk ? Date.parse(risk.startsAt) : Date.now();
      const result = await client.operator.catalogSessionOccurrences.query({
        ...(risk?.catalogItemId ? { catalogItemId: risk.catalogItemId } : {}),
        from: new Date(anchor - (risk ? DAY : 2 * DAY)).toISOString(),
        to: new Date(anchor + (risk ? DAY : 30 * DAY)).toISOString(),
      });
      if (current !== generation.current) return;
      setOccurrence(result.find((candidate) => candidate.id === sessionId));
      setFailure(undefined);
    } catch (error) {
      if (current !== generation.current) return;
      setFailure(classifyFailure(error, "pro.session.load_failed"));
    } finally {
      if (current === generation.current) {
        setFetching(false);
        setSearched(true);
      }
    }
  }, [calendarEntry, client, preview, risk, sessionId]);

  useEffect(() => {
    setOccurrence(undefined);
    setFailure(undefined);
    setSearched(false);
  }, [sessionId]);

  useEffect(() => {
    void fetchOccurrence();
  }, [fetchOccurrence]);

  const reload = useCallback(async () => {
    if (preview) return;
    await Promise.allSettled([runtime.refresh(), day.refresh()]);
    await fetchOccurrence();
  }, [day, fetchOccurrence, preview, runtime]);

  const coachName = risk?.coachNames?.length
    ? risk.coachNames.join(", ")
    : undefined;
  const load = useMemo<SessionLoad>(() => {
    if (!sessionId) return { status: "not-found" };
    if (calendarEntry) {
      return {
        status: "ready",
        detail: withAtRisk(
          sessionFromCalendar(calendarEntry, day.timeZone),
          risk,
        ),
        rosterLoading: false,
        ...(failure ? { failure } : {}),
      };
    }
    if (occurrence) {
      return {
        status: "ready",
        detail: sessionFromOccurrence(
          occurrence,
          coachName ? { coachName } : {},
        ),
        occurrence,
        rosterLoading: false,
        ...(failure ? { failure } : {}),
      };
    }
    if (risk) {
      return {
        status: "ready",
        detail: sessionFromAtRisk(risk, day.timeZone),
        rosterLoading: fetching || (!searched && !failure),
        ...(failure ? { failure } : {}),
      };
    }
    if (failure) return { status: "failed", failure };
    if (preview || !client) return { status: "not-found" };
    if (!searched || fetching) return { status: "loading" };
    return { status: "not-found" };
  }, [
    calendarEntry,
    client,
    coachName,
    day.timeZone,
    failure,
    fetching,
    occurrence,
    preview,
    risk,
    searched,
    sessionId,
  ]);

  return { load, reload, preview };
}
