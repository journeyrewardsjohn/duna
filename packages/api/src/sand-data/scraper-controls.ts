import { getDatabase, isDatabaseConfigured, scraperControls } from "@duna/db";
import { asc } from "drizzle-orm";
import { SandDataUpstreamError, type SandDataSource } from "./types";

export type ManagedScraperSource = SandDataSource;
export type ScraperEnginePreference = "auto" | "native" | "firecrawl";
export type LiveTransportHealthStatus =
  "idle" | "healthy" | "degraded" | "unavailable" | "paused";

export interface ScraperControl {
  readonly source: ManagedScraperSource;
  readonly enabled: boolean;
  readonly engine: ScraperEnginePreference;
  readonly minRequestIntervalMs: number;
  readonly maxRequestsPerHour: number;
  readonly linkedPlayerActiveRefreshHours?: number;
  readonly linkedPlayerIdleRefreshHours?: number;
  readonly activePlayerWindowDays?: number;
  readonly activeEventRefreshMinutes?: number;
  readonly completedEventGraceHours?: number;
  readonly liveTransportEnabled: boolean;
  readonly liveRefreshSeconds?: number;
  readonly liveRestFallbackSeconds?: number;
  readonly liveHealth?: {
    readonly status: LiveTransportHealthStatus;
    readonly checkedAt?: string;
    readonly latencyMs?: number;
    readonly detail: Readonly<Record<string, unknown>>;
  };
  readonly firecrawlCacheTtlSeconds?: number;
  readonly firecrawlChangeTracking: boolean;
}

type ScraperControlInsert = typeof scraperControls.$inferInsert;

const defaults: Readonly<Record<ManagedScraperSource, ScraperControl>> = {
  "avp-league": {
    source: "avp-league",
    enabled: true,
    engine: "firecrawl",
    minRequestIntervalMs: 5_000,
    maxRequestsPerHour: 60,
    liveTransportEnabled: false,
    firecrawlCacheTtlSeconds: 3_600,
    firecrawlChangeTracking: true,
  },
  "avp-tournaments": {
    source: "avp-tournaments",
    enabled: true,
    // AVP exposes this feed as JSON with permissive CORS; rendering the
    // bracket page adds no data and needlessly spends scraping capacity.
    engine: "native",
    minRequestIntervalMs: 750,
    maxRequestsPerHour: 120,
    activeEventRefreshMinutes: 5,
    completedEventGraceHours: 48,
    liveTransportEnabled: true,
    liveRefreshSeconds: 60,
    liveRestFallbackSeconds: 15,
    firecrawlChangeTracking: false,
  },
  bvbinfo: {
    source: "bvbinfo",
    enabled: true,
    engine: "auto",
    minRequestIntervalMs: 4_000,
    maxRequestsPerHour: 120,
    linkedPlayerActiveRefreshHours: 24,
    linkedPlayerIdleRefreshHours: 720,
    activePlayerWindowDays: 14,
    liveTransportEnabled: false,
    firecrawlCacheTtlSeconds: 86_400,
    firecrawlChangeTracking: true,
  },
  "fivb-12ndr": {
    source: "fivb-12ndr",
    enabled: true,
    engine: "auto",
    minRequestIntervalMs: 5_000,
    maxRequestsPerHour: 90,
    // This is the slower event-detail page import. Official live scores are
    // transported separately by Volleyball World's socket and REST feeds.
    activeEventRefreshMinutes: 120,
    completedEventGraceHours: 48,
    liveTransportEnabled: false,
    firecrawlCacheTtlSeconds: 900,
    firecrawlChangeTracking: true,
  },
  "volleyball-life": {
    source: "volleyball-life",
    enabled: true,
    engine: "native",
    minRequestIntervalMs: 2_500,
    maxRequestsPerHour: 180,
    linkedPlayerActiveRefreshHours: 6,
    linkedPlayerIdleRefreshHours: 168,
    activePlayerWindowDays: 14,
    liveTransportEnabled: false,
    firecrawlChangeTracking: false,
  },
  "volleyball-world": {
    source: "volleyball-world",
    enabled: true,
    engine: "native",
    minRequestIntervalMs: 1_000,
    maxRequestsPerHour: 60,
    liveTransportEnabled: true,
    liveRefreshSeconds: 60,
    liveRestFallbackSeconds: 30,
    firecrawlChangeTracking: false,
  },
};

const sources = Object.keys(defaults) as ManagedScraperSource[];
let cached:
  | { readonly expiresAt: number; readonly rows: readonly ScraperControl[] }
  | undefined;

function toControl(row: typeof scraperControls.$inferSelect): ScraperControl {
  const source = row.source as ManagedScraperSource;
  const fallback = defaults[source];
  if (!fallback)
    throw new Error(`Unsupported scraper control source: ${row.source}`);
  const status = row.liveHealthStatus as LiveTransportHealthStatus | null;
  return {
    source,
    enabled: row.enabled,
    engine: row.engine as ScraperEnginePreference,
    minRequestIntervalMs: row.minRequestIntervalMs,
    maxRequestsPerHour: row.maxRequestsPerHour,
    linkedPlayerActiveRefreshHours:
      row.linkedPlayerActiveRefreshHours ?? undefined,
    linkedPlayerIdleRefreshHours: row.linkedPlayerIdleRefreshHours ?? undefined,
    activePlayerWindowDays: row.activePlayerWindowDays ?? undefined,
    activeEventRefreshMinutes: row.activeEventRefreshMinutes ?? undefined,
    completedEventGraceHours: row.completedEventGraceHours ?? undefined,
    liveTransportEnabled: row.liveTransportEnabled,
    liveRefreshSeconds: row.liveRefreshSeconds ?? undefined,
    liveRestFallbackSeconds: row.liveRestFallbackSeconds ?? undefined,
    liveHealth:
      status || row.liveHealthCheckedAt || row.liveHealthLatencyMs !== null
        ? {
            status: status ?? "idle",
            checkedAt: row.liveHealthCheckedAt?.toISOString(),
            latencyMs: row.liveHealthLatencyMs ?? undefined,
            detail: row.liveHealthDetail,
          }
        : undefined,
    firecrawlCacheTtlSeconds: row.firecrawlCacheTtlSeconds ?? undefined,
    firecrawlChangeTracking: row.firecrawlChangeTracking,
  };
}

function seedRow(control: ScraperControl): ScraperControlInsert {
  return {
    source: control.source,
    enabled: control.enabled,
    engine: control.engine,
    minRequestIntervalMs: control.minRequestIntervalMs,
    maxRequestsPerHour: control.maxRequestsPerHour,
    linkedPlayerActiveRefreshHours: control.linkedPlayerActiveRefreshHours,
    linkedPlayerIdleRefreshHours: control.linkedPlayerIdleRefreshHours,
    activePlayerWindowDays: control.activePlayerWindowDays,
    activeEventRefreshMinutes: control.activeEventRefreshMinutes,
    completedEventGraceHours: control.completedEventGraceHours,
    liveTransportEnabled: control.liveTransportEnabled,
    liveRefreshSeconds: control.liveRefreshSeconds,
    liveRestFallbackSeconds: control.liveRestFallbackSeconds,
    liveHealthStatus: control.liveHealth?.status,
    liveHealthCheckedAt: control.liveHealth?.checkedAt
      ? new Date(control.liveHealth.checkedAt)
      : undefined,
    liveHealthLatencyMs: control.liveHealth?.latencyMs,
    liveHealthDetail: control.liveHealth?.detail ?? {},
    firecrawlCacheTtlSeconds: control.firecrawlCacheTtlSeconds,
    firecrawlChangeTracking: control.firecrawlChangeTracking,
  };
}

export function defaultScraperControl(
  source: ManagedScraperSource,
): ScraperControl {
  return defaults[source];
}

export function invalidateScraperControlCache(): void {
  cached = undefined;
}

export async function loadScraperControls(): Promise<
  readonly ScraperControl[]
> {
  if (!isDatabaseConfigured()) return sources.map(defaultScraperControl);
  if (cached && cached.expiresAt > Date.now()) return cached.rows;
  const database = getDatabase();
  await database
    .insert(scraperControls)
    .values(sources.map((source) => seedRow(defaultScraperControl(source))))
    .onConflictDoNothing();
  const rows = await database
    .select()
    .from(scraperControls)
    .orderBy(asc(scraperControls.source));
  const bySource = new Map(
    rows.flatMap((row) =>
      defaults[row.source as ManagedScraperSource]
        ? [[row.source, toControl(row)] as const]
        : [],
    ),
  );
  const controls = sources.map(
    (source) => bySource.get(source) ?? defaultScraperControl(source),
  );
  cached = { rows: controls, expiresAt: Date.now() + 30_000 };
  return controls;
}

export async function loadScraperControl(
  source: ManagedScraperSource,
): Promise<ScraperControl> {
  const controls = await loadScraperControls();
  return (
    controls.find((control) => control.source === source) ?? defaults[source]
  );
}

export async function assertScraperEnabled(
  source: ManagedScraperSource,
): Promise<ScraperControl> {
  const control = await loadScraperControl(source);
  if (!control.enabled) {
    throw new SandDataUpstreamError(
      source,
      "unavailable",
      `${source} scraping is paused by SuperAdmin.`,
    );
  }
  return control;
}

export async function assertLiveTransportEnabled(): Promise<ScraperControl> {
  const control = await loadScraperControl("volleyball-world");
  if (!control.enabled || !control.liveTransportEnabled) {
    await recordLiveTransportHealth({
      status: "paused",
      detail: {
        reason: !control.enabled
          ? "Source paused by SuperAdmin"
          : "Live transport paused by SuperAdmin",
      },
    });
    throw new SandDataUpstreamError(
      "volleyball-world",
      "unavailable",
      "Official Volleyball World live transport is paused by SuperAdmin.",
    );
  }
  return control;
}

export async function saveScraperControl(input: {
  readonly source: ManagedScraperSource;
  readonly enabled: boolean;
  readonly engine: ScraperEnginePreference;
  readonly minRequestIntervalMs: number;
  readonly maxRequestsPerHour: number;
  readonly linkedPlayerActiveRefreshHours?: number;
  readonly linkedPlayerIdleRefreshHours?: number;
  readonly activePlayerWindowDays?: number;
  readonly activeEventRefreshMinutes?: number;
  readonly completedEventGraceHours?: number;
  readonly liveTransportEnabled: boolean;
  readonly liveRefreshSeconds?: number;
  readonly liveRestFallbackSeconds?: number;
  readonly firecrawlCacheTtlSeconds?: number;
  readonly firecrawlChangeTracking: boolean;
  readonly updatedByPersonId: string;
  readonly now: Date;
}): Promise<ScraperControl> {
  const database = getDatabase();
  const values = {
    enabled: input.enabled,
    engine: input.engine,
    minRequestIntervalMs: input.minRequestIntervalMs,
    maxRequestsPerHour: input.maxRequestsPerHour,
    linkedPlayerActiveRefreshHours:
      input.linkedPlayerActiveRefreshHours ?? null,
    linkedPlayerIdleRefreshHours: input.linkedPlayerIdleRefreshHours ?? null,
    activePlayerWindowDays: input.activePlayerWindowDays ?? null,
    activeEventRefreshMinutes: input.activeEventRefreshMinutes ?? null,
    completedEventGraceHours: input.completedEventGraceHours ?? null,
    liveTransportEnabled: input.liveTransportEnabled,
    liveRefreshSeconds: input.liveRefreshSeconds ?? null,
    liveRestFallbackSeconds: input.liveRestFallbackSeconds ?? null,
    firecrawlCacheTtlSeconds: input.firecrawlCacheTtlSeconds ?? null,
    firecrawlChangeTracking: input.firecrawlChangeTracking,
    updatedByPersonId: input.updatedByPersonId,
    updatedAt: input.now,
  };
  const [row] = await database
    .insert(scraperControls)
    .values({
      ...seedRow(defaultScraperControl(input.source)),
      ...values,
      createdAt: input.now,
    })
    .onConflictDoUpdate({ target: scraperControls.source, set: values })
    .returning();
  invalidateScraperControlCache();
  if (!row) throw new Error("Scraper control could not be saved");
  return toControl(row);
}

export async function recordLiveTransportHealth(input: {
  readonly status: LiveTransportHealthStatus;
  readonly latencyMs?: number;
  readonly detail: Readonly<Record<string, unknown>>;
  readonly now?: Date;
}): Promise<void> {
  if (!isDatabaseConfigured()) return;
  const now = input.now ?? new Date();
  await getDatabase()
    .insert(scraperControls)
    .values({
      ...seedRow(defaultScraperControl("volleyball-world")),
      liveHealthStatus: input.status,
      liveHealthCheckedAt: now,
      liveHealthLatencyMs: input.latencyMs ?? null,
      liveHealthDetail: input.detail,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: scraperControls.source,
      set: {
        liveHealthStatus: input.status,
        liveHealthCheckedAt: now,
        liveHealthLatencyMs: input.latencyMs ?? null,
        liveHealthDetail: input.detail,
        updatedAt: now,
      },
    });
  invalidateScraperControlCache();
}

export function linkedPlayerRefreshAt(input: {
  readonly control: ScraperControl;
  readonly lastDunaActivityAt?: Date | null;
  readonly lastSyncedAt?: Date | null;
  readonly lastProfileFetchedAt?: Date | null;
  readonly createdAt: Date;
  readonly now: Date;
}): Date {
  const activityWindowMs =
    (input.control.activePlayerWindowDays ?? 14) * 24 * 60 * 60 * 1_000;
  const activityIsRecent =
    input.lastDunaActivityAt !== null &&
    input.lastDunaActivityAt !== undefined &&
    input.now.getTime() - input.lastDunaActivityAt.getTime() <=
      activityWindowMs;
  const cadenceHours = activityIsRecent
    ? (input.control.linkedPlayerActiveRefreshHours ?? 24)
    : (input.control.linkedPlayerIdleRefreshHours ?? 168);
  const baseline =
    input.lastSyncedAt ?? input.lastProfileFetchedAt ?? input.createdAt;
  return new Date(baseline.getTime() + cadenceHours * 60 * 60 * 1_000);
}

export async function controlBySource(): Promise<
  ReadonlyMap<ManagedScraperSource, ScraperControl>
> {
  return new Map(
    (await loadScraperControls()).map((control) => [control.source, control]),
  );
}
