import {
  clientVisibleFeatureFlagKeys,
  featureFlagDefault,
  featureFlagKeys,
  isFeatureFlagKey,
  type FeatureFlagKey,
} from "@duna/core";
import { featureFlags, getDatabase } from "@duna/db";
import { eq, inArray, isNull, or, and } from "drizzle-orm";
import { usesDemoData } from "./services/data-source";

/**
 * Runtime evaluator for the typed flag registry in @duna/core/flags.
 *
 * Flags are kill switches: every registry default is ON and a row in
 * `feature_flags` (edited by Super Admin) can turn a feature off — or back on —
 * for a scope. Precedence, most specific row wins:
 *
 *   1. organization + market   (row.organizationId = org AND row.market = market)
 *   2. organization            (row.organizationId = org, no market)
 *   3. market                  (no organization, row.market = market)
 *   4. global                  (no organization, no market)
 *   5. registry default        (no applicable row)
 *
 * Market rows apply only when the caller passes `market` (organizations have
 * no market column today). Market comparison ignores case and outer spaces.
 *
 * Demo mode (usesDemoData()) returns the registry default without a query.
 * Rows are read from the primary (flags gate writes and provider calls) once
 * per request and organization when `context` is passed (pass the tRPC ctx).
 * The evaluator never throws: if the table cannot be read it logs once per
 * process and returns the registry default for the rest of that request.
 */

export interface FeatureFlagScope {
  readonly organizationId?: string;
  readonly market?: string;
  /** Any per-request object (the tRPC ctx). Enables the per-request cache. */
  readonly context?: object;
}

export interface FeatureFlagRow {
  readonly key: string;
  readonly enabled: boolean;
  readonly organizationId: string | null;
  readonly market: string | null;
}

export type FeatureFlagRowLoader = (input: {
  readonly organizationId?: string;
}) => Promise<readonly FeatureFlagRow[]>;

export interface FeatureFlagEvaluatorOptions {
  /** Test seam; defaults to a primary-database query. */
  readonly loadRows?: FeatureFlagRowLoader;
}

const normalizeMarket = (value?: string | null) =>
  value?.trim().toLowerCase() || undefined;

/** Pure precedence rule over already-loaded rows. */
export function resolveFeatureFlag(
  key: FeatureFlagKey,
  rows: readonly FeatureFlagRow[],
  scope: Pick<FeatureFlagScope, "organizationId" | "market">,
): boolean {
  const market = normalizeMarket(scope.market);
  let best: { rank: number; enabled: boolean } | undefined;
  for (const row of rows) {
    if (row.key !== key) continue;
    const rowMarket = normalizeMarket(row.market);
    if (row.organizationId && row.organizationId !== scope.organizationId) {
      continue;
    }
    if (rowMarket && rowMarket !== market) continue;
    const rank = (row.organizationId ? 2 : 0) + (rowMarket ? 1 : 0);
    if (!best || rank > best.rank) best = { rank, enabled: row.enabled };
  }
  return best ? best.enabled : featureFlagDefault(key);
}

const loadRowsFromDatabase: FeatureFlagRowLoader = async ({
  organizationId,
}) => {
  const database = getDatabase();
  return database
    .select({
      key: featureFlags.key,
      enabled: featureFlags.enabled,
      organizationId: featureFlags.organizationId,
      market: featureFlags.market,
    })
    .from(featureFlags)
    .where(
      and(
        inArray(featureFlags.key, [...featureFlagKeys]),
        organizationId
          ? or(
              isNull(featureFlags.organizationId),
              eq(featureFlags.organizationId, organizationId),
            )
          : isNull(featureFlags.organizationId),
      ),
    );
};

// null = the table could not be read for this request; use defaults.
type CachedRows = Promise<readonly FeatureFlagRow[] | null>;
const requestCache = new WeakMap<object, Map<string, CachedRows>>();
let failureLogged = false;

function loadRowsSafely(
  scope: FeatureFlagScope,
  loader: FeatureFlagRowLoader,
): CachedRows {
  const cacheKey = scope.organizationId ?? "";
  const perRequest = scope.context
    ? (requestCache.get(scope.context) ??
      requestCache.set(scope.context, new Map()).get(scope.context)!)
    : undefined;
  const cached = perRequest?.get(cacheKey);
  if (cached) return cached;
  let pending: CachedRows;
  try {
    pending = Promise.resolve(
      loader({ organizationId: scope.organizationId }),
    ).catch(logFailure);
  } catch (error) {
    pending = Promise.resolve(logFailure(error));
  }
  perRequest?.set(cacheKey, pending);
  return pending;
}

function logFailure(error: unknown): null {
  if (!failureLogged) {
    failureLogged = true;
    console.warn(
      "Feature flags could not be read; using registry defaults.",
      error instanceof Error ? error.message : "unknown error",
    );
  }
  return null;
}

/** Test helper: lets a test observe the log-once behaviour again. */
export function resetFeatureFlagFailureLogForTests(): void {
  failureLogged = false;
}

/**
 * Is a registry feature enabled for this scope? Never throws. Server code
 * only; clients use the `public.flags.enabled` tRPC query.
 */
export async function isFeatureEnabled(
  key: FeatureFlagKey,
  scope: FeatureFlagScope = {},
  options: FeatureFlagEvaluatorOptions = {},
): Promise<boolean> {
  const [value] = Object.values(
    await evaluateFeatureFlags([key], scope, options),
  );
  return value ?? false;
}

/** Evaluate several flags with one read. Never throws. */
export async function evaluateFeatureFlags<K extends FeatureFlagKey>(
  keys: readonly K[],
  scope: FeatureFlagScope = {},
  options: FeatureFlagEvaluatorOptions = {},
): Promise<Record<K, boolean>> {
  const result = {} as Record<K, boolean>;
  try {
    const known = keys.filter((key) => isFeatureFlagKey(key));
    const rows = usesDemoData()
      ? []
      : await loadRowsSafely(scope, options.loadRows ?? loadRowsFromDatabase);
    for (const key of keys) {
      result[key] = known.includes(key)
        ? resolveFeatureFlag(key, rows ?? [], scope)
        : false;
    }
  } catch (error) {
    logFailure(error);
    for (const key of keys) {
      result[key] = isFeatureFlagKey(key) ? featureFlagDefault(key) : false;
    }
  }
  return result;
}

/** The flags clients may read, evaluated for the caller's scope. */
export function evaluateClientFeatureFlags(
  scope: FeatureFlagScope = {},
  options: FeatureFlagEvaluatorOptions = {},
) {
  return evaluateFeatureFlags(clientVisibleFeatureFlagKeys, scope, options);
}
