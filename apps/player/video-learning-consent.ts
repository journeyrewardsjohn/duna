export interface VisionLearningConsentReceipt {
  readonly version: 1;
  readonly consentedAt: string;
}

function isVisionLearningConsentReceipt(
  value: unknown,
): value is VisionLearningConsentReceipt {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.version !== 1 || typeof candidate.consentedAt !== "string") {
    return false;
  }
  const consentedAt = new Date(candidate.consentedAt);
  return (
    !Number.isNaN(consentedAt.getTime()) &&
    consentedAt.toISOString() === candidate.consentedAt
  );
}

export function createVisionLearningConsentReceipt(
  enabled: boolean,
  consentedAt = new Date().toISOString(),
): VisionLearningConsentReceipt | undefined {
  return enabled ? { version: 1, consentedAt } : undefined;
}

/**
 * A legacy boolean is not evidence of an affirmative choice because older
 * internal builds initialized it to true. Only the current versioned receipt
 * can preserve an enabled choice across an offline retry.
 */
export function normalizeVisionLearningConsent(input: {
  readonly requested: unknown;
  readonly receipt: unknown;
}): boolean {
  return (
    input.requested === true && isVisionLearningConsentReceipt(input.receipt)
  );
}

export interface LegacyVisionConsentRevocationLocator {
  readonly videoId?: string;
  readonly beginIdempotencyKey: string;
}

export async function acknowledgeLegacyVisionConsentRevocation<T>(input: {
  readonly locator: LegacyVisionConsentRevocationLocator;
  readonly revoke: (
    locator: LegacyVisionConsentRevocationLocator,
  ) => Promise<T>;
  readonly persistNormalizedConsent: () => Promise<void>;
}): Promise<T> {
  // Persistence comes second on purpose. A transport failure must leave the
  // legacy marker intact so the next transfer retries this privacy action
  // before it can resume, begin, complete, or attach the video.
  const result = await input.revoke(input.locator);
  await input.persistNormalizedConsent();
  return result;
}

/**
 * Locates any server video an older default-on client may already have made.
 * A completed or persisted upload has a direct video id. A draft without one
 * still carries its begin key, which lets the API reconcile a response that
 * was lost after the server created the video.
 */
export function legacyVisionConsentRevocationLocator(input: {
  readonly requested: unknown;
  readonly receipt: unknown;
  readonly beginIdempotencyKey: string;
  readonly uploadVideoId?: string;
  readonly completedVideoId?: string;
}): LegacyVisionConsentRevocationLocator | undefined {
  if (
    input.requested !== true ||
    normalizeVisionLearningConsent({
      requested: input.requested,
      receipt: input.receipt,
    })
  ) {
    return undefined;
  }
  return {
    videoId: input.completedVideoId ?? input.uploadVideoId,
    beginIdempotencyKey: input.beginIdempotencyKey,
  };
}

/** Saved capture defaults never own learning consent, including unknown keys
 * left behind by an older app version. Every new capture starts opt-out. */
export function resetVisionLearningConsent<
  T extends { readonly contributeCalibration: boolean },
>(form: T): T {
  return { ...form, contributeCalibration: false };
}
