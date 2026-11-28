/**
 * The coach's day from the Pro runtime (M-R0): the same workspace, matches
 * and dashboard the old Today and Calendar read, plus the participation
 * "at risk" list. Preview builds read `preview-day.ts`. Refreshes the clock
 * every minute so live, next and done move on their own.
 */
import { report } from "@duna/observability";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useProRuntime } from "../../../runtime";
import { previewOperatorMatches } from "../../shared/preview-operator-matches";
import {
  buildDayModel,
  type DayAtRiskInput,
  type DayEntryInput,
  type DayModel,
  type DayVenueInput,
} from "./day-model";
import {
  previewAtRisk,
  previewDayEntries,
  previewTimeZone,
  previewVenue,
} from "./preview-day";

const deviceTimeZone =
  Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

/** A failed request that never reached Duna (no connection). */
export function isNetworkFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /network request failed|network error|offline|internet connection|timed? ?out|failed to fetch/i.test(
    message,
  );
}

export type BlockStatus = "ready" | "loading" | "error" | "offline";

export interface DayData {
  readonly now: number;
  readonly timeZone: string;
  readonly entries: readonly DayEntryInput[];
  readonly venues: readonly DayVenueInput[];
  readonly status: BlockStatus;
  /** The error reference when a refresh failed. */
  readonly failure: string | null;
  readonly lastFreshAt: Date | null;
  /** The at-risk list: its own state, so a failure never hides the day. */
  readonly atRiskStatus: BlockStatus;
  readonly refresh: () => Promise<void>;
  readonly refreshing: boolean;
  readonly build: (dateKey?: string) => DayModel;
}

function useDayData(): DayData {
  const runtime = useProRuntime();
  const preview = runtime.mode === "preview";
  const [now, setNow] = useState(() => Date.now());
  const [refreshing, setRefreshing] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [lastFreshAt, setLastFreshAt] = useState<Date | null>(() =>
    runtime.workspace || preview ? new Date() : null,
  );
  const [atRisk, setAtRisk] = useState<readonly DayAtRiskInput[]>([]);
  const [atRiskStatus, setAtRiskStatus] = useState<BlockStatus>(
    preview ? "ready" : "loading",
  );

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const client = runtime.client;
  const loadAtRisk = useCallback(async () => {
    if (preview || !client) {
      setAtRiskStatus("ready");
      return;
    }
    setAtRiskStatus((current) => (current === "ready" ? current : "loading"));
    try {
      const from = new Date();
      const to = new Date(from.getTime() + 7 * 24 * 60 * 60_000);
      const result = await client.operator.participation.atRisk.query({
        from: from.toISOString(),
        to: to.toISOString(),
      });
      setAtRisk(result.sessions);
      setAtRiskStatus("ready");
    } catch (error) {
      if (isNetworkFailure(error)) {
        setAtRiskStatus("offline");
        return;
      }
      report(error, { event: "pro.today.at_risk_failed" });
      setAtRiskStatus("error");
    }
  }, [client, preview]);

  useEffect(() => {
    void loadAtRisk();
  }, [loadAtRisk]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await runtime.refresh();
      await loadAtRisk();
      setFailure(null);
      setOffline(false);
      setLastFreshAt(new Date());
      setNow(Date.now());
    } catch (error) {
      if (isNetworkFailure(error)) setOffline(true);
      else setFailure(report(error, { event: "pro.today.refresh_failed" }));
    } finally {
      setRefreshing(false);
    }
  }, [loadAtRisk, runtime]);

  const timeZone = preview
    ? previewTimeZone
    : (runtime.workspace?.organization.timezone ??
      runtime.dashboard?.organization.timezone ??
      deviceTimeZone);
  // Preview times are anchored to the hour; they move when it turns.
  const hour = preview ? now - (now % 3_600_000) : 0;
  const entries = useMemo<readonly DayEntryInput[]>(
    () =>
      preview
        ? previewDayEntries(hour)
        : (runtime.workspace?.calendar.entries ?? []),
    [preview, runtime.workspace, hour],
  );
  const venues = useMemo<readonly DayVenueInput[]>(
    () =>
      preview
        ? [previewVenue(hour)]
        : (runtime.workspace?.venues.map((venue) => ({
            id: venue.id,
            name: venue.name,
            ...(venue.locality ? { locality: venue.locality } : {}),
            ...(venue.latitude !== undefined
              ? { latitude: venue.latitude }
              : {}),
            ...(venue.longitude !== undefined
              ? { longitude: venue.longitude }
              : {}),
            ...(venue.weather
              ? {
                  weather: {
                    fetchedAt: venue.weather.fetchedAt,
                    hourly: venue.weather.hourly,
                  },
                }
              : {}),
            courts: venue.courts.map((court) => ({
              id: court.id,
              lit: court.lit,
            })),
          })) ?? []),
    [preview, runtime.workspace, hour],
  );
  const matches = preview ? previewOperatorMatches() : (runtime.matches ?? []);
  const risk = preview ? previewAtRisk(now) : atRisk;
  const unpaidBySession = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const entry of entries) {
      const unpaid = entry.attendees.filter(
        (attendee) => attendee.status === "payment-pending",
      ).length;
      if (unpaid > 0) counts[entry.id] = unpaid;
    }
    return counts;
  }, [entries]);

  const status: BlockStatus = offline
    ? "offline"
    : failure
      ? "error"
      : !preview && !runtime.workspace
        ? "loading"
        : "ready";

  const build = useCallback(
    (dateKey?: string) =>
      buildDayModel({
        entries,
        venues,
        matches,
        atRisk: risk,
        unpaidBySession,
        now,
        timeZone,
        ...(dateKey ? { dateKey } : {}),
      }),
    [entries, matches, now, risk, timeZone, unpaidBySession, venues],
  );

  return {
    now,
    timeZone,
    entries,
    venues,
    status,
    failure,
    lastFreshAt,
    atRiskStatus,
    refresh,
    refreshing,
    build,
  };
}

const DayContext = createContext<DayData | null>(null);

/** One day source for the whole shell: Today, Schedule and the sheet share it. */
export function DayProvider({ children }: { readonly children: ReactNode }) {
  const value = useDayData();
  return <DayContext.Provider value={value}>{children}</DayContext.Provider>;
}

export function useDay(): DayData {
  const value = useContext(DayContext);
  if (!value) throw new Error("useDay must be used inside DayProvider");
  return value;
}
