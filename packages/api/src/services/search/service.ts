/**
 * Search service (B10): `public.search.query`, `player.search.query`,
 * `public.search.suggest` and `public.search.session`.
 *
 * Every call: a per-address budget (the repo's database-backed limiter,
 * keyed by a one-way hash of the address), then the pure engine over the
 * candidates, then live group state for the visible page only. Logs carry
 * lengths, counts and kinds; never the typed text, a place, an address or
 * an id a person typed.
 */
import { createHash } from "node:crypto";
import { log } from "@duna/observability";
import type {
  SearchQueryInput,
  SearchResult,
  SearchResults,
  SearchSession,
} from "../../contracts/search";
import { normalizeSearchText } from "../../discovery-ranking";
import { loadDiscoverySources } from "../../discovery-service";
import { consumeRateLimit } from "../../rate-limit";
import { usesDemoData } from "../data-source";
import {
  discoveryCandidates,
  getReadOnlyDatabase,
  loadSessionCandidates,
  organizationsOf,
  publicCandidates,
  withLiveSessions,
  type CandidateSet,
} from "./candidates";
import {
  demoSearchCandidates,
  demoSearchSession,
  SEARCH_DEMO_NOW,
} from "./demo";
import {
  criteriaFromInput,
  milesToKm,
  runSearch,
  type SearchAvailability,
  type SearchCandidate,
  type SearchRun,
} from "./engine";
import {
  loadSessionParticipation,
  type SearchDatabase,
  type SessionParticipation,
  type SessionParticipationSubject,
} from "./participation";
import { loadSearchSession } from "./session";

/** Budgets per address: plenty for a person, a wall for a script. */
export const SEARCH_RATE_LIMITS = {
  /** A results page: 60 at once, 60 a minute. */
  query: { capacity: 60, refillPerMinute: 60 },
  /** Typeahead: 120 at once, 120 a minute. */
  suggest: { capacity: 120, refillPerMinute: 120 },
  /** A session page: 60 at once, 30 a minute. */
  session: { capacity: 60, refillPerMinute: 30 },
} as const;

export type SearchRoute = keyof typeof SEARCH_RATE_LIMITS;

export class SearchRateLimitError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super(
      `Lots of searches just now. Try again in ${retryAfterSeconds} seconds.`,
    );
    this.name = "SearchRateLimitError";
  }
}

export interface SearchCaller {
  readonly personId?: string;
  readonly ipAddress?: string;
  readonly now: Date;
}

function addressKey(ipAddress: string | undefined): string {
  if (!ipAddress) return "unknown";
  return createHash("sha256").update(ipAddress).digest("hex").slice(0, 32);
}

export async function enforceSearchRateLimit(
  route: SearchRoute,
  caller: SearchCaller,
): Promise<void> {
  const budget = SEARCH_RATE_LIMITS[route];
  let decision;
  try {
    decision = await consumeRateLimit({
      key: `search.${route}:${addressKey(caller.ipAddress)}`,
      capacity: budget.capacity,
      refillPerMinute: budget.refillPerMinute,
      now: caller.now,
    });
  } catch (error) {
    // The limiter failing must not take search down with it.
    log.warn("search.rateLimit.unavailable", {
      route,
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return;
  }
  if (!decision.allowed) {
    log.info("search.rateLimited", { route });
    throw new SearchRateLimitError(decision.retryAfterSeconds);
  }
}

/** Public candidates: the discovery map plus public sessions (cached a minute). */
async function loadPublicCandidateSet(
  database: SearchDatabase,
  now: Date,
): Promise<CandidateSet> {
  const [sources, sessions] = await Promise.all([
    loadDiscoverySources(now),
    loadSessionCandidates({ database, now, visibility: "public" }),
  ]);
  return {
    candidates: [...discoveryCandidates(sources), ...sessions.candidates],
    sessions: sessions.sessions,
    loadedAt: now.getTime(),
  };
}

function sessionAvailability(
  group: SessionParticipation | undefined,
): SearchAvailability {
  if (!group) return { state: "unknown" };
  const state = group.display.state;
  const spotsLeft = group.display.numbers.spotsLeft;
  return {
    state:
      state === "cancelled-low" || state === "cancelled-club"
        ? "not-bookable"
        : spotsLeft === 0
          ? "full"
          : spotsLeft <= 2
            ? "few-left"
            : "open",
    summary: group.copy.status,
  };
}

function uniqueTags(tags: readonly string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
}

export function toSearchResult(
  candidate: SearchCandidate,
  run: Pick<SearchRun, "distanceMiles">,
  availability: SearchAvailability,
): SearchResult {
  const miles = run.distanceMiles(candidate);
  return {
    id: candidate.search.resultId,
    kind: candidate.search.kind,
    entityId: candidate.search.entityId,
    title: candidate.title,
    ...(candidate.subtitle ? { subtitle: candidate.subtitle } : {}),
    path: candidate.href,
    ...(candidate.latitude !== undefined && candidate.longitude !== undefined
      ? { latitude: candidate.latitude, longitude: candidate.longitude }
      : {}),
    ...(candidate.search.locality
      ? { locality: candidate.search.locality }
      : {}),
    ...(candidate.startsAt ? { startsAt: candidate.startsAt } : {}),
    ...(candidate.endsAt ? { endsAt: candidate.endsAt } : {}),
    tags: uniqueTags(candidate.tags),
    ...(candidate.price ? { priceFrom: candidate.price } : {}),
    ...(miles !== undefined ? { distanceKm: milesToKm(miles) } : {}),
    availability,
  };
}

function toResults(
  run: SearchRun,
  groups: ReadonlyMap<string, SessionParticipation>,
): SearchResults {
  return {
    items: run.page.map((candidate) =>
      toSearchResult(
        candidate,
        run,
        candidate.search.sessionOccurrenceId
          ? sessionAvailability(
              groups.get(candidate.search.sessionOccurrenceId),
            )
          : (candidate.search.availability ?? { state: "unknown" }),
      ),
    ),
    ...(run.nextCursor ? { nextCursor: run.nextCursor } : {}),
    totalEstimate: run.totalEstimate,
    facets: {
      kinds: [...run.facets.kinds],
      tags: [...run.facets.tags],
    },
    ...(run.resultBounds ? { resultBounds: run.resultBounds } : {}),
  };
}

function whereMode(input: SearchQueryInput): string {
  if (input.where?.bounds) return "bounds";
  if (input.where?.near) return "near";
  if (input.where?.place) return "place";
  return "anywhere";
}

/**
 * One page of results. `includeMembers` (player.search) adds the
 * members-only sessions of the clubs the signed-in person belongs to; those
 * are read per request and never cached.
 */
export async function searchQuery(
  input: SearchQueryInput,
  caller: SearchCaller & { readonly includeMembers: boolean },
): Promise<SearchResults> {
  const started = Date.now();
  await enforceSearchRateLimit("query", caller);
  const criteria = criteriaFromInput(input);
  if (usesDemoData()) {
    const run = runSearch(
      demoSearchCandidates({ includeMembers: caller.includeMembers }),
      criteria,
      { now: SEARCH_DEMO_NOW, limit: input.limit, cursor: input.cursor },
    );
    return toResults(run, new Map());
  }
  const database = getReadOnlyDatabase();
  const shared = publicCandidates({
    now: caller.now,
    load: () => loadPublicCandidateSet(database, caller.now),
  });
  const [set, members] = await Promise.all([
    shared.value,
    caller.includeMembers && caller.personId
      ? organizationsOf(database, caller.personId).then((organizationIds) =>
          loadSessionCandidates({
            database,
            now: caller.now,
            visibility: "members",
            organizationIds,
          }),
        )
      : Promise.resolve(undefined),
  ]);
  const candidates = withLiveSessions(
    members ? [...set.candidates, ...members.candidates] : set.candidates,
    caller.now,
  );
  const run = runSearch(candidates, criteria, {
    now: caller.now,
    limit: input.limit,
    cursor: input.cursor,
  });
  const subjects: SessionParticipationSubject[] = [];
  for (const candidate of run.page) {
    const id = candidate.search.sessionOccurrenceId;
    const subject = id
      ? (set.sessions.get(id) ?? members?.sessions.get(id))
      : undefined;
    if (subject) subjects.push(subject);
  }
  const groups = await loadSessionParticipation({
    database,
    subjects,
    now: caller.now,
  });
  const results = toResults(run, groups);
  log.info("search.query.completed", {
    surface: caller.includeMembers ? "player" : "public",
    where: whereMode(input),
    kinds: criteria.kinds.length,
    tags: criteria.tags.length,
    dayparts: criteria.dayparts.length,
    textLength: criteria.text?.length ?? 0,
    hasWhen: Boolean(criteria.when),
    paged: Boolean(input.cursor),
    results: results.items.length,
    sessions: subjects.length,
    totalEstimate: results.totalEstimate,
    cached: shared.cached,
    durationMs: Date.now() - started,
  });
  return results;
}

/** Typeahead: Duna places (clubs and venues with a map point) and results. */
export async function searchSuggest(
  input: { readonly text: string },
  caller: SearchCaller,
): Promise<{
  places: { label: string; latitude: number; longitude: number }[];
  results: Pick<SearchResult, "id" | "kind" | "title" | "path">[];
}> {
  await enforceSearchRateLimit("suggest", caller);
  const text = normalizeSearchText(input.text);
  if (!text) return { places: [], results: [] };
  const candidates = usesDemoData()
    ? demoSearchCandidates({ includeMembers: false })
    : (
        await publicCandidates({
          now: caller.now,
          load: () => loadPublicCandidateSet(getReadOnlyDatabase(), caller.now),
        }).value
      ).candidates;
  const now = usesDemoData() ? SEARCH_DEMO_NOW : caller.now;
  const results = runSearch(
    candidates,
    { dayparts: [], kinds: [], groups: [], tags: [], text },
    { now, limit: 5 },
  );
  const places = runSearch(
    candidates.filter(
      (candidate) =>
        (candidate.search.kind === "club" ||
          candidate.search.kind === "venue") &&
        candidate.latitude !== undefined &&
        candidate.longitude !== undefined,
    ),
    { dayparts: [], kinds: [], groups: [], tags: [], text },
    { now, limit: 5 },
  );
  log.info("search.suggest.completed", {
    textLength: text.length,
    places: places.page.length,
    results: results.page.length,
  });
  return {
    places: places.page.map((candidate) => ({
      label: candidate.search.locality
        ? `${candidate.title}, ${candidate.search.locality}`
        : candidate.title,
      latitude: candidate.latitude!,
      longitude: candidate.longitude!,
    })),
    results: results.page.map((candidate) => ({
      id: candidate.search.resultId,
      kind: candidate.search.kind,
      title: candidate.title,
      path: candidate.href,
    })),
  };
}

/** One session by id, or "not found" (also when the caller may not see it). */
export async function searchSession(
  input: { readonly id: string; readonly viewerTimeZone?: string },
  caller: SearchCaller,
): Promise<SearchSession> {
  await enforceSearchRateLimit("session", caller);
  if (usesDemoData()) return demoSearchSession(input.id);
  const session = await loadSearchSession({
    database: getReadOnlyDatabase(),
    id: input.id,
    personId: caller.personId,
    viewerTimeZone: input.viewerTimeZone,
    now: caller.now,
  });
  log.info("search.session.completed", {
    signedIn: Boolean(caller.personId),
    displayState: session.participation.displayState,
  });
  return session;
}
