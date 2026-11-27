/**
 * Duna Health age, consent, region and retention policy (H1, 27 Nov 2026).
 *
 * Every rule that decides who may use Duna Health lives here as a named
 * constant or a pure function, so the policy can change in one place. Nothing
 * in this module touches the database, the clock, the network or the
 * environment: callers pass `now`, the subject's stored birth date, the
 * registry flag value and the storefront the device reported.
 *
 * Owner decisions (27 Nov 2026): Health is US-only; ages 13 and over may use
 * it; 13 to 17 need their own opt-in plus a linked adult guardian's approval;
 * under-13s stay blocked until a verified parental-consent method exists.
 * See docs/HEALTH_PRIVACY.md. This is an engineering control, not legal
 * advice; where counsel has not decided, the conservative option is coded and
 * kept switchable here.
 */
import { ageOnDate } from "@duna/core";
import type {
  HealthCategory,
  HealthMetric,
  HealthSharingScope,
} from "../../contracts";

/** Bumped whenever a rule or a disclosure text below changes meaning. */
export const HEALTH_POLICY_VERSION = "duna-health-2026-11-27";

/** Ages are computed from the stored birth date at request time (UTC date). */
export const HEALTH_MINIMUM_AGE = 13;
export const HEALTH_ADULT_AGE = 18;

/** Registry kill switch for the 13-to-17 path (`@duna/core/flags`). */
export const HEALTH_JUNIORS_FLAG = "health.juniors" as const;

/**
 * StoreKit `Storefront.countryCode` is ISO 3166-1 alpha-3. It follows the
 * Apple Account's App Store region, not the device location, and it is a
 * client claim: a modified client can send any value.
 */
export const HEALTH_ALLOWED_STOREFRONTS: readonly string[] = ["USA"];

/** Metrics a 13-to-17-year-old may sync. Everything else is dropped. */
export const HEALTH_MINOR_METRICS: readonly HealthMetric[] = [
  "heart-rate",
  "workout",
  "active-energy",
  "exercise-minutes",
];

/** Daily athlete-reported check-ins are not offered to minors. */
export const HEALTH_MINOR_CHECK_INS_ALLOWED = false;

/** Recipients a minor's grant may name. Peer players are never allowed. */
export const HEALTH_MINOR_GRANT_AUDIENCES: readonly (
  "player" | "coach" | "organization"
)[] = ["coach", "organization"];
export const HEALTH_ADULT_GRANT_AUDIENCES: readonly (
  "player" | "coach" | "organization"
)[] = ["player", "coach", "organization"];

/** Organization staff who may read through an organization grant. */
export const HEALTH_ADULT_ORGANIZATION_VIEWER_ROLES: readonly string[] = [
  "owner",
  "manager",
  "coach",
];
/** For a minor, an organization grant reaches only the club's coaches. */
export const HEALTH_MINOR_ORGANIZATION_VIEWER_ROLES: readonly string[] = [
  "coach",
];

export const HEALTH_ADULT_GRANT_MAX_DAYS = 366;
export const HEALTH_MINOR_GRANT_MAX_DAYS = 90;

/**
 * Which guardianship review states count as a "linked guardian" for Health.
 * Conservative default: only relationships an administrator verified.
 */
export const HEALTH_GUARDIAN_LINK_STATUSES: readonly string[] = ["verified"];

/** Rolling retention for imported samples and check-ins, by current age. */
export const HEALTH_RETENTION_MONTHS = { adult: 24, minor: 12 } as const;
export const HEALTH_RETENTION_BATCH_SIZE = 1_000;
export const HEALTH_RETENTION_MAX_BATCHES = 20;

export const HEALTH_TEEN_OPT_IN_TEXT =
  "I want to connect Apple Health to Duna on this iPhone. Duna will read only heart rate, workouts, active energy and exercise minutes, to show my own training trends and, only if my guardian approves each one, to share them for up to 90 days with a coach or my club's coaching staff. Duna never shares my Health data with other players, never uses it for advertising, and deletes it after 12 months. My guardian must also approve before anything is collected. My guardian or I can stop this at any time, and Duna will then stop syncing and delete what it imported.";

export const HEALTH_GUARDIAN_APPROVAL_TEXT =
  "I am this player's parent or legal guardian and I approve Duna reading their Apple Health heart rate, workouts, active energy and exercise minutes from their own iPhone, for their own training trends. Duna will not show me their Health values. Each sharing request to a coach or their club needs my separate approval, lasts at most 90 days, and never reaches other players. Duna never uses Health data for advertising and deletes it after 12 months. I can withdraw at any time; Duna then stops syncing and deletes the imported data.";

export const HEALTH_GUARDIAN_GRANT_APPROVAL_TEXT =
  "I approve this one Health sharing request for the player I am responsible for. The recipient sees only the categories and uses listed, only until the date shown, and only while they remain a coach at the player's club. I can revoke it at any time.";

export type HealthAgeBand = "unknown" | "under-13" | "teen" | "adult";

export type HealthAction =
  | "view-own"
  | "opt-in"
  | "sync"
  | "check-in"
  | "create-grant"
  | "revoke-grant"
  | "withdraw"
  | "disconnect";

export const HEALTH_ACTIONS: readonly HealthAction[] = [
  "view-own",
  "opt-in",
  "sync",
  "check-in",
  "create-grant",
  "revoke-grant",
  "withdraw",
  "disconnect",
];

/** Stopping, revoking and deleting are never blocked by age, flag or region. */
const ALWAYS_ALLOWED: readonly HealthAction[] = [
  "revoke-grant",
  "withdraw",
  "disconnect",
];

/** New collection or disclosure needs a US storefront claim. */
const REGION_GATED: readonly HealthAction[] = [
  "sync",
  "check-in",
  "create-grant",
];

/** A minor needs both recorded consents before these. */
const CONSENT_GATED: readonly HealthAction[] = [
  "sync",
  "check-in",
  "create-grant",
];

export type HealthRefusalReason =
  | "birth-date-required"
  | "under-13"
  | "juniors-paused"
  | "region-not-supported"
  | "region-unknown"
  | "teen-opt-in-required"
  | "guardian-approval-required"
  | "not-offered-to-minors"
  | "adult-viewer-required";

export const HEALTH_REFUSAL_MESSAGES: Readonly<
  Record<HealthRefusalReason, string>
> = {
  "birth-date-required":
    "Add your date of birth in your profile to use Duna Health.",
  "under-13": "Duna Health is not available for players under 13 yet.",
  "juniors-paused":
    "Duna Health for players under 18 is paused right now. Nothing new is collected; you can still delete what Duna already imported.",
  "region-not-supported":
    "Duna Health is available only with a United States App Store account for now. Your existing Health data stays viewable and deletable.",
  "region-unknown":
    "Duna could not confirm your App Store region. Update the Duna app to keep syncing Apple Health.",
  "teen-opt-in-required":
    "Turn on Duna Health from your own iPhone before anything is collected.",
  "guardian-approval-required":
    "Your parent or guardian needs to approve Duna Health in their own Duna account before anything is collected.",
  "not-offered-to-minors":
    "This Duna Health feature is not offered to players under 18.",
  "adult-viewer-required":
    "Only an adult account can view another player's shared Health data.",
};

export interface HealthPolicyInput {
  readonly action: HealthAction;
  readonly band: HealthAgeBand;
  /** Value of the `health.juniors` registry flag for this request. */
  readonly juniorsEnabled: boolean;
  /** Storefront country the device reported with this request. */
  readonly storefront?: string | null;
  /** Latest teen opt-in on the teen's own session is current. */
  readonly teenOptedIn: boolean;
  /** Latest approval by a linked adult guardian is current. */
  readonly guardianApproved: boolean;
}

export interface HealthPermit {
  readonly allowed: true;
  readonly band: HealthAgeBand;
  readonly minor: boolean;
  readonly allowedMetrics: readonly HealthMetric[];
  readonly allowedCategories: readonly HealthCategory[];
  readonly allowedAudiences: readonly ("player" | "coach" | "organization")[];
  readonly maxGrantDays: number;
  readonly grantRequiresGuardianApproval: boolean;
}

export interface HealthRefusal {
  readonly allowed: false;
  readonly band: HealthAgeBand;
  readonly reason: HealthRefusalReason;
  readonly message: string;
}

export type HealthDecision = HealthPermit | HealthRefusal;

const ALL_METRICS: readonly HealthMetric[] = [
  "heart-rate",
  "resting-heart-rate",
  "heart-rate-variability",
  "walking-heart-rate",
  "vo2-max",
  "respiratory-rate",
  "oxygen-saturation",
  "body-temperature",
  "sleep",
  "active-energy",
  "basal-energy",
  "steps",
  "distance",
  "exercise-minutes",
  "stand-minutes",
  "workout",
  "weight",
  "body-fat",
  "lean-body-mass",
];

export const HEALTH_METRIC_CATEGORY: Readonly<
  Record<HealthMetric, HealthCategory>
> = {
  "heart-rate": "heart",
  "resting-heart-rate": "heart",
  "heart-rate-variability": "heart",
  "walking-heart-rate": "heart",
  "vo2-max": "heart",
  "respiratory-rate": "recovery",
  "oxygen-saturation": "recovery",
  "body-temperature": "recovery",
  sleep: "recovery",
  "active-energy": "activity",
  "basal-energy": "activity",
  steps: "activity",
  distance: "activity",
  "exercise-minutes": "activity",
  "stand-minutes": "activity",
  workout: "activity",
  weight: "body",
  "body-fat": "body",
  "lean-body-mass": "body",
};

function categoriesFor(metrics: readonly HealthMetric[]): HealthCategory[] {
  return [...new Set(metrics.map((metric) => HEALTH_METRIC_CATEGORY[metric]))];
}

/** Age band from the stored birth date, evaluated now. No date: unknown. */
export function healthAgeBand(
  birthDate: string | null | undefined,
  now: Date,
): HealthAgeBand {
  if (!birthDate) return "unknown";
  const age = ageOnDate(birthDate, now.toISOString());
  if (age === null) return "unknown";
  if (age < HEALTH_MINIMUM_AGE) return "under-13";
  if (age < HEALTH_ADULT_AGE) return "teen";
  return "adult";
}

export function isMinorBand(band: HealthAgeBand): boolean {
  return band === "teen" || band === "under-13";
}

/** Normalizes a client storefront claim; returns undefined when absent. */
export function normalizeStorefront(
  value: string | null | undefined,
): string | undefined {
  const normalized = value?.trim().toUpperCase();
  if (!normalized) return undefined;
  if (normalized === "US") return "USA";
  return /^[A-Z]{2,3}$/.test(normalized) ? normalized : undefined;
}

export function storefrontAllowsHealth(
  value: string | null | undefined,
): boolean {
  const normalized = normalizeStorefront(value);
  return Boolean(normalized && HEALTH_ALLOWED_STOREFRONTS.includes(normalized));
}

function refuse(
  band: HealthAgeBand,
  reason: HealthRefusalReason,
): HealthRefusal {
  return {
    allowed: false,
    band,
    reason,
    message: HEALTH_REFUSAL_MESSAGES[reason],
  };
}

function permit(band: HealthAgeBand): HealthPermit {
  const minor = isMinorBand(band);
  const metrics = minor ? HEALTH_MINOR_METRICS : ALL_METRICS;
  return {
    allowed: true,
    band,
    minor,
    allowedMetrics: metrics,
    allowedCategories: categoriesFor(metrics),
    allowedAudiences: minor
      ? HEALTH_MINOR_GRANT_AUDIENCES
      : HEALTH_ADULT_GRANT_AUDIENCES,
    maxGrantDays: minor
      ? HEALTH_MINOR_GRANT_MAX_DAYS
      : HEALTH_ADULT_GRANT_MAX_DAYS,
    grantRequiresGuardianApproval: minor,
  };
}

/**
 * The one decision function. Order matters: deletion first, then age, then
 * the kill switch, then region, then consent.
 */
export function decideHealthAction(input: HealthPolicyInput): HealthDecision {
  const { band, action } = input;
  if (ALWAYS_ALLOWED.includes(action)) return permit(band);
  if (band === "unknown") return refuse(band, "birth-date-required");
  if (band === "under-13") return refuse(band, "under-13");
  if (band === "teen" && !input.juniorsEnabled) {
    return refuse(band, "juniors-paused");
  }
  if (action === "opt-in" && band === "adult") return permit(band);
  if (REGION_GATED.includes(action)) {
    const storefront = normalizeStorefront(input.storefront);
    if (!storefront) return refuse(band, "region-unknown");
    if (!HEALTH_ALLOWED_STOREFRONTS.includes(storefront)) {
      return refuse(band, "region-not-supported");
    }
  }
  if (band === "teen") {
    if (action === "check-in" && !HEALTH_MINOR_CHECK_INS_ALLOWED) {
      return refuse(band, "not-offered-to-minors");
    }
    if (CONSENT_GATED.includes(action)) {
      if (!input.teenOptedIn) return refuse(band, "teen-opt-in-required");
      if (!input.guardianApproved) {
        return refuse(band, "guardian-approval-required");
      }
    }
  }
  return permit(band);
}

/**
 * Who may approve for a minor: a signed-in guardian whose own birth date
 * makes them an adult today, linked through a guardianship in an accepted
 * review state, for a subject who is 13 to 17 today with the flag on.
 */
export function decideGuardianApproval(input: {
  readonly subjectBand: HealthAgeBand;
  readonly guardianBand: HealthAgeBand;
  readonly guardianshipStatus: string | undefined;
  readonly juniorsEnabled: boolean;
}):
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly reason:
        | "not-a-linked-guardian"
        | "guardian-must-be-adult"
        | "subject-not-eligible"
        | "juniors-paused";
    } {
  if (
    !input.guardianshipStatus ||
    !HEALTH_GUARDIAN_LINK_STATUSES.includes(input.guardianshipStatus)
  ) {
    return { allowed: false, reason: "not-a-linked-guardian" };
  }
  if (input.guardianBand !== "adult") {
    return { allowed: false, reason: "guardian-must-be-adult" };
  }
  if (input.subjectBand !== "teen") {
    return { allowed: false, reason: "subject-not-eligible" };
  }
  if (!input.juniorsEnabled)
    return { allowed: false, reason: "juniors-paused" };
  return { allowed: true };
}

/** Splits a batch into what the band may store and what is dropped. */
export function filterSamplesForBand<
  Sample extends { readonly metric: HealthMetric },
>(
  samples: readonly Sample[],
  allowedMetrics: readonly HealthMetric[],
): { readonly kept: Sample[]; readonly dropped: number } {
  const kept = samples.filter((sample) =>
    allowedMetrics.includes(sample.metric),
  );
  return { kept, dropped: samples.length - kept.length };
}

export type HealthGrantRuleViolation =
  | "audience-not-allowed"
  | "expiry-in-past"
  | "expiry-too-long"
  | "no-categories"
  | "category-not-allowed"
  | "video-overlay-needs-heart";

/** Validates a requested grant against the owner's permit. */
export function checkHealthGrantRequest(input: {
  readonly permit: HealthPermit;
  readonly audienceKind: "player" | "coach" | "organization";
  readonly categories: readonly HealthCategory[];
  readonly scopes: readonly HealthSharingScope[];
  readonly expiresAt: Date;
  readonly now: Date;
}): HealthGrantRuleViolation | undefined {
  if (!input.permit.allowedAudiences.includes(input.audienceKind)) {
    return "audience-not-allowed";
  }
  if (input.categories.length === 0 || input.scopes.length === 0) {
    return "no-categories";
  }
  if (
    input.categories.some(
      (category) => !input.permit.allowedCategories.includes(category),
    )
  ) {
    return "category-not-allowed";
  }
  if (
    input.scopes.includes("video-overlay") &&
    !input.categories.includes("heart")
  ) {
    return "video-overlay-needs-heart";
  }
  if (input.expiresAt <= input.now) return "expiry-in-past";
  const maximum =
    input.now.getTime() + input.permit.maxGrantDays * 24 * 60 * 60 * 1_000;
  if (input.expiresAt.getTime() > maximum) return "expiry-too-long";
  return undefined;
}

export type HealthGrantApprovalStatus =
  "not-required" | "pending" | "approved" | "denied";

/**
 * Whether a stored grant may be read right now, before the relationship
 * recheck. A minor's grant needs a guardian approval; a guardian-approved
 * grant ends when the owner turns 18 (the adult re-consents); a minor's grant
 * to a peer player is never effective, even if one was stored before.
 */
export function healthGrantIsEffective(input: {
  readonly audienceKind: "player" | "coach" | "organization";
  readonly approvalStatus: HealthGrantApprovalStatus;
  readonly expiresAt: Date;
  readonly revokedAt?: Date | null;
  readonly ownerBand: HealthAgeBand;
  readonly juniorsEnabled: boolean;
  readonly now: Date;
}): boolean {
  if (input.revokedAt || input.expiresAt <= input.now) return false;
  if (input.ownerBand === "unknown" || input.ownerBand === "under-13") {
    return false;
  }
  if (input.ownerBand === "teen") {
    if (!input.juniorsEnabled) return false;
    if (!HEALTH_MINOR_GRANT_AUDIENCES.includes(input.audienceKind)) {
      return false;
    }
    return input.approvalStatus === "approved";
  }
  return input.approvalStatus === "not-required";
}

export function organizationViewerRolesFor(
  ownerBand: HealthAgeBand,
): readonly string[] {
  return isMinorBand(ownerBand)
    ? HEALTH_MINOR_ORGANIZATION_VIEWER_ROLES
    : HEALTH_ADULT_ORGANIZATION_VIEWER_ROLES;
}

/** Shifts a date by whole calendar months in UTC (clamped to month end). */
export function subtractMonths(now: Date, months: number): Date {
  const result = new Date(now.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() - months);
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export interface HealthRetentionCutoffs {
  /** Any sample that started before this is past the adult window. */
  readonly adultStartedBefore: Date;
  /** For a current minor, samples that started before this are expired. */
  readonly minorStartedBefore: Date;
  /** A person born after this date is under 18 today. */
  readonly minorBornAfter: string;
  readonly adultCheckInsBefore: string;
  readonly minorCheckInsBefore: string;
}

export function healthRetentionCutoffs(now: Date): HealthRetentionCutoffs {
  const adultStartedBefore = subtractMonths(now, HEALTH_RETENTION_MONTHS.adult);
  const minorStartedBefore = subtractMonths(now, HEALTH_RETENTION_MONTHS.minor);
  return {
    adultStartedBefore,
    minorStartedBefore,
    minorBornAfter: isoDate(subtractMonths(now, HEALTH_ADULT_AGE * 12)),
    adultCheckInsBefore: isoDate(adultStartedBefore),
    minorCheckInsBefore: isoDate(minorStartedBefore),
  };
}

/**
 * Pure mirror of the retention job's SQL: a sample is expired when it is
 * older than the window for the owner's band today. Unknown birth dates use
 * the adult window (no minor can have synced without a birth date).
 */
export function isHealthSampleExpired(
  sample: { readonly startedAt: Date; readonly birthDate?: string | null },
  now: Date,
): boolean {
  const cutoffs = healthRetentionCutoffs(now);
  if (sample.startedAt < cutoffs.adultStartedBefore) return true;
  const minor = Boolean(
    sample.birthDate && sample.birthDate > cutoffs.minorBornAfter,
  );
  return minor && sample.startedAt < cutoffs.minorStartedBefore;
}

export function selectExpiredHealthSamples<
  Row extends { readonly startedAt: Date; readonly birthDate?: string | null },
>(rows: readonly Row[], now: Date, limit: number): Row[] {
  return rows
    .filter((row) => isHealthSampleExpired(row, now))
    .slice(0, Math.max(0, limit));
}
