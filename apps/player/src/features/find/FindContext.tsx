/**
 * Find's shared state (M-P1): the search, its results, the selection the
 * list and the map share, the person's location and recent places. One
 * provider wraps the whole Find tab, so the list, the map (in another pane
 * on the open Duo and iPad), a pushed session and the search sheet all read
 * the same thing, and nothing reloads when the window changes size.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { participationDemo } from "@duna/core/demo/participation";
import { demoOrganization, demoVenues } from "@duna/core/demo";
import { report } from "@duna/observability";
import * as Location from "expo-location";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePlayerRuntime } from "../../../runtime";
import type { MobileCoach } from "../coaches/coach-format";
import {
  EMPTY_CRITERIA,
  criteriaForIntent,
  parseRecents,
  pushRecent,
  runFindSearch,
  type FindCriteria,
  type FindOutcome,
  type FindResult,
  type FindWhere,
} from "./find-search";
import {
  previewSessions,
  sessionResult,
  sessionsFromStorefront,
  type FindSession,
} from "./find-sessions";

const RECENTS_KEY = "duna.find.recent-places";
/** How many of the person's clubs Find reads sessions from. */
const CLUB_LIMIT = 4;

export type FindStep = "where" | "when" | "what";
/** Legacy sheets Find still opens over itself (coach profile, Pro Tour). */
export type FindOverlay =
  | { readonly kind: "pro-tour"; readonly slug?: string }
  | { readonly kind: "coach"; readonly coach: MobileCoach }
  | null;
export type LocationStatus = "unknown" | "granted" | "denied" | "locating";
export type SessionsStatus = "idle" | "loading" | "ready" | "error";

export interface FindState {
  readonly criteria: FindCriteria;
  readonly setCriteria: (next: FindCriteria) => void;
  readonly applyIntent: (
    intent:
      "find-match" | "book-court" | "join-event" | "watch-pros" | "search",
  ) => void;
  readonly outcome: FindOutcome;
  readonly results: readonly FindResult[];
  readonly loading: boolean;
  readonly offline: boolean;
  readonly sessionsStatus: SessionsStatus;
  readonly sessionsReference?: string;
  readonly retry: () => void;
  readonly selectedId: string | null;
  readonly select: (id: string | null) => void;
  readonly searchStep: FindStep | null;
  readonly openSearch: (step: FindStep) => void;
  readonly closeSearch: () => void;
  readonly phoneView: "list" | "map";
  readonly setPhoneView: (view: "list" | "map") => void;
  readonly recents: readonly FindWhere[];
  readonly rememberPlace: (where: FindWhere) => void;
  readonly forgetPlace: (where: FindWhere) => void;
  readonly location: LocationStatus;
  /** Asks for location only when the person taps "Use my location". */
  readonly locate: () => Promise<FindWhere | null>;
  readonly yourOrganizationIds: ReadonlySet<string>;
  readonly sessionById: (id: string) => FindSession | undefined;
  readonly preview: boolean;
  readonly overlay: FindOverlay;
  readonly setOverlay: (overlay: FindOverlay) => void;
}

const FindContext = createContext<FindState | null>(null);

export function useFind(): FindState {
  const value = useContext(FindContext);
  if (!value) throw new Error("useFind must be used inside FindProvider");
  return value;
}

export function useOptionalFind(): FindState | null {
  return useContext(FindContext);
}

function isOfflineError(reason: unknown): boolean {
  return (
    reason instanceof Error &&
    /network request failed|offline|internet/i.test(reason.message)
  );
}

export function FindProvider({ children }: { readonly children: ReactNode }) {
  const runtime = usePlayerRuntime();
  const [criteria, setCriteria] = useState<FindCriteria>(EMPTY_CRITERIA);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchStep, setSearchStep] = useState<FindStep | null>(null);
  const [phoneView, setPhoneView] = useState<"list" | "map">("list");
  const [recents, setRecents] = useState<readonly FindWhere[]>([]);
  const [location, setLocation] = useState<LocationStatus>("unknown");
  const [sessions, setSessions] = useState<readonly FindSession[]>([]);
  const [sessionsStatus, setSessionsStatus] = useState<SessionsStatus>("idle");
  const [sessionsReference, setSessionsReference] = useState<string>();
  const [offline, setOffline] = useState(false);
  const [reload, setReload] = useState(0);
  const [overlay, setOverlay] = useState<FindOverlay>(null);
  const preview = runtime.mode === "preview";

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(RECENTS_KEY)
      .then((value) => {
        if (active) setRecents(parseRecents(value));
      })
      .catch(() => undefined);
    // Read the permission without asking: Find never prompts on open.
    void Location.getForegroundPermissionsAsync()
      .then((permission) => {
        if (!active) return;
        if (permission.granted) setLocation("granted");
        else if (!permission.canAskAgain) setLocation("denied");
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const clubs = useMemo(() => {
    const seen = new Set<string>();
    return (runtime.organizationWallets ?? [])
      .filter((wallet) => wallet.status === "active")
      .filter((wallet) => {
        if (seen.has(wallet.organizationSlug)) return false;
        seen.add(wallet.organizationSlug);
        return true;
      })
      .slice(0, CLUB_LIMIT);
  }, [runtime.organizationWallets]);

  const yourOrganizationIds = useMemo(
    () => new Set(clubs.map((club) => club.organizationId)),
    [clubs],
  );

  // Group sessions: the person's clubs' storefronts (live) or the
  // participation fixtures (preview builds, where nothing can be booked).
  useEffect(() => {
    if (preview) {
      const venue = demoVenues[0];
      setSessions(
        previewSessions({
          quotes: participationDemo.quotes,
          club: {
            id: demoOrganization.id,
            slug: demoOrganization.slug,
            name: demoOrganization.name,
          },
          ...(venue?.latitude !== undefined && venue.longitude !== undefined
            ? {
                place: {
                  name: venue.name,
                  latitude: venue.latitude,
                  longitude: venue.longitude,
                },
              }
            : {}),
        }),
      );
      setSessionsStatus("ready");
      return;
    }
    const client = runtime.publicClient ?? runtime.client;
    if (!client || clubs.length === 0) {
      setSessions([]);
      setSessionsStatus("ready");
      return;
    }
    let active = true;
    setSessionsStatus("loading");
    const viewerTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    void Promise.allSettled(
      clubs.map((club) =>
        client.public.organizationStorefront.query({
          slug: club.organizationSlug,
        }),
      ),
    ).then((settled) => {
      if (!active) return;
      const now = new Date();
      const loaded = settled.flatMap((result) =>
        result.status === "fulfilled"
          ? sessionsFromStorefront(result.value, now, viewerTimeZone)
          : [],
      );
      const failure = settled.find(
        (result): result is PromiseRejectedResult =>
          result.status === "rejected",
      );
      setSessions(loaded);
      setOffline(Boolean(failure && isOfflineError(failure.reason)));
      if (failure && loaded.length === 0) {
        setSessionsStatus("error");
        setSessionsReference(
          isOfflineError(failure.reason)
            ? undefined
            : report(failure.reason, { event: "player.find.sessions_failed" }),
        );
      } else {
        setSessionsStatus("ready");
        setSessionsReference(undefined);
      }
    });
    return () => {
      active = false;
    };
  }, [clubs, preview, reload, runtime.client, runtime.publicClient]);

  const items = useMemo(
    () => runtime.discoveryMap?.items ?? [],
    [runtime.discoveryMap],
  );

  const outcome = useMemo(
    () =>
      runFindSearch({
        items,
        sessions,
        criteria,
        yourOrganizationIds,
        sessionResult: (session) =>
          sessionResult(session, {
            yours: yourOrganizationIds.has(session.club.id),
          }),
      }),
    [criteria, items, sessions, yourOrganizationIds],
  );
  const results = useMemo(
    () => outcome.groups.flatMap((group) => group.results),
    [outcome],
  );

  const rememberPlace = useCallback((where: FindWhere) => {
    setRecents((current) => {
      const next = pushRecent(current, where);
      void AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(next)).catch(
        () => undefined,
      );
      return next;
    });
  }, []);
  const forgetPlace = useCallback((where: FindWhere) => {
    setRecents((current) => {
      const next = current.filter((recent) => recent.label !== where.label);
      void AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(next)).catch(
        () => undefined,
      );
      return next;
    });
  }, []);

  const locate = useCallback(async (): Promise<FindWhere | null> => {
    setLocation("locating");
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setLocation("denied");
        return null;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setLocation("granted");
      const coordinates = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      const places = await Location.reverseGeocodeAsync(coordinates).catch(
        () => [],
      );
      const area = [places[0]?.city, places[0]?.region]
        .filter(Boolean)
        .join(", ");
      return { kind: "current", label: area || "Near you", ...coordinates };
    } catch (reason) {
      setLocation("unknown");
      report(reason, { event: "player.find.locate_failed" });
      return null;
    }
  }, []);

  const sessionById = useCallback(
    (id: string) => sessions.find((session) => session.id === id),
    [sessions],
  );

  const value = useMemo<FindState>(
    () => ({
      criteria,
      setCriteria,
      applyIntent: (intent) =>
        setCriteria((current) => criteriaForIntent(intent, current)),
      outcome,
      results,
      loading:
        (!runtime.discoveryMap && !preview) || sessionsStatus === "loading",
      offline: offline || Boolean(runtime.isOffline),
      sessionsStatus,
      ...(sessionsReference ? { sessionsReference } : {}),
      retry: () => {
        setReload((count) => count + 1);
        void runtime.refresh().catch(() => undefined);
      },
      selectedId,
      select: setSelectedId,
      searchStep,
      openSearch: setSearchStep,
      closeSearch: () => setSearchStep(null),
      phoneView,
      setPhoneView,
      recents,
      rememberPlace,
      forgetPlace,
      location,
      locate,
      yourOrganizationIds,
      sessionById,
      preview,
      overlay,
      setOverlay,
    }),
    [
      criteria,
      forgetPlace,
      locate,
      location,
      offline,
      outcome,
      overlay,
      phoneView,
      preview,
      recents,
      rememberPlace,
      results,
      runtime,
      searchStep,
      selectedId,
      sessionById,
      sessionsReference,
      sessionsStatus,
      yourOrganizationIds,
    ],
  );

  return <FindContext.Provider value={value}>{children}</FindContext.Provider>;
}
