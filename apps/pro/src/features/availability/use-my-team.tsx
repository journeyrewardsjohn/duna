/**
 * Who I am on the club's team, and loading what is mine with the last good
 * copy kept for when there is no signal (M-R5).
 *
 * Identity: the API has no "my staff profile" read yet (Needs API:
 * `operator.teamAvailability.me`). Until it does, the signed-in person's
 * email is matched to the team list the workspace already holds
 * (`operator.workspace` → `staff`, the same list HQ's Team shows). No match
 * is shown as "not on this club's team", never guessed. Preview builds use
 * the demo club's coach.
 *
 * Reads keep the last successful answer on the device (AsyncStorage, one
 * key per club and member) and show it with a "last updated" line when a
 * refresh fails. Edits are never queued: a stale availability edit could
 * collide with bookings, so every write needs a connection.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { teamAvailabilityDemoStaff } from "@duna/core/demo/team-availability";
import { useWorkOSMobileAuth } from "@duna/mobile-auth";
import { log } from "@duna/observability";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useProRuntime } from "../../../runtime";
import { classifyFailure, type Failure } from "../session/failure";
import { useDay } from "../today/use-day";
import { findMe, type Me, type TeamRole } from "./identity";
import type { MySession } from "./week-model";

export type { Me, TeamRole };

export interface MyTeam {
  readonly me: Me;
  readonly preview: boolean;
  /** The club's time zone: every wall-clock time is the place's. */
  readonly timeZone: string;
  /** The club's key for the device cache. */
  readonly clubKey: string;
  /** Runs sessions (cover is offered to coaching roles only, as in B3a). */
  readonly coaches: boolean;
  /** Can decide time off and arrange cover ("members:write"). */
  readonly manages: boolean;
  /** Can change pay and goals ("payments:write": the owner). */
  readonly ownsPay: boolean;
}

export type MyTeamState =
  | { readonly status: "ready"; readonly team: MyTeam }
  | { readonly status: "not-on-team"; readonly preview: boolean };

const COACHING: ReadonlySet<TeamRole> = new Set([
  "coach",
  "director",
  "manager",
]);

function teamFor(
  me: Me,
  preview: boolean,
  timeZone: string,
  clubKey: string,
): MyTeam {
  return {
    me,
    preview,
    timeZone,
    clubKey,
    coaches: COACHING.has(me.role) || me.isOwner,
    manages: me.isOwner || me.role === "manager" || me.role === "director",
    ownsPay: me.isOwner,
  };
}

/** The demo coach (preview builds only). */
export const PREVIEW_ME: Me = {
  staffProfileId: teamAvailabilityDemoStaff.theo.staffProfileId,
  personId: teamAvailabilityDemoStaff.theo.personId,
  displayName: teamAvailabilityDemoStaff.theo.displayName,
  role: "coach",
  isOwner: false,
};

function LiveTeam({
  children,
}: {
  readonly children: (state: MyTeamState) => ReactNode;
}) {
  const runtime = useProRuntime();
  const auth = useWorkOSMobileAuth();
  const workspace = runtime.workspace;
  const state = useMemo<MyTeamState>(() => {
    const me = findMe(workspace?.staff ?? [], auth.user?.email);
    if (!me || !workspace) return { status: "not-on-team", preview: false };
    return {
      status: "ready",
      team: teamFor(
        me,
        false,
        workspace.organization.timezone,
        workspace.organization.id,
      ),
    };
  }, [auth.user?.email, workspace]);
  return <>{children(state)}</>;
}

function PreviewTeam({
  children,
}: {
  readonly children: (state: MyTeamState) => ReactNode;
}) {
  const day = useDay();
  const state = useMemo<MyTeamState>(
    () => ({
      status: "ready",
      team: teamFor(PREVIEW_ME, true, day.timeZone, "preview"),
    }),
    [day.timeZone],
  );
  return <>{children(state)}</>;
}

/**
 * Resolves me, then renders. The live branch reads the sign-in, which only
 * exists in live builds, so the two branches are separate components.
 */
export function MyTeamGate({
  children,
}: {
  readonly children: (state: MyTeamState) => ReactNode;
}) {
  const runtime = useProRuntime();
  return runtime.mode === "live" ? (
    <LiveTeam>{children}</LiveTeam>
  ) : (
    <PreviewTeam>{children}</PreviewTeam>
  );
}

/* --------------------------------------------------------------- reads */

export type LoadStatus = "loading" | "ready" | "failed";

export interface CachedLoad<T> {
  readonly status: LoadStatus;
  readonly data?: T;
  /** The last failure (with what is shown, when a copy is kept). */
  readonly failure?: Failure;
  /** When the shown data last came from Duna. */
  readonly lastFreshAt: Date | null;
  /** The data is the device's copy because the last refresh failed. */
  readonly stale: boolean;
  readonly refreshing: boolean;
  readonly reload: () => Promise<void>;
  /** Replace the data after a write (and keep it on the device). */
  readonly replace: (data: T) => void;
}

interface Envelope<T> {
  readonly savedAt: string;
  readonly data: T;
}

/** Reads a kept copy; a broken or missing one is ignored. Pure apart from storage. */
export async function readKept<T>(key: string): Promise<Envelope<T> | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Envelope<T>;
    return parsed && typeof parsed.savedAt === "string" && "data" in parsed
      ? parsed
      : null;
  } catch {
    return null;
  }
}

async function keep<T>(key: string, data: T): Promise<void> {
  try {
    await AsyncStorage.setItem(
      key,
      JSON.stringify({ savedAt: new Date().toISOString(), data }),
    );
  } catch {
    // The device copy is a convenience; losing it never blocks the screen.
  }
}

/**
 * One read with a device copy. `key` is null while there is nothing to
 * load. Failures become the shared states (offline, denied, not set up,
 * error with a reference).
 */
export function useCachedLoad<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  event: string,
): CachedLoad<T> {
  const [data, setData] = useState<T | undefined>();
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [failure, setFailure] = useState<Failure | undefined>();
  const [lastFreshAt, setLastFreshAt] = useState<Date | null>(null);
  const [stale, setStale] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const generation = useRef(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const hasData = useRef(false);

  const load = useCallback(async () => {
    if (!key) return;
    const current = ++generation.current;
    setRefreshing(true);
    try {
      const next = await fetcherRef.current();
      if (current !== generation.current) return;
      hasData.current = true;
      setData(next);
      setFailure(undefined);
      setStale(false);
      setStatus("ready");
      setLastFreshAt(new Date());
      void keep(key, next);
    } catch (error) {
      if (current !== generation.current) return;
      const classified = classifyFailure(error, event);
      setFailure(classified);
      if (hasData.current) {
        setStale(true);
        setStatus("ready");
      } else {
        setStatus("failed");
      }
      log.info("pro.team.read_failed", { event, kind: classified.kind });
    } finally {
      if (current === generation.current) setRefreshing(false);
    }
  }, [event, key]);

  useEffect(() => {
    hasData.current = false;
    setData(undefined);
    setStatus("loading");
    setFailure(undefined);
    setStale(false);
    setLastFreshAt(null);
    if (!key) return;
    let cancelled = false;
    void (async () => {
      const kept = await readKept<T>(key);
      if (cancelled) return;
      if (kept && !hasData.current) {
        hasData.current = true;
        setData(kept.data);
        setLastFreshAt(new Date(kept.savedAt));
        setStale(true);
        setStatus("ready");
      }
    })();
    void load();
    return () => {
      cancelled = true;
    };
  }, [key, load]);

  const replace = useCallback(
    (next: T) => {
      hasData.current = true;
      setData(next);
      setStale(false);
      setStatus("ready");
      setLastFreshAt(new Date());
      if (key) void keep(key, next);
    },
    [key],
  );

  return {
    status,
    ...(data !== undefined ? { data } : {}),
    ...(failure ? { failure } : {}),
    lastFreshAt,
    stale,
    refreshing,
    reload: load,
    replace,
  };
}

/* ------------------------------------------------------------ sessions */

/**
 * The sessions I lead from the calendar the app already holds (no extra
 * request): sessions and lessons where I am the coach, not cancelled.
 * Preview builds use the preview day's sessions.
 */
export function useMySessions(team: MyTeam | null): readonly MySession[] {
  const runtime = useProRuntime();
  const day = useDay();
  return useMemo(() => {
    if (!team) return [];
    if (team.preview) {
      return day.entries
        .filter(
          (entry) =>
            entry.sourceType === "session" && entry.status !== "cancelled",
        )
        .map((entry) => ({
          id: entry.id,
          title: entry.title,
          startsAt: entry.startsAt,
          endsAt: entry.endsAt,
          ...(entry.venueName ? { venueName: entry.venueName } : {}),
        }));
    }
    return (runtime.workspace?.calendar.entries ?? [])
      .filter(
        (entry) =>
          (entry.sourceType === "session" || entry.sourceType === "booking") &&
          entry.coachPersonId === team.me.personId &&
          entry.status !== "cancelled",
      )
      .map((entry) => ({
        id: entry.id,
        title: entry.title,
        startsAt: entry.startsAt,
        endsAt: entry.endsAt,
        ...(entry.venueName ? { venueName: entry.venueName } : {}),
      }));
  }, [day.entries, runtime.workspace, team]);
}

/** "duna-pro.team.<club>.<member>.<what>". */
export function keptKey(team: MyTeam, what: string): string {
  return `duna-pro.team.${team.clubKey}.${team.me.staffProfileId}.${what}`;
}
