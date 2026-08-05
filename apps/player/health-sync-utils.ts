export const HEALTH_UPLOAD_BATCH_LIMIT = 400;

export type HealthUploadBatch<T> = {
  readonly samples: readonly T[];
  readonly deletedExternalIds: readonly string[];
};

function chunk<T>(values: readonly T[], limit: number): readonly T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += limit) {
    chunks.push(values.slice(index, index + limit));
  }
  return chunks;
}

/**
 * HealthKit can return a page for every selected sample type. Keep each Duna
 * request below the API limit even when those native pages add up to thousands
 * of records. An empty batch is intentional: it records the connection after a
 * player grants access but has no matching Health records yet.
 */
export function planHealthUploadBatches<T>(
  samples: readonly T[],
  deletedExternalIds: readonly string[],
  limit = HEALTH_UPLOAD_BATCH_LIMIT,
): readonly HealthUploadBatch<T>[] {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("Health upload batch size must be a positive integer.");
  }
  const sampleChunks = chunk(samples, limit);
  const deletionChunks = chunk(deletedExternalIds, limit);
  const batchCount = Math.max(sampleChunks.length, deletionChunks.length, 1);
  return Array.from({ length: batchCount }, (_, index) => ({
    samples: sampleChunks[index] ?? [],
    deletedExternalIds: deletionChunks[index] ?? [],
  }));
}

export function healthSyncErrorMessage(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : "";
  if (/no procedure found|not_found|\b404\b/i.test(message)) {
    return "Duna Health is temporarily unavailable. Your Apple Health data was not changed. Please try again shortly.";
  }
  if (/unauthorized|forbidden|\b401\b|\b403\b/i.test(message)) {
    return "Your Duna session needs to be refreshed before Health data can sync. Sign in again, then retry.";
  }
  if (
    /network request failed|failed to fetch|fetch failed|timed? out/i.test(
      message,
    )
  ) {
    return "Duna could not reach the secure Health service. Your Apple Health data stayed on this iPhone; check your connection and try again.";
  }
  if (/too_big|at most 500|array.*maximum|payload too large/i.test(message)) {
    return "Your Health history is larger than one secure batch. Duna kept your progress and will continue when you retry.";
  }
  return (
    message ||
    "Apple Health could not sync. No permissions or imported data were changed."
  );
}
